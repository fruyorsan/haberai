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
    "Uzay",
    "Sağlık",
    "Kültür",
    "Yaşam",
    "Otomobil",
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
    { name: "GN: Son Dakika", url: "https://news.google.com/rss/search?q=son%20dakika%20when%3A2h&hl=tr&gl=TR&ceid=TR:tr", category: "Gündem" },
    { name: "GN: Teknoloji", url: "https://news.google.com/rss/search?q=teknoloji%20when%3A2h&hl=tr&gl=TR&ceid=TR:tr", category: "Teknoloji" },
    { name: "GN: Tesla", url: "https://news.google.com/rss/search?q=tesla%20when%3A1h&hl=tr&gl=TR&ceid=TR:tr", category: "Teknoloji", fast: true },
    { name: "GN: Elon Musk", url: "https://news.google.com/rss/search?q=elon%20musk%20when%3A1h&hl=tr&gl=TR&ceid=TR:tr", category: "Teknoloji", fast: true },
    { name: "GN: Yapay Zeka", url: "https://news.google.com/rss/search?q=yapay%20zeka%20when%3A2h&hl=tr&gl=TR&ceid=TR:tr", category: "Yapay Zeka" },
    { name: "GN: Deprem", url: "https://news.google.com/rss/search?q=deprem%20when%3A1h&hl=tr&gl=TR&ceid=TR:tr", category: "Gündem", fast: true },
    { name: "GN: Apple", url: "https://news.google.com/rss/search?q=apple%20when%3A1h&hl=tr&gl=TR&ceid=TR:tr", category: "Mobil", fast: true },
    { name: "GN: Samsung", url: "https://news.google.com/rss/search?q=samsung%20when%3A2h&hl=tr&gl=TR&ceid=TR:tr", category: "Mobil", fast: true },
    { name: "GN: Oyun", url: "https://news.google.com/rss/search?q=oyun%20when%3A2h&hl=tr&gl=TR&ceid=TR:tr", category: "Oyun" },

    // Teknoloji / Yazılım
    { name: "Webtekno", url: "https://www.webtekno.com/rss.xml", category: "Teknoloji", fast: true },
    { name: "ShiftDelete", url: "https://shiftdelete.net/wp-json/wp/v2/posts?per_page=20&_embed", category: "Teknoloji", fast: true },
    { name: "DonanımHaber", url: "https://www.donanimhaber.com/rss/tum/", category: "Donanım", fast: true },
    { name: "Technopat", url: "https://www.technopat.net/feed", category: "Donanım", fast: true },
    { name: "Donanım Arşivi", url: "https://www.donanimarsivi.com/wp-json/wp/v2/posts?per_page=15&_embed", category: "Donanım", fast: true },
    { name: "NTV Teknoloji", url: "https://www.ntv.com.tr/teknoloji.rss", category: "Teknoloji" },
    { name: "CHIP Online", url: "https://www.chip.com.tr/rss", category: "Teknoloji", fast: true },
    { name: "Hürriyet Teknoloji", url: "https://www.hurriyet.com.tr/rss/teknoloji", category: "Teknoloji" },
    { name: "Webrazzi", url: "https://webrazzi.com/feed/", category: "İnternet", fast: true },
    { name: "Tamindir", url: "https://www.tamindir.com/feed/", category: "Yazılım" },

    // Oyun / Bilim
    { name: "Merlin'in Kazanı", url: "https://merlininkazani.com/feed/", category: "Oyun", fast: true },
    { name: "AA Bilim-Teknoloji", url: "https://www.aa.com.tr/tr/rss/default?cat=bilim-teknoloji", category: "Bilim" },
    { name: "Evrim Ağacı", url: "https://evrimagaci.org/rss.xml", category: "Bilim", fast: true },
    { name: "Oyun Günlüğü", url: "https://www.oyungunlugu.com/feed/", category: "Oyun" },
    { name: "IGN Türkiye", url: "https://tr.ign.com/feed.xml", category: "Oyun", fast: true },
    { name: "Gamereactor Türkiye", url: "https://www.gamereactor.com.tr/feed/", category: "Oyun" },
    { name: "Gamereactor Türkiye (RSS)", url: "https://www.gamereactor.com.tr/rss/rss.php", category: "Oyun" },
    { name: "Sözcü Bilim-Teknoloji", url: "https://www.sozcu.com.tr/feeds-rss-category-bilim-teknoloji", category: "Bilim" },
    { name: "Cumhuriyet Bilim-Teknoloji", url: "https://www.cumhuriyet.com.tr/rss/bilim-teknoloji.xml", category: "Bilim" },

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
    { name: "Hürriyet Spor", url: "https://www.hurriyet.com.tr/rss/spor", category: "Spor" },
    { name: "GN: Süper Lig", url: "https://news.google.com/rss/search?q=s%C3%BCper%20lig%20when%3A2h&hl=tr&gl=TR&ceid=TR:tr", category: "Spor" },
    { name: "GN: Transfer", url: "https://news.google.com/rss/search?q=transfer%20when%3A2h&hl=tr&gl=TR&ceid=TR:tr", category: "Spor" },

    // Dünya (ulusal + uluslararası ajanslar)
    { name: "BBC Türkçe", url: "https://feeds.bbci.co.uk/turkce/rss.xml", category: "Dünya" },
    { name: "NTV Dünya", url: "https://www.ntv.com.tr/dunya.rss", category: "Dünya" },
    { name: "AA Dünya", url: "https://www.aa.com.tr/tr/rss/default?cat=dunya", category: "Dünya" },
    { name: "DW Türkçe", url: "https://rss.dw.com/rdf/rss-tur-all", category: "Dünya" },
    { name: "Euronews Türkçe", url: "https://tr.euronews.com/rss", category: "Dünya" },
    { name: "Hürriyet Dünya", url: "https://www.hurriyet.com.tr/rss/dunya", category: "Dünya" },
    { name: "Sabah Dünya", url: "https://www.sabah.com.tr/rss/dunya.xml", category: "Dünya" },
    { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", category: "Dünya", fast: true },
    { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", category: "Dünya" },
    { name: "DW English", url: "https://rss.dw.com/rdf/rss-en-all", category: "Dünya" },
    { name: "France 24", url: "https://www.france24.com/en/rss", category: "Dünya" },
    { name: "The Guardian World", url: "https://www.theguardian.com/world/rss", category: "Dünya" },
    { name: "Sky News World", url: "https://feeds.skynews.com/feeds/rss/world.xml", category: "Dünya" },
    { name: "NPR World", url: "https://feeds.npr.org/1004/rss.xml", category: "Dünya" },
    { name: "GN: Dünya Gündemi", url: "https://news.google.com/rss/search?q=d%C3%BCnya%20when%3A2h&hl=tr&gl=TR&ceid=TR:tr", category: "Dünya" },
    { name: "GN: Savaş/Çatışma", url: "https://news.google.com/rss/search?q=sava%C5%9F%20OR%20ate%C5%9Fkes%20when%3A2h&hl=tr&gl=TR&ceid=TR:tr", category: "Dünya", fast: true },
    { name: "GN: Avrupa", url: "https://news.google.com/rss/search?q=avrupa%20when%3A3h&hl=tr&gl=TR&ceid=TR:tr", category: "Dünya" },
    { name: "GN: ABD", url: "https://news.google.com/rss/search?q=abd%20OR%20trump%20when%3A2h&hl=tr&gl=TR&ceid=TR:tr", category: "Dünya", fast: true },
    { name: "GN: Çin/Asya", url: "https://news.google.com/rss/search?q=%C3%A7in%20OR%20asya%20when%3A3h&hl=tr&gl=TR&ceid=TR:tr", category: "Dünya" },
    { name: "GN: Ortadoğu", url: "https://news.google.com/rss/search?q=ortado%C4%9Fu%20OR%20gazze%20when%3A2h&hl=tr&gl=TR&ceid=TR:tr", category: "Dünya", fast: true },

    // Sağlık / Yaşam / Kültür (yeni kategoriler)
    { name: "Sabah Sağlık", url: "https://www.sabah.com.tr/rss/saglik.xml", category: "Sağlık" },
    { name: "GN: Sağlık", url: "https://news.google.com/rss/search?q=sa%C4%9Fl%C4%B1k%20when%3A3h&hl=tr&gl=TR&ceid=TR:tr", category: "Sağlık" },
    { name: "GN: Bilim", url: "https://news.google.com/rss/search?q=bilim%20ke%C5%9Fif%20when%3A4h&hl=tr&gl=TR&ceid=TR:tr", category: "Bilim" },
    { name: "GN: Uzay", url: "https://news.google.com/rss/search?q=uzay%20OR%20nasa%20OR%20spacex%20when%3A4h&hl=tr&gl=TR&ceid=TR:tr", category: "Uzay" },
    { name: "NASA", url: "https://www.nasa.gov/news-release/feed/", category: "Uzay" },
    { name: "ScienceDaily", url: "https://www.sciencedaily.com/rss/top/science.xml", category: "Bilim" },
    { name: "GN: Kültür-Sanat", url: "https://news.google.com/rss/search?q=k%C3%BClt%C3%BCr%20sanat%20when%3A6h&hl=tr&gl=TR&ceid=TR:tr", category: "Kültür" },
    { name: "GN: Yaşam", url: "https://news.google.com/rss/search?q=ya%C5%9Fam%20trend%20when%3A6h&hl=tr&gl=TR&ceid=TR:tr", category: "Yaşam" },
    { name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", category: "Ekonomi" },

    // Otomobil / elektrikli araç
    { name: "GN: Otomobil", url: "https://news.google.com/rss/search?q=otomobil%20OR%20elektrikli%20ara%C3%A7%20when%3A3h&hl=tr&gl=TR&ceid=TR:tr", category: "Otomobil" },
    { name: "GN: Ekonomi", url: "https://news.google.com/rss/search?q=ekonomi%20OR%20enflasyon%20OR%20faiz%20when%3A2h&hl=tr&gl=TR&ceid=TR:tr", category: "Ekonomi" },
    { name: "GN: Borsa/Döviz", url: "https://news.google.com/rss/search?q=borsa%20OR%20dolar%20OR%20alt%C4%B1n%20when%3A2h&hl=tr&gl=TR&ceid=TR:tr", category: "Ekonomi" },
  ],

  // ------------------------------------------------------------------
  // İŞLEME AYARLARI
  // ------------------------------------------------------------------
  maxPerRun: Number(process.env.MAX_PER_RUN || 2), // bir çalıştırmada AI'a giden maksimum NORMAL haber (her haber artık uzun metin üretiyor)
  // Kaynak çeşitliliği: tek bir kaynaktan tur başına en fazla kaç haber
  maxPerSource: Number(process.env.MAX_PER_SOURCE || 1),
  maxAgeHours: Number(process.env.MAX_AGE_HOURS || 48), // bundan eski haberleri atla

  // ------------------------------------------------------------------
  // GÜNLÜK YAYIN KOTASI (2026-10-23)
  // ------------------------------------------------------------------
  // ShiftDelete/Webtekno/DonanımHaber/CHIP/Tamindir son 24 saatte ortalama
  // ~35-40 haber yayınlıyor. 3.800 sayfa/5 gün yerine bu tempoda yayınlamak
  // hem Google'ın "ölçekli içerik" filtresinden kaçınmayı hem de gün boyu
  // taze kalmayı sağlar.
  //
  // gunlukLimit: 0 = sınırsız (eski davranış).
  // yayinAralikDk: normal haberler arasındaki en kısa süre. Kota tek başına
  //   yetmez; aksi hâlde 40 haber ilk 1-2 saatte tükenip günün kalanında
  //   yeni haber çıkmaz.
  // sonDakikaAralikDk: son dakika adayı varsa daha kısa bekleme.
  //
  // Ayrıca src/index.js kotayı günün geçen oranına göre de sınırlar:
  // öğlene kadar ~20, 20:00'de ~33 haber. Böylece 40 haber sabah
  // saatlerinde tükenip akşam site sessiz kalmaz.
  gunlukLimit: Number(process.env.GUNLUK_HABER_LIMIT || 40),
  // 40 haber / 24 saat ≈ 36 dk arayla. Böylece kota günün ilk saatlerinde
  // tükenmez, akış gece yarısına kadar dengeli sürer.
  yayinAralikDk: Number(process.env.YAYIN_ARALIK_DK || 36),
  sonDakikaAralikDk: Number(process.env.SON_DAKIKA_ARALIK_DK || 12),
  // Saatlik tavan: "son dakika" adayları gün içinde neredeyse hiç bitmediği
  // için 12 dk aralık tek başına kotayı 8 saatte tüketirdi. Saatte en fazla
  // 2 haber (0 = sınırsız) akışı gün boyuna yayar.
  saatlikLimit: Number(process.env.SAATLIK_HABER_LIMIT || 2),

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
  newsCategories: (process.env.NEWS_CATEGORIES || "Gündem,Dünya,Ekonomi,Spor,Sağlık,Kültür,Yaşam")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // ------------------------------------------------------------------
  // AI SAĞLAYICILAR (sırayla denenir). Anahtarı olan sağlayıcı kullanılır.
  // ------------------------------------------------------------------
  ai: {
    // Groq: ücretsiz katmanı cömert ve hızlı (GROQ_API_KEY gerekir)
    groqModels: (process.env.GROQ_MODELS || "llama-3.3-70b-versatile,meta-llama/llama-4-scout-17b-16e-instruct,meta-llama/llama-4-maverick-17b-128e-instruct,qwen/qwen3-32b,llama-3.1-8b-instant,openai/gpt-oss-120b,openai/gpt-oss-20b")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    // Gemini: günde model başına ~20 ücretsiz istek (GEMINI_API_KEY gerekir)
    geminiModels: (
      process.env.GEMINI_MODELS ||
      "gemma-3-27b-it,gemma-3-12b-it,gemini-flash-latest,gemini-flash-lite-latest,gemini-2.5-flash,gemini-3.5-flash,gemini-3.5-flash-lite"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },
};
