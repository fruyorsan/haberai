import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Alan adı: yayında olduğumuz adres VARSAYILAN olarak yazılır ki kanonik
// adresler, site haritaları ve RSS kendi kendine tutarlı olsun. Özel alan adı
// (haberinai.com.tr) yayına girdiğinde depoda SITE_URL değişkeni tanımlanır:
//   gh variable set SITE_URL --body "https://haberinai.com.tr"
const site = process.env.SITE_URL || "https://fruyorsan.github.io";

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "ignore",
  compressHTML: true,
  // Kapak görselleri (/kapak/*.svg) sayfa değildir; site haritasına girmez.
  integrations: [sitemap({ filter: (page) => !page.includes("/kapak/") })],
});
