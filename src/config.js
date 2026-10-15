// Hattın TÜM ayarları burada. Kaynak eklemek/çıkarmak için sadece bu dosyayı düzenle.

export const config = {
  // Sitenin adı ve adresi (özet/kaynak gösteriminde kullanılır)
  siteName: "HaberAI",
  siteUrl: "https://haberai.netlify.app",

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
  // ------------------------------------------------------------------
  feeds: [
    // Teknoloji / Yazılım
    { name: "Webtekno", url: "https://www.webtekno.com/rss.xml", category: "Teknoloji" },
    { name: "ShiftDelete", url: "https://shiftdelete.net/feed", category: "Teknoloji" },
    { name: "DonanımHaber", url: "https://www.donanimhaber.com/rss/tum/", category: "Donanım" },
    { name: "NTV Teknoloji", url: "https://www.ntv.com.tr/teknoloji.rss", category: "Teknoloji" },
    { name: "CHIP Online", url: "https://www.chip.com.tr/rss", category: "Teknoloji" },
    { name: "Hürriyet Teknoloji", url: "https://www.hurriyet.com.tr/rss/teknoloji", category: "Teknoloji" },
    { name: "Webrazzi", url: "https://webrazzi.com/feed/", category: "İnternet" },
    { name: "Tamindir", url: "https://www.tamindir.com/feed/", category: "Yazılım" },

    // Ekonomi
    { name: "Hürriyet Ekonomi", url: "https://www.hurriyet.com.tr/rss/ekonomi", category: "Ekonomi" },
    { name: "NTV Ekonomi", url: "https://www.ntv.com.tr/ekonomi.rss", category: "Ekonomi" },
    { name: "Bloomberg HT", url: "https://www.bloomberght.com/rss", category: "Ekonomi" },

    // Spor
    { name: "Hürriyet Spor", url: "https://www.hurriyet.com.tr/rss/spor", category: "Spor" },

    // Dünya / Genel
    { name: "BBC Türkçe", url: "https://feeds.bbci.co.uk/turkce/rss.xml", category: "Dünya" },
    { name: "NTV Dünya", url: "https://www.ntv.com.tr/dunya.rss", category: "Dünya" },
  ],

  // ------------------------------------------------------------------
  // İŞLEME AYARLARI
  // ------------------------------------------------------------------
  maxPerRun: Number(process.env.MAX_PER_RUN || 8), // bir çalıştırmada AI'a giden maksimum haber
  maxPerSource: Number(process.env.MAX_PER_SOURCE || 3), // tek kaynaktan en fazla kaç haber (çeşitlilik)
  maxAgeHours: Number(process.env.MAX_AGE_HOURS || 48), // bundan eski haberleri atla
  minContentLength: 40, // çok kısa/kirli içerikleri atla
  aiDelayMs: Number(process.env.AI_DELAY_MS || 4000), // AI istekleri arası bekleme (dakikalık token limiti için)

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
