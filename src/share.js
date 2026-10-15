// Sosyal dağıtım: yeni haberleri (opsiyonel) sosyal kanallara paylaşır.
// Hiçbir harici bağımlılık yoktur; yalnızca yerleşik fetch + node:crypto kullanılır.
//
// Tasarım ilkeleri:
//  - Tamamen opsiyonel: ilgili env değişkenleri yoksa o kanal sessizce atlanır.
//  - Kanal başına bağımsız: bir kanal hata verirse diğerleri devam eder.
//  - Tekrarlama önleme: paylaşılan haber id'leri data/social.json'da tutulur.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHmac, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const SOCIAL_FILE = join(DATA_DIR, "social.json");

const DEFAULT_SITE_URL = "https://fruyorsan.github.io";
const X_LIMIT = 280; // X karakter sınırı
const X_URL_WEIGHT = 23; // X tüm linkleri 23 karakter sayar
const BSKY_LIMIT = 300; // Bluesky sınırı

// Bir çalıştırmada paylaşılacak maksimum haber (ilk kurulumda eski arşivin
// tek seferde taşmasını önler). 0 veya negatif → sınırsız.
const MAX_PER_RUN = Number(process.env.SHARE_MAX_PER_RUN ?? 5);

// --------------------------------------------------------------------------
// Yardımcılar
// --------------------------------------------------------------------------

function siteUrl() {
  return (process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

function slugify(str) {
  const map = {
    ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u",
    Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u",
  };
  return String(str)
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function articleUrl(article) {
  const slug = (article.slug && String(article.slug).trim()) || slugify(article.title || "");
  return slug ? `${siteUrl()}/haber/${slug}/` : siteUrl();
}

function truncate(str, max) {
  str = String(str || "").trim();
  if (max <= 1) return str.slice(0, Math.max(0, max));
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1).replace(/\s+\S*$/, "").trimEnd()}…`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** X/Bluesky için sınırlı uzunlukta metin üretir. */
function buildPostText(article, { limit, urlWeight } = {}) {
  const url = articleUrl(article);
  const urlLen = urlWeight ?? url.length;
  const budget = Math.max(20, (limit || 300) - urlLen - 2);
  const title = String(article.title || "").trim();
  const summary = String(article.summary || "").trim();

  let body = title;
  if (summary) {
    const remaining = budget - title.length - 1;
    if (remaining > 40) body = `${title}\n${truncate(summary, remaining)}`;
  }
  body = truncate(body, budget);
  return `${body}\n${url}`;
}

/** Telegram/Discord/Slack için daha uzun, okunaklı metin. */
function baseText(article) {
  const parts = [String(article.title || "").trim()];
  const summary = truncate(article.summary || "", 280);
  if (summary) parts.push(summary);
  parts.push(articleUrl(article));
  return parts.join("\n\n");
}

function telegramText(article) {
  let out = `<b>${escapeHtml(article.title)}</b>`;
  const summary = truncate(article.summary || "", 280);
  if (summary) out += `\n\n${escapeHtml(summary)}`;
  out += `\n\n🔗 <a href="${escapeHtml(articleUrl(article))}">Haberi oku</a>`;
  return out;
}

async function postJson(url, { headers = {}, body, timeout = 20000 } = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// --------------------------------------------------------------------------
// Kanal uygulamaları (her biri env yoksa hiçbir şey yapmadan döner)
// --------------------------------------------------------------------------

async function shareTelegram(article) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  await postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
    body: {
      chat_id: chatId,
      text: telegramText(article),
      parse_mode: "HTML",
      disable_web_page_preview: false,
    },
  });
}

async function shareDiscord(article) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  await postJson(url, { body: { content: baseText(article) } });
}

async function shareSlack(article) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  await postJson(url, { body: { text: baseText(article) } });
}

async function shareWebhook(article) {
  const url = process.env.SHARE_WEBHOOK_URL;
  if (!url) return;
  await postJson(url, {
    body: {
      title: article.title,
      summary: article.summary || "",
      url: articleUrl(article),
      category: article.category || "",
      image: article.image || null,
    },
  });
}

/** Metindeki linkler için Bluesky `facet` (tıklanabilir link) üretir. */
function linkFacets(text) {
  const facets = [];
  const re = /https?:\/\/[^\s]+/g;
  let m;
  while ((m = re.exec(text))) {
    const byteStart = Buffer.byteLength(text.slice(0, m.index), "utf8");
    const byteEnd = byteStart + Buffer.byteLength(m[0], "utf8");
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: m[0] }],
    });
  }
  return facets;
}

async function shareBluesky(article) {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) return;

  const session = await postJson("https://bsky.social/xrpc/com.atproto.server.createSession", {
    body: { identifier: handle, password },
  });
  const token = session?.accessJwt;
  const did = session?.did;
  if (!token || !did) throw new Error("Bluesky oturumu açılamadı");

  const text = buildPostText(article, { limit: BSKY_LIMIT });
  const record = {
    $type: "app.bsky.feed.post",
    text,
    langs: ["tr"],
    facets: linkFacets(text),
    createdAt: new Date().toISOString(),
  };

  await postJson("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
    headers: { Authorization: `Bearer ${token}` },
    body: { repo: did, collection: "app.bsky.feed.post", record },
  });
}

const encodeRfc3986 = (str) =>
  encodeURIComponent(String(str)).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );

/** OAuth 1.0a Authorization başlığını node:crypto ile MANUEL üretir. */
function oauth1Header({ method, url, consumerKey, consumerSecret, token, tokenSecret }) {
  const oauth = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: "1.0",
  };

  // İmzaya giren tek parametre kümesi oauth_* parametreleridir
  // (gövde JSON olduğu için imzaya dahil edilmez).
  const paramString = Object.keys(oauth)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(oauth[k])}`)
    .join("&");

  const baseString = `${method.toUpperCase()}&${encodeRfc3986(url)}&${encodeRfc3986(paramString)}`;
  const signingKey = `${encodeRfc3986(consumerSecret)}&${encodeRfc3986(tokenSecret)}`;
  oauth.oauth_signature = createHmac("sha1", signingKey).update(baseString).digest("base64");

  return `OAuth ${Object.keys(oauth)
    .sort()
    .map((k) => `${encodeRfc3986(k)}="${encodeRfc3986(oauth[k])}"`)
    .join(", ")}`;
}

