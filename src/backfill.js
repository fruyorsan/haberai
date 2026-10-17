import { loadArticles, saveArticles } from "./store.js";
import { fetchPageExtras } from "./fetcher.js";
import { analyzeArticle } from "./ai.js";
import { purgeCopiedText } from "./telif.js";
import { config } from "./config.js";

/**
 * Eski haberleri yeni biçimle yeniden üretir:
 * - Gövdesi olmayanlar VEYA editorNote (manşet notu) alanı eksik olanlar.
 * - Gövdesi çok kısa olanlar (yeni istemler en az ~180 kelime istiyor).
 * - Manşet notu clickbait kalıbıyla bitenler ("Neden bakmalısın?").
 * - Özeti başlığın aynısı olanlar.
 * - Slug, kimlik, kaynak ve tarihler KORUNUR (Google'da kayıtlı URL değişmesin).
 * - İçeriği zaten yerinde olan haberlere DOKUNULMAZ (idempotent).
 * - Sıra "en çok eksik olan önce"dir: önce gövdesizler, sonra manşetsizler...
 *   Böylece okurun göreceği boşluklar ilk turlarda kapanır.
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

const govdeKelime = (a) =>
  (Array.isArray(a.body) ? a.body.join(" ") : "").split(/\s+/).filter(Boolean).length;

const needsBody = (a) => !Array.isArray(a.body) || a.body.filter(Boolean).length === 0;
const needsEditorNote = (a) => !String(a?.editorNote || "").trim();
const needsComment = (a) => String(a?.comment || "").trim().length < 40;
const thinBody = (a) => !needsBody(a) && govdeKelime(a) < 120;
const clickbaitNote = (a) => /neden (bakmalısın|bu kadar kritik)|merak ediyor musun/i.test(String(a?.editorNote || ""));
const summaryIsTitle = (a) =>
  Boolean(String(a?.summary || "").trim()) && String(a.summary).trim() === String(a.title || "").trim();

const needsWork = (a) =>
  needsBody(a) ||
  needsEditorNote(a) ||
  needsComment(a) ||
  thinBody(a) ||
  clickbaitNote(a) ||
  summaryIsTitle(a);

// 0 = okurun gördüğü boşluk (gövde veya AI yorumu hiç yok), 3 = kozmetik.
const oncelik = (a) => {
  if (needsBody(a) || needsComment(a)) return 0;
  if (needsEditorNote(a)) return 1;
  if (thinBody(a)) return 2;
  return 3;
};

async function main() {
  const articles = await loadArticles();
  const pending = articles.filter(needsWork);
  const targets = [...pending]
    .sort(
      (a, b) =>
        oncelik(a) - oncelik(b) ||
        (b.publishedAt || b.generatedAt || "").localeCompare(a.publishedAt || a.generatedAt || "")
    )
    .slice(0, LIMIT);

  console.log(
    `Arşiv: ${articles.length} haber | gövdesiz: ${articles.filter(needsBody).length} | ` +
      `editorNote eksik: ${articles.filter(needsEditorNote).length} | ` +
      `kısa gövde: ${articles.filter(thinBody).length} | bu turda işlenecek: ${targets.length}`
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

      const ham = await analyzeArticle({
        title: target.title,
        source: target.source,
        feedCategory: target.category,
        link: target.sourceUrl,
        content,
      });

      // TELİF GÜVENCESİ: kaynakla birebir örtüşen cümleleri ayıkla.
      const { cleaned: ai, removed } = purgeCopiedText(ham, content);
      if (removed > 0) process.stdout.write(`(telif: ${removed}) `);

      const current = byId.get(target.id);
      if (!current) {
        console.log("✗ kayıt bulunamadı");
        continue;
      }

      // Yerinde güncelle (slug/tarih kimlik korunur). AI boş döndüyse mevcut
      // içerik korunur; özellikle gövdesi olup yalnızca editorNote'u eksik olan
      // haberlerde veri kaybı yaşanmasın.
      current.summary = ai.summary || current.summary;
      if (ai.keyPoints?.length) current.keyPoints = ai.keyPoints;
      if (ai.body?.length) current.body = ai.body;
      current.comment = ai.comment || current.comment;
      if (ai.editorNote) current.editorNote = ai.editorNote;
      if (ai.tags?.length) current.tags = ai.tags;
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
  console.log(
    `\nBitti. ${done} haber yenilendi. Kalan gövdesiz: ${articles.filter(needsBody).length}, ` +
      `editorNote eksik: ${articles.filter(needsEditorNote).length}, ` +
      `kısa gövde: ${articles.filter(thinBody).length}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
