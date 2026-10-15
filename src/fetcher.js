import Parser from "rss-parser";
import { config } from "./config.js";

const parser = new Parser({
  timeout: 20000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; HaberAI/0.1; RSS okuyucu)",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  },
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
    ],
  },
});

/** Tek bir RSS kaynağını çeker ve normalize eder. Hata olursa boş dizi döner. */
async function fetchOne(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    const items = (parsed.items || [])
      .map((item) => {
        const raw =
          item.contentSnippet || item.contentEncoded || item.content || item.summary || "";
        return {
          source: feed.name,
          title: clean(item.title),
          link: (item.link || "").trim(),
          content: clean(raw).slice(0, 1500),
          image: extractImage(item),
          publishedAt: toISO(item.isoDate || item.pubDate),
        };
      })
      .filter((it) => it.title && it.link && it.content.length >= config.minContentLength);
    console.log(`  ✓ ${feed.name}: ${items.length} haber`);
    return items;
  } catch (err) {
    console.warn(`  ✗ ${feed.name}: ${err.message}`);
    return [];
  }
}

export async function fetchAllFeeds() {
  console.log("RSS kaynakları çekiliyor...");
  const results = await Promise.all(config.feeds.map(fetchOne));
  return results.flat();
}

function clean(str = "") {
  return String(str)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;|&#39;/g, "'")
    .replace(/&quot;|&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&hellip;/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

/** Haber görselini mümkün olan kaynaklardan çıkarır. Bulamazsa null. */
function extractImage(item) {
  if (item.enclosure?.url && /^https?:/i.test(item.enclosure.url)) {
    return item.enclosure.url;
  }
  const media = item.mediaContent || item.mediaThumbnail;
  if (Array.isArray(media)) {
    for (const m of media) {
      const url = m?.$?.url || m?.url;
      if (url && /^https?:/i.test(url)) return url;
    }
  }
  const html = item.contentEncoded || item.content || "";
  const match = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return match && /^https?:/i.test(match[1]) ? match[1] : null;
}

function toISO(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
