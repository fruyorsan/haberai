// Hattın TÜM ayarları burada. Kaynak eklemek/çıkarmak için sadece bu dosyayı düzenle.

export const config = {
  // Sitenin adı ve adresi (özet/kaynak gösteriminde kullanılır)
  siteName: "HaberinAi",
  siteUrl: "https://fruyorsan.github.io",

  // ------------------------------------------------------------------
  // KATEGORİLER — AI yalnızca bu listeden birini seçebilir.
  // ------------------------------------------------------------------
  categories: [
    "Teknoloji",
    "Yapay Zeka",
    "Mobil",
    "Oyun",
    "Donanım",
    "Yazılım",
    "İnternet",
    "Bilim",
    "Ekonomi",
    "Spor",
    "Gündem",
    "Dünya",
    "Diğer",
  ],

  // ------------------------------------------------------------------
  // KAYNAKLAR (RSS). "category" alanı AI'a ipucu verir (zorunlu değil).
  // Not: Tüm adresler bot UA'sı ile test edildi; sadece gerçekten
  // içerik döndüren ve güncel olan kaynaklar listede.
  // ------------------------------------------------------------------
  feeds: [
    // --- SON DAKİKA / GÜNDEM (Türkiye) ---
    // Not: "fast: true" kaynaklar hızlı akıştır; taze haberleri (<=120 dk) doğrudan
    // "son dakika" adayı sayılır ve öncelikli işlenir (bkz. src/breaking.js).
    { name: "NTV Son Dakika", url: "https://www.ntv.com.tr/son-dakika.rss", category: "Gündem", fast: true },
    { name: "NTV Gündem", url: "https://www.ntv.com.tr/gundem.rss", category: "Gündem" },
    { name: "NTV Türkiye", url: "https://www.ntv.com.tr/turkiye.rss", category: "Gündem" },
    { name: "NTV Yaşam", url: "https://www.ntv.com.tr/yasam.rss", category: "Gündem" },
    { name: "TRT Haber Son Dakika", url: "https://www.trthaber.com/sondakika_articles.rss", category: "Gündem", fast: true },
    { name: "TRT Haber Gündem", url: "https://www.trthaber.com/gundem_articles.rss", category: "Gündem" },
    { name: "AA Güncel", url: "https://www.aa.com.tr/tr/rss/default?cat=guncel", category: "Gündem", fast: true },
    { name: "Hürriyet Gündem", url: "https://www.hurriyet.com.tr/rss/gundem", category: "Gündem" },
    { name: "Sözcü Gündem", url: "https://www.sozcu.com.tr/feeds-rss-category-gundem", category: "Gündem" },
    { name: "Sözcü Yaşam", url: "https://www.sozcu.com.tr/feeds-rss-category-yasam", category: "Gündem" },
    { name: "Sabah Gündem", url: "https://www.sabah.com.tr/rss/gundem.xml", category: "Gündem" },
    { name: "CNN Türk", url: "https://www.cnnturk.com/feed/rss/all/news", category: "Gündem" },
    { name: "Haber Global", url: "https://haberglobal.com.tr/rss", category: "Gündem", fast: true },
    { name: "Cumhuriyet", url: "https://www.cumhuriyet.com.tr/rss", category: "Gündem" },
    { name: "Posta", url: "https://www.posta.com.tr/rss/gundem.xml", category: "Gündem" },
    { name: "Yeni Şafak", url: "https://www.yenisafak.com/rss", category: "Gündem" },

    // --- GOOGLE NEWS HIZLI SORGU (son dakika şeridi) ---
    // Google News RSS, olayı kaynak siteden dakikalar içinde indeksler. Başlıklar
    // "Başlık - Kaynak Adı" biçiminde gelir; fetcher kaynağı başlıktan ayırır.
    // Hepsi bot UA ile test edildi ve içerik döndürüyor.
    { name: "GN: Son Dakika", url: "https://news.google.com/rss/search?q=son%20dakika%20when%3A2h&hl=tr&gl=TR&ceid=TR:tr", category: "Gündem", fast: true },
    { name: "GN: Teknoloji", url: "https://news.google.com/rss/search?q=teknoloji%20when%3A2h&hl=tr&gl=TR&ceid=TR:tr", category: "Teknoloji", fast: true },
    { name: "GN: Tesla", url: "https://news.google.com/rss/search?q=tesla%20when%3A1h&hl=tr&gl=TR&ceid=TR:tr", category: "Teknoloji", fast: true },
    { name: "GN: Elon Musk", url: "https://news.google.com/rss/search?q=elon%20musk%20when%3A1h&hl=tr&gl=TR&ceid=TR:tr", category: "Teknoloji", fast: true },
    { name: "GN: Yapay Zeka", url: "https://news.google.com/rss/search?q=yapay%20zeka%20when%3A2h&hl=tr&gl=TR&ceid=TR:tr", category: "Yapay Zeka", fast: true },
    { name: "GN: Deprem", url: "https://news.google.com/rss/search?q=deprem%20when%3A1h&hl=tr&gl=TR&ceid=TR:tr", category: "Gündem", fast: true },
    { name: "GN: Apple", url: "https://news.google.com/rss/search?q=apple%20when%3A1h&hl=tr&gl=TR&ceid=TR:tr", category: "Mobil", fast: true },
    { name: "GN: Samsung", url: "https://news.google.com/rss/search?q=samsung%20when%3A2h&hl=tr&gl=TR&ceid=TR:tr", category: "Mobil", fast: true },

    // Teknoloji / Yazılım
    { name: "Webtekno", url: "https://www.webtekno.com/rss.xml", category: "Teknoloji", fast: true },
    { name: "ShiftDelete", url: "https://shiftdelete.net/feed", category: "Teknoloji", fast: true },
    { name: "DonanımHaber", url: "https://www.donanimhaber.com/rss/tum/", category: "Donanım", fast: true },
    { name: "Technopat", url: "https://www.technopat.net/feed", category: "Donanım" },
    { name: "Donanım Arşivi", url: "https://www.donanimarsivi.com/rss/", category: "Donanım" },
    { name: "NTV Teknoloji", url: "https://www.ntv.com.tr/teknoloji.rss", category: "Teknoloji" },
    { name: "CHIP Online", url: "https://www.chip.com.tr/rss", category: "Teknoloji" },
    { name: "Hürriyet Teknoloji", url: "https://www.hurriyet.com.tr/rss/teknoloji", category: "Teknoloji" },
    { name: "Webrazzi", url: "https://webrazzi.com/feed/", category: "İnternet" },
    { name: "Tamindir", url: "https://www.tamindir.com/feed/", category: "Yazılım" },

    // Oyun / Bilim
    { name: "Merlin'in Kazanı", url: "https://merlininkazani.com/feed/", category: "Oyun" },
    { name: "AA Bilim-Teknoloji", url: "https://www.aa.com.tr/tr/rss/default?cat=bilim-teknoloji", category: "Bilim" },
    { name: "Evrim Ağacı", url: "https://evrimagaci.org/rss.xml", category: "Bilim" },

    // Ekonomi
    { name: "Hürriyet Ekonomi", url: "https://www.hurriyet.com.tr/rss/ekonomi", category: "Ekonomi" },
    { name: "NTV Ekonomi", url: "https://www.ntv.com.tr/ekonomi.rss", category: "Ekonomi" },
    { name: "AA Ekonomi", url: "https://www.aa.com.tr/tr/rss/default?cat=ekonomi", category: "Ekonomi" },
    { name: "Bloomberg HT", url: "https://www.bloomberght.com/rss", category: "Ekonomi" },
    { name: "Dünya Gazetesi", url: "https://www.dunya.com/rss", category: "Ekonomi" },
    { name: "Sözcü Ekonomi", url: "https://www.sozcu.com.tr/feeds-rss-category-ekonomi", category: "Ekonomi" },
    { name: "Sabah Ekonomi", url: "https://www.sabah.com.tr/rss/ekonomi.xml", category: "Ekonomi" },

    // Spor
    { name: "AA Spor", url: "https://www.aa.com.tr/tr/rss/default?cat=spor", category: "Spor" },
    { name: "Sabah Spor", url: "https://www.sabah.com.tr/rss/spor.xml", category: "Spor" },
    { name: "Fotomaç", url: "https://www.fotomac.com.tr/rss/anasayfa.xml", category: "Spor" },

    // Dünya
    { name: "BBC Türkçe", url: "https://feeds.bbci.co.uk/turkce/rss.xml", category: "Dünya" },
    { name: "NTV Dünya", url: "https://www.ntv.com.tr/dunya.rss", category: "Dünya" },
    { name: "AA Dünya", url: "https://www.aa.com.tr/tr/rss/default?cat=dunya", category: "Dünya" },
    { name: "DW Türkçe", url: "https://rss.dw.com/rdf/rss-tur-all", category: "Dünya" },
    { name: "Euronews Türkçe", url: "https://tr.euronews.com/rss", category: "Dünya" },
  ],

  // ------------------------------------------------------------------
  // İŞLEME AYARLARI
  // ------------------------------------------------------------------
  maxPerRun: Number(process.env.MAX_PER_RUN || 2), // bir çalıştırmada AI'a giden maksimum NORMAL haber (her haber artık uzun metin üretiyor)
  // Kaynak çeşitliliği: tek bir kaynaktan tur başına en fazla kaç haber
  maxPerSource: Number(process.env.MAX_PER_SOURCE || 1),
  maxAgeHours: Number(process.env.MAX_AGE_HOURS || 48), // bundan eski haberleri atla

  // ------------------------------------------------------------------
  // SON DAKİKA (hızlı hat)
  // Son dakika adayları normal kotaya ek olarak işlenir: bir turda
  // maxBreakingPerRun + maxPerRun habere kadar çıkabilir (son dakika yoksa
  // davranış değişmez, yine maxPerRun). Aday sayısı: publishedAt <=
  // breakingWindowMin dakika VE (kaynak fast VEYA başlıkta son dakika
  // anahtar kelimesi). Ayrıntılar: src/breaking.js
  // ------------------------------------------------------------------
  maxBreakingPerRun: Number(process.env.MAX_BREAKING_PER_RUN || 2), // tur başına ekstra son dakika kotası
  breakingWindowMin: Number(process.env.BREAKING_WINDOW_MIN || 120), // "son dakika" sayılma penceresi (dakika)
  minContentLength: 40, // çok kısa/kirli içerikleri atla
  aiDelayMs: Number(process.env.AI_DELAY_MS || 6000), // AI istekleri arası bekleme (dakikalık token limiti için)

  // Aynı olayın onlarca kaynakta tekrarını engelle: başlık benzerliği eşiği.
  // Gerçek veriyle kalibre edildi: 0.65 = başlıktaki anlamlı kelimelerin %65'i
  // örtüşüyorsa "aynı haber" sayılır (ajans kopyaları 0.7-1.0 arası çıkıyor).
  dupeThreshold: Number(process.env.DUPE_THRESHOLD || 0.65),
  dupeWindowHours: Number(process.env.DUPE_WINDOW_HOURS || 48), // bu süre içindeki haberlere karşı kontrol edilir

  // Arşiv temizliği (src/dedupe.js → dedupeArticles) eşiği. Silme telafi
  // edilemez olduğu için giriş eşiğinden (dupeThreshold) daha temkinli tutulur:
  // burada yalnızca apaçık tekrarlar temizlenir.
  arsivDedupeThreshold: Number(process.env.ARSIV_DEDUPE_THRESHOLD || 0.75),

  // Her turda en az bir haber türü seçilsin: teknoloji/oyun siteleri dakikada
  // onlarca haber yayınladığı için gündem/son dakika haberlerini eziyor.
  newsCategories: (process.env.NEWS_CATEGORIES || "Gündem,Dünya,Ekonomi,Spor")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // ------------------------------------------------------------------
  // AI SAĞLAYICILAR (sırayla denenir). Anahtarı olan sağlayıcı kullanılır.
  // ------------------------------------------------------------------
  ai: {
    // Groq: ücretsiz katmanı cömert ve hızlı (GROQ_API_KEY gerekir)
    groqModels: (process.env.GROQ_MODELS || "openai/gpt-oss-120b,openai/gpt-oss-20b")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    // Gemini: günde model başına ~20 ücretsiz istek (GEMINI_API_KEY gerekir)
    geminiModels: (
      process.env.GEMINI_MODELS ||
      "gemini-flash-latest,gemini-flash-lite-latest,gemini-2.5-flash,gemini-3.5-flash,gemini-3.5-flash-lite"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },
};
