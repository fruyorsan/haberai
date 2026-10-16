import { config } from "./config.js";
import { fetchAllFeeds, fetchPageExtras } from "./fetcher.js";
import { analyzeArticle } from "./ai.js";
import { updateMarket } from "./market.js";
import { loadArticles, saveArticles, existingIds, makeId } from "./store.js";
import { shareNewArticles } from "./share.js";
import { makeIndex, findSimilar } from "./dedupe.js";
import { isBreaking, breakingScore } from "./breaking.js";
import { purgeCopiedText } from "./telif.js";
import { chooseImage } from "./gorsel.js";

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

  // Kaynak çeşitliliği + aynı olayın tekrarını engelleme
  const dupeCutoff = Date.now() - config.dupeWindowHours * 3600 * 1000;
  const recentTitles = articles
    .filter((a) => {
      const t = new Date(a.publishedAt || a.generatedAt || 0).getTime();
      return Number.isFinite(t) && t >= dupeCutoff;
    })
    .map((a) => a.title);
  const titleIndex = makeIndex(recentTitles);
  console.log(`Tekrar kontrolü: son ${config.dupeWindowHours} saatte ${titleIndex.length} başlık`);

  // 1) Tekrar ve kaynak filtrelerinden geçen adaylar (tazelik sırası korunur).
  //    Her aday "son dakika" mı diye işaretlenir; seçim ve kota buna göre yapılır.
  const HAVUZ = Math.max(config.maxPerRun * 12, 24);
  const perSource = new Map();
  const eligible = [];
  let dupeCount = 0;
  for (const it of fresh) {
    if (eligible.length >= HAVUZ) break;

    // Aynı haber başka bir kaynakta zaten var mı?
    const twin = findSimilar(it.title, titleIndex, config.dupeThreshold);
    if (twin) {
      dupeCount++;
      console.log(`  ⏭ tekrar: "${it.title.slice(0, 46)}" ≈ "${twin.slice(0, 46)}"`);
      continue;
    }

    // Son dakika tespiti: hızlı kaynak + tazelik + başlık sinyali (bkz. breaking.js)
    const brk = isBreaking({
      title: it.title,
      publishedAt: it.publishedAt,
      fast: it.fast,
      sourceName: it.source,
    });
    it.breaking = brk;
    if (brk) {
      it.breakingScore = breakingScore({
        title: it.title,
        publishedAt: it.publishedAt,
        fast: it.fast,
      });
    }

    const used = perSource.get(it.source) || 0;
    // Son dakika haberleri maxPerSource sınırına TAKILMAZ (aynı kaynaktan iki
    // son dakika haber geçebilir). Normal haberlerde kaynak çeşitliliği korunur.
    if (!brk && used >= config.maxPerSource) continue;

    perSource.set(it.source, used + 1);
    eligible.push(it);
    titleIndex.push(...makeIndex([it.title])); // bu turda seçilenler de tekrar sayılsın
  }

  // 2) Seçim: ÖNCE son dakika adayları (puan/yenilik sırasına göre), SONRA
  //    normal adaylar (tazelik sırası). Kota = son dakika maxBreakingPerRun +
  //    normal maxPerRun. Son dakika yoksa davranış eskisi gibi (maxPerRun).
  const breakingPool = eligible
    .filter((it) => it.breaking)
    .sort((a, b) => b.breakingScore - a.breakingScore);
  const normalPool = eligible.filter((it) => !it.breaking);

  const queue = breakingPool.slice(0, config.maxBreakingPerRun);
  let normalTaken = 0;
  for (const it of normalPool) {
    if (normalTaken >= config.maxPerRun) break;
    queue.push(it);
    normalTaken++;
  }

  console.log(
    `Son dakika adayı: ${breakingPool.length} (işlenecek: ${
      queue.filter((q) => q.breaking).length
    })`
  );

  // Denge: tur tamamen teknoloji/oyun haberlerinden oluşmasın, en az bir
  // gündem/ekonomi/spor/dünya haberi girsin. Değiştirilirken son dakika
  // haberleri KORUNUR; yalnızca normal bir haber feda edilir.
  const isNews = (it) => config.newsCategories.includes(it.feedCategory);
  if (queue.length > 1 && !queue.some(isNews)) {
    // Önce normal (son dakika olmayan) bir haber tercih edilir; böylece son
    // dakika kotası aşılmaz ve çeşitlilik normal akıştan sağlanır.
    const alt =
      eligible.find((it) => isNews(it) && !it.breaking && !queue.includes(it)) ||
      eligible.find((it) => isNews(it) && !queue.includes(it));
    if (alt) {
      let idx = -1;
      for (let i = queue.length - 1; i >= 0; i--) {
        if (!queue[i].breaking) {
          idx = i;
          break;
        }
      }
      if (idx === -1) idx = queue.length - 1;
      queue[idx] = alt;
      console.log(`  ⚖ denge: son sıraya "${alt.feedCategory}" haberi alındı`);
    }
  }

  console.log(
    `İşlenecek yeni haber: ${queue.length} (son dakika: ${
      queue.filter((q) => q.breaking).length
    }, uygun aday: ${fresh.length}, tekrar atlanan: ${dupeCount})`
  );

  if (DRY) {
    queue.forEach((it, i) => {
      const tag = it.breaking ? `[SON DAKİKA puan ${it.breakingScore}] ` : "";
      console.log(`  ${i + 1}. ${tag}[${it.source}] ${it.title}`);
    });
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
      // Sayfadan yalnızca gerçek gövde metnini al (uydurmayı azaltır) ve
      // görsel adaylarını topla (ShiftDelete tarzı büyük, yatay gerçek fotoğraf).
      let pageImages = [];
      let realUrl = null;
      if (item.content.length < 1500 || !item.image) {
        const extra = await fetchPageExtras(item.link);
        realUrl = extra.resolvedUrl;
        if (extra.text && extra.text.length > 400 && item.content.length < 1500) {
          item.content = `${item.content}\n\n${extra.text}`.slice(0, 7000);
        }
        pageImages = extra.images?.length ? extra.images : [extra.image];
      }
      // Kalite denetimi: logolar/küçük thumbnail'ler elenir, ölçülen en iyi
      // büyük+yatay fotoğraf seçilir. Fotoğraf yoksa haber eklenmez.
      const image = await chooseImage([item.image, ...pageImages]);
      if (!image || !/^https?:\/\//i.test(image)) {
        console.log("⏭ görsel bulunamadı (fotoğrafsız haber kabul edilmez)");
        continue;
      }

      const ai = await analyzeArticle(item);
      // TELİF GÜVENCESİ: üretilen metinde kaynaktan uzun birebir diziler kalmasın.
      const { cleaned, removed } = purgeCopiedText(ai, item.content);
      if (removed > 0) console.log(`(telif: ${removed} cümle kaynakla birebir örtüştüğü için çıkarıldı) `);
      // Google News linki gerçek adrese çözüldüyse kaynak bağlantısı da gerçek
      // siteye işaret etsin (kaynak gösterme ve telif doğruluğu).
      const sourceUrl =
        realUrl && !/news\.google\.com/i.test(realUrl) ? realUrl : item.link;
      const entry = {
        id: makeId(item.link),
        ...cleaned,
        source: item.source,
        sourceUrl,
        image,
        publishedAt: item.publishedAt,
        generatedAt: new Date().toISOString(),
      };
      // Yalnızca son dakika tespit edilenlerde alan eklenir; diğerlerinde hiç olmaz.
      if (item.breaking) entry.breaking = true;
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
