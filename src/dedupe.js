// Aynı olayın farklı kaynaklarda tekrarını yakalamak için başlık benzerliği.
// Örn: "İstanbul'da 3 ilçede su kesintisi" ≈ "İstanbul'da su kesintisi: 3 ilçe"

// Başlıklarda çok geçen, ayırt edici olmayan kelimeler
const STOP = new Set([
  "ve",
  "ile",
  "bir",
  "bu",
  "da",
  "de",
  "ki",
  "için",
  "mi",
  "mı",
  "mu",
  "mü",
  "ne",
  "çok",
  "daha",
  "en",
  "son",
  "dakika",
  "haber",
  "haberi",
  "haberler",
  "sonrası",
  "açıklama",
  "açıklaması",
  "açıkladı",
  "yaptı",
  "etti",
  "oldu",
  "olan",
  "olarak",
  "yeni",
  "göre",
  "kadar",
  "ama",
  "ancak",
  "çıktı",
  "başladı",
  "devam",
  "ediyor",
  "olacak",
  "var",
  "yok",
  "bugün",
  "dün",
  "yarın",
  "ilk",
  "tüm",
  "tum",
  "türkiye",
  "turkiye",
]);

/** Başlığı anlamlı kelimelere indirger (küçük harf, noktalama ve etkisiz kelimeler atılır). */
export function titleTokens(title = "") {
  const set = new Set();
  const words = String(title)
    .toLocaleLowerCase("tr")
    .split(/[^\p{L}\p{N}]+/u);
  for (const raw of words) {
    const w = raw.trim();
    if (w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)) set.add(w);
  }
  return set;
}

/** Karşılaştırma için başlık listesini önceden hesaplanmış hâle getirir. */
export function makeIndex(titles = []) {
  return titles
    .filter((t) => t && String(t).trim())
    .map((title) => ({ title, tokens: titleTokens(title) }));
}

/** İki kelime kümesinin benzerliği: kesişim / küçük küme (0-1). */
export function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / Math.min(a.size, b.size);
}

/**
 * Başlık, indeksteki bir başlığa "aynı haber" denecek kadar benziyorsa o başlığı döndürür.
 * Eşiğin altındaysa null.
 */
export function findSimilar(title, index, threshold = 0.7) {
  const tokens = title instanceof Set ? title : titleTokens(title);
  if (tokens.size < 3) return null; // çok kısa başlıklarda yanlış eşleşme riski yüksek

  let best = null;
  let bestScore = 0;
  for (const entry of index) {
    const score = similarity(tokens, entry.tokens);
    if (score > bestScore) {
      bestScore = score;
      best = entry.title;
    }
  }
  return bestScore >= threshold ? best : null;
}

// ==========================================================================
// ARŞİV TEMİZLİĞİ
// --------------------------------------------------------------------------
// Hattın girişindeki başlık benzerliği süzgeci bazı tekrarları kaçırabiliyor
// (özellikle aynı çalıştırmada değil, farklı çalıştırmalarda takılabilenler
// veya süzgeç devreye girmeden önce girmiş kayıtlar). Bu fonksiyon arşivi
// tarayıp aynı olayın tekrarlarını TEK kayda indirir; her turda çalıştığı için
// kendi kendini iyileştirir.
//
// EŞİK ÖNEMLİ: silme telafi edilemez. Giriş eşiği (config.dupeThreshold = 0.65)
// bir ADAYI geri çevirmek için ucuzdur; ama burada yanlış eşleşme GERÇEK bir
// haberi silmektir. Bu yüzden varsayılan eşik daha temkinlidir (0.75) ve
// örneğin "… siber dolandırıcılık operasyonu" ile "… fuhuş operasyonu" gibi
// yalnızca genel kelimeleri örtüşen ayrı olaylar silinmez.
// ==========================================================================

/**
 * Aynı olayın tekrar eden kayıtlarını arşivden çıkarır.
 * @param {Array} articles
 * @param {number} threshold  başlık benzerliği eşiği (0-1)
 * @returns {{ kept: Array, removed: Array<{title:string, twin:string}> }}
 */
export function dedupeArticles(articles = [], threshold = 0.75) {
  // Bir grupta hangi kayıt tutulur: son dakika > daha dolu içerik > daha yeni.
  const puan = (a) =>
    (a.breaking ? 1000 : 0) +
    (a.body ? 100 : 0) +
    (a.comment ? 20 : 0) +
    (a.editorNote ? 20 : 0) +
    (Array.isArray(a.keyPoints) ? a.keyPoints.length : 0);
  const zaman = (a) => new Date(a.publishedAt || a.generatedAt || 0).getTime() || 0;
  const sirali = [...articles].sort((a, b) => puan(b) - puan(a) || zaman(b) - zaman(a));

  const kept = [];
  const index = [];
  const removed = [];
  for (const a of sirali) {
    const twin = findSimilar(a.title, index, threshold);
    if (twin) {
      removed.push({ title: a.title, twin });
      continue;
    }
    kept.push(a);
    index.push(...makeIndex([a.title]));
  }
  return { kept, removed };
}
