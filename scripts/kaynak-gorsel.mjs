// ==========================================================================
// KAYNAK İÇİ FOTOĞRAFLAR
// --------------------------------------------------------------------------
// NEDEN: Gövde aralarındaki fotoğraflar Wikimedia stoğundan geliyordu; arama
// tek kelimeyle eşleştiği için saçmalıyordu (Honor X9e telefon haberi →
// "Medal of Honor recipient ... grave" = mezar taşı). Okuyucu için yanlış
// fotoğraf, fotoğrafsızlıktan kötüdür.
//
// NE YAPAR: Haberin çıktığı sitenin KENDİ sayfasındaki gövde fotoğraflarını
// toplar (`<article>` içi `<img>` etiketleri) ve `article.images` alanına
// yazar. Bu fotoğraflar tanım gereği haberle ilgilidir: yayıncı onları kendi
// metninin içine koymuş.
//
// KULLANIM:
//   node scripts/kaynak-gorsel.mjs                 # son 3 gün, en fazla 200
//   node scripts/kaynak-gorsel.mjs --gun=7 --limit=400
//   node scripts/kaynak-gorsel.mjs --zorla         # images varsa da yenile
//   node scripts/kaynak-gorsel.mjs --id=<haber>
// ==========================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTICLES = path.join(KOK, "data", "articles.json");
const URL_TABANI = "/kapak";

const arg = (ad, varsayilan) => {
  const bulunan = process.argv.find((a) => a.startsWith(`--${ad}=`));
  return bulunan ? Number(bulunan.split("=")[1]) || varsayilan : varsayilan;
};
const gun = arg("gun", 3);
const limit = arg("limit", 200);
const paralel = arg("paralel", 5);
const zorla = process.argv.includes("--zorla");
const tekId = process.argv.find((a) => a.startsWith("--id="))?.split("=")[1] || null;
const debug = process.env.DEBUG_GORSEL === "1";

// Reklam/logo/ikon gibi haber fotoğrafı olmayan adresler.
const CAK = new RegExp(
  [
    "logo", "icon", "avatar", "favicon", "sprite", "placeholder", "default",
    "spacer", "blank", "pixel", "1x1", "banner", "reklam", "advert",
    "(^|[/_.-])ads?([/_.-]|$)", "adserver",
    // Şablon/arka plan görselleri: "mask-16-9.png", "bg-opa.png".
    "mask", "(^|[/_.-])bg([/_.-]|$)", "pattern", "texture", "overlay",
    "gradient", "watermark", "noimage", "no-image", "noscript",
    "share", "social", "whatsapp", "telegram", "facebook", "twitter",
    "instagram", "youtube", "app-store", "google-play", "emoji", "badge",
    "gravatar", "loading", "spinner",
    // Arayüz öğeleri: "next.png", "arrow.svg", "close", "play-button"…
    "next", "prev", "arrow", "close", "menu", "search", "play", "video-icon",
    "thumbnail", "tn_", "_tn", "-tn", "mini", "small", "kucuk", "sponsor",
    // Sosyal medya kısayolları ve site ikonları (ör. AA: x.png, insta.png).
    "insta", "podcast", "ombudsman", "language", "black-logo", "blue-logo",
    "appstore", "googleplay", "spot",
  ].join("|"),
  "i"
);

/** Adresin dosya adı (uzantısız). Kısa/jenerik adlar ikon olur: "x", "img1". */
function dosyaKok(adres) {
  try {
    const parca = new URL(adres).pathname.split("/").pop() || "";
    return decodeURIComponent(parca).replace(/\.[a-z0-9]+$/i, "");
  } catch {
    return "";
  }
}

/** Gövdeye ait olabilecek içerik yolları (galeri, haber, uploads...). */
const ICERIK_YOLU =
  /\/(uploads?|contents?|haber|news|article|editor|dosyalar|resimler|media|foto|gallery|wp-content)\//i;

/** Genel arayüz görseli mi? (kısa ad, ikon boyutu, "logo" gibi alt metin) */
function arayuzGorseliMi(adres, alt, sinif) {
  const kok = dosyaKok(adres);
  if (kok.length < 5) return true;
  if (/^(img|image|photo|pic|resim|foto|dsc|untitled|download|file|asset)[-_]?\d*$/i.test(kok)) return true;
  if (/^(logo|next|facebook|x\b|twitter|instagram|youtube|google play|app store|language|podcast|ombudsman|menu|search|arrow|reklam|banner)/i.test(alt)) return true;
  // Tailwind benzeri küçük ikon sınıfları: "w-10 h-10 object-contain".
  if (/\b(h|w)-(4|5|6|8|10|12|14)\b/.test(sinif) && /object-(contain|cover)/.test(sinif)) return true;
  return false;
}

