// ==========================================================================
// GÖRSEL AJANI — haber başlığına ve içeriğine göre kapak fotoğrafı seçer
// --------------------------------------------------------------------------
// NEDEN: Eski akış "kaynak sitenin og:image'i" ya da "dosya adı sorguyla
// eşleşen ilk Commons karesi" mantığıyla çalışıyordu. Sonuç: ShiftDelete'in
// kendi haber kartı, alakasız bir stok kare veya rastgele bir ürün fotoğrafı.
//
// NE YAPAR: Her haber için gerçek bir görsel editör gibi düşünür:
//   1) BRİF      — AI, haberin tek karede ne anlatması gerektiğini çıkarır
//                  ("15 yaş altı sosyal medya yasağı" → elinde telefon tutan genç).
//   2) ADAYLAR   — Wikimedia Commons + Openverse (CC0/CC BY/CC BY-SA). Kaynak
//                  sitenin kendi fotoğrafı aday yapılmaz: ajans telifli
//                  olabiliyor ve kullanıcının şikâyet ettiği "haber kartı"
//                  sorununun kaynağıydı. Yalnızca mevcut kapak karşılaştırılır.
//   3) GÖZ KONTROLÜ — AI, aday görselleri GERÇEKTEN görür; başlıkla alakayı,
//                  tıklanabilirliği ve "metin/logo/kolaj" gibi kusurları puanlar.
//   4) ÜRETİM    — Hiçbir aday yetmezse (ör. "optik form + yapay zeka" gibi
//                  stokta bulunmayan konseptler) Cloudflare Workers AI ile
//                  16:9 editoryal görsel üretir ve yine göz kontrolünden geçirir.
//   5) KIRP/KAYDET — 1280×720 WebP + 480 px kart + 1200×630 sosyal JPEG.
//
// TELİF: Arama sonuçlarında yalnızca serbest lisanslı dosyalar kabul edilir;
// fotoğrafçı, lisans ve dosya sayfası `gorselKaynak` alanına yazılır. AI
// üretiminde `kapak.ai=true` işaretlenir ve sitede "AI görsel" rozeti çıkar.
//
// KULLANIM: `npm run gorsel-ajan` (bkz. scripts/gorsel-ajan.mjs).
// ==========================================================================
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { config } from "./config.js";
import { gorselBrifi, gorselBrifiYedek } from "./ai.js";
import { geminiAnahtarlari } from "./gemini-anahtar.js";

const UA = "HaberinAi/1.0 (+https://haberinai.site; gorsel ajan)";
const COMMONS = "https://commons.wikimedia.org/w/api.php";
const OPENVERSE = "https://api.openverse.org/v1/images/";
const SITE = (process.env.SITE_URL || "https://haberinai.site").replace(/\/+$/, "");

const GENISLIK = 1280;
const YUKSEKLIK = 720;
const KUCUK_GENISLIK = 480;
const SOSYAL_GENISLIK = 1200;
const SOSYAL_YUKSEKLIK = 630;

// Kapak olarak kabul edilen en düşük görsel kalitesi.
const MIN_W = 700;
const MIN_H = 350;
const MIN_ORAN = 1.15;
const MAX_ORAN = 2.8;

// Bu çalıştırmada günlük kotası dolan Gemini model+anahtar çiftleri; tekrar denenmez.
const visionTukendi = new Set();

// Yalnızca serbest lisanslar. GFDL, fair use, non-free kabul edilmez.
const IZINLI_LISANS =
  /^(cc0\b|public domain\b|pd\b|pd[- ].*|no restrictions\b|cc by(-sa)?[ -]?\d)/i;

/** Arşivdeki Türkçe lisans adlarını da kabul et ("Kamu malı"). */
function lisansUygun(lisans) {
  const s = String(lisans || "").trim();
  return IZINLI_LISANS.test(s) || /^kamu mal[ıi]$/i.test(s);
}

// Fotoğraf olmayan / kapak olarak kötü duran dosyalar.
const KOTU_BASLIK =
  /\b(logo|logos|map|maps|diagram|chart|graph|poster|cover|screenshot|screen shot|scan|scanned|icon|flag|coat of arms|seal|banknote|stamp|coin|signature|drawing|cartoon|clipart|svg|pdf|document|table|infographic|wikimedia|commons|wikidata|menu|display|thumbnail|unnamed|untitled|placeholder|no image|no photo|policies|policy brief|press release|art project|painting|portrait of|signature)\b/i;

// Eski/tarama görselleri haber sayfasında dikkat çekici durmaz.
const ESKI_GORSEL =
  /(black and white|monochrome|archival|historical|engraving|lithograph|fortepan|wellcome|bundesarchiv|nationaal archief|\b18\d\d\b|\b19[0-7]\d\b)/i;

// URL'de logo/ikon/yer tutucu izi.
const URL_COP =
  /(logo|favicon|sprite|avatar|gravatar|placeholder|no[-_]?image|default[-_/]?(image|img|thumb)|watermark|share[-_]?(icon|default)|icon[-_/]|[-_/]icon|1x1|pixel\.(gif|png)|blank\.(gif|png)|transparent\.(gif|png)|habergorseli|son-?dakika\.jpe?g|preferred_source|adserve\.|app-download)/i;

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

