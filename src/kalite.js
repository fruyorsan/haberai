// ==========================================================================
// KALİTE SÜZGECİ
// --------------------------------------------------------------------------
// Özellikle Google News sorgularında karşımıza çıkan "SEO çöpü" başlıkları
// eler. Amaç: hatta ve son dakika şeridine yalnızca gerçek haber başlıkları
// girsin. Kural yanlış-pozitif üretmeyecek kadar dar tutuldu.
// ==========================================================================

// Doğrudan çöp olduğu belli kalıplar
const SPAM_PATTERNS = [
  /haber başlıkları/i,
  /son dakika haberleri/i,
  /haberleri ve gelişmeler/i,
  /gündem haberleri/i,
  /\bhaberi\.\s*$/i, // "... haberi." ile biten site içi toplama başlıkları
  /gelişmeler[İiı]?\s*$/i,
  /^\s*(günün|haftanın|son)\s+gelişmeler[İiı]?\s*$/i,
  /tıkla|buradan oku|izlemek için|canlı yayın izle/i,
  /(yorumlar|yorum) ve (haberler|gelişmeler)/i,
  /^\s*(son dakika|haber)\s*[-–|:]\s*$/i,
];

const MAX_TITLE = 140;

/**
 * Başlık çöp/SEO spamı mı?
 * @param {string} title
 * @returns {boolean} true ise başlık atılmalı
 */
export function looksLikeSpamTitle(title) {
  const t = String(title || "").replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (t.length > MAX_TITLE) return true;
  if (SPAM_PATTERNS.some((re) => re.test(t))) return true;

  // Ayraç yığını: "A | B | C | D" ya da "A - B - C - D" gibi toplama başlıkları
  if ((t.match(/[|•]/g) || []).length >= 2) return true;
  if ((t.match(/ - /g) || []).length >= 3) return true;

  // Çok soru işareti: "deprem mi oldu? nerede oldu?" gibi arama tuzağı başlıklar
  if ((t.match(/\?/g) || []).length >= 2) return true;

  // Neredeyse tamamı büyük harf + uzun başlık (bağırma/spam)
  const letters = t.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ]/g, "");
  if (letters.length >= 30) {
    const upper = letters.replace(/[^A-ZÇĞİÖŞÜ]/g, "").length;
    if (upper / letters.length > 0.85) return true;
  }

  // Aynı kelimenin 3+ kez tekrarı ("haber haber haber gündem")
  const words = t.toLocaleLowerCase("tr").split(/\s+/).filter((w) => w.length > 3);
  const counts = new Map();
  for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
  if ([...counts.values()].some((c) => c >= 3)) return true;

  return false;
}
