// MARKA FOTOĞRAFLI KAPAK ONARIMI
//
// Sorun: AI'nın İngilizce görsel sorgusu markayı atlayabiliyor. "Getir market
// araştırması" haberi "online grocery shopping" sorgusuyla 2020'den maskeli bir
// Kolkata fotoğrafına düşmüştü; oysa Commons'ta markalı Getir kurye
// scooter'ları var. Bu betik, başlıkta marka geçen haberleri tarar; kapak
// fotoğrafı o markayı içermiyorsa Commons'ta markanın kendi fotoğrafını arar ve
// bulursa değiştirir (lisans + fotoğrafçı atfıyla birlikte).
//
// Kullanım:
//   node scripts/gorsel-marka.mjs --dry            (sadece göster)
//   node scripts/gorsel-marka.mjs --gun=3 --limit=80
//   node scripts/gorsel-marka.mjs                  (son 7 gün, en fazla 200 haber)
import fs from "node:fs";
import { stokGorseller, atif, afetMi, markaAdi } from "../src/stok-gorsel.js";

const arg = (ad, varsayilan) => {
  const bulunan = process.argv.find((a) => a.startsWith(`--${ad}=`));
  return bulunan ? Number(bulunan.split("=")[1]) || varsayilan : varsayilan;
};

const dry = process.argv.includes("--dry");
const gun = arg("gun", 7);
const limit = arg("limit", 200);

const dosya = new URL("../data/articles.json", import.meta.url);
const ham = fs.readFileSync(dosya, "utf8");
const satirSonu = ham.includes("\r\n") ? "\r\n" : "\n";
const articles = JSON.parse(ham);

/** Türkçe harfleri sadeleştirip karşılaştırma anahtarı üretir. */
const sadeles = (s) =>
  String(s || "")
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }[c]))
    .replace(/[^a-z0-9]+/g, "");

const dosyaAdi = (url) => {
  const parca = String(url || "").split("/").pop() || "";
  try {
    return decodeURIComponent(parca);
  } catch {
    return parca;
  }
};

const esik = Date.now() - gun * 24 * 3600 * 1000;
const kullanilan = new Set(
  articles.flatMap((a) => [a.image, ...(Array.isArray(a.gorselEk) ? a.gorselEk.map((g) => g?.url) : [])]).filter(Boolean)
);

const hedefler = articles
  .filter((a) => {
    const t = new Date(a.publishedAt || a.generatedAt || 0).getTime();
    return Number.isFinite(t) && t >= esik;
  })
  .filter((a) => {
    const marka = markaAdi(a.title);
    if (!marka) return false;
    if (afetMi(a.title, a.gorselSorgu)) return false; // afet haberinde marka fotoğrafı yanıltır
    const mevcut = sadeles(dosyaAdi(a.image));
    return !mevcut.includes(sadeles(marka));
  })
  .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
  .slice(0, limit);

console.log(`Taranacak haber: ${hedefler.length} (son ${gun} gün, marka fotoğrafı olmayan kapaklar)`);

let degisen = 0;
for (const a of hedefler) {
  const marka = markaAdi(a.title);
  let secili = [];
  try {
    secili = await stokGorseller([marka], { adet: 3, kullanilan });
  } catch (err) {
    console.warn(`  ! ${marka}: arama hatası (${err.message})`);
    continue;
  }
  if (!secili.length) continue;

  const [kapak, ...ekler] = secili;
  console.log(`${dry ? "[dry] " : ""}[${marka}] ${a.title.slice(0, 62)}`);
  console.log(`   eski : ${dosyaAdi(a.image).slice(0, 70)}`);
  console.log(`   yeni : ${dosyaAdi(kapak.url).slice(0, 70)}`);

  if (!dry) {
    a.image = kapak.url;
    a.gorselKaynak = atif(kapak);
    if (ekler.length) {
      a.gorselEk = ekler.filter((g) => g?.url).map((g) => ({ url: g.url, ...atif(g) }));
    }
    kullanilan.add(kapak.url);
    for (const e of ekler) kullanilan.add(e.url);
  }
  degisen++;
}

if (!dry && degisen) {
  const metin = JSON.stringify(articles, null, 2).replace(/\n/g, satirSonu) + satirSonu;
  fs.writeFileSync(dosya, metin);
  console.log(`\n${degisen} kapak fotoğrafı marka fotoğrafıyla değiştirildi.`);
} else {
  console.log(`\n${degisen} haber ${dry ? "değiştirilecek" : "değişti"}.`);
}
