// Yanlış kapak fotoğraflarını yeniden arar (tek seferlik bakım aracı).
//
// NEDEN: AI'nın sorgusu Commons'ta sonuç vermezse kategori yedeğine düşülüyor.
// 19.10.2026'da "İspanya'da rekor sağanak yağış" haberine Chicago O'Hare
// havalimanı terminali konmuştu; "Endonezya orman yangınları" haberine de
// havalimanı gelmişti. Seçim mantığı düzeltildi (uydu görüntüsü elenir +
// afet/hava konuları için yerden çekilmiş sahne aranır); bu araç ESKİ veride
// kalan bozuk fotoğrafları yeni mantıkla tazeler.
//
// KULLANIM
//   node scripts/gorsel-duzelt.mjs            → yalnızca listeler (kuru çalışma)
//   node scripts/gorsel-duzelt.mjs --uygula   → değişiklikleri yazar
import { loadArticles, saveArticles } from "../src/store.js";
import { stokGorseller, KATEGORI_SORGU, atif, kisaSorgu, konuSorgu, afetMi } from "../src/stok-gorsel.js";

const UYGULA = process.argv.includes("--uygula");

// Kapak olarak "harita/gökten çekim" duran görüntüler her zaman kötüdür.
const UYDU = /(modis|copernicus|sentinel|landsat|nesdis|\bcira\b|orthophoto|orthomosaic|satellite|from space)/i;
// Uçak/havalimanı: yalnızca AI sorgusuyla hiç örtüşmüyorsa yanlış demektir
// (havalimanı haberi için doğru olabilir).
const HAVAALANI = /(airport|havaliman|terminal|concourse)/i;

const kelimeler = (s) =>
  String(s || "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);

function ortak(a, b) {
  const B = new Set(kelimeler(b));
  return kelimeler(a).filter((w) => B.has(w)).length;
}

const dosyaAdi = (a) => String(a?.gorselKaynak?.sayfa || "").split("File:").pop() || "";

const articles = await loadArticles();
let aday = 0;
let duzelen = 0;

for (const a of articles) {
  const dosya = dosyaAdi(a);
  if (!dosya) continue;
  const sorgu = a.gorselSorgu || a.title || "";
  const kotu = UYDU.test(dosya) || (HAVAALANI.test(dosya) && ortak(dosya, sorgu) === 0);
  if (!kotu) continue;
  aday++;

  const sorgular = [sorgu, konuSorgu(sorgu, a.title), kisaSorgu(sorgu), KATEGORI_SORGU[a.category]];
  let stok = [];
  try {
    stok = await stokGorseller(sorgular, { adet: 3, afet: afetMi(sorgu, a.title) });
  } catch (e) {
    console.log(`! ${a.slug}: arama hatası (${e.message})`);
    continue;
  }
  if (!stok.length) {
    console.log(`- ${a.slug}: yeni fotoğraf bulunamadı, eski kalıyor`);
    continue;
  }
  const [kapak, ...ekler] = stok;
  const yeniDosya = String(kapak.dosya || kapak.url).slice(0, 70);
  // Yeni aday da bozuksa dokunma.
  if (UYDU.test(kapak.dosya || "")) {
    console.log(`- ${a.slug}: yeni aday da uydu görüntüsü, atlandı (${yeniDosya})`);
    continue;
  }

  console.log(`✓ ${a.slug}`);
  console.log(`    eski: ${dosya.slice(0, 78)}`);
  console.log(`    yeni: ${yeniDosya}`);
  duzelen++;
  if (UYGULA) {
    a.image = kapak.url;
    a.gorselKaynak = atif(kapak);
    if (ekler.length) a.gorselEk = ekler.map((g) => ({ url: g.url, ...atif(g) }));
    else delete a.gorselEk;
  }
  // Commons'ı yorma (hız sınırı 429 veriyor ve o sorgu sessizce boş dönüyor).
  await new Promise((r) => setTimeout(r, 700));
}

console.log(
  `\n${aday} aday, ${duzelen} değişiklik${UYGULA ? " yazıldı" : " (kuru çalışma — yazılmadı)"}`
);
if (UYGULA && duzelen) await saveArticles(articles);
