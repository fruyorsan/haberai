import { config } from "./config.js";
import { fetchAllFeeds, fetchPageExtras } from "./fetcher.js";
import { analyzeArticle } from "./ai.js";
import { updateMarket } from "./market.js";
import { loadArticles, saveArticles, existingIds, makeId } from "./store.js";
import { shareNewArticles } from "./share.js";
import { makeIndex, findSimilar, dedupeArticles, ayniOlay } from "./dedupe.js";
import { isBreaking, breakingScore } from "./breaking.js";
import { purgeCopiedText } from "./telif.js";
import { stokGorseller, KATEGORI_SORGU, yedekGorsel, atif, kisaSorgu, konuSorgu, afetMi, gorselOnar, markaAdi } from "./stok-gorsel.js";
import { isJunkArticle } from "./kalite.js";
import { vitrinDoldur } from "../scripts/vitrin-doldur.mjs";

const DRY = process.argv.includes("--dry");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Aynı fotoğrafın farklı boyut sürümlerini eşleştirmek için kimlik. */
const gorselKimlik = (url) =>
  String(url || "")
    .toLowerCase()
    .split("?")[0]
    .split("#")[0]
    .replace(/-\d{2,4}x\d{2,4}(?=\.[a-z0-9]+$)/, "")
    .replace(/\.(jpe?g|png|webp|avif|gif)$/, "");

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

  // Kapak fotoğrafı haberi anlatmıyorsa (ör. "ice" tesadüfü yüzünden spor
  // haberine karlı araba fotoğrafı düşmüşse) kategorinin seçilmiş görseliyle
  // değiştirilir. Her turda çalışır; veri birleşmelerinde onarım kaybolmaz.
  {
    const onarilan = gorselOnar(articles);
    vitrinDoldur(articles);
    const temizArsiv = articles.filter((a) => !isJunkArticle(a));
    if (temizArsiv.length !== articles.length) articles.splice(0, articles.length, ...temizArsiv);
    if (onarilan) console.log(`Görsel onarımı: ${onarilan} kapak fotoğrafı düzeltildi`);
  }

  // ------------------------------------------------------------------
  // GÜNLÜK KOTA + YAYIN TEMPOSU
  // ------------------------------------------------------------------
  // "Bugün" Europe/Istanbul'a göre hesaplanır; sunucu UTC'de çalışsa bile
  // kota Türkiye saatiyle gece yarısı sıfırlanır. generatedAt = bizim yayın
  // anımız (publishedAt kaynağın tarihi olabilir).
  const gunAnahtari = (t) => {
    const d = new Date(t);
    if (!Number.isFinite(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  };
  const bugun = gunAnahtari(Date.now());
  const bugunSayi = articles.filter(
    (a) => gunAnahtari(a.generatedAt || a.publishedAt) === bugun
  ).length;

  // Günün geçen oranına göre ara hedef. Yalnızca "40 - yayınlanan" kuralı
  // kotayı öğleden sonra tüketiyordu (24.10 sabahı 11:30'da 24 haber
  // yayınlanmıştı). Ara hedef 40 haberi gün boyuna yayar, gün sonunda 40'a
  // ulaşır. Türkiye 2016'dan beri sabit UTC+3 (yaz saati uygulanmıyor).
  const [gy, gm, gd] = bugun.split("-").map(Number);
  const gunBasi = Date.UTC(gy, gm - 1, gd) - 3 * 3600 * 1000;
  const gunOrani = Math.min(
    1,
    Math.max(0, (Date.now() - gunBasi) / (24 * 3600 * 1000))
  );
  const gunlukHedef =
    config.gunlukLimit > 0
      ? Math.min(
          config.gunlukLimit,
          Math.max(0, Math.ceil(config.gunlukLimit * gunOrani))
        )
      : Infinity;
  const kalanKota =
    config.gunlukLimit > 0
      ? Math.max(0, config.gunlukLimit - bugunSayi)
      : Infinity;

  // Ara hedef artık SERT BİR KAPI DEĞİL, sadece frendir. Sert kapı, hedefi
  // 4 haber aşan sabah yayınlarının ardından 3,5 saatlik sessizliğe yol
  // açıyordu (24.10: 11:28-15:00 arası hiç haber çıkmadı; bildirim de
  // gitmedi). Artık hedefin önündeyken tempo 1,5 katına çıkar (36 -> 54 dk),
  // hedef yakalanınca normale döner. Günlük tavan (40) her durumda geçerli.
  const hedefOnde =
    config.gunlukLimit > 0 && bugunSayi > gunlukHedef + 5;
  const hedefGeride =
    config.gunlukLimit > 0 && bugunSayi + 4 < gunlukHedef;

  let sonYayin = 0;
  for (const a of articles) {
    const t = new Date(a.generatedAt || a.publishedAt || 0).getTime();
    if (Number.isFinite(t) && t > sonYayin) sonYayin = t;
  }
  const gecenDkHam = sonYayin ? (Date.now() - sonYayin) / 60000 : Infinity;
  // Gün sınırında tempo sıfırlanır: dünün son haberi yüzünden yeni günün ilk
  // haberi 36 dk gecikmesin (yoksa 40. haber gece yarısına sarkar).
  const dunYayin = sonYayin > 0 && gunAnahtari(sonYayin) !== bugun;
  const gecenDk = dunYayin ? Infinity : gecenDkHam;

  // Saatlik tavan: son 60 dakikada kaç haber yayınlandı?
  const sonSaatSayi = articles.filter((a) => {
    const t = new Date(a.generatedAt || a.publishedAt || 0).getTime();
    return Number.isFinite(t) && t >= Date.now() - 60 * 60 * 1000;
  }).length;

  console.log(
    `Günlük kota: ${bugunSayi}/${config.gunlukLimit || "∞"}${
      Number.isFinite(gunlukHedef)
        ? ` (bu saate göre hedef ${gunlukHedef})`
        : ""
    } · kalan ${kalanKota === Infinity ? "∞" : kalanKota} · son yayın ${
      dunYayin
        ? "dün"
        : Number.isFinite(gecenDkHam)
          ? `${Math.floor(gecenDkHam)} dk önce`
          : "-"
    }`
  );

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
  const VITRIN_KAYNAKLAR = new Set(["ShiftDelete", "Webtekno", "DonanımHaber", "Technopat", "Donanım Arşivi", "CHIP Online", "Webrazzi", "Tamindir", "Merlin'in Kazanı", "IGN Türkiye", "Oyun Günlüğü", "Evrim Ağacı", "NTV Teknoloji"]);
  const isDirectVitrin = (it) => VITRIN_KAYNAKLAR.has(it.source) && Boolean(it.image) && !/news\.google\.com/i.test(it.link || "") && (Date.now() - new Date(it.publishedAt || 0).getTime() <= 45 * 60 * 1000);
  fresh.sort((a, b) => (isDirectVitrin(b) ? 1 : 0) - (isDirectVitrin(a) ? 1 : 0) || (b.publishedAt || "").localeCompare(a.publishedAt || "") || (Boolean(b.image) ? 1 : 0) - (Boolean(a.image) ? 1 : 0));
  const HAVUZ = Math.max(config.maxPerRun * 70, 160);
  const perSource = new Map();
  const eligible = [];
  let dupeCount = 0;
  for (const it of fresh) {
    if (eligible.length >= HAVUZ) break;

    // Aynı haber başka bir kaynakta zaten var mı?
    // İki aşamalı tekrar kontrolü: kelime benzerliği + olay imzası (varlık/sayı).
    const twin =
      findSimilar(it.title, titleIndex, config.dupeThreshold) ||
      titleIndex.find((e) => ayniOlay(it.title, e.title))?.title ||
      null;
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
        sourceName: it.source,
      });
    }

    const used = perSource.get(it.source) || 0;
    // Son dakika haberleri maxPerSource sınırına TAKILMAZ (aynı kaynaktan iki
    // son dakika haber geçebilir). Normal haberlerde kaynak çeşitliliği korunur.
    const maxSrc = isDirectVitrin(it) ? Math.max(config.maxPerSource, 2) : config.maxPerSource;
    if (used >= maxSrc) continue;

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

  const vitrinPool = eligible.filter(isDirectVitrin);

  // Bu turda işlenecek en fazla haber: normal + son dakika kotası, ama
  // günlük kalan kotayı ASLA aşmaz.
  const turKota = Math.max(
    0,
    Math.min(config.maxBreakingPerRun + config.maxPerRun, kalanKota)
  );

  // Tempo: normal haberler arasında yayinAralikDk, son dakika adayı varsa
  // sonDakikaAralikDk kadar beklenir. Böylece 40 haber günün ilk saatlerinde
  // tükenmez; akış gün boyuna yayılır.
  //
  // ÖNEMLİ: bekleme süresi dolduğunda 4 haberi birden basmak tempoyu yine
  // bozar (4 haber / 30 dk = 8/saat). Bu yüzden bu turda yayınlanacak adet,
  // geçen sürenin bekleme aralığına bölümüyle sınırlanır: 36 dk geçtiyse 1,
  // 72 dk geçtiyse 2... Hattın uzun süre durduğu durumda en fazla turKota.
  const beklemeDk =
    (breakingPool.length ? config.sonDakikaAralikDk : config.yayinAralikDk) *
    (hedefOnde ? 1.35 : hedefGeride ? 0.65 : 1);
  const saatKota = config.saatlikLimit > 0 ? config.saatlikLimit : Infinity;
  const saatDolu = Number.isFinite(saatKota) && sonSaatSayi >= saatKota;
  const siraGeldi = kalanKota > 0 && gecenDk >= beklemeDk && !saatDolu;
  const slotTemel = dunYayin
    ? 1
    : beklemeDk > 0 && Number.isFinite(gecenDk)
      ? Math.max(1, Math.floor(gecenDk / beklemeDk))
      : turKota;
  const slotKota = hedefGeride && !dunYayin ? Math.max(slotTemel, Math.min(turKota, 2)) : slotTemel;
  const buTurKota = Math.max(
    0,
    Math.min(turKota, slotKota, Math.max(1, saatKota - sonSaatSayi))
  );

  // Tek haberlik turda öncelik son dakikada: vitrin adayı taze olsa bile
  // gerçek bir son dakika haberini geride bırakmasın.
  const queue =
    siraGeldi && buTurKota > 0
      ? breakingPool.length
        ? [breakingPool[0]]
        : vitrinPool.slice(0, 1)
      : [];
  if (siraGeldi) {
    for (const it of [...breakingPool, ...normalPool]) {
      if (queue.length >= buTurKota) break;
      if (!queue.includes(it)) queue.push(it);
    }
    let normalTaken = queue.length;
    for (const it of normalPool) {
      if (normalTaken >= Math.min(config.maxPerRun, buTurKota)) break;
      if (queue.includes(it)) continue;
      queue.push(it);
      normalTaken++;
    }
  }

  if (!siraGeldi) {
    if (config.gunlukLimit > 0 && bugunSayi >= config.gunlukLimit) {
      console.log("  ⏸ Günlük kota doldu; bugün yeni haber yayınlanmayacak.");
    } else if (saatDolu) {
      console.log(
        `  ⏸ Saatlik tavan (${saatKota}) doldu; sonraki saat diliminde devam.`
      );
    } else {
      console.log(
        `  ⏸ Yayın temposu: ${Math.max(
          0,
          Math.ceil(beklemeDk - gecenDk)
        )} dk sonra sıradaki haber.${
          hedefOnde
            ? ` (hedefin önündeyiz: ${bugunSayi}/${gunlukHedef}, tempo 1,5 kat uzatıldı)`
            : ""
        }`
      );
    }
  }

  console.log(
    `Son dakika adayı: ${breakingPool.length} (işlenecek: ${
      queue.filter((q) => q.breaking).length
    })`
  );

  // Denge: hem teknoloji/yapay zekâ hem de gündem/ekonomi/spor/dünya akışı
  // gün boyu dengeli ilerlesin. Tek haberlik turlarda son 2 yayınlanan habere
  // bakılır: üst üste 2 teknoloji çıktıysa gündem, üst üste 2 gündem çıktıysa
  // teknoloji/vitrin haberi tercih edilir.
  const isNews = (it) => config.newsCategories.includes(it.feedCategory || it.category);
  const sonIkisiNews =
    articles.length >= 2 && isNews(articles[0]) && isNews(articles[1]);
  const sonIkisiTekno =
    articles.length >= 2 && !isNews(articles[0]) && !isNews(articles[1]);

  const dengeGerekNews =
    !queue.some(isNews) &&
    (queue.length > 1 || (queue.length === 1 && !queue[0].breaking && sonIkisiTekno));
  if (dengeGerekNews) {
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
  } else if (
    queue.length > 0 &&
    queue.every(isNews) &&
    !queue[0].breaking &&
    sonIkisiNews
  ) {
    const teknoAlt =
      vitrinPool.find((it) => !isNews(it) && !queue.includes(it)) ||
      eligible.find((it) => !isNews(it) && Boolean(it.image) && !queue.includes(it));
    if (teknoAlt) {
      queue[queue.length - 1] = teknoAlt;
      console.log(`  ⚖ denge: üst üste gündem sonrası "${teknoAlt.feedCategory}" haberi alındı`);
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

  // TELİF/GÖRSEL TAKİBİ: arşivde görünen fotoğraf yeni bir habere kapak olmaz
  // (aynı kare tekrar etmesin). Kimlik, farklı boyut sürümlerini de eşleştirir.
  const kullanilanGorsel = new Set();
  const gorselSayaci = new Map();
  for (const a of articles) {
    const adaylar = [
      a.image,
      ...(Array.isArray(a.images) ? a.images : []),
      ...(Array.isArray(a.gorselEk) ? a.gorselEk.map((g) => g?.url) : []),
    ];
    for (const u of adaylar) {
      if (!u) continue;
      kullanilanGorsel.add(String(u));
      const k = gorselKimlik(u);
      if (k) gorselSayaci.set(k, (gorselSayaci.get(k) || 0) + 1);
    }
  }

  for (const [i, item] of queue.entries()) {
    // Emniyet kemeri: kuyruk kısaltılmış olsa bile günlük kotayı aşma.
    if (added >= kalanKota) {
      console.log("\nGünlük kota doldu; kalan adaylar sonraki güne bırakıldı.");
      break;
    }
    process.stdout.write(
      `  (${i + 1}/${queue.length}) ${item.source}: ${item.title.slice(0, 55)}... `
    );
    try {
      // Kaynak sayfayı her zaman aç: gövde metni (uydurmayı azaltır) ve sayfanın
      // KENDİ görsel adayları (og:image) buradan geliyor. ShiftDelete tarzı
      // ürün render'ı/marka grafiği ancak kaynağın kendi kapağıyla yakalanır.
      let extra = null;
      try {
        extra = await fetchPageExtras(item.link);
      } catch {
        extra = null;
      }
      const realUrl = extra?.resolvedUrl || null;
      if (extra?.text && extra.text.length > 400 && item.content.length < 1500) {
        item.content = `${item.content}\n\n${extra.text}`.slice(0, 7000);
      }

      const ai = await analyzeArticle(item);
      // TELİF GÜVENCESİ: üretilen metinde kaynaktan uzun birebir diziler kalmasın.
      const { cleaned, removed } = purgeCopiedText(ai, item.content);
      if (removed > 0) console.log(`(telif: ${removed} cümle kaynakla birebir örtüştüğü için çıkarıldı) `);

      // GÖRSEL KAYNAĞI: YALNIZCA telif güvenli görseller.
      //
      // Kaynak haber sitelerinin og:image'ları ajans lisanslı olabiliyor
      // (AA, Getty, Reuters, DHA...). Atıf yazmak bunu yasal hâle getirmez.
      // Bu yüzden kaynağın fotoğrafı HİÇ kullanılmaz. Kapak ve gövde içi
      // görseller yalnızca Wikimedia Commons'ın serbest lisanslı arşivinden
      // (CC0 / kamu malı / CC BY / CC BY-SA) seçilir; uygun kare bulunamazsa
      // kategorinin doğrulanmış yedek görseli kullanılır.
      const marka = markaAdi(cleaned.title);
      // Afet tespiti YALNIZCA Türkçe başlık/özetten yapılır: İngilizce arama
      // sorgusundaki "test fire" gibi ifadeler savunma haberini yangın sanıp
      // yanlış (orman yangını) fotoğrafı seçtiriyordu.
      const afet = afetMi(cleaned.title, cleaned.summary);

      // 1) Kapak: AI'nın ürettiği İngilizce sorgu + marka + kategori.
      let stok = await stokGorseller(
        [
          marka,
          konuSorgu(ai.gorselSorgu, cleaned.title),
          ai.gorselSorgu,
          kisaSorgu(ai.gorselSorgu),
          KATEGORI_SORGU[cleaned.category],
        ],
        { adet: 1, kullanilan: kullanilanGorsel, afet, marka }
      );
      if (!stok.length) stok = [yedekGorsel(cleaned.category)];
      const kapakGorsel = stok[0];

      kullanilanGorsel.add(kapakGorsel.url);
      gorselSayaci.set(gorselKimlik(kapakGorsel.url), (gorselSayaci.get(gorselKimlik(kapakGorsel.url)) || 0) + 1);

      // 2) Gövde içi detay fotoğrafları: yine yalnızca Commons.
      let ekler = [];
      const detayListesi = Array.isArray(ai.gorselDetaylar) && ai.gorselDetaylar.length
        ? ai.gorselDetaylar.slice(0, 2)
        : [{ sorgu: kisaSorgu(ai.gorselSorgu) || ai.gorselSorgu, altyazi: "" }];

      for (const detay of detayListesi) {
        if (ekler.length >= 2) break;
        const dSorgular = [
          detay.sorgu,
          kisaSorgu(detay.sorgu),
          ai.gorselSorgu,
        ].filter(Boolean);
        const bulunan = await stokGorseller(dSorgular, {
          adet: 1,
          kullanilan: kullanilanGorsel,
          afet,
        });
        if (bulunan.length && gorselKimlik(bulunan[0].url) !== gorselKimlik(kapakGorsel.url)) {
          const sec = bulunan[0];
          kullanilanGorsel.add(sec.url);
          ekler.push({ ...sec, altyazi: detay.altyazi || "" });
        }
      }

      const { gorselDetaylar: _detayAt, ...temizKayit } = cleaned;

      // Google News linki gerçek adrese çözüldüyse kaynak bağlantısı da gerçek
      // siteye işaret etsin (kaynak gösterme ve telif doğruluğu).
      const sourceUrl =
        realUrl && !/news\.google\.com/i.test(realUrl) ? realUrl : item.link;
      const entry = {
        id: makeId(item.link),
        ...temizKayit,
        source: item.source,
        sourceUrl,
        image: kapakGorsel.url,
        gorselKaynak: atif(kapakGorsel),
        publishedAt: item.publishedAt,
        generatedAt: new Date().toISOString(),
      };
      if (ekler.length) {
        entry.gorselEk = ekler
          .filter((g) => g?.url)
          .map((g) => ({
            url: g.url,
            ...atif(g),
            ...(g.altyazi ? { altyazi: g.altyazi } : {}),
          }));
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
