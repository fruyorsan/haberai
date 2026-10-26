// ==========================================================================
// MARKALI KAPAK ÜRETİCİ (16:9, 1280×720)
// --------------------------------------------------------------------------
// NEDEN: Kapak fotoğrafları rastgele Wikimedia kareleriydi; boyut, oran ve
// tipografi haberden habere değişiyordu. Feed'de (Discover, WhatsApp, X,
// Telegram) tutarsız görünüm tıklamayı düşürüyor.
//
// NE YAPAR: Telif güvenli mevcut fotoğrafı 1280×720'ye kırpar, altına koyu
// gradyan + başlık + kategori etiketi + site işareti basar ve
// `site/public/kapak/<id>.webp` olarak yazar. Böylece her kare aynı düzende
// görünür (ShiftDelete/Webtekno'nun görsel tutarlılığının bizdeki karşılığı).
//
// TELİF: Taban fotoğraf değişmez, yalnızca kırpılıp üzerine yazı basılır.
// Atıf `gorselKaynak` alanında korunur; kaynak adres `kapak.kaynak`ta durur.
//
// KULLANIM:
//   npm run kapak                  → indekste açık (aktif) haberler
//   npm run kapak -- --gun=3       → son 3 gün
//   npm run kapak -- --limit=20    → en fazla 20
//   npm run kapak -- --zorla       → kapak varsa da yeniden üret
//   npm run kapak -- --dry
// ==========================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTICLES = path.join(KOK, "data", "articles.json");
const INDEKS = path.join(KOK, "data", "indeks.json");
const CIKTI_DIZIN = path.join(KOK, "site", "public", "kapak");
const URL_TABANI = "/kapak";

const GENISLIK = 1280;
const YUKSEKLIK = 720;
const KALITE = 74;
// Kart boyu: ana sayfada 30 kapak 1280 px indirmesin diye küçük varyant.
const KUCUK_GENISLIK = 480;

const arg = (ad, varsayilan) => {
  const bulunan = process.argv.find((a) => a.startsWith(`--${ad}=`));
  return bulunan ? Number(bulunan.split("=")[1]) || varsayilan : varsayilan;
};
const dry = process.argv.includes("--dry");
const zorla = process.argv.includes("--zorla");
const gun = arg("gun", 0);
const limit = arg("limit", 2000);

// ------------------------------------------------------------------ veri
const ham = fs.readFileSync(ARTICLES, "utf8");
const satirSonu = ham.includes("\r\n") ? "\r\n" : "\n";
const articles = JSON.parse(ham);

function aktifIdler() {
  if (!fs.existsSync(INDEKS)) return new Set();
  try {
    const d = JSON.parse(fs.readFileSync(INDEKS, "utf8"));
    return new Set((Array.isArray(d.ids) ? d.ids : []).map(String));
  } catch {
    return new Set();
  }
}

const aktif = aktifIdler();
const esik = gun > 0 ? Date.now() - gun * 86400000 : 0;

const hedefler = articles
  .filter((a) => {
    if (!a || !a.id) return false;
    if (!zorla && typeof a.image === "string" && a.image.startsWith(`${URL_TABANI}/`)) return false;
    if (!a.image) return false;
    if (gun > 0) {
      const t = Date.parse(a.publishedAt || a.generatedAt || 0);
      return Number.isFinite(t) && t >= esik;
    }
    return aktif.has(String(a.id));
  })
  .slice(0, limit);

console.log(
  `Kapak: ${hedefler.length} haber hedefte ` +
    `(${gun > 0 ? `son ${gun} gün` : `indekste açık ${aktif.size} haber`})` +
    `${dry ? " [dry]" : ""}`
);

// ------------------------------------------------------------- yardımcılar
const XML = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// ------------------------------------------------------ görsel uygunluğu
// Sorun: arama bazen "1280px-thumbnail.jpg" gibi jenerik bir Commons karesi
// döndürüyor; haber kiraz hasadıyken kare Amerikan marketi olabiliyor.
// Kural: dosya adı jenerikse VEYA arama sorgusuyla hiç ortak kelime yoksa
// fotoğraf reddedilir. Reddedilen fotoğrafın yerine önce Openverse (CC0/CC BY)
// aranır, bulunamazsa fotoğrafsız markalı kart üretilir. Yanlış fotoğraf,
// fotoğrafsız karttan daha çok güven kaybettirir.

