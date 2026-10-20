// TELİF GÜVENLİ GÖRSELLER (STOK)
//
// NEDEN: Kaynak sitelerin haber fotoğrafları çoğu zaman ajans (AA, Getty, Reuters,
// DHA...) lisanslıdır. Onları hotlink etmek izinsiz kullanımdır; atıf yazmak da
// bunu yasal hâle getirmez. Bu yüzden kaynağın fotoğrafı ARTIK KULLANILMIYOR.
//
// YERİNE: Wikimedia Commons'taki YALNIZCA serbest lisanslı dosyalar
// (CC0 / kamu malı / CC BY / CC BY-SA). Her görselle birlikte fotoğrafçı, lisans
// ve dosya sayfası saklanır; sitede "Fotoğraf: X · CC BY-SA 4.0 · Wikimedia
// Commons" olarak gösterilir. Böylece:
//   * izinsiz fotoğraf yok (telif/DMCA riski yok),
//   * atıf lisansın istediği şekilde veriliyor,
//   * API anahtarı / ücretli hesap gerekmiyor (0 $ bütçe).
//
// Görsel seçimi habere özeldir: AI, haberi anlatan İngilizce bir arama sorgusu
// üretir (gorselSorgu). Sorgu boşsa etiketler, sonra kategori sorgusu denenir.

const UA = "HaberinaiBot/1.0 (+https://haberinai.site; iletisim@haberinai.site)";
const COMMONS = "https://commons.wikimedia.org/w/api.php";

// Yalnızca serbest lisanslar. GFDL, "fair use", "non-free" vb. KABUL EDİLMEZ.
const IZINLI_LISANS =
  /^(cc0\b|public domain\b|pd\b|pd[- ].*|no restrictions\b|cc by(-sa)?[ -]?\d)/i;

// Fotoğraf olmayan / haber görseli olarak kötü duran dosyalar.
const KOTU_BASLIK =
  /\b(logo|logos|map|maps|diagram|chart|graph|poster|cover|screenshot|screen shot|scan|scanned|icon|flag|coat of arms|seal|banknote|stamp|coin|signature|drawing|illustration|cartoon|clipart|svg|pdf|document|table|infographic|wikimedia|commons|wikidata|menu|display|thumbnail|unnamed|untitled|placeholder|no image|no photo)\b/i;

// Eski/tarama görselleri: haber sayfasında "dikkat çekici" durmaz.
const ESKI_GORSEL = /(black and white|monochrome|archival|historical|engraving|lithograph|fortepan|wellcome|bundesarchiv|nationaal archief|\b18\d\d\b|\b19[0-7]\d\b)/i;

// İnsanların oturduğu toplantı/sahne fotoğrafları: haberle ilgisi olsa da
// kapak olarak "dikkat çekici" değil. Elenmez, yalnızca geriye düşürülür.
const SAHNE_GORSEL = /(conference|meeting|summit|town hall|panel|seminar|workshop|award|ceremony|press briefing)/i;

// Sert/rahatsız edici sahneler (yangın, ceset, kan). Sorgu da afet/yangın
// içermiyorsa bu fotoğraf kapak olmaz: "muhtarlar kahvaltısı" haberine
// "Turkish village burned down" fotoğrafı geliyordu.
const SERT_GORSEL = /\b(burned|burning|destroyed|destruction|rubble|corpse|dead body|blood|bloody|wounded|massacre|execution)\b/i;
const FELAKET_SORGU = /\b(fire|burn|flood|earthquake|disaster|damage|destroy|collapse|quake|eruption|storm|rescue)\b/i;

// UYDU / HAVA GÖRÜNTÜSÜ: MODIS, Copernicus, Sentinel gibi görüntüler haber
// sayfasında fotoğraf gibi değil harita gibi duruyor. (19.10.2026: İspanya
// selinde "Extreme Weather on the Iberian Peninsula (MODIS)" aday listesine
// girdi.) Konu uzay/uydu değilse elenir.
const UYDU_GORSEL =
  /\b(modis|copernicus|sentinel|landsat|nesdis|goes[-\s]?\d|cira|orthophoto|orthomosaic|satellite|from space|aerial (view|photo|image)|aerial photograph)\b/i;
