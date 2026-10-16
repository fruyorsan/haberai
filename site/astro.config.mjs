import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Yayına aldığında "site" adresini kendi alan adınla değiştir.
export default defineConfig({
  site: "https://fruyorsan.github.io",
  output: "static",
  trailingSlash: "ignore",
  // Kapak görselleri (/kapak/*.svg) sayfa değildir; site haritasına girmez.
  integrations: [sitemap({ filter: (page) => !page.includes("/kapak/") })],
});
