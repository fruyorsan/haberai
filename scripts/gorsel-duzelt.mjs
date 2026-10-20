// Yanlış konulu kapak fotoğraflarını onarır.
//
// Neden: src/stok-gorsel.js içindeki konu kuralları "ice" ve "rain" gibi
// sözcükleri tam sözcük olarak aramıyordu. "office" içindeki "ice" yüzünden
// spor/ekonomi haberlerine "karlı araba" fotoğrafı düşmüştü. Kural düzeltildi;
// bu betik o eski hatalı görselleri yeni kurallarla yeniden seçer.
//
// Kullanım:
//   node scripts/gorsel-duzelt.mjs --dry   (sadece göster)
//   node scripts/gorsel-duzelt.mjs         (veriyi güncelle)
import fs from "node:fs";
import {
  stokGorseller,
  yedekGorsel,
  atif,
  kisaSorgu,
  afetMi,
} from "../src/stok-gorsel.js";

const dry = process.argv.includes("--dry");
const dosya = new URL("../data/articles.json", import.meta.url);
const ham = fs.readFileSync(dosya, "utf8");
const satirSonu = ham.includes("\r\n") ? "\r\n" : "\n";
const articles = JSON.parse(ham);

// Görsel dosyası afet/hava sahnesi ama haber metni değilse şüpheli.
const KONU_GORSEL = /\b(snow|covered|flood|fire|burn|earthquake|rubble|storm)\b/i;
const KONU_METIN =
  /\b(snow|kar|flood|sel|fire|yangın|earthquake|deprem|storm|fırtına|rescue|kurtar)\b/i;

const hedefler = articles.filter(
  (a) =>
    KONU_GORSEL.test(String(a.image || "")) &&
    !KONU_METIN.test(`${a.title || ""} ${a.gorselSorgu || ""}`)
);

if (!hedefler.length) {
  console.log("Onarılacak görsel yok.");
  process.exit(0);
}

const kullanilan = new Set(articles.map((a) => String(a.image || "")).filter(Boolean));

for (const a of hedefler) {
  kullanilan.delete(String(a.image || ""));
  // Onarımda yalnızca habere ÖZEL sorgu denenir (AI'nın ürettiği İngilizce
  // sorgu). Kategori sorgusu gevşek eşleştiği için (ör. "insan + dünya küresi")
  // alakasız fotoğraf getirebiliyor; onun yerine kategorinin SEÇİLMİŞ yedek
  // görseli kullanılır: telifi ve konusu garantili.
  const sorgular = [a.gorselSorgu, kisaSorgu(a.gorselSorgu)].filter(Boolean);

  let secili = null;
  try {
    const sonuc = await stokGorseller(sorgular, {
      adet: 1,
      kullanilan,
      afet: afetMi(a.gorselSorgu, a.title),
    });
    secili = sonuc[0] || null;
  } catch (err) {
    console.warn("  ! arama hatası:", err.message);
  }
  if (!secili) secili = yedekGorsel(a.category);

  console.log(`${dry ? "[dry] " : ""}${a.title.slice(0, 55)}`);
  console.log(`   eski : ${String(a.image || "").split("/").pop().slice(0, 70)}`);
  console.log(`   yeni : ${secili.url.split("/").pop().slice(0, 70)}`);

  if (!dry) {
    a.image = secili.url;
    a.gorselKaynak = atif(secili);
    kullanilan.add(secili.url);
  }
}

if (!dry) {
  const metin = JSON.stringify(articles, null, 2).replace(/\n/g, satirSonu) + satirSonu;
  fs.writeFileSync(dosya, metin);
  console.log(`\n${hedefler.length} görsel güncellendi.`);
}