function duzMetin(value, max = 160) {
  return String(value || "")
    .replace(/<span[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/span>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function yazarTemizle(value) {
  let s = duzMetin(value, 120);
  if (!s) return "";
  const p = s.split(" ");
  if (p.length % 2 === 0) {
    const yari = p.length / 2;
    if (p.slice(0, yari).join(" ") === p.slice(yari).join(" ")) s = p.slice(0, yari).join(" ");
  }
  s = s.replace(/[,;:.\-\s]+$/, "").trim();
  if (!s || /^(unknown( author)?|anonymous|wikimedia commons|commons)$/i.test(s)) return "";
  return s.length > 70 ? `${s.slice(0, 67).trimEnd()}…` : s;
}

function lisansAdi(value) {
  const s = duzMetin(value, 40);
  if (!s) return "";
  if (/^cc0/i.test(s)) return "CC0";
  if (/^public domain|^pd\b/i.test(s)) return "Kamu malı";
  const m = /^cc[ -]?by([ -]?sa)?[ -]?(\d(?:\.\d)?)/i.exec(s);
  return m ? `CC BY${m[1] ? "-SA" : ""} ${m[2]}` : s;
}

/** Aynı fotoğrafın farklı boyut sürümlerini eşleştirmek için kimlik. */
export function kimlik(url) {
  let s = String(url || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    const ic = u.searchParams.get("u") || u.searchParams.get("url");
    if (ic) s = decodeURIComponent(ic);
  } catch {}
  return s
    .toLowerCase()
    .split("?")[0]
    .split("#")[0]
    .replace(/\/thumb\/([0-9a-f]\/[0-9a-f]{2}\/[^/]+)\/\d+px-[^/]+$/, "/$1")
    .replace(/\/resize\/\d+x\d+\//, "/")
    .replace(/\/\d{2,4}x\d{2,4}\//, "/")
    .replace(/-\d{2,4}x\d{2,4}(?=\.\w+$)/, "")
    .replace(/\.(jpe?g|png|webp|avif|gif)$/, "");
}

function oranUygun(w, h) {
  if (!w || !h) return false;
  const o = w / h;
  return o >= MIN_ORAN && o <= MAX_ORAN;
}

/** HTTP isteği: 429/5xx'te bir kez bekleyip tekrar dener. */
async function istek(url, options = {}, deneme = 2) {
  for (let i = 0; i < deneme; i++) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(options.timeout || 20000),
      });
      if ((res.status === 429 || res.status >= 500) && i < deneme - 1) {
        await bekle(1500 + i * 1500);
        continue;
      }
      return res;
    } catch (err) {
      if (i >= deneme - 1) throw err;
      await bekle(1200);
    }
  }
  return null;
}

// ---------------------------------------------------------------- arama
/** Wikimedia Commons'ta serbest lisanslı, büyük ve yatay adaylar. */
export async function commonsAdaylari(sorgu, limit = 8) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: String(Math.max(1, limit)),
    gsrsearch: `${sorgu} filetype:bitmap`,
    prop: "imageinfo|categories",
    cllimit: "max",
    iiprop: "url|size|extmetadata",
    iiextmetadatafilter: "LicenseShortName|Artist|LicenseUrl|Credit|ImageDescription",
    iiurlwidth: "1600",
  });
  const res = await istek(`${COMMONS}?${params}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    timeout: 15000,
  });
  if (!res || !res.ok) return [];
  const json = await res.json();
  const sayfalar = json?.query?.pages || [];
  return (Array.isArray(sayfalar) ? sayfalar : Object.values(sayfalar))
    .map((s) => commonsAday(s, sorgu))
    .filter(Boolean);
}

function commonsAday(sayfa, sorgu) {
  const ii = sayfa?.imageinfo?.[0];
  if (!ii) return null;
  const baslik = String(sayfa.title || "").replace(/^File:/i, "");
  if (!/\.(jpe?g|png|webp)$/i.test(baslik)) return null;
  if (KOTU_BASLIK.test(baslik) || ESKI_GORSEL.test(baslik)) return null;

  const w = Number(ii.width) || 0;
  const h = Number(ii.height) || 0;
  if (w < MIN_W || h < MIN_H || !oranUygun(w, h)) return null;

  const meta = ii.extmetadata || {};
  const hamLisans = meta.LicenseShortName?.value;
  if (!hamLisans || !IZINLI_LISANS.test(duzMetin(hamLisans, 60))) return null;
  if (/^pd[\s-]?art/i.test(duzMetin(hamLisans, 60))) return null;

  const url = String(ii.thumburl || ii.url || "").split("?")[0];
  if (!/^https:\/\/(upload|thumb)\.wikimedia\.org\//i.test(url)) return null;

  const yazar = yazarTemizle(meta.Artist?.value) || yazarTemizle(meta.Credit?.value);
  const aciklama = duzMetin(meta.ImageDescription?.value, 500);
  return {
    url,
    kaynak: "commons",
    sayfa: ii.descriptionurl || "",
    yazar,
    lisans: lisansAdi(hamLisans),
    lisansUrl: duzMetin(meta.LicenseUrl?.value, 200),
    genislik: w,
    yukseklik: h,
    baslik,
    metin: `${baslik} ${aciklama} ${sorgu}`,
  };
}

/**
 * Haberin `gorselKaynak.sayfa` alanındaki Commons dosyasını aday yapar.
 * Arşivde zaten serbest lisanslı bir fotoğraf varsa onu yeniden keşfetmek
 * yerine doğrudan değerlendiririz.
 */
export async function commonsDosyaAdayi(sayfa) {
  const m = /\/wiki\/(File:.+)$/i.exec(String(sayfa || ""));
  if (!m) return null;
  const baslik = decodeURIComponent(m[1]).replace(/_/g, " ");
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    titles: baslik,
    prop: "imageinfo|categories",
    cllimit: "max",
    iiprop: "url|size|extmetadata",
    iiextmetadatafilter: "LicenseShortName|Artist|LicenseUrl|Credit|ImageDescription",
    iiurlwidth: "1600",
  });
  const res = await istek(`${COMMONS}?${params}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    timeout: 15000,
  });
  if (!res || !res.ok) return null;
  const json = await res.json();
  const sayfalar = json?.query?.pages || [];
  const s = (Array.isArray(sayfalar) ? sayfalar : Object.values(sayfalar))[0];
  return s ? commonsAday(s, "arşiv") : null;
}

