import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", ".."); // haber-sitesi/
const FILE = join(ROOT, "data", "market.json");

/** Piyasa verisini okur. Yoksa boş liste döner. */
export function getMarket() {
  if (!existsSync(FILE)) return { items: [], updatedAt: null };
  try {
    const data = JSON.parse(readFileSync(FILE, "utf8"));
    return { items: Array.isArray(data.items) ? data.items : [], updatedAt: data.updatedAt || null };
  } catch {
    return { items: [], updatedAt: null };
  }
}
