import { siteOrigin } from "../lib/site-meta.js";

// robots.txt dinamik üretilir: alan adı değiştiğinde site haritası adresleri
// kendiliğinden yeni adrese döner.
export function GET({ site }) {
  const origin = siteOrigin(site);
  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${origin}/sitemap-index.xml`,
    `Sitemap: ${origin}/news-sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