/** Genişlik/yükseklik ipucu olan adreslerde makul ölçü ve oran ara. */
function boyutUygun(adres) {
  try {
    const u = new URL(adres);
    const g = (ad) => Number(u.searchParams.get(ad) || 0);
    const w = g("width") || g("w");
    const h = g("height") || g("h");
    if (w && w < 400) return false;
    if (h && h < 200) return false;
    if (w && h && (w / h > 4 || h / w > 3)) return false;
  } catch {}
  const m = adres.match(/[/_-](\d{2,4})x(\d{2,4})(?=[/_.?&-]|$)/);
  if (m) {
    const w = Number(m[1]);
    const h = Number(m[2]);
    if (w < 400 || h < 200) return false;
    if (w / h > 4 || h / w > 3) return false;
  }
  return true;
}

const htmlCoz = (s) =>
  String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&#0?38;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");

function mutlak(deger, taban) {
  const ham = htmlCoz(deger).trim();
  if (!ham || /^data:/i.test(ham) || /\.svg(\?|$)/i.test(ham)) return "";
  try {
    const u = new URL(ham, taban);
    if (!/^https?:$/.test(u.protocol)) return "";
    return u.href;
  } catch {
    return "";
  }
}

/** srcset içinden en büyük varyantı seçer. */
function srcsetEnBuyuk(deger, taban) {
  const parcalar = String(deger || "")
    .split(",")
    .map((p) => p.trim().split(/\s+/))
    .filter((p) => p[0]);
  let enIyi = "";
  let enIyiGenislik = -1;
  for (const [adres, boyut] of parcalar) {
    const w = Number(String(boyut || "").replace(/[^\d.]/g, "")) || 0;
    if (w >= enIyiGenislik) {
      enIyiGenislik = w;
      enIyi = adres;
    }
  }
  return mutlak(enIyi, taban);
}

