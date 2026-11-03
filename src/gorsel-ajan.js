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

// Openverse bu ağdan erişilemiyorsa her sorguda 35 sn beklemek turu kilitler:
// ilk ağ hatasından sonra kaynağı bu çalıştırma için kapatıyoruz.
let openverseKapali = false;

// Yalnızca ATIF GEREKTİRMEYEN lisanslar (CC0 / kamu malı). CC BY ve CC BY-SA
// elenir: sitede görsel kredisi gösterilmiyor, atıf yükümlülüğü doğmamalı.
// GFDL, fair use, non-free kabul edilmez.
const IZINLI_LISANS =
  /^(cc0\b|public domain\b|pd\b|pd[- ].*|no restrictions\b)/i;

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

// ------------------------------------------------------------ varlık çıkarımı
// Commons ve Openverse başlıkla arama yapar: "smartphone camera under display"
// gibi kavramsal sorgular ya hiç sonuç vermiyor ya da alakasız kareler
// döndürüyor. Oysa "Samsung Galaxy Z Fold" gibi ürün adı sorguları doğrudan
// ürünün kendi fotoğraflarını getiriyor. Bu yüzden haber metninden marka ve
// model adlarını çıkarıp aramanın başına koyuyoruz.
const MARKALAR = [
  ["apple maps", "Apple Maps"],
  ["apple watch", "Apple Watch"],
  ["apple tv", "Apple TV"],
  ["apple music", "Apple Music"],
  ["apple", "Apple Inc"],
  ["google maps", "Google Maps"],
  ["google news", "Google News"],
  ["samsung", "Samsung"],
  ["google", "Google"],
  ["xiaomi", "Xiaomi"],
  ["huawei", "Huawei"],
  ["oneplus", "OnePlus"],
  ["oppo", "Oppo"],
  ["vivo", "Vivo"],
  ["realme", "Realme"],
  ["honor", "Honor"],
  ["nothing", "Nothing Phone"],
  ["sony", "Sony"],
  ["microsoft", "Microsoft"],
  ["meta", "Meta"],
  ["openai", "OpenAI"],
  ["anthropic", "Anthropic"],
  ["nvidia", "Nvidia"],
  ["amd", "AMD"],
  ["intel", "Intel"],
  ["qualcomm", "Qualcomm"],
  ["tesla", "Tesla"],
  ["byd", "BYD"],
  ["toyota", "Toyota"],
  ["bmw", "BMW"],
  ["mercedes", "Mercedes-Benz"],
  ["volkswagen", "Volkswagen"],
  ["renault", "Renault"],
  ["fiat", "Fiat"],
  ["hyundai", "Hyundai"],
  ["ford", "Ford"],
  ["volvo", "Volvo"],
  ["playstation", "PlayStation"],
  ["xbox", "Xbox"],
  ["nintendo", "Nintendo"],
  ["steam", "Steam"],
  ["epic games", "Epic Games"],
  ["rockstar", "Rockstar Games"],
  ["gta", "Grand Theft Auto"],
  ["minecraft", "Minecraft"],
  ["fortnite", "Fortnite"],
  ["chatgpt", "ChatGPT"],
  ["claude", "Claude"],
  ["gemini", "Gemini"],
  ["copilot", "Copilot"],
  ["windows", "Microsoft Windows"],
  ["android", "Android"],
  ["iphone", "iPhone"],
  ["ipad", "iPad"],
  ["macbook", "MacBook"],
  ["airpods", "AirPods"],
  ["galaxy", "Samsung Galaxy"],
  ["pixel", "Google Pixel"],
  ["redmi", "Redmi"],
  ["poco", "POCO"],
  ["spotify", "Spotify"],
  ["netflix", "Netflix"],
  ["youtube", "YouTube"],
  ["tiktok", "TikTok"],
  ["instagram", "Instagram"],
  ["whatsapp", "WhatsApp"],
  ["telegram", "Telegram"],
  ["twitter", "Twitter"],
  ["spacex", "SpaceX"],
  ["nasa", "NASA"],
  ["starlink", "Starlink"],
  // Oyun markaları: oyun haberlerinde kapak neredeyse her zaman oyunun kendi
  // sanatı ya da konsol fotoğrafı olur; jenerik "gamer" stokları işe yaramaz.
  ["mass effect", "Mass Effect"],
  ["star wars", "Star Wars"],
  ["battlefield", "Battlefield"],
  ["call of duty", "Call of Duty"],
  ["assassin", "Assassin's Creed"],
  ["cyberpunk", "Cyberpunk 2077"],
  ["elden ring", "Elden Ring"],
  ["resident evil", "Resident Evil"],
  ["god of war", "God of War"],
  ["the last of us", "The Last of Us"],
  ["hogwarts", "Hogwarts Legacy"],
  ["red dead", "Red Dead Redemption"],
  ["spider-man", "Spider-Man"],
  ["halo", "Halo"],
  ["forza", "Forza"],
  ["gran turismo", "Gran Turismo"],
  ["zelda", "The Legend of Zelda"],
  ["mario", "Super Mario"],
  ["pokemon", "Pokémon"],
  ["valorant", "Valorant"],
  ["league of legends", "League of Legends"],
  ["counter-strike", "Counter-Strike"],
  ["roblox", "Roblox"],
  ["ea sports", "EA Sports"],
  ["electronic arts", "Electronic Arts"],
];

