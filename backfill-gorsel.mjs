// Arşivdeki haber görsellerini "ShiftDelete tarzı" hâle getirir (tek seferlik
// yardımcı): kalite denetiminden geçmeyen (logo, küçük thumbnail, kırık)
// görselleri daha büyük/yatay gerçek fotoğraflarla değiştirir; hiçbiri
// bulunamazsa alanı siler (site markalı kapağa düşer).
//
// Kullanım:
//   node backfill-gorsel.mjs            → tüm arşivi gözden geçir (iyi olanı koru)
//   node backfill-gorsel.mjs --missing  → yalnızca görselsiz haberlere ekle
import { readFile, writeFile } from "node:fs/promises";
import { fetchPageExtras } from "./src/fetcher.js";
import { chooseImage, probeImage, passesQuality } from "./src/gorsel.js";

const FILE = "data/articles.json";
const ONLY_MISSING = process.argv.includes("--missing");
const BATCH = 6;
const GOOD_WIDTH = 1000; // bu genişlikteki mevcut görsel yeterli sayılır

const list = JSON.parse(await readFile(FILE, "utf8"));

const targets = list.filter((a) =>
  ONLY_MISSING ? !a.image && a.sourceUrl : a.sourceUrl
);

console.log(
  `Gözden geçirilecek: ${targets.length}/${list.length} haber` +
    (ONLY_MISSING ? " (yalnızca görselsizler)" : "")
);

let kept = 0;
let upgraded = 0;
let dropped = 0;
let done = 0;

async function improve(article) {
  // 1) Mevcut görsel zaten büyük ve geçerli mi?
  if (article.image) {
    const info = await probeImage(article.image);
    if (passesQuality(info) && info.width >= GOOD_WIDTH) {
      return { status: "kept" };
    }
  }

  // 2) Sayfadan adayları topla (mevcut görseli de aday olarak tut).
  let candidates = [];
  try {
    const extra = await fetchPageExtras(article.sourceUrl);
    candidates = extra.images?.length ? extra.images : [extra.image];
  } catch {
    /* yoksay */
  }
  if (article.image) candidates.unshift(article.image);
  if (!candidates.filter(Boolean).length) {
    return { status: article.image ? "kept" : "dropped" };
  }

  const chosen = await chooseImage(candidates);
  if (!chosen) return { status: article.image ? "kept" : "dropped" };
  if (chosen === article.image) return { status: "kept" };
  article.image = chosen;
  return { status: "upgraded" };
}

for (let i = 0; i < targets.length; i += BATCH) {
  const chunk = targets.slice(i, i + BATCH);
  const results = await Promise.all(chunk.map((a) => improve(a).catch(() => ({ status: "kept" }))));
  chunk.forEach((a, j) => {
    done++;
    const s = results[j].status;
    if (s === "kept") kept++;
    else if (s === "upgraded") upgraded++;
    else if (s === "dropped") {
      delete a.image;
      dropped++;
    }
    const mark = s === "upgraded" ? "↑" : s === "dropped" ? "✗" : "·";
    console.log(`  ${mark} [${done}/${targets.length}] ${a.source}: ${a.title.slice(0, 52)}`);
  });
  await writeFile(FILE, JSON.stringify(list, null, 2), "utf8"); // ara kaydet (kesinti güvenliği)
  if (i + BATCH < targets.length) await new Promise((r) => setTimeout(r, 300));
}

await writeFile(FILE, JSON.stringify(list, null, 2), "utf8");
const withImage = list.filter((a) => a.image).length;
console.log(
  `\nBitti. Korunan: ${kept}, iyileştirilen: ${upgraded}, görseli kaldırılan: ${dropped}` +
    `\nGörselli haber: ${withImage}/${list.length}`
);
