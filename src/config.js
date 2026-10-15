// Hattın TÜM ayarları burada. Kaynak eklemek/çıkarmak için sadece bu dosyayı düzenle.

export const config = {
  // Sitenin adı ve adresi (özet/kaynak gösteriminde kullanılır)
  siteName: "HaberAI",
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
    { name: "NTV Son Dakika", url: "https://www.ntv.com.tr/son-dakika.rss", category: "Gündem" },
    { name: "NTV Gündem", url: "https://www.ntv.com.tr/gundem.rss", category: "Gündem" },
    { name: "NTV Türkiye", url: "https://www.ntv.com.tr/turkiye.rss", category: "Gündem" },
    { name: "NTV Yaşam", url: "https://www.ntv.com.tr/yasam.rss", category: "Gündem" },
    { name: "TRT Haber Son Dakika", url: "https://www.trthaber.com/sondakika_articles.rss", category: "Gündem" },
    { name: "TRT Haber Gündem", url: "https://www.trthaber.com/gundem_articles.rss", category: "Gündem" },
    { name: "AA Güncel", url: "https://www.aa.com.tr/tr/rss/default?cat=guncel", category: "Gündem" },
    { name: "Hürriyet Gündem", url: "https://www.hurriyet.com.tr/rss/gundem", category: "Gündem" },
    { name: "Sözcü Gündem", url: "https://www.sozcu.com.tr/feeds-rss-category-gundem", category: "Gündem" },
    { name: "Sözcü Yaşam", url: "https://www.sozcu.com.tr/feeds-rss-category-yasam", category: "Gündem" },
    { name: "Sabah Gündem", url: "https://www.sabah.com.tr/rss/gundem.xml", category: "Gündem" },
    { name: "CNN Türk", url: "https://www.cnnturk.com/feed/rss/all/news", category: "Gündem" },
    { name: "Haber Global", url: "https://haberglobal.com.tr/rss", category: "Gündem" },
    { name: "Cumhuriyet", url: "https://www.cumhuriyet.com.tr/rss", category: "Gündem" },
    { name: "Posta", url: "https://www.posta.com.tr/rss/gundem.xml", category: "Gündem" },
    { name: "Yeni Şafak", url: "https://www.yenisafak.com/rss", category: "Gündem" },

    // Teknoloji / Yazılım
    { name: "Webtekno", url: "https://www.webtekno.com/rss.xml", category: "Teknoloji" },
    { name: "ShiftDelete", url: "https://shiftdelete.net/feed", category: "Teknoloji" },
    { name: "DonanımHaber", url: "https://www.donanimhaber.com/rss/tum/", category: "Donanım" },
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
  maxPerRun: Number(process.env.MAX_PER_RUN || 2), // bir çalıştırmada AI'a giden maksimum haber (her haber artık uzun metin üretiyor)
  // Kaynak çeşitliliği: tek bir kaynaktan tur başına en fazla kaç haber
  maxPerSource: Number(process.env.MAX_PER_SOURCE || 1),
  maxAgeHours: Number(process.env.MAX_AGE_HOURS || 48), // bundan eski haberleri atla
  minContentLength: 40, // çok kısa/kirli içerikleri atla
  aiDelayMs: Number(process.env.AI_DELAY_MS || 6000), // AI istekleri arası bekleme (dakikalık token limiti için)

  // Aynı olayın onlarca kaynakta tekrarını engelle: başlık benzerliği eşiği.
  // Gerçek veriyle kalibre edildi: 0.65 = başlıktaki anlamlı kelimelerin %65'i
  // örtüşüyorsa "aynı haber" sayılır (ajans kopyaları 0.7-1.0 arası çıkıyor).
  dupeThreshold: Number(process.env.DUPE_THRESHOLD || 0.65),
  dupeWindowHours: Number(process.env.DUPE_WINDOW_HOURS || 48), // bu süre içindeki haberlere karşı kontrol edilir

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