const MODEL_KALIPLARI = [
  /\biPhone\s?\d{1,2}(?:\s?(?:Pro\s?Max|Pro|Plus|Mini|Air|e))?\b/i,
  /\biPad\s?(?:Pro|Air|Mini)?\s?\d{0,2}(?:\s?M\d)?\b/i,
  /\bGalaxy\s?(?:Z\s?)?(?:Fold|Flip|S|A|Tab|Watch|Buds)\s?\d{0,3}(?:\s?(?:Ultra|Plus|FE|Pro))?\b/i,
  /\bPixel\s?\d{1,2}(?:\s?(?:Pro\s?XL|Pro|a|XL))?\b/i,
  /\b(?:RTX|GTX|RX)\s?\d{4}(?:\s?(?:Ti|Super|XT))?\b/i,
  /\bRyzen\s?\d\s?\d{4}\w{0,3}\b/i,
  /\b(?:Core\s?)?i[3579][- ]?\d{4,5}\w{0,3}\b/i,
  /\bSnapdragon\s?\d\s?Gen\s?\d\b/i,
  /\bPlayStation\s?[45]\b/i,
  /\bXbox\s?(?:Series\s?[XS])?\b/i,
  /\bNintendo\s?Switch\s?2?\b/i,
  /\bOnePlus\s?\d{1,2}(?:\s?(?:Pro|T|R))?\b/i,
  /\b(?:AirPods|Buds|FreeBuds)\s?(?:Pro|Plus|FE|Live|Studio|Air)?\s?\d{0,2}\b/i,
  /\bGTA\s?(?:VI|6|V|5)\b/i,
  /\bWindows\s?1[01]\b/i,
  /\b(?:iOS|Android)\s?\d{1,2}\b/i,
  /\bMacBook\s?(?:Pro|Air)?(?:\s?M\d)?\b/i,
  /\bModel\s?[3SYX]\b/i,
];

// Türkçe ürün kategorisi → Commons'ta karşılığı olan İngilizce arama.
// Model adı çıkmayan ("en iyi tuşlu telefonlar" gibi) haberlerde kullanılır.
const KATEGORI_SORGULARI = [
  [/\btuşlu telefon|klavyeli telefon\b/i, "feature phone Nokia"],
  [/\bkatlanabilir (telefon|ekran)\b/i, "foldable smartphone"],
  [/\bkulaklık|kulak içi\b/i, "wireless earbuds"],
  [/\bakıllı saat|smartwatch\b/i, "smartwatch"],
  [/\bdizüstü|notebook|laptop\b/i, "laptop computer"],
  [/\btablet\b/i, "tablet computer"],
  [/\bklavye\b/i, "mechanical keyboard"],
  [/\bekran kartı\b/i, "graphics card"],
  [/\bişlemci\b/i, "computer processor chip"],
  [/\bdrone\b/i, "drone quadcopter"],
  [/\bkameralı|fotoğraf makinesi\b/i, "digital camera"],
  [/\belektrikli (araç|otomobil)\b/i, "electric car"],
  [/\boyun konsolu\b/i, "game console controller"],
  [/\bveri merkezi\b/i, "data center servers"],
  [/\bsunucu\b/i, "server rack"],
  [/\brobot\b/i, "robot"],
  [/\broket fırlat|uzay aracı|uydu fırlat|spacex fırlat/i, "rocket launch"],
];

/** Model adı markayı içermiyorsa ve jenerik bir ürün ailesiyse markayı ekle. */
const JENERIK_MODEL = /^(Buds|Watch|Tab|Fold|Flip|Pro|Ultra|AirPods|FreeBuds)\b/i;