async function shareX(article) {
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_SECRET;
  const token = process.env.X_ACCESS_TOKEN;
  const tokenSecret = process.env.X_ACCESS_SECRET;
  if (!consumerKey || !consumerSecret || !token || !tokenSecret) return;

  const url = "https://api.twitter.com/2/tweets";
  const authorization = oauth1Header({
    method: "POST",
    url,
    consumerKey,
    consumerSecret,
    token,
    tokenSecret,
  });

  await postJson(url, {
    headers: { Authorization: authorization },
    body: { text: buildPostText(article, { limit: X_LIMIT, urlWeight: X_URL_WEIGHT }) },
  });

  console.warn("Not: X/Twitter paylaşımı canlı ortamda doğrulanmadı (OAuth 1.0a manuel imzalandı).");
}

// Kanal tanımları: enabled=false olanlar hiç çağrılmaz, gürültü üretmez.
function channels() {
  return [
    {
      name: "telegram",
      enabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      run: shareTelegram,
    },
    { name: "discord", enabled: !!process.env.DISCORD_WEBHOOK_URL, run: shareDiscord },
    { name: "slack", enabled: !!process.env.SLACK_WEBHOOK_URL, run: shareSlack },
    { name: "webhook", enabled: !!process.env.SHARE_WEBHOOK_URL, run: shareWebhook },
    {
      name: "bluesky",
      enabled: !!(process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD),
      run: shareBluesky,
    },
    {
      name: "x",
      enabled: !!(
        process.env.X_API_KEY &&
        process.env.X_API_SECRET &&
        process.env.X_ACCESS_TOKEN &&
        process.env.X_ACCESS_SECRET
      ),
      run: shareX,
    },
  ];
}

