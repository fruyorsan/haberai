import { config } from "./config.js";
import { fetchAllFeeds, fetchPageExtras } from "./fetcher.js";
import { analyzeArticle } from "./ai.js";
import { updateMarket } from "./market.js";
import { loadArticles, saveArticles, existingIds, makeId } from "./store.js";
import { shareNewArticles } from "./share.js";

const DRY = process.argv.includes("--dry");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  // Kaynak çeşitliliği: tek bir kaynak listeyi doldurmasın
  const perSource = new Map();
  const queue = [];
  for (const it of fresh) {
    if (queue.length >= config.maxPerRun) break;
    const used = perSource.get(it.source) || 0;
    if (used >= config.maxPerSource) continue;
    perSource.set(it.source, used + 1);
    queue.push(it);
  }

  console.log(`İşlenecek yeni haber: ${queue.length} (uygun aday: ${fresh.length})`);

  if (DRY) {
    queue.forEach((it, i) => console.log(`  ${i + 1}. [${it.source}] ${it.title}`));
    console.log("\n--dry modu: AI çağrısı yapılmadı, hiçbir şey kaydedilmedi.");
    // --dry: sosyal paylaşım da atlanır (istek gönderilmez, social.json yazılmaz).
    await shareNewArticles([], { dry: true });
    return;
  }

  let added = 0;
  const newArticles = [];
  for (const [i, item] of queue.entries()) {
    process.stdout.write(
      `  (${i + 1}/${queue.length}) ${item.source}: ${item.title.slice(0, 55)}... `
    );
    try {
      // Sayfadan hem görseli hem de gerçek gövde metnini al (uydurmayı azaltır)
      if (!item.image || item.content.length < 1500) {
        const extra = await fetchPageExtras(item.link);
        if (!item.image) item.image = extra.image;
        if (extra.text && extra.text.length > 400) {
          item.content = `${item.content}\n\n${extra.text}`.slice(0, 7000);
        }
      }
      const ai = await analyzeArticle(item);
      const entry = {
        id: makeId(item.link),
        ...ai,
        source: item.source,
        sourceUrl: item.link,
        image: item.image || null,
        publishedAt: item.publishedAt,
        generatedAt: new Date().toISOString(),
      };
      articles.push(entry);
      newArticles.push(entry);
      console.log("✓");
      added++;
    } catch (err) {
      console.log(`✗ ${err.message}`);
      if (err.allExhausted) {
        console.log("\nAI kotası/durumu nedeniyle bu çalıştırma durduruluyor.");
        break;
      }
    }

    // Dakikalık token limitini aşmamak için istekler arası nazik bekleme
    if (i < queue.length - 1) await sleep(config.aiDelayMs);
  }

  articles.sort((a, b) =>
    (b.publishedAt || b.generatedAt || "").localeCompare(a.publishedAt || a.generatedAt || "")
  );
  await saveArticles(articles);
  console.log(`\nBitti. ${added} yeni haber eklendi. Arşiv toplam: ${articles.length}`);

  try {
    const market = await updateMarket();
    console.log(`Piyasa verisi güncellendi (${market.items.length} gösterge).`);
  } catch (err) {
    console.warn(`Piyasa verisi alınamadı: ${err.message}`);
  }

  // Veri kaydedildikten sonra: yalnızca bu çalıştırmada eklenen YENİ haberleri paylaş.
  // Anahtar yoksa shareNewArticles sessizce atlar; hata olsa bile akış bozulmaz.
  try {
    await shareNewArticles(newArticles);
  } catch (err) {
    console.warn(`Sosyal paylaşım atlandı: ${err.message}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
