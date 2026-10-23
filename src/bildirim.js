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
//      (kategori_<slug> = 1 + bildirim_sikligi = aninda). Takip edilen
//      kategoride çıkan HER taze haber gönderilir — "son dakika" işaretli
//      olanlar dahil (eskiden dışlanıyordu ve taze haberlerin tamamı breaking
//      olduğu için konu bildirimi pratikte hiç gitmiyordu). Kategori başına
//      bekleme süresi yok (KAT_MIN_ARALIK_DK=0); tur başına en fazla
//      KAT_TUR_ADET kategori ve KAT_TUR_HABER haber gönderilir, günlük tavan
//      ve sessiz saat (01:00-07:00 TR) uygulanır. Takipçisi olmayan kategori
//      tespit edilirse (alıcı 0) kısa süre atlanır, tavan harcanmaz.
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
import { getArticles, imageUrl } from "../site/src/lib/articles.js";
import { kapakKaynagi } from "../site/src/lib/kapak.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const DURUM_DOSYA = join(DATA_DIR, "bildirim.json");

const APP_ID = String(process.env.ONESIGNAL_APP_ID || "").trim();
const REST_KEY = String(process.env.ONESIGNAL_REST_API_KEY || "").trim();
const SITE_URL = (process.env.SITE_URL || "https://haberinai.site").replace(/\/+$/, "");

// --- Ayarlar (env ile değiştirilebilir) ---
// Ölçü: site 7/24 ve dakikalar içinde haber giriyor. Günlük tavanlar okuyucuyu
// boğmayacak ama "bildirim hiç gelmiyor" demeyeceği kadar geniş tutulur:
// son dakika ~yarım saatte bir, konu bildirimi iki saatte bir.
const SON_MIN_ARALIK_DK = Number(process.env.BILDIRIM_SON_ARALIK_DK ?? 180);
const SON_MAX_GUN = Number(process.env.BILDIRIM_SON_MAX_GUN ?? 3);
const SON_TTL_SAAT = Number(process.env.BILDIRIM_SON_TTL_SAAT ?? 4);
// Konu bildirimleri: seçilen başlıklardan günde ~10 bildirim (dengeli dağılım).
// Konu bildirimleri: gün içine eşit dağıtılmış ~10-12 bildirim.
// 80 dk genel aralık ve sabah kotası sayesinde bildirimler tüm güne (08:00 - 23:00) dengeli yayılır.
const KAT_MIN_ARALIK_DK = Number(process.env.BILDIRIM_KAT_ARALIK_DK ?? 90);
const KAT_GENEL_ARALIK_DK = Number(process.env.BILDIRIM_KAT_GENEL_ARALIK_DK ?? 80);
const KAT_MAX_GUN = Number(process.env.BILDIRIM_KAT_MAX_GUN ?? 12);
// Taze sayılan pencere (8 saat): gün içindeki en iyi haberler akşam da gönderilebilsin.
const KAT_TTL_SAAT = Number(process.env.BILDIRIM_KAT_TTL_SAAT ?? 8);
// Tur başına en fazla kaç KATEGORİ işlenir (adil sıra).
const KAT_TUR_ADET = Number(process.env.BILDIRIM_KAT_TUR_ADET ?? 1);
// Tur başına gönderilecek en fazla HABER (taşma koruması; sonraki turda devam).
const KAT_TUR_HABER = Number(process.env.BILDIRIM_KAT_TUR_HABER ?? 1);
// Kimsenin takip etmediği (alıcısı 0 çıkan) kategori bu süre boyunca atlanır.
// Kısa tutulur: bir okuyucu o konuyu YENİ takip ettiyse ilk bildirimi saatlerce
// beklememeli. Boşta kalan kategori yalnızca saatte bir kez denenir.
const KAT_BOS_GERI_CEK_SAAT = Number(process.env.BILDIRIM_KAT_BOS_SAAT ?? 2);
const TOPLAM_MAX_GUN = Number(process.env.BILDIRIM_TOPLAM_MAX_GUN ?? 12);
// Özet bildirimi: "ozet" seçen okuyucuya günde 3 kez (TR 09/15/21).
const OZET_SAATLER = [9, 15, 21];
const OZET_ARALIK_SAAT = Number(process.env.BILDIRIM_OZET_ARALIK_SAAT ?? 4);
// Sessiz saat: yalnızca KONU bildirimleri için (Türkiye saati, UTC+3).
// Son dakika haberleri gece de gider; konu bildirimleri 01:00-07:00 arası susar.
const SESSIZ_BAS = Number(process.env.BILDIRIM_SESSIZ_BAS ?? 1);
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
 * - Proxy engelleyen veya 404 dönen host'lar (teimg.com vb.) için doğrudan orijinal URL kullanılır.
 */
