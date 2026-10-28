// ==========================================================================
// STOK GÖRSELİ HABERİN KENDİ FOTOĞRAFIYLA DEĞİŞTİR
// --------------------------------------------------------------------------
// SORUN: Eski kayıtların `image` alanı Wikimedia stoğu (thumb.wikimedia.org).
// Bu kareler başlıkla çoğu zaman alakasız: "domates salgını" haberinde
// ABD'deki bir market, "telefon tanıtımı" haberinde mezarlık fotoğrafı.
// Kapak üretimi yalnızca GÜNCEL çekirdeği (data/indeks.json) kapsıyor; arşiv
// ve kategori sayfalarındaki kartlar hâlâ stoğu gösteriyor.
//
// NE YAPAR: `images` (kaynak sayfanın kendi gövde fotoğrafları) doluysa
// `image` alanını o fotoğrafla değiştirir. Yerel kapak dosyası olan kayıtlara
// DOKUNMAZ. Görsel adresi wsrv.nl üzerinden 16:9 kırpılarak sunulduğu için
// tam boy fotoğraf sayfayı ağırlaştırmaz.
//
// KULLANIM:
//   node scripts/stok-degistir.mjs            # uygula
//   node scripts/stok-degistir.mjs --dry
// ==========================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTICLES = path.join(KOK, "data", "articles.json");
const dry = process.argv.includes("--dry");

const STOK = /(^|\.)wikimedia\.org$/i;

const ham = fs.readFileSync(ARTICLES, "utf8");
const satirSonu = ham.includes("\r\n") ? "\r\n" : "\n";
const articles = JSON.parse(ham);

let degisen = 0;
let yerelKapak = 0;
let alternatifYok = 0;

for (const a of articles) {
  if (!a || !a.id) continue;
  const mevcut = String(a.image || "");
  if (mevcut.startsWith("/kapak/")) {
    yerelKapak++;
    continue;
  }
  let stokMu = false;
  try {
    stokMu = STOK.test(new URL(mevcut).hostname);
  } catch {
    stokMu = !mevcut; // görselsiz kayıt da düzeltilmeli
  }
  if (!stokMu) continue;

  const aday = (Array.isArray(a.images) ? a.images : []).find(
    (u) => typeof u === "string" && /^https?:\/\/[^\s]+$/i.test(u)
  );
  if (!aday) {
    alternatifYok++;
    continue;
  }
  a.image = aday;
  a.gorselKaynak = a.gorselKaynak || a.imagesKaynak || a.sourceUrl;
  degisen++;
}

console.log(
  `${degisen} kayıtta stok görsel haberin kendi fotoğrafıyla değiştirildi` +
    ` (yerel kapaklı: ${yerelKapak}, alternatif yok: ${alternatifYok})${dry ? " [dry]" : ""}`
);

if (!dry && degisen) {
  fs.writeFileSync(ARTICLES, JSON.stringify(articles, null, 2).replace(/\n/g, satirSonu) + satirSonu, "utf8");
}