// Şirket haberlerinde (kâr, yatırım, ortaklık) ürün adı geçmez. Marka adıyla
// aramak "Samsung" → genel şehir silüeti, "AMD" → eski çip müzesi karesi
// getiriyordu. Oysa editoryal kapaklarda o şirketin amiral ürünü kullanılır:
// Samsung kâr haberinde Galaxy telefonu, Tesla haberinde Model 3.
const MARKA_URUN = new Map([
  // Somut ve güncel model adları: "Samsung Galaxy smartphone" tek sonuç
  // döndürürken "Samsung Galaxy S24" beş temiz ürün fotoğrafı getiriyor.
  ["Samsung", "Samsung Galaxy S24"],
  ["Apple Inc", "iPhone 16 Pro"],
  ["Google", "Google Pixel 9"],
  ["Huawei", "Huawei Pura 70"],
  ["Xiaomi", "Xiaomi 14"],
  ["OnePlus", "OnePlus smartphone"],
  ["Oppo", "Oppo smartphone"],
  ["Vivo", "Vivo smartphone"],
  ["Realme", "Realme smartphone"],
  ["Honor", "Honor smartphone"],
  ["Nothing Phone", "Nothing Phone"],
  ["Sony", "Sony PlayStation 5"],
  ["Microsoft", "Microsoft Surface laptop"],
  ["Meta", "Meta Quest 3"],
  ["Nvidia", "GeForce RTX 4090"],
  ["AMD", "AMD Ryzen"],
  ["Intel", "Intel Core i9"],
  ["Qualcomm", "Qualcomm Snapdragon chip"],
  ["Tesla", "Tesla Model 3"],
  ["SpaceX", "SpaceX Starship"],
  ["PlayStation", "PlayStation 5 console"],
  ["Xbox", "Xbox Series X console"],
  ["Nintendo", "Nintendo Switch"],
]);

// Bulut/yapay zeka şirketlerinin çip ve altyapı haberlerinde veri merkezi
// fotoğrafı, ürün fotoğrafından daha doğru bir editoryal karşılıktır.
const BULUT_MARKA = new Set(["Google", "Microsoft", "Meta", "OpenAI", "Anthropic"]);

// Görsel kimliği olmayan (ürünü fotoğrafta tanınmayan) markalar: tek başına
// arandığında alakasız sonuç getirirler ("Apple" → elma, "Google" → kampüs).
const HIZMET_MARKA = new Set([
  "Apple Inc",
  "Google",
  "Meta",
  "Microsoft",
  "OpenAI",
  "Anthropic",
  "Claude",
  "ChatGPT",
  "Gemini",
  "Copilot",
  "Microsoft Windows",
  "Android",
  "iOS",
  "YouTube",
  "Netflix",
  "Spotify",
  "TikTok",
  "Instagram",
  "WhatsApp",
  "Telegram",
  "Twitter",
  "Steam",
  "Epic Games",
  "NASA",
  "Starlink",
]);

