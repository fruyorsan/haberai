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

// Kaynak RSS'lerinde saat kayması olabiliyor: yayın tarihi gelecekte kalırsa
// eski haber "en yeni" sanılıp üst şeride çıkıyor. 15 dakikadan ileri tarihler
// haberin gerçek üretim zamanına düşürülür.
const GELECEK_TOLERANS_MS = 15 * 60 * 1000;

/** Haberin sıralama için kullanılan gerçek yayın zamanı (ms). */
export function publishedTime(a) {
  const p = new Date(a?.publishedAt || "").getTime();
  const g = new Date(a?.generatedAt || "").getTime();
  if (Number.isFinite(p) && p <= Date.now() + GELECEK_TOLERANS_MS) return p;
  if (Number.isFinite(g)) return g;
  return Number.isFinite(p) ? p : 0;
}

/** Gösterim için düzeltilmiş yayın tarihi (ISO metni). */
export function publishedISO(a) {
  const t = publishedTime(a);
  return t ? new Date(t).toISOString() : a?.publishedAt || a?.generatedAt || "";
}

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

  list.sort((a, b) => publishedTime(b) - publishedTime(a));
  cache = list;
  return list;
}

/**
 * Manşet/vitrin için haber seçimi: en yeni haberler arasından önce kaynak
 * fotoğrafı olanlar alınır (tarih sırası korunur). Fotoğraflı haber yetmezse
 * kalanlar markalı kapak görseliyle eklenir. Böylece en görünür alan hep
 * gerçek fotoğrafla açılır, vitrin de eski haberlere düşmez.
 */
export function getFeatured(count = 6, horizon = 20) {
  const recent = getArticles().slice(0, Math.max(count, horizon));
  const withPhoto = recent.filter((a) => a.image);
  if (withPhoto.length >= count) return withPhoto.slice(0, count);
  return [...withPhoto, ...recent.filter((a) => !a.image)].slice(0, count);
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
  let t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  if (t > Date.now() + GELECEK_TOLERANS_MS) t = Date.now(); // gelecek tarihli kaynak hatası
  const diff = Date.now() - t;
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

// --- Sayfalama yardımcıları ---
export const PER_PAGE = 24;

/** Bir listeyi sayfalara böler. */
export function paginate(list, page, perPage = PER_PAGE) {
  const totalPages = Math.max(1, Math.ceil(list.length / perPage));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * perPage;
  return {
    items: list.slice(start, start + perPage),
    current,
    totalPages,
    total: list.length,
    perPage,
  };
}

/** Toplam sayfa sayısı. */
export function totalPages(list, perPage = PER_PAGE) {
  return Math.max(1, Math.ceil(list.length / perPage));
}
