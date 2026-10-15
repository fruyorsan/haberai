import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", ".."); // haber-sitesi/
const REAL = join(ROOT, "data", "articles.json");
const SAMPLE = join(ROOT, "data", "sample-articles.json");

export function slugify(str) {
  const map = {
    ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u",
    Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u",
  };
  return String(str)
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readJson(path) {
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

let cache = null;

/** Gerçek haberler varsa onları, yoksa örnek veriyi döndürür. */
export function getArticles() {
  if (cache) return cache;

  let list = readJson(REAL);
  if (!list.length) list = readJson(SAMPLE);

  const usedSlugs = new Set();
  list = list.map((a) => {
    let slug = a.slug || slugify(a.title);
    while (usedSlugs.has(slug)) slug = `${slug}-${a.id || "x"}`;
    usedSlugs.add(slug);
    return {
      ...a,
      slug,
      categorySlug: slugify(a.category || "diger"),
      url: `/haber/${slug}/`,
    };
  });

  list.sort((a, b) =>
    (b.publishedAt || b.generatedAt || "").localeCompare(a.publishedAt || a.generatedAt || "")
  );
  cache = list;
  return list;
}

export function getCategories() {
  const map = new Map();
  for (const a of getArticles()) {
    if (!map.has(a.categorySlug)) {
      map.set(a.categorySlug, { name: a.category, slug: a.categorySlug, count: 0 });
    }
    map.get(a.categorySlug).count++;
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

export function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m} dakika önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} saat önce`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} gün önce`;
  return formatDate(iso);
}

export function siteName() {
  return "HaberAI";
}