function bildirimGorseli(src, width = 720, height = 360) {
  if (!src || !/^https?:\/\//i.test(src)) return "";
  const s = normalizeSrc(src);
  try {
    if (DIRECT_IMAGE_HOSTS.test(new URL(s).hostname)) return s;
  } catch {}
  const w = Math.round(width);
  const h = Math.round(height);
  return `https://wsrv.nl/haber.jpg?url=${encodeURIComponent(s)}&w=${w}&h=${h}&fit=cover&we&output=jpg&q=85`;
}

function bildirimIkonu(src) {
  if (!src || !/^https?:\/\//i.test(src)) return `${SITE_URL}/ikon-192.png`;
  const s = normalizeSrc(src);
  try {
    if (DIRECT_IMAGE_HOSTS.test(new URL(s).hostname)) return s;
  } catch {}
  return `https://wsrv.nl/ikon.jpg?url=${encodeURIComponent(s)}&w=192&h=192&fit=cover&we&output=jpg&q=85`;
}

/** Bildirimin tıklanınca gideceği adres + görsel + metin. */
function bildirimIcerigi(a, { baslik }) {
  const kapak = kapakKaynagi(a);
  const hamGorsel =
    kapak ||
    (a?.image &&
    /^https?:\/\//i.test(a.image) &&
    !/placeholder|no[-_]?image|default[-_/]?news|avatar/i.test(a.image)
      ? a.image
      : "");
  const gorsel = hamGorsel ? bildirimGorseli(hamGorsel, 720, 360) : `${SITE_URL}/og-default.png`;
  const ikon = hamGorsel ? bildirimIkonu(hamGorsel) : `${SITE_URL}/ikon-192.png`;
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
async function sayfaHazirMi(url, deneme = 5, aralikMs = 12000) {
  const anahtar = String(url || "");
  if (!anahtar) return false;
  if (canliOnbellek.has(anahtar)) return canliOnbellek.get(anahtar);
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
    } catch {
      // ağ/CDN hatası: kısa bekleyip yeniden dene
    }
    if (i < deneme - 1) {
      console.log(`  … haber sayfası henüz yayında değil, ${Math.round(aralikMs / 1000)} sn sonra tekrar deneniyor`);
      await bekle(aralikMs);
    }
  }
  canliOnbellek.set(anahtar, false);
  return false;
}

/**
 * OneSignal'e bir bildirim gönderir.
 * @param {{baslik:string,icerik:string,url:string,gorsel?:string,etiket?:string,ttl:number,anahtar:string}} p
 */
async function gonder(p) {
  if (!(await sayfaHazirMi(p.url))) {
    throw new Error(`hedef sayfa yayında değil (404/hazır değil): ${p.url}`);
  }
  // Marka logosu (tüm bildirimlerin solunda resmi HaberinAi logosu görünür)
  const logoIkon = `${SITE_URL}/ikon-192.png`;
  // Android durum çubuğu ve rozet için şeffaf zeminli beyaz silüet (gri kutu hatasını engeller)
  const badgeIkon = `${SITE_URL}/badge-96.png`;

  const govde = {
    app_id: APP_ID,
    target_channel: "push",
    headings: { tr: p.baslik, en: p.baslik },
    contents: { tr: p.icerik, en: p.icerik },
    url: p.url,
    chrome_web_icon: logoIkon,
    firefox_icon: logoIkon,
    large_icon: logoIkon,
    chrome_web_badge: badgeIkon,
    ttl: p.ttl,
    idempotency_key: uuidAnahtar(p.anahtar),
    web_push_topic: 'hb_' + uuidAnahtar(p.anahtar || p.url || Date.now()),
    android_group: 'haberinai_haberler',
  };

  // Büyük görsel (16:9): Chrome Masaüstü, Android ve iOS/Safari'de genişletilmiş görünüm için
  if (p.gorsel) {
    govde.chrome_web_image = p.gorsel;
    govde.big_picture = p.gorsel;
    govde.ios_attachments = { id1: p.gorsel };
  }

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

// --------------------------------------------------------------------------
// Ana akış
// --------------------------------------------------------------------------

/**
 * Bekleyen bildirimleri gönderir.
 * @param {{dry?: boolean}} [opts] dry=true → hiçbir istek gönderilmez, durum yazılmaz.
 */
export async function bildirimleriGonder({ dry = false } = {}) {
  if (!APP_ID || !REST_KEY) {
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

  const gonderilmis = new Set(durum.sent.map(String));
  const yeni = getArticles().filter((a) => a.id && !gonderilmis.has(String(a.id)));
  const gunToplam = (durum.gunSayi.son || 0) + (durum.gunSayi.kategori || 0);

  console.log(
    `Bildirim: ${yeni.length} yeni haber adayı, gün içinde gönderilen ` +
      `${gunToplam}/${TOPLAM_MAX_GUN} (son dakika ${durum.gunSayi.son || 0}/${SON_MAX_GUN}, ` +
      `konu ${durum.gunSayi.kategori || 0}/${KAT_MAX_GUN})${dry ? " [dry]" : ""}`
  );

  let sayilan = 0;
  // Gönderim olmasa da durum değişebilir (ör. "bu kategoride takipçi yok"
  // işareti). Eskiden durum dosyası yalnızca gönderim varsa yazılıyordu; bu
  // yüzden boş kategori işareti kayboluyor ve her turda yeniden deneniyordu.
  let durumDegisti = false;

  // ---- 0) HOŞ GELDİN / TEST BİLDİRİMİ ----
  // Neden var: okuyucu bildirim iznini verdiğinde HİÇBİR ŞEY görmezse "çalışmıyor"
  // sanır. Günlük tavan dolduğunda (son dakika 6 + konu 3) yeni aboneye saatlerce
  // bildirim gitmez; bu yüzden izni veren okuyucuya ilk anda bir kez "hoş geldin"
  // gönderilir. Günlük tavandan ve asgari aralıktan BAĞIMSIZDIR; yalnızca bir kez
  // çalışır (durum.hosGeldin). Elle test: BILDIRIM_TEST=1 (tavan yok sayılır).
  const test = process.env.BILDIRIM_TEST === "1";
  const uygulama = await uygulamaBilgi();
  const abone =
    uygulama && Number.isFinite(Number(uygulama.players)) ? Number(uygulama.players) : null;
  console.log(
    `Bildirim: abone sayısı: ${abone === null ? "okunamadı" : abone}${dry ? " [dry]" : ""}`
  );

  // Teşhis: iPhone/Safari web push kurulu mu? iPhone'da bildirim gelmiyorsa
  // sebep neredeyse her zaman budur (Apple platformu + APNs anahtarı tanımlı
  // değilse iOS aboneleri sessizce bildirim alamaz). Ayrıntı README'de.
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
      // "Hoş geldin" yalnızca gerçekten bir cihaza ulaştıysa bir kez gönderilmiş
      // sayılır. Abone yoksa / gönderim reddedildiyse işaret konmaz; cihaz
      // gerçekten abone olduğunda gönderilir. Böylece "izin verdim, hiç bildirim
      // gelmedi" durumu oluşmaz. (Örnek hata: {"id":"","errors":["All included
      // players are not subscribed"]} — kayıt var, abonelik yok.)
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
  // Global "hoş geldin" yalnızca BİR kez gider; sonradan abone olan cihaz
  // hiçbir şey görmez ve "bildirim çalışmıyor" sanır. Her YENİ cihaz bir kez
  // hedefli olarak karşılanır (OneSignal: include_subscription_ids).
  if (!dry) {
    const liste = await abonelikler();
    if (liste) {
      if (!durum.cihazTaban) {
        // İlk çalıştırma: mevcut aboneler geçmiş sayılır (toplu "hoş geldin"
        // yağmasın); bundan sonra abone olan her cihaz karşılanır.
        durum.cihazlar = liste;
        durum.cihazTaban = true;
        await durumYaz(durum);
        console.log(`Bildirim: cihaz tabanı kaydedildi (${liste.length} abone).`);
      } else {
        // Abonelikten çıkan cihazlar listeden düşer (yeniden abone olursa
        // tekrar karşılanır); liste sınırsız büyümez.
        const mevcut = new Set(liste);
        durum.cihazlar = (durum.cihazlar || []).filter((id) => mevcut.has(id));
        const bilinen = new Set(durum.cihazlar);
        const yeniler = liste.filter((id) => !bilinen.has(id)).slice(0, 5);
        for (const id of yeniler) {
          try {
            const yanit = await gonder({
              baslik: "🔔 Bildirimlerin açıldı",
              icerik:
                "Artık son dakika haberlerini alacaksın. Yeni bir gelişme olduğunda haber vereceğiz; istediğin an kapatabilirsin.",
              url: `${SITE_URL}/son-dakika/`,
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
  // Varsayılan olarak kullanıcılara seçmedikleri konulardan son dakika GİTMEZ.
  // Yalnızca profil/ayarlar üzerinden "Genel Son Dakika" anahtarını bilerek açanlara
  // günde en fazla SON_MAX_GUN (3) adet gider.
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
        .filter((a) => a.breaking === true && taze(a, SON_TTL_SAAT, now))
        .sort((a, b) => yayinZamani(b) - yayinZamani(a))[0];

      if (aday) {
        const icerik = bildirimIcerigi(aday, { baslik: "🔴 SON DAKİKA" });
        if (dry) {
          console.log(`  [dry] genel son dakika (yalnızca son_dakika_genel=1) → ${icerik.icerik}`);
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

  // ---- 2) TAKİP EDİLEN KONULAR (Sadece kullanıcının seçtiği başlıklar, günde ~10 adet) ----
  const sessiz =
    SESSIZ_BAS <= SESSIZ_BIT
      ? tr.saat >= SESSIZ_BAS && tr.saat < SESSIZ_BIT
      : tr.saat >= SESSIZ_BAS || tr.saat < SESSIZ_BIT;
  const sonKonuAt = durum.updatedAt ? Date.parse(durum.updatedAt) : 0;
  const konuGecenDk = sonKonuAt ? (now - sonKonuAt) / 60000 : Infinity;
  // Sabah saatlerinde (07:00 - 13:00) tüm günlük kotanın tükenmesini engelle
  // (Öğleden sonra ve akşam prime-time haberlerine mutlaka bildirim kalsın).
  const sabahMi = tr.saat < 13;
  const sabahTavan = Math.floor(KAT_MAX_GUN * 0.42); // örn: 12 kotanın en fazla 5'i sabahtan gidebilir

  if (sessiz) {
    console.log(`Bildirim: sessiz saat (TR ${tr.saat}:00) → konu bildirimi gönderilmiyor.`);
  } else if (sabahMi && (durum.gunSayi.kategori || 0) >= sabahTavan) {
    console.log(
      `Bildirim: sabah kotası (${durum.gunSayi.kategori}/${sabahTavan}) doldu; ` +
        `öğleden sonra ve akşam haberleri için bekletiliyor.`
    );
  } else if ((durum.gunSayi.kategori || 0) >= KAT_MAX_GUN) {
    console.log(`Bildirim: konu bildirimi için günlük tavan (${KAT_MAX_GUN}) doldu.`);
  } else if (konuGecenDk < KAT_GENEL_ARALIK_DK) {
    console.log(
      `Bildirim: son konu bildiriminden ${Math.round(konuGecenDk)} dk geçti ` +
        `(asgari ${KAT_GENEL_ARALIK_DK} dk); dengeli dağılım için bekletiliyor.`
    );
  } else {
    const gonderilenler = new Set(durum.sent.map(String));
    const grup = new Map();
    for (const a of yeni) {
      if (gonderilenler.has(String(a.id))) continue;
      if (!taze(a, KAT_TTL_SAAT, now)) continue;
      const k = a.categorySlug || "diger";
      if (!grup.has(k)) grup.set(k, []);
      grup.get(k).push(a);
    }
    for (const liste of grup.values()) {
      liste.sort((a, b) => yayinZamani(b) - yayinZamani(a));
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
          `(${grup.size} kategoride taze haber var, hepsi bekleme süresinde).`
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
          const icerik = bildirimIcerigi(aday, { baslik: `${aday.category}` });
          if (dry) {
            console.log(`  [dry] konu (${slug}) → ${icerik.icerik}`);
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
              `  ✓ [konu:${slug}] ${kisalt(aday.title, 60)}${yanit?.id ? ` (${yanit.id})` : ""}${aliciNotu(yanit)}`
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
  // Normal kullanıcılar günde ~10 bildirim alırken, ayarlardan `bildirim_mod = "hepsi"`
  // seçen kullanıcılara seçtikleri başlıklardaki diğer yeni haberler de anında iletilir.
  if (!sessiz) {
    const gonderilenlerHepsi = new Set(durum.sent.map(String));
    const adaylarHepsi = yeni
      .filter((a) => !gonderilenlerHepsi.has(String(a.id)) && taze(a, 2, now))
      .slice(0, 2);
    for (const aday of adaylarHepsi) {
      const slug = aday.categorySlug || "diger";
      const icerik = bildirimIcerigi(aday, { baslik: `${aday.category}` });
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
          ],
          anahtar: `kat-hepsi-${aday.id}`,
        });
        const alici = Number(yanit?.recipients);
        if (Number.isFinite(alici) && alici > 0) {
          console.log(
            `  ✓ [konu-hepsi:${slug}] ${kisalt(aday.title, 60)}${aliciNotu(yanit)}`
          );
          durum.sent.push(String(aday.id));
          durumDegisti = true;
          sayilan++;
        }
      } catch {
        // `bildirim_mod=hepsi` seçen abone yoksa sessizce geç.
      }
    }
  }

  // ---- 3) GÜNDE 3 ÖZET (yalnızca bildirim_sikligi=ozet) ----
  // "Anında" seçen her konuyu alır; "özet" seçen günde 3 kez toplu özet alır.
  // Aynı saat diliminde yinelenen gönderimi önlemek için son özetten en az
  // OZET_ARALIK_SAAT saat geçmiş olmalı.
  const ozetSaati = OZET_SAATLER.indexOf(tr.saat) >= 0 && tr.dakika < 12;
  const sonOzet = durum.sonOzet ? Date.parse(durum.sonOzet) : 0;
  const ozetGecti = !sonOzet || now - sonOzet >= OZET_ARALIK_SAAT * 3600000;
  if (ozetSaati && ozetGecti) {
    const ozetAday = getArticles()
      .filter((a) => a.title && taze(a, 18, now))
      .sort((a, b) => yayinZamani(b) - yayinZamani(a))
      .slice(0, 3);
    if (ozetAday.length) {
      const ilk = ozetAday[0];
      const kapak = kapakKaynagi(ilk);
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
            gorsel: kapak ? bildirimGorseli(kapak, 720, 360) : `${SITE_URL}/og-default.png`,
            ikon: kapak ? bildirimIkonu(kapak) : `${SITE_URL}/ikon-192.png`,
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
    sonDakikaAdayi: yeni.filter((a) => a.breaking === true && taze(a, SON_TTL_SAAT, now)).length,
    konuAdayi: yeni.filter((a) => taze(a, KAT_TTL_SAAT, now)).length,
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
