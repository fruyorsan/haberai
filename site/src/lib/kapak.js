// KAPAK GÖRSELİ GÜVENLİĞİ
//
// Kaynak sitelerin RSS/haber sayfalarındaki görseller her zaman doğru değildir.
// İki sorun tespit edildi ve ikisi de burada elenir:
//
//   1) GENEL / YER TUTUCU GÖRSEL: Bazı siteler tek bir "haber görseli" dosyasını
//      onlarca habere kapak yapıyor (ör. Sözcü'nün `habergorseli….png` dosyası 30+
//      haberde). Aynı fotoğrafı farklı haberlerde göstermek okuyucuya "saçma"
//      görünür; bu yüzden bir görsel arşivde TEKRAR_ESIGI'nden çok habere kapak
//      olmuşsa ya da dosya adı yer tutucu desenindeyse gösterilmez.
//
//   2) BAŞKA HABERİN FOTOĞRAFI: RSS bazen komşu bir haberin fotoğrafını veriyor
//      (ör. "İbrahim Sadri'nin gösterisi" haberinde Kerem Görsev konserinin
//      fotoğrafı). Dosya adı haberin kendi başlığı/adresiyle hiç örtüşmüyorsa
//      fotoğraf gösterilmez.
//
// Eleme kararı verilen yerde sırayla şunlar denenir: habere AI ile toplanmış
// DOĞRULANMIŞ ek fotoğraf (src/ek-gorsel.mjs) → markalı kapak görseli
// (/og-default.png). Böylece hiçbir durumda yanlış fotoğraf gösterilmez.
import { getArticles, imageUrl } from "./articles.js";

// Dosya adında geçen yer tutucu/logo desenleri
const YER_TUTUCU =
  /(habergorseli|haber-?gorseli|default|placeholder|no-?image|noimage|resim-?yok|kapak-?yok|generic|blank|dummy|son-?dakika\.?jpe?g)/i;

// Aynı görsel kaç habere kapak olursa "genel görsel" sayılır?
// (3-4 kez tekrar edenler genelde aynı olayı anlatan haberler olur; 5+ tekrar
// pratikte hep yer tutucu çıkıyor.)
const TEKRAR_ESIGI = 5;

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

/** Karşılaştırma için anlamlı sözcükler (4+ harf). */
function kelimeler(metin) {
  return String(metin || "")
    .toLowerCase()
    .replace(/[^a-z0-9ğüşıöç ]+/g, " ")
    .split(/\s+/)
    .filter((k) => k.length >= 4 && !/^\d+$/.test(k));
}

/**
 * Bulanık sözcük eşleşmesi: "beykozdaki" ~ "beykozda", "valisi" ~ "vali".
 * Uzun ortak önek yeterli sayılır; böylece Türkçe ekler yüzünden gerçek
 * fotoğraf yanlışlıkla elenmez.
 */
function benzer(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  if (i >= 6) return true;
  if (i >= 5 && (a.length === i || b.length === i)) return true;
  return false;
}

/** Dosya adındaki "haber başlığı gibi" parçalar (harf-only, 3+ harf). */
function dosyaParcalari(url) {
  let ad = "";
  try {
    ad = decodeURIComponent(String(url).split("/").pop() || "");
  } catch {
    ad = String(url).split("/").pop() || "";
  }
  return ad
    .replace(/\?.*$/, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .split(/[-_+]+/)
    .filter((p) => /^[a-zğüşıöç]{3,}$/.test(p));
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
  if (!url || !/^https?:\/\//i.test(String(url))) return false;
  const ham = String(url);

  // 1) Dosya adı yer tutucu/logo deseninde mi?
  if (YER_TUTUCU.test(ham)) return false;

  // 2) Aynı görsel arşivde çok kez kullanılmış mı? (genel görsel)
  //    Bu haberin kendi kapağı da sayıya dahil olduğu için eşik "kaç haberde
  //    geçiyor" sorusuna cevap verir.
  if ((tekrarSayaci().get(kimlik(ham)) || 0) >= TEKRAR_ESIGI) return false;

  // 3) Dosya adı başka bir haberin başlığı gibi mi?
  const parcalar = dosyaParcalari(ham);
  if (parcalar.length >= 3) {
    const kendi = [
      ...kelimeler(article?.title),
      ...kelimeler(article?.slug),
      ...kelimeler(article?.sourceUrl),
    ];
    const eslesen = parcalar.some((p) => kendi.some((k) => benzer(p, k)));
    if (!eslesen) return false;
  }

  return true;
}

/**
 * Haber için gösterilecek fotoğrafın KAYNAK adresi.
 * Boş dönerse çağıran taraf markalı kapağı (/og-default.png) kullanmalıdır.
 */
export function kapakKaynagi(article) {
  const adaylar = [
    article?.image,
    ...(Array.isArray(article?.images) ? article.images : []),
  ];
  for (const aday of adaylar) {
    if (kapakUygunMu(article, aday)) return String(aday);
  }
  return "";
}

/** Gösterime hazır kapak adresi (CDN'den geçirilmiş); yoksa markalı kapak. */
export function kapakGorseli(article, genislik = 640) {
  const kaynak = kapakKaynagi(article);
  return kaynak ? imageUrl(kaynak, genislik) : "/og-default.png";
}
