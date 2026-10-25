import { getYayinArticles } from "../lib/articles.js";
import { kapakKaynagi } from "../lib/kapak.js";

/** Arama sayfası için hafif bir indeks üretir. */
export function GET() {
  const index = getYayinArticles().map((a) => ({
    t: a.title,
    u: a.url,
    s: (a.summary || "").slice(0, 160),
    c: a.category,
    src: a.source,
    d: a.publishedAt || a.generatedAt,
    // Yanlış/genel kapak görselleri aramada da gösterilmez (lib/kapak.js).
    img: kapakKaynagi(a) || null,
    tags: Array.isArray(a.tags) ? a.tags.slice(0, 5) : [],
  }));

  return new Response(JSON.stringify(index), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
    },
  });
}