const JENERIK = /(thumbnail|placeholder|default|untitled|noimage|no-image|generic|dummy|stock|screenshot|ekran|wikipedia|wiki|logo|wordmark|diagram|chart|graph|harita|map|icon|drawing|clipart|^img|^image|^photo|^dsc|^px[-_]?)/i;

// Fotoğrafın güvenilir sayıldığı kategoriler: buralarda Commons'ta gerçek
// ürün/cihaz kareleri var. Gündem/Dünya/Spor/Ekonomi gibi haberlerde stok
// fotoğraf neredeyse her zaman yanlış olduğu için marka adı geçmiyorsa
// fotoğraf hiç kullanılmaz — yanlış kare, tasarımlı kareden daha çok güven
// kaybettiriyor.
const FOTO_KATEGORI = new Set([
  "Teknoloji",
  "Mobil",
  "Donanım",
  "Yazılım",
  "İnternet",
  "Oyun",
  "Bilim",
  "Uzay",
  "Otomobil",
  "Yapay Zeka",
]);

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "at", "for", "with", "to", "from",
  "turkey", "turkish", "turkiye", "istanbul", "new", "photo", "image", "file", "commons",
]);

const TR_ASCII = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

const tokenler = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[çğıöşüâîû]/g, (c) => TR_ASCII[c] || c)
    .replace(/\.(jpe?g|png|webp|avif|gif)$/i, "")
    .replace(/^\d+px-/, "")
    .split(/[^a-z0-9]+/)
    .map((t) => t.replace(/(lari|leri|lar|ler|s)$/i, ""))
    .filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t));

