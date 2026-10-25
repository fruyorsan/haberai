// Site geneli kimlik bilgileri tek yerden yönetilir.
//
// ALAN ADI DURUMU:
//   Şu an yayında: haberinai.site — SITE_URL ve CUSTOM_DOMAIN GitHub Actions değişkeni
//   olarak tanımlı (DNS: Cloudflare, HTTPS zorunlu, www → apex 301).
//
//   Kod varsayılanı, değişken yoksa kullanılan adrestir (fruyorsan.github.io): kanonik
//   adresler, RSS, site haritaları ve robots.txt astro.config.mjs → site değerinden
//   türetilir. Alan adı değişince tek adım:
//     gh variable set SITE_URL --body "https://yeni-adres"
//
//   CNAME dosyası ise yalnızca repoda CUSTOM_DOMAIN GitHub Actions değişkeni
//   tanımlıysa yazılır. Bu bilerek böyledir: alan adı DNS'te yayına girmeden
//   CNAME eklenirse GitHub Pages, fruyorsan.github.io adresini çözülemeyen
//   alan adına yönlendirir ve site erişilemez olur.
//
// YAYINA ALMA (DNS kayıtları eklendikten ve alan adı çözülmeye başladıktan
// sonra, tek adım):
//   node scripts/domain-durum.mjs --acikla
// Ya da elle: gh variable set CUSTOM_DOMAIN --body "haberinai.site"
//             gh workflow run pipeline.yml
// Geri alma: gh variable delete CUSTOM_DOMAIN  (+ Pages ayarından alan adını kaldır)

/**
 * Astro'nun `site` değerinden sonda eğik çizgi olmayan kök adresi üretir.
 * ayrıca SITE_URL ortam değişkeniyle geçersiz kılınabilir.
 */
export function siteOrigin(astroSite) {
  const raw = process.env.SITE_URL || astroSite || "https://fruyorsan.github.io";
  return String(raw).replace(/\/+$/, "");
}

/** İletişim adresi. */
export const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "haberai@yahoo.com";

/**
 * YAYINCI KİMLİĞİ (E-E-A-T / AdSense şeffaflığı)
 * ------------------------------------------------
 * Künyede görünen "sorumlu yayıncı" bilgisi. Gerçek kişi ve adres bilgisi
 * GitHub deposu değişkenleriyle verilir; kod değişikliği gerekmez:
 *   gh variable set PUBLISHER_NAME    --body "Ad Soyad"
 *   gh variable set PUBLISHER_ADDRESS --body "Mahalle, Cadde No, İlçe"
 *   gh variable set PUBLISHER_CITY    --body "İstanbul"
 *   gh variable set PUBLISHER_PHONE   --body "+90 5xx xxx xx xx"
 *
 * Tanımlanmazsa "HaberinAi Editör Masası" gösterilir; uydurma kişi adı
 * YAZILMAZ.
 */
export const PUBLISHER = {
  ad: String(process.env.PUBLISHER_NAME || "").trim() || "HaberinAi Editör Masası",
  adres: String(process.env.PUBLISHER_ADDRESS || "").trim(),
  sehir: String(process.env.PUBLISHER_CITY || "").trim() || "Türkiye",
  telefon: String(process.env.PUBLISHER_PHONE || "").trim(),
  eposta: CONTACT_EMAIL,
};

/**
 * Sosyal kanal adresleri (opsiyonel).
 *
 * Hepsi boşken sitede hiçbir sosyal bağlantı basılmaz; böylece hesap açılmadan
 * kırık "Telegram'da takip et" düğmesi görünmez. Kanal açıldığında GitHub
 * değişkeni olarak tanımlanır ve bir sonraki derlemede footer + schema'ya girer:
 *   gh variable set TELEGRAM_URL --body "https://t.me/haberinai"
 *   gh variable set X_URL --body "https://x.com/haberinai"
 *   gh variable set BLUESKY_URL --body "https://bsky.app/profile/haberinai.bsky.social"
 */
const sosyalAdres = (value) => String(value || "").trim().replace(/\/+$/, "");

export const TELEGRAM_URL = sosyalAdres(process.env.TELEGRAM_URL);
export const X_URL = sosyalAdres(process.env.X_URL);
export const BLUESKY_URL = sosyalAdres(process.env.BLUESKY_URL);

export const SOSYAL_LINKLER = [
  { ad: "Telegram", url: TELEGRAM_URL },
  { ad: "X", url: X_URL },
  { ad: "Bluesky", url: BLUESKY_URL },
].filter((x) => x.url);

