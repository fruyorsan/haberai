// ==========================================================================
// GÖRSEL SİTE HARİTASI — Google Görseller / Discover keşfi
// --------------------------------------------------------------------------
// Haber sitelerinde trafiğin önemli bir kısmı görsel aramadan gelir. Normal
// site haritası yalnızca sayfa URL'lerini bildirir; bu dosya her indeksli
// haberin kapak görselini `image:image` olarak bildirir.
//
// Yalnızca yayın çekirdeğindeki (indeks.json) haberler girer: noindex bir
// sayfanın görselini bildirmek çelişki olur.
// ==========================================================================
import { getYayinArticles, publishedISO } from "../lib/articles.js";
import { siteOrigin } from "../lib/site-meta.js";

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function absolute(value, origin) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return origin + s;
  return "";
}

export function GET({ site }) {
  const origin = siteOrigin(site);
  const articles = getYayinArticles().filter((a) => absolute(a.image, origin));

  const urls = articles
    .map((a) => {
      const page = origin + a.url;
      const img = absolute(a.image, origin);
      const title = esc(a.title);
      const caption = esc(a.summary ? String(a.summary).slice(0, 200) : a.title);
      return [
        "  <url>",
        `    <loc>${esc(page)}</loc>`,
        `    <lastmod>${esc(publishedISO(a))}</lastmod>`,
        "    <image:image>",
        `      <image:loc>${esc(img)}</image:loc>`,
        `      <image:title>${title}</image:title>`,
        `      <image:caption>${caption}</image:caption>`,
        "    </image:image>",
        "  </url>",
      ].join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
