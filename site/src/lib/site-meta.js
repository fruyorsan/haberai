// Site geneli kimlik bilgileri tek yerden yönetilir.
//
// ALAN ADI (haberinai.com.tr) DURUMU:
//   Kod varsayılanı alan adıdır; kanonik adresler, RSS, site haritaları ve
//   robots.txt buradan (astro.config.mjs → site) türetilir.
//
//   CNAME dosyası ise yalnızca repoda CUSTOM_DOMAIN GitHub Actions değişkeni
//   tanımlıysa yazılır. Bu bilerek böyledir: alan adı DNS'te yayına girmeden
//   CNAME eklenirse GitHub Pages, fruyorsan.github.io adresini çözülemeyen
//   alan adına yönlendirir ve site erişilemez olur.
//
// YAYINA ALMA (DNS kayıtları eklendikten ve alan adı çözülmeye başladıktan
// sonra, tek adım):
//   node scripts/domain-durum.mjs --acikla
// Ya da elle: gh variable set CUSTOM_DOMAIN --body "haberinai.com.tr"
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
 * AdSense hesabı onaylandığında: AdSense panelinden "pub-..." numarasını al ve
 * buradaki değeri onunla değiştir. Boşken reklam kodu HİÇ eklenmez
 * (onaysız siteye reklam kodu koymak gereksiz hata üretir).
 */
export const ADSENSE_CLIENT = process.env.ADSENSE_CLIENT || "";

/** AdSense ads.txt için Google'ın sertifika kimliği (değiştirilmez). */
export const ADSENSE_CERT = "f08c47fec0942fa0";

/** Google Search Console doğrulama kodları (meta etiketi). */
export const GOOGLE_SITE_VERIFICATIONS = [
  "ggR0XXQqS9LfHsa8LHxOs2uZsTjEL__uia6pYrA7X6I",
  process.env.GOOGLE_SITE_VERIFICATION || "0txYR2AQdV9F9DdPhBtDSxs4PWnFvNyBUBXXix7m2Ck",
].filter(Boolean);
export const GOOGLE_SITE_VERIFICATION = GOOGLE_SITE_VERIFICATIONS[0];

/** Google Analytics (GA4) ölçüm kimliği. */
export const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || "G-C9BGECSKCM";
