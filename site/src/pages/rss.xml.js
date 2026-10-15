import { getArticles, siteName } from "../lib/articles.js";

const SITE = "https://fruyorsan.github.io";

function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function GET() {
  const items = getArticles()
    .slice(0, 50)
    .map(
      (a) => `    <item>
      <title>${esc(a.title)}</title>
      <link>${SITE}${a.url}</link>
      <guid>${SITE}${a.url}</guid>
      <description>${esc(a.summary)}</description>
      ${a.publishedAt ? `<pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>` : ""}
      <category>${esc(a.category)}</category>
    </item>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${siteName()}</title>
    <link>${SITE}</link>
    <description>Yapay zekâ destekli haber özetleri ve editör yorumları</description>
    <language>tr</language>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
