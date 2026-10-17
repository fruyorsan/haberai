// HABER İÇİ EK FOTOĞRAFLAR
//
// Haber sayfalarında şimdiye kadar yalnızca kapak fotoğrafı vardı. Okuyucu metnin
// içinde de fotoğraf görsün diye kaynak sayfadan 1-2 ek GERÇEK fotoğraf toplanır ve
// habere `images` alanı olarak yazılır; site bu alanı gövde paragraflarının arasına
// yerleştirir (kaynak atfıyla birlikte).
//
// EN ÖNEMLİ KURAL — YANLIŞ FOTOĞRAF GÖSTERME:
// Kaynak sayfada haberle ilgisiz fotoğraflar da bulunur (yan sütundaki "diğer
// haberler" küçük resimleri, reklamlar, logolar, sitenin genel görseli). Bunları
// haberin içine koymak okuyucu güvenini sarsar. Bu yüzden ek fotoğraf yalnızca
// "aynı haber" olduğu kanıtlanabilen adaylardan seçilir:
//   * aynı alan adı, VE
//   * kapak görselinin ya da kaynak sayfa adresinin ayırt edici bir sözcüğünü
//     (8+ harf, genel kelime değil) paylaşıyor, ya da haber kimliği (ör. /haber/211746/)
//     aynı.
// Kanıt yoksa ek fotoğraf eklenmez; kapak fotoğrafı yeterlidir.
//
// Diğer kurallar:
// - Kapakla aynı fotoğrafın farklı boyut sürümü tekrar eklenmez (dosya adı/kimlik karşılaştırması).
// - Yalnızca kalite eşiğini geçen (yeterince büyük, logo/ikon olmayan, aşırı ince olmayan)
//   fotoğraflar alınır.
// - Bakılan haber `imagesAt` ile işaretlenir; aynı sayfa defalarca indirilmez. Sayfa hiç
//   açılamadıysa işaret KONMAZ, haber sonraki turda yeniden denenir.
//
// Kullanım:
//   npm run ek-gorsel              (varsayılan 6 haber)
//   EK_GORSEL_LIMIT=20 npm run ek-gorsel
//   node src/ek-gorsel.mjs --dry   (ağa çıkmadan listeler)

import { readFile, writeFile } from "node:fs/promises";
import { fetchPageExtras } from "./fetcher.js";
import { looksLikeIcon, passesQuality, probeImage } from "./gorsel.js";

const FILE = "data/articles.json";
const LIMIT = Number(process.env.EK_GORSEL_LIMIT || 6);
const DRY = process.argv.includes("--dry");

const EN_AZ_GENISLIK = 900; // haber içinde gösterilecek fotoğraf için en küçük genişlik
const MAX_ADAY = 8; // haber başına ölçülecek en fazla aday (ağ maliyeti)
const HEDEF = 2; // haber başına en fazla ek fotoğraf
const BEKLEME_MS = 400; // kaynak siteleri yormamak için turlar arasında bekleme

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

/** Aynı fotoğrafın farklı boyut sürümlerini aynı kabul etmek için kimlik üretir. */
function fotoKimlik(url) {
  return String(url || "")
    .split("?")[0]
    .split("#")[0]
    .replace(/-\d{2,4}x\d{2,4}(?=\.(?:jpe?g|png|webp|avif)$)/i, "")
    .replace(/\.(?:jpe?g|png|webp|avif)$/i, "")
    .toLowerCase();
}

/** Ayırt edici dosya adı kökü: boyut eki ve uzantı atılır ("…/800x450/6ad311ef.jpg" → "6ad311ef"). */
function fotoAd(url) {
  try {
    const ad = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    const kok = ad
      .replace(/^-?\d{2,4}x\d{2,4}/i, "")
      .replace(/-\d{2,4}x\d{2,4}(?=\.[a-z0-9]+$)/i, "")
      .replace(/\.[a-z0-9]+$/i, "")
      .toLowerCase();
    return kok.length >= 8 ? kok : "";
  } catch {
    return "";
  }
}

// Ayırt edici sözcük sayılmayan, her haberde/sitede geçen kelimeler.
const GENEL_KELIMELER = new Set([
  "haberler", "haberi", "haberin", "guncel", "gorsel", "gorseli", "kapak", "resim",
  "images", "image", "fotograf", "fotografi", "default", "thumbnail", "buyuk", "kucuk",
  "icerik", "icerikler", "content", "media", "photo", "photos", "manset", "video",
  "webtv", "upload", "uploads", "static", "assets", "dosya", "belge", "yukleniyor",
  "kategori", "detay", "sayfa", "index", "pictures", "pictures",
]);

/** URL yolundaki ayırt edici sözcükler (alan adı parçaları hariç). */
function ayirtEdiciKelimeler(url, yoksay) {
  let yol = "";
  try {
    yol = decodeURIComponent(new URL(url).pathname);
  } catch {
    yol = String(url);
  }
  const kume = new Set();
  for (const p of yol.toLowerCase().split(/[^a-z0-9çğıöşüâîû]+/)) {
    if (p.length < 8 || /^\d+$/.test(p)) continue;
    if (GENEL_KELIMELER.has(p) || yoksay.has(p)) continue;
    kume.add(p);
  }
  return kume;
}

/** URL yolundaki haber kimliği gibi görünen uzun sayılar (ör. /haber/211746/). */
function ayirtEdiciIdler(url) {
  let yol = "";
  try {
    yol = new URL(url).pathname;
  } catch {
    yol = String(url);
  }
  return yol.match(/\d{5,}/g) || [];
}