/**
 * AdSense yayıncı kimliği (ör. "ca-pub-1234567890123456").
 *
 * Boşken reklam kodu ve reklam alanları HİÇ eklenmez; onaysız siteye reklam
 * koymanın anlamı yoktur ve boş kutu görüntüsü oluşur.
 *
 * Yayına alma (kod değişikliği gerekmez, depo değişkenleri yeter):
 *   gh variable set ADSENSE_CLIENT --body "ca-pub-XXXXXXXXXXXXXXXX"
 *   gh variable set ADSENSE_SLOT_MAKALE --body "<haber içi birim no>"
 *   gh variable set ADSENSE_SLOT_LISTE  --body "<liste altı birim no>"
 */
export const ADSENSE_CLIENT = process.env.ADSENSE_CLIENT || "";

/** Reklam birimi (slot) kimlikleri; AdSense panelinden alınır. */
export const ADSENSE_SLOTS = {
  makale: process.env.ADSENSE_SLOT_MAKALE || "",
  /** Gövde ortası ("in-article" birimi; ShiftDelete tarzı içerik içi yerleşim) */
  makale2: process.env.ADSENSE_SLOT_MAKALE2 || "",
  liste: process.env.ADSENSE_SLOT_LISTE || "",
};

/** AdSense ads.txt için Google'ın sertifika kimliği (değiştirilmez). */
export const ADSENSE_CERT = "f08c47fec0942fa0";

/** Google Search Console doğrulama kodları (meta etiketi). */
export const GOOGLE_SITE_VERIFICATIONS = [
  "ggR0XXQqS9LfHsa8LHxOs2uZsTjEL__uia6pYrA7X6I",
  "VH0iGNX29HpGO68Xp4s9CPmbvpF98xZtKRmpJ5wO6d0",
  process.env.GOOGLE_SITE_VERIFICATION || "0txYR2AQdV9F9DdPhBtDSxs4PWnFvNyBUBXXix7m2Ck",
].filter(Boolean);
export const GOOGLE_SITE_VERIFICATION = GOOGLE_SITE_VERIFICATIONS[0];

/** Google Analytics (GA4) ölçüm kimliği. */
export const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || "G-C9BGECSKCM";

/**
 * Yorumlar — Supabase (Postgres + REST) üzerinde, site içinde.
 *
 * NEDEN: giscus/utterances okuyucudan GitHub hesabı istiyordu. Burada hesap
 * YOK: okuyucu yalnızca bir takma ad yazıp yorum bırakır. Site statik kalır;
 * yorumlar Supabase'in ücretsiz katmanındaki `yorumlar` tablosunda durur ve
 * tarayıcıdan doğrudan REST ile okunur/yazılır (RLS ile korunur).
 *
 * ANAHTAR GİZLİ DEĞİLDİR: Supabase "anon" anahtarı tarayıcıya yazılmak için
 * üretilir; güvenlik Row Level Security politikalarıyla sağlanır (bkz.
 * supabase/yorumlar.sql). Boşsa yorum kutusu yerine sessiz not görünür.
 *
 * Kurulum (tek sefer):
 *   1) supabase.com → yeni ücretsiz proje
 *   2) SQL Editor → supabase/yorumlar.sql içeriğini çalıştır
 *   3) gh variable set YORUM_URL   --body "https://<proje>.supabase.co"
 *      gh variable set YORUM_ANON  --body "<anon public key>"
 */
export const YORUM = {
  url: String(process.env.YORUM_URL || "").replace(/\/+$/, ""),
  anahtar: String(process.env.YORUM_ANON || ""),
  tablo: "yorumlar",
};

/**
 * OneSignal App ID (web push / bildirimler).
 *
 * App ID gizli bir anahtar DEĞİLDİR; sitenin OneSignal kimliğidir ve tarayıcıya
 * açıkça yazılır (REST API anahtarı ise gizlidir, yalnızca workflow'da durur).
 *
 * Alt yapı:
 *   - SDK: site/src/layouts/Base.astro (<head>, appId ile init)
 *   - Service worker: site/public/OneSignalSDKWorker.js (kök kapsam)
 *   - Zil + "kategoriyi takip et": site/src/components/Bildirim.astro
 *   - Gönderim: src/bildirim.js (workflow içinde çalışır)
 *
 * Değiştirmek için: gh variable set ONESIGNAL_APP_ID --body "yeni-app-id"
 */
export const ONESIGNAL_APP_ID =
  process.env.ONESIGNAL_APP_ID || "fd1804a3-90d0-4c95-9bf0-c147f9a1d0c7";

/**
 * OKUYUCU HESABI — Supabase üzerinde kullanıcı adı + şifre (supabase/hesap.sql).
 *
 * Yorumlarla AYNI Supabase projesini kullanır; bu yüzden ayrı bir değişkene
 * gerek yoktur (YORUM_URL / YORUM_ANON). Kod tarafında yalnızca kullanım amacı
 * ayrışsın diye HESAP adı altında yeniden verilir.
 */
