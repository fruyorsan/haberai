import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Yayına aldığında "site" adresini kendi alan adınla değiştir.
export default defineConfig({
  site: "https://haberai.pages.dev",
  output: "static",
  trailingSlash: "ignore",
  integrations: [sitemap()],
});
