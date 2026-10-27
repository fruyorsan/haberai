// ==========================================================================
// WEB PUSH BİLDİRİMİ (OneSignal) — son dakika + takip edilen konular
// --------------------------------------------------------------------------
// Sitenin sözü: okuyucu neye abone olduysa YALNIZCA onu alır. Bu yüzden:
//
//   1) SON DAKİKA (haber kaydında breaking === true):
//      tüm abonelere gider. Hedefleme `son_dakika=1` etiketiyle yapılır
//      ("Subscribed Users" segmenti yeni OneSignal modelinde boş dönüyor).
//      Asgari aralık SON_MIN_ARALIK_DK, günlük tavan SON_MAX_GUN. Gece de
//      gönderilir (acil gelişme beklenir).
//
//   2) KONU TAKİBİ (okuyucunun işaretlediği kategori):
//      OneSignal etiketiyle yalnızca o konuyu takip edenlere gider
//      (kategori_<slug> = 1 + bildirim_sikligi = aninda). Kategori başına
//      bekleme süresi yok (KAT_MIN_ARALIK_DK=0); tur başına en fazla
//      KAT_TUR_ADET kategori ve KAT_TUR_HABER haber gönderilir, günlük tavan
//      ve sessiz saat (23:00-07:00 TR) uygulanır. Takipçisi olmayan kategori
//      tespit edilirse (alıcı 0) kısa süre atlanır, tavan harcanmaz.
//
//      SENKRON: aday havuzu "son konu bildiriminden bu yana yayınlanan
//      haberler"dir (KAT_PENCERE_MIN_DK..MAX_DK). Eskiden sabit 8 saatlik
//      havuzdan seçiliyordu; okuyucuya 6 saat önceki haber "yeni" diye
//      gidiyor, bildirime tıklayınca sayfanın tepesinde başka bir haber
//      görüyordu. Artık her bildirim, kendisinden SONRA çıkan haberleri
//      kapsar; iki bildirim aynı haberi/aynı dönemi tekrarlamaz. Ayrıca her
//      kategoride yalnızca en yeni yayın dilimi (son 40 dk) dikkate alınır.
//
//   3) ÖZET (bildirim_sikligi = ozet):
//      Günde 3 kez (TR 09/15/21) en taze 3 haberden kısa bir özet gider.
//      "son" seçenler yalnızca son dakika alır, konu bildirimi almaz.
//
// Tekrar önleme: gönderilen haber id'leri data/bildirim.json'da tutulur
// (src/share.js → data/social.json ile aynı mantık). Aynı haber iki kez gitmez.
//
// Kurulum (ikisi de yoksa kanal sessizce atlanır):
//   gh variable set ONESIGNAL_APP_ID --body "<App ID>"
//   gh secret  set ONESIGNAL_REST_API_KEY --body "<REST API anahtarı>"
//
// Elle deneme:  npm run bildirim:dry   (hiçbir istek gönderilmez, dosya yazılmaz)
// ==========================================================================
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getArticles, imageUrl, slugify } from "../site/src/lib/articles.js";
import { kapakKaynagi } from "../site/src/lib/kapak.js";
import { ilgiSkoru } from "../site/src/lib/ilgi.js";
import { canonicalCategory } from "./ai.js";
import { yedekGorsel } from "./stok-gorsel.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const DURUM_DOSYA = join(DATA_DIR, "bildirim.json");

const APP_ID = String(process.env.ONESIGNAL_APP_ID || "").trim();
const REST_KEY = String(process.env.ONESIGNAL_REST_API_KEY || "").trim();
const SITE_URL = (process.env.SITE_URL || "https://haberinai.site").replace(/\/+$/, "");

// --- Ayarlar (env ile değiştirilebilir) ---
// Ölçü: site artık günde ~40 haber üretiyor (bkz. src/config.js günlük kota).
// Bildirim bütçesi bu tempoya göre: son dakika günde 2 (4 saatte bir),
// konu günde 10 (96 dk arayla), özet günde 3. Böylece her 4 haberde en fazla
// 1 bildirim gider; okuyucu boğulmaz, bildirim de tamamen kesilmez.
const SON_MIN_ARALIK_DK = Number(process.env.BILDIRIM_SON_ARALIK_DK ?? 240);
const SON_MAX_GUN = Number(process.env.BILDIRIM_SON_MAX_GUN ?? 2);
// Son dakika 90 dk taze sayılır: 4 saatlik pencere, "son dakika" diye saatler
// önceki haberi gönderiyordu (haber akışıyla senkron değil).
const SON_TTL_SAAT = Number(process.env.BILDIRIM_SON_TTL_SAAT ?? 1.5);
// Genel son dakika yalnızca GERÇEKTEN acil başlıklarda gider. `breaking`
// işareti hızlı kaynaklarda her taze habere verilebiliyor (ürün tanıtımı,
// indirim, tasarım açıklaması). Bunlar yalnızca kategori takipçisine gider;
// tüm abonenin telefonu yalnızca aşağıdaki başlıklarda titrer.
//
// DİKKAT: regex'ler ASCII'dir, başlık önce sadeleştirilir. Sebep: Türkçe
// büyük "İ" (U+0130) JavaScript'te /i bayrağıyla "i" ile eşleşmiyor; bu
// yüzden "İzmir", "İstanbul" gibi başlıklar deprem filtresine takılmıyor ve
// yerel deprem bildirimi hiç gitmiyordu.
const ACIL_BASLIK =
  /son dakika|patlama|yangin|sel baskini|savas|saldiri|istifa|vefat|hayatini kaybetti|kaza|acil durum|darbe|operasyon|iflas/;
// Depremde yerel sinyal şart: "Vanuatu'da 6,9 deprem" Türkiye okuyucusu için
// acil değil. AFAD/Kandilli veya bir il adı geçiyorsa genel bildirime girer;
// geçmiyorsa yalnızca Gündem/Dünya takipçisine gider.
const YEREL_DEPREM =
  /turkiye|afad|kandilli|marmara|istanbul|ankara|izmir|bursa|antalya|adana|konya|gaziantep|sanliurfa|hatay|kahramanmaras|malatya|elazig|diyarbakir|van\b|erzurum|samsun|trabzon|kocaeli|sakarya|balikesir|manisa|aydin|mugla|tekirdag|kayseri|mersin|eskisehir|sivas|tokat|ordu|giresun|rize|osmaniye|ercis|bolu|duzce|yalova|canakkale|kutahya|afyon|usak|isparta|burdur|denizli|karabuk|kastamonu|sinop|amasya|corum|yozgat|kirikkale|kirsehir|nevsehir|nigde|aksaray|karaman|kirklareli|edirne|bilecik|bingol|tunceli|adiyaman|kilis|iskenderun|inegol|gebze|corlu|tarsus|siverek|nazilli/;

/** Türkçe harfleri ASCII'ye indirger (regex eşleşmesi için). */
function sade(metin) {
  return String(metin || "")
    .replace(/[İIı]/g, "i")
    .replace(/[Şş]/g, "s")
    .replace(/[Ğğ]/g, "g")
    .replace(/[Üü]/g, "u")
    .replace(/[Öö]/g, "o")
    .replace(/[Çç]/g, "c")
    .toLowerCase();
}

