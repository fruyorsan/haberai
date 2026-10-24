// ==========================================================================
// İNDEKS ÇEKİRDEĞİ — hangi haberler Google'a açık olacak?
// --------------------------------------------------------------------------
// SORUN: Site 7 günde 3.718 haber yayınladı, Google 5.487 URL'den yalnızca
// ~58'ini dizine aldı (%1). Bu, "ölçekli/zayıf içerik" damgasıdır: Google
// sitenin tamamına güvenmediği için yeni ve kaliteli haberler de taranmıyor.
//
// ÇÖZÜM: Site haritasını ve indekslenebilir sayfa sayısını küçük, kaliteli bir
// "çekirdeğe" indirmek. Site gezinmesi (ana sayfa, akış, kategori) DEĞİŞMEZ;
// okuyucu her haberi görmeye devam eder. Yalnızca:
//   - site haritasına giren haberler  (astro.config.mjs)
//   - <meta name="robots"> değeri     (haber/[slug].astro)
// bu dosyadaki listeye göre belirlenir. Listede olmayan haber `noindex, follow`
// olur: dizine girmez ama içindeki link değeri korunur (silme yok, geri alınabilir).
//
// KARARLILIK: Seçim her derlemede yeniden yapılsaydı aynı haber bir gün
// indeksli, ertesi gün noindex olurdu; Google bunu sevmez. Bu yüzden seçim
// data/indeks.json'a YAZILIR ve GEÇMİŞ GÜNLER DONDURULUR — yalnızca bugünün
// listesi, gün içinde eklenen haberlerle güncellenir.
// ==========================================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const ARTICLES = join(DATA, "articles.json");
const CIKTI = join(DATA, "indeks.json");

// Günde site haritasına girecek en iyi haber sayısı. 40 haber üretilirken
// 12'si çekirdeğe girer; kalan 28 noindex olur (okuyucu yine görür).
const GUNLUK = Number(process.env.INDEKS_GUNLUK ?? 12);
// Çekirdeğin geriye dönük penceresi (gün). 30 gün × 12 = ~360 URL.
const PENCERE_GUN = Number(process.env.INDEKS_PENCERE_GUN ?? 30);

/** Türkiye saatine göre gün anahtarı (YYYY-MM-DD). */
const gunAnahtari = (t) => {
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
};

const yayinZamani = (a) => {
  const t = Date.parse(a?.generatedAt || a?.publishedAt || 0);
  return Number.isFinite(t) ? t : 0;
};

/**
 * Kalite puanı — SABİT (zamana bağlı değil), böylece sıralama kaymaz.
 * Uzun ve özgün gövde, maddeli özet, editör notu ve gerçek fotoğraf puanı
 * yükseltir; kısa/aktarma haberler düşük kalır.
 */
function kalitePuani(a) {
  const body = String(a.body || "").length;
  const kp = Array.isArray(a.keyPoints) ? a.keyPoints.length : 0;
  const etiket = Array.isArray(a.tags) ? a.tags.length : 0;
  let p = 0;
  p += Math.min(body / 2000, 1) * 35;
  p += Math.min(kp / 5, 1) * 20;
  p += String(a.editorNote || "").trim() ? 12 : 0;
  p += String(a.comment || "").trim() ? 6 : 0;
  p += typeof a.image === "string" && /^https?:\/\//i.test(a.image) ? 15 : 0;
  p += Math.min(etiket / 4, 1) * 7;
  return p;
}

function okuArticles() {
  if (!existsSync(ARTICLES)) return [];
  try {
    const d = JSON.parse(readFileSync(ARTICLES, "utf8"));
    const list = Array.isArray(d) ? d : d.articles;
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error(`İndeks: articles.json okunamadı: ${err.message}`);
    return [];
  }
}

function okuOnceki() {
  if (!existsSync(CIKTI)) return { days: {} };
  try {
    const d = JSON.parse(readFileSync(CIKTI, "utf8"));
    return { days: d && typeof d.days === "object" && d.days ? d.days : {} };
  } catch {
    return { days: {} };
  }
}

function main() {
  const articles = okuArticles().filter(
    (a) => a && a.id && typeof a.image === "string" && /^https?:\/\//i.test(a.image)
  );
  if (!articles.length) {
    console.log("İndeks: haber yok, data/indeks.json yazılmadı.");
    return;
  }

  const bugun = gunAnahtari(Date.now());
  const onceki = okuOnceki();

  // Pencere dışını at.
  const sinir = Date.now() - PENCERE_GUN * 86400000;
  const gunler = new Map();
  for (const a of articles) {
    const t = yayinZamani(a);
    if (!t || t < sinir) continue;
    const g = gunAnahtari(t);
    if (!g) continue;
    if (!gunler.has(g)) gunler.set(g, []);
    gunler.get(g).push(a);
  }

  const days = {};
  const slugs = [];
  let dondurulan = 0;
  let hesaplanan = 0;

  for (const g of [...gunler.keys()].sort()) {
    const liste = gunler.get(g);
    const mevcut = new Set(liste.map((a) => String(a.id)));
    const eski = Array.isArray(onceki.days[g]) ? onceki.days[g] : [];

    let secilen;
    if (g < bugun && eski.length) {
      // Geçmiş gün DONMUŞ: dün indeksteydi, bugün de indekste kalır.
      secilen = eski.filter((id) => mevcut.has(String(id)));
      dondurulan++;
    } else {
      // Bugün (ya da dondurulmamış gün): en iyi GUNLUK haber.
      secilen = [...liste]
        .sort(
          (a, b) => kalitePuani(b) - kalitePuani(a) || yayinZamani(b) - yayinZamani(a)
        )
        .slice(0, GUNLUK)
        .map((a) => String(a.id));
      hesaplanan++;
    }

    days[g] = secilen;
    slugs.push(...secilen);
  }

  const cikti = {
    updatedAt: new Date().toISOString(),
    gunluk: GUNLUK,
    pencereGun: PENCERE_GUN,
    toplamHaber: articles.length,
    secilen: slugs.length,
    days,
  };
  mkdirSync(DATA, { recursive: true });
  writeFileSync(CIKTI, `${JSON.stringify(cikti, null, 2)}\n`, "utf8");

  console.log(
    `İndeks: ${articles.length} haber → ${slugs.length} çekirdek URL ` +
      `(${Object.keys(days).length} gün, günde en iyi ${GUNLUK})` +
      ` · dondurulan ${dondurulan} gün, yeniden hesaplanan ${hesaplanan} gün`
  );
}

main();
