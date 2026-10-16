import Parser from "rss-parser";
import { config } from "./config.js";
import { looksLikeSpamTitle } from "./kalite.js";
import { collectImageCandidates, looksLikeIcon, urlHintScore } from "./gorsel.js";

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
  const isGoogleNews = /news\.google\.com/i.test(feed.url || "");
  try {
    const parsed = await parser.parseURL(feed.url);
    const items = (parsed.items || [])
      .map((item) => {
        const raw =
          item.contentSnippet || item.contentEncoded || item.content || item.summary || "";

        // Google News başlıkları "Başlık - Kaynak Adı" biçiminde gelir.
        // Kaynağı ayırıp başlığı bu ekten temizliyoruz; böylece hem gösterim
        // düzgün oluyor hem de aynı haber farklı Google News sorgularında
        // aynı kaynak adıyla tekrar kontrolüne girebiliyor.
        let title = clean(item.title);
        let sourceName = feed.name;
        if (isGoogleNews) {
          const parsedTitle = splitGoogleNewsTitle(title, item.creator);
          title = parsedTitle.title;
          sourceName = parsedTitle.source || feed.name;
        }

        return {
          source: sourceName,
          feedName: feed.name,
          feedCategory: feed.category || null,
          fast: !!feed.fast,
          title,
          link: (item.link || "").trim(),
          content: clean(raw).slice(0, 3500),
          image: extractImage(item),
          publishedAt: clampFuture(toISO(item.isoDate || item.pubDate)),
        };
      })
      .filter(
        (it) =>
          it.title &&
          it.link &&
          it.content.length >= config.minContentLength &&
          !looksLikeSpamTitle(it.title) // SEO çöpü başlıkları hatta sokma
      );
    console.log(`  ✓ ${feed.name}: ${items.length} haber`);
    return items;
  } catch (err) {
    console.warn(`  ✗ ${feed.name}: ${err.message}`);
    return [];
  }
}

/**
 * Google News başlığını "Başlık" + "Kaynak Adı" olarak ayırır.
 * Önce rss-parser item.creator'a bakar; yoksa başlıktaki son " - " ekini kullanır.
 */
function splitGoogleNewsTitle(title, creator) {
  const c = clean(creator);
  if (c) return { title, source: c };

  const text = String(title || "");
  const idx = text.lastIndexOf(" - ");
  if (idx > 0) {
    const head = text.slice(0, idx).trim();
    const tail = text.slice(idx + 3).trim();
    if (head && tail && tail.length <= 60) return { title: head, source: tail };
  }
  return { title: text, source: "" };
}

export async function fetchAllFeeds() {
  console.log("RSS kaynakları çekiliyor...");
  const results = await Promise.all(config.feeds.map(fetchOne));
  return results.flat();
}

/**
 * Saati ileri olan kaynaklarda yayın tarihi gelecekte görünebiliyor; bu da
 * haberin listeyi sürekli ele geçirmesine yol açıyor. 15 dakikadan fazla
 * ileri tarihleri "şimdi"ye çekiyoruz.
 */
function clampFuture(iso) {
  if (!iso) return iso;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  return t > Date.now() + 15 * 60 * 1000 ? new Date().toISOString() : iso;
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
  const urls = [];
  if (item.enclosure?.url) urls.push(item.enclosure.url);
  const media = item.mediaContent || item.mediaThumbnail;
  if (Array.isArray(media)) {
    for (const m of media) {
      const url = m?.$?.url || m?.url;
      // Boyut bilgisi varsa büyük olanı öne al.
      const w = Number(m?.$?.width || m?.width || 0);
      if (url && w >= 600) urls.unshift(url);
      else if (url) urls.push(url);
    }
  }
  const html = item.contentEncoded || item.content || "";
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) && urls.length < 12) urls.push(m[1]);

  // Logo/ikon/placeholder olanları ele, en büyük görünümlü adayı seç.
  const clean = urls
    .map((u) => String(u || "").trim().replace(/&amp;/g, "&"))
    .filter((u) => /^https?:\/\//i.test(u) && !looksLikeIcon(u));
  if (!clean.length) return null;
  clean.sort((a, b) => urlHintScore(b) - urlHintScore(a));
  return clean[0];
}

/** Haber sayfasını BİR kez indirip hem görsel adaylarını hem de okunabilir gövde metnini çıkarır. */
export async function fetchPageExtras(url) {
  if (!url) return { image: null, images: [], text: "" };
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HaberAI/0.1; +https://fruyorsan.github.io)" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return { image: null, images: [], text: "" };
    const html = (await res.text()).slice(0, 400000);
    return {
      image: extractOgImage(html),
      images: collectImageCandidates(html, url),
      text: extractReadableText(html),
    };
  } catch {
    return { image: null, images: [], text: "" };
  }
}

/** Geriye dönük uyumluluk: sadece görseli döner. */
export async function fetchOgImage(url) {
  return (await fetchPageExtras(url)).image;
}

function extractOgImage(html) {
  const patterns = [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m && m[1] && /^https?:/i.test(m[1])) return m[1];
  }
  return null;
}

/**
 * Haber sayfasındaki <p> metinlerinden okunabilir gövdeyi çıkarır.
 * Amaç: AI'a kaynaktaki GERÇEK ayrıntıları vermek (uydurmayı azaltır).
 */
function extractReadableText(html) {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|header|footer|aside|form|figure|iframe)[\s\S]*?<\/\1>/gi, " ");

  const paragraphs = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  let total = 0;
  while ((m = re.exec(body)) && total < 4500) {
    const text = clean(m[1]);
    if (text.length < 70) continue;
    if (/çerez|çerezler|cookie|abonelik|bülten|reklam|takip et|yorum yap|©/i.test(text)) continue;
    paragraphs.push(text);
    total += text.length;
  }
  return paragraphs.join("\n\n");
}

function toISO(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