/** Marka/model adlarını İngilizce Commons sorgusuna çevirir. */
export function varlikSorgulari(article) {
  const baslik = String(article?.title || "");
  const ozet = String(article?.summary || "").slice(0, 400);
  const etiketler = (Array.isArray(article?.tags) ? article.tags : []).join(" ");
  const metin = [baslik, ozet, etiketler].filter(Boolean).join(" ");
  if (!metin) return [];

  const modeller = [];
  for (const kalip of MODEL_KALIPLARI) {
    const m = kalip.exec(metin);
    if (m) {
      const s = m[0].replace(/\s+/g, " ").trim();
      if (s.length >= 3 && !modeller.some((x) => x.toLowerCase() === s.toLowerCase())) {
        modeller.push(s);
      }
    }
  }

  const alt = ` ${metin.toLocaleLowerCase("tr-TR")} `;
  const markalar = [];
  for (const [anahtar, ad] of MARKALAR) {
    const re = new RegExp(`(^|[^a-z0-9])${anahtar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
    if (re.test(alt) && !markalar.includes(ad)) markalar.push(ad);
  }
  // Başlıkta önce geçen marka daha önemli: "AMD ve Meta..." haberinde arama
  // Meta Quest'le değil AMD ürünüyle başlamalı.
  markalar.sort((a, b) => alt.indexOf(a.split(" ")[0].toLowerCase()) - alt.indexOf(b.split(" ")[0].toLowerCase()));

  const sorgular = [];
  const ekle = (s) => {
    const t = String(s || "").replace(/\s+/g, " ").trim();
    if (t.length >= 3 && !sorgular.some((x) => x.toLowerCase() === t.toLowerCase())) sorgular.push(t);
  };

  // Model adı zaten markayı içeriyorsa tek başına yeter ("Samsung Galaxy Z Fold").
  for (const model of modeller.slice(0, 2)) {
    const temiz = model
      .replace(/\bGalaxyFold\b/i, "Galaxy Z Fold")
      .replace(/\bGalaxyFlip\b/i, "Galaxy Z Flip")
      .replace(/\bGalaxy\s?Z\s?(Fold|Flip)\b/i, "Galaxy Z $1");
    // "Galaxy ..." tek başına aranınca da Samsung ürünleri gelir; marka eklemek
    // gereksiz. Jenerik ürün ailesi ("Buds Pro") tek marka varsa onunla aranır;
    // birden çok marka varsa yanlış eşleşme olmasın diye yalnız bırakılır.
    if (JENERIK_MODEL.test(temiz) && markalar.length === 1) ekle(`${markalar[0]} ${temiz}`);
    else ekle(temiz);
  }

  // Model yoksa önce ürün kategorisi (somut), sonra marka: "tuşlu telefonlar"
  // haberinde "WhatsApp" değil "feature phone Nokia" aranmalı.
  if (!modeller.length) {
    for (const [kalip, sorgu] of KATEGORI_SORGULARI) {
      if (kalip.test(metin)) {
        ekle(sorgu);
        break;
      }
    }
  }
  for (const marka of markalar.slice(0, 2)) {
    if (/(çip|veri merkezi|sunucu)/i.test(metin) && BULUT_MARKA.has(marka)) {
      ekle("data center server room");
    } else if (MARKA_URUN.has(marka)) {
      ekle(MARKA_URUN.get(marka));
    } else if (!HIZMET_MARKA.has(marka)) {
      ekle(marka);
    }
  }

  return sorgular.slice(0, 3);
}

/** Aday başlığında geçen marka/model kökleri: sıralamada küçük bir öncelik. */
function varlikKokleri(article) {
  const metin = [...varlikSorgulari(article), String(article?.title || "")]
    .join(" ")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ");
  return new Set(
    metin
      .split(/\s+/)
      .filter((k) => k.length >= 4)
      .map((k) => k.slice(0, 5))
  );
}

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
    // filetype:bitmap PNG ekran görüntülerini de getiriyordu; kapak için
    // yalnızca gerçek fotoğraf (JPEG) istiyoruz.
    gsrsearch: `${sorgu} filemime:image/jpeg`,
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

/** Openverse: Commons dışında CC0 / kamu malı fotoğraf havuzu. */
export async function openverseAdaylari(sorgu, limit = 8) {
  const params = new URLSearchParams({
    q: sorgu,
    license: "cc0",
    size: "large",
    aspect_ratio: "wide",
    mature: "false",
    page_size: String(Math.max(1, limit)),
  });
  const res = await istek(`${OPENVERSE}?${params}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    // Openverse ilk istekte sık sık 20 sn'yi aşıyor; timeout yüzünden bütün
    // kaynağı kaybetmemek için daha uzun süre ve tek tekrar deniyoruz.
    timeout: 35000,
  }, 2);
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
  // Sunucu filtresine ek olarak istemcide de doğrula: yalnızca CC0.
  // CC BY / BY-SA atıf ister; sitede kredi gösterilmediği için elenir.
  if (hamLisans !== "cc0") return null;
  const lisans = "CC0";
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
  Mağaza ya da etkinlik çekimi olabilir; ÜRÜN karede büyük, net ve baskın duruyorsa kalite puanını kırma.
- uygun: Görsel haberle ilgisiz, yanıltıcı, rahatsız edici (kan/ceset), müstehcen veya tamamen boşsa false.
  Üzerinde filigran, bozuk/okunmaz yazı, çerçeve ya da kolaj varsa da false.
  Uygulama arayüzü, haber sitesi ekranı, sohbet ekranı, sosyal medya akışı gibi EKRAN GÖRÜNTÜLERİ kapak olamaz: false.
  Haberle ilgisi olmayan stok insan kareleri (mayo/bikini, gece kulübü, plaj, gülümseyen ofis ekibi) false.

KURALLAR:
- Sadece "güzel" olduğu için alakasız kareyi seçme. Alaka, güzellikten önce gelir.
- Haber bir yasak/karar/istatistik haberi olsa bile kare somut bir insan veya nesne göstermeli.
- Yayıncının başlık bastığı kart, logo, metin ağırlıklı görsel ve kolaj kesinlikle seçilmez.
- "Kısmen temsil ediyor", "genel atmosferi veriyor" gibi gerekçeler alaka için yeterli değildir.
- Emin değilsen uygun=false ver; yanlış fotoğraf boş karttan daha çok güven kaybettirir.
- ŞEHİR SİLÜETİ, gökdelen, genel bina/plaza, genel ofis masası, kalabalık sokak gibi
  "sektörü çağrıştıran" kareler alaka 40'ı GEÇMEMELİ; bunlar haberin öznesini göstermez.
- Sahne soluk, gri, kapalı havada çekilmiş ya da aşırı sıradan ise dikkat 40'ı GEÇMEMELİ.
- Büyüteç, grafik, ok, ampul, beyin maketi gibi stok "konsept" illüstrasyonları uygun=false.
- Karedeki kişinin yüzü kırpılmış ya da yalnızca el/ense görünüyorsa dikkat 50'yi geçmemeli.

Yanıt SADECE şu JSON olsun:
{"adaylar":[{"i":1,"alaka":0,"dikkat":0,"kalite":0,"uygun":true,"tip":"foto","neden":"kısa Türkçe gerekçe"}],"secim":1}

"tip" alanı şunlardan biri olmalı:
- "foto": gerçek fotoğraf (ürün, insan, mekân, etkinlik).
- "ekran": uygulama/site arayüzü, sohbet ekranı, sosyal medya akışı gibi ekran görüntüsü.
- "logo": logo, kelime markası, rozet, ikon ağırlıklı görsel.
- "diger": kolaj, harita, grafik, çizim, belge.
Ekran görüntüsü haberin konusunu doğrudan gösteriyorsa uygun=true ve tip="ekran" ver; uygunsuz diye eleme.`;

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
        // Bütçe yalnızca GERÇEKTEN cevap alınan çağrılar için harcanır: 429/503
        // dönen denemeler günlük sayacı boşa tüketiyordu.
        if (res?.ok) sayac?.artir();
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
              tip: ["foto", "ekran", "logo", "diger"].includes(String(x.tip || ""))
                ? String(x.tip)
                : "foto",
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
  Mağaza ya da etkinlik çekimi olabilir; ÜRÜN karede büyük, net ve baskın duruyorsa kalite puanını kırma.
- uygun: Görsel haberle ilgisiz, yanıltıcı, rahatsız edici (kan/ceset), müstehcen veya tamamen boşsa false.
  Üzerinde filigran, bozuk/okunmaz yazı, çerçeve ya da kolaj varsa da false.
  Uygulama arayüzü, haber sitesi ekranı, sohbet ekranı, sosyal medya akışı gibi EKRAN GÖRÜNTÜLERİ kapak olamaz: false.
  Haberle ilgisi olmayan stok insan kareleri (mayo/bikini, gece kulübü, plaj, gülümseyen ofis ekibi) false.

KURALLAR:
- Sadece "güzel" olduğu için alakasız kareyi yükseltme. Alaka, güzellikten önce gelir.
- "Kısmen temsil ediyor", "genel atmosferi veriyor" gibi gerekçeler alaka için yeterli değildir.
- Yayıncının başlık bastığı kart, logo, metin ağırlıklı görsel ve kolaj kesinlikle uygun değildir.
- Emin değilsen uygun=false ver; yanlış fotoğraf boş karttan daha çok güven kaybettirir.

Yanıt SADECE şu JSON olsun:
{"alaka":0,"dikkat":0,"kalite":0,"uygun":true,"tip":"foto","neden":"kısa Türkçe gerekçe"}

"tip": "foto" (gerçek fotoğraf), "ekran" (arayüz/ekran görüntüsü), "logo", "diger".`;

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
      sayac?.artir();
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
        tip: ["foto", "ekran", "logo", "diger"].includes(String(veri.tip || ""))
          ? String(veri.tip)
          : "foto",
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
        if (buf && buf.length > 12000) {
          sayac?.artir();
          return { veri: buf, model: model.split("/").pop() };
        }
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
  const varliklar = varlikSorgulari(article);
  const sorgular = [
    ...new Set(
      [
        // Ürün/marka adı sorguları en başta: Commons'ta doğrudan ürün
        // fotoğrafını getiren tek sorgu tipi bu.
        ...varliklar,
        ...(brief.sorgular || []),
        article.gorselSorgu,
        ...(Array.isArray(article.tags) ? article.tags.slice(0, 1) : []),
      ]
        .map((s) => String(s || "").replace(/[^\p{L}\p{N}\s-]+/gu, " ").replace(/\s+/g, " ").trim())
        .filter((s) => s.length >= 3)
    ),
  ].slice(0, 6);
  if (debug && varliklar.length) console.log(`      · varlık sorguları: ${varliklar.join(" | ")}`);

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

  // 2) Commons + Openverse. İlk sorgular en değerli; Openverse'i yormamak için
  //    yalnızca ilk 3 sorguda çalıştırılır.
  for (const [i, sorgu] of sorgular.entries()) {
    try {
      const commons = await commonsAdaylari(sorgu, 10);
      for (const a of commons) adayEkle(havuz, a, { kullanilan, mevcutKimlik });
      if (debug) console.log(`      · commons "${sorgu}": ${commons.length}`);
    } catch (err) {
      if (debug) console.log(`      · commons hata: ${err.message}`);
    }
    if (i < 3 && !openverseKapali) {
      try {
        const open = await openverseAdaylari(sorgu, 8);
        for (const a of open) adayEkle(havuz, a, { kullanilan, mevcutKimlik });
        if (debug) console.log(`      · openverse "${sorgu}": ${open.length}`);
      } catch (err) {
        openverseKapali = true;
        if (debug) console.log(`      · openverse kapandı: ${err.message}`);
      }
      await bekle(1200); // Openverse hız sınırına saygı
    }
  }

  // Ürün adı geçen adaylar vision'a girmeden önce öne alınsın: "genel güzel
  // kare" yerine doğrudan haberin ürününü gösteren fotoğraf değerlendirilir.
  const kokler = varlikKokleri(article);
  if (kokler.size) {
    for (const a of havuz) {
      const metin = `${a.baslik || ""} ${a.metin || ""}`.toLocaleLowerCase("tr-TR");
      let eslesme = 0;
      for (const k of kokler) if (metin.includes(k)) eslesme++;
      let puan = Math.min(3, eslesme) * 7;
      // Mağaza/vitrin çekimleri ürüne güvenlik aparatı, fiyat etiketi ve arka
      // plan kalabalığı sokar; temiz ürün karelerinin gerisinde kalsın.
      if (/store|shop|retail|display|security|vitrin|mağaza/.test(metin)) puan -= 12;
      a.onEk = puan;
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
    // Sorgu sırasına göre ilk 6 adayla yetinmek, kötü bir varlık sorgusunun
    // (ör. "Apple" → elma fotoğrafları) bütün vision kontenjanını doldurmasına
    // yol açıyordu. Daha geniş ölçüp en iyileri seçiyoruz.
    if (puanli.length >= enFazla + 10) break;
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
      puanli.push({ ...aday, veri, bilgi, onPuan: puan + (Number(aday.onEk) || 0) });
    } catch (err) {
      if (debug) console.log(`      · indirilemedi: ${err.message}`);
    }
  }
  puanli.sort((a, b) => b.onPuan - a.onPuan);

  // Vision'a en iyi 4 aday gider; mevcut kapak her zaman aralarında olur.
  const secilen = puanli.slice(0, enFazla);
  // Ürün adı eşleşen aday sezgisel olarak ilk 4'e giremiyorsa (ör. parlak ama
  // alakasız bir stok kare önde), son sıraya onu koy: vision'ın gerçek ürünü
  // görme şansı olsun.
  if (!secilen.some((x) => (Number(x.onEk) || 0) >= 7)) {
    const varlik = puanli.find((x) => !x.mevcut && (Number(x.onEk) || 0) >= 7);
    if (varlik && !secilen.includes(varlik)) {
      secilen.pop();
      secilen.push(varlik);
    }
  }
  const mevcut = puanli.find((x) => x.mevcut);
  if (mevcut && !secilen.includes(mevcut)) {
    secilen.pop();
    secilen.push(mevcut);
  }
  return { puanli, secilen };
}