/** Openverse: Commons dışında CC0/CC BY/CC BY-SA fotoğraf havuzu. */
export async function openverseAdaylari(sorgu, limit = 8) {
  const params = new URLSearchParams({
    q: sorgu,
    license: "cc0,by,by-sa",
    size: "large",
    aspect_ratio: "wide",
    mature: "false",
    page_size: String(Math.max(1, limit)),
  });
  const res = await istek(`${OPENVERSE}?${params}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    timeout: 18000,
  });
  if (!res || !res.ok) return [];
  const json = await res.json();
  return (Array.isArray(json?.results) ? json.results : [])
    .map((r) => openverseAday(r, sorgu))
    .filter(Boolean);
}

function openverseAday(r, sorgu) {
  const w = Number(r.width) || 0;
  const h = Number(r.height) || 0;
  if (w < MIN_W || h < MIN_H || !oranUygun(w, h)) return null;
  if (r.mature) return null;
  const url = String(r.url || "");
  if (!/^https?:\/\//i.test(url) || URL_COP.test(url)) return null;
  const tip = String(r.filetype || "").toLowerCase();
  if (tip && !/^(jpe?g|png|webp)$/.test(tip)) return null;
  const baslik = duzMetin(r.title || "", 140);
  if (baslik && KOTU_BASLIK.test(baslik)) return null;
  const etiketler = (Array.isArray(r.tags) ? r.tags : []).map((t) => t?.name).filter(Boolean);
  const hamLisans = String(r.license || "").toLowerCase();
  // Sunucu filtresine ek olarak istemcide de doğrula: NC/ND asla kapak olmaz.
  if (!/^(cc0|by|by-sa)$/.test(hamLisans)) return null;
  const lisans = /^cc0/.test(hamLisans)
    ? "CC0"
    : lisansAdi(`cc ${hamLisans}${r.license_version ? ` ${r.license_version}` : ""}`);
  return {
    url,
    kaynak: "openverse",
    sayfa: r.foreign_landing_url || r.detail_url || url,
    yazar: duzMetin(r.creator || "", 100),
    lisans,
    lisansUrl: r.license_url || "",
    genislik: w,
    yukseklik: h,
    baslik,
    metin: `${baslik} ${etiketler.join(" ")} ${sorgu}`,
  };
}

// ------------------------------------------------------- indirme / ölçüm
export async function gorselIndir(url, { kok = process.cwd() } = {}) {
  const s = String(url || "").trim();
  if (!s) return null;
  if (s.startsWith("/")) {
    const dosya = path.join(kok, "site", "public", ...s.split("/").filter(Boolean));
    if (!fs.existsSync(dosya)) return null;
    return fs.readFileSync(dosya);
  }
  if (!/^https?:\/\//i.test(s)) return null;
  const res = await istek(s, {
    headers: {
      "User-Agent": UA,
      Accept: "image/avif,image/webp,image/jpeg,image/png,*/*;q=0.8",
    },
    redirect: "follow",
    timeout: 25000,
  });
  if (!res || !res.ok) return null;
  const tip = String(res.headers.get("content-type") || "").toLowerCase();
  if (tip && !/^image\//.test(tip)) return null;
  if (/svg/.test(tip)) return null;
  const boy = Number(res.headers.get("content-length") || 0);
  if (boy > 18 * 1024 * 1024) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 8 * 1024 || buf.length > 20 * 1024 * 1024) return null;
  return buf;
}

/**
 * Görselin kapak olarak ne kadar iyi göründüğünü 0-100 puanlar.
 * Düz/beyaz/loş kareler, yayıncı başlık plakaları ve kolajlar elenir.
 */
export async function gorselPuani(veri, bilgi) {
  const w = Number(bilgi?.width) || 0;
  const h = Number(bilgi?.height) || 0;
  if (w < MIN_W || h < MIN_H) return null;
  try {
    const { data, info } = await sharp(veri)
      .resize(180, 180, { fit: "inside" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const adim = info.channels;
    let toplam = 0;
    let kare = 0;
    let doygun = 0;
    let beyaz = 0;
    let siyah = 0;
    let adet = 0;
    for (let i = 0; i + 2 < data.length; i += adim) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const p = 0.299 * r + 0.587 * g + 0.114 * b;
      toplam += p;
      kare += p * p;
      if (r >= 238 && g >= 238 && b >= 238) beyaz++;
      if (r <= 18 && g <= 18 && b <= 18) siyah++;
      const en = Math.max(r, g, b);
      const az = Math.min(r, g, b);
      if (en > 8) doygun += (en - az) / en;
      adet++;
    }
    if (!adet) return null;
    const ort = toplam / adet;
    const std = Math.sqrt(Math.max(0, kare / adet - ort * ort));
    const doy = doygun / adet;
    if (std < 9 || (std < 14 && doy < 0.03)) return null;
    if (beyaz / adet > 0.42 || siyah / adet > 0.68) return null;

    const sinir = (x) => Math.max(0, Math.min(1, x));
    const detay = sinir((std - 14) / 42);
    const parlak = sinir(1 - Math.abs(ort - 118) / 105);
    const cozunurluk = sinir(Math.min(w, h) / 900);
    const hedef = GENISLIK / YUKSEKLIK;
    const oran = Math.sqrt(Math.min(w / h, hedef) / Math.max(w / h, hedef));
    const renk = sinir(1 - Math.abs(doy - 0.32) / 0.34);
    return 100 * (0.33 * detay + 0.22 * parlak + 0.18 * cozunurluk + 0.15 * oran + 0.12 * renk);
  } catch {
    return null;
  }
}

/** Yayıncıların başlık bastığı kırmızı/beyaz paylaşım kartlarını yakalar. */
export async function metinKartiMi(veri) {
  try {
    const { data, info } = await sharp(veri)
      .resize(200, 200, { fit: "inside" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width: w, height: h, channels: ch } = info;
    let plakaSatir = 0;
    let beyazSatir = 0;
    for (let y = 0; y < h; y++) {
      let kirmizi = 0;
      let beyaz = 0;
      let gecis = 0;
      let onceki = 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * ch;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const beyazMi = r >= 238 && g >= 238 && b >= 238;
        const kirmiziMi = r >= 140 && r - g >= 60 && r - b >= 50;
        if (beyazMi) {
          beyaz++;
          if (onceki === 1) gecis++;
          onceki = 2;
        } else if (kirmiziMi) {
          kirmizi++;
          if (onceki === 2) gecis++;
          onceki = 1;
        } else onceki = 0;
      }
      if (kirmizi / w >= 0.25 && gecis >= 4) {
        plakaSatir++;
        if (beyaz / w >= 0.03) beyazSatir++;
      }
    }
    return (plakaSatir / h) * 100 >= 8 && beyazSatir / h >= 0.04;
  } catch {
    return false;
  }
}

// --------------------------------------------------------------- görüntü
/** Vision için küçük JPEG (base64) hazırlar. */
async function visionVerisi(veri) {
  try {
    const buf = await sharp(veri)
      .resize(640, 640, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();
    return buf.toString("base64");
  } catch {
    return null;
  }
}

const VISION_ISTEM = (article, brief, adet) => `Sen haberinai'nin görsel editörüsün. Aşağıdaki ${adet} aday görselden, verilen haber için EN İYİ kapak fotoğrafını seçeceksin.

HABER BAŞLIĞI: ${article.title}
HABER ÖZETİ: ${String(article.summary || "").slice(0, 450)}
İDEAL SAHNE: ${brief.sahne}
KAÇINILACAKLAR: ${(brief.kacin || []).join(", ") || "logo, metin, kolaj, alakasız manzara"}

Her aday için şu ölçütlerle 0-100 puan ver:
- alaka: Görsel, haberin ana konusunu doğrudan anlatıyor mu? (En önemli ölçüt.) Genel bir
  "teknoloji/veri/iş dünyası" havası yeterli değil; haberin öznesi (şirket, ürün, olay, kişi)
  karede tanınmalı ya da somut bir karşılığı olmalı. Doğrudan anlatmıyorsa alaka 50'yi GEÇMEMELİ.
- dikkat: Bir okuyucu akışta bu kareye tıklamak ister mi? İnsan yüzü, eylem, duygu, net odak.
- kalite: Kompozisyon, ışık, netlik. Üzerinde yazı/logo/watermark, kolaj, ekran görüntüsü, harita, uydu görüntüsü, aşırı eski siyah-beyaz arşiv varsa düşük puan.
- uygun: Görsel haberle ilgisiz, yanıltıcı, rahatsız edici (kan/ceset), müstehcen veya tamamen boşsa false.
  Üzerinde filigran, bozuk/okunmaz yazı, çerçeve ya da kolaj varsa da false.

KURALLAR:
- Sadece "güzel" olduğu için alakasız kareyi seçme. Alaka, güzellikten önce gelir.
- Haber bir yasak/karar/istatistik haberi olsa bile kare somut bir insan veya nesne göstermeli.
- Yayıncının başlık bastığı kart, logo, metin ağırlıklı görsel ve kolaj kesinlikle seçilmez.
- "Kısmen temsil ediyor", "genel atmosferi veriyor" gibi gerekçeler alaka için yeterli değildir.
- Emin değilsen uygun=false ver; yanlış fotoğraf boş karttan daha çok güven kaybettirir.

Yanıt SADECE şu JSON olsun:
{"adaylar":[{"i":1,"alaka":0,"dikkat":0,"kalite":0,"uygun":true,"neden":"kısa Türkçe gerekçe"}],"secim":1}`;

/** AI yanıtından JSON ayıklar: ```json çiti, baştaki/sondaki prose toleranslı. */
function jsonAyikla(metin) {
  const s = String(metin || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    const m = /\{[\s\S]*\}/.exec(s);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

/** Gemini ile adayları tek istekte görür ve puanlar. */
async function geminiVision(adaylar, article, brief, sayac, debug = false) {
  // Birden çok anahtar sırayla denenir; model başına günlük kotayı anahtar
  // havuzu çarpar. Anahtar numarası loglanır, anahtarın kendisi asla.
  const anahtarlar = geminiAnahtarlari();
  if (!anahtarlar.length) return null;
  const parcalar = [{ text: VISION_ISTEM(article, brief, adaylar.length) }];
  for (const [i, aday] of adaylar.entries()) {
    const b64 = await visionVerisi(aday.veri);
    if (!b64) continue;
    parcalar.push({ text: `ADAY ${i + 1}` });
    parcalar.push({ inline_data: { mime_type: "image/jpeg", data: b64 } });
  }
  if (parcalar.length < 3) return null;

  for (const model of config.ai.geminiModels) {
    for (const [ki, key] of anahtarlar.entries()) {
      const etiket = `${model}#${ki + 1}`;
      if (visionTukendi.has(etiket)) continue;
      if (sayac && !sayac.izinVar()) return null;
      try {
        sayac?.artir();
        const res = await istek(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: parcalar }],
              generationConfig: {
                temperature: 0.15,
                maxOutputTokens: 2400,
                responseMimeType: "application/json",
              },
            }),
            timeout: 60000,
          },
          1
        );
        if (!res || !res.ok) {
          if (debug) {
            console.log(
              `      Gemini vision ${model} (#${ki + 1}): HTTP ${res?.status || "ağ hatası"}`
            );
          }
          // Günlük kota (429) veya geçersiz anahtar (400/403): bu çifti bırak.
          if (res?.status === 429 || res?.status === 400 || res?.status === 403) {
            visionTukendi.add(etiket);
          }
          continue;
        }
        const json = await res.json();
        const metin = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const veri = jsonAyikla(metin);
        if (!veri) {
          if (debug) {
            console.log(
              `      Gemini vision ${model} (#${ki + 1}): JSON çözümlenemedi ` +
                `"${String(metin).replace(/\s+/g, " ").slice(0, 160)}"`
            );
          }
          continue;
        }
        const liste = Array.isArray(veri?.adaylar) ? veri.adaylar : [];
        return liste
          .map((x) => {
            const i = Number(x?.i) - 1;
            if (!Number.isInteger(i) || i < 0 || i >= adaylar.length) return null;
            const alaka = Math.max(0, Math.min(100, Number(x.alaka) || 0));
            const dikkat = Math.max(0, Math.min(100, Number(x.dikkat) || 0));
            const kalite = Math.max(0, Math.min(100, Number(x.kalite) || 0));
            return {
              i,
              alaka,
              dikkat,
              kalite,
              uygun: x.uygun !== false,
              neden: duzMetin(x.neden, 160),
              skor: 0.55 * alaka + 0.3 * dikkat + 0.15 * kalite,
            };
          })
          .filter(Boolean);
      } catch {
        // Sıradaki model/anahtar.
      }
    }
  }
  return null;
}