function hostAl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Aday fotoğraf gerçekten BU habere mi ait? */
function ayniHaberMi(adayUrl, host, kelimeler, idler) {
  let u;
  try {
    u = new URL(adayUrl);
  } catch {
    return false;
  }
  if (u.hostname.replace(/^www\./, "").toLowerCase() !== host) return false;

  for (const k of ayirtEdiciKelimeler(adayUrl, new Set())) if (kelimeler.has(k)) return true;
  for (const id of u.pathname.match(/\d{5,}/g) || []) if (idler.has(id)) return true;
  return false;
}

/** Bir haber için kaynak sayfadan en fazla `HEDEF` ek fotoğraf seçer. */
async function ekFotoSec(article) {
  const host = hostAl(article.sourceUrl);
  const kapak = String(article.image || "");

  const { images, text } = await fetchPageExtras(article.sourceUrl);
  if (!text) return { sonuc: null, neden: "sayfa açılamadı" }; // işaret koyma, tekrar dene

  // "Aynı haber" kanıtı: kapak görselinin ve kaynak sayfanın ayırt edici sözcükleri.
  // Alan adı parçaları (ör. "donanimhaber", "yenisafak") kanıt sayılmaz.
  const yoksay = new Set(host.split(/[.-]/).filter((p) => p.length >= 5));
  const kelimeler = new Set([
    ...ayirtEdiciKelimeler(kapak, yoksay),
    ...ayirtEdiciKelimeler(article.sourceUrl, yoksay),
  ]);
  const idler = new Set([...ayirtEdiciIdler(kapak), ...ayirtEdiciIdler(article.sourceUrl)]);

  const gorulenKimlik = new Set([fotoKimlik(kapak)]);
  const gorulenAd = new Set([fotoAd(kapak)]);
  const secilen = [];
  let elenen = { ilgisiz: 0, kapakTekrari: 0, kalitesiz: 0 };

  for (const aday of (images || []).slice(0, MAX_ADAY)) {
    if (secilen.length >= HEDEF) break;
    if (!/^https?:\/\//i.test(String(aday)) || looksLikeIcon(aday)) continue;

    // 1) Kapakla aynı fotoğrafın başka boyutu mu?
    const kimlik = fotoKimlik(aday);
    const ad = fotoAd(aday);
    if (gorulenKimlik.has(kimlik) || (ad && gorulenAd.has(ad))) {
      elenen.kapakTekrari++;
      continue;
    }

    // 2) Gerçekten bu haberin fotoğrafı mı? (yan sütun/reklam/logo elenir)
    if (!ayniHaberMi(aday, host, kelimeler, idler)) {
      elenen.ilgisiz++;
      continue;
    }

    // 3) Kalite eşiği
    const bilgi = await probeImage(aday);
    if (!passesQuality(bilgi) || (bilgi?.width || 0) < EN_AZ_GENISLIK) {
      elenen.kalitesiz++;
      continue;
    }

    gorulenKimlik.add(kimlik);
    if (ad) gorulenAd.add(ad);
    secilen.push(bilgi.finalUrl || aday);
  }

  const neden = secilen.length
    ? `uygun (kapak tekrarı: ${elenen.kapakTekrari}, ilgisiz: ${elenen.ilgisiz}, kalitesiz: ${elenen.kalitesiz})`
    : `uygun fotoğraf yok (kapak tekrarı: ${elenen.kapakTekrari}, ilgisiz: ${elenen.ilgisiz}, kalitesiz: ${elenen.kalitesiz})`;
  return { sonuc: secilen, neden };
}

async function main() {
  const list = JSON.parse(await readFile(FILE, "utf8"));

  // En yeni haberler önce: taze içerikte ek fotoğraf hemen görünsün.
  const hedefler = list
    .filter((a) => a.sourceUrl && !a.imagesAt && (a.body || []).filter(Boolean).length >= 3)
    .sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")))
    .slice(0, LIMIT);

  console.log(
    `Ek fotoğraf taranacak haber: ${hedefler.length} | arşiv: ${list.length} | ` +
      `daha önce bakılmış: ${list.filter((a) => a.imagesAt).length}`
  );

  if (DRY) {
    hedefler.forEach((a, i) => console.log(`  ${i + 1}. [${a.category}] ${a.title.slice(0, 70)}`));
    console.log("--dry: ağa çıkılmadı.");
    return;
  }

  let eklenen = 0;
  let bulunamayan = 0;
  let acilamayan = 0;

  for (const [i, a] of hedefler.entries()) {
    const sira = `(${i + 1}/${hedefler.length})`;
    try {
      const { sonuc, neden } = await ekFotoSec(a);
      if (sonuc === null) {
        acilamayan++;
        console.log(`  ${sira} ${a.source}: ${neden}, sonraki tura bırakıldı`);
        continue;
      }
      a.images = sonuc;
      a.imagesAt = new Date().toISOString();
      if (sonuc.length) {
        eklenen++;
        console.log(`  ${sira} ${a.source}: ${sonuc.length} ek fotoğraf — ${neden}`);
      } else {
        bulunamayan++;
        console.log(`  ${sira} ${a.source}: ${neden}`);
      }
      // Her haberde kaydet: iş kesilse bile ilerleme korunur.
      await writeFile(FILE, JSON.stringify(list, null, 2), "utf8");
    } catch (err) {
      console.log(`  ${sira} hata: ${String(err?.message || err).slice(0, 90)}`);
    }
    await bekle(BEKLEME_MS);
  }

  console.log(
    `\nBitti. Ek fotoğraf eklenen: ${eklenen}, uygun fotoğraf bulunamayan: ${bulunamayan}, ` +
      `sayfa açılamayan: ${acilamayan}`
  );
}

main().catch((err) => {
  console.error("Ek fotoğraf işi başarısız:", err);
  process.exit(1);
});
