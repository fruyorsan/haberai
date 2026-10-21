import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Astro 7, build sırasında bu modülü site/dist/.prerender/chunks altına
// paketlediği için import.meta.url kaynak dosyayı göstermiyor. Veri klasörünü
// hem site/ hem depo kökünden çalışacak şekilde bul.
const ROOT_CANDIDATES = [
  join(process.cwd(), ".."), // site/ -> depo kökü
  process.cwd(), // depo kökü
  join(__dirname, "..", "..", ".."), // kaynak dosya (Astro 5 / doğrudan çalıştırma)
];
const ROOT =
  ROOT_CANDIDATES.find(
    (root) =>
      existsSync(join(root, "data", "articles.json")) ||
      existsSync(join(root, "data", "sample-articles.json")),
  ) ?? join(process.cwd(), "..");
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

  // ShiftDelete kuralı: Sitede YALNIZCA gerçek fotoğrafı olan haberler yer alır.
  // Yeşil SVG kapak veya fotoğrafsız haberlerin sitede görünmesine izin verilmez.
  list = list.filter((a) => typeof a.image === "string" && /^https?:\/\//i.test(a.image));

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
 * Manşet/vitrin için haber seçimi: en yeni haberler arasından "uygun" görseli
 * olanlar önce alınır (tarih sırası korunur). Uygunluk ölçütü çağırandan gelir
 * (site tarafında `kapakKaynagi`, yani yanlış/genel görselleri eleyen süzgeç);
 * böylece vitrine yalnızca gerçek fotoğrafı doğrulanmış haberler girer.
 * Uygun görselli haber yetmezse kalanlar sırayı bozmadan eklenir.
 */
export function getFeatured(count = 6, horizon = 20, uygun = (a) => Boolean(a.image)) {
  const recent = getArticles().slice(0, Math.max(count, horizon));
  const withRealPhoto = recent.filter((a) => uygun(a) && !/wikimedia|wikipedia/i.test(a.image || ""));
  const withStockPhoto = recent.filter((a) => uygun(a) && /wikimedia|wikipedia/i.test(a.image || ""));
  const withPhoto = [...withRealPhoto, ...withStockPhoto];
  if (withPhoto.length >= count) return withPhoto.slice(0, count);
  return [...withPhoto, ...recent.filter((a) => !uygun(a))].slice(0, count);
}

/**
 * Haber fotoğrafı adresini görüntüleme için hazırlar.
 *
 * Kaynak sitelerin fotoğrafları olduğu gibi (hotlink) gösterilir; ama çoğu
 * 100 KB - 1,5 MB arasında geliyor ve kartta yalnızca ~380 px genişlikte
 * görünüyor. Bu yüzden fotoğraf ücretsiz bir görsel CDN'inden (wsrv.nl)
 * geçirilir: boyutlandırılır ve WebP'ye çevrilir (tipik kazanç %90+).
 * CDN'e ulaşılamazsa bileşenler `data-orig` ile kaynak adrese düşer,
 * yani görsel kaybolmaz. Tamamen kapatmak için: NO_IMAGE_PROXY=1
 */
const DIRECT_IMAGE_HOSTS = /(\.teimg\.com|cryptopotato\.com|nuvemmag\.com|kentgazetesi\.com|hunattv\.com)$/i;
function normalizeSrc(src) {
  let s = String(src || "").replace(/&amp;/g, "&").trim();
  if (/wikimedia\.org\/wikipedia\/commons\/thumb\//i.test(s)) s = s.replace(/\/(1400|1600|1920)px-/i, "/1280px-");
  return s;
}
export function imageUrl(src, width = 800, quality = 85) {
  src = normalizeSrc(src);
  try { if (src && DIRECT_IMAGE_HOSTS.test(new URL(src).hostname)) return src; } catch {}
  if (!src || !/^https?:\/\//i.test(src)) return src || "";
  if (process.env.NO_IMAGE_PROXY) return src;
  const w = Math.round(width);
  const h = Math.round((width * 9) / 16);
  // ShiftDelete kalitesinde netlik: küçük kartlarda q80, büyük/Retina kartlarda q85.
  // &we (without enlargement) sayesinde kaynak görsel küçükse yapay bulanık büyütme yapılmaz.
  const q = w <= 480 ? 80 : quality;
  return `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=${w}&h=${h}&fit=cover&we&output=webp&q=${q}`;
}

/**
 * Responsive görsel kümesi (srcset). Tarayıcı ekranına/yoğunluğuna göre
 * en net fotoğrafı indirir (Retina ve masaüstü ekranlarda bulanıklık olmaz).
 */
export function imageSrcset(src, widths = [480, 800, 1080]) {
  src = normalizeSrc(src);
  try { if (src && DIRECT_IMAGE_HOSTS.test(new URL(src).hostname)) return ""; } catch {}
  if (!src || !/^https?:\/\//i.test(src)) return "";
  if (process.env.NO_IMAGE_PROXY) return "";
  return widths.map((w) => `${imageUrl(src, w)} ${w}w`).join(", ");
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

// --- Konu (etiket) sayfaları ---
// Etiketler yapay zekâ tarafından üretiliyor ve çoğu yalnızca tek bir haberde
// geçiyor. Her etikete sayfa açmak yüzlerce "ince" sayfa üretir; bu hem Google
// kalitesi hem de tarama bütçesi açısından risklidir. Bu yüzden yalnızca en az
// TAG_MIN haberde geçen etiketler sayfalaşır, kalanlar aramaya bağlanır.
export const TAG_MIN = 8;

let tagCache = null;

/** Yayına değer konular: en çok haberi olandan başlar. */
export function getTags(minCount = TAG_MIN) {
  if (!tagCache) {
    const kategoriSluglari = new Set(getCategories().map((c) => c.slug));
    const map = new Map();
    for (const a of getArticles()) {
      const gorulen = new Set();
      for (const ham of Array.isArray(a.tags) ? a.tags : []) {
        const ad = String(ham).trim();
        const slug = slugify(ad);
        // "İstanbul" ile "istanbul" aynı sayfada toplanır. Kategoriyle aynı olan
        // etiketler (gündem, teknoloji...) atlanır: kategori sayfasıyla
        // birbirinin kopyası iki liste oluşmasın.
        if (!slug || gorulen.has(slug) || kategoriSluglari.has(slug)) continue;
        gorulen.add(slug);
        if (!map.has(slug)) map.set(slug, { slug, adlar: new Map(), articles: [] });
        const e = map.get(slug);
        e.articles.push(a); // getArticles() en yeniden eskiye sıralı
        e.adlar.set(ad, (e.adlar.get(ad) || 0) + 1);
      }
    }
    tagCache = [...map.values()]
      .map((e) => ({
        slug: e.slug,
        name: [...e.adlar.entries()].sort((x, y) => y[1] - x[1])[0][0],
        count: e.articles.length,
        articles: e.articles,
      }))
      .sort((a, b) => b.count - a.count);
  }
  return tagCache.filter((t) => t.count >= minCount);
}

/** Etiketin sayfası varsa adresi, yoksa null (çağıran arama bağlantısı kurar). */
export function tagUrl(name) {
  const slug = slugify(String(name || ""));
  if (!slug) return null;
  return getTags().some((t) => t.slug === slug) ? `/etiket/${slug}/` : null;
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
  return "HaberinAi";
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
