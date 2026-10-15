import { config } from "./config.js";
import { fetchAllFeeds, fetchOgImage } from "./fetcher.js";
import { analyzeArticle } from "./ai.js";
import { loadArticles, saveArticles, existingIds, makeId } from "./store.js";

const DRY = process.argv.includes("--dry");

async function main() {
  const hasKey = process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY;

  if (!DRY && !hasKey) {
    console.error("HATA: GEMINI_API_KEY veya GROQ_API_KEY tanımlı değil. .env dosyasına ekle.");
    process.exit(1);
  }

  const articles = await loadArticles();
  const seen = existingIds(articles);
  console.log(`Mevcut arşiv: ${articles.length} haber`);

  const fetched = await fetchAllFeeds();
  console.log(`Toplam çekilen: ${fetched.length}`);

  const cutoff = Date.now() - config.maxAgeHours * 3600 * 1000;
  const fresh = fetched.filter((it) => {
    if (seen.has(makeId(it.link))) return false;
    if (it.publishedAt && new Date(it.publishedAt).getTime() < cutoff) return false;
    return true;
  });

  fresh.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
  const queue = fresh.slice(0, config.maxPerRun);
  console.log(`İşlenecek yeni haber: ${queue.length} (uygun aday: ${fresh.length})`);

  if (DRY) {
    queue.forEach((it, i) => console.log(`  ${i + 1}. [${it.source}] ${it.title}`));
    console.log("\n--dry modu: AI çağrısı yapılmadı, hiçbir şey kaydedilmedi.");
    return;
  }

  let added = 0;
  for (const [i, item] of queue.entries()) {
    process.stdout.write(
      `  (${i + 1}/${queue.length}) ${item.source}: ${item.title.slice(0, 55)}... `
    );
    try {
      if (!item.image) {
        item.image = await fetchOgImage(item.link);
      }
      const ai = await analyzeArticle(item);
      articles.push({
        id: makeId(item.link),
        ...ai,
        source: item.source,
        sourceUrl: item.link,
        image: item.image || null,
        publishedAt: item.publishedAt,
        generatedAt: new Date().toISOString(),
      });
      console.log("✓");
      added++;
    } catch (err) {
      console.log(`✗ ${err.message}`);
      if (err.allExhausted) {
        console.log("\nAI kotası/durumu nedeniyle bu çalıştırma durduruluyor.");
        break;
      }
    }
  }

  articles.sort((a, b) =>
    (b.publishedAt || b.generatedAt || "").localeCompare(a.publishedAt || a.generatedAt || "")
  );
  await saveArticles(articles);
  console.log(`\nBitti. ${added} yeni haber eklendi. Arşiv toplam: ${articles.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
