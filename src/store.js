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

export async function loadArticles() {
  if (!existsSync(ARTICLES_FILE)) return [];
  try {
    return JSON.parse(await readFile(ARTICLES_FILE, "utf8"));
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