const UZAY_SORGU = /\b(space|satellite|nasa|esa|rocket|orbit|uzay|uydu|astronaut)\b/i;

// Afet/hava haberi mi? (İngilizce AI sorgusu + Türkçe başlık birlikte bakılır.)
// Yalnızca AI'nın sorgusuna bakmak yetmiyordu: "Akdeniz'de deprem" haberinde
// sorgu "Mediterranean Sea coastline landscape" olmuş; afet bağlamı kaybolunca
// sahilde bir manzara fotoğrafı kapak oluyordu.
const AFET_SORGU =
  /\b(flood|flooding|earthquake|quake|wildfire|storm|hurricane|typhoon|cyclone|drought|blizzard|avalanche|eruption|tsunami|fire)\b|(\bsel\b|su baskını|deprem|yangın|fırtına|hortum|kuraklık|heyelan|çığ(?!lık))/i;

// Afet/hava sorgusunda fotoğrafın adında da afet izi olmalı. Yoksa "sahil
// manzarası" gibi sakin bir kare, "deprem" haberine kapak oluyordu.
// Kök eşleşmesi (sondaki \b yok): "collapsed", "damaged", "burning" de yakalanır.
const FELAKET_GORSEL =
  /\b(flood|inundat|earthquake|quake|fire|burn|blaze|storm|hurricane|typhoon|cyclone|damag|destro|rubble|collaps|rescue|drought|blizzard|snowstorm|avalanche|eruption|lava|wreck)/i;

const MIN_W = 1000;
const MIN_H = 560;
const MIN_ORAN = 1.15; // dikey/kare görseller kartlarda kötü kırpılıyor
const MAX_ORAN = 2.7;
const ADAY = 22; // Commons'tan alınan aday sayısı (alaka puanı için geniş havuz)

/** HTML etiketlerini ve varlıklarını temizler (Artist alanı HTML geliyor). */
function duzMetin(value, max = 90) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Lisans adını sadeleştirir: "cc by-sa 4.0" -> "CC BY-SA 4.0" */
function lisansAdi(value) {
  const s = duzMetin(value, 40);
  if (!s) return "";
  if (/^cc0/i.test(s)) return "CC0";
  if (/^public domain|^pd\b/i.test(s)) return "Kamu malı";
  const m = /^cc[ -]?by([ -]?sa)?[ -]?(\d(?:\.\d)?)/i.exec(s);
  if (m) return `CC BY${m[1] ? "-SA" : ""} ${m[2]}`;
  return s;
}

const kelimeler = (s) =>
  String(s || "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

/** Dosya adı sorguyla ne kadar örtüşüyor? (0-1) */
function alaka(baslik, sorgu) {
  const b = new Set(kelimeler(baslik));
  const s = kelimeler(sorgu);
  if (!s.length) return 0;
  return s.filter((w) => b.has(w)).length / s.length;
}

/** Sorgu sözcüklerinden kaçı metinde geçiyor (mutlak sayı). */
function eslesenSayisi(metin, sorgu) {
  const b = new Set(kelimeler(metin));
  return kelimeler(sorgu).filter((w) => b.has(w)).length;
}

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

/** Commons'ta serbest lisanslı, büyük ve yatay fotoğraf arar. */
async function commonsAra(sorgu, adet = ADAY, offset = 0, afet = false) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    generator: "search",
    gsrnamespace: "6", // File:
    gsrlimit: String(adet),
    gsroffset: String(Math.max(0, offset)),
    gsrsearch: `${sorgu} filetype:bitmap`,
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiextmetadatafilter: "LicenseShortName|Artist|LicenseUrl|Credit|ImageDescription",
    iiurlwidth: "1400",
  });
  const res = await fetch(`${COMMONS}?${params}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 429 || res.status >= 500) {
    // Commons ara sıra hız sınırı koyuyor; tek denemede vazgeçme.
    await bekle(1200);
    const tekrar = await fetch(`${COMMONS}?${params}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!tekrar.ok) throw new Error(`Commons HTTP ${tekrar.status}`);
    return sayfalariCoz(await tekrar.json(), sorgu, afet);
  }
  if (!res.ok) throw new Error(`Commons HTTP ${res.status}`);
  return sayfalariCoz(await res.json(), sorgu, afet);
}

