// TELİF GÜVENCESİ
//
// Kaynak haber metni yalnızca AI'ya girdi olarak verilir; hiçbir yerde yayınlanmaz.
// Bu modül, AI çıktısında kaynakla UZUN BİREBİR ÖRTÜŞEN cümleler kalırsa onları
// ayıklar. Böylece sitede yayınlanan hiçbir cümle kaynaktan kopyalanmış olmaz.

const KELIME_PENCERESI = 10; // bu uzunlukta birebir dizi "kopya" kabul edilir

/** Metni karşılaştırma için sözcük dizisine çevirir (noktalama atılır, Türkçe uyumlu). */
function kelimeler(text) {
  return String(text || "")
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function ngramSet(words, n) {
  const set = new Set();
  for (let i = 0; i + n <= words.length; i++) set.add(words.slice(i, i + n).join(" "));
  return set;
}

/** Şüpheli metin, kaynakta geçen n kelimelik bir dizi içeriyor mu? */
export function hasVerbatimRun(suspect, sourceWords, n = KELIME_PENCERESI) {
  const w = kelimeler(suspect);
  if (w.length < n || sourceWords.length < n) return false;
  const set = ngramSet(sourceWords, n);
  for (let i = 0; i + n <= w.length; i++) {
    if (set.has(w.slice(i, i + n).join(" "))) return true;
  }
  return false;
}

/** Cümle cümle temizler: kaynakla birebir örtüşen cümleleri atar. */
function temizle(text, sourceWords, n) {
  const raw = String(text || "").trim();
  if (!raw) return { text: "", removed: 0 };
  const cumleler = raw.split(/(?<=[.!?…])\s+/);
  const kalan = [];
  let removed = 0;
  for (const c of cumleler) {
    if (hasVerbatimRun(c, sourceWords, n)) {
      removed++;
      continue;
    }
    kalan.push(c);
  }
  return { text: kalan.join(" ").trim(), removed };
}

/**
 * AI çıktısını kaynak metne karşı denetler.
 * @returns {{cleaned: object, removed: number}}
 */
export function purgeCopiedText(ai, sourceText, n = KELIME_PENCERESI) {
  const sourceWords = kelimeler(sourceText);
  if (sourceWords.length < n) return { cleaned: ai, removed: 0 };

  let removed = 0;

  const summary = temizle(ai.summary, sourceWords, n);
  const comment = temizle(ai.comment, sourceWords, n);
  const note = temizle(ai.editorNote, sourceWords, n);
  removed += summary.removed + comment.removed + note.removed;

  const body = (ai.body || [])
    .map((p) => {
      const r = temizle(p, sourceWords, n);
      removed += r.removed;
      return r.text;
    })
    .filter((p) => p.length > 60);

  const keyPoints = (ai.keyPoints || []).filter((k) => !hasVerbatimRun(k, sourceWords, n));

  // Özet tamamen boşaldıysa gövdenin ilk paragrafına, o da yoksa başlığa düş.
  let cleanedSummary = summary.text;
  if (cleanedSummary.length < 60) {
    const fallback = body.find((p) => p.length >= 60) || "";
    if (fallback) cleanedSummary = fallback.slice(0, 320);
    else cleanedSummary = `${ai.title || ""}`.trim();
  }

  return {
    cleaned: {
      ...ai,
      summary: cleanedSummary,
      comment: comment.text,
      editorNote: note.text,
      body,
      keyPoints,
    },
    removed,
  };
}
