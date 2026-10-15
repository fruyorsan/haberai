// Hattın TÜM ayarları burada. Kaynak eklemek/çıkarmak için sadece bu dosyayı düzenle.

export const config = {
  // Sitenin adı ve adresi (özet/kaynak gösteriminde kullanılır)
  siteName: "HaberAI",
  siteUrl: "https://ornek.pages.dev",

  // ------------------------------------------------------------------
  // KAYNAKLAR (RSS). Yeni kaynak eklemek için bir satır kopyala-değiştir.
  // ------------------------------------------------------------------
  feeds: [
    { name: "Webtekno", url: "https://www.webtekno.com/rss.xml" },
    { name: "DonanımHaber", url: "https://www.donanimhaber.com/rss/tum/" },
    { name: "ShiftDelete", url: "https://shiftdelete.net/feed" },
    { name: "NTV Teknoloji", url: "https://www.ntv.com.tr/teknoloji.rss" },
    { name: "Hürriyet Teknoloji", url: "https://www.hurriyet.com.tr/rss/teknoloji" },
    { name: "BBC Türkçe", url: "https://feeds.bbci.co.uk/turkce/rss.xml" },
    { name: "CHIP Online", url: "https://www.chip.com.tr/rss" },
  ],

  // ------------------------------------------------------------------
  // İŞLEME AYARLARI
  // ------------------------------------------------------------------
  maxPerRun: Number(process.env.MAX_PER_RUN || 8), // bir çalıştırmada AI'a giden maksimum haber
  maxAgeHours: Number(process.env.MAX_AGE_HOURS || 48), // bundan eski haberleri atla
  minContentLength: 40, // çok kısa/kirli içerikleri atla

  // ------------------------------------------------------------------
  // AI (Gemini)
  // ------------------------------------------------------------------
  model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  // Yapılandırılan model çalışmazsa sırayla denenecek modeller:
  modelFallbacks: [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-flash-latest",
    "gemini-3-flash-preview",
  ],
};
