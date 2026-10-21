// KAYNAK GÖRSELİ ONARIMI (ShiftDelete kalitesi)
//
// Sorun: yeni haberlerde kapak çoğu zaman Wikimedia Commons'tan gelen "stok"
// fotoğraf oluyor (municipality building, luxury yacht, video game museum...).
// Oysa haberin kaynağı (Teknoblog, DonanımHaber, Webtekno, ShiftDelete...) tam
// da istenen kalitede ürün render'ı / marka grafiği / basın fotoğrafı
// yayımlıyor. Bu betik son N günün teknoloji haberlerini tarar; kaynak sayfanın
// og:image'ını indirip boyut/oran doğrulamasından geçirir ve uygunsa kapak yapar.
//
// Kaynak görseli doğrulanmış sayılır (`gorselKaynakSite: true`): site tarafında
// "başka haberin fotoğrafı" süzgeci atlanır, atıf olarak kaynak site gösterilir.
//
// Kullanım:
//   node scripts/gorsel-kaynak.mjs --dry --gun=2 --limit=40
//   node scripts/gorsel-kaynak.mjs --gun=2
//   node scripts/gorsel-kaynak.mjs --gun=3 --kategori=Teknoloji,Yapay\ Zeka
import fs from "node:fs";
import { fetchPageExtras } from "../src/fetcher.js";
import { chooseArticleImage } from "../src/gorsel.js";
import { markaAdi } from "../src/stok-gorsel.js";

const arg = (ad, varsayilan) => {
  const bulunan = process.argv.find((a) => a.startsWith(`--${ad}=`));
  return bulunan ? bulunan.slice(ad.length + 3) || varsayilan : varsayilan;
};
const sayi = (ad, varsayilan) => Number(arg(ad, varsayilan)) || varsayilan;

const dry = process.argv.includes("--dry");
const gun = sayi("gun", 2);
const limit = sayi("limit", 500);
const eszamanli = Math.max(1, Math.min(6, sayi("eszamanli", 4)));
// --haric=slug1,slug2 : kaynağı yanlış görsel veren (CMS hatası) haberler.
// Elle doğrulanıp dışarıda bırakılır; her çalıştırmada yeniden denenmez.
const haric = new Set(
  String(arg("haric", ""))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);
const kategoriler = new Set(
  String(arg("kategori", "Teknoloji,Yapay Zeka,Mobil,Oyun,Donanım,Yazılım,İnternet,Bilim,Uzay,Otomobil"))
    .split(",")
    .map((k) => k.trim().toLocaleLowerCase("tr"))
    .filter(Boolean)
);

const dosya = new URL("../data/articles.json", import.meta.url);
const ham = fs.readFileSync(dosya, "utf8");
const satirSonu = ham.includes("\r\n") ? "\r\n" : "\n";
const articles = JSON.parse(ham);

/** Aynı fotoğrafın farklı boyut sürümlerini eşleştirmek için kimlik. */
const kimlik = (url) =>
  String(url || "")
    .toLowerCase()
    .split("?")[0]
    .split("#")[0]
    .replace(/-\d{2,4}x\d{2,4}(?=\.[a-z0-9]+$)/, "")
    .replace(/\.(jpe?g|png|webp|avif|gif)$/, "");

const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Türkçe harfleri sadeleştirip dosya adı karşılaştırma anahtarı üretir. */
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

/** Kapak zaten başlıktaki markanın gerçek fotoğrafı mı? (gorsel-marka onarımı) */
const markaFotografi = (a) => {
  const marka = markaAdi(a.title);
  if (!marka) return false;
  return sadeles(dosyaAdi(a.image)).includes(sadeles(marka));
};

// Arşivde kullanılan tüm görseller: bir kare iki habere kapak olmasın.
const kullanim = new Map();
for (const a of articles) {
  const adaylar = [
    a.image,
    ...(Array.isArray(a.images) ? a.images : []),
    ...(Array.isArray(a.gorselEk) ? a.gorselEk.map((g) => g?.url) : []),
  ];
  for (const u of adaylar) {
    if (!u) continue;
    const k = kimlik(u);
    if (k) kullanim.set(k, (kullanim.get(k) || 0) + 1);
  }
}