/** Cloudflare vision tek görseli değerlendirir; bu yüzden ayrı ve sade istem. */
const VISION_TEK_ISTEM = (article, brief) => `Sen haberinai'nin görsel editörüsün. Aşağıdaki TEK aday görselin, verilen haber için kapak fotoğrafı olarak uygunluğunu puanla.

HABER BAŞLIĞI: ${article.title}
HABER ÖZETİ: ${String(article.summary || "").slice(0, 450)}
İDEAL SAHNE: ${brief.sahne}
KAÇINILACAKLAR: ${(brief.kacin || []).join(", ") || "logo, metin, kolaj, alakasız manzara"}

Ölçütler (her biri 0-100):
- alaka: Görsel haberin ana konusunu doğrudan anlatıyor mu? (En önemli ölçüt.) Genel bir
  "teknoloji/veri/iş dünyası" havası yeterli değil; haberin öznesi karede tanınmalı ya da
  somut bir karşılığı olmalı. Doğrudan anlatmıyorsa alaka 50'yi GEÇMEMELİ.
- dikkat: Okuyucu akışta bu kareye tıklamak ister mi? İnsan yüzü, eylem, duygu, net odak.
- kalite: Kompozisyon, ışık, netlik. Üzerinde yazı/logo/watermark, kolaj, ekran görüntüsü, harita, uydu görüntüsü, aşırı eski siyah-beyaz arşiv varsa düşük puan.
- uygun: Görsel haberle ilgisiz, yanıltıcı, rahatsız edici (kan/ceset), müstehcen veya tamamen boşsa false.
  Üzerinde filigran, bozuk/okunmaz yazı, çerçeve ya da kolaj varsa da false.

KURALLAR:
- Sadece "güzel" olduğu için alakasız kareyi yükseltme. Alaka, güzellikten önce gelir.
- "Kısmen temsil ediyor", "genel atmosferi veriyor" gibi gerekçeler alaka için yeterli değildir.
- Yayıncının başlık bastığı kart, logo, metin ağırlıklı görsel ve kolaj kesinlikle uygun değildir.
- Emin değilsen uygun=false ver; yanlış fotoğraf boş karttan daha çok güven kaybettirir.

Yanıt SADECE şu JSON olsun:
{"alaka":0,"dikkat":0,"kalite":0,"uygun":true,"neden":"kısa Türkçe gerekçe"}`;