function sayfalariCoz(json, sorgu, afet = false) {
  const sayfalar = json?.query?.pages || [];
  return (Array.isArray(sayfalar) ? sayfalar : Object.values(sayfalar))
    .map((s) => uygunGorsel(s, sorgu, afet))
    .filter(Boolean)
    .sort((a, b) => b.skor - a.skor || b.genislik - a.genislik);
}

function uygunGorsel(sayfa, sorgu, afet = false) {
  const ii = sayfa?.imageinfo?.[0];
  if (!ii) return null;

  const baslik = String(sayfa.title || "").replace(/^File:/i, "");
  // Yalnızca JPEG: PNG/TIF/WebP dosyaları sayfayı ağırlaştırır.
  if (!/\.jpe?g$/i.test(baslik)) return null;
  if (KOTU_BASLIK.test(baslik)) return null;

  const w = Number(ii.width) || 0;
  const h = Number(ii.height) || 0;
  if (w < MIN_W || h < MIN_H) return null;
  const oran = w / h;
  if (oran < MIN_ORAN || oran > MAX_ORAN) return null;

  // 1900 öncesi yıl geçen dosya adları neredeyse her zaman gravür/eski
  // illüstrasyon oluyor ("Istanbul_comet_and_earthquake_1556.jpg" gibi).
  if (/\b1[0-8]\d{2}\b/.test(baslik)) return null;
  if (SERT_GORSEL.test(baslik) && !FELAKET_SORGU.test(sorgu)) return null;
  if (UYDU_GORSEL.test(baslik) && !UZAY_SORGU.test(sorgu)) return null;
  if (FELAKET_SORGU.test(sorgu) && !FELAKET_GORSEL.test(baslik)) return null;
  if (afet && !FELAKET_GORSEL.test(baslik)) return null;

  const meta = ii.extmetadata || {};
  const hamLisans = meta.LicenseShortName?.value;
  if (!hamLisans || !IZINLI_LISANS.test(duzMetin(hamLisans, 60))) return null;
  // PD-Art: iki boyutlu sanat eserinin birebir kopyası (gravür, tablo, minyatür).
  if (/^pd[\s-]?art/i.test(duzMetin(hamLisans, 60))) return null;

  const url = String(ii.thumburl || ii.url || "").split("?")[0];
  // Commons küçük görselleri iki CDN alan adından veriyor.
  if (!/^https:\/\/(upload|thumb)\.wikimedia\.org\//i.test(url)) return null;

  const yazar =
    duzMetin(meta.Artist?.value) || duzMetin(meta.Credit?.value) || "Wikimedia Commons";

  // Alaka: ÖNCE dosya adı. Dosya adı sorgudaki tek bir sözcüğü bile
  // içermiyorsa fotoğraf kapak olamaz: Commons araması konu bulamadığında
  // açıklaması "municipality office" geçen Macar bir binayı, "stadium" geçen
  // Polonya stadını getirebiliyor (Türkiye haberi için yanlış bağlam).
  const aciklama = duzMetin(meta.ImageDescription?.value, 600);
  const dosyaPuan = alaka(baslik, sorgu);
  const sSorgu = kelimeler(sorgu);
  const eslesen = eslesenSayisi(baslik, sorgu);
  // 2 sözcüklü sorguda İKİSİ de, 3+ sözcükte en az 2'si dosya adında olmalı.
  // ("Opera browser" sorgusuna "Gounod - Mireille - Open air opera" dosyası
  // yalnızca "opera" ile uyuyordu; ikinci sözcük olmadan kabul edilmez.)
  const gerekli = sSorgu.length >= 2 ? Math.min(2, sSorgu.length) : 1;
  if (eslesen < gerekli) return null;
  // Açıklama uyumu sıralamayı iyileştirir ("Medical Park Stadyumu" açıklaması
  // "Trabzonspor - Beşiktaş" der → öne çıkar) ama tek başına yeterli değildir.
  const puan = dosyaPuan + 0.5 * alaka(aciklama, sorgu);

  // Sıralama: konu uyumu. Eşitlikte Commons'ın KENDİ arama sırası korunur
  // (sort kararlıdır) — motor dosya kategorilerini de gördüğü için isabetli.
  let skor = puan;
  if (ESKI_GORSEL.test(baslik)) skor -= 0.5;
  if (SAHNE_GORSEL.test(baslik)) skor -= 0.2;

  return {
    url,
    sayfa: ii.descriptionurl || "",
    yazar,
    lisans: lisansAdi(hamLisans),
    lisansUrl: duzMetin(meta.LicenseUrl?.value, 200),
    genislik: w,
    yukseklik: h,
    dosya: baslik,
    skor,
  };
}

/**
 * AI'nın uzun sorgusunun "geniş" hâli: ilk iki sözcük.
 * ("flooded street cars Istanbul" → "flooded street"). Commons'ta tam sorgu
 * dosya adıyla eşleşmezse bu geniş hâl çoğu zaman konuya uygun fotoğraf bulur.
 */
export function kisaSorgu(sorgu) {
  const w = String(sorgu || "").trim().split(/\s+/).filter(Boolean);
  return w.length > 2 ? w.slice(0, 2).join(" ") : "";
}

/**
 * Konu (afet/hava) sorgusu.
 *
 * AI'nın sorgusu Commons'ta genelde uydu görüntüsüne ya da PNG'ye düşüyor
 * ("Spain flood disaster rescue" → yalnızca Copernicus/MODIS). Bu durumda
 * kategori yedeği devreye giriyordu ve "Dünya" kategorisinde havalimanı
 * fotoğrafı geliyordu — sel haberine havalimanı saçma duruyordu.
 * Arada bu basamak var: konu afet/hava ise yerden çekilmiş, gerçek bir sahne
 * aranır ("flooded street cars" gibi).
 */
export const KONU_SORGU = [
  {
    // KAR, SELDEN ÖNCE bakılır: "snowstorm" içinde "storm" geçtiği için
    // sel kuralı önce çalışınca kar haberi "flooded street cars" sorgusuna
    // düşüyordu (kar haberi + sel fotoğrafı).
    // "ice" tam sözcük aranır: "office", "service", "police", "device"
    // sözcüklerinin içine denk gelip spor/ekonomi haberine karlı araba
    // fotoğrafı koyuyordu ("Sergen Yalcin TFF office meeting").
    test: /(\bsnow\b|blizzard|snowstorm|\bfrost\b|\bice\b|\bicy\b|kar yağışı|çığ(?!lık))/i,
    sorgu: "snow covered street cars",
  },
  {
    // "rain" tek başına "train", "brain" içine denk geliyordu; "storm" da
    // "brainstorm" içine. Tam sözcük olarak aranır.
    test: /(flood|flooding|flooded|\brain\b|\brainfall\b|\bstorm\b|downpour|hurricane|typhoon|monsoon|\bsel\b|su baskını|sağanak|yağış|fırtına|hortum)/i,
    sorgu: "flooded street cars",
  },
  {
    test: /(earthquake|quake|seismic|tremor|deprem|sarsıntı)/i,
    sorgu: "earthquake damaged building",
  },
  {
    // "fire" tam sözcük: "firewall", "Fire TV" gibi başlıklar afet sayılmasın.
    test: /(wildfire|forest fire|\bfire\b|blaze|burning|yangın)/i,
    sorgu: "wildfire forest fire",
  },
  {
    test: /(drought|heatwave|heat wave|kuraklık|sıcak dalgası)/i,
    sorgu: "dry cracked earth drought",
  },
];

/** Verilen metinlerden biri afet/hava haberi mi? */
export function afetMi(...metinler) {
  return metinler.some((m) => AFET_SORGU.test(String(m || "")));
}

/** Verilen sorguya uyan konu sorgusunu döndürür (yoksa ""). */
export function konuSorgu(...metinler) {
  const s = metinler.map((m) => String(m || "")).join(" ");
  for (const k of KONU_SORGU) if (k.test.test(s)) return k.sorgu;
  return "";
}

/**
 * Verilen sorguları sırayla dener, birbirinden farklı ve daha önce kullanılmamış
 * en fazla `adet` görsel döndürür. Ağ hatası sessizce atlanır (haber yayından
 * düşmez; kategori yedeği devreye girer).
 */
export async function stokGorseller(sorgular, { adet = 3, kullanilan = new Set(), offset = 0, afet = false } = {}) {
  // Aynı dosyanın kırpılmış sürümü ("... (cropped)") ayrı fotoğraf sayılmasın.
  const kimlik = (baslik) =>
    String(baslik || "")
      .replace(/\(cropped\)/gi, "")
      .replace(/\.(jpe?g|png)$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  const temizSorgular = [
    ...new Set(
      (sorgular || []).map((s) => String(s || "").trim()).filter((s) => s.length >= 2)
    ),
  ].slice(0, 4);

  const ara = async (gorulen) => {
    const sonuc = [];
    for (const sorgu of temizSorgular) {
      if (sonuc.length >= adet) break;
      let adaylar = [];
      try {
        adaylar = await commonsAra(sorgu, ADAY, offset, afet);
      } catch {
        continue; // ağ hatası: sonraki sorgu
      }
      for (const g of adaylar) {
        if (sonuc.length >= adet) break;
        const k = kimlik(g.dosya);
        if (gorulen.has(g.url) || gorulen.has(g.dosya) || gorulen.has(`#${k}`)) continue;
        gorulen.add(g.url);
        gorulen.add(g.dosya);
        gorulen.add(`#${k}`);
        sonuc.push(g);
      }
    }
    return sonuc;
  };

  const sonuc = await ara(new Set(kullanilan));
  if (sonuc.length) return sonuc;

  // Havuz tükendiyse (aynı kategori sorgusu arşivde onlarca kez kullanıldı)
  // tekrarı göze al: konuya uygun bir fotoğraf, hiç fotoğraf olmamasından
  // (tek bir yedek görselin her haberde görünmesinden) iyidir.
  return ara(new Set());
}

// Kategorilere göre genel arama sorguları: AI'nın özel sorgusu sonuç vermezse
// (ör. çok niş bir konu) habere yakın, güvenli bir fotoğrafa düşülür.
export const KATEGORI_SORGU = {
  Teknoloji: "technology circuit board",
  "Yapay Zeka": "artificial intelligence robot",
  Mobil: "smartphone in hand",
  Oyun: "video game controller",
  Donanım: "graphics card computer hardware",
  Yazılım: "programming source code screen",
  İnternet: "data center server room",
  Bilim: "science laboratory research",
  Uzay: "rocket launch night sky",
  Sağlık: "hospital doctor stethoscope",
  Kültür: "art museum exhibition",
  Yaşam: "city park people walking",
  Otomobil: "electric car charging street",
  Ekonomi: "stock market trading floor",
  Spor: "football stadium floodlights",
  Gündem: "Istanbul street city",
  // "earth from space" dünya haberlerine uzay fotoğrafı koyuyordu (Paris
  // protestosu → Artemis II). Havalimanı terminali de sel/afet haberine
  // saçma düşüyordu (19.10.2026). Nötr ve her konuya uyan sahne: elde tutulan
  // dünya küresi.
  Dünya: "person holding world globe",
  Diğer: "newspaper reading",
};

/**
 * Son çare: hiçbir arama sonuç vermezse (ağ kesintisi vb.) kullanılacak,
 * lisansı sabit ve doğrulanmış Commons dosyaları. Haber yine de fotoğrafsız
 * kalmaz. (Yalnızca kategori sorgusu da başarısız olduğunda devreye girer.)
 */
export const YEDEK_GORSEL = {
  Teknoloji: {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3b/Close-up_view_of_a_circuit_board_being_held_near_an_air_conditioning_unit_in_a_contemporary_indoor_environment.jpg/1920px-Close-up_view_of_a_circuit_board_being_held_near_an_air_conditioning_unit_in_a_contemporary_indoor_environment.jpg",
    yazar: "Shixart1985",
    lisans: "CC BY 2.0",
    sayfa: "https://commons.wikimedia.org/wiki/File:Close-up_view_of_a_circuit_board_being_held_near_an_air_conditioning_unit_in_a_contemporary_indoor_environment.jpg",
  },
  "Yapay Zeka": {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2d/Artificial_Intelligence_%28AI%29_and_Robotics_exhibition_at_the_Heinz_Nixdorf_MuseumsForum.jpg/1920px-Artificial_Intelligence_%28AI%29_and_Robotics_exhibition_at_the_Heinz_Nixdorf_MuseumsForum.jpg",
    yazar: "Sergei Magel/HNF",
    lisans: "CC BY-SA 4.0",
    sayfa: "https://commons.wikimedia.org/wiki/File:Artificial_Intelligence_(AI)_and_Robotics_exhibition_at_the_Heinz_Nixdorf_MuseumsForum.jpg",
  },
  Mobil: {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cc/Black_smartphone_in_hand_%28Unsplash%29.jpg/1920px-Black_smartphone_in_hand_%28Unsplash%29.jpg",
    yazar: "Dennis Cortés",
    lisans: "CC0",
    sayfa: "https://commons.wikimedia.org/wiki/File:Black_smartphone_in_hand_(Unsplash).jpg",
  },
  Oyun: {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4b/Hands_holding_video_game_controller_%2850811892858%29.jpg/1920px-Hands_holding_video_game_controller_%2850811892858%29.jpg",
    yazar: "Vu Hoang",
    lisans: "CC BY 2.0",
    sayfa: "https://commons.wikimedia.org/wiki/File:Hands_holding_video_game_controller_(50811892858).jpg",
  },
  Donanım: {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/33/H%C3%A5kan_Lans_computer_color_graphics_card_Datacolor.jpg/1920px-H%C3%A5kan_Lans_computer_color_graphics_card_Datacolor.jpg",
    yazar: "Agnes Andersson",
    lisans: "CC BY 4.0",
    sayfa: "https://commons.wikimedia.org/wiki/File:H%C3%A5kan_Lans_computer_color_graphics_card_Datacolor.jpg",
  },
  Yazılım: {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ef/Programming_code.jpg/1920px-Programming_code.jpg",
    yazar: "Martin Vorel",
    lisans: "CC BY-SA 4.0",
    sayfa: "https://commons.wikimedia.org/wiki/File:Programming_code.jpg",
  },
  İnternet: {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b0/Duga-1_radar_data_center_interior_server_room_2018.jpg/1920px-Duga-1_radar_data_center_interior_server_room_2018.jpg",
    yazar: "Joël van der Loo",
    lisans: "CC BY-SA 4.0",
    sayfa: "https://commons.wikimedia.org/wiki/File:Duga-1_radar_data_center_interior_server_room_2018.jpg",
  },
  Bilim: {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/93/Jet_Propulsion_Laboratory_Plasma_Flow_Research_Lab.jpg/1920px-Jet_Propulsion_Laboratory_Plasma_Flow_Research_Lab.jpg",
    yazar: "NASA",
    lisans: "Kamu malı",
    sayfa: "https://commons.wikimedia.org/wiki/File:Jet_Propulsion_Laboratory_Plasma_Flow_Research_Lab.jpg",
  },
  Ekonomi: {
    url: "https://upload.wikimedia.org/wikipedia/commons/7/78/Market_centre_in_Tokyo_stock_exchange.jpg",
    yazar: "ehnmark",
    lisans: "CC BY 2.0",
    sayfa: "https://commons.wikimedia.org/wiki/File:Market_centre_in_Tokyo_stock_exchange.jpg",
  },
  Spor: {
    // Türk stadyumu/seyircisi: Estonya stadyumu yerine (Türkiye spor haberi).
    url: "https://upload.wikimedia.org/wikipedia/commons/8/8f/Besiktas_JK_-_Trabzonspor_match.jpg",
    yazar: "ayhang",
    lisans: "CC BY 2.0",
    lisansUrl: "https://creativecommons.org/licenses/by/2.0",
    sayfa: "https://commons.wikimedia.org/wiki/File:Besiktas_JK_-_Trabzonspor_match.jpg",
  },
  Gündem: {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Istanbul_city_Photos-_Urban_01.jpg/1920px-Istanbul_city_Photos-_Urban_01.jpg",
    yazar: "Mostafameraji",
    lisans: "CC BY-SA 4.0",
    sayfa: "https://commons.wikimedia.org/wiki/File:Istanbul_city_Photos-_Urban_01.jpg",
  },
  Dünya: {
    // Havalimanı terminali (Sofia) sel/afet haberine saçma düşüyordu.
    // Nötr dünya küresi her uluslararası habere uyar.
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e2/Person_holding_world_globe.jpg/1920px-Person_holding_world_globe.jpg",
    yazar: "Porapak Apichodilok",
    lisans: "CC0",
    lisansUrl: "https://creativecommons.org/publicdomain/zero/1.0",
    sayfa: "https://commons.wikimedia.org/wiki/File:Person_holding_world_globe.jpg",
  },
  Diğer: {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/36/Man_reading_a_newspaper.jpg/1920px-Man_reading_a_newspaper.jpg",
    yazar: "Michael Slaten",
    lisans: "CC BY-SA 4.0",
    sayfa: "https://commons.wikimedia.org/wiki/File:Man_reading_a_newspaper.jpg",
  },
};

/** Kategori yedeği: önce kategori görseli, yoksa genel "Diğer". */
export function yedekGorsel(kategori) {
  const g = YEDEK_GORSEL[kategori] || YEDEK_GORSEL.Diğer;
  return { ...g, genislik: 1400, yukseklik: 933, dosya: String(g.sayfa || "").split("File:").pop() };
}

/** Siteye yazılacak atıf nesnesi (veri dosyasını şişirmemek için kısa). */
export function atif(g) {
  return {
    yazar: g.yazar,
    lisans: g.lisans,
    lisansUrl: g.lisansUrl || "",
    sayfa: g.sayfa || "",
  };
}

// Fotoğrafın konusu (dosya adından) afet/hava sahnesi ama haberin başlığı ve
// arama sorgusu bu konuda değilse görsel yanlış demektir. Örnek: "ice" sözcüğü
// "office" içinde eşleştiği için spor haberine "karlı araba" fotoğrafı düşmüştü.
const KONU_GORSEL = /\b(snow|covered|flood|fire|burn|earthquake|rubble|storm)\b/i;
const KONU_METIN =
  /\b(snow|kar|flood|sel|fire|yangın|earthquake|deprem|storm|fırtına|rescue|kurtar)\b/i;

/**
 * Konusuyla uyuşmayan kapak fotoğraflarını onarır.
 *
 * Her toplama turunda arşiv üzerinde çalışır; böylece veri birleşmelerinde
 * (git merge -X ours) daha önce yapılmış görsel onarımları kaybolsa bile
 * bir sonraki turda yeniden düzeltilir. Ağ isteği yapmaz: şüpheli görselin
 * yerine kategorinin SEÇİLMİŞ yedek fotoğrafı konur (telifi ve konusu belli).
 *
 * @param {Array<{title?:string, image?:string, gorselSorgu?:string, category?:string, gorselKaynak?:object}>} articles
 * @returns {number} değiştirilen haber sayısı
 */
export function gorselOnar(articles) {
  let sayi = 0;
  for (const a of Array.isArray(articles) ? articles : []) {
    const gorsel = String(a?.image || "");
    if (!gorsel || !KONU_GORSEL.test(gorsel)) continue;
    if (KONU_METIN.test(`${a.title || ""} ${a.gorselSorgu || ""}`)) continue;
    const yedek = yedekGorsel(a.category);
    if (!yedek?.url) continue;
    a.image = yedek.url;
    a.gorselKaynak = atif(yedek);
    sayi++;
  }
  return sayi;
}
