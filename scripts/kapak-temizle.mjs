// ==========================================================================
// KAPAK TEMİZLİĞİ
// --------------------------------------------------------------------------
// NEDEN: Her yeni haber için 1280×720 kapak + 480 px varyant üretiliyor
// (~75 KB/haber). Günde ~160 haber = ayda ~360 MB. Depo şişmesin diye
// yalnızca GÜNCEL çekirdek (data/indeks.json) ve son günlerin kapakları
// tutulur.
//
// NE YAPAR: Kapsam dışı kalan kapak dosyalarını siler ve o haberin
// `image` alanını kaynak sitedeki özgün fotoğrafa (`kapak.kaynak`) geri
// çevirir; böylece eski sayfalarda kırık görsel kalmaz, haber yeniden
// indekse girerse kapak sıfırdan üretilir.
//
// KULLANIM:
//   node scripts/kapak-temizle.mjs            # 3 günden eski + indeks dışı
//   node scripts/kapak-temizle.mjs --gun=7    # son 7 günü koru
//   node scripts/kapak-temizle.mjs --dry
// ==========================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTICLES = path.join(KOK, "data", "articles.json");
const INDEKS = path.join(KOK, "data", "indeks.json");
const CIKTI_DIZIN = path.join(KOK, "site", "public", "kapak");
const URL_TABANI = "/kapak";

const arg = (ad, varsayilan) => {
  const bulunan = process.argv.find((a) => a.startsWith(`--${ad}=`));
  return bulunan ? Number(bulunan.split("=")[1]) || varsayilan : varsayilan;
};
const gun = arg("gun", 3);
const dry = process.argv.includes("--dry");

const ham = fs.readFileSync(ARTICLES, "utf8");
const satirSonu = ham.includes("\r\n") ? "\r\n" : "\n";
const articles = JSON.parse(ham);

// Korunacak kimlikler: indeks çekirdeği + günlük dondurulmuş listeler + son N gün.
const korunacak = new Set();
try {
  const d = JSON.parse(fs.readFileSync(INDEKS, "utf8"));
  for (const id of Array.isArray(d.ids) ? d.ids : []) korunacak.add(String(id));
  if (d.days && typeof d.days === "object") {
    for (const liste of Object.values(d.days)) {
      if (Array.isArray(liste)) for (const id of liste) korunacak.add(String(id));
    }
  }
} catch {
  console.warn("indeks okunamadı; yalnızca tarih penceresine göre temizlenecek.");
}

const esik = Date.now() - gun * 86400000;
let taze = 0;
for (const a of articles) {
  if (!a || !a.id) continue;
  const t = Date.parse(a.publishedAt || a.generatedAt || 0);
  if (Number.isFinite(t) && t >= esik) {
    korunacak.add(String(a.id));
    taze++;
  }
}

if (!fs.existsSync(CIKTI_DIZIN)) {
  console.log("Kapak dizini yok, yapılacak iş yok.");
  process.exit(0);
}

const harita = new Map(articles.filter((a) => a && a.id).map((a) => [String(a.id), a]));
const dosyalar = fs.readdirSync(CIKTI_DIZIN);
const silinecek = [];
for (const f of dosyalar) {
  if (!f.endsWith(".webp")) continue;
  const id = f.replace(/-480\.webp$/, "").replace(/\.webp$/, "");
  if (!korunacak.has(id)) silinecek.push(f);
}

let silinen = 0;
let geriAlinan = 0;
const silinenIdler = new Set();
for (const f of silinecek) {
  if (!dry) {
    try {
      fs.unlinkSync(path.join(CIKTI_DIZIN, f));
      silinen++;
    } catch {
      continue;
    }
  } else {
    silinen++;
  }
  silinenIdler.add(f.replace(/-480\.webp$/, "").replace(/\.webp$/, ""));
}

for (const id of silinenIdler) {
  const a = harita.get(id);
  if (!a) continue;
  const kaynak = a.kapak?.kaynak;
  if (typeof kaynak === "string" && /^https?:\/\//i.test(kaynak)) {
    a.image = kaynak;
    geriAlinan++;
  } else if (typeof a.image === "string" && a.image.startsWith(`${URL_TABANI}/`)) {
    // Kaynak adres yok: uzak görsel bilinmiyor, alanı boşalt (kart yer tutucu gösterir).
    a.image = "";
  }
  delete a.kapak;
  delete a.gorselKaynak;
}

if (!dry && silinenIdler.size) {
  fs.writeFileSync(
    ARTICLES,
    JSON.stringify(articles, null, 2).replace(/\n/g, satirSonu) + satirSonu
  );
}

console.log(
  `Kapak temizliği${dry ? " [dry]" : ""}: ${silinen} dosya silindi, ` +
    `${geriAlinan} haber kaynak fotoğrafına döndürüldü ` +
    `(korunan: ${korunacak.size} haber, son ${gun} gün: ${taze}).`
);