/** Gemini yoksa Cloudflare Workers AI vision (görsel başına tek istek). */
async function cloudflareVision(adaylar, article, brief, sayac, debug = false) {
  const acc = process.env.CLOUDFLARE_ACCOUNT_ID;
  const tok = process.env.CLOUDFLARE_API_TOKEN;
  if (!acc || !tok) return null;
  const model = process.env.CLOUDFLARE_VISION_MODEL || "@cf/meta/llama-3.2-11b-vision-instruct";
  const sonuc = [];
  for (const [i, aday] of adaylar.entries()) {
    if (sayac && !sayac.izinVar()) break;
    const b64 = await visionVerisi(aday.veri);
    if (!b64) continue;
    const istem = VISION_TEK_ISTEM(article, brief);
    try {
      sayac?.artir();
      const res = await istek(
        `https://api.cloudflare.com/client/v4/accounts/${acc}/ai/run/${model}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: istem },
                  { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
                ],
              },
            ],
            max_tokens: 300,
          }),
          timeout: 45000,
        },
        1
      );
      if (!res || !res.ok) {
        if (debug) {
          let ayrinti = "";
          try {
            const hata = await res.json();
            ayrinti = hata?.errors?.[0]?.message || hata?.error || "";
          } catch {
            // Gövde okunamadı.
          }
          console.log(
            `      Cloudflare vision ${model}: HTTP ${res?.status || "ağ hatası"} ${String(ayrinti).slice(0, 140)}`
          );
        }
        continue;
      }
      const json = await res.json();
      const metin = json?.result?.response || json?.result?.description || "";
      const veri = jsonAyikla(metin);
      if (!veri) {
        if (debug) {
          console.log(
            `      Cloudflare vision ${model}: JSON çözümlenemedi "${String(metin).slice(0, 120)}"`
          );
        }
        continue;
      }
      const alaka = Math.max(0, Math.min(100, Number(veri.alaka) || 0));
      const dikkat = Math.max(0, Math.min(100, Number(veri.dikkat) || 0));
      const kalite = Math.max(0, Math.min(100, Number(veri.kalite) || 0));
      sonuc.push({
        i,
        alaka,
        dikkat,
        kalite,
        uygun: veri.uygun !== false,
        neden: duzMetin(veri.neden, 160),
        skor: 0.55 * alaka + 0.3 * dikkat + 0.15 * kalite,
      });
    } catch {
      // Sıradaki aday.
    }
  }
  return sonuc.length ? sonuc : null;
}

/**
 * Adayları AI'ya gösterir. Hiçbir sağlayıcı yoksa null döner; çağıran taraf
 * bu durumda kapak DEĞİŞTİRMEZ (denetlenmemiş kare seçilmez).
 */
export async function visionSkorla(adaylar, article, brief, sayac, debug = false) {
  if (!adaylar.length) return null;
  const sonuc = (await geminiVision(adaylar, article, brief, sayac, debug)) ||
    (await cloudflareVision(adaylar, article, brief, sayac, debug));
  return sonuc;
}

// ------------------------------------------------------------- üretim
/** Cloudflare Workers AI / Pollinations ile 16:9 editoryal görsel üretir. */
export async function gorselUret(prompt, sayac, { debug = false } = {}) {
  const temiz = String(prompt || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
  if (!temiz) return null;
  const sonPrompt = `${temiz} No text, no words, no letters, no numbers, no logos, no watermark, no collage, no split screen, no border.`;

  const acc = process.env.CLOUDFLARE_ACCOUNT_ID;
  const tok = process.env.CLOUDFLARE_API_TOKEN;
  if (acc && tok) {
    const modeller = [
      "@cf/black-forest-labs/flux-1-schnell",
      "@cf/leonardo/phoenix-1.0",
      "@cf/leonardo/lucid-origin",
    ];
    for (const model of modeller) {
      if (sayac && !sayac.izinVar()) return null;
      try {
        sayac?.artir();
        const govde = model.includes("flux-1-schnell")
          ? { prompt: sonPrompt }
          : { prompt: sonPrompt, width: GENISLIK, height: YUKSEKLIK };
        const res = await istek(
          `https://api.cloudflare.com/client/v4/accounts/${acc}/ai/run/${model}`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
            body: JSON.stringify(govde),
            timeout: 60000,
          },
          1
        );
        if (!res || !res.ok) {
          if (debug) console.log(`      AI üretim ${model}: HTTP ${res?.status || "ağ hatası"}`);
          continue;
        }
        const ct = String(res.headers.get("content-type") || "");
        let buf = null;
        if (ct.startsWith("image/")) buf = Buffer.from(await res.arrayBuffer());
        else {
          const json = await res.json();
          if (json?.result?.image) buf = Buffer.from(json.result.image, "base64");
        }
        if (buf && buf.length > 12000) return { veri: buf, model: model.split("/").pop() };
        if (debug) console.log(`      AI üretim ${model}: görsel dönmedi`);
      } catch (err) {
        if (debug) console.log(`      AI üretim ${model} hata: ${err.message}`);
      }
    }
  } else if (debug) {
    console.log("      AI üretim: Cloudflare anahtarı yok");
  }

  // Ücretsiz yedek: Pollinations. Varsayılan kapalı; servis sık sık 503 veriyor.
  if (process.env.GORSEL_POLLINATIONS === "1" && (!sayac || sayac.izinVar())) {
    try {
      sayac?.artir();
      const url =
        "https://image.pollinations.ai/prompt/" +
        encodeURIComponent(sonPrompt) +
        `?width=${GENISLIK}&height=${YUKSEKLIK}&nologo=true&model=flux&seed=${Math.floor(Math.random() * 1e6)}`;
      const res = await istek(url, { timeout: 70000 }, 1);
      if (res?.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 12000) return { veri: buf, model: "pollinations-flux" };
      } else if (debug) {
        console.log(`      Pollinations: HTTP ${res?.status || "ağ hatası"}`);
      }
    } catch (err) {
      if (debug) console.log(`      Pollinations hata: ${err.message}`);
    }
  }
  return null;
}

