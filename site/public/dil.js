/* ==========================================================================
   HaberinAi — arayüz dili (TR ⇄ EN)
   --------------------------------------------------------------------------
   NEDEN BÖYLE: Site tamamen statik üretiliyor ve haber metinleri Türkçe.
   İngilizce için ayrı /en/ adresleri üretmek, aynı içeriğin iki kez
   indekslenmesine ve canonical/hreflang karmaşasına yol açardı. Bunun yerine
   yalnızca ARAYÜZ etiketleri tarayıcıda çevrilir; haber başlığı, özeti, gövdesi
   ve yorum metinleri olduğu gibi (Türkçe) kalır ve SEO'ya hiç dokunulmaz.

   - Tercih sessionStorage'da tutulur ("hb-dil"): her yeni ziyaret Türkçe
     başlar, aynı sekmede yenileme İngilizceyi korur. Eski kalıcı
     localStorage kaydı okunmaz ve temizlenir.
   - Erken inline betik (Base.astro) ilk boyamadan önce <html lang/data-dil>
     değerini ayarlar; böylece Türkçe metin bir an görünüp kaybolmaz.
   - Metin düğümleri ve birkaç öznitelik (aria-label/title/placeholder)
     çevrilir. Özgün metin bellekte tutulur; TR'ye dönüşte birebir geri gelir.
   - MutationObserver, sonradan gelen arayüz metinlerini (bildirim durumu,
     yorum düğmeleri…) de çevirir.

   Haber içeriği ASLA çevrilmez: aşağıdaki ATLA listesindeki seçicilerdeki
   metinler atlanır.
   ========================================================================== */
