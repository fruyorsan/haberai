// STOK EK FOTOĞRAF UYGUNLUĞU
//
// Gövde içi ek fotoğrafların bir kısmı Wikimedia Commons'tan otomatik geliyor.
// Arama bazen konuyla ilgisiz bir sonuç döndürüyor (ör. Libya haberi için
// İstanbul şehir fotoğrafı, İran açıklaması için stüdyo ışığı). Bu modül,
// stok fotoğrafın dosya adını haberin kendi İngilizce görsel sorgusuyla
// (`gorselSorgu`) ve başlığındaki özel adlarla karşılaştırır.
//
// Amaç fotoğraf sayısını azaltmak değil; yanlış fotoğrafı göstermemek. Bu
// yüzden kural gevşek tutulur: dosya adındaki TEK bir anlamlı sözcük bile
// sorgu/başlıkla eşleşirse fotoğraf gösterilir. Sorgu hiç yoksa (eski
// kayıtlar) fotoğraf cezalandırılmaz.
//
// Yalnızca stok (`gorselEk`) adayları için kullanılır. Haberin kendi kaynak
// sayfasından doğrulanmış `images` adayları bu denetimden geçmez.

// Dosya adında anlam taşımayan parçalar (boyut, uzantı, arşiv sözcükleri).
const DOSYA_GENEL = new Set([
  "thumbnail", "photo", "photos", "image", "images", "file", "stock",
  "unsplash", "wikimedia", "commons", "edit", "svg", "jpg", "jpeg",
  "png", "webp", "px",
]);

// Görsel aramasında kullanılan ama haberin KONUSUNU söylemeyen sözcükler.
// Bunlar eşleşme sayılmaz; aksi halde "studio lighting" gibi sonuçlar
// "interview studio" sorgusuyla eşleşip yanlış fotoğraf gösterilirdi.
const SORGU_GENEL = new Set([
  "interview", "studio", "press", "conference", "meeting", "event",
  "celebration", "street", "city", "view", "aerial", "general", "building",
  "damaged", "destroyed", "people", "person", "crowd", "day", "night",
  "display", "packaging", "contents", "series", "technology", "digital",
  "world", "globe", "map", "flag", "sign", "symbol", "background",
  "concept", "illustration", "photo", "photos", "image", "images", "stock",
  "official", "government", "new", "latest", "report", "closeup", "detail",
]);

// Türkçe başlıkta sık geçen, konu ayırt etmeyen sözcükler.
const TR_GENEL = new Set([
  "için", "ile", "ve", "bir", "bu", "da", "de", "ki", "mi", "çok", "yeni",
  "son", "ilk", "daha", "en", "gibi", "olan", "olarak", "yıl", "yılı",
  "yılın", "yılda", "gün", "günü", "gününde", "saat", "saatlik", "dakika",
  "dolar", "milyon", "milyar", "bin", "tl", "usd", "eur", "haber",
  "haberleri", "haberi", "açıklama", "açıklaması", "duyurdu", "duyuruldu",
  "başladı", "başlıyor", "geldi", "gelen", "oldu", "olacak", "yaptı", "etti",
  "değil", "var", "yok", "nasıl", "neden", "zaman", "kim", "kimdir",
  "nerede", "hangi", "kaç", "model", "modeller", "modeli", "satış", "satışa",
  "fiyat", "fiyatı", "özellik", "özellikleri", "sistem", "sistemleri",
  "kullanıcı", "kullanıcılar", "güncelleme", "güncellemesi", "duyuru",
  "karar", "kararı", "iddia", "iddiası", "rapor", "raporu", "analiz",
  "uzman", "uzmanı", "şirket", "şirketi", "şirketler", "ülke", "ülkede",
  "kent", "kenti", "bölge", "bölgesi", "dünya", "dünyada", "avrupa", "abd",
  "türkiye", "yapıldı", "yapılıyor", "sürüyor", "yıllık", "yüzde", "binde",
  "ölüm", "ölü", "oran", "oranı", "vaka", "vakası", "vakalar", "yaş", "altı",
  "üstü", "düşüş", "artış", "rekor", "test", "sonuç", "sonuçları", "uyarı",
  "inceleme", "incelemesi", "soruşturma", "dava", "davası", "kişi", "kişiye",
  "kişinin", "adet", "büyük", "küçük", "eski",
  "mühendislik", "teknoloji", "telekomünikasyon",
  "fiyatla", "strateji", "stratejisi",
  "plan", "planı", "erken", "geç", "yayın", "yayınladı", "yayınlandı",
  "açıldı", "incelemeler", "alarm", "sinyal", "sistem", "yöntem", "yöntemi",
]);

