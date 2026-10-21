// ==========================================================================
// KALİTE SÜZGECİ
// --------------------------------------------------------------------------
// Özellikle Google News sorgularında karşımıza çıkan "SEO çöpü" başlıkları,
// yabancı spam siteleri (vietnam.vn vb.), gündüz kuşağı magazin/burç tıklama
// tuzaklarını ve sıkıcı yerel belediye/dernek bültenlerini eler.
// ==========================================================================

// Doğrudan çöp olduğu belli başlık kalıpları
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
  // Gündüz kuşağı / burç / SEO tıklama tuzakları
  /\bgelinim mutfakta\b/i,
  /\b(zuhal topal|esra erol|müge anlı|kısmetse olur)\b/i,
  /\b(erkek|kadın) burcu\b/i,
  /\bgünlük burç yorum/i,
  /\b(cuma|kandil|bayram) mesajları\b/i,
  /\brüya tabir/i,
  /\b(aldın aldın|aktüel ürünler|kataloğu|indirim kataloğu)\b/i,
  // Yerel bülten / belediye / oda / okul PR haberleri
  /\bbelediyesi,?\s+personeline\b/i,
  /\bpersoneline\s+.*\beğitimi\b/i,
  /\bokullarda\s+.*\btaraması\b/i,
  /\bokullar için yeni oyun alanı\b/i,
  /\bbarosu['’]?nda yeni dönem\b/i,
  /\bşubeleri\s+.*\beylem\b/i,
  /\beğitim seferberliği başlattı\b/i,
  /\bvefa buluşması\b/i,
  /\byazılım ekibi\s+.*\betkinliğine katıldı\b/i,
  /\b(kaymakamı|belediye başkanı)\s+.*\bziyaret etti\b/i,
  /\bçelenk sunma töreni\b/i,
];

// Yabancı spam veya yerel bülten kaynakları
const SPAM_SOURCES = [
  /vietnam\.vn/i,
  /state_bank_of_vietnam/i,
  /\bvietnam\b/i,
  /\bsbv\b.*banka/i,
  /\bcan tho\b/i,
  /\bhanoitex\b/i,
  /bitlis\s*postası/i,
  /bitlispostasicom/i,
  /bursa\s*basın/i,
  /bursabasincom/i,
  /marmara\s*bölge/i,
  /marmarabolgecom/i,
  /giynik\s*gazetesi/i,
  /giynikgazetesi/i,
  /ajansturkhaber/i,
];

const MAX_TITLE = 140;

/**
 * Başlık veya kaynak çöp/SEO spamı mı?
 * @param {string} title
 * @param {string} [source]
 * @param {string} [url]
 * @returns {boolean} true ise haber atılmalı
 */
export function looksLikeSpamTitle(title, source = "", url = "") {
  const t = String(title || "").replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (t.length > MAX_TITLE) return true;
  if (SPAM_PATTERNS.some((re) => re.test(t))) return true;

  const srcAndUrl = `${source || ""} ${url || ""} ${t}`;
  if (SPAM_SOURCES.some((re) => re.test(srcAndUrl))) return true;

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

/**
 * Arşivdeki bir haber kaydı spam/çöp mü?
 * @param {object} a
 * @returns {boolean}
 */
export function isJunkArticle(a) {
  if (!a) return true;
  return looksLikeSpamTitle(a.title, a.source, `${a.sourceUrl || ""} ${a.image || ""}`);
}