/** Genel son dakika için gerçekten acil mi? */
function acilBaslik(a) {
  const t = sade(a?.title);
  if (/deprem/.test(t)) return YEREL_DEPREM.test(t);
  return ACIL_BASLIK.test(t);
}
// Konu bildirimleri: ~130 haber/gün (110–140 bandı) akışıyla senkronize günde ~10 bildirim.
// 07:00-23:00 (16 aktif saat = 960 dk) boyunca her ~12-13 haberde 1 bildirim düşecek
// şekilde (~85 dk aralıkla) gün içine dengeli yayılır.
const KAT_MIN_ARALIK_DK = Number(process.env.BILDIRIM_KAT_ARALIK_DK ?? 80);
const KAT_GENEL_ARALIK_DK = Number(process.env.BILDIRIM_KAT_GENEL_ARALIK_DK ?? 85);
const KAT_MAX_GUN = Number(process.env.BILDIRIM_KAT_MAX_GUN ?? 10);
// Taze sayılan pencere: SENKRON kuralı. Bildirim adayı, son konu
// bildiriminden bu yana yayınlanan haberlerden seçilir (pencere = geçen süre
// + 12 dk). Alt sınır 35 dk: hızlı art arda çalışan turlarda havuz boş
// kalmasın. Üst sınır 140 dk: hat uzun süre durursa saatler önceki haber
// "yeni" diye gönderilmesin.
const KAT_PENCERE_MIN_DK = Number(process.env.BILDIRIM_KAT_PENCERE_MIN_DK ?? 35);
const KAT_PENCERE_MAX_DK = Number(process.env.BILDIRIM_KAT_PENCERE_MAX_DK ?? 140);
// Senkron freni: ~130 haber/gün temposunda her ~10 dk'da yeni haber çıkar;
// eldeki en yeni haber 45 dk'dan eskiyse yeni haber beklenir.
const KAT_MAKS_YAS_DK = Number(process.env.BILDIRIM_KAT_MAKS_YAS_DK ?? 45);
// Tur başına en fazla kaç KATEGORİ işlenir (farklı kategorileri takip eden okurlar birbirini tıkamasın).
const KAT_TUR_ADET = Number(process.env.BILDIRIM_KAT_TUR_ADET ?? 2);
// Tur başına gönderilecek en fazla HABER.
const KAT_TUR_HABER = Number(process.env.BILDIRIM_KAT_TUR_HABER ?? 2);
// Kimsenin takip etmediği (alıcısı 0 çıkan) kategori bu süre boyunca atlanır.
const KAT_BOS_GERI_CEK_SAAT = Number(process.env.BILDIRIM_KAT_BOS_SAAT ?? 1);
const TOPLAM_MAX_GUN = Number(process.env.BILDIRIM_TOPLAM_MAX_GUN ?? 12);
// Özet bildirimi: "ozet" seçen okuyucuya günde 3 kez (TR 09/15/21).
const OZET_SAATLER = [9, 15, 21];
const OZET_ARALIK_SAAT = Number(process.env.BILDIRIM_OZET_ARALIK_SAAT ?? 4);
// Sessiz saat: yalnızca KONU bildirimleri için (Türkiye saati, UTC+3).
// Son dakika haberleri gece de gider; konu bildirimleri 23:00-07:00 arası susar.
// Böylece 10 bildirim 07:00-21:24 arasına dengeli dağılır, gece kimse uyanmaz.
const SESSIZ_BAS = Number(process.env.BILDIRIM_SESSIZ_BAS ?? 23);
const SESSIZ_BIT = Number(process.env.BILDIRIM_SESSIZ_BIT ?? 7);

const TR_OFFSET_DK = 180; // Türkiye UTC+3 (yaz saati uygulaması yok)
// Gönderilen id listesi sınırsız büyümesin.
const SENT_LIMIT = 800;

// --------------------------------------------------------------------------
// Yardımcılar
// --------------------------------------------------------------------------

/** Türkiye saatine göre gün ve saat. */
function trZaman(ms) {
  const t = new Date(ms + TR_OFFSET_DK * 60000);
  return {
    gun: t.toISOString().slice(0, 10),
    saat: t.getUTCHours(),
    dakika: t.getUTCMinutes(),
  };
}

function yayinZamani(a) {
  const t = Date.parse(a?.generatedAt || a?.publishedAt || 0);
  return Number.isFinite(t) ? t : 0;
}

/** Haber `saat` saatten taze mi? */
function taze(a, saat, now) {
  const t = yayinZamani(a);
  return t > 0 && now - t <= saat * 3600000;
}

/** Haber `dk` dakikadan taze mi? (senkron penceresi için) */
function tazeDk(a, dk, now) {
  const t = yayinZamani(a);
  return t > 0 && now - t <= dk * 60000;
}

/** Haberin kaç dakika önce yayınlandığı (log için). */
function yasDk(a, now) {
  const t = yayinZamani(a);
  return t > 0 ? Math.round((now - t) / 60000) : -1;
}