function gorselKimlik(url) {
  return String(url || "")
    .toLowerCase()
    .split("?")[0]
    .split("#")[0]
    .replace(/\/wikipedia\/commons\/thumb\/([0-9a-f]\/[0-9a-f]{2}\/[^/]+)\/\d+px-[^/]+$/, "/wikipedia/commons/$1")
    .replace(/\/\d{2,4}x\d{2,4}\//, "/")
    .replace(/[-_]\d{2,4}x\d{2,4}(?=\.\w+$)/, "")
    .replace(/\.(jpe?g|png|webp|avif|gif)$/, "");
}

/**
 * Aynı fotoğrafın yeniden boyutlandırılmış kopyası mı?
 * Ör. kapak `thumbs_b_c_<hash>.jpg`, gövdedeki aday `thumbs_m_c_<hash>.jpg`
 * veya `foto-1280x720.jpg`. Hash ve boyut harfleri atılınca aynı iskelet kalır.
 */
function varyantMi(a, b) {
  const iskelet = (url) =>
    gorselKimlik(url)
      .split("/")
      .pop()
      .replace(/[0-9a-f]{12,}/g, "")
      .replace(/[_-][bsml](?=[_-])/g, "")
      .replace(/[_-](?=\d)|(?<=\d)[_-]/g, "");
  const x = iskelet(a);
  const y = iskelet(b);
  return Boolean(x && y && x === y);
}

/** Alt metni başka bir haberin başlığıysa fotoğraf bu habere ait değildir. */
function altAlakaliMi(alt, baslik) {
  const temiz = String(alt || "").trim();
  if (temiz.length < 25) return true;
  const kelimeler = (s) =>
    new Set(String(s || "").toLowerCase().match(/[a-zçğıöşü0-9]{4,}/g) || []);
  const a = kelimeler(temiz);
  const b = kelimeler(baslik);
  if (!a.size || !b.size) return true;
  for (const k of a) if (b.has(k)) return true;
  return false;
}

/**
 * Dosya adı metinle ilgili mi? (yalnızca `<figure>` dışı adaylar için)
 * "sosyal-medya-123.jpg" → "sosyal medya" haberi; "imac-kapak" → iMac haberi.
 * Adı yalnızca hash'ten oluşan fotoğraflarda karar verilemez, izin verilir.
 */
function dosyaAlakaliMi(adres, metin) {
  const kok = dosyaKok(adres).toLowerCase();
  const anlamli = kok
    .split(/[^a-z0-9çğıöşü]+/)
    .filter((w) => w.length >= 4 && /[a-zçğıöşü]/.test(w) && !/^[0-9a-f]{6,}$/.test(w));
  if (!anlamli.length) return true;
  const metinKelimeleri = new Set(
    String(metin || "").toLowerCase().match(/[a-zçğıöşü0-9]{4,}/g) || []
  );
  return anlamli.some((w) => metinKelimeleri.has(w));
}

/**
 * Sayfadaki gövde fotoğrafları.
 *
 * Sıra: `<article>` içi → yoksa tüm sayfa. `<figure>` içindeki fotoğraflar
 * (yayıncının alt yazıyla birlikte metne koyduğu gerçek gövde görselleri)
 * listenin başına alınır; arayüz parçaları (ok, kapat, reklam şeridi) elenir.
 *
 * KAÇ FOTOĞRAF: `<figure>` varsa en fazla 2; yoksa tek. Sebep: figure dışı
 * adaylar sayfanın "ilgili haberler / podcast / reklam" bölümlerinden de
 * gelebiliyor. İkinci fotoğrafı yalnızca yayıncı kendi metnine koyduysa al.
 */
function sayfaGorselleri(html, sayfaUrl, kapakUrl, baslik) {
  const govdeBaslangic = html.search(/<article[\s>]/i);
  const govdeVar = govdeBaslangic >= 0;
  const govde = govdeVar ? html.slice(govdeBaslangic) : html;
  // Kapakla aynı fotoğrafı gövdeye ikinci kez koymayalım. Kapak çoğu zaman
  // sayfanın og:image'i; boyut/varyant farkı yüzünden adres birebir tutmasa da
  // aynı görsel olduğu için og:image'i de dışla.
  const ogEtiket = html.match(/<meta[^>]+(?:property|name)=["']og:image(?::url)?["'][^>]*>/i);
  const ogIcerik = ogEtiket ? (ogEtiket[0].match(/content=["']([^"']+)["']/i) || [])[1] || "" : "";
  const haricKimlikler = new Set(
    [kapakUrl, ogIcerik]
      .map((u) => gorselKimlik(mutlak(u, sayfaUrl)))
      .filter(Boolean)
  );
  const haricAdresler = [kapakUrl, ogIcerik].map((u) => mutlak(u, sayfaUrl)).filter(Boolean);

  // <figure> aralıkları: bu blokların içindeki img'ler öncelikli.
  const figurAraliklari = [];
  const figurRe = /<figure\b[\s\S]*?<\/figure>/gi;
  let figurEslesme;
  while ((figurEslesme = figurRe.exec(govde))) {
    figurAraliklari.push([figurEslesme.index, figurEslesme.index + figurEslesme[0].length]);
  }
  const figurIcinde = (konum) =>
    figurAraliklari.some(([bas, son]) => konum >= bas && konum < son);

  const figurler = [];
  const digerleri = [];
  const gorulen = new Set();
  const imgRe = /<img\b[^>]*>/gi;
  let eslesme;
  while ((eslesme = imgRe.exec(govde))) {
    const etiket = eslesme[0];
    const ozellik = (ad) => {
      const m = etiket.match(new RegExp(`\\b${ad}\\s*=\\s*["']([^"']+)["']`, "i"));
      return m ? m[1] : "";
    };
    const srcset =
      srcsetEnBuyuk(ozellik("srcset"), sayfaUrl) ||
      srcsetEnBuyuk(ozellik("data-srcset"), sayfaUrl);
    const adres =
      srcset ||
      mutlak(ozellik("src"), sayfaUrl) ||
      mutlak(ozellik("data-src"), sayfaUrl) ||
      mutlak(ozellik("data-lazy-src"), sayfaUrl) ||
      mutlak(ozellik("data-original"), sayfaUrl);
    if (!adres) continue;
    const reddet = (sebep) => {
      if (debug) console.log(`    - ${sebep}: ${adres.slice(0, 100)}`);
      return true;
    };
    if (CAK.test(adres)) { reddet("çakışan ad"); continue; }
    if (arayuzGorseliMi(adres, htmlCoz(ozellik("alt")), ozellik("class"))) { reddet("arayüz görseli"); continue; }
    // Ölçü ipuçları: hem width/height nitelikleri hem adresteki ipuçları.
    const genislik = Number(ozellik("width")) || 0;
    const yukseklik = Number(ozellik("height")) || 0;
    if (genislik && genislik < 400) { reddet("dar"); continue; }
    if (yukseklik && yukseklik < 200) { reddet("kısa"); continue; }
    if (genislik && yukseklik && (genislik / yukseklik > 4 || yukseklik / genislik > 3)) { reddet("oran"); continue; }
    if (!boyutUygun(adres)) { reddet("ölçü ipucu"); continue; }
    // <article> etiketi yoksa sayfanın her yeri taranıyor: yalnızca içerik
    // yollarındaki (uploads, haber, news...) adreslere güven.
    const icerikYolu = ICERIK_YOLU.test(adres);
    if (!govdeVar && !icerikYolu) { reddet("içerik yolu değil"); continue; }
    const kimlik = gorselKimlik(adres);
    if (!kimlik || haricKimlikler.has(kimlik)) { reddet("kapakla aynı"); continue; }
    // Kapak/og:image'in farklı boyut ya da harf varyantı da aynı fotoğraftır.
    if (haricAdresler.some((h) => varyantMi(h, adres))) { reddet("kapak varyantı"); continue; }
    // Alt metni başka bir haberin başlığıysa bu fotoğraf "ilgili haberler"
    // bölümünden gelmiştir; metni pekiştirmez.
    if (!altAlakaliMi(htmlCoz(ozellik("alt")), baslik)) { reddet("başka haberin alt metni"); continue; }
    const figur = figurIcinde(eslesme.index);
    // Figure dışı adaylar sayfanın başka bölümlerinden gelebiliyor: dosya adı
    // metinle hiç örtüşmüyorsa (ör. OpenAI haberinde "imac-kapak") ele.
    if (!figur && !dosyaAlakaliMi(adres, baslik)) { reddet("dosya adı metinle ilgisiz"); continue; }
    if (gorulen.has(kimlik)) { reddet("tekrar"); continue; }
    gorulen.add(kimlik);
    const kayit = { adres, icerikYolu };
    (figur ? figurler : digerleri).push(kayit);
  }

  if (figurler.length) return figurler.slice(0, 2).map((k) => ({ url: k.adres, figur: true }));
  // Figure yok: önce içerik yolu görselleri, yoksa belgedeki ilk aday.
  const ilk = digerleri.find((k) => k.icerikYolu) || digerleri[0];
  return ilk ? [{ url: ilk.adres, figur: false }] : [];
}

/** Görselin gerçek ölçüsü (PNG/JPEG/WebP/GIF başlığından). Bilinemezse null. */
function baytBoyut(b) {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  if (b.length > 10 && b.toString("ascii", 0, 3) === "GIF") {
    return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  }
  if (b.length > 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const tur = b.toString("ascii", 12, 16);
    if (tur === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (tur === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (tur === "VP8L") {
      const v = b.readUInt32LE(21);
      return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 };
    }
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const isaret = b[i + 1];
      if (isaret >= 0xc0 && isaret <= 0xcf && isaret !== 0xc4 && isaret !== 0xc8 && isaret !== 0xcc) {
        return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      }
      const uzunluk = b.readUInt16BE(i + 2);
      if (!uzunluk) break;
      i += 2 + uzunluk;
    }
  }
  return null;
}

/**
 * Fotoğrafın gerçekten büyük bir görsel olduğunu doğrula. Adres/ölçü ipuçları
 * yanıltıcı olabiliyor (şablon PNG'ler 1920×1080 görünüyor); gerçek baytlar
 * daha güvenilir. Ağ hatasında null → aday korunur.
 */
async function gorselOlcu(url) {
  try {
    const yanit = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; HaberinAi/1.0; +https://haberinai.site)",
        range: "bytes=0-65535",
      },
      signal: AbortSignal.timeout(8000),
    });
    const tur = String(yanit.headers.get("content-type") || "");
    if (tur && !/^image\//i.test(tur)) return { w: 0, h: 0 };
    return baytBoyut(Buffer.from(await yanit.arrayBuffer()));
  } catch {
    return null;
  }
}

async function sayfaIndir(adres) {
  const yanit = await fetch(adres, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; HaberinAi/1.0; +https://haberinai.site)",
      "accept-language": "tr,en;q=0.8",
      accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
  });
  if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`);
  return (await yanit.text()).slice(0, 900000);
}

const ham = fs.readFileSync(ARTICLES, "utf8");
const satirSonu = ham.includes("\r\n") ? "\r\n" : "\n";
const articles = JSON.parse(ham);
const esik = Date.now() - gun * 86400000;

const hedefler = articles
  .filter((a) => {
    if (!a || !a.id) return false;
    if (tekId) return a.id === tekId;
    if (!/^https?:\/\//i.test(String(a.sourceUrl || ""))) return false;
    if (!zorla && Array.isArray(a.images) && a.images.length) return false;
    const t = Date.parse(a.publishedAt || a.generatedAt || 0);
    return Number.isFinite(t) && t >= esik;
  })
  .sort(
    (a, b) =>
      Date.parse(b.publishedAt || b.generatedAt || 0) - Date.parse(a.publishedAt || a.generatedAt || 0)
  )
  .slice(0, limit);

console.log(`Kaynak içi fotoğraf: ${hedefler.length} haber hedefte (son ${gun} gün).`);

async function havuz(dizi, esZamanli, islev) {
  let imlec = 0;
  const isciler = Array.from({ length: Math.min(esZamanli, dizi.length) }, async () => {
    while (imlec < dizi.length) await islev(dizi[imlec++]);
  });
  await Promise.all(isciler);
}

let bulunan = 0;
let bos = 0;
let hata = 0;

await havuz(hedefler, paralel, async (a) => {
  try {
    const html = await sayfaIndir(a.sourceUrl);
    const kapak = a.kapak?.kaynak || (/^https?:/i.test(String(a.image)) ? a.image : "");
    let adaylar = sayfaGorselleri(
      html,
      a.sourceUrl,
      kapak,
      `${a.title || ""} ${a.summary || ""}`
    ).slice(0, 2);
    // Figure dışı adaylar için gerçek ölçüyü doğrula: şablon/boş görseller
    // (paylaşılan "mask-16-9.png" gibi) burada elenir.
    const dogrulanmis = [];
    for (const aday of adaylar) {
      if (!aday.figur) {
        const olcu = await gorselOlcu(aday.url);
        if (olcu && (olcu.w < 600 || olcu.h < 300 || olcu.w / olcu.h > 4 || olcu.h / olcu.w > 3)) {
          if (debug) console.log(`    - küçük/bozuk görsel: ${aday.url.slice(0, 100)} (${olcu.w}x${olcu.h})`);
          continue;
        }
      }
      dogrulanmis.push(aday.url);
    }
    const urls = dogrulanmis;
    if (urls.length) {
      a.images = urls;
      a.imagesKaynak = a.sourceUrl;
      bulunan++;
      if (debug) console.log(`  ✓ ${a.id} ${urls.length} foto: ${urls[0].slice(0, 90)}`);
    } else {
      delete a.images;
      delete a.imagesKaynak;
      bos++;
      if (debug) console.log(`  · ${a.id} gövde fotoğrafı yok`);
    }
    // Deneme zamanı: aynı haber her turda yeniden çekilmesin.
    a.gorselDeneme = new Date().toISOString();
  } catch (err) {
    hata++;
    if (debug) console.warn(`  ! ${a.id}: ${err.message}`);
  }
});

// 30 günden eski "gövde fotoğrafı yok" kayıtlarını temizle (veri şişmesin).
if (!tekId) {
  const sinir = Date.now() - 30 * 86400000;
  for (const a of articles) {
    if (!a || !a.gorselDeneme) continue;
    if (Date.parse(a.gorselDeneme) < sinir) delete a.gorselDeneme;
  }
}

if (bulunan || bos) {
  fs.writeFileSync(ARTICLES, JSON.stringify(articles, null, 2).replace(/\n/g, satirSonu) + satirSonu);
}

console.log(
  `Kaynak içi fotoğraf: ${bulunan} habere fotoğraf eklendi, ${bos} haberde gövde fotoğrafı yok` +
    `${hata ? `, ${hata} hata` : ""}.`
);