// Türkçe konu sözcüklerinin İngilizce karşılıkları. Dosya adları İngilizce
// olduğu için "deprem" ile "earthquake" ancak bu köprüyle eşleşir.
const KONU_KARSILIKLARI = {
  deprem: "earthquake seismic",
  yangın: "fire blaze",
  sel: "flood",
  fırtına: "storm",
  kasırga: "hurricane",
  tsunami: "tsunami",
  savaş: "war",
  çatışma: "conflict",
  saldırı: "attack",
  sağlık: "health",
  yapay: "artificial",
  zeka: "intelligence",
  fosil: "fossil",
  füze: "missile rocket",
  nükleer: "nuclear",
  uzay: "space rocket",
  uydu: "satellite",
  roket: "rocket",
  seçim: "election",
  meclis: "parliament",
  mahkeme: "court",
  tutuklama: "arrest",
  polis: "police",
  asker: "military soldier",
  ordu: "army military",
  göçmen: "migrant",
  mülteci: "refugee",
  ekonomi: "economy",
  enflasyon: "inflation",
  faiz: "interest",
  borsa: "stock exchange",
  piyasa: "market",
  petrol: "oil",
  doğalgaz: "gas",
  enerji: "energy",
  elektrik: "electricity",
  banka: "bank",
  kripto: "crypto",
  bitcoin: "bitcoin",
  altın: "gold",
  otomobil: "car",
  araç: "car vehicle",
  telefon: "phone smartphone",
  bilgisayar: "computer",
  yazılım: "software",
  donanım: "hardware",
  oyun: "game",
  futbol: "football soccer stadium",
  basketbol: "basketball",
  tenis: "tennis",
  takım: "team",
  stadyum: "stadium",
  konser: "concert",
  müzik: "music",
  film: "film movie",
  sergi: "exhibition",
  kitap: "book",
  eğitim: "education",
  öğrenci: "student",
  okul: "school",
  üniversite: "university",
  hastane: "hospital",
  doktor: "doctor",
  virüs: "virus",
  aşı: "vaccine",
  tarım: "agriculture",
  gıda: "food",
  iklim: "climate",
  orman: "forest",
  baraj: "dam reservoir",
  göl: "lake",
  nehir: "river",
  deniz: "sea",
  köprü: "bridge",
  uçuş: "flight",
  havalimanı: "airport",
  tren: "train",
  gemi: "ship",
  turizm: "tourism",
  otel: "hotel",
  mağaza: "store",
  hisse: "stock share",
  kar: "snow",
  yağmur: "rain",
  sıcaklık: "temperature",
};

// Marka → ürün ailesi. Commons dosya adları çoğu zaman ürün ailesini yazar.
const MARKA_KARSILIKLARI = {
  samsung: "galaxy",
  apple: "iphone ipad mac",
  google: "pixel",
  microsoft: "windows xbox surface",
  meta: "facebook instagram whatsapp",
  tesla: "model",
  openai: "chatgpt",
  nvidia: "geforce rtx",
  intel: "core intel",
  amd: "ryzen radeon",
  spacex: "rocket space launch",
};

const TR_HARF = /[\u0131]/g;

