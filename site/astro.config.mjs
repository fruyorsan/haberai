import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { getArticles, getTags, publishedISO } from "./src/lib/articles.js";

// Alan adı: yayında olduğumuz adres VARSAYILAN olarak yazılır ki kanonik
// adresler, site haritaları ve RSS kendi kendine tutarlı olsun. Özel alan adı
// (haberinai.com.tr) yayına girdiğinde depoda SITE_URL değişkeni tanımlanır:
//   gh variable set SITE_URL --body "https://haberinai.com.tr"
const site = process.env.SITE_URL || "https://fruyorsan.github.io";

// Site haritasındaki her adrese "lastmod" yazılır: Google tazelik taramasını
// bu bilgiye göre planlar. Haber sayfasında haberin zamanı, liste sayfalarında
// (anasayfa, /haberler/, /son-dakika/, kategori) o listedeki en yeni haberin
// zamanı kullanılır. Bilgi sayfalarında (hakkımızda vb.) lastmod verilmez.
const articles = getArticles();
const haberTarihi = new Map(articles.map((a) => [a.url, publishedISO(a)]));

// getArticles() en yeniden eskiye sıralı döner.
const enYeniTarih = articles.length ? publishedISO(articles[0]) : "";

const kategoriEnYeni = new Map();
for (const a of articles) {
  if (!kategoriEnYeni.has(a.categorySlug)) kategoriEnYeni.set(a.categorySlug, publishedISO(a));
}

const konuEnYeni = new Map(getTags().map((t) => [t.slug, publishedISO(t.articles[0])]));

function lastmod(pathname) {
  if (haberTarihi.has(pathname)) return haberTarihi.get(pathname);

  const kategori = pathname.match(/^\/kategori\/([^/]+)\//);
  if (kategori) return kategoriEnYeni.get(kategori[1]) || enYeniTarih;

  const konu = pathname.match(/^\/etiket\/([^/]+)\//);
  if (konu) return konuEnYeni.get(konu[1]) || enYeniTarih;

  if (
    pathname === "/" ||
    pathname === "/akis/" ||
    pathname === "/son-dakika/" ||
    pathname === "/etiketler/" ||
    pathname.startsWith("/haberler/")
  ) {
    return enYeniTarih;
  }
  return "";
}

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "ignore",
  compressHTML: true,
  integrations: [
    sitemap({
      // Kapak görselleri (/kapak/*.svg) sayfa değildir; site haritasına girmez.
      // Kategori akışları (/akis/kategori/*) "noindex" gezinme yardımcılarıdır.
      filter: (page) =>
        !page.includes("/kapak/") &&
        !page.includes("/akis/kategori/") &&
        // Hesap ve profil sayfaları noindex'tir; site haritasına girmez.
        !page.includes("/hesap/") &&
        !page.includes("/profil/") &&
        // Arama sayfası da noindex'tir (içeriği istemci tarafında üretilir);
        // robots.txt'te de kapalıdır, site haritasında hiç görünmemeli.
        !page.includes("/ara/"),
      serialize(item) {
        const iso = lastmod(new URL(item.url).pathname);
        return iso ? { ...item, lastmod: iso } : item;
      },
    }),
  ],
});
