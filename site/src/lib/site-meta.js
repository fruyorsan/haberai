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
  const raw = process.env.SITE_URL || astroSite || "https://fruyorsan.github.io";
  return String(raw).replace(/\/+$/, "");
}

/** İletişim adresi: AdSense başvurusundan önce gerçek bir adres yazılmalı. */
export const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "info@haberai.netlify.app";
