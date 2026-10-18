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