function kisalt(str, max) {
  const s = String(str || "").replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/**
 * OneSignal yanıtındaki alıcı (cihaz) sayısını günlüğe ekler.
 * Neden: gönderim "başarılı" görünse de abone yoksa kimseye ulaşmaz. Alıcı
 * sayısını CI günlüğünde görünür kılmak, "bildirim gerçekten gitti mi?"
 * sorusunu tek bakışta yanıtlar (0 ise cihazda zile basılmamış demektir).
 */
function aliciNotu(yanit) {
  const n = Number(yanit?.recipients);
  if (!Number.isFinite(n)) return "";
  if (n === 0) return " → alıcı: 0 (abone yok: cihazda bildirim izni verilmemiş)";
  return ` → alıcı: ${n}`;
}

async function durumOku() {
  if (!existsSync(DURUM_DOSYA))
    return {
      updatedAt: null,
      sonDakika: null,
      sent: [],
      sentHepsi: [],
      sonKategori: {},
      sonOzet: null,
      gun: "",
      gunSayi: {},
      hosGeldin: false,
      cihazlar: [],
      cihazTaban: false,
    };
  try {
    const d = JSON.parse(await readFile(DURUM_DOSYA, "utf8"));
    return {
      updatedAt: d.updatedAt || null,
      sent: Array.isArray(d.sent) ? d.sent.map(String) : [],
      sentHepsi: Array.isArray(d.sentHepsi) ? d.sentHepsi.map(String) : [],
      sonKategori: d.sonKategori && typeof d.sonKategori === "object" ? d.sonKategori : {},
      bosKategori: d.bosKategori && typeof d.bosKategori === "object" ? d.bosKategori : {},
      sonDakika: d.sonDakika || null,
      sonOzet: d.sonOzet || null,
      gun: d.gun || "",
      gunSayi: d.gunSayi && typeof d.gunSayi === "object" ? d.gunSayi : {},
      hosGeldin: d.hosGeldin === true,
      cihazlar: Array.isArray(d.cihazlar) ? d.cihazlar.map(String) : [],
      cihazTaban: d.cihazTaban === true,
    };
  } catch {
    return {
      updatedAt: null,
      sonDakika: null,
      sent: [],
      sentHepsi: [],
      sonKategori: {},
      bosKategori: {},
      sonOzet: null,
      gun: "",
      gunSayi: {},
      hosGeldin: false,
      cihazlar: [],
      cihazTaban: false,
    };
  }
}

async function durumYaz(durum) {
  await mkdir(DATA_DIR, { recursive: true });
  const sent = [...new Set(durum.sent.map(String))].slice(-SENT_LIMIT);
  const sentHepsi = [...new Set((durum.sentHepsi || []).map(String))].slice(-SENT_LIMIT);
  const payload = {
    updatedAt: durum.updatedAt,
    sonDakika: durum.sonDakika || null,
    gun: durum.gun,
    gunSayi: durum.gunSayi,
    sonKategori: durum.sonKategori,
    // Takipçisi olmayan kategoriler: günlük tavanı boşa harcamamak için not edilir.
    bosKategori: durum.bosKategori || {},
    sonOzet: durum.sonOzet || null,
    sent,
    sentHepsi,
    hosGeldin: durum.hosGeldin === true,
    cihazlar: [...new Set((durum.cihazlar || []).map(String))].slice(-600),
    cihazTaban: durum.cihazTaban === true,
  };
  await writeFile(DURUM_DOSYA, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/**
 * OneSignal abonelik (cihaz) listesi — yeni aboneye "hoş geldin" göndermek için.
 * Yalnızca GERÇEKTEN abone olanlar döner: notification_types === 1 (izin + push
 * aboneliği) ve invalid_identifier !== true. İzin vermemiş kayıtlar elenir.
 */
async function abonelikler() {
  try {
    const res = await fetch(`https://api.onesignal.com/players?app_id=${APP_ID}&limit=300`, {
      headers: { Authorization: `Key ${REST_KEY}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    const list = Array.isArray(d?.players) ? d.players : [];
    return list
      .filter(
        (p) =>
          p &&
          p.id &&
          Number(p.notification_types) === 1 &&
          p.invalid_identifier !== true
      )
      .map((p) => String(p.id));
  } catch {
    return null;
  }
}

/**
 * OneSignal uygulama bilgisi: abone sayısı (`players`) + iOS/Safari kurulumu.
 * Neden gerekli: (1) günlük tavan dolduğunda gönderim yapılmadığı için yanıttaki
 * "recipients" alanı da gelmez, abone sayısı ayrıca okunmalı; (2) iPhone'dan
 * abone olup bildirim gelmiyorsa sebep neredeyse her zaman `apns` alanıdır
 * (Apple platformu + APNs anahtarı tanımlı değilse iOS'a teslim edilemez).
 * Hata durumunda null döner; çağıran karar verir.
 */
async function uygulamaBilgi() {
  try {
    const res = await fetch(`https://api.onesignal.com/apps/${APP_ID}`, {
      headers: { Authorization: `Key ${REST_KEY}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Gönderilen bildirimin teslim raporu (successful/failed/errored). Bunu günlüğe
 * yazmak "bildirim gitti mi?" sorusunu tahmine bırakmaz: abone varsa ve
 * `failed > 0` ise teslim tarafında (genelde iOS/APNs) sorun var demektir.
 */
async function teslimRaporu(id) {
  if (!id) return null;
  try {
    const res = await fetch(
      `https://api.onesignal.com/notifications/${id}?app_id=${APP_ID}`,
      { headers: { Authorization: `Key ${REST_KEY}` }, signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) return null;
    const n = await res.json();
    return {
      basarili: n.successful,
      basarisiz: n.failed,
      hata: n.errored,
      durum: n.state || n.status || "",
    };
  } catch {
    return null;
  }
}

/**
 * Web push bildirimi için görsel URL'si üretir.
 *
 * KRİTİK: WebP formatı Windows 10/11 Bildirim Merkezi (WNS) ve Apple APNs (iOS/macOS Safari)
 * tarafından DESTEKLENMEZ. WebP gönderildiğinde bu sistemler görseli sessizce düşürür
 * ve bildirim görselsiz çıkar. Bu nedenle push bildirimlerinde daima standart JPEG
 * (output=jpg) formatı kullanılır.
 */
const DIRECT_IMAGE_HOSTS = /(\.teimg\.com|cryptopotato\.com|nuvemmag\.com|kentgazetesi\.com|hunattv\.com|i\.ytimg\.com)$/i;

function normalizeSrc(src) {
  let s = String(src || "")
    .replace(/&amp;/g, "&")
    .replace(/\/\/www\.technopat\.net\/www\.technopat\.net\//i, "//www.technopat.net/")
    .replace(/(imgrosetta\.webtekno\.com\/file\/\d+\/\d+-)640xauto/i, "$11280xauto")
    .trim();
  if (/wikimedia\.org\/wikipedia\/commons\/thumb\//i.test(s)) {
    s = s.replace(/\/(1400|1600|1920)px-/i, "/1280px-");
  }
  return s;
}

/**
 * Web push bildirimi için görsel URL'si üretir.
 * - 2:1 en-boy oranı (Chrome ve Windows Web Push resmi standardı: 720x360).
 * - Doğrudan uzantı içeren URL (/haber.jpg) -> Windows Action Center (WNS) uzantısız kök URL'leri görsel saymayıp düşürebiliyordu.
 * - Proxy engelleyen veya 404 dönen host'lar (teimg.com vb.) için yalnızca doğrudan JPEG/PNG ise orijinal URL kullanılır; WebP ise WNS/APNs düşürdüğü için kabul edilmez.
 */
function bildirimGorseli(src, width = 720, height = 360) {
  if (!src || !/^https?:\/\//i.test(src)) return "";
  const s = normalizeSrc(src);
  try {
    const u = new URL(s);
    if (DIRECT_IMAGE_HOSTS.test(u.hostname)) {
      if (/\.(jpe?g|png)(\?|$)/i.test(u.pathname)) return s;
      return "";
    }
  } catch {}
  const w = Math.round(width);
  const h = Math.round(height);
  return `https://wsrv.nl/haber.jpg?url=${encodeURIComponent(s)}&w=${w}&h=${h}&fit=cover&we&output=jpg&q=85`;
}

function bildirimIkonu(src) {
  if (!src || !/^https?:\/\//i.test(src)) return `${SITE_URL}/ikon-192.png`;
  const s = normalizeSrc(src);
  try {
    const u = new URL(s);
    if (DIRECT_IMAGE_HOSTS.test(u.hostname)) {
      if (/\.(jpe?g|png)(\?|$)/i.test(u.pathname)) return s;
      return `${SITE_URL}/ikon-192.png`;
    }
  } catch {}
  return `https://wsrv.nl/ikon.jpg?url=${encodeURIComponent(s)}&w=192&h=192&fit=cover&we&output=jpg&q=85`;
}

const gorselOnbellek = new Map();

/**
 * Push görselini gönderimden ÖNCE gerçekten indirerek:
 * 1) HTTP 200 ve geçerli JPEG/PNG olduğunu doğrular (WebP veya 404 ise eler),
 * 2) wsrv.nl / Cloudflare CDN önbelleğini ısıtır (ilk istekte 5-9 sn süren
 *    dönüşüm yüzünden Chrome/Windows/Android Service Worker'ın zaman aşımına
 *    uğrayıp bildirimi görselsiz göstermesini engeller).
 */
async function gorselDogrulaVeIsit(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  if (url.startsWith(SITE_URL)) return true;
  if (gorselOnbellek.has(url)) return gorselOnbellek.get(url);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0 Safari/537.36",
        Accept: "image/jpeg,image/png,image/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(7500),
    });
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const gecerli =
      res.ok &&
      (ct.includes("image/jpeg") || ct.includes("image/jpg") || ct.includes("image/png"));
    if (gecerli) {
      const buf = await res.arrayBuffer();
      const tamam = buf.byteLength >= 1500;
      gorselOnbellek.set(url, tamam);
      return tamam;
    }
  } catch {}
  gorselOnbellek.set(url, false);
  return false;
}

/** Bildirimin tıklanınca gideceği adres + doğrulanmış/ısıtılmış görsel + metin. */
async function bildirimIcerigiHazirla(a, { baslik }, { dry = false } = {}) {
  const adayKaynaklar = [];
  const kapak = kapakKaynagi(a);
  if (kapak) adayKaynaklar.push(kapak);
  if (
    a?.image &&
    /^https?:\/\//i.test(a.image) &&
    !/placeholder|no[-_]?image|default[-_/]?news|avatar/i.test(a.image) &&
    !adayKaynaklar.includes(a.image)
  ) {
    adayKaynaklar.push(a.image);
  }
  if (Array.isArray(a?.images)) {
    for (const url of a.images) {
      if (typeof url === "string" && /^https?:\/\//i.test(url) && !adayKaynaklar.includes(url)) {
        adayKaynaklar.push(url);
      }
    }
  }
  const yedek = yedekGorsel(a?.category || "Gündem", a?.id);
  if (yedek?.url && !adayKaynaklar.includes(yedek.url)) {
    adayKaynaklar.push(yedek.url);
  }

  let secilenKaynak = adayKaynaklar[0] || "";
  let gorsel = secilenKaynak ? bildirimGorseli(secilenKaynak, 720, 360) : "";

  if (!dry) {
    let bulundu = false;
    for (const kaynak of adayKaynaklar) {
      const wsrvUrl = bildirimGorseli(kaynak, 720, 360);
      if (wsrvUrl && (await gorselDogrulaVeIsit(wsrvUrl))) {
        secilenKaynak = kaynak;
        gorsel = wsrvUrl;
        bulundu = true;
        break;
      }
      const temiz = normalizeSrc(kaynak);
      if (/\.(jpe?g|png)(\?|$)/i.test(temiz) && (await gorselDogrulaVeIsit(temiz))) {
        secilenKaynak = kaynak;
        gorsel = temiz;
        bulundu = true;
        break;
      }
    }
    if (!bulundu) {
      gorsel = `${SITE_URL}/og-default.png`;
      secilenKaynak = "";
    }
  } else if (!gorsel) {
    gorsel = `${SITE_URL}/og-default.png`;
  }

  let ikon = secilenKaynak ? bildirimIkonu(secilenKaynak) : `${SITE_URL}/ikon-192.png`;
  if (!dry && ikon !== `${SITE_URL}/ikon-192.png`) {
    const ikonTamam = await gorselDogrulaVeIsit(ikon);
    if (!ikonTamam) ikon = `${SITE_URL}/ikon-192.png`;
  }

  return {
    baslik,
    icerik: kisalt(a.title, 120),
    url: `${SITE_URL}/haber/${a.slug || a.id}/`,
    gorsel,
    ikon,
  };
}

/**
 * OneSignal `idempotency_key` alanı YALNIZCA UUID kabul eder (düz metin
 * reddedilir: "is not a valid UUID"). Haber id'sinden değişmez bir UUID
 * üretilir: aynı haber → aynı anahtar → bir aksilikte ikinci gönderim
 * denemesi OneSignal tarafından yinelenen sayılıp düşürülür.
 * @param {string} metin
 * @returns {string} 8-4-4-4-12 biçiminde UUID (sürüm 5 görünümlü)
 */
function uuidAnahtar(metin) {
  const h = createHash("sha256").update(String(metin)).digest("hex");
  const varyant = ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${varyant}${h.slice(
    17,
    20
  )}-${h.slice(20, 32)}`;
}

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

// Bildirim, haber sayfası GERÇEKTEN yayındayken gönderilir.
//
// Neden: eskiden push adımı site derlemesinden/yayınından ÖNCE çalışıyordu.
// Okuyucu bildirime hemen tıkladığında haber sayfası henüz GitHub Pages'e
// çıkmamış oluyor ve 404 alıyordu. Artık iş akışında bildirim yayından sonra
// çalışır; buradaki kontrol de CDN gecikmesine karşı son güvencedir.
// Sayfa hazır değilse gonder() hata verir; çağıran taraf haberi "gönderildi"
// olarak işaretlemez ve bir sonraki turda yeniden dener.
const canliOnbellek = new Map();
// GitHub Pages, gh-pages dalına push edildikten sonra sayfaları 1-3 dakika
// içinde yayına alıyor. 5×12 sn (60 sn) yetmiyordu: yeni haber sayfası
// yayında olmadığı için bildirim atlanıyor, haber de tazeliğini yitiriyordu.
// 8×20 sn = en fazla ~160 sn beklenir.
async function sayfaHazirMi(url, deneme = 8, aralikMs = 20000) {
  const anahtar = String(url || "");
  if (!anahtar) return false;
  if (canliOnbellek.has(anahtar)) return canliOnbellek.get(anahtar);
  let sonDurum = 0;
  for (let i = 0; i < deneme; i++) {
    try {
      const res = await fetch(anahtar, {
        method: "GET",
        headers: {
          "User-Agent": "HaberinaiBot/1.0 (+https://haberinai.site)",
          Range: "bytes=0-2047",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok || res.status === 206) {
        canliOnbellek.set(anahtar, true);
        return true;
      }
      sonDurum = res.status;
    } catch {
      // ağ/CDN hatası: kısa bekleyip yeniden dene
    }
    if (i < deneme - 1) {
      console.log(
        `  … haber sayfası henüz yayında değil${sonDurum ? ` (HTTP ${sonDurum})` : ""}, ` +
          `${Math.round(aralikMs / 1000)} sn sonra tekrar deneniyor`
      );
      await bekle(aralikMs);
    }
  }
  canliOnbellek.set(anahtar, false);
  return false;
}

/**
 * OneSignal'e bir bildirim gönderir.
 * @param {{baslik:string,icerik:string,url:string,gorsel?:string,ikon?:string,etiket?:string,ttl:number,anahtar:string}} p
 */
async function gonder(p) {
  if (!(await sayfaHazirMi(p.url))) {
    throw new Error(`hedef sayfa yayında değil (404/hazır değil): ${p.url}`);
  }
  const logoIkon = `${SITE_URL}/ikon-192.png`;
  const ikon = p.ikon || logoIkon;
  // Android durum çubuğu ve rozet için şeffaf zeminli beyaz silüet (gri kutu hatasını engeller)
  const badgeIkon = `${SITE_URL}/badge-96.png`;
  const gorsel = p.gorsel || `${SITE_URL}/og-default.png`;

  const govde = {
    app_id: APP_ID,
    target_channel: "push",
    headings: { tr: p.baslik, en: p.baslik },
    contents: { tr: p.icerik, en: p.icerik },
    url: p.url,
    chrome_web_icon: ikon,
    firefox_icon: ikon,
    large_icon: ikon,
    chrome_web_badge: badgeIkon,
    chrome_web_image: gorsel,
    big_picture: gorsel,
    adm_big_picture: gorsel,
    ios_attachments: { id1: gorsel },
    ttl: p.ttl,
    idempotency_key: uuidAnahtar(p.anahtar),
    web_push_topic: "hb_" + uuidAnahtar(p.anahtar || p.url || Date.now()),
    android_group: "haberinai_haberler",
  };

  if (p.abonelikId) {
    // Tek bir cihaza gönderim (yeni aboneye "hoş geldin").
    govde.include_subscription_ids = [String(p.abonelikId)];
  } else if (Array.isArray(p.etiketler) && p.etiketler.length) {
    // Birden çok etiket: OneSignal REST API'de her koşul arasına açıkça operator: "AND" eklenmelidir
    const hamFiltreler = p.etiketler.map((e) =>
      typeof e === "string"
        ? { field: "tag", key: e, relation: "=", value: "1" }
        : e.operator
          ? { operator: e.operator }
          : { field: "tag", key: e.key, relation: e.relation || "=", value: e.value }
    );
    const filtreler = [];
    for (let i = 0; i < hamFiltreler.length; i++) {
      if (i > 0 && !hamFiltreler[i].operator && !hamFiltreler[i - 1].operator) {
        filtreler.push({ operator: "AND" });
      }
      filtreler.push(hamFiltreler[i]);
    }
    govde.filters = filtreler;
  } else if (p.etiket) {
    govde.filters = [{ field: "tag", key: p.etiket, relation: "=", value: "1" }];
  } else {
    // TÜM aboneler: `included_segments: ["Subscribed Users"]` KULLANILMAZ.
    // OneSignal'in yeni kullanıcı modelinde o segment boş dönüyor ve istek
    // "All included players are not subscribed" ile reddediliyor; sayaç yine
    // artıyor, okuyucuya ise hiçbir şey gitmiyor. Cihaz, bildirimi açtığı anda
    // son_dakika=1 etiketini aldığı için hedefleme etiketle yapılır.
    // Yalnızca profil/zil ayarlarından "Genel Son Dakika"yı AÇIKÇA seçenlere gider.
    govde.filters = [{ field: "tag", key: "son_dakika_genel", relation: "=", value: "1" }];
  }

  const res = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${REST_KEY}` },
    body: JSON.stringify(govde),
    signal: AbortSignal.timeout(20000),
  });
  const metin = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${metin.slice(0, 300)}`);
  const yanit = metin ? JSON.parse(metin) : null;
  // HTTP 200 olsa da OneSignal hedefi reddedebilir (id boş + errors dolu).
  // Böyle bir yanıtı başarı saymak günlük tavandan yiyip hiç bildirim
  // göndermemeye yol açıyordu.
  if (yanit && (yanit.errors || !yanit.id)) {
    throw new Error(`OneSignal reddetti: ${JSON.stringify(yanit.errors || yanit).slice(0, 200)}`);
  }
  return yanit;
}

/**
 * Haberin gerçek kategorisinin, üzerindeki `categorySlug` ile birebir örtüştüğünü doğrular.
 * Örneğin kaynak RSS'i "Teknoloji" olduğu için yanlışlıkla Teknoloji etiketi almış
 * dizi/film fragmanı, deprem, siyaset veya spor haberlerinin `teknoloji` / `yapay-zeka`
 * takipçilerine bildirim olarak gitmesini kesin olarak engeller.
 */
function kategoriDogruMu(a) {
  if (!a || !a.categorySlug) return false;
  const dogruKategori = canonicalCategory(a.category, a.category, a.title, a.summary);
  return slugify(dogruKategori) === a.categorySlug;
}

// --------------------------------------------------------------------------
// Ana akış
// --------------------------------------------------------------------------

/**
 * Bekleyen bildirimleri gönderir.
 * @param {{dry?: boolean}} [opts] dry=true → hiçbir istek gönderilmez, durum yazılmaz.
 */
export async function bildirimleriGonder({ dry = false } = {}) {
  if (!dry && (!APP_ID || !REST_KEY)) {
    console.log("Bildirim: ONESIGNAL_APP_ID veya ONESIGNAL_REST_API_KEY tanımlı değil, atlanıyor.");
    return { gonderilen: 0, neden: "anahtar yok" };
  }

  const now = Date.now();
  const tr = trZaman(now);
  const durum = await durumOku();

  // Gün değiştiyse sayaçlar sıfırlanır.
  if (durum.gun !== tr.gun) {
    durum.gun = tr.gun;
    durum.gunSayi = { son: 0, kategori: 0, ozet: 0 };
  }

  const tumMakaleler = getArticles();
  const gonderilmis = new Set(durum.sent.map(String));
  const yeni = tumMakaleler.filter((a) => a.id && !gonderilmis.has(String(a.id)));
  const gunToplam = (durum.gunSayi.son || 0) + (durum.gunSayi.kategori || 0);

  // Bugün (TR günü) yayınlanan toplam haber sayısı — ~130 günlük haber akışıyla
  // ~10 günlük bildirimi senkronize etmek için kullanılır.
  const bugunHaberSayisi = tumMakaleler.filter((a) => {
    const t = yayinZamani(a);
    return t > 0 && trZaman(t).gun === tr.gun;
  }).length;
  const GUNLUK_HEDEF_HABER = 130;
  const aktifDk = Math.max(0, Math.min(960, (tr.saat - SESSIZ_BIT) * 60 + tr.dakika));
  const aktifOran = aktifDk / 960;
  const haberOrani = Math.min(1, bugunHaberSayisi / GUNLUK_HEDEF_HABER);
  // Gün içindeki saat ilerleyişi ve çıkan haber sayısıyla senkronize hedef bildirim sayısı (1..10)
  const senkronHedef = Math.min(
    KAT_MAX_GUN,
    Math.max(1, Math.ceil(KAT_MAX_GUN * Math.max(aktifOran, haberOrani * 0.85)))
  );

  console.log(
    `Bildirim: ${yeni.length} yeni haber adayı (bugün çıkan: ${bugunHaberSayisi}/${GUNLUK_HEDEF_HABER}), ` +
      `gün içinde gönderilen ${gunToplam}/${TOPLAM_MAX_GUN} ` +
      `(konu ${durum.gunSayi.kategori || 0}/${KAT_MAX_GUN}, senkron hedef: ${senkronHedef})${dry ? " [dry]" : ""}`
  );

  let sayilan = 0;
  // Gönderim olmasa da durum değişebilir (ör. "bu kategoride takipçi yok"
  // işareti). Eskiden durum dosyası yalnızca gönderim varsa yazılıyordu; bu
  // yüzden boş kategori işareti kayboluyor ve her turda yeniden deneniyordu.
  let durumDegisti = false;

  // ---- 0) HOŞ GELDİN / TEST BİLDİRİMİ ----
  const test = process.env.BILDIRIM_TEST === "1";
  const uygulama = dry ? null : await uygulamaBilgi();
  const abone =
    uygulama && Number.isFinite(Number(uygulama.players)) ? Number(uygulama.players) : null;
  console.log(
    `Bildirim: abone sayısı: ${abone === null ? "okunamadı" : abone}${dry ? " [dry]" : ""}`
  );

  if (uygulama) {
    console.log(
      `Bildirim: uygulama "${uygulama.name}" | apns (iOS): ${
        uygulama.apns_env ? "kurulu" : "KURULU DEĞİL"
      } | safari_web_id: ${uygulama.safari_web_id ? "var" : "yok"} | chrome_web: ${
        uygulama.chrome_web_origin ? "var" : "yok"
      }`
    );
  } else if (!dry) {
    console.log("Bildirim: uygulama bilgisi okunamadı (teşhis atlandı).");
  }

  if (!dry && (test || durum.hosGeldin !== true) && (test || abone === null || abone > 0)) {
    try {
      const yanit = await gonder({
        baslik: test ? "🔔 Test bildirimi" : "🔔 Bildirimler açıldı",
        icerik: test
          ? "Bildirimler çalışıyor. HaberinAi'de son dakika haberleri artık cebinde."
          : "Son dakika haberleri artık buradan gelecek. İlk önemli gelişmede haber vereceğiz.",
        url: `${SITE_URL}/${test ? "" : "son-dakika/"}`,
        gorsel: `${SITE_URL}/og-default.png`,
        ikon: `${SITE_URL}/ikon-192.png`,
        ttl: 86400,
        anahtar: `hos-geldin-${tr.gun}-${test ? Date.now() : "1"}`,
      });
      console.log(`  ✓ [${test ? "test" : "hoş geldin"}] yanıt: ${JSON.stringify(yanit).slice(0, 200)}`);
      const rapor = await teslimRaporu(yanit?.id);
      if (rapor) {
        console.log(
          `    teslim: başarılı ${rapor.basarili ?? "?"} | başarısız ${rapor.basarisiz ?? "?"} | ` +
            `hata ${rapor.hata ?? "?"}${rapor.durum ? ` | durum ${rapor.durum}` : ""}`
        );
      }
      const hataVar =
        Boolean(yanit && yanit.errors) || !yanit?.id;
      const ulasan = Number(yanit?.recipients);
      const ulasti = Number.isFinite(ulasan)
        ? ulasan > 0
        : hataVar
          ? false
          : abone === null
            ? true
            : abone > 0;
      if (ulasti) durum.hosGeldin = true;
      sayilan++;
    } catch (err) {
      console.warn(`  ✗ [hoş geldin] ${err.message}`);
    }
  } else if (!test && !dry && durum.hosGeldin !== true && abone === 0) {
    console.log("Bildirim: henüz abone yok — hoş geldin bildirimi bekletiliyor.");
  }

  // ---- 0b) YENİ ABONEYE CİHAZ BAZINDA "HOŞ GELDİN" ----
  if (!dry) {
    const liste = await abonelikler();
    if (liste) {
      if (!durum.cihazTaban) {
        durum.cihazlar = liste;
        durum.cihazTaban = true;
        await durumYaz(durum);
        console.log(`Bildirim: cihaz tabanı kaydedildi (${liste.length} abone).`);
      } else {
        const mevcut = new Set(liste);
        durum.cihazlar = (durum.cihazlar || []).filter((id) => mevcut.has(id));
        const bilinen = new Set(durum.cihazlar);
        const yeniler = liste.filter((id) => !bilinen.has(id)).slice(0, 5);
        for (const id of yeniler) {
          try {
            const yanit = await gonder({
              baslik: "🔔 Bildirimlerin açıldı",
              icerik:
                "Seçtiğin ilgi alanlarındaki önemli gelişmeler gün boyu dengeli aralıklarla cebine gelecek.",
              url: `${SITE_URL}/akis/`,
              gorsel: `${SITE_URL}/og-default.png`,
              ikon: `${SITE_URL}/ikon-192.png`,
              ttl: 86400,
              anahtar: `cihaz-hos-${id}`,
              abonelikId: id,
            });
            console.log(
              `  ✓ [yeni abone] ${id.slice(-6)} yanıt: ${JSON.stringify(yanit).slice(0, 120)}`
            );
          } catch (err) {
            console.warn(`  ✗ [yeni abone] ${err.message}`);
          }
        }
        if (yeniler.length) {
          durum.cihazlar = [...new Set([...durum.cihazlar, ...yeniler])];
          await durumYaz(durum);
          sayilan += yeniler.length;
        }
      }
    }
  }

  // ---- 1) GENEL SON DAKİKA (Yalnızca son_dakika_genel=1 seçen kullanıcılara) ----
  if (SON_MAX_GUN > 0 && gunToplam < TOPLAM_MAX_GUN && (durum.gunSayi.son || 0) < SON_MAX_GUN) {
    const sonDakikaAt = durum.sonDakika || null;
    const gecenDk = sonDakikaAt ? (now - Date.parse(sonDakikaAt)) / 60000 : Infinity;
    if (gecenDk < SON_MIN_ARALIK_DK) {
      console.log(
        `Bildirim: son gönderimden ${Math.round(gecenDk)} dk geçti ` +
          `(asgari ${SON_MIN_ARALIK_DK} dk); genel son dakika bekletiliyor.`
      );
    } else {
      const aday = yeni
        .filter(
          (a) =>
            a.breaking === true &&
            taze(a, SON_TTL_SAAT, now) &&
            acilBaslik(a)
        )
        .sort((a, b) => yayinZamani(b) - yayinZamani(a))[0];

      if (aday) {
        const icerik = await bildirimIcerigiHazirla(aday, { baslik: "🔴 SON DAKİKA" }, { dry });
        if (dry) {
          console.log(`  [dry] genel son dakika (yalnızca son_dakika_genel=1) → ${icerik.icerik} | görsel: ${icerik.gorsel}`);
        } else {
          try {
            const yanit = await gonder({
              ...icerik,
              ttl: 21600,
              etiket: "son_dakika_genel",
              anahtar: `son-${aday.id}`,
            });
            const alici = Number(yanit?.recipients);
            if (!Number.isFinite(alici) || alici > 0) {
              console.log(
                `  ✓ [genel son dakika] ${kisalt(aday.title, 60)}${yanit?.id ? ` (${yanit.id})` : ""}${aliciNotu(yanit)}`
              );
              durum.sent.push(String(aday.id));
              durum.sonDakika = new Date(now).toISOString();
              durum.gunSayi.son = (durum.gunSayi.son || 0) + 1;
              durumDegisti = true;
              sayilan++;
            } else {
              console.log("  · [genel son dakika] açık olan cihaz yok — atlandı.");
              durum.sent.push(String(aday.id));
              durum.sonDakika = new Date(now).toISOString();
              durumDegisti = true;
            }
          } catch (err) {
            if (/not subscribed/i.test(err.message)) {
              durum.sonDakika = new Date(now).toISOString();
              durumDegisti = true;
            } else {
              console.warn(`  ✗ [son dakika] ${err.message}`);
            }
          }
        }
      }
    }
  }

  // ---- 2) TAKİP EDİLEN KONULAR (Sadece kullanıcının seçtiği başlıklar, günde ~10 senkronize bildirim) ----
  const sessiz =
    SESSIZ_BAS <= SESSIZ_BIT
      ? tr.saat >= SESSIZ_BAS && tr.saat < SESSIZ_BIT
      : tr.saat >= SESSIZ_BAS || tr.saat < SESSIZ_BIT;
  const sonKonuAt = durum.updatedAt ? Date.parse(durum.updatedAt) : 0;
  const konuGecenDk = sonKonuAt ? (now - sonKonuAt) / 60000 : Infinity;
  // SENKRON PENCERESİ: son konu bildiriminden bu yana geçen süre (+15 dk pay).
  const pencereDk = Math.min(
    Math.max(
      (Number.isFinite(konuGecenDk) ? konuGecenDk : KAT_PENCERE_MAX_DK) + 15,
      KAT_PENCERE_MIN_DK
    ),
    KAT_PENCERE_MAX_DK
  );
  // Penceredeki adaylar: YALNIZCA gerçek kategorisi doğrulanmış haberler alınır.
  // Böylece bir kategoride o gün az haber çıksa bile başka kategoriden veya
  // yanlış etiketlenmiş bir haber asla o başlık altında gönderilmez.
  const konuAdaylar = yeni.filter((a) => tazeDk(a, pencereDk, now) && kategoriDogruMu(a));
  const enYeniAdayDk = konuAdaylar.length
    ? Math.round((now - Math.max(...konuAdaylar.map(yayinZamani))) / 60000)
    : -1;

  // Günlük ~130 haber akışıyla senkronize dinamik aralık:
  // Eğer bugünkü bildirim sayısı senkron hedefin gerisindeyse 60 dk, yakaladıysa 85 dk.
  const mevcutKatSayi = durum.gunSayi.kategori || 0;
  const etkinGenelAralikDk = mevcutKatSayi < senkronHedef ? 60 : KAT_GENEL_ARALIK_DK;

  if (sessiz) {
    console.log(`Bildirim: sessiz saat (TR ${tr.saat}:00) → konu bildirimi gönderilmiyor.`);
  } else if (mevcutKatSayi >= KAT_MAX_GUN) {
    console.log(`Bildirim: konu bildirimi için günlük tavan (${KAT_MAX_GUN}) doldu.`);
  } else if (mevcutKatSayi >= senkronHedef + 1) {
    console.log(
      `Bildirim: günlük akış senkron kotası (${mevcutKatSayi}/${senkronHedef}) önde; ` +
        `günün ilerleyen saatlerindeki haberler için bekletiliyor.`
    );
  } else if (konuGecenDk < etkinGenelAralikDk) {
    console.log(
      `Bildirim: son konu bildiriminden ${Math.round(konuGecenDk)} dk geçti ` +
        `(senkron aralık ${etkinGenelAralikDk} dk); dengeli dağılım için bekletiliyor.`
    );
  } else if (konuAdaylar.length > 0 && enYeniAdayDk > KAT_MAKS_YAS_DK) {
    console.log(
      `Bildirim: en yeni haber ${enYeniAdayDk} dk önce çıktı; senkron için yeni haber ` +
        `bekleniyor (en fazla ${KAT_MAKS_YAS_DK} dk).`
    );
  } else {
    const gonderilenler = new Set(durum.sent.map(String));
    const grup = new Map();
    for (const a of konuAdaylar) {
      if (gonderilenler.has(String(a.id))) continue;
      const k = a.categorySlug;
      if (!k || k === "diger") continue;
      if (!grup.has(k)) grup.set(k, []);
      grup.get(k).push(a);
    }
    for (const liste of grup.values()) {
      const enYeni = Math.max(...liste.map(yayinZamani));
      const dilim = liste.filter((a) => enYeni - yayinZamani(a) <= KAT_PENCERE_MIN_DK * 60000);
      liste.length = 0;
      liste.push(...dilim);
      liste.sort(
        (a, b) =>
          Number(b.breaking === true) - Number(a.breaking === true) ||
          ilgiSkoru(b, now) - ilgiSkoru(a, now) ||
          yayinZamani(b) - yayinZamani(a)
      );
    }

    const bosKategori = durum.bosKategori || {};
    const bosMu = (slug) => {
      const t = bosKategori[slug];
      return t ? (now - Date.parse(t)) / 3600000 < KAT_BOS_GERI_CEK_SAAT : false;
    };
    const sirali = [...grup.keys()]
      .filter((slug) => {
        if (bosMu(slug)) return false;
        const son = durum.sonKategori?.[slug];
        if (!son || KAT_MIN_ARALIK_DK <= 0) return true;
        return (now - Date.parse(son)) / 60000 >= KAT_MIN_ARALIK_DK;
      })
      .sort(
        (a, b) => Date.parse(durum.sonKategori?.[a] || 0) - Date.parse(durum.sonKategori?.[b] || 0)
      );

    if (!sirali.length) {
      console.log(
        `Bildirim: konu bildirimi için uygun kategori yok ` +
          `(${grup.size} kategoride son ${Math.round(pencereDk)} dk içinde haber var, ` +
          `hepsi bekleme süresinde).`
      );
    } else {
      const bosIsaretle = (slug) => {
        bosKategori[slug] = new Date(now).toISOString();
        durum.bosKategori = bosKategori;
        durum.sonKategori[slug] = new Date(now).toISOString();
        durumDegisti = true;
      };
      let turHaber = 0;
      let turKategori = 0;
      for (const slug of sirali) {
        if (turKategori >= KAT_TUR_ADET || turHaber >= KAT_TUR_HABER) break;
        if ((durum.gunSayi.kategori || 0) >= KAT_MAX_GUN) break;
        let ulasti = false;
        for (const aday of grup.get(slug) || []) {
          if (turHaber >= KAT_TUR_HABER) break;
          const icerik = await bildirimIcerigiHazirla(aday, { baslik: `${aday.category}` }, { dry });
          if (dry) {
            console.log(
              `  [dry] konu (${slug}) → ${icerik.icerik} (yayın: ${yasDk(aday, now)} dk önce) | görsel: ${icerik.gorsel}`
            );
            turHaber++;
            ulasti = true;
            continue;
          }
          try {
            // DİKKAT: OneSignal'de OR operatörü kullanılmaz (AND önceliği yüzünden
            // seçilmeyen kategorilere bildirim sızmasına yol açıyordu).
            // Burada tüm koşullar AND ile bağlanır:
            //   1) Kullanıcının `kategori_<slug> = "1"` etiketi KESİNLİKLE olmalı.
            //   2) Sıklığı "ozet", "son" veya "kapali" OLMAMALI.
            // Not: Seçilen kategoride o gün 10'dan az haber çıkarsa başka kategoriden
            // bildirim ASLA gönderilmez; kullanıcı yalnızca kendi seçtiği başlıkları görür.
            const yanit = await gonder({
              ...icerik,
              ttl: 21600,
              etiketler: [
                `kategori_${slug}`,
                { key: "bildirim_sikligi", relation: "!=", value: "ozet" },
                { key: "bildirim_sikligi", relation: "!=", value: "son" },
                { key: "bildirim_sikligi", relation: "!=", value: "kapali" },
              ],
              anahtar: `kat-${aday.id}`,
            });
            const alici = Number(yanit?.recipients);
            if (Number.isFinite(alici) && alici <= 0) {
              console.log(`  · [konu:${slug}] takipçi yok (0 cihaz) — sayılmadı.`);
              bosIsaretle(slug);
              break;
            }
            console.log(
              `  ✓ [konu:${slug}] ${kisalt(aday.title, 60)}` +
                ` (yayın: ${yasDk(aday, now)} dk önce)` +
                `${yanit?.id ? ` (${yanit.id})` : ""}${aliciNotu(yanit)}`
            );
            durum.sent.push(String(aday.id));
            durum.updatedAt = new Date(now).toISOString();
            durum.sonKategori[slug] = new Date(now).toISOString();
            durum.gunSayi.kategori = (durum.gunSayi.kategori || 0) + 1;
            sayilan++;
            turHaber++;
            ulasti = true;
          } catch (err) {
            if (/not subscribed/i.test(err.message)) {
              console.log(
                `  · [konu:${slug}] takipçi yok — ${KAT_BOS_GERI_CEK_SAAT} saat atlandı.`
              );
              bosIsaretle(slug);
              break;
            }
            console.warn(`  ✗ [konu:${slug}] ${err.message}`);
          }
        }
        if (ulasti) turKategori++;
      }
    }
  }

  // ---- 2b) TÜM HABERLER MODU (Profilde "Seçtiğim başlıklardaki tüm haberler" diyenler) ----
  // Normal kullanıcılar günde ~10 senkronize bildirim (`gun10`) alırken, ayarlardan
  // açıkça `bildirim_mod = "hepsi"` seçen kullanıcılara seçtikleri başlıklardaki diğer
  // yeni haberler de iletilir. `sentHepsi` ayrı tutulduğu için `gun10` modunun adaylarını tüketmez!
  if (!sessiz) {
    const gonderilenlerHepsi = new Set([
      ...durum.sent.map(String),
      ...(durum.sentHepsi || []).map(String),
    ]);
    const adaylarHepsi = tumMakaleler
      .filter(
        (a) =>
          a.id &&
          !gonderilenlerHepsi.has(String(a.id)) &&
          tazeDk(a, 45, now) &&
          kategoriDogruMu(a)
      )
      .sort((a, b) => yayinZamani(b) - yayinZamani(a))
      .slice(0, 2);
    for (const aday of adaylarHepsi) {
      const slug = aday.categorySlug;
      if (!slug || slug === "diger") continue;
      const icerik = await bildirimIcerigiHazirla(aday, { baslik: `${aday.category}` }, { dry });
      if (dry) {
        console.log(`  [dry] konu-hepsi (${slug}) → ${icerik.icerik}`);
        continue;
      }
      try {
        const yanit = await gonder({
          ...icerik,
          ttl: 14400,
          etiketler: [
            `kategori_${slug}`,
            { key: "bildirim_mod", relation: "=", value: "hepsi" },
            { key: "bildirim_sikligi", relation: "!=", value: "kapali" },
          ],
          anahtar: `kat-hepsi-${aday.id}`,
        });
        const alici = Number(yanit?.recipients);
        durum.sentHepsi = durum.sentHepsi || [];
        durum.sentHepsi.push(String(aday.id));
        durumDegisti = true;
        if (Number.isFinite(alici) && alici > 0) {
          console.log(
            `  ✓ [konu-hepsi:${slug}] ${kisalt(aday.title, 60)}${aliciNotu(yanit)}`
          );
          sayilan++;
        }
      } catch {
        // `bildirim_mod=hepsi` seçen abone yoksa bu adayı tekrar denememek için not et.
        durum.sentHepsi = durum.sentHepsi || [];
        durum.sentHepsi.push(String(aday.id));
        durumDegisti = true;
      }
    }
  }

  // ---- 3) GÜNDE 3 ÖZET (yalnızca bildirim_sikligi=ozet) ----
  const ozetSaati = OZET_SAATLER.indexOf(tr.saat) >= 0 && tr.dakika < 12;
  const sonOzet = durum.sonOzet ? Date.parse(durum.sonOzet) : 0;
  const ozetGecti = !sonOzet || now - sonOzet >= OZET_ARALIK_SAAT * 3600000;
  if (ozetSaati && ozetGecti) {
    const ozetAday = tumMakaleler
      .filter((a) => a.title && taze(a, 18, now))
      .sort((a, b) => yayinZamani(b) - yayinZamani(a))
      .slice(0, 3);
    if (ozetAday.length) {
      const ilk = ozetAday[0];
      const ilkIcerik = await bildirimIcerigiHazirla(ilk, { baslik: "📬 Günün özeti" }, { dry });
      const ozetMetni = ozetAday
        .map((a, i) => `${i + 1}. ${kisalt(a.title, 55)}`)
        .join("  •  ");
      if (dry) {
        console.log(`  [dry] özet (${tr.saat}:00) → ${ozetMetni}`);
      } else {
        try {
          const yanit = await gonder({
            baslik: "📬 Günün özeti",
            icerik: kisalt(ozetMetni, 160),
            url: `${SITE_URL}/haber/${ilk.slug || ilk.id}/`,
            gorsel: ilkIcerik.gorsel,
            ikon: ilkIcerik.ikon,
            ttl: 21600,
            etiketler: [{ key: "bildirim_sikligi", relation: "=", value: "ozet" }],
            anahtar: `ozet-${tr.gun}-${tr.saat}`,
          });
          console.log(
            `  ✓ [özet ${tr.saat}:00] ${ozetAday.length} haber${yanit?.id ? ` (${yanit.id})` : ""}${aliciNotu(yanit)}`
          );
          durum.sonOzet = new Date(now).toISOString();
          durum.gunSayi.ozet = (durum.gunSayi.ozet || 0) + 1;
          sayilan++;
        } catch (err) {
          console.warn(`  ✗ [özet] ${err.message}`);
        }
      }
    } else {
      console.log("Bildirim: özet saatinde taze haber bulunamadı.");
    }
  }

  if (!dry && (sayilan || durumDegisti)) {
    try {
      await durumYaz(durum);
    } catch (err) {
      console.warn(`Bildirim: data/bildirim.json yazılamadı (${err.message}).`);
    }
  }

  return {
    gonderilen: sayilan,
    gun: tr.gun,
    sessiz,
    sonDakikaAdayi: yeni.filter(
      (a) => a.breaking === true && taze(a, SON_TTL_SAAT, now) && acilBaslik(a)
    ).length,
    konuAdayi: yeni.filter((a) => tazeDk(a, pencereDk, now)).length,
    pencereDk: Math.round(pencereDk),
    dry,
  };
}

// Doğrudan çalıştırıldıysa (CLI) gönderimi başlat.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dry = process.argv.includes("--dry");
  bildirimleriGonder({ dry })
    .then((r) => {
      console.log(
        `Bildirim sonucu: ${r.gonderilen} gönderim` +
          (r.sonDakikaAdayi !== undefined
            ? ` (aday: son dakika ${r.sonDakikaAdayi}, konu ${r.konuAdayi})`
            : "") +
          (r.neden ? ` — ${r.neden}` : "")
      );
    })
    .catch((err) => {
      console.error(`Bildirim hatası: ${err.message}`);
      process.exitCode = 1;
    });
}
