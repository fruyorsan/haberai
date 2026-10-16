import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Alan adı alındığında tek değişiklik: buradaki "site" değeri + public/CNAME.
// (SITE_URL ortam değişkeni verilirse o kullanılır.)
const site = process.env.SITE_URL || "https://fruyorsan.github.io";

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "ignore",
  // Kapak görselleri (/kapak/*.svg) sayfa değildir; site haritasına girmez.
  integrations: [sitemap({ filter: (page) => !page.includes("/kapak/") })],
});
