// KAYNAK GÖRSELİ ONARIMI (ShiftDelete kalitesi)
//
// Son N günün TÜM kategorilerdeki haberlerini tarar; kaynak sayfanın
// og:image'ını indirip boyut/oran doğrulamasından geçirir ve uygunsa kapak yapar.
// Ayrıca isJunkArticle ile tespit edilen spam/alakasız kayıtları temizler ve
// 1920px/1600px Wikimedia URL'lerini 1280px standart boyutuna normalize eder.
//
// Kullanım:
//   node scripts/gorsel-kaynak.mjs --gun=3 --eszamanli=24
import fs from "node:fs";
import { execSync } from "node:child_process";
import { fetchPageExtras } from "../src/fetcher.js";
import { chooseArticleImage } from "../src/gorsel.js";
import { isJunkArticle } from "../src/kalite.js";

const arg = (ad, varsayilan) => {
  const bulunan = process.argv.find((a) => a.startsWith(`--${ad}=`));
  return bulunan ? bulunan.slice(ad.length + 3) || varsayilan : varsayilan;
};
const sayi = (ad, varsayilan) => Number(arg(ad, varsayilan)) || varsayilan;

const dry = process.argv.includes("--dry");
const gun = sayi("gun", 3);
const limit = sayi("limit", 1200);
const eszamanli = Math.max(1, Math.min(32, sayi("eszamanli", 20)));
const haric = new Set(
  String(arg("haric", ""))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);
const varsayilanKategoriler =
  "Teknoloji,Yapay Zeka,Mobil,Oyun,Donanım,Yazılım,İnternet,Bilim,Uzay,Otomobil,Ekonomi,Spor,Dünya,Gündem,Sağlık,Kültür,Yaşam,Diğer";
const kategoriler = new Set(
  String(arg("kategori", varsayilanKategoriler))
    .split(",")
    .map((k) => k.trim().toLocaleLowerCase("tr"))
    .filter(Boolean)
);

const dosya = new URL("../data/articles.json", import.meta.url);
const ham = fs.readFileSync(dosya, "utf8");
const satirSonu = ham.includes("\r\n") ? "\r\n" : "\n";
let articles = JSON.parse(ham);

// 1) Spam/çöp haberleri temizle
const oncekiSayi = articles.length;
articles = articles.filter((a) => !isJunkArticle(a));
const silinenSpam = oncekiSayi - articles.length;
if (silinenSpam > 0) {
  console.log(`Spam/alakasız temizliği: ${silinenSpam} haber arşivden çıkarıldı.`);
}

// 2) Git geçmişinden (e695327~1) backfill tarafından üzerine stok görsel yazılmış
//    eski haberlerin gerçek kaynak görsellerini geri yükle.
let geriYuklenen = 0;
try {
  const eskiJson = execSync("git show e695327~1:data/articles.json", {
    maxBuffer: 50 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  }).toString();
  const eskiListe = JSON.parse(eskiJson);
  const eskiHarita = new Map(eskiListe.map((x) => [x.id, x]));
  for (const a of articles) {
    const eski = eskiHarita.get(a.id);
    if (
      eski &&
      eski.image &&
      !/wikimedia|wikipedia/i.test(eski.image) &&
      (/wikimedia|wikipedia/i.test(a.image || "") || a.gorselKaynak)
    ) {
      a.image = eski.image.replace(/&amp;/g, "&");
      a.gorselKaynakSite = true;
      delete a.gorselKaynak;
      delete a.gorselEk;
      geriYuklenen++;
    }
  }
  if (geriYuklenen > 0) {
    console.log(`Git geçmişinden geri yüklenen gerçek kaynak görseli: ${geriYuklenen}`);
  }
} catch {}

// 3) Wikimedia 1920px/1600px/1400px URL'lerini 1280px'e normalize et (429/404 önlemi)
let normSayi = 0;
for (const a of articles) {
  if (typeof a.image === "string") {
    const yeni = a.image
      .replace(/&amp;/g, "&")
      .replace(/\/(1400|1600|1920)px-/i, "/1280px-");
    if (yeni !== a.image) {
      a.image = yeni;
      normSayi++;
    }
  }
}
if (normSayi > 0) {
  console.log(`Normalize edilen Wikimedia URL: ${normSayi}`);
}

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

// Arşivde kullanılan tüm görseller
const kullanim = new Map();
for (const a of articles) {
  const u = a.image;
  if (!u) continue;
  const k = kimlik(u);
  if (k) kullanim.set(k, (kullanim.get(k) || 0) + 1);
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
  .filter((a) => !a.gorselKaynakSite)
  .filter((a) => !haric.has(a.slug))
  .filter((a) => {
    const h = host(a.image);
    return !a.image || /wikimedia|wikipedia/.test(h) || Boolean(a.gorselKaynak);
  })
  .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
  .filter((a) => {
    if (gorulenKaynak.has(a.sourceUrl)) return false;
    gorulenKaynak.add(a.sourceUrl);
    return true;
  })
  .slice(0, limit);

console.log(
  `Taranacak haber: ${hedefler.length} (son ${gun} gün, ${dry ? "dry" : `${eszamanli} eşzamanlı`})`
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

  const metin = `${a.title} ${a.slug || ""} ${a.sourceUrl}`;
  const secilen = await chooseArticleImage(extra, metin, { minWidth: 600 });
  if (!secilen) return;

  const k = kimlik(secilen);
  if (k === kimlik(a.image)) return;
  if ((kullanim.get(k) || 0) >= 3) return;

  if (degisen < 60 || degisen % 25 === 0) {
    console.log(`[+] ${a.category} | ${host(a.sourceUrl)} | ${a.title.slice(0, 55)}`);
  }

  if (dry) {
    degisen++;
    return;
  }

  kullanim.set(kimlik(a.image), Math.max(0, (kullanim.get(kimlik(a.image)) || 1) - 1));
  a.image = secilen;
  delete a.gorselKaynak;
  delete a.gorselEk;
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

if (!dry && (degisen || silinenSpam || geriYuklenen || normSayi)) {
  const metin = JSON.stringify(articles, null, 2).replace(/\n/g, satirSonu) + satirSonu;
  fs.writeFileSync(dosya, metin);
}

console.log(
  `\nÖzet: ${degisen} yeni kaynak kapak + ${geriYuklenen} git geçmişinden geri yüklenen + ${silinenSpam} spam silindi ` +
    `(denenen: ${denenen}/${hedefler.length}).`
);