(function () {
  "use strict";

  var DEPO = "hb-dil";
  var KOK = document.documentElement;
  var ATLA = [
    "script",
    "style",
    "noscript",
    "svg",
    "code",
    "pre",
    "textarea",
    "canvas",
    "iframe",
    "[data-dil-atla]",
    ".post__title",
    ".recap__text",
    ".recap__item span",
    ".content__p",
    ".analysis__text",
    ".card__title",
    ".card__summary",
    ".fs__title",
    ".fs__summary",
    ".fs__note-text",
    ".shorts__metin",
    ".ak__baslik",
    ".post__tag",
    ".yorum__metin",
    ".yorum__oge-metin",
    ".aiask__answer",
    ".guven__marka",
    ".searchbox__opt-title",
    ".footer__col a[href^='/haber/']",
  ].join(",");

  var AYLAR = {
    Ocak: "January",
    Şubat: "February",
    Mart: "March",
    Nisan: "April",
    Mayıs: "May",
    Haziran: "June",
    Temmuz: "July",
    Ağustos: "August",
    Eylül: "September",
    Ekim: "October",
    Kasım: "November",
    Aralık: "December",
  };

  var SOZLUK = {
    /* --- Marka / genel --- */
    "ana sayfa": "home",
    "— hesabım": "— my account",
    "Okur": "Reader",
    "Yönetici": "Admin",
    "ve": "and",

    /* --- Üst menü / gezinme --- */
    "Ana Sayfa": "Home",
    "Anasayfa": "Home",
    "HaberinAi — Yapay Zekâ Destekli Türkçe Haberler ve Gündem Özetleri":
      "HaberinAi — AI-powered Turkish news and agenda briefs",
    "Son Dakika": "Breaking News",
    "Son 24 saatte yeni haber gelmedi; en yeni başlıkları listeliyoruz.":
      "No new stories in the last 24 hours; showing the latest headlines.",
    "Öne Çıkanlar": "Featured",
    "Piyasa": "Markets",
    "Tüm Haberler": "All News",
    "Bölümler": "Sections",
    "Hızlı menü": "Quick menu",
    "Kategoriler": "Categories",
    "Tümü": "All",
    "Tümü →": "All →",
    "Tüm konular": "All topics",
    "Konular": "Topics",
    "Kategori": "Category",
    "Shorts Haber": "Shorts News",

    /* --- Kategoriler --- */
    "Gündem": "Agenda",
    "Dünya": "World",
    "Ekonomi": "Economy",
    "Spor": "Sports",
    "Teknoloji": "Technology",
    "Yapay Zekâ": "AI",
    "Yapay Zeka": "AI",
    "Bilim": "Science",
    "Uzay": "Space",
    "Sağlık": "Health",
    "Kültür": "Culture",
    "Yaşam": "Life",
    "Otomobil": "Automotive",
    "Mobil": "Mobile",
    "Donanım": "Hardware",
    "Yazılım": "Software",
    "İnternet": "Internet",
    "Oyun": "Gaming",
    "Diğer": "Other",

    /* --- Arama --- */
    "Haber ara": "Search news",
    "Haber ara...": "Search news…",
    "Haber Ara": "Search News",
    "Örn: iPhone, yapay zeka, PlayStation, dolar...":
      "e.g. iPhone, AI, PlayStation, dollar…",
    "Arama önerileri": "Search suggestions",
    "ARAMA": "SEARCH",
    "Ara": "Search",
    "Sonuç bulunamadı.": "No results found.",
    "Tüm sonuçları göster": "Show all results",
    "Tüm sonuçlar": "All results",
    "Aramak için yazmaya başla.": "Start typing to search.",
    "Temizle": "Clear",
    "Ada ya da kullanıcı adına göre ara...": "Search by name or username…",
    "Henüz kategori yok.": "No categories yet.",
    "Henüz konu yok.": "No topics yet.",
    "Sayfa bulunamadı — HaberinAi": "Page not found — HaberinAi",
    "Aradığınız sayfa bulunamadı. Güncel haberlere HaberinAi'dan ulaşabilirsiniz.":
      "The page you were looking for wasn't found. Catch up on the latest news at HaberinAi.",

    /* --- İletişim --- */
    "Bize Ulaşın": "Contact Us",
    "Hangi Konularda Yazabilirsiniz?": "What can you write about?",
    "Mesaj Gönderin": "Send a message",
    "Adınız (isteğe bağlı)": "Your name (optional)",
    "Genel Görüş ve Öneri": "General feedback",
    "Düzeltme / Hata Bildirimi": "Correction / error report",
    "Telif / İçerik Kaldırma Talebi": "Copyright / removal request",
    "Haber İhbarı / Basın Bülteni": "News tip / press release",
    "Reklam ve Sponsorluk": "Advertising & sponsorship",
    "İlgili Haber Bağlantısı (varsa)": "Related article link (if any)",
    "Mesajınız": "Your message",
    "E-posta ile Gönder": "Send by email",
    "Resmi İletişim E-postası": "Official contact email",
    "Yanıt süresi: 24–48 saat": "Response time: 24–48 hours",

    /* --- Reklam --- */
    "Teklif alın": "Get a quote",
    "Konuşalım": "Let's talk",
    "Reklam biçimleri": "Ad formats",
    "ör. ahmet_y": "e.g. ahmet_y",
    "Yorumlarda görünecek ad": "Name shown in comments",
    "En az 6 karakter": "At least 6 characters",
    "Adınız Soyadınız": "Your full name",
    "Mesajınızı buraya yazın...": "Write your message here…",
    "Sorunu buraya yaz...": "Describe the issue here…",

    /* --- Hesap --- */
    "Giriş": "Sign in",
    "Giriş yap": "Sign in",
    "Giriş Yap": "Sign in",
    "giriş yap": "sign in",
    "Giriş / Kayıt": "Sign in / Sign up",
    "Giriş veya kayıt": "Sign in or sign up",
    "Giriş yap / Hesap oluştur": "Sign in / Create account",
    "Hesap oluştur": "Create account",
    "Kayıt ol": "Sign up",
    "Hesabına gir": "Sign in to your account",
    "Çıkış yap": "Sign out",
    "Hesabımı sil": "Delete my account",
    "Hesabı sil": "Delete account",
    "Hesap bilgileri": "Account details",
    "Profil": "Profile",
    "Profilim": "My profile",
    "Açık profilim": "My public profile",
    "Profil fotoğrafı": "Profile photo",
    "Hazır avatar seç": "Choose an avatar",
    "Görünen ad": "Display name",
    "Kullanıcı adı": "Username",
    "Adın": "Your name",
    "Adınız (isteğe bağlı)": "Your name (optional)",
    "Adınız Soyadınız": "Your full name",
    "Adın (boş bırakırsan “Okur”)": "Your name (leave blank for “Reader”)",
    "Yorumlarda görünecek ad": "Name shown on comments",
    "Boş bırakırsan kullanıcı adın görünür.": "Leave blank to use your username.",
    "E-posta": "Email",
    "E-posta:": "Email:",
    "Şifre": "Password",
    "En az 6 karakter": "At least 6 characters",
    "3-24 karakter; harf, rakam, nokta veya alt çizgi.":
      "3–24 characters; letters, numbers, dots or underscores.",
    "ör. ahmet_y": "e.g. ahmet_y",
    "Kaydet": "Save",
    "Kaydedildi": "Saved",
    "Beğendiklerim": "Liked",
    "Kaydedilenler": "Saved",
    "Okuma listesi": "Reading list",
    "Okuma listesine kaydet": "Save to reading list",
    "İlgi alanları": "Interests",
    "Konu": "Topic",
    "Tümünü seç": "Select all",
    "Profil için giriş gerekli": "Sign in to view your profile",
    "İlgi alanlarını seçmek, bildirimlerini yönetmek ve yorumlarını görmek için hesabına gir.":
      "Sign in to choose your interests, manage notifications and see your comments.",
    "Yönetim": "Admin",
    "Yönetim paneli": "Admin panel",
    "Kayıtlı okur": "Registered readers",
    "Sitede hesabı olanlar": "People with an account",
    "Son 24 saatte aktif": "Active in the last 24 hours",
    "Sitede hareket eden üye": "Members active on the site",
    "Şu an okunan sayfalar": "Currently being read",
    "Çevrimiçi ve son aktif üyeler": "Online and recently active members",
    "Üyeler ve rozetler": "Members and badges",
    "Yorumların": "Your comments",
    "Henüz yorumun yok.": "No comments yet.",
    "Bildirim durumu kontrol ediliyor…": "Checking notification status…",

    /* --- Bildirimler --- */
    "Bildirimler": "Notifications",
    "Bildirimler açık": "Notifications on",
    "Bildirimler kapalı": "Notifications off",
    "Bildirimleri aç": "Enable notifications",
    "Bildirimleri duraklat": "Pause notifications",
    "Bildirimleri duraklat (Sessiz mod)": "Pause notifications (Silent mode)",
    "Son dakika haberlerini kaçırma": "Never miss breaking news",
    "Bildirim önerisi": "Notification suggestion",
    "Aç": "Turn on",
    "Kapat": "Close",
    "Bildirim başlıkların": "Notification topics",
    "Yalnızca seçtiğin başlıklardan bildirim gelir (varsayılan: günde ~10 bildirim).":
      "You only get notifications from the topics you pick (default: ~10 a day).",
    "Günlük sıklık": "Daily frequency",
    "Günlük bildirim sıklığı": "Daily notification frequency",
    "Günde ~10 bildirim (Önerilen)": "~10 notifications a day (Recommended)",
    "Dengeli — Seçtiğim başlıklardan günde ~10 bildirim (Önerilen)":
      "Balanced — ~10 notifications a day from my topics (Recommended)",
    "Seçtiğim başlıklardaki tüm haberler": "All news in my topics",
    "Tüm haberler — Seçtiğim başlıklardaki her yeni haber gelsin":
      "All news — every new story in my topics",
    "Günde 3 özet (09:00 · 15:00 · 21:00)": "3 digests a day (09:00 · 15:00 · 21:00)",
    "Günde 3 özet — 09:00 · 15:00 · 21:00": "3 digests a day — 09:00 · 15:00 · 21:00",
    "Sadece son dakika haberleri": "Breaking news only",
    "Genel son dakika": "General breaking news",
    "Seçtiğim başlıklar dışındaki son dakika haberleri":
      "Breaking news outside my topics",
    "Deneme bildirimi gönder": "Send test notification",
    "🔔 Deneme bildirimi gönder": "🔔 Send test notification",
    "Deneme bildirimi gönderildi ✓": "Test notification sent ✓",
    "Deneme bildirimi": "Test notification",
    "Gündemden ilk senin haberin olsun!": "Be the first to know.",
    "Son dakika haberleri için bildirimlere izin ver. İstediğin an kapatabilirsin.":
      "Allow notifications for breaking news. You can turn them off anytime.",
    "Daha Sonra": "Later",
    "Daha sonra": "Later",
    "İzin Ver": "Allow",
    "Bildirimler açıldı 🎉": "Notifications are on 🎉",
    "Artık son dakika haberlerini buradan alacaksın. İstediğin an kapatabilirsin.":
      "You will now get breaking news here. You can turn it off anytime.",
    "Bildirimler açıldı ✓ Bu cihaza bir deneme bildirimi gönderdik; görünmediyse sistem bildirimlerini kontrol et.":
      "Notifications are on ✓ We sent a test notification to this device; if you did not see it, check your system notifications.",
    "Bildirimler açıldı ✓ Yeni son dakika haberlerinde buradan haber vereceğiz.":
      "Notifications are on ✓ We will alert you about new breaking news.",
    "Bildirim servisine ulaşılamıyor (reklam engelleyici ya da ağ olabilir).":
      "Notification service is unreachable (an ad blocker or the network may be the cause).",
    "Bildirimler duraklatıldı ✓": "Notifications paused ✓",
    "Seçtiğin başlıklardaki tüm haberler gelecek ✓":
      "All news from your topics will be delivered ✓",
    "Günde 3 özet bildirim seçildi ✓": "3 daily digest notifications selected ✓",
    "Günde ~10 bildirim (Önerilen) seçildi ✓":
      "~10 notifications a day (Recommended) selected ✓",
    "Takip kaydedildi.": "Follow saved.",
    "Bu konuyu takibi bıraktın.": "You unfollowed this topic.",
    "Bildirim izni engelli": "Notification permission blocked",
    "Tarayıcı izin penceresini göstermiyor — nasıl açılır?":
      "The browser is not showing the permission prompt — how do I enable it?",
    "Nasıl?": "How?",
    "Kapalıyken yalnızca seçtiğin başlıklar gelir. Tüm ayarlar için":
      "When off, only your selected topics are delivered. To adjust all settings, visit the",
    "sayfasına git.": "page.",
    "Bildirim izni tarayıcıda engelli. Yukarıdaki adımlarla açabilirsin.":
      "Notification permission is blocked in the browser. You can enable it with the steps above.",
    "Tarayıcı bildirimleri engellemiş": "Browser notifications are blocked",
    "Bir kez “Engelle” denmiş; tarayıcı artık izin penceresini göstermiyor. Açmak için:":
      "You chose “Block” once, so the browser no longer shows the permission prompt. To enable it:",
    "Adres çubuğunun solundaki kilit / ayar simgesine dokun.":
      "Tap the lock / settings icon at the left of the address bar.",
    "İzinler → Bildirimler → İzin ver.": "Permissions → Notifications → Allow.",
    "İzinler → Bildirimler →": "Permissions → Notifications →",
    "İzin ver": "Allow",
    "Sayfayı yenile.": "Reload the page.",
    "Telefonda: Chrome ⋮ → Ayarlar → Site ayarları → Bildirimler → haberinai.site → İzin ver.":
      "On phone: Chrome ⋮ → Settings → Site settings → Notifications → haberinai.site → Allow.",
    "iPhone'da bildirim": "Notifications on iPhone",
    "Paylaş → Ana Ekrana Ekle, sonra o ikondan aç":
      "Share → Add to Home Screen, then open from that icon",
    "iPhone'da bildirim için: Paylaş → Ana Ekrana Ekle, sonra o ikondan aç.":
      "For notifications on iPhone: Share → Add to Home Screen, then open from that icon.",
    "Bildirimler çalışıyor ✓ Son dakika haberlerini kaçırmayacaksın.":
      "Notifications are working ✓ You will not miss breaking news.",
    "Deneme bildirimi gönderildi ✓ Görünmediyse telefonun bildirim ayarlarında bu siteye izin ver.":
      "Test notification sent ✓ If you did not see it, allow this site in your phone's notification settings.",
    "Deneme bildirimi gösterilemedi. Tarayıcı izinlerini kontrol et.":
      "Could not show the test notification. Check the browser permissions.",

    /* --- Alt bilgi --- */
    "Son Haberler": "Latest News",
    "Kurumsal": "Company",
    "Hakkımızda": "About us",
    "Künye": "Masthead",
    "Yayın İlkeleri": "Editorial Policy",
    "Yayın İlkeleri ve Doğruluk Politikası": "Editorial Policy and Accuracy",
    "İletişim": "Contact",
    "Gizlilik Politikası": "Privacy Policy",
    "Gizlilik ve Çerez Politikası": "Privacy & Cookie Policy",
    "Kullanım Şartları": "Terms of Use",
    "İçerik ve Telif": "Content & Copyright",
    "İçerik ve Telif Politikası": "Content & Copyright Policy",
    "İçerik ve telif politikası": "Content & copyright policy",
    "Reklam ve Sponsorluk": "Advertising & Sponsorship",
    "RSS Akışı": "RSS Feed",
    "Sosyal kanallar": "Social channels",
    "haber": "articles",
    "kategori": "categories",
    "dakikalar içinde güncellenir": "updated within minutes",
    "Haberler HaberinAi editör masası tarafından özetlenir; görseller yalnızca serbest lisanslı kaynaklardan seçilir.":
      "News is summarised by the HaberinAi editorial desk; images are selected only from freely licensed sources.",
    "Türkiye ve dünya gündeminden son dakika gelişmeleri, teknoloji, ekonomi ve analitik haber dosyaları.":
      "Breaking news from Türkiye and the world, plus technology, business and in-depth analysis.",

    /* --- Ana sayfa --- */
    "Akışa gir": "Enter the feed",
    "Shorts'a gir — kaydırarak oku": "Open Shorts — swipe to read",
    "Kaydır, oku, beğen. Telefon için tasarlandı — dakikalar içinde tazelenir.":
      "Swipe, read, like. Built for phones — refreshed within minutes.",
    "Arşiv seçkisi →": "Archive selection →",
    "Son dakika akışının ötesinde kalan, kalite kapısından geçmiş dosyalar.":
      "Quality-approved stories beyond the breaking-news feed.",
    "Popüler Konular": "Popular Topics",
    "Daha fazla haber": "More news",
    "Öne çıkan haberler": "Featured stories",
    "Önceki haber": "Previous story",
    "Sonraki haber": "Next story",
    "Slayt seçimi": "Slide selection",
    "Otomatik geçişi duraklat": "Pause autoplay",
    "Otomatik geçişi başlat": "Start autoplay",
    "İlgi çekici haber": "Trending story",
    "İlgi çekici": "Trending",
    "Henüz haber yok. Hattı çalıştır:": "No news yet. Run the pipeline:",
    "ARŞİV SEÇKİSİ": "ARCHIVE SELECTION",
    "Bu seçki nasıl oluşuyor?": "How is this selection made?",
    "Tüm Seçki (500)": "Full Selection (500)",
    "Tüm akış": "All news",
    "tüm akış": "all news feed",

    /* --- Piyasa --- */
    "PİYASA": "MARKETS",
    "Piyasa Göstergeleri": "Market Indicators",
    "Piyasa verileri": "Market data",
    "Tüm piyasa grafiklerini gör": "View all market charts",
    "Grafik verisi yok": "No chart data",
    "1 ay en düşük:": "1-month low:",
    "en yüksek:": "high:",
    "Dolar/TL": "USD/TRY",
    "Euro/TL": "EUR/TRY",
    "Gram Altın": "Gold (gram)",
    "Çeyrek Altın": "Gold (quarter)",
    "Ons Altın": "Gold (ounce)",
    "Gümüş (gram)": "Silver (gram)",
    "Bitcoin/TL": "Bitcoin/TRY",

    /* --- Haber sayfası --- */
    "Haber Merkezi": "Newsroom",
    "Özet": "Summary",
    "Öne çıkanlar": "Highlights",
    "Haberin Detayı": "Full Story",
    "AI Özet": "AI Summary",
    "AI Yorumu": "AI Analysis",
    "AI YORUMU": "AI ANALYSIS",
    "AI'ya Sor": "Ask AI",
    "AI'YA SOR": "ASK AI",
    "HaberinAi editör analizi": "HaberinAi editorial analysis",
    "Bu haber hakkında merak ettiklerini sorabilirsin":
      "Ask anything you are curious about this story",
    "Bu haber kısaca ne anlatıyor?": "What is this story about?",
    "Bu gelişme kimleri etkiler?": "Who is affected by this?",
    "Bunun olası sonuçları neler?": "What are the likely consequences?",
    "Sorunu buraya yaz...": "Type your question…",
    "Sor": "Ask",
    "AI düşünüyor...": "AI is thinking…",
    "Yanıt alınamadı.": "No answer received.",
    "Bağlantı hatası. Lütfen tekrar dene.": "Connection error. Please try again.",
    "Bu kategoriyi takip et": "Follow this category",
    "SON DAKİKA": "BREAKING NEWS",
    "EDİTÖR NOTU": "EDITOR'S NOTE",
    "FOTO GALERİ": "PHOTO GALLERY",
    "Fotoğraf galerisi": "Photo gallery",
    "Galeriyi kapat": "Close gallery",
    "Fotoğrafı büyüt": "Enlarge photo",
    "Fotoğrafa dokunarak büyüt; galeride oklarla gez.":
      "Tap a photo to enlarge; browse the gallery with the arrows.",
    "Okuma zinciri burada sona erdi": "End of the reading chain",
    "Tüm haberlere göz at →": "Browse all news →",
    "İlgili Haberler": "Related News",
    "Bu haber hakkında": "About this story",
    "Güncelleme:": "Updated:",
    "Hata bildir": "Report an error",
    "Yayın ilkeleri": "Editorial policy",
    "Telif": "Copyright",
    "Yapay zekâ araçları": "AI tools",
    "Bildirim al": "Get notifications",
    "Bu Özel Haberin Devamı Yalnızca Premium Okurlarımıza Açıktır":
      "The rest of this special story is for Premium readers only",
    "Derinlemesine yapay zekâ analizleri, kaynak kodları ve bağımsız haber dosyalarının tamamına erişmek için Premium veya VIP Kulübüne katılın.":
      "Join Premium or the VIP Club to access in-depth AI analysis, source code and the full archive of independent stories.",
    "Hemen Abone Ol (49 ₺/ay)": "Subscribe now (₺49/month)",
    "👑 Özgür Premium": "👑 Premium",
    "👑 HaberinAi Özgür Premium": "👑 HaberinAi Premium",
    "Sponsorlu": "Sponsored",

    /* --- Paylaşım --- */
    "Paylaş": "Share",
    "Paylaş:": "Share:",
    "Bağlantıyı kopyala": "Copy link",
    "Diğer uygulamalarda paylaş": "Share to other apps",
    "Haberi beğen": "Like this story",
    "Beğen": "Like",
    "Beğeniyi geri al": "Unlike",
    "Yorumu beğen": "Like this comment",
    "Yanıtla": "Reply",
    "Sil": "Delete",
    "Yorumumu sil": "Delete my comment",
    "Özel rozet": "Custom badge",
    "Hesabıyla yazdı": "Written with their account",

    /* --- Yorumlar --- */
    "Yorumlar": "Comments",
    "Hesap gerekmez · reklamsız": "No account needed · ad-free",
    "Küfür, hakaret ve reklam silinir.": "Profanity, insults and ads are removed.",
    "Yorum yaz": "Post comment",
    "Yorumlar yükleniyor…": "Loading comments…",
    "İlk yorumu sen yaz.": "Be the first to comment.",
    "Ne düşünüyorsun?": "What do you think?",
    "Yorumun": "Your comment",
    "Takma ad": "Nickname",
    "Bu kullanıcının henüz açık bir yorumu bulunmuyor.":
      "This user has no public comments yet.",
    "Bu isimde bir kullanıcı kaydı veya yorum geçmişi bulunmuyor.":
      "No account or comment history found for this name.",
    "Bu kullanıcının henüz herkese açık beğendiği bir video veya haber bulunmuyor.":
      "This user has not publicly liked any video or story yet.",

    /* --- Bildirim/son dakika akışı --- */
    "Canlı Takip": "Live",
    "Gündem akışı": "Live feed",
    "Akışı süz": "Filter the feed",
    "Filtresiz": "Unfiltered",
    "Sana özel": "For you",
    // Düğmenin erişilebilir adı görünen metni içermeli (WCAG 2.5.3).
    // İngilizce arayüzde aria-label Türkçe kalırsa Lighthouse
    // label-content-name-mismatch veriyor.
    "Sana özel sırala": "Sort for you",
    "Beğendiğin kategoriler öne gelsin": "Your liked categories come first",
    "Tümü": "All",
    "Yeni haberler cebine gelsin": "Get new stories on your phone",
    "Akışın sonuna geldin. Tüm arşiv:": "You've reached the end of the feed. Full archive:",
    "tüm haberler": "all news",
    "Yorumları kapat": "Close comments",
    "Haberi oku": "Read story",
    "Okuma listesine kaydet": "Save to reading list",
    "Habere git →": "Open story →",
    "Haberi oku →": "Read story →",
    "Haberin tam sayfası →": "Full story →",
    "Daha fazla haber": "More news",

    /* --- Sayfalama --- */
    "Sayfalama": "Pagination",
    "← Önceki": "← Previous",
    "Sonraki →": "Next →",
    "← Ana sayfaya dön": "← Back to home",
    "Geri dön": "Go back",

    /* --- 404 --- */
    "Aradığınız sayfa bulunamadı": "Page not found",
    "Sayfa bulunamadı": "Page not found",
    "Bağlantı taşınmış, adres yanlış yazılmış ya da haber kaldırılmış olabilir. Aşağıdaki güncel haberlere göz atabilirsiniz.":
      "The link may have moved, the address may be mistyped, or the story may have been removed. You can browse the latest stories below.",

    /* --- Çerez bandı --- */
    "Sadece zorunlu": "Essential only",
    "Kabul et": "Accept",
    "Sitemizde kullanıcı deneyimini geliştirmek, analitik ölçüm ve reklam sunumu için çerezler kullanılmaktadır. Ayrıntılar:":
      "We use cookies to improve your experience, measure analytics and serve ads. Details:",

    /* --- Palet --- */
    "Beyaz": "White",
    "Siyah": "Black",
    "Bordo": "Burgundy",
  };

  /* Tam eşleşmeyen, kalıplı arayüz metinleri. */
  var KURALLAR = [
    [/^az önce$/, function () { return "Just now"; }],
    [/^(\d+)\s+dakika önce$/, function (m) { return m[1] + " min ago"; }],
    [/^(\d+)\s+saat önce$/, function (m) { return m[1] + " hr ago"; }],
    [/^(\d+)\s+gün önce$/, function (m) { return m[1] + " days ago"; }],
    [/^(\d+)\s+dk okuma$/, function (m) { return m[1] + " min read"; }],
    [/^(\d+)\s+dk$/, function (m) { return m[1] + "m"; }],
    [/^(\d+)\s+sa$/, function (m) { return m[1] + "h"; }],
    [/^(\d+)\s+gün$/, function (m) { return m[1] + "d"; }],
    [/^(\d+)\s+sn$/, function (m) { return m[1] + "s"; }],
    [/^(\d+)\s+fotoğraf$/, function (m) { return m[1] + " photos"; }],
    [/^(\d+)\s+fotoğraflı haber$/, function (m) { return m[1] + "-photo story"; }],
    [/^([\d.,]+)\s+haber$/, function (m) { return m[1] + " articles"; }],
    [/^([\d.,]+)\s+kategori$/, function (m) { return m[1] + " categories"; }],
    [/^([\d.,]+)\s+konu$/, function (m) { return m[1] + " topics"; }],
    [/^([\d.,]+)\s+dosya$/, function (m) { return m[1] + " stories"; }],
    [/^Sayfa (\d+)$/, function (m) { return "Page " + m[1]; }],
    [/^(.+) Haberleri$/, function (m) {
      if (m[1] === "Son Dakika" || m[1] === "Tüm") return null;
      var ad = SOZLUK[m[1]];
      return ad ? ad + " News" : null;
    }],
    [/^Sayfa (\d+)\/(\d+)$/, function (m) { return "Page " + m[1] + "/" + m[2]; }],
    [/^([\d.,]+) haber · Sayfa (\d+)\/(\d+)$/, function (m) {
      return m[1] + " articles · Page " + m[2] + "/" + m[3];
    }],
    [/^Tüm Haberler \((\d+)\)$/, function (m) { return "All News (" + m[1] + ")"; }],
    [/^Tüm Haberler \((\d+)\)\s*→$/, function (m) { return "All News (" + m[1] + ") →"; }],
    [/^Son 24 saatte ([\d.,]+) haber yayına alındı\. Hat dakikalar içinde taranır\.$/, function (m) {
      return m[1] + " articles published in the last 24 hours. The feed scans within minutes.";
    }],
    [/^(.+) takipte$/, function (m) { return "Following " + m[1]; }],
    [/^Son güncelleme: (.+)$/, function (m) { return "Last updated: " + m[1]; }],
    [/^Güncelleme: (.+)$/, function (m) { return "Updated: " + m[1]; }],
    [/^© (\d{4}) HaberinAi — Tüm hakları saklıdır\.$/, function (m) {
      return "© " + m[1] + " HaberinAi — All rights reserved.";
    }],
    [/^Palet: (.+)\. Değiştir$/, function (m) {
      return "Palette: " + (SOZLUK[m[1]] || m[1]) + ". Change";
    }],
    [/^Palet: (.+) — sıradaki: (.+)$/, function (m) {
      return "Palette: " + (SOZLUK[m[1]] || m[1]) + " — next: " + (SOZLUK[m[2]] || m[2]);
    }],
    [/^(.+) kategorisinde yeni haber çıkınca bildirim al$/, function (m) {
      return "Get notified about new stories in " + m[1];
    }],
    [/^(.+) son bir aylık grafik$/, function (m) { return m[1] + " — 1-month chart"; }],
    [/^(.+) profilini gör$/, function (m) { return "View " + m[1] + "'s profile"; }],
    [/^Yanıtla: (.+) yorumuna yanıt yaz$/, function (m) {
      return "Reply to " + m[1];
    }],
    [/^(.+) ile paylaş$/, function (m) { return "Share on " + m[1]; }],
    [/^(\d+)\. slayt: (.+)$/, function (m) { return "Slide " + m[1] + ": " + m[2]; }],
    [/^(\d+)\s+üye · (\d+)\s+misafir$/, function (m) {
      return m[1] + " members · " + m[2] + " guests";
    }],
    [/^Açık: son dakika \+ (\d+) konu( · cihaz (.+))?$/, function (m) {
      return "On: breaking news + " + m[1] + " topics" + (m[2] || "");
    }],
    [/^Açık: son dakika haberleri( · cihaz (.+))?$/, function (m) {
      return "On: breaking news" + (m[1] || "");
    }],
    [/^Açık: (\d+) takip edilen konu( · cihaz (.+))?$/, function (m) {
      return "On: " + m[1] + " followed topics" + (m[2] || "");
    }],
  ];

  /* Sayfa başlığı: yalnızca site/arayüz başlıkları çevrilir. Haber başlığı
     (makale sayfası) Türkçe kalır; içerik diliyle tutarlı olsun. */
  var BASLIKLAR = {
    "HaberinAi — Son Dakika Haberleri, Teknoloji ve Yapay Zekâ":
      "HaberinAi — Breaking News, Technology and AI",
    "HaberinAi - Son Dakika Haberleri, Teknoloji ve Yapay Zekâ":
      "HaberinAi — Breaking News, Technology and AI",
    "Son Dakika Haberleri — Anlık Gelişmeler | HaberinAi":
      "Breaking News — Live Updates | HaberinAi",
    "Öne Çıkanlar — HaberinAi arşiv seçkisi":
      "Featured — HaberinAi archive selection",
    "Piyasa — Borsa, Dolar, Altın ve Emtia — HaberinAi":
      "Markets — Stocks, USD, Gold and Commodities — HaberinAi",
    "Shorts Haber — kısa kısa haberler | HaberinAi":
      "Shorts News — quick news | HaberinAi",
    "Giriş / Kayıt — HaberinAi": "Sign in / Sign up — HaberinAi",
    "Haber Ara — HaberinAi": "Search News — HaberinAi",
  };

  var BASLIK_KURALLARI = [
    [/^Öne Çıkanlar\s+(?:—|-)\s+Sayfa (\d+)\s+(?:—|-)\s+HaberinAi$/, function (m) {
      return "Featured — Page " + m[1] + " — HaberinAi";
    }],
    [/^Tüm Haberler\s+(?:—|-)\s+Sayfa (\d+)\s+(?:—|-)\s+HaberinAi$/, function (m) {
      return "All News — Page " + m[1] + " — HaberinAi";
    }],
    [/^(.+?) Haberleri\s+(?:—|-)\s+Sayfa (\d+)\s+(?:—|-)\s+HaberinAi$/, function (m) {
      var ad = SOZLUK[m[1]];
      return ad ? ad + " News — Page " + m[2] + " — HaberinAi" : null;
    }],
    [/^(.+?) Haberleri\s+(?:—|-)\s+HaberinAi$/, function (m) {
      var ad = SOZLUK[m[1]];
      return ad ? ad + " News — HaberinAi" : null;
    }],
    [/^(.+?) Shorts\s+—\s+kısa kısa haberler\s+\|\s+HaberinAi$/, function (m) {
      var ad = SOZLUK[m[1]];
      return ad ? ad + " Shorts — quick news | HaberinAi" : null;
    }],
  ];

  var OZGUN_BASLIK = null;

  function baslikCevir() {
    if (OZGUN_BASLIK === null) OZGUN_BASLIK = document.title;
    var t = OZGUN_BASLIK;
    if (!t) return;
    if (sahip(BASLIKLAR, t)) {
      document.title = BASLIKLAR[t];
      return;
    }
    var i, m, yeni;
    for (i = 0; i < BASLIK_KURALLARI.length; i++) {
      m = t.match(BASLIK_KURALLARI[i][0]);
      if (m) {
        yeni = BASLIK_KURALLARI[i][1](m);
        if (yeni) {
          document.title = yeni;
          return;
        }
      }
    }
    /* "Hakkımızda — HaberinAi" gibi statik başlıklar: öneki sözlükle çevir.
       Haber başlıkları eşleşmediği için olduğu gibi kalır. */
    var ayraclar = [" — HaberinAi", " - HaberinAi", " | HaberinAi"];
    for (i = 0; i < ayraclar.length; i++) {
      var yer = t.lastIndexOf(ayraclar[i]);
      if (yer > 0) {
        yeni = cevir(t.slice(0, yer));
        if (yeni) document.title = yeni + ayraclar[i];
        return;
      }
    }
  }

  function baslikGeri() {
    if (OZGUN_BASLIK !== null) document.title = OZGUN_BASLIK;
  }

  function sahip(o, k) {
    return Object.prototype.hasOwnProperty.call(o, k);
  }

  function duz(s) {
    return String(s).replace(/\s+/g, " ").trim();
  }

  function ayCevir(s) {
    return s.replace(
      /\b(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\b/g,
      function (m) {
        return AYLAR[m] || m;
      }
    );
  }

  /** Metni İngilizceye çevirir; eşleşme yoksa null. */
  function cevir(metin) {
    var d = duz(metin);
    if (!d) return null;
    if (sahip(SOZLUK, d)) return SOZLUK[d];

    var i, m;
    for (i = 0; i < KURALLAR.length; i++) {
      m = d.match(KURALLAR[i][0]);
      if (m) return KURALLAR[i][1](m);
    }

    // Tarihler: "27 Ekim 2026" / "27 Ekim 2026, 14:35"
    m = d.match(/^(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4})(?:,?\s+(\d{2}:\d{2}))?$/);
    if (m) {
      return (AYLAR[m[2]] || m[2]) + " " + m[1] + ", " + m[3] + (m[4] ? ", " + m[4] : "");
    }

    // Tarih içeren diğer kısa etiketler (ör. "Son güncelleme: 27 Ekim 2026")
    if (/\b(?:Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\b/.test(d)) {
      return ayCevir(d)
        .replace(/^(\d{1,2}) (\w+) (\d{4})$/, "$2 $1, $3");
    }

    return null;
  }

  /* --- Metin düğümü çevirisi ------------------------------------------- */
  var BELLEK = typeof WeakMap === "function" ? new WeakMap() : null;
  var DOKUNULAN = [];
  var NITELIKLER = [];
  var GOZLEMCI = null;
  var dil = "tr";

  function atlaMi(el) {
    try {
      return !!(el && el.closest && el.closest(ATLA));
    } catch (e) {
      return false;
    }
  }

  function dugumCevir(n) {
    if (!n || n.nodeType !== 3 || !BELLEK) return;
    var simdi = n.nodeValue;
    if (!simdi || !simdi.trim()) return;
    if (atlaMi(n.parentElement)) return;

    var kayit = BELLEK.get(n);
    if (kayit) {
      // Kendi yazdığımız çeviri hâlâ duruyorsa dokunma (sonsuz döngü koruması).
      if (simdi === kayit.a) return;
      // Dışarıdan yeni bir metin geldiyse yeni özgün metin say.
      if (simdi !== kayit.o) kayit.o = simdi;
    } else {
      kayit = { o: simdi, a: null };
      BELLEK.set(n, kayit);
    }

    var yeni = cevir(kayit.o);
    if (yeni === null) return;

    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(kayit.o);
    var boslukBas = m ? m[1] : "";
    var boslukSon = m ? m[3] : "";
    n.nodeValue = boslukBas + yeni + boslukSon;
    kayit.a = n.nodeValue;
    if (!kayit.d) {
      kayit.d = true;
      DOKUNULAN.push(n);
    }
  }

  function nitelikCevir(el, ad) {
    if (!el || el.nodeType !== 1 || !BELLEK) return;
    if (ad !== "aria-label" && ad !== "title" && ad !== "placeholder") return;
    if (atlaMi(el)) return;
    var deger = el.getAttribute(ad);
    if (!deger || !deger.trim()) return;

    var kayitlar = BELLEK.get(el);
    if (!kayitlar) {
      kayitlar = {};
      BELLEK.set(el, kayitlar);
    }
    var k = kayitlar[ad];
    if (k) {
      if (deger === k.a) return;
      if (deger !== k.o) k.o = deger;
    } else {
      k = { o: deger, a: null };
      kayitlar[ad] = k;
    }

    var yeni = cevir(k.o);
    if (yeni === null) return;
    el.setAttribute(ad, yeni);
    k.a = yeni;
    if (!kayitlar.__d) {
      kayitlar.__d = true;
      NITELIKLER.push(el);
    }
  }

  function agacCevir(kok) {
    if (!kok) return;
    if (kok.nodeType === 3) {
      dugumCevir(kok);
      return;
    }
    if (kok.nodeType !== 1 && kok.nodeType !== 9) return;
    if (kok.nodeType === 1) {
      if (atlaMi(kok)) return;
      nitelikCevir(kok, "aria-label");
      nitelikCevir(kok, "title");
      nitelikCevir(kok, "placeholder");
    }
    var yuruyen = document.createTreeWalker(kok, NodeFilter.SHOW_TEXT, null, false);
    var n;
    var liste = [];
    while ((n = yuruyen.nextNode())) liste.push(n);
    for (var i = 0; i < liste.length; i++) dugumCevir(liste[i]);
    if (kok.nodeType === 1) {
      var nitelikli = kok.querySelectorAll("[aria-label], [title], [placeholder]");
      for (var j = 0; j < nitelikli.length; j++) {
        nitelikCevir(nitelikli[j], "aria-label");
        nitelikCevir(nitelikli[j], "title");
        nitelikCevir(nitelikli[j], "placeholder");
      }
    }
  }

  function geriAl() {
    if (GOZLEMCI) {
      GOZLEMCI.disconnect();
      GOZLEMCI = null;
    }
    for (var i = 0; i < DOKUNULAN.length; i++) {
      var n = DOKUNULAN[i];
      var k = BELLEK && BELLEK.get(n);
      if (k && k.a !== null && n.nodeValue === k.a) n.nodeValue = k.o;
      if (k) k.d = false;
    }
    for (var j = 0; j < NITELIKLER.length; j++) {
      var el = NITELIKLER[j];
      var kayitlar = BELLEK && BELLEK.get(el);
      if (!kayitlar) continue;
      ["aria-label", "title", "placeholder"].forEach(function (ad) {
        var kk = kayitlar[ad];
        if (kk && kk.a !== null && el.getAttribute(ad) === kk.a) el.setAttribute(ad, kk.o);
      });
      kayitlar.__d = false;
    }
    DOKUNULAN.length = 0;
    NITELIKLER.length = 0;
  }

  /* --- İçerik dili notu ------------------------------------------------ */
  function uyariGoster() {
    if (document.querySelector(".dil-not")) return;
    var p = document.createElement("p");
    p.className = "dil-not";
    p.setAttribute("data-dil-atla", "");

    /* Haber sayfası: kırıntı yolunun hemen altı. */
    var crumb = document.querySelector(".post .crumbs");
    if (crumb && crumb.parentNode) {
      p.innerHTML =
        '<span aria-hidden="true">🌐</span> <strong>Interface in English.</strong> ' +
        "News articles are published in Turkish.";
      crumb.parentNode.insertBefore(p, crumb.nextSibling);
      return;
    }

    /* Kurumsal/bilgi sayfaları: başlığın hemen altı. */
    var kap = document.querySelector(
      ".kurumsal, .prose, .kunye, .ilkeler, .reklam, .iletisim, .premium-sayfa"
    );
    if (!kap) return;
    var h1 = kap.querySelector("h1");
    if (!h1) return;
    var ust = kap.querySelector(".kurumsal__ust") || h1.closest("header") || h1;
    if (!ust.parentNode) return;
    p.innerHTML =
      '<span aria-hidden="true">🌐</span> <strong>Interface in English.</strong> ' +
      "This page is published in Turkish.";
    ust.parentNode.insertBefore(p, ust.nextSibling);
  }

  function uyariKaldir() {
    var el = document.querySelector(".dil-not");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  /* --- Düğmeler -------------------------------------------------------- */
  var GLOBE =
    '<svg class="dil-btn__ikon" viewBox="0 0 24 24" width="15" height="15" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="8.5"/>' +
    '<path d="M3.5 12h17"/>' +
    '<path d="M12 3.5c2.5 2.4 3.8 5.3 3.8 8.5s-1.3 6.1-3.8 8.5c-2.5-2.4-3.8-5.3-3.8-8.5S9.5 5.9 12 3.5z"/>' +
    "</svg>";

  function dugmeleriKur() {
    var yerler = document.querySelectorAll("[data-dil-sec]");
    for (var i = 0; i < yerler.length; i++) {
      var yer = yerler[i];
      if (yer.querySelector("[data-dil-btn]")) continue;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "dil-btn";
      b.setAttribute("data-dil-btn", "");
      b.setAttribute("data-dil-atla", "");
      b.innerHTML =
        GLOBE +
        '<span class="dil-btn__kod" data-dil-kod>EN</span>' +
        '<span class="dil-btn__ad" data-dil-ad>English</span>';
      yer.appendChild(b);
    }
    /* Düğmeler artık sunucuda da basılıyor (DilDugme.astro); bu yüzden
       yalnızca yeni eklenenlere değil, davranışı henüz bağlanmamış tüm
       düğmelere tıklama eklenir. */
    var dugmeler = document.querySelectorAll("[data-dil-btn]");
    for (var j = 0; j < dugmeler.length; j++) {
      if (dugmeler[j].__dilBagli) continue;
      dugmeler[j].__dilBagli = true;
      dugmeler[j].addEventListener("click", function () {
        dilDegistir(dil === "en" ? "tr" : "en", true);
      });
    }
    dugmeleriGuncelle();
  }

  function dugmeleriGuncelle() {
    var ingilizce = dil === "en";
    var dugmeler = document.querySelectorAll("[data-dil-btn]");
    for (var i = 0; i < dugmeler.length; i++) {
      var b = dugmeler[i];
      var kod = b.querySelector("[data-dil-kod]");
      var ad = b.querySelector("[data-dil-ad]");
      if (kod) kod.textContent = ingilizce ? "TR" : "EN";
      if (ad) ad.textContent = ingilizce ? "Türkçe" : "English";
      // Erişilebilir ad görünen metinden gelir ("EN English"). Ayrı bir
      // aria-label, görünen metni içermediği için ekran okuyucularda
      // uyumsuzluğa yol açıyordu (Lighthouse: label-content-name-mismatch).
      // Eylem ipucu title'da duruyor.
      b.removeAttribute("aria-label");
      b.setAttribute(
        "title",
        ingilizce ? "Arayüzü Türkçeye çevir" : "Switch the interface to English"
      );
    }
  }

  /* --- Uygulama -------------------------------------------------------- */
  function uygula() {
    if (!document.body) return;
    if (dil === "en") {
      agacCevir(document.body);
      baslikCevir();
      uyariGoster();
      if (!GOZLEMCI && typeof MutationObserver === "function") {
        GOZLEMCI = new MutationObserver(function (kayitlar) {
          if (dil !== "en") return;
          for (var i = 0; i < kayitlar.length; i++) {
            var k = kayitlar[i];
            if (k.type === "characterData") {
              dugumCevir(k.target);
            } else if (k.type === "attributes") {
              nitelikCevir(k.target, k.attributeName);
            } else if (k.type === "childList") {
              for (var j = 0; j < k.addedNodes.length; j++) agacCevir(k.addedNodes[j]);
            }
          }
        });
        GOZLEMCI.observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["aria-label", "title", "placeholder"],
        });
      }
    } else {
      geriAl();
      uyariKaldir();
      baslikGeri();
    }
    dugmeleriGuncelle();
  }

  function dilDegistir(yeni, kaydet) {
    dil = yeni === "en" ? "en" : "tr";
    KOK.dataset.dil = dil;
    KOK.lang = dil;
    var og = document.querySelector('meta[property="og:locale"]');
    if (og) og.setAttribute("content", dil === "en" ? "en_US" : "tr_TR");
    if (kaydet) {
      try {
        sessionStorage.setItem(DEPO, dil);
      } catch (e) {}
      // Eski kalıcı tercih kalmasın: sonraki ziyaretler Türkçe başlasın.
      try {
        localStorage.removeItem(DEPO);
      } catch (e) {}
    }
    uygula();
    try {
      document.dispatchEvent(new CustomEvent("hb-dil-degisti", { detail: { dil: dil } }));
    } catch (e) {}
  }

  function baslat() {
    dugmeleriKur();
    var kayitli = "tr";
    try {
      // Varsayılan Türkçe: tercih yalnızca bu sekme oturumunda yaşar.
      if (sessionStorage.getItem(DEPO) === "en") kayitli = "en";
      localStorage.removeItem(DEPO);
    } catch (e) {}
    dil = kayitli;
    if (dil === "en") {
      KOK.dataset.dil = "en";
      KOK.lang = "en";
      var og = document.querySelector('meta[property="og:locale"]');
      if (og) og.setAttribute("content", "en_US");
      uygula();
    } else {
      KOK.dataset.dil = "tr";
      KOK.lang = "tr";
      dugmeleriGuncelle();
    }
    KOK.classList.remove("dil-bekliyor");
    KOK.classList.add("dil-hazir");
  }

  if (document.body) baslat();
  else document.addEventListener("DOMContentLoaded", baslat);
})();
