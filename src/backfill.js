import { loadArticles, saveArticles } from "./store.js";
import { fetchPageExtras } from "./fetcher.js";
import { analyzeArticle, gorselSorgusu } from "./ai.js";
import { purgeCopiedText } from "./telif.js";
import { config } from "./config.js";
import { stokGorseller, KATEGORI_SORGU, atif, kisaSorgu, konuSorgu, afetMi, markaAdi } from "./stok-gorsel.js";

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

// ---------------------------------------------------------------- görseller
// Arşivde bir kez kullanılmış fotoğraf yeni bir habere kapak olmasın.
function kullanilanGorseller(articles) {
  const set = new Set();
  for (const a of articles) {
    if (a.image) set.add(String(a.image));
    for (const u of Array.isArray(a.images) ? a.images : []) set.add(String(u));
    for (const g of Array.isArray(a.gorselEk) ? a.gorselEk : []) {
      if (g?.url) set.add(String(g.url));
    }
  }
  return set;
}

/**
 * Habere telif güvenli stok fotoğraflar yazar (1 kapak + 2 gövde içi).
 * AI'nın İngilizce sorgusu + kategori yedeği kullanılır. Fotoğraf bulunamazsa
 * hiçbir şey değiştirilmez (eski fotoğraf yerinde kalır): yanlış fotoğraf
 * göstermektense mevcut fotoğrafı korumak daha iyidir.
 */
async function gorselYaz(a, sorgu, kullanilan) {
  const marka = markaAdi(a.title);
  const stok = await stokGorseller(
    [marka, sorgu, konuSorgu(sorgu, a.title), kisaSorgu(sorgu), KATEGORI_SORGU[a.category]],
    { adet: 3, kullanilan, afet: afetMi(sorgu, a.title), marka }
  );
  if (!stok.length) return false;
  const [kapak, ...ekler] = stok;
  a.image = kapak.url;
  a.gorselKaynak = atif(kapak);
  if (ekler.length) a.gorselEk = ekler.map((g) => ({ url: g.url, ...atif(g) }));
  else delete a.gorselEk;
  // Kaynaktan alınmış eski gövde fotoğrafları: telif riski taşıdığı için silinir.
  delete a.images;
  return true;
}

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

      // GÖRSEL: eski kaynak fotoğrafı telif güvenli stokla değiştir.
      if (!current.gorselKaynak && ai.gorselSorgu) {
        await gorselYaz(current, ai.gorselSorgu, kullanilanGorseller(articles));
      }

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

  // ---------------- GÖRSEL TAMAMLAMA (eski arşiv) ----------------
  // Eski haberlerin fotoğrafları kaynak siteden alınmıştı (ajans lisanslı
  // olabilir). AI'dan yalnızca KISA bir İngilizce sorgu istenir (tam makale
  // üretilmez, kota az harcanır), sonra Commons'tan serbest lisanslı fotoğraf
  // alınır. Yanlış fotoğraf göstermemek için: fotoğraf bulunamazsa ESKİ
  // FOTOĞRAFA DOKUNULMAZ ve haber 7 gün sonra yeniden denenir.
  const GORSEL_LIMIT = Number(process.env.GORSEL_BACKFILL_LIMIT || 0);
  if (GORSEL_LIMIT > 0) {
    const kalanlar = articles.filter((a) => a.image && !a.gorselKaynak);
    const eski = kalanlar
      .filter(
        (a) =>
          !a.gorselDeneme ||
          Date.now() - new Date(a.gorselDeneme).getTime() > 7 * 24 * 60 * 60 * 1000
      )
      .sort((a, b) =>
        String(b.publishedAt || b.generatedAt || "").localeCompare(
          String(a.publishedAt || a.generatedAt || "")
        )
      )
      .slice(0, GORSEL_LIMIT);

    console.log(
      `\nGörsel tamamlama: ${eski.length} haber denenecek (kalan kaynak fotoğraflı: ${kalanlar.length}).`
    );
    const kullanilan = kullanilanGorseller(articles);
    let gorselSayi = 0;

    for (const [i, a] of eski.entries()) {
      try {
        const sorgu = await gorselSorgusu(a);
        a.gorselDeneme = new Date().toISOString();
        // Denetlenebilirlik: hangi sorgunun hangi fotoğrafı getirdiği veride kalsın.
        if (sorgu) a.gorselSorgu = sorgu;
        if (sorgu && (await gorselYaz(a, sorgu, kullanilan))) gorselSayi++;
      } catch (err) {
        if (err.allExhausted) {
          console.log("AI kotası/durumu: görsel tamamlama bu turda durduruldu.");
          break;
        }
        console.warn(`  ! ${a.slug}: ${String(err.message).slice(0, 120)}`);
      }
      if (i < eski.length - 1) await sleep(config.aiDelayMs);
    }
    if (gorselSayi) await saveArticles(articles);
    console.log(`Görsel tamamlama: ${gorselSayi} haber telif güvenli fotoğrafa geçti.`);
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
