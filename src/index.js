import { config } from "./config.js";
import { fetchAllFeeds, fetchPageExtras } from "./fetcher.js";
import { analyzeArticle } from "./ai.js";
import { updateMarket } from "./market.js";
import { loadArticles, saveArticles, existingIds, makeId } from "./store.js";
import { shareNewArticles } from "./share.js";
import { makeIndex, findSimilar, dedupeArticles } from "./dedupe.js";
import { isBreaking, breakingScore } from "./breaking.js";
import { purgeCopiedText } from "./telif.js";
import { stokGorseller, KATEGORI_SORGU, yedekGorsel, atif, kisaSorgu, konuSorgu, afetMi } from "./stok-gorsel.js";

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

  // Arşivdeki "aynı haber" tekrarlarını temizle. Giriş süzgeci farklı
  // çalıştırmalarda takılanları kaçırabiliyor; bu adım her turda çalışarak
  // arşivi kendi kendine temiz tutar.
  {
    const { kept, removed } = dedupeArticles(articles, config.arsivDedupeThreshold);
    if (removed.length) {
      console.log(`Arşiv temizliği: ${removed.length} tekrar haber çıkarıldı`);
      for (const r of removed) {
        console.log(`  ⏭ tekrar (arşiv): "${r.title.slice(0, 46)}" ≈ "${r.twin.slice(0, 46)}"`);
      }
      articles.splice(0, articles.length, ...kept);
      seen.clear();
      for (const a of articles) seen.add(a.id);
    }
  }

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

  // TELİF GÜVENLİ GÖRSELLER: kaynağın fotoğrafı KULLANILMAZ. Arşivde bir kez
  // görünen fotoğraf yeni bir habere kapak olmaz (aynı kare tekrar etmesin).
  const kullanilanGorsel = new Set();
  for (const a of articles) {
    if (a.image) kullanilanGorsel.add(String(a.image));
    for (const u of Array.isArray(a.images) ? a.images : []) kullanilanGorsel.add(String(u));
    for (const g of Array.isArray(a.gorselEk) ? a.gorselEk : []) {
      if (g?.url) kullanilanGorsel.add(String(g.url));
    }
  }

  for (const [i, item] of queue.entries()) {
    process.stdout.write(
      `  (${i + 1}/${queue.length}) ${item.source}: ${item.title.slice(0, 55)}... `
    );
    try {
      // Sayfadan yalnızca gerçek gövde metnini al (uydurmayı azaltır).
      // Sayfanın fotoğraflarına DOKUNULMAZ: telif riski (bkz. src/stok-gorsel.js).
      let realUrl = null;
      if (item.content.length < 1500) {
        const extra = await fetchPageExtras(item.link);
        realUrl = extra.resolvedUrl;
        if (extra.text && extra.text.length > 400 && item.content.length < 1500) {
          item.content = `${item.content}\n\n${extra.text}`.slice(0, 7000);
        }
      }

      const ai = await analyzeArticle(item);
      // TELİF GÜVENCESİ: üretilen metinde kaynaktan uzun birebir diziler kalmasın.
      const { cleaned, removed } = purgeCopiedText(ai, item.content);
      if (removed > 0) console.log(`(telif: ${removed} cümle kaynakla birebir örtüştüğü için çıkarıldı) `);

      // GÖRSELLER: AI'nın ürettiği İngilizce sorgu + kategori sorgusu.
      // (Etiketler sorgu olarak KULLANILMAZ: "Rekabet Kurulu" gibi Türkçe
      // etiketler Commons'ta tamamen alakasız dosyalar getiriyor.)
      // Sıra: AI'nın tam sorgusu → aynı sorgunun geniş hâli ("flooded street")
      // → kategori sorgusu. Tam sorgu Commons'ta dosya adıyla eşleşmezse
      // geniş hâli konuya yakın bir fotoğraf bulur (borsa fotoğrafına düşmez).
      // Sıra: AI'nın tam sorgusu → konu (afet/hava) sahnesi → geniş hâl
      // → kategori sorgusu. Afet haberlerinde geniş hâl ("mediterranean
      // sea") manzara fotoğrafı getiriyordu; konu sahnesi daha doğru.
      const sorgular = [
        ai.gorselSorgu,
        konuSorgu(ai.gorselSorgu, cleaned.title),
        kisaSorgu(ai.gorselSorgu),
        KATEGORI_SORGU[cleaned.category],
      ];
      let stok = await stokGorseller(sorgular, {
        adet: 3,
        kullanilan: kullanilanGorsel,
        afet: afetMi(ai.gorselSorgu, cleaned.title),
      });
      if (!stok.length) stok = [yedekGorsel(cleaned.category)];
      const [kapakGorsel, ...ekler] = stok;

      // Google News linki gerçek adrese çözüldüyse kaynak bağlantısı da gerçek
      // siteye işaret etsin (kaynak gösterme ve telif doğruluğu).
      const sourceUrl =
        realUrl && !/news\.google\.com/i.test(realUrl) ? realUrl : item.link;
      const entry = {
        id: makeId(item.link),
        ...cleaned,
        source: item.source,
        sourceUrl,
        image: kapakGorsel.url,
        // Fotoğrafçı + lisans + dosya sayfası: sitede atıf olarak gösterilir.
        gorselKaynak: atif(kapakGorsel),
        publishedAt: item.publishedAt,
        generatedAt: new Date().toISOString(),
      };
      if (ekler.length) {
        entry.gorselEk = ekler
          .filter((g) => g?.url)
          .map((g) => ({ url: g.url, ...atif(g) }));
      }
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