// ------------------------------------------------------------- aday havuzu
function adayEkle(havuz, aday, { kullanilan, mevcutKimlik } = {}) {
  if (!aday?.url) return;
  if (URL_COP.test(aday.url)) return;
  const k = kimlik(aday.url);
  if (!k) return;
  if (kullanilan?.has(k) && k !== mevcutKimlik) return;
  if (havuz.some((x) => kimlik(x.url) === k)) return;
  havuz.push(aday);
}

/**
 * Haber için aday görselleri toplar: Commons + Openverse.
 * Sorgular sırayla denenir; ağ hataları sessizce atlanır.
 *
 * Kaynak sitenin kendi fotoğrafları (og:image, gövde görselleri) BİLİNÇLİ olarak
 * aday yapılmaz: hem ajans telifli olabiliyorlar hem de kullanıcının şikâyet
 * ettiği "ShiftDelete'in kendi kartı" sorununun kaynağıydılar. Yalnızca mevcut
 * kapak (varsa) karşılaştırma için havuza girer; o da yeni seçim değildir.
 */
export async function adaylariTopla(article, brief, { kullanilan = new Set(), mevcutUrl = "", debug = false } = {}) {
  const havuz = [];
  const mevcutKimlik = kimlik(mevcutUrl);
  const sorgular = [
    ...new Set(
      [
        ...(brief.sorgular || []),
        article.gorselSorgu,
        ...(Array.isArray(article.tags) ? article.tags.slice(0, 1) : []),
      ]
        .map((s) => String(s || "").replace(/[^\p{L}\p{N}\s-]+/gu, " ").replace(/\s+/g, " ").trim())
        .filter((s) => s.length >= 3)
    ),
  ].slice(0, 4);

  // 0) Mevcut kapak: yeni adayların ondan gerçekten daha iyi olup olmadığını
  //    anlamak için havuza girer. Tasarım kartı (foto=false) hariç tutulur.
  if (mevcutUrl && article.kapak?.foto !== false) {
    adayEkle(
      havuz,
      { url: mevcutUrl, kaynak: "mevcut", mevcut: true, baslik: "Mevcut kapak" },
      { kullanilan, mevcutKimlik }
    );
  }

  // 1) Kaynak sitenin kendi fotoğrafları aday yapılmaz (telif + alakasızlık).
  //    Ayrıntı: fonksiyon başındaki açıklama.

  // 1b) Haberin arşivindeki serbest lisanslı ek görseller. Bunlar daha önce
  //     yayın için seçilmiş, altyazısı habere bağlanmış karelerdir; aramada
  //     gözden kaçsalar bile değerlendirmeye değer.
  for (const ek of Array.isArray(article.gorselEk) ? article.gorselEk : []) {
    if (!ek?.url) continue;
    if (!lisansUygun(ek.lisans)) continue;
    const once = havuz.length;
    adayEkle(
      havuz,
      {
        url: ek.url,
        kaynak: "arşiv",
        sayfa: ek.sayfa || "",
        yazar: ek.yazar || "",
        lisans: ek.lisans || "",
        lisansUrl: ek.lisansUrl || "",
        baslik: ek.altyazi || "Arşiv görseli",
      },
      { kullanilan, mevcutKimlik }
    );
    if (debug && havuz.length > once) {
      console.log(`      · arşiv: ${String(ek.altyazi || ek.url).slice(0, 60)}`);
    }
  }

  // 1c) gorselKaynak bir Commons dosyasıysa onu da aday yap (ör. tasarım
  //     kartının altındaki gerçek fotoğraf). Ek görsel varsa tekrar API'ye gitme.
  if (
    !article.gorselEk?.length &&
    /commons\.wikimedia\.org\/wiki\/File:/i.test(String(article.gorselKaynak?.sayfa || ""))
  ) {
    try {
      const arsiv = await commonsDosyaAdayi(article.gorselKaynak.sayfa);
      if (arsiv) {
        adayEkle(havuz, arsiv, { kullanilan, mevcutKimlik });
        if (debug) console.log(`      · kaynak dosya: ${arsiv.baslik?.slice(0, 60) || "commons"}`);
      }
    } catch (err) {
      if (debug) console.log(`      · kaynak dosya hata: ${err.message}`);
    }
  }

  // 2) Commons + Openverse. İlk sorgu en değerli; Openverse'i yormamak için
  //    yalnızca ilk 2 sorguda çalıştırılır.
  for (const [i, sorgu] of sorgular.entries()) {
    try {
      const commons = await commonsAdaylari(sorgu, 8);
      for (const a of commons) adayEkle(havuz, a, { kullanilan, mevcutKimlik });
      if (debug) console.log(`      · commons "${sorgu}": ${commons.length}`);
    } catch (err) {
      if (debug) console.log(`      · commons hata: ${err.message}`);
    }
    if (i < 2) {
      try {
        const open = await openverseAdaylari(sorgu, 8);
        for (const a of open) adayEkle(havuz, a, { kullanilan, mevcutKimlik });
        if (debug) console.log(`      · openverse "${sorgu}": ${open.length}`);
      } catch (err) {
        if (debug) console.log(`      · openverse hata: ${err.message}`);
      }
      await bekle(1200); // Openverse hız sınırına saygı
    }
  }

  return havuz.slice(0, 24);
}

/**
 * Adayları indirir, ölçer ve en iyi 4'ünü vision'a hazırlar.
 * `mevcut` aday her zaman değerlendirmeye alınır (karşılaştırma için).
 */
