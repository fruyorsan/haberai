// KAPAK GÖRSELİ SEÇİMİ
//
// GÖRSEL KURALI: Haberin kendi fotoğrafı kullanılır. Sıra şudur:
//
//   1) Sitenin kendi yerel kapağı (/kapak/... — puanlanarak üretilmiş 1280×720).
//   2) Wikimedia Commons (CC0 / kamu malı / CC BY / CC BY-SA).
//   3) Haberin çıktığı kaynak sitenin og:image'i / yazı içi fotoğrafı.
//
// Kaynak sitelerin fotoğrafları habere özgü oldukları için (stok karelerin
// aksine) başlıkla alakalıdır ve tıklama oranını yükseltir; adres
// `gorselKaynak` alanında kayıtlıdır.
//
// İkinci denetim: aynı kare yüzlerce habere kapak olmuşsa "genel görsel"
// sayılır ve elenir.
import { getArticles, imageUrl } from "./articles.js";

const UZAK = /^https?:\/\//i;
const YEREL = /^\/(?!\/)/;

/** Görsel adresi kullanılabilir mi? (yer tutucu/logo ayrıca elenir) */
export function guvenliGorselMi(url) {
  const s = String(url || "").trim();
  if (!s) return false;
  return YEREL.test(s) || UZAK.test(s);
}

// Dosya adında geçen yer tutucu/logo desenleri
const YER_TUTUCU =
  /(habergorseli|haber-?gorseli|default|placeholder|no-?image|noimage|resim-?yok|kapak-?yok|generic|blank|dummy|son-?dakika\.?jpe?g)/i;

// Aynı görseli kaç habere kadar kapak yapmaya izin verilir?
const TEKRAR_ESIGI = 500;

/** Aynı fotoğrafın farklı boyut sürümlerini eşleştirmek için kimlik. */
function kimlik(url) {
  return String(url || "")
    .toLowerCase()
    .split("?")[0]
    .split("#")[0]
    .replace(/\/resize\/\d+x\d+/, "")
    .replace(/\/\d{2,4}x\d{2,4}\//, "/")
    .replace(/-\d{2,4}x\d{2,4}(?=\.\w+$)/, "")
    .replace(/\.(jpe?g|png|webp|avif|gif)$/, "");
}

let sayacCache = null;

/** Arşivdeki kapak görsellerinin kimlik → kullanım sayısı haritası. */
function tekrarSayaci() {
  if (sayacCache) return sayacCache;
  const harita = new Map();
  for (const a of getArticles()) {
    const k = kimlik(a.image);
    if (k) harita.set(k, (harita.get(k) || 0) + 1);
  }
  sayacCache = harita;
  return harita;
}

/** Verilen görsel bu haber için gösterilebilir mi? */
export function kapakUygunMu(article, url) {
  const ham = String(url || "");
  if (!guvenliGorselMi(ham)) return false;
  if (YER_TUTUCU.test(ham)) return false;
  // Commons dosya adları Türkçe haber başlığıyla eşleşmez; "başka haberin
  // fotoğrafı" kuralı burada anlamsızdır. Yalnızca aşırı tekrar engellenir.
  return (tekrarSayaci().get(kimlik(ham)) || 0) < TEKRAR_ESIGI;
}

/**
 * Haber için gösterilecek fotoğrafın KAYNAK adresi.
 * Boş dönerse çağıran taraf markalı kapağı (/og-default.png) kullanmalıdır.
 */
export function kapakKaynagi(article) {
  const adaylar = [article?.image];
  for (const aday of adaylar) {
    if (kapakUygunMu(article, aday)) {
      return String(aday).replace(/\/(1400|1600|1920)px-/i, "/1280px-");
    }
  }
  return "";
}

/** Gösterime hazır kapak adresi (CDN'den geçirilmiş); yoksa markalı kapak. */
export function kapakGorseli(article, genislik = 800) {
  const kaynak = kapakKaynagi(article);
  return kaynak ? imageUrl(kaynak, genislik) : "/og-default.png";
}