// ------------------------------------------------------------- kapak yazma
/**
 * Ham ekran görüntüsü mü? Arayüz kareleri düz renkli zemin + ince yazıdan
 * oluşur: piksellerin büyük kısmı tek bir renge (beyaz/gri/siyah) yakındır.
 * Fotoğraflarda renk dağılımı çok daha geniştir. Bileşimi yalnızca gerçek
 * ekran görüntülerine uygulamak için bu ayrımı yapıyoruz.
 */
export async function duzEkranMi(veri) {
  try {
    const { data, info } = await sharp(veri)
      .resize(160, 160, { fit: "inside" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    const adet = info.width * info.height;
    if (!adet) return false;
    // En sık görülen rengi (16'lık kovada) bul.
    const kova = new Map();
    for (let i = 0; i + 2 < data.length; i += ch) {
      const k = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      kova.set(k, (kova.get(k) || 0) + 1);
    }
    let enBuyuk = 0;
    for (const n of kova.values()) if (n > enBuyuk) enBuyuk = n;
    // Düz zemin + nötr (renksiz) piksellerin oranı.
    let notr = 0;
    for (let i = 0; i + 2 < data.length; i += ch) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const en = Math.max(r, g, b);
      const az = Math.min(r, g, b);
      if (en - az <= 12) notr++;
    }
    const tekRenk = enBuyuk / adet;
    const notrOran = notr / adet;
    return tekRenk >= 0.5 && notrOran >= 0.75;
  } catch {
    return false;
  }
}

/**
 * Ekran görüntüsünü cihaz kartı gibi sunar: arka planda aynı görselin bulanık
 * ve karartılmış hâli, önde yuvarlatılmış köşeli, gölgeli bir ekran. Ham
 * ekran görüntüsü feed'de "amatör" duruyor; bu bileşim onu editoryal bir
 * kapağa çeviriyor. Girdi 16:9'dan farklı olabilir.
 */
export async function ekranBilesimi(veri, bilgi) {
  const w = Number(bilgi?.width) || 0;
  const h = Number(bilgi?.height) || 0;
  if (!w || !h) return null;

  const arka = await sharp(veri)
    .resize(GENISLIK, YUKSEKLIK, { fit: "cover", position: "centre" })
    .blur(26)
    .modulate({ brightness: 0.5, saturation: 1.2 })
    .toBuffer();

  // Ön plan: ekranın en uzun kenarı 600 px; geniş ekranlarda 1040 px'e kadar.
  const oran = w / h;
  let onH = 600;
  let onW = Math.round(onH * oran);
  if (onW > 1040) {
    onW = 1040;
    onH = Math.round(onW / oran);
  }
  if (onH > 640) {
    onH = 640;
    onW = Math.round(onH * oran);
  }
  const yaricap = Math.round(Math.min(onW, onH) * 0.045) + 6;

  const maske = Buffer.from(
    `<svg width="${onW}" height="${onH}"><rect x="0" y="0" width="${onW}" height="${onH}" rx="${yaricap}" ry="${yaricap}" fill="#ffffff"/></svg>`
  );
  const onPlan = await sharp(veri)
    .resize(onW, onH, { fit: "cover", position: "centre" })
    .composite([{ input: maske, blend: "dest-in" }])
    .png()
    .toBuffer();

  const golgePay = 90;
  const golge = await sharp(
    Buffer.from(
      `<svg width="${onW + golgePay}" height="${onH + golgePay}"><rect x="${golgePay / 2}" y="${golgePay / 2 + 6}" width="${onW}" height="${onH}" rx="${yaricap}" ry="${yaricap}" fill="rgba(0,0,0,0.6)"/></svg>`
    )
  )
    .blur(18)
    .png()
    .toBuffer();

  const sol = Math.round((GENISLIK - onW) / 2);
  const ust = Math.round((YUKSEKLIK - onH) / 2);

  return sharp(arka)
    .composite([
      { input: golge, left: sol - golgePay / 2, top: ust - golgePay / 2 },
      { input: onPlan, left: sol, top: ust },
    ])
    .toBuffer();
}

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
    // Hafif editoryal derecelendirme: feed'de kapakların birbirine benzeyen,
    // canlı ve kontrastlı görünmesi için. Abartısız tutuluyor ki fotoğraf
    // doğal kalsın (pivot 128 → kontrast ortadan büyütülür).
    .modulate({ saturation: 1.06, brightness: 1.01 })
    .linear(1.05, -6.4)
    .sharpen(keskinlik);
}

