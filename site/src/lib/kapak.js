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
  /(habergorseli|haber-?gorseli|default|placeholder|no-?image|noimage|resim-?yok|kapak-?yok|generic|blank|dummy|son-?dakika\.?jpe?g|tv-hizlandirma|iphone-18-pro-inceleme|elon-musk-openai-satin-alma-teklifi)/i;

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

/** Karşılaştırma için anlamlı sözcükler (3+ harf). */
function kelimeler(metin) {
  return String(metin || "")
    .toLowerCase()
    .replace(/[^a-z0-9ğüşıöç ]+/g, " ")
    .split(/\s+/)
    .filter((k) => k.length >= 3 && !/^\d+$/.test(k));
}

/**
 * Bulanık sözcük eşleşmesi: "beykozdaki" ~ "beykozda", "valisi" ~ "vali".
 * Uzun ortak önek yeterli sayılır; böylece Türkçe ekler yüzünden gerçek
 * fotoğraf yanlışlıkla elenmez.
 */
function benzer(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  if (i >= 5) return true;
  if (i >= 4 && (a.length === i || b.length === i)) return true;
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
    .split(/[-_+.]+/)
    .filter((p) => /^[a-zğüşıöç0-9]{3,}$/i.test(p));
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

/** Bu görsel, telif güvenli stok hattından mı geliyor? (bkz. src/stok-gorsel.js) */
function stokGorselMi(article, url) {
  const ham = String(url || "");
  if (!article?.gorselKaynak) {
    // Eski kayıtlarda gorselKaynak yok; gorselEk varsa yine stoktur.
    return Array.isArray(article?.gorselEk) && article.gorselEk.some((g) => String(g?.url) === ham);
  }
  if (String(article.image || "") === ham) return true;
  return Array.isArray(article.gorselEk) && article.gorselEk.some((g) => String(g?.url) === ham);
}

/** Verilen görsel bu haber için gösterilebilir mi? */
export function kapakUygunMu(article, url) {
  if (!url || !/^https?:\/\//i.test(String(url))) return false;
  const ham = String(url);

  // 1) Dosya adı yer tutucu/logo deseninde mi?
  if (YER_TUTUCU.test(ham)) return false;

  // 2) LİSANSLI STOK FOTOĞRAF: Commons dosya adları Türkçe haber başlığıyla
  //    eşleşmez; "başka haberin fotoğrafı" kuralı burada anlamsızdır. Fotoğraf
  //    zaten habere özel arama sonucu seçildi ve lisansı/atfı kayıtlı.
  //    Yalnızca aynı karenin onlarca haberde tekrarlanması engellenir.
  if (stokGorselMi(article, ham)) {
    return (tekrarSayaci().get(kimlik(ham)) || 0) < 500;
  }

  // 2b) KAYNAĞIN KENDİ GÖRSELİ: haber sayfasının og:image'ı indirilip boyutu
  //     ve oranı doğrulandı (bkz. src/gorsel.js). Bu görsel haberin kendi
  //     kapağıdır; dosya adı Türkçe başlıkla eşleşmek zorunda değil.
  //     Yalnızca yer tutucu deseni ve aşırı tekrar elenir.
  if (article?.gorselKaynakSite) {
    return (tekrarSayaci().get(kimlik(ham)) || 0) < TEKRAR_ESIGI;
  }

  // 3) Aynı görsel arşivde çok kez kullanılmış mı? (genel görsel)
  //    Bu haberin kendi kapağı da sayıya dahil olduğu için eşik "kaç haberde
  //    geçiyor" sorusuna cevap verir.
  if ((tekrarSayaci().get(kimlik(ham)) || 0) >= TEKRAR_ESIGI) return false;

  // 4) Dosya adı başka bir haberin başlığı gibi mi?
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
    if (kapakUygunMu(article, aday)) {
      return String(aday)
        .replace(/&amp;/g, "&")
        .replace(/\/(1400|1600|1920)px-/i, "/1280px-");
    }
  }
  return "";
}

/** Gösterime hazır kapak adresi (CDN'den geçirilmiş); yoksa markalı kapak. */
export function kapakGorseli(article, genislik = 800) {
  const kaynak = kapakKaynagi(article);
  return kaynak ? imageUrl(kaynak, genislik) : "/og-default.png";
}