const esik = Date.now() - gun * 24 * 3600 * 1000;
const gorulenKaynak = new Set();
const hedefler = articles
  .filter((a) => {
    const t = new Date(a.publishedAt || a.generatedAt || 0).getTime();
    return Number.isFinite(t) && t >= esik;
  })
  .filter((a) => kategoriler.has(String(a.category || "").toLocaleLowerCase("tr")))
  .filter((a) => a.sourceUrl && /^https?:\/\//i.test(a.sourceUrl) && !/news\.google\.com/i.test(a.sourceUrl))
  .filter((a) => !a.gorselKaynakSite) // zaten kaynağın kendi görseli
  .filter((a) => !haric.has(a.slug)) // elle doğrulanmış istisnalar
  .filter((a) => {
    // Wikimedia/stok kapakları hedefle; kaynaktan gelen eski kapaklara ve
    // gorsel-marka betiğinin doğruladığı marka fotoğraflarına dokunma.
    if (markaFotografi(a)) return false;
    const h = host(a.image);
    return !a.image || /wikimedia|wikipedia/.test(h) || Boolean(a.gorselKaynak);
  })
  .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
  .filter((a) => {
    if (gorulenKaynak.has(a.sourceUrl)) return false; // aynı sayfa ikinci kez açılmasın
    gorulenKaynak.add(a.sourceUrl);
    return true;
  })
  .slice(0, limit);

console.log(
  `Taranacak haber: ${hedefler.length} (son ${gun} gün, ${[...kategoriler].join("/")}, ` +
    `${dry ? "dry" : `${eszamanli} eşzamanlı`})`
);

let degisen = 0;
let denenen = 0;

async function isle(a) {
  denenen++;
  let extra = null;
  try {
    extra = await fetchPageExtras(a.sourceUrl);
  } catch {
    return;
  }
  if (!extra) return;

  // Önce og:image (haberin kendi kapağı); uygun değilse dosya adı başlıkla
  // eşleşen sayfa içi adaylar (ilgili haber/yan menü görselleri elenir).
  const metin = `${a.title} ${a.slug || ""} ${a.sourceUrl}`;
  const secilen = await chooseArticleImage(extra, metin, { minWidth: 700 });
  if (!secilen) {
    console.log(`  - ${a.category} | görsel yok/uygun değil: ${a.title.slice(0, 58)}`);
    return;
  }

  const k = kimlik(secilen);
  if (k === kimlik(a.image)) return; // zaten aynı kare
  if (kullanim.get(k)) {
    console.log(`  - ${a.category} | kare başka haberde kullanılmış: ${a.title.slice(0, 48)}`);
    return;
  }

  console.log(`${dry ? "[dry] " : ""}[+] ${a.category} | ${host(a.sourceUrl)} | ${a.title.slice(0, 58)}`);
  console.log(`     eski: ${host(a.image) || "-"} ${String(a.image || "").split("/").pop()?.slice(0, 60) || ""}`);
  console.log(`     yeni: ${host(secilen)} ${String(secilen).split("/").pop()?.slice(0, 60) || ""}`);

  if (dry) {
    degisen++;
    return;
  }

  kullanim.set(kimlik(a.image), Math.max(0, (kullanim.get(kimlik(a.image)) || 1) - 1));
  a.image = secilen;
  delete a.gorselKaynak;
  delete a.gorselEk; // eski stok ekleri kaynak görselle uyumsuz olabilir
  a.gorselKaynakSite = true;
  kullanim.set(k, (kullanim.get(k) || 0) + 1);
  degisen++;
}

let imlec = 0;
async function isci() {
  while (imlec < hedefler.length) {
    const i = imlec++;
    await isle(hedefler[i]);
  }
}
await Promise.all(Array.from({ length: eszamanli }, isci));

if (!dry && degisen) {
  const metin = JSON.stringify(articles, null, 2).replace(/\n/g, satirSonu) + satirSonu;
  fs.writeFileSync(dosya, metin);
}

console.log(
  `\n${degisen} kapak ${dry ? "değiştirilecek" : "değiştirildi"} ` +
    `(denenen: ${denenen}, hedef: ${hedefler.length}).`
);
