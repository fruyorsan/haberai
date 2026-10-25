import { publishedISO, getYayinArticles } from "../lib/articles.js";
import { kapakKaynagi } from "../lib/kapak.js";
import { siteOrigin } from "../lib/site-meta.js";

// ============================================================================
// /feed.json — JSON Feed 1.1
// ----------------------------------------------------------------------------
// RSS'in JSON karşılığı. Yapay zekâ asistanları, haber okuyucuları ve
// otomasyonlar için ayrıştırması kolay, standart bir akış.
//   https://www.jsonfeed.org/version/1.1/
// ============================================================================
export function GET({ site }) {
  const origin = siteOrigin(site);
  const makale = (url) => (url ? new URL(url, origin).href : undefined);

  const items = getYayinArticles()
    .slice(0, 50)
    .map((a) => {
      const kapak = kapakKaynagi(a);
      const tarih = publishedISO(a);
      return {
        id: `${origin}${a.url}`,
        url: `${origin}${a.url}`,
        title: a.title,
        summary: a.summary || "",
        content_text: a.summary || "",
        date_published: tarih ? new Date(tarih).toISOString() : undefined,
        tags: [a.category, ...(Array.isArray(a.tags) ? a.tags : [])].filter(Boolean),
        image: kapak ? makale(kapak) : undefined,
        language: "tr-TR",
        authors: [{ name: "HaberinAi", url: origin }],
      };
    });

  const govde = {
    version: "https://jsonfeed.org/version/1.1",
    title: "HaberinAi",
    home_page_url: `${origin}/`,
    feed_url: `${origin}/feed.json`,
    description:
      "Yapay zekâ destekli Türkçe haber özetleri, son dakika ve editör yorumları.",
    language: "tr-TR",
    icon: `${origin}/ikon-512.png`,
    favicon: `${origin}/ikon-192.png`,
    authors: [{ name: "HaberinAi", url: origin }],
    items,
  };

  return new Response(JSON.stringify(govde), {
    headers: {
      "Content-Type": "application/feed+json; charset=utf-8",
      "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
    },
  });
}
