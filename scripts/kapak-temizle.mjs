// ==========================================================================
// KAPAK TEMİZLİĞİ
// --------------------------------------------------------------------------
// NEDEN: Her yeni haber için 1280×720 kapak + 480 px varyant üretiliyor
// (~75 KB/haber). Günde ~160 haber = ayda ~360 MB. Depo şişmesin diye
// yalnızca GÜNCEL çekirdek (data/indeks.json) ve son günlerin kapakları
// tutulur.
//
// NE YAPAR: Yalnızca KÜÇÜK KOPYALARI (480 px / 1200x630 sosyal) temizler.
// Ana kapaklar ARTIK SİLİNMEZ.
//
// NEDEN DEĞİŞTİ (2026-11-04): Eski davranış, kapsam dışına çıkan her kapağı
// silip `image` alanını kaynak sitedeki özgün fotoğrafa geri çeviriyordu. Bu,
// arşiv yerelleştirmesini sürekli geri alıyordu: 3 günden eski her haber bir
// sonraki turda yeniden yayıncının (çoğu ajans telifli) fotoğrafına dönüyordu.
// Dosya bütçesi buna izin veriyor: 5.700 haber × 1 ana kapak ≈ 5,7 bin dosya;
// Cloudflare Pages sınırı 20.000. Varyantlar temizlenmeye devam eder. Böylece
// bir haberin kapağı bir kez doğru üretildiğinde kalıcı olur.
//
// KULLANIM:
//   node scripts/kapak-temizle.mjs                  # 3 günden eski + indeks dışı
//   node scripts/kapak-temizle.mjs --gun=7          # ana kapaklarda son 7 günü koru
//   node scripts/kapak-temizle.mjs --varyant-gun=3  # 480px/sosyal kopyalarda son 3 gün
//   node scripts/kapak-temizle.mjs --dry
//   node scripts/kapak-temizle.mjs --onar           # yalnızca kırık kapakları onar
//
// ÖLÇEK NOTU (2026-11-02): -480.webp ve -sosyal.jpg kopyaları yalnızca TAZE
// haberlerde tutulur. Bu dosyalar paylaşım/kart hızını artırır ama her haber
// için 2 ek dosya demektir; sınırsız büyürse yayın kotasını (GitHub Pages
// 10.000 dosya / Cloudflare Pages 20.000 dosya) erken doldurur. Eski haberlerde
// kod zaten wsrv.nl yedeğine düşer (bkz. site/src/lib/articles.js).
//
// KIRIK KAPAK ONARIMI (--onar ya da normal çalışma): `image` alanı yerel
// `/kapak/...` adresini gösteriyor ama dosya yoksa (temizlik sırasında
// silinmiş, üretimi yarıda kalmış ya da commit edilmemiş) sayfada kırık
// görsel kalıyordu. Bu tarama her turda çalışır ve o haberi kaynak sitedeki
// özgün fotoğrafına (`kapak.kaynak`) döndürür.
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
// 480px kart varyantı + 1200x630 sosyal JPEG yalnızca son N gün için tutulur.
// 0 = hiç tutma (tümü wsrv yedeğine düşer).
const varyantGun = Math.max(0, arg("varyant-gun", 3));
const dry = process.argv.includes("--dry");
const onar = process.argv.includes("--onar");

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
const varyantEsik = Date.now() - varyantGun * 86400000;
// Varyant (480px / sosyal JPEG) koruması ana kapak korumasından AYRIDIR:
// ana kapak indeks çekirdeğinde kaldığı sürece tutulur, küçük kopyalar ise
// yalnızca taze haberlerde tutulur. Böylece dosya sayısı haber sayısıyla
// doğrusal büyümez.
const varyantTaze = new Set();
let taze = 0;
for (const a of articles) {
  if (!a || !a.id) continue;
  const t = Date.parse(a.publishedAt || a.generatedAt || 0);
  if (!Number.isFinite(t)) continue;
  if (t >= varyantEsik) varyantTaze.add(String(a.id));
  if (t >= esik) {
    korunacak.add(String(a.id));
    taze++;
  }
}