export async function adaylariDegerlendir(adaylar, { kok = process.cwd(), debug = false, enFazla = 4 } = {}) {
  const puanli = [];
  for (const aday of adaylar) {
    if (puanli.length >= enFazla + 2) break;
    try {
      const veri = await gorselIndir(aday.url, { kok });
      if (!veri) continue;
      const bilgi = await sharp(veri).metadata();
      if ((bilgi.width || 0) < MIN_W || (bilgi.height || 0) < MIN_H) continue;
      if (!oranUygun(bilgi.width, bilgi.height)) continue;
      if (await metinKartiMi(veri)) {
        if (debug) console.log(`      · elendi (yazılı kart): ${aday.url.slice(0, 70)}`);
        continue;
      }
      const puan = await gorselPuani(veri, bilgi);
      if (puan === null) {
        if (debug) console.log(`      · elendi (düz/küçük): ${aday.url.slice(0, 70)}`);
        continue;
      }
      puanli.push({ ...aday, veri, bilgi, onPuan: puan });
    } catch (err) {
      if (debug) console.log(`      · indirilemedi: ${err.message}`);
    }
  }
  puanli.sort((a, b) => b.onPuan - a.onPuan);

  // Vision'a en iyi 4 aday gider; mevcut kapak her zaman aralarında olur.
  const secilen = puanli.slice(0, enFazla);
  const mevcut = puanli.find((x) => x.mevcut);
  if (mevcut && !secilen.includes(mevcut)) {
    secilen.pop();
    secilen.push(mevcut);
  }
  return { puanli, secilen };
}

// ------------------------------------------------------------- kapak yazma
function kirpBoru(veri, bilgi) {
  const w = Number(bilgi?.width) || 0;
  const h = Number(bilgi?.height) || 0;
  const konum =
    w * h <= 20_000_000 && w / Math.max(1, h) >= 1.25
      ? sharp.strategy.attention
      : "centre";
  const buyutme = GENISLIK / Math.max(1, w);
  const keskinlik =
    buyutme > 1.35
      ? { sigma: 1.2, m1: 1.2, m2: 0.6 }
      : buyutme > 1.05
        ? { sigma: 0.9, m1: 0.8, m2: 0.4 }
        : { sigma: 0.6 };
  return sharp(veri)
    .resize(GENISLIK, YUKSEKLIK, { fit: "cover", position: konum })
    .sharpen(keskinlik);
}

/**
 * Kapak dosyalarını (WebP + 480 + sosyal JPEG) yazar.
 * @returns {Promise<{url:string, dosya:string}|null>}
 */
