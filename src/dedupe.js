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
