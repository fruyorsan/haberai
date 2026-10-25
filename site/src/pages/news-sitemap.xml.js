import { getYayinArticles } from "../lib/articles.js";
import { indeksSeti } from "../lib/indeks.js";

const escapeXml = (s) =>
  String(s ?? "").replace(/[<>&'"]/g, (c) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  }[c]));

/** Google News sitemap: son 48 saatteki haberler (en fazla 1000). */
export function GET({ site }) {
  const origin = String(site || "https://fruyorsan.github.io").replace(/\/$/, "");
  const cutoff = Date.now() - 48 * 3600 * 1000;

  // Google News site haritası yalnızca indekslenebilir sayfaları içermeli:
  // `noindex` bir URL'i haber site haritasına koymak çelişkidir.
  const indeks = indeksSeti();

  const recent = getYayinArticles()
    .filter((a) => new Date(a.publishedAt || a.generatedAt).getTime() >= cutoff)
    .filter((a) => !indeks || indeks.has(String(a.id)))
    .slice(0, 1000);

  const urls = recent
    .map((a) => {
      const loc = `${origin}${a.url}`;
      const date = new Date(a.publishedAt || a.generatedAt).toISOString();
      const kw = Array.isArray(a.tags)
        ? a.tags.filter(Boolean).slice(0, 12).join(", ")
        : "";
      return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <news:news>
      <news:publication>
        <news:name>HaberinAi</news:name>
        <news:language>tr</news:language>
      </news:publication>
      <news:publication_date>${date}</news:publication_date>
      <news:title>${escapeXml(a.title)}</news:title>${
        kw ? `\n      <news:keywords>${escapeXml(kw)}</news:keywords>` : ""
      }
    </news:news>
  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