export async function kapakYaz(article, veri, { kok = process.cwd(), dry = false } = {}) {
  const bilgi = await sharp(veri).metadata();
  if ((bilgi.width || 0) < MIN_W || (bilgi.height || 0) < MIN_H) return null;
  const taban = await kirpBoru(veri, bilgi).webp({ quality: 86, effort: 4 }).toBuffer();
  const url = `/kapak/${article.id}.webp`;
  if (dry) return { url, dosya: path.join(kok, "site", "public", "kapak", `${article.id}.webp`) };

  const dizin = path.join(kok, "site", "public", "kapak");
  fs.mkdirSync(dizin, { recursive: true });
  const dosya = path.join(dizin, `${article.id}.webp`);
  fs.writeFileSync(dosya, taban);
  await sharp(taban)
    .resize(KUCUK_GENISLIK, Math.round((KUCUK_GENISLIK * YUKSEKLIK) / GENISLIK))
    .webp({ quality: 82, effort: 4 })
    .toFile(dosya.replace(/\.webp$/, "-480.webp"));
  await sharp(taban)
    .resize(SOSYAL_GENISLIK, SOSYAL_YUKSEKLIK, { fit: "cover", position: "centre" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(dosya.replace(/\.webp$/, "-sosyal.jpg"));
  return { url, dosya };
}

function atifYap(aday) {
  if (!aday) return null;
  if (aday.kaynak === "ai") {
    return {
      yazar: "HaberinAi görsel ajanı",
      lisans: "AI üretimi",
      lisansUrl: "",
      sayfa: `${SITE}/yayin-ilkeleri`,
    };
  }
  return {
    yazar: aday.yazar || "",
    lisans: aday.lisans || "",
    lisansUrl: aday.lisansUrl || "",
    sayfa: aday.sayfa || "",
  };
}

/**
 * Tek haber için görsel ajanını çalıştırır.
 *
 * @param {object} article data/articles.json kaydı
 * @param {object} opts
 * @param {Set<string>} [opts.kullanilan] arşivde kullanılmış görsel kimlikleri
 * @param {boolean} [opts.dry] dosya yazma
 * @param {boolean} [opts.zorla] mevcut ajan kapağını da yeniden değerlendir
 * @param {boolean} [opts.uret] AI görsel üretimi açık mı
 * @param {object} [opts.sayac] {izinVar(), artir()}
 * @param {boolean} [opts.debug]
 * @param {string} [opts.kok]
 * @returns {Promise<{degisti:boolean, neden:string, kapak?:object, gorselKaynak?:object, brief?:object, secim?:object}>}
 */
export async function ajanKapakUret(article, opts = {}) {
  const {
    kullanilan = new Set(),
    dry = false,
    zorla = false,
    uret = true,
    sayac = null,
    debug = false,
    kok = process.cwd(),
  } = opts;

  if (!article?.id || !article?.title) return { degisti: false, neden: "haber eksik" };

  const mevcutUrl = String(article.image || "");

  // 1) BRİF
  // AI bütçesi tükendiyse brif için modele hiç gitme: başlık + etiketlerden
  // üretilen güvenli yedek brif yeterli. Böylece günlük kota görsel seçimine
  // (vision) kalır; brif yüzünden tur boşuna kesilmez.
  let brief;
  if (sayac && !sayac.izinVar()) {
    brief = gorselBrifiYedek(article);
  } else {
    sayac?.artir();
    brief = await gorselBrifi(article);
  }
  if (debug) console.log(`      brif: ${brief.sahne}${brief.yedek ? " [yedek]" : ""}`);

  // 2) ADAYLAR
  const havuz = await adaylariTopla(article, brief, { kullanilan, mevcutUrl, debug });
  if (debug) console.log(`      aday havuzu: ${havuz.length}`);
  if (!havuz.length) return { degisti: false, neden: "aday bulunamadı", brief };

  // 3) İNDİR + ÖLÇ
  const { puanli, secilen } = await adaylariDegerlendir(havuz, { kok, debug });
  if (!secilen.length) return { degisti: false, neden: "adaylar ölçülemedi", brief };

  // 4) GÖZ KONTROLÜ
  // Vision yoksa sezgisel puana göre kapak DEĞİŞTİRİLMEZ: kullanıcının şikâyeti
  // tam olarak "dosya adı/parlaklık eşleşen alakasız kare" sorunuydu. Sağlayıcı
  // yoksa mevcut kapak korunur, tur boşuna kota harcamaz.
  const vision = await visionSkorla(secilen, article, brief, sayac, debug);
  if (!vision?.length) {
    return {
      degisti: false,
      neden: "görsel denetimi yapılamadı (vision sağlayıcısı yok)",
      brief,
    };
  }
  const skorlu = secilen.map((aday) => {
    const v = vision?.find((x) => x.i === secilen.indexOf(aday));
    return {
      ...aday,
      skor: v ? v.skor : 0,
      alaka: v?.alaka ?? null,
      dikkat: v?.dikkat ?? null,
      // Vision'ın görmediği aday seçilemez: sezgisel puan tek başına yeterli değil.
      uygun: v ? v.uygun : false,
      neden: v?.neden || "vision değerlendirmedi",
      vision: Boolean(v),
    };
  });
  skorlu.sort((a, b) => b.skor - a.skor);

  const mevcut = skorlu.find((x) => x.mevcut);
  const enIyiArama =
    skorlu.find((x) => !x.mevcut && x.uygun && (x.alaka ?? 0) >= 60 && x.skor >= 62) || null;
  if (debug) {
    for (const x of skorlu) {
      console.log(
        `      ${x.mevcut ? "MEVCUT" : x.kaynak} ${x.skor.toFixed(0)}p ` +
          `(alaka ${x.alaka ?? "-"}, dikkat ${x.dikkat ?? "-"}) ${x.uygun ? "" : "[UYGUN DEĞİL]"} ` +
          `${x.url.slice(0, 60)}`
      );
    }
  }

  // Mevcut kapak zaten iyiyse ve yeni aday anlamlı fark yaratmıyorsa dokunma.
  const mevcutSkor = mevcut?.skor ?? 0;
  const mevcutIyimi = Boolean(mevcut && mevcut.uygun && mevcutSkor >= 66);
  const esik = mevcutIyimi ? mevcutSkor + 5 : 62;

  let secim = enIyiArama && enIyiArama.skor >= esik ? enIyiArama : null;

  // 5) ÜRETİM: Arama sonucu yoksa ya da zayıfsa konsept görsel üret.
  // Üretilen kare, mevcut iyi kapaktan ya da arama adayından ANLAMLI biçimde
  // daha iyi değilse seçilmez; iyi kapak riske atılmaz.
  if (uret && (!sayac || sayac.izinVar()) && (!secim || secim.skor < 70)) {
    const aiSonuc = await gorselUret(brief.prompt || brief.sahne, sayac, { debug });
    if (aiSonuc) {
      try {
        const bilgi = await sharp(aiSonuc.veri).metadata();
        const onPuan = (await gorselPuani(aiSonuc.veri, bilgi)) || 0;
        if (onPuan >= 30) {
          const aiAday = {
            url: `ai:${aiSonuc.model}`,
            kaynak: "ai",
            veri: aiSonuc.veri,
            bilgi,
            onPuan,
            model: aiSonuc.model,
            baslik: "AI üretimi",
          };
          // Üretilen görseli de göz kontrolünden geçir (tek aday).
          const aiVision = await visionSkorla([aiAday], article, brief, sayac, debug);
          const v = aiVision?.[0];
          const aiSkor = v ? v.skor : onPuan;
          if (debug) {
            console.log(
              `      AI ${aiSkor.toFixed(0)}p (alaka ${v?.alaka ?? "-"}) ${v?.neden || ""}`
            );
          }
          // AI kare, seçili arama adayından VE hâlâ iyi durumdaki mevcut
          // kapaktan anlamlı biçimde yüksek puan almalı. Vision yoksa AI kare
          // de seçilmez: denetlenmemiş üretim, alakasız stok kareden daha riskli.
          // kalite >= 50 şartı, filigran/bozuk yazı/çerçeve taşıyan üretimleri
          // eler (Pollinations çıktıları bunu sık yapıyor).
          const aiEsik = Math.max(secim?.skor ?? 0, mevcutIyimi ? mevcutSkor : 0);
          if (
            v &&
            v.uygun &&
            (v.alaka ?? 0) >= 60 &&
            (v.kalite ?? 0) >= 50 &&
            aiSkor >= 62 &&
            aiSkor > aiEsik + 4
          ) {
            secim = {
              ...aiAday,
              skor: aiSkor,
              alaka: v?.alaka ?? null,
              dikkat: v?.dikkat ?? null,
              uygun: true,
              neden: v?.neden || "Habere özel üretilen konsept görsel",
              vision: true,
            };
          }
        }
      } catch (err) {
        if (debug) console.log(`      AI görsel ölçülemedi: ${err.message}`);
      }
    }
  }

  // Mevcut kapak hâlâ en iyiyse değiştirme.
  if (!secim) {
    return {
      degisti: false,
      neden: mevcutIyimi ? "mevcut kapak daha iyi" : "yeterli görsel yok",
      brief,
      secim: mevcut
        ? { kaynak: "mevcut", skor: mevcutSkor, neden: "Değiştirilmedi" }
        : null,
    };
  }

  // 6) KIRP + KAYDET
  const yazilan = await kapakYaz(article, secim.veri, { kok, dry });
  if (!yazilan) return { degisti: false, neden: "kapak yazılamadı", brief };

  const kapak = {
    v: 3,
    kaynak: secim.kaynak === "ai" ? `ai:${secim.model}` : secim.url,
    foto: true,
    ...(secim.kaynak === "ai" ? { ai: true } : {}),
    ajan: {
      v: 1,
      secim: secim.kaynak,
      skor: Math.round(secim.skor),
      neden: secim.neden || "",
      brif: brief.sahne,
      sorgular: brief.sorgular || [],
      ...(secim.model ? { model: secim.model } : {}),
      tarih: new Date().toISOString(),
    },
  };

  return {
    degisti: true,
    neden: secim.neden || "yeni kapak",
    kapak,
    gorselKaynak: atifYap(secim),
    brief,
    secim: {
      kaynak: secim.kaynak,
      url: secim.url,
      skor: Math.round(secim.skor),
      neden: secim.neden || "",
      vision: secim.vision,
    },
    url: yazilan.url,
  };
}