// --------------------------------------------------------------------------
// Tekrar önleme deposu (data/social.json)
// --------------------------------------------------------------------------

async function loadShared() {
  if (!existsSync(SOCIAL_FILE)) return { updatedAt: null, shared: [] };
  try {
    const data = JSON.parse(await readFile(SOCIAL_FILE, "utf8"));
    if (Array.isArray(data)) return { updatedAt: null, shared: data.map(String) };
    const shared = Array.isArray(data.shared) ? data.shared.map(String) : [];
    return { updatedAt: data.updatedAt || null, shared };
  } catch {
    return { updatedAt: null, shared: [] };
  }
}

async function saveShared(sharedSet) {
  await mkdir(DATA_DIR, { recursive: true });
  const payload = {
    updatedAt: new Date().toISOString(),
    shared: [...sharedSet].sort(),
  };
  await writeFile(SOCIAL_FILE, JSON.stringify(payload, null, 2), "utf8");
}

// --------------------------------------------------------------------------
// Ana giriş noktası
// --------------------------------------------------------------------------

/**
 * Verilen haberler arasından daha önce paylaşılmayanları tüm yapılandırılmış
 * kanallara paylaşır. Hiçbir kanal yapılandırılmadıysa sessizce döner.
 *
 * @param {Array<object>} articles Paylaşılacak haber adayları (id alanı olmalı).
 * @param {{ dry?: boolean }} [opts] dry=true ise hiçbir istek gönderilmez, dosya yazılmaz.
 * @returns {Promise<{configured: string[], total: number, shared: number, dry: boolean}>}
 */
export async function shareNewArticles(articles, { dry = false } = {}) {
  const active = channels().filter((c) => c.enabled);

  if (!active.length) {
    console.log("Sosyal paylaşım: paylaşım kanalı yapılandırılmadı (anahtar yok), atlanıyor.");
    return { configured: [], total: 0, shared: 0, dry };
  }

  let sharedSet;
  try {
    sharedSet = new Set((await loadShared()).shared);
  } catch (err) {
    console.warn(`Sosyal paylaşım: data/social.json okunamadı (${err.message}); sıfırdan başlanıyor.`);
    sharedSet = new Set();
  }

  const list = (Array.isArray(articles) ? articles : []).filter(
    (a) => a && a.id && !sharedSet.has(String(a.id))
  );

  // En yeni haberler önce paylaşılsın.
  list.sort((a, b) =>
    String(b.generatedAt || b.publishedAt || "").localeCompare(
      String(a.generatedAt || a.publishedAt || "")
    )
  );

  const queue = MAX_PER_RUN > 0 ? list.slice(0, MAX_PER_RUN) : list;
  const channelNames = active.map((c) => c.name);

  console.log(
    `Sosyal paylaşım: ${queue.length} yeni haber, ${active.length} kanal ` +
      `(${channelNames.join(", ")})${dry ? " [dry]" : ""}`
  );

  if (!queue.length) {
    return { configured: channelNames, total: 0, shared: 0, dry };
  }

  let sharedCount = 0;
  for (const article of queue) {
    let anyOk = false;
    for (const channel of active) {
      try {
        if (dry) {
          anyOk = true;
          continue;
        }
        await channel.run(article);
        anyOk = true;
        console.log(`  ✓ [${channel.name}] ${truncate(article.title, 60)}`);
      } catch (err) {
        // Kanal bağımsız: hata akışı kırmaz, diğer kanallar devam eder.
        console.warn(`  ✗ [${channel.name}] ${err.message}`);
      }
    }
    if (dry && anyOk) {
      console.log(`  [dry] paylaşılacak: ${truncate(article.title, 70)}`);
    }
    if (anyOk) {
      sharedSet.add(String(article.id));
      sharedCount++;
    }
  }

  if (!dry && sharedCount) {
    try {
      await saveShared(sharedSet);
    } catch (err) {
      console.warn(`Sosyal paylaşım: data/social.json yazılamadı (${err.message}).`);
    }
  }

  return { configured: channelNames, total: queue.length, shared: dry ? 0 : sharedCount, dry };
}