export const HESAP = {
  url: String(process.env.YORUM_URL || "").replace(/\/+$/, ""),
  anahtar: String(process.env.YORUM_ANON || ""),
};

/**
 * Lemon Squeezy Abonelik ve Paket Ödeme Bağlantıları
 */
export const LEMON_SQUEEZY = {
  storeUrl: process.env.LEMON_STORE_URL || "https://haberinai.lemonsqueezy.com",
  premiumCheckoutUrl: process.env.LEMON_PREMIUM_URL || "https://haberinai.lemonsqueezy.com/buy/premium",
  vipCheckoutUrl: process.env.LEMON_VIP_URL || "https://haberinai.lemonsqueezy.com/buy/vip",
};

/**
 * İlgi alanı seçicide gösterilen kategoriler: TÜM kategoriler her zaman
 * listelenir (o an haberi olmayan bir kategori de seçilebilsin). Slug'lar
 * site/src/lib/articles.js → slugify ile birebir aynı olmalıdır.
 */
/**
 * Hazır profil fotoğrafları: yapay zekâ ile üretilmiş, yumuşak anime / lo-fi
 * estetiğinde yuvarlak portreler. İnsanlar, hayvanlar ve manzara/objeler.
 * WebP tabanlıdır: 512×512, sayfada yuvarlak kırpılır.
 * Kaynak: scripts/avatar-ai.mjs (AI Horde) + scripts/avatar-pollinations.mjs
 * `kod` doğrudan görsel yolu ya da okuyucunun yüklediği bir görsel adresidir.
 * `renk` seçili çerçevenin vurgu tonudur.
 */
export const AVATARLAR = [
  // Popüler & İkonik Avatarlar
  { kod: "/avatar/po.webp", ad: "Po", renk: "#e8a62b" },
  { kod: "/avatar/tavsan.webp", ad: "Tavşan", renk: "#e4573d" },
  { kod: "/avatar/yavru-kedi.webp", ad: "Yavru Kedi", renk: "#4b83a8" },
  { kod: "/avatar/ordek.webp", ad: "Ördek", renk: "#e8a62b" },
  { kod: "/avatar/kara-kedi.webp", ad: "Kara Kedi", renk: "#d9364b" },
  // Hayvanlar
  { kod: "/avatar/yildizli-kedi.webp", ad: "Yıldızlı Kedi", renk: "#e8a62b" },
  { kod: "/avatar/golden.webp", ad: "Golden", renk: "#e8a62b" },
  { kod: "/avatar/spiderman-cicek.webp", ad: "Çiçekli Spidey", renk: "#d9364b" },
  { kod: "/avatar/pingu.webp", ad: "Pingu", renk: "#e4573d" },
  // Manzara ve objeler
  { kod: "/avatar/zambak.webp", ad: "Zambak Buketi", renk: "#d98a9a" },
  { kod: "/avatar/deniz-manzara.webp", ad: "Deniz Manzarası", renk: "#4b83a8" },
  { kod: "/avatar/ay.webp", ad: "Ay", renk: "#8a6fd1" },
  { kod: "/avatar/mini-jane.webp", ad: "Mini Jane", renk: "#4b83a8" },
  { kod: "/avatar/cicekli-tavsan.webp", ad: "Çiçekli Tavşan", renk: "#d98a9a" },
  { kod: "/avatar/gamepad.webp", ad: "Gamepad", renk: "#4b83a8" },
  { kod: "/avatar/pikachu.webp", ad: "Pikachu", renk: "#e8a62b" },
];

export const KATEGORILER = [
  { ad: "Gündem", slug: "gundem" },
  { ad: "Dünya", slug: "dunya" },
  { ad: "Ekonomi", slug: "ekonomi" },
  { ad: "Spor", slug: "spor" },
  { ad: "Teknoloji", slug: "teknoloji" },
  { ad: "Yapay Zekâ", slug: "yapay-zeka" },
  { ad: "Bilim", slug: "bilim" },
  { ad: "Uzay", slug: "uzay" },
  { ad: "Sağlık", slug: "saglik" },
  { ad: "Kültür", slug: "kultur" },
  { ad: "Yaşam", slug: "yasam" },
  { ad: "Otomobil", slug: "otomobil" },
  { ad: "Mobil", slug: "mobil" },
  { ad: "Donanım", slug: "donanim" },
  { ad: "Yazılım", slug: "yazilim" },
  { ad: "İnternet", slug: "internet" },
  { ad: "Oyun", slug: "oyun" },
];
