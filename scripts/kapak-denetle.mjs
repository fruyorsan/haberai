// ARŞİV KAPAK DENETİMİ
//
// NEDEN: Kapak fotoğrafı seçilirken alaka kuralı bir dönem gevşekti ve özel ad
// eşleşmesi tek başına yeterliydi. "Beşiktaş" (semt) haberine Ihlamur Kasrı
// bahçesi, "Amazon" haberine Amazon yazılı otobüs kapak olabildi.
//
// Bu script, o dönemde üretilmiş YEREL kapakları ASGARİ GEREKÇE ölçütüyle
// denetler: dosya adı ya başlıktaki/marka sorgusundaki bir özel adı, ya da
// kategori sorgusunun en az iki kelimesini içermelidir. İkisi de yoksa kapağın
// konuyla bağını kanıtlayan hiçbir sinyal yoktur → geri çekilir ve bir sonraki
// `kapak-uret --uzak` turunda sıkı kuralla yeniden üretilir.
//
// Kasıtlı olarak SEÇİCİ değil: yalnızca savunulamaz olanları işaretler, çünkü
// gerçek fotoğraf çoğu zaman iyidir.
//
//   node scripts/kapak-denetle.mjs            → yalnızca rapor
//   node scripts/kapak-denetle.mjs --uygula   → uygunsuz kapakları geri çeker
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERI = path.join(KOK, "data", "articles.json");
const UYGULA = process.argv.includes("--uygula");

const TR_ASCII = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "at", "for", "with", "to", "from",
  "turkey", "turkish", "turkiye", "istanbul", "new", "photo", "image", "file", "commons",
]);
const JENERIK =
  /(thumbnail|placeholder|default|untitled|noimage|no-image|generic|dummy|stock|screenshot|ekran|wikipedia|wiki|logo|wordmark|diagram|chart|graph|harita|map|icon|drawing|clipart|^img|^image|^photo|^dsc|^px[-_]?)/i;

const tokenler = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[çğıöşüâîû]/g, (c) => TR_ASCII[c] || c)
    .replace(/\.(jpe?g|png|webp|avif|gif)$/i, "")
    .replace(/^\d+px-/, "")
    .split(/[^a-z0-9]+/)
    .map((t) => t.replace(/(lari|leri|lar|ler|s)$/i, ""))
    .filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t));

// src/stok-gorsel.js ile aynı olmalı.
const KATEGORI_SORGU = {
  Teknoloji: "technology circuit board",
  "Yapay Zeka": "artificial intelligence robot",
  Mobil: "smartphone in hand",
  Oyun: "video game controller",
  Donanım: "graphics card computer hardware",
  Yazılım: "programming source code screen",
  İnternet: "data center server room",
  Bilim: "science laboratory research",
  Uzay: "rocket launch night sky",
  Sağlık: "hospital doctor stethoscope",
  Kültür: "art museum exhibition",
  Yaşam: "city park people walking",
  Otomobil: "electric car charging street",
  Ekonomi: "stock market trading floor",
  Spor: "football stadium floodlights",
  Gündem: "Istanbul street city",
  Dünya: "person holding world globe",
  Diğer: "newspaper reading",
};

const ozelAdlar = (baslik) =>
  String(baslik || "")
    .split(/[\s,.;:!?'"()’“”–—-]+/)
    .filter((w) => w.length >= 4 && /^[A-ZÇĞİÖŞÜ0-9]/.test(w))
    .slice(0, 3);

/** En az bir gerekçe var mı? (özel ad VEYA iki kategori kelimesi) */
const gerekceVar = (a, url) => {
  const ad = decodeURIComponent(String(url || "").split("/").pop() || "");
  if (!ad || JENERIK.test(ad)) return false;
  const adK = new Set(tokenler(ad));
  const ozelEslesme = [a.gorselSorgu, ...ozelAdlar(a.title)]
    .filter(Boolean)
    .some((s) => tokenler(s).some((k) => k.length >= 5 && adK.has(k)));
  if (ozelEslesme) return true;
  const katSorgu = String(KATEGORI_SORGU[String(a.category || "")] || "");
  const katEslesme = tokenler(katSorgu).filter((k) => k.length >= 4 && adK.has(k)).length;
  return katEslesme >= 2;
};

const YEREL = /^\/kapak\//;
const WIKI = /(wikimedia\.org|wikipedia\.org)/i;

const articles = JSON.parse(fs.readFileSync(VERI, "utf8"));
let denetlenen = 0;
let reddedilen = 0;
const ornekler = [];

for (const a of articles) {
  if (!YEREL.test(String(a.image || ""))) continue;
  const kaynak = String(a.kapak?.kaynak || "");
  // TASARIM KARTLARI KAPSAM DIŞI. Kartın `kaynak` alanı, kart üretilirken
  // kullanılamayan eski adresi (yayıncı fotoğrafı) taşıyabilir; `foto === false`
  // ise görsel fotoğraf değil, markalı tasarım kartıdır ve zaten güvenlidir.
  if (a.kapak?.foto === false) continue;
  // AI üretimi de kapsam dışı: konuya özel üretilmiş, telif riski yok.
  if (/^ai:/i.test(kaynak)) continue;
  // Yalnızca dış kaynaktan üretilmiş fotoğraflı kapaklar denetlenir.
  if (!/^https?:\/\//i.test(kaynak)) continue;
  denetlenen++;
  if (gerekceVar(a, kaynak)) continue;
  reddedilen++;
  if (ornekler.length < 15) {
    ornekler.push(
      `${a.title.slice(0, 48).padEnd(50)} ← ${decodeURIComponent(kaynak.split("/").pop() || "").slice(0, 58)}`
    );
  }
  if (UYGULA) {
    a.image = kaynak;
    delete a.kapak;
  }
}

console.log(`Dış kaynaklı yerel kapak: ${denetlenen}`);
console.log(`Gerekçesiz (geri çekilecek): ${reddedilen}`);
for (const o of ornekler) console.log("  · " + o);

if (!UYGULA) {
  console.log("\nRapor modu. Uygulamak için: node scripts/kapak-denetle.mjs --uygula");
} else if (reddedilen) {
  fs.writeFileSync(VERI, JSON.stringify(articles, null, 2) + "\n", "utf8");
  console.log(`\n${reddedilen} kapak geri çekildi; sonraki --uzak turu yeniden işleyecek.`);
}
