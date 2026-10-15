import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const ARTICLES_FILE = join(DATA_DIR, "articles.json");

/** Bir linkten tekrar edilemez kimlik üretir. */
export function makeId(link) {
  return createHash("sha1").update(String(link)).digest("hex").slice(0, 16);
}

const GELECEK_TOLERANS_MS = 15 * 60 * 1000;

/**
 * Bazı RSS kaynakları saati ileri olduğu için haberin yayın tarihi gelecekte
 * kalıyor; bu da eski haberin "en yeni" sanılıp üst şeridi ele geçirmesine yol
 * açıyor. Gelecek tarihleri haberin gerçek üretim zamanına çeker.
 */
export function fixFutureDates(articles, log = false) {
  const limit = Date.now() + GELECEK_TOLERANS_MS;
  let fixed = 0;
  for (const a of articles || []) {
    const t = new Date(a?.publishedAt || 0).getTime();
    if (!Number.isFinite(t) || t <= limit) continue;
    const g = new Date(a?.generatedAt || 0).getTime();
    a.publishedAt =
      Number.isFinite(g) && g <= limit ? new Date(g).toISOString() : new Date().toISOString();
    fixed++;
  }
  if (fixed) console.log(`Tarih düzeltmesi: ${fixed} haberin gelecek tarihi gerçeğe çekildi`);
  return fixed;
}

export async function loadArticles() {
  if (!existsSync(ARTICLES_FILE)) return [];
  try {
    const articles = JSON.parse(await readFile(ARTICLES_FILE, "utf8"));
    fixFutureDates(articles);
    return articles;
  } catch {
    return [];
  }
}

export async function saveArticles(articles) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(ARTICLES_FILE, JSON.stringify(articles, null, 2), "utf8");
}

export function existingIds(articles) {
  return new Set(articles.map((a) => a.id));
}
