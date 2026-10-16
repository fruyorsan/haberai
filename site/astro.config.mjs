import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Alan adı: haberinai.com.tr
// (SITE_URL ortam değişkeni verilirse o kullanılır.)
const site = process.env.SITE_URL || "https://haberinai.com.tr";

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "ignore",
  compressHTML: true,
  // Kapak görselleri (/kapak/*.svg) sayfa değildir; site haritasına girmez.
  integrations: [sitemap({ filter: (page) => !page.includes("/kapak/") })],
});
