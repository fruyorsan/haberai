import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Astro, build sırasında bu modülü site/dist/.prerender/chunks altına
// paketlediği için import.meta.url kaynak dosyayı göstermiyor. Bu yüzden
// veri klasörü articles.js ile aynı şekilde aranır: önce site/ dizininden
// depo kökü, sonra depo kökü, en son kaynak dosyanın konumu.
const ROOT_CANDIDATES = [
  join(process.cwd(), ".."), // site/ -> depo kökü
  process.cwd(), // depo kökü
  join(__dirname, "..", "..", ".."), // kaynak dosya (doğrudan çalıştırma)
];
const ROOT =
  ROOT_CANDIDATES.find((root) => existsSync(join(root, "data", "market.json"))) ??
  join(process.cwd(), "..");
const FILE = join(ROOT, "data", "market.json");

/**
 * Piyasa verisini okur. Yoksa boş liste döner.
 * Build sırasında veri yoksa sessizce boş sayfa yayınlamak yerine uyarı basar:
 * sorun CI loglarında görünür olsun.
 */
export function getMarket() {
  if (!existsSync(FILE)) {
    console.warn(`[piyasa] market.json bulunamadı: ${FILE}`);
    return { items: [], updatedAt: null };
  }
  try {
    const data = JSON.parse(readFileSync(FILE, "utf8"));
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) console.warn(`[piyasa] market.json boş: ${FILE}`);
    return { items, updatedAt: data.updatedAt || null };
  } catch (err) {
    console.warn(`[piyasa] market.json okunamadı (${FILE}): ${err.message}`);
    return { items: [], updatedAt: null };
  }
}