/**
 * Kapak dosyalarını (WebP + 480 + sosyal JPEG) yazar.
 * @returns {Promise<{url:string, dosya:string}|null>}
 */
export async function kapakYaz(article, veri, { kok = process.cwd(), dry = false, tip = "foto" } = {}) {
  const bilgi = await sharp(veri).metadata();
  if ((bilgi.width || 0) < MIN_W || (bilgi.height || 0) < MIN_H) return null;
  let taban = null;
  if (tip === "ekran" && (await duzEkranMi(veri))) {
    const bilesim = await ekranBilesimi(veri, bilgi).catch(() => null);
    if (bilesim) {
      taban = await sharp(bilesim).webp({ quality: 86, effort: 4 }).toBuffer();
    }
  }
  if (!taban) {
    taban = await kirpBoru(veri, bilgi).webp({ quality: 86, effort: 4 }).toBuffer();
  }
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
  // Tasarım kartı kapağı (fotoğrafı yok): vision sağlayıcısı yoksa bile, başlıkta
  // geçen ürün/marka adını taşıyan gerçek bir fotoğraf boş karttan iyidir.
  // Bu, yalnızca kart kapaklarında ve yalnızca ada birebir uyan adayda geçerli.
  const kartMi = article.kapak?.foto === false;
  // Ajanın kendi seçtiği ama vision'da vasat kalan kapak (ör. 69p şehir
  // silüeti). Bu durumda da ürün adı birebir eşleşen aday tercih edilir.
  const zayifMevcut =
    Boolean(article.kapak?.ajan) && Number(article.kapak.ajan.skor || 0) < 75;
  if (!vision?.length) {
    if (kartMi || zayifMevcut) {
      const aday = secilen
        .filter((x) => !x.mevcut && (Number(x.onEk) || 0) >= 7 && x.onPuan >= (kartMi ? 72 : 65))
        .sort((a, b) => b.onPuan - a.onPuan)[0];
      if (aday) {
        const yazilan = await kapakYaz(article, aday.veri, { kok, dry, tip: "foto" });
        if (yazilan) {
          return {
            degisti: true,
            neden: "ürün adı eşleşen fotoğraf (vision yok)",
            kapak: {
              v: 3,
              kaynak: aday.url,
              foto: true,
              ajan: {
                v: 1,
                secim: aday.kaynak,
                skor: Math.round(aday.onPuan),
                neden: kartMi
                  ? "Tasarım kartı yerine, başlıktaki ürün/marka adını taşıyan serbest lisanslı fotoğraf seçildi."
                  : "Vasat kalan önceki kapak yerine, başlıktaki ürün/marka adını taşıyan fotoğraf seçildi.",
                brif: brief.sahne,
                sorgular: brief.sorgular || [],
                tarih: new Date().toISOString(),
              },
            },
            gorselKaynak: atifYap(aday),
            brief,
            secim: {
              kaynak: aday.kaynak,
              url: aday.url,
              skor: Math.round(aday.onPuan),
              neden: "Ürün adı eşleşmesi (vision sağlayıcısı yok)",
              vision: false,
            },
            url: yazilan.url,
          };
        }
      }
    }
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
      tip: v?.tip || "foto",
      neden: v?.neden || "vision değerlendirmedi",
      vision: Boolean(v),
    };
  });
  skorlu.sort((a, b) => b.skor - a.skor);

  const mevcut = skorlu.find((x) => x.mevcut);
  const enIyiArama =
    skorlu.find(
      (x) =>
        !x.mevcut &&
        x.uygun &&
        (x.alaka ?? 0) >= (kartMi ? 55 : 60) &&
        x.skor >= (kartMi ? 60 : 62)
    ) || null;
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
  // Tasarım kartında karşılaştırılacak fotoğraf yok; eşik daha düşük.
  const mevcutSkor = mevcut?.skor ?? 0;
  const mevcutIyimi = Boolean(mevcut && mevcut.uygun && mevcutSkor >= 66);
  const esik = kartMi ? 55 : mevcutIyimi ? mevcutSkor + 5 : 62;

  let secim = enIyiArama && enIyiArama.skor >= esik ? enIyiArama : null;

  // Mevcut kapak neredeyse kullanılamaz durumdaysa (vision 55'in altı) ve
  // başlıktaki ürün adını taşıyan bir aday varsa, puanı düşük olsa da onu
  // tercih et: markanın kendi ürünü, alakasız bir şehir silüetinden iyidir.
  // Şirket finansmanı haberlerinde (kâr, gelir, hisse) vision "ürün konuyu
  // anlatmıyor" dese de amiral ürün fotoğrafı editoryal standarttır.
  const finansHaberi = /(kâr|kar\b|gelir|ciro|hisse|yatırım|rapor|çeyrek|bilanço)/i.test(
    `${article.title || ""} ${String(article.summary || "").slice(0, 300)}`
  );
  if (!secim && mevcut && mevcutSkor < 55) {
    const varlikAday = skorlu
      .filter(
        (x) =>
          !x.mevcut &&
          x.uygun &&
          (Number(x.onEk) || 0) >= 7 &&
          x.onPuan >= 95 &&
          !/filigran|watermark/i.test(String(x.neden || "")) &&
          ((x.alaka ?? 0) >= 40 || finansHaberi)
      )
      // Ürün fotoğrafında belirleyici olan görsel kalite: vision "çip değil"
      // diye 30 verse de temiz ürün karesi en iyi seçenektir.
      .sort((a, b) => b.onPuan - a.onPuan)[0];
    if (varlikAday) {
      secim = varlikAday;
      if (debug) console.log(`      · zayıf mevcut kapak: ürün adı eşleşen aday seçildi (${varlikAday.skor.toFixed(0)}p)`);
    }
  }

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
    // Özel durum: mevcut kapak bir EKRAN GÖRÜNTÜSÜ. İçeriği doğru ama ham hâli
    // amatör duruyor. Aynı kareyi cihaz kartı bileşimine alarak kapak kalitesini
    // yükseltiyoruz (bir kez; sonsuz döngü olmasın).
    if (
      mevcut?.tip === "ekran" &&
      mevcut.uygun &&
      article.kapak?.bilesim !== "ekran" &&
      (mevcut.alaka ?? 0) >= 55
    ) {
      const kaynakUrl = /^https?:\/\//i.test(String(article.kapak?.kaynak || ""))
        ? article.kapak.kaynak
        : "";
      const ham =
        (kaynakUrl && (await gorselIndir(kaynakUrl, { kok }).catch(() => null))) || mevcut.veri;
      const yazilan = await kapakYaz(article, ham, { kok, dry, tip: "ekran" });
      if (yazilan) {
        return {
          degisti: true,
          neden: "ekran görüntüsü cihaz bileşimine alındı",
          kapak: {
            ...article.kapak,
            foto: true,
            bilesim: "ekran",
            ajan: {
              v: 1,
              secim: "ekran-bilesimi",
              skor: Math.round(mevcutSkor),
              neden: "Ham ekran görüntüsü bulanık zemin + gölgeli ekran kartı olarak yeniden düzenlendi.",
              brif: brief.sahne,
              sorgular: brief.sorgular || [],
              tarih: new Date().toISOString(),
            },
          },
          brief,
          secim: {
            kaynak: "ekran-bilesimi",
            skor: Math.round(mevcutSkor),
            neden: "Ekran görüntüsü editoryal bileşime alındı",
            vision: true,
          },
          url: yazilan.url,
        };
      }
    }
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
  const yazilan = await kapakYaz(article, secim.veri, { kok, dry, tip: secim.tip });
  if (!yazilan) return { degisti: false, neden: "kapak yazılamadı", brief };

  const kapak = {
    v: 3,
    kaynak: secim.kaynak === "ai" ? `ai:${secim.model}` : secim.url,
    foto: true,
    ...(secim.kaynak === "ai" ? { ai: true } : {}),
    ...(secim.tip === "ekran" ? { bilesim: "ekran" } : {}),
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

