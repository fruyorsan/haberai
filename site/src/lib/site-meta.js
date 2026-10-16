// Site geneli kimlik bilgileri tek yerden yönetilir.
//
// ALAN ADI ALINDIĞINDA YAPILACAKLAR (başka hiçbir dosyaya dokunmak gerekmez):
//   1) astro.config.mjs → "site" değerini yeni adres yap
//   2) site/public/CNAME dosyasına adresi yaz (GitHub Pages özel alan adı)
// Kanonik adresler, RSS, site haritaları ve robots.txt bu değerden türetilir.

/**
 * Astro'nun `site` değerinden sonda eğik çizgi olmayan kök adresi üretir.
 * ayrıca SITE_URL ortam değişkeniyle geçersiz kılınabilir.
 */
export function siteOrigin(astroSite) {
  const raw = process.env.SITE_URL || astroSite || "https://haberinai.com.tr";
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
