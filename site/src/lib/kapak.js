// KAPAK GÖRSELİ GÜVENLİĞİ
//
// TELİF KURALI: Sitede yalnızca telif güvenli görseller gösterilir.
// Kaynak haber sitelerinin og:image'ları ajans lisanslı olabilir (AA, Getty,
// Reuters, DHA...); atıf yazmak kullanım hakkı doğurmaz. Bu yüzden kapak
// adresi şu iki kaynaktan biri olmak zorundadır:
//
//   1) Wikimedia Commons (upload.wikimedia.org / thumb.wikimedia.org) —
//      CC0 / kamu malı / CC BY / CC BY-SA lisanslı, atfı veride kayıtlı.
//   2) Sitenin kendi yerel görseli (/... yolu).
//
// Bunun dışındaki her adres reddedilir ve markalı kapak (/og-default.png)
// gösterilir.
//
// İkinci denetim: Commons dosyaları da onlarca habere kapak olabilir. Aynı
// kare 500'den fazla haberde kullanılırsa "genel görsel" sayılır ve elenir.
import { getArticles, imageUrl } from "./articles.js";

// İzinli kaynaklar: yalnızca Wikimedia ve yerel yollar.
const GUVENLI_UZAK = /^https:\/\/(upload|thumb)\.wikimedia\.org\//i;
const YEREL = /^\/(?!\/)/;

/** Görsel adresi telif güvenli mi? */
export function guvenliGorselMi(url) {
  const s = String(url || "").trim();
  if (!s) return false;
  return YEREL.test(s) || GUVENLI_UZAK.test(s);
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
