import { loadArticles, saveArticles } from "./store.js";
import { fetchPageExtras } from "./fetcher.js";
import { analyzeArticle } from "./ai.js";
import { config } from "./config.js";

/**
 * Eski haberleri (gövdesi olmayanları) yeni biçimle yeniden üretir.
 * - Slug, kimlik, kaynak ve tarihler KORUNUR (Google'da kayıtlı URL değişmesin).
 * - Her haber başarıyla işlendiğinde dosya kaydedilir; kota biterse ilerleme korunur.
 *
 * Kullanım:
 *   npm run backfill             (varsayılan 5 haber)
 *   BACKFILL_LIMIT=20 npm run backfill
 *   node src/backfill.js --dry   (AI çağrısı yapmadan listeler)
 */

const LIMIT = Number(process.env.BACKFILL_LIMIT || 5);
const DRY = process.argv.includes("--dry");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const needsBody = (a) => !Array.isArray(a.body) || a.body.filter(Boolean).length === 0;

async function main() {
  const articles = await loadArticles();
  const pending = articles.filter(needsBody);
  const targets = [...pending]
    .sort((a, b) =>
      (b.publishedAt || b.generatedAt || "").localeCompare(a.publishedAt || a.generatedAt || "")
    )
    .slice(0, LIMIT);

  console.log(
    `Arşiv: ${articles.length} haber | gövdesiz: ${pending.length} | bu turda işlenecek: ${targets.length}`
  );

  if (!targets.length) {
    console.log("Yenilenecek haber kalmadı. ✓");
    return;
  }

  if (DRY) {
    targets.forEach((t, i) => console.log(`  ${i + 1}. [${t.category}] ${t.title}`));
    console.log("\n--dry: AI çağrısı yapılmadı.");
    return;
  }

  const byId = new Map(articles.map((a) => [a.id, a]));
  let done = 0;

  for (const [i, target] of targets.entries()) {
    process.stdout.write(
      `  (${i + 1}/${targets.length}) ${target.source}: ${target.title.slice(0, 50)}... `
    );

    try {
      // Kaynağı yeniden indir: gövde için gerçek metni topla
      const extra = await fetchPageExtras(target.sourceUrl);
      let content = target.summary || "";
      if (extra.text && extra.text.length > 400) {
        content = `${content}\n\n${extra.text}`.slice(0, 7000);
      }

      const ai = await analyzeArticle({
        title: target.title,
        source: target.source,
        feedCategory: target.category,
        link: target.sourceUrl,
        content,
      });

      const current = byId.get(target.id);
      if (!current) {
        console.log("✗ kayıt bulunamadı");
        continue;
      }

      // Yerinde güncelle (slug/tarih kimlik korunur)
      current.summary = ai.summary || current.summary;
      current.keyPoints = ai.keyPoints;
      current.body = ai.body;
      current.comment = ai.comment || current.comment;
      if (ai.tags?.length) current.tags = ai.tags;
      if (!current.image) current.image = extra.image || null;
      current.refreshedAt = new Date().toISOString();

      console.log("✓");
      done++;
      await saveArticles(articles); // ilerlemeyi hemen kaydet
    } catch (err) {
      console.log(`✗ ${String(err.message).slice(0, 160)}`);
      if (err.allExhausted) {
        console.log("\nAI kotası/durumu nedeniyle bu tur durduruluyor (kalanlar sonraki turda).");
        break;
      }
    }

    if (i < targets.length - 1) await sleep(config.aiDelayMs);
  }

  await saveArticles(articles);
  console.log(`\nBitti. ${done} haber yenilendi. Kalan gövdesiz: ${articles.filter(needsBody).length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
