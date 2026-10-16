// Arşivdeki görselsiz haberlere og:image kazandırır (tek seferlik yardımcı).
// Kullanım: node backfill-gorsel.mjs
import { readFile, writeFile } from "node:fs/promises";

const FILE = "data/articles.json";

const patterns = [
  /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
];

async function ogImage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 400000);
    for (const re of patterns) {
      const m = re.exec(html);
      if (m?.[1] && /^https?:/i.test(m[1])) return m[1].replace(/&amp;/g, "&");
    }
  } catch {
    /* yoksay */
  }
  return null;
}

const list = JSON.parse(await readFile(FILE, "utf8"));
const targets = list.filter((a) => !a.image && a.sourceUrl);
console.log(`Görselsiz haber: ${targets.length}/${list.length}`);

const added = [];
let done = 0;
const BATCH = 8;
for (let i = 0; i < targets.length; i += BATCH) {
  const chunk = targets.slice(i, i + BATCH);
  const found = await Promise.all(chunk.map((a) => ogImage(a.sourceUrl)));
  chunk.forEach((a, j) => {
    done++;
    if (found[j]) {
      a.image = found[j];
      added.push([a.title.slice(0, 50), a.source]);
      console.log(`  ✓ [${done}/${targets.length}] ${a.source}: ${a.title.slice(0, 55)}`);
    } else {
      console.log(`  ✗ [${done}/${targets.length}] ${a.source}: ${a.title.slice(0, 55)}`);
    }
  });
  if (i + BATCH < targets.length) await new Promise((r) => setTimeout(r, 400));
}

await writeFile(FILE, JSON.stringify(list, null, 2), "utf8");
console.log(`\nBitti. Görsel eklenen: ${added.length}/${targets.length}`);