/** Arama/karşılaştırma için sadeleştirilmiş küçük harf metin. */
function sadeles(metin) {
  return String(metin || "")
    .toLocaleLowerCase("tr")
    .replace(TR_HARF, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function kelimeler(metin) {
  return sadeles(metin)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** "AI" kısaltması sorguda 2 harf olduğu için elenmesin. */
function kisaltmalariAc(metin) {
  return String(metin || "").replace(/\bAI\b/gi, "artificial intelligence");
}

function dosyaAdi(url) {
  const ham = String(url || "").split(/[?#]/)[0];
  const parca = ham.split("/").filter(Boolean).pop() || "";
  try {
    return decodeURIComponent(parca);
  } catch {
    return parca;
  }
}

/** Dosya adından konu taşıyan sözcükler. */
function dosyaParcalari(url) {
  return kelimeler(dosyaAdi(url)).filter(
    (p) =>
      p.length >= 3 &&
      !/^\d+$/.test(p) &&
      !/^[0-9a-f]{6,}$/.test(p) &&
      !/^\d{2,4}px$/.test(p) &&
      !DOSYA_GENEL.has(p)
  );
}

/** Sorgudan konu taşıyan sözcükler. */
function sorguParcalari(metin) {
  return kelimeler(kisaltmalariAc(metin)).filter(
    (p) => p.length >= 3 && !SORGU_GENEL.has(p) && !/^\d+$/.test(p)
  );
}

/** Başlık/etiketlerden özel adlar ve konu sözcükleri. */
function baslikParcalari(article) {
  const metin = `${article?.title || ""} ${(Array.isArray(article?.tags) ? article.tags : []).join(" ")}`;
  return kelimeler(kisaltmalariAc(metin)).filter(
    (p) => p.length >= 4 && !TR_GENEL.has(p) && !/^\d+$/.test(p)
  );
}

// Sözlük anahtarları da metinle aynı biçime getirilir ("yangın" → "yangin").
const KONU_HARITA = new Map(
  Object.entries(KONU_KARSILIKLARI).map(([tr, en]) => [sadeles(tr), en])
);
const MARKA_HARITA = new Map(
  Object.entries(MARKA_KARSILIKLARI).map(([marka, urun]) => [sadeles(marka), urun])
);

/** Türkçe konu sözcüğünü (ekleriyle birlikte) İngilizce karşılığına çevirir. */
function konuKarsiliklari(parcalar) {
  const sonuc = [];
  for (const p of parcalar) {
    for (const [tr, en] of KONU_HARITA) {
      if (p === tr || (p.length >= 4 && tr.length >= 4 && (p.startsWith(tr) || tr.startsWith(p)))) {
        sonuc.push(...en.split(" "));
        break;
      }
    }
  }
  return sonuc;
}

function markaKarsiliklari(parcalar) {
  const sonuc = [];
  for (const p of parcalar) {
    for (const [marka, urun] of MARKA_HARITA) {
      if (p === marka || (p.length >= 5 && marka.length >= 5 && p.startsWith(marka))) {
        sonuc.push(...urun.split(" "));
        break;
      }
    }
  }
  return sonuc;
}

/** "fire" ~ "firefighters", "missile" ~ "missiles" gibi ekleri tolere eder. */
function benzer(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * Stok ek fotoğraf bu haber için gösterilebilir mi?
 *
 * @param {object} article Haber kaydı (title, tags, gorselSorgu).
 * @param {string} url     Wikimedia Commons görsel adresi.
 * @returns {boolean}
 */
export function stokEkUygunMu(article, url) {
  const dosya = dosyaParcalari(url);
  // "thumbnail", "world_globe" gibi konu taşımayan dosyalar gösterilmez.
  if (!dosya.length) return false;

  // Eski kayıtlarda görsel sorgusu olmayabilir; cezalandırma.
  const sorgu = sorguParcalari(article?.gorselSorgu);
  const baslik = baslikParcalari(article);
  const havuz = [
    ...sorgu,
    ...konuKarsiliklari(baslik),
    ...markaKarsiliklari([...sorgu, ...baslik]),
    ...baslik,
  ];

  if (!havuz.length) return true;

  return dosya.some((p) => havuz.some((k) => benzer(p, k)));
}