/** Başlıktaki özel ad (marka, kulüp, kişi, yer) fotoğraf adında geçiyor mu? */
function ozelAdUyuyor(url, baslik) {
  const adK = new Set(tokenler(decodeURIComponent(String(url || "").split("/").pop() || "")));
  const adaylar = String(baslik || "")
    .split(/[\s,.;:!?'"()’“”–—-]+/)
    .filter((w) => w.length > 3);
  return adaylar.some((w) => {
    const t = tokenler(w).join("");
    return t.length > 3 && [...adK].some((k) => k.includes(t) || t.includes(k));
  });
}

/**
 * Kapak fotoğrafı habere gerçekten uyuyor mu?
 * "Turkey cherry orchard" sorgusunun "Cherry Point" askeri üssündeki hindi
 * bovlingi fotoğrafını getirmesi gibi eşleşmeleri kesmek için sorgu
 * kelimelerinin çoğunluğu dosya adında geçmek zorunda.
 */
function uygunMu(url, sorgu) {
  const ad = decodeURIComponent(String(url || "").split("/").pop() || "");
  if (!ad || JENERIK.test(ad)) return false;
  const adKelimeleri = new Set(tokenler(ad));
  const sorguKelimeleri = [...new Set(tokenler(sorgu))];
  if (!sorguKelimeleri.length) return true;
  const eslesen = sorguKelimeleri.filter((k) => adKelimeleri.has(k)).length;
  const oran = eslesen / sorguKelimeleri.length;
  return eslesen >= 2 || oran >= 0.75;
}

// Openverse: Wikimedia dışında CC0 / CC BY lisanslı fotoğraf havuzu (ücretsiz).
let openverseSon = 0;
async function openverseAra(sorgu) {
  const bekle = 1500 - (Date.now() - openverseSon);
  if (bekle > 0) await new Promise((r) => setTimeout(r, bekle));
  openverseSon = Date.now();
  const u =
    "https://api.openverse.org/v1/images/?" +
    new URLSearchParams({
      q: sorgu,
      license: "cc0,by,by-sa",
      size: "large",
      page_size: "10",
    });
  const yanit = await fetch(u, {
    headers: { "user-agent": "HaberinAi/1.0 (https://haberinai.site)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!yanit.ok) throw new Error(`Openverse HTTP ${yanit.status}`);
  const d = await yanit.json();
  const sorguKelimeleri = tokenler(sorgu);
  const adaylar = (Array.isArray(d.results) ? d.results : [])
    .filter((r) => r?.url && (r.width || 0) >= 1100 && (r.height || 0) >= 600)
    .filter((r) => {
      const metin = `${r.title || ""} ${(r.tags || []).map((t) => t.name).join(" ")}`.toLowerCase();
      return sorguKelimeleri.some((k) => metin.includes(k));
    })
    .sort((a, b) => (b.width || 0) - (a.width || 0));
  const secili = adaylar[0];
  if (!secili) return null;
  return {
    url: secili.url,
    yazar: secili.creator || "Openverse",
    lisans: String(secili.license || "CC").toUpperCase() + (secili.license_version ? ` ${secili.license_version}` : ""),
    lisansUrl: secili.license_url || "",
    sayfa: secili.foreign_landing_url || secili.url,
  };
}


/** Kaba genişlik tahmini: SVG'de metin ölçümü yok, karakter sınıfına göre. */
function genislikTahmini(metin, punto) {
  let toplam = 0;
  for (const ch of metin) {
    if (ch === " ") toplam += 0.27;
    else if (/[A-ZÇĞİÖŞÜ]/.test(ch)) toplam += 0.64;
    else if (/[a-zçğıöşü0-9]/.test(ch)) toplam += 0.53;
    else if (/[.,:;!'’|]/.test(ch)) toplam += 0.26;
    else toplam += 0.58;
  }
  return toplam * punto;
}

/** Başlığı en fazla `satir` satıra böler, sığmazsa son satırı üç noktayla keser. */
function sar(metin, punto, azamiGenislik, satir = 3) {
  const kelimeler = String(metin).trim().split(/\s+/).filter(Boolean);
  const satirlar = [];
  let mevcut = "";
  for (const kelime of kelimeler) {
    const aday = mevcut ? `${mevcut} ${kelime}` : kelime;
    if (genislikTahmini(aday, punto) <= azamiGenislik || !mevcut) {
      mevcut = aday;
    } else {
      satirlar.push(mevcut);
      mevcut = kelime;
      if (satirlar.length === satir) break;
    }
  }
  if (satirlar.length < satir && mevcut) satirlar.push(mevcut);

  // Taşan satırları üç noktayla kes.
  const kesik = satirlar.slice(0, satir);
  if (satirlar.length > satir || (mevcut && satirlar.length === satir && kesik[satir - 1] !== mevcut)) {
    let son = kesik[satir - 1] || "";
    while (son.length > 1 && genislikTahmini(`${son}…`, punto) > azamiGenislik) {
      son = son.slice(0, -1).trimEnd();
    }
    kesik[satir - 1] = `${son}…`;
  }
  return kesik;
}

/** Başlık için en büyük sığan puntoyu seçer. */
function puntoSec(baslik, azamiGenislik) {
  for (const punto of [66, 60, 54, 48, 42]) {
    const satirlar = sar(baslik, punto, azamiGenislik);
    const sigar = satirlar.every((s) => genislikTahmini(s, punto) <= azamiGenislik);
    if (sigar && satirlar.length <= 3) return { punto, satirlar };
  }
  const punto = 42;
  return { punto, satirlar: sar(baslik, punto, azamiGenislik) };
}

const kategoriAdi = (a) => String(a.category || "Haber").toLocaleUpperCase("tr");

function kapakSvg(a, baslik) {
  const kenar = 56;
  const azamiGenislik = GENISLIK - kenar * 2 - 10;
  const { punto, satirlar } = puntoSec(baslik, azamiGenislik);
  const satirYuksekligi = Math.round(punto * 1.16);

  // Başlık bloğu alttan yukarı yerleşir.
  const tabanY = 620;
  const blokUst = tabanY - (satirlar.length - 1) * satirYuksekligi - punto * 0.74;
  const etiketY = Math.max(120, blokUst - 54);

  const satirMetni = satirlar
    .map(
      (satir, i) =>
        `<text x="${kenar}" y="${Math.round(tabanY - (satirlar.length - 1 - i) * satirYuksekligi)}" ` +
        `font-size="${punto}" font-weight="700" fill="#ffffff" letter-spacing="-0.5">${XML(satir)}</text>`
    )
    .join("\n    ");

  const chipMetin = XML(kategoriAdi(a));
  const chipGenislik = Math.round(genislikTahmini(kategoriAdi(a), 22) + 34);

  return `<svg width="${GENISLIK}" height="${YUKSEKLIK}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="alt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0"/>
      <stop offset="0.45" stop-color="#000000" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.92"/>
    </linearGradient>
    <linearGradient id="ust" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${GENISLIK}" height="200" fill="url(#ust)"/>
  <rect y="${Math.max(0, etiketY - 210)}" width="${GENISLIK}" height="${YUKSEKLIK - Math.max(0, etiketY - 210)}" fill="url(#alt)"/>

  <g font-family="Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif">
    <rect x="${kenar}" y="${etiketY}" width="${chipGenislik}" height="38" rx="6" fill="#d81f26"/>
    <text x="${kenar + 17}" y="${etiketY + 26}" font-size="22" font-weight="700" fill="#ffffff" letter-spacing="1">${chipMetin}</text>

    ${satirMetni}

    <g opacity="0.92">
      <rect x="${GENISLIK - kenar - 168}" y="42" width="168" height="42" rx="8" fill="#000000" fill-opacity="0.38"/>
      <text x="${GENISLIK - kenar - 84}" y="70" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="-0.3">haberinai</text>
    </g>
  </g>
</svg>`;
}

// Fotoğrafı getir (Wikimedia 403 vermesin diye UA gönderilir).
async function gorselIndir(url) {
  const yerel = String(url || "");
  if (yerel.startsWith("/")) {
    const dosya = path.join(KOK, "site", "public", ...yerel.split("/").filter(Boolean));
    if (fs.existsSync(dosya)) return fs.readFileSync(dosya);
    return null;
  }
  const yanit = await fetch(yerel, {
    headers: {
      "user-agent": "HaberinAi/1.0 (https://haberinai.site; kapak uretimi)",
      accept: "image/avif,image/webp,image/jpeg,image/png,*/*",
      "accept-language": "tr",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`);
  return Buffer.from(await yanit.arrayBuffer());
}

async function kapakUret(a) {
  const dosya = path.join(CIKTI_DIZIN, `${a.id}.webp`);
  // Daha önce üretilmiş kapağın taban fotoğrafı `kapak.kaynak`ta durur.
  const kaynak = a.kapak?.kaynak || a.image;
  const sorgu = a.gorselSorgu || a.title || "";

  const indir = async (url) => {
    try {
      const veri = await gorselIndir(url);
      if (!veri) return null;
      // 16:9 kırp; "attention" yüzü/konuyu merkeze almaya çalışır.
      return await sharp(veri)
        .resize(GENISLIK, YUKSEKLIK, { fit: "cover", position: sharp.strategy.attention })
        .modulate({ saturation: 1.06 })
        .toBuffer();
    } catch {
      return null;
    }
  };

  let taban = null;
  let yeniAtif = null;
  let fotoVar = false;

  const fotoIzinli =
    uygunMu(kaynak, sorgu) &&
    (FOTO_KATEGORI.has(String(a.category || "")) || ozelAdUyuyor(kaynak, a.title));

  if (fotoIzinli) {
    taban = await indir(kaynak);
    fotoVar = Boolean(taban);
  }

  if (!taban && FOTO_KATEGORI.has(String(a.category || ""))) {
    try {
      const ov = await openverseAra(sorgu);
      if (ov) {
        taban = await indir(ov.url);
        if (taban) {
          fotoVar = true;
          yeniAtif = {
            yazar: ov.yazar,
            lisans: ov.lisans,
            lisansUrl: ov.lisansUrl,
            sayfa: ov.sayfa,
          };
          console.log(`   ↻ uygun olmayan fotoğraf yerine Openverse: ${ov.sayfa.slice(0, 70)}`);
        }
      }
    } catch (err) {
      console.warn(`   ! Openverse: ${err.message}`);
    }
  }

  if (!taban) {
    // Fotoğraf yoksa/uygun değilse markalı zemin: koyu lacivert + marka izleri
    // + kategori baş harfi (boş kare "yükleniyor" gibi görünmesin).
    const harf = XML((a.category || "H").trim().charAt(0).toLocaleUpperCase("tr"));
    taban = await sharp({
      create: { width: GENISLIK, height: YUKSEKLIK, channels: 3, background: "#14181f" },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="${GENISLIK}" height="${YUKSEKLIK}" xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="${GENISLIK}" height="${YUKSEKLIK}" fill="#14181f"/>
              <circle cx="1080" cy="120" r="240" fill="#d81f26" fill-opacity="0.22"/>
              <circle cx="120" cy="660" r="200" fill="#d81f26" fill-opacity="0.12"/>
              <text x="1210" y="470" font-family="Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif"
                    font-size="520" font-weight="700" fill="#ffffff" fill-opacity="0.06"
                    text-anchor="end">${harf}</text>
            </svg>`
          ),
        },
      ])
      .png()
      .toBuffer();
  }

  const svg = kapakSvg(a, a.title || "Haber");
  const bilesik = await sharp(taban)
    .composite([{ input: Buffer.from(svg) }])
    .webp({ quality: KALITE, effort: 4 })
    .toBuffer();

  if (!dry) {
    fs.mkdirSync(CIKTI_DIZIN, { recursive: true });
    fs.writeFileSync(dosya, bilesik);
    // Küçük varyant: liste/kart görünümü için (~20 KB).
    await sharp(bilesik)
      .resize(KUCUK_GENISLIK, Math.round((KUCUK_GENISLIK * YUKSEKLIK) / GENISLIK))
      .webp({ quality: 78, effort: 4 })
      .toFile(dosya.replace(/\.webp$/, "-480.webp"));
  }
  return { url: `${URL_TABANI}/${a.id}.webp`, atif: yeniAtif, foto: fotoVar };
}

// ------------------------------------------------------- küçük varyant modu
// 1280 px kapaklar üretildikten sonra eksik 480 px kart varyantlarını tamamlar.
if (process.argv.includes("--varyant")) {
  const hedefKucuk = (f) => path.join(CIKTI_DIZIN, f.replace(/\.webp$/, "-480.webp"));
  let sayi = 0;
  if (fs.existsSync(CIKTI_DIZIN)) {
    for (const f of fs.readdirSync(CIKTI_DIZIN)) {
      if (!f.endsWith(".webp") || f.endsWith("-480.webp")) continue;
      const kucuk = hedefKucuk(f);
      if (fs.existsSync(kucuk)) continue;
      await sharp(path.join(CIKTI_DIZIN, f))
        .resize(KUCUK_GENISLIK, Math.round((KUCUK_GENISLIK * YUKSEKLIK) / GENISLIK))
        .webp({ quality: 78, effort: 4 })
        .toFile(kucuk);
      sayi++;
    }
  }
  console.log(`${sayi} küçük kapak varyantı üretildi.`);
  process.exit(0);
}

// ------------------------------------------------------------------ çalıştır
let uretilen = 0;
let hata = 0;

for (const a of hedefler) {
  const eski = a.image;
  const taban = a.kapak?.kaynak || eski;
  try {
    const sonuc = await kapakUret(a);
    console.log(`${dry ? "[dry] " : ""}${a.title.slice(0, 70)} → ${sonuc.url}`);
    if (!dry) {
      a.image = sonuc.url;
      a.kapak = { v: 1, kaynak: taban, foto: sonuc.foto };
      if (sonuc.atif) a.gorselKaynak = sonuc.atif;
    }
    uretilen++;
  } catch (err) {
    hata++;
    console.warn(`  ! ${a.id}: ${err.message}`);
  }
}

if (!dry && uretilen) {
  fs.writeFileSync(ARTICLES, JSON.stringify(articles, null, 2).replace(/\n/g, satirSonu) + satirSonu);
}
console.log(
  `\n${uretilen} kapak ${dry ? "üretilecek" : "üretildi"}` + (hata ? `, ${hata} hata` : "") + "."
);
