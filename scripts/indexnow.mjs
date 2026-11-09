// ==========================================================================
// INDEXNOW BİLDİRİCİ (AgriciDaniel/claude-seo scripts/indexnow_submit.py uyarlaması)
// --------------------------------------------------------------------------
// Yeni yayınlanan ve güncellenen haber URL'lerini IndexNow API'sine (Bing,
// Yandex, Naver, Seznam, Yep ve AI arama motorları) anında bildirir.
// ==========================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTICLES = path.join(KOK, "data", "articles.json");
const INDEKS = path.join(KOK, "data", "indeks.json");

const HOST = "haberinai.site";
const KEY = process.env.INDEXNOW_KEY || "haberinai2026indexnowkey8f4a9c2e1b";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

function slugify(str) {
  return String(str || "")
    .toLocaleLowerCase("tr")
    .replace(/[ıİ]/g, "i")
    .replace(/[şŞ]/g, "s")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

async function main() {
  if (!fs.existsSync(ARTICLES)) return;
  const raw = JSON.parse(fs.readFileSync(ARTICLES, "utf8"));
  const articles = Array.isArray(raw) ? raw : raw.articles || [];
  let indeksSet = null;
  if (fs.existsSync(INDEKS)) {
    try {
      const idx = JSON.parse(fs.readFileSync(INDEKS, "utf8"));
      if (Array.isArray(idx.ids)) indeksSet = new Set(idx.ids.map(String));
    } catch {}
  }

  const secilen = articles
    .filter((a) => !indeksSet || indeksSet.has(String(a.id)))
    .slice(0, 50);

  const urlList = [
    `https://${HOST}/`,
    `https://${HOST}/akis/`,
    `https://${HOST}/kategori/yapay-zeka/`,
    `https://${HOST}/kategori/oyun/`,
    `https://${HOST}/kategori/teknoloji/`,
    ...secilen.map((a) => `https://${HOST}/haber/${a.slug || slugify(a.title)}/`),
  ];

  const payload = {
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList,
  };

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    console.log(`IndexNow: ${urlList.length} URL gönderildi → HTTP ${res.status}`);
  } catch (err) {
    console.warn(`IndexNow uyarı: ${err.message}`);
  }
}

main();
