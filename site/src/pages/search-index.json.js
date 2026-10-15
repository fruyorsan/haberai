import { getArticles } from "../lib/articles.js";

/** Arama sayfası için hafif bir indeks üretir. */
export function GET() {
  const index = getArticles().map((a) => ({
    t: a.title,
    u: a.url,
    s: a.summary,
    c: a.category,
    src: a.source,
    d: a.publishedAt || a.generatedAt,
    tags: a.tags || [],
  }));

  return new Response(JSON.stringify(index), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
