import { timeAgo, publishedISO, publishedTime, getYayinArticles } from "./articles.js";

// "Son dakika" penceresi: yayın üzerinden bu süre geçmediyse haber taze sayılır.
export const BREAKING_WINDOW_MS = 120 * 60 * 1000; // 120 dk
// Şeritte gösterilecek en fazla öğe.
export const BREAKING_MAX = 12;
// Listeye girebilmek için haberin en fazla bu kadar eski olması gerekir.
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Son 24 saatteki haberlerden "son dakika" listesini üretir.
 * - `breaking === true` olanlar ya da yayını ≤120 dk olanlar öne alınır.
 * - Kalan öğeler yeni→eski sıralanır.
 * - En fazla `limit` öğe döner.
 * Veri `breaking` alanını içermeyebilir; bu yüzden yokluğuna dayanıklıdır.
 */
export function getBreakingItems({ limit = BREAKING_MAX, now = Date.now() } = {}) {
  return getYayinArticles()
    .filter((a) => now - publishedTime(a) < DAY_MS)
    .map((a) => {
      const iso = publishedISO(a);
      const t = new Date(iso).getTime();
      const fresh = Number.isFinite(t) && now - t <= BREAKING_WINDOW_MS;
      return {
        title: a.title || "",
        url: a.url,
        category: a.category || "",
        source: a.source || "",
        publishedAt: iso,
        ago: timeAgo(iso),
        breaking: a.breaking === true || fresh,
        note: a.editorNote || "",
        _t: Number.isFinite(t) ? t : 0,
      };
    })
    .sort((x, y) => {
      if (x.breaking !== y.breaking) return x.breaking ? -1 : 1;
      return y._t - x._t;
    })
    .slice(0, limit)
    .map(({ _t, ...item }) => item);
}