// Kaynağı Wikimedia stoğu olan tasarım kartları korunur: kapsam dışına çıkınca
// `image` alakasız bir stok kareye döneceğine, habere özgü kategori + kısa
// çengel taşıyan kart kalsın (kırık görsel yok, konuyla ilgisiz fotoğraf yok).
let stokKarti = 0;
for (const a of articles) {
  if (!a || !a.id) continue;
  const k = a.kapak;
  if (!k) continue;
  if (!String(a.image || "").startsWith(`${URL_TABANI}/`)) continue;
  if ((k.foto === false && /wikimedia\.org/i.test(String(k.kaynak || ""))) || /^ai:/i.test(String(k.kaynak || ""))) {
    korunacak.add(String(a.id));
    stokKarti++;
  }
}

if (!fs.existsSync(CIKTI_DIZIN)) {
  console.log("Kapak dizini yok, yapılacak iş yok.");
  process.exit(0);
}

const harita = new Map(articles.filter((a) => a && a.id).map((a) => [String(a.id), a]));
const dosyalar = fs.readdirSync(CIKTI_DIZIN);
// silinecek: ana kapak (haber kaynağına geri döner)
// silinecekVaryant: yalnızca 480px / sosyal JPEG (haberin `image` alanı KORUNUR)
const silinecek = [];
const silinecekVaryant = [];
if (!onar) {
  for (const f of dosyalar) {
    const sosyal = f.endsWith("-sosyal.jpg");
    const kucuk = f.endsWith("-480.webp");
    if (!f.endsWith(".webp") && !sosyal) continue;
    const id = f
      .replace(/-480\.webp$/, "")
      .replace(/\.webp$/, "")
      .replace(/-sosyal\.jpg$/, "");
    if (kucuk || sosyal) {
      if (!varyantTaze.has(id)) silinecekVaryant.push(f);
    }
    // Ana kapaklar korunur (bkz. dosya başındaki not). `korunacak` kümesi
    // yalnızca raporlama için tutulur.
  }
}

let silinen = 0;
let silinenVaryant = 0;
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
  silinenIdler.add(
    f.replace(/-480\.webp$/, "").replace(/\.webp$/, "").replace(/-sosyal\.jpg$/, "")
  );
}

// Varyant silme `image` alanını DEĞİŞTİRMEZ: ana kapak yerinde kalır, yalnızca
// hız için üretilmiş kopya gider. Eski sayfalar wsrv yedeğini kullanır.
for (const f of silinecekVaryant) {
  if (!dry) {
    try {
      fs.unlinkSync(path.join(CIKTI_DIZIN, f));
      silinenVaryant++;
    } catch {
      continue;
    }
  } else {
    silinenVaryant++;
  }
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

// KIRIK YEREL KAPAK: `image` /kapak/... diyor ama dosya yok → kaynağa dön.
let onarilan = 0;
for (const a of articles) {
  if (!a || !a.id) continue;
  const img = String(a.image || "").split("?")[0];
  if (!img.startsWith(`${URL_TABANI}/`)) continue;
  const dosya = path.join(CIKTI_DIZIN, img.slice(URL_TABANI.length + 1));
  if (fs.existsSync(dosya)) continue;
  const kaynak = a.kapak?.kaynak;
  if (typeof kaynak === "string" && /^https?:\/\//i.test(kaynak)) {
    a.image = kaynak;
  } else {
    // Kaynak adres yok: alanı boşalt (kart yer tutucu gösterir).
    a.image = "";
  }
  delete a.kapak;
  delete a.gorselKaynak;
  onarilan++;
  if (onarilan <= 5) console.log(`  onarıldı: ${a.id} → ${a.image || "(boş)"}`);
}

if (!dry && (silinenIdler.size || onarilan)) {
  fs.writeFileSync(
    ARTICLES,
    JSON.stringify(articles, null, 2).replace(/\n/g, satirSonu) + satirSonu
  );
}

console.log(
  `Kapak temizliği${dry ? " [dry]" : ""}: ${silinen} ana kapak, ` +
    `${silinenVaryant} küçük/sosyal varyant silindi; ` +
    `${geriAlinan} haber kaynak fotoğrafına döndürüldü, ` +
    `${onarilan} kırık yerel kapak onarıldı ` +
    `(korunan: ${korunacak.size} haber, son ${gun} gün: ${taze}, ` +
    `varyant penceresi: ${varyantGun} gün / ${varyantTaze.size} haber, stok yerine kart: ${stokKarti}).`
);
