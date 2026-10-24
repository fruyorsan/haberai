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
  /\b(logo|logos|map|maps|diagram|chart|graph|poster|cover|screenshot|screen shot|scan|scanned|icon|flag|coat of arms|seal|banknote|stamp|coin|signature|drawing|illustration|cartoon|clipart|svg|pdf|document|table|infographic|wikimedia|commons|wikidata|menu|display|thumbnail|unnamed|untitled|placeholder|no image|no photo|policies|policy brief|press release|art project|painting)\b/i;

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

// Pandemi dönemi fotoğrafları (maskeli insanlar, karantina sokakları) 2020-2021
// görünümlü ve bugünün haberiyle ilgisiz duruyor. Sorgu pandemiyle ilgili
// değilse bu kareler kapak olmaz. (Getir market araştırması haberine "Kolkata
// karantinasında maskeli adam" fotoğrafı düşmüştü.)
const PANDEMI_GORSEL =
  /\b(covid|covid-?19|coronavirus|pandemic|quarantine|lockdown|face ?mask|surgical mask|maskeli|pandemi|karantina)\b/i;
const PANDEMI_SORGU =
  /\b(covid|coronavirus|pandemic|quarantine|lockdown|mask|pandemi|karantina|virüs|virus)\b/i;

const MIN_W = 1000;
const MIN_H = 560;
const MIN_ORAN = 1.15; // dikey/kare görseller kartlarda kötü kırpılıyor
const MAX_ORAN = 2.7;
const ADAY = 22; // Commons'tan alınan aday sayısı (alaka puanı için geniş havuz)

// ---------------------------------------------------------------------------
// MARKA FARKINDALIĞI
//
// AI'nın İngilizce sorgusu markayı atlayabiliyor: "Getir market araştırması"
// haberi için "online grocery shopping" yazınca Commons alakasız bir 2020
// fotoğrafı döndürdü; oysa Commons'ta markalı Getir kurye scooter'ları var.
// Başlıktaki markayı ayrıca arayınca haberin kendi fotoğrafı bulunuyor.
// ---------------------------------------------------------------------------

// Türkçe cümle başında büyük harfle yazılan sıradan sözcükler: marka değil.
const MARKA_DISLAMA = new Set(
  `acil adalet adım akıllı alan aldı altında ana anadolu ara araştırma araştırması ardından artık
   asgari asker açıklama açıklaması açtı bakan bakanlık bakanlığı başkan başkanlığı belediye bilim
   bilişim bugün büyük büyükşehir ceza cumhurbaşkanı cumhurbaşkanlığı çalışma çocuk dava dedi devlet
   dışişleri diğer doktor dönem dünya dün ekonomi eğitim emniyet enerji eski fiyat genel gündem güvenlik
   hakim hava hayat hükümet ilk kez kamu kanun karar kaza kişi komisyon kurul kurulu mahkeme maliye
   market milyar milyon müdürlük müdürlüğü neden nasıl ordu ölüm önemli para patron profesör rapor
   sağlık saldırı savcı savcılık sayı sel son sıcaklık spor şirket tarih teknoloji ticaret tüketici
   tüketiciler türkiye türk ülke üniversite uzman uzmanlar vali valilik yapay yargı yasa yeni yıl
   yüzde zeka zam zarar yetkililer kullanıcılar araştırmacılar bilim insanları abd ab bm bmgk nato imf
   tır tir suv abs esp gps led ssd ram cpu gpu usb wifi 5g 4g ai tv pc halk sgk fpt uefa fifa`
    .split(/\s+/)
    .filter(Boolean)
);

// İngilizce'de sıradan sözcük olan markalar: yalnız başına aranınca alakasız
// fotoğraf getirir (Apple → elma, Windows → pencere, Galaxy → galaksi).
const MARKA_BELIRSIZ = new Set(
  `apple windows office edge chrome pixel galaxy note play store market home smart one plus
   prime news media general future world health science sport sports game games mobile internet
   cloud stream photo camera phone tv ai app web data tech digital global star sun moon light
   energy power water fire earth sea air city country people life love time money bank gold
   silver black white color art music film series season final first last new best top pro max
   ultra mini super live life style times post today daily`
    .split(/\s+/)
    .filter(Boolean)
);

// Tanınmış markalar: küçük harfle yazılsa bile marka kabul edilir.
const BILINEN_MARKALAR = new Set(
  `getir trendyol hepsiburada migros a101 şok sok togg arçelik arcelik vestel türkcell turkcell
   vodafone türk telekom turktelekom sunexpress toyota volkswagen renault
   fiat hyundai kia opel peugeot citroen skoda nissan honda mercedes bmw audi stellantis
   samsung xiaomi huawei oppo vivo realme oneplus google microsoft openai anthropic
   chatgpt copilot nvidia intel amd qualcomm asus lenovo acer msi gigabyte logitech
   playstation xbox nintendo netflix spotify instagram whatsapp telegram tiktok youtube
   twitter aliexpress n11 çiçeksepeti ciceksepeti yemeksepeti sahibinden
   akbank işbank isbank yapıkredi yapikredi qnb
   baykar tusaş tusas aselsan roketsan tübitak tubitak`
    .split(/\s+/)
    .filter(Boolean)
);

/**
 * Başlıktaki en olası marka/özel ürün adını döndürür (yoksa "").
 * Yalnızca güvenilir adaylar: bilinen marka listesi, içinde büyük harf olan
 * (iPhone, YouTube), rakam içeren (A101) veya tamamı büyük kısaltmalar (THY).
 */
export function markaAdi(baslik) {
  const adaylar = [];
  for (const ham of String(baslik || "").split(/[^\p{L}\p{N}]+/u)) {
    const t = ham.trim();
    if (t.length < 3 || !/^\p{Lu}/u.test(t)) continue;
    const kucuk = t.toLocaleLowerCase("tr");
    if (MARKA_DISLAMA.has(kucuk) || MARKA_BELIRSIZ.has(kucuk)) continue;
    if (BILINEN_MARKALAR.has(kucuk)) {
      adaylar.push({ ad: t, puan: 5 });
    } else if (/^\p{Lu}\p{Ll}+\p{Lu}/u.test(t)) {
      adaylar.push({ ad: t, puan: 4 }); // YouTube, TikTok, ServiceNow
    }
  }
  adaylar.sort((a, b) => b.puan - a.puan || b.ad.length - a.ad.length);
  return adaylar[0]?.ad || "";
}

/** HTML etiketlerini ve varlıklarını temizler (Artist alanı HTML geliyor). */
function duzMetin(value, max = 90) {
  return String(value || "")
    // Commons, makine okuması için gizli bir <span> içinde aynı metni
    // tekrarlıyor ("Unknown authorUnknown author"). Gizli bloğu tamamen at.
    .replace(/<span[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/span>/gi, " ")
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

// Commons "Artist" alan� bazen kurumsal imza, bazen "Unknown author" gibi
// bilgi ta��mayan bir metin. Atıf satırında tekrarı ve anlamsız imzayı at.
const YAZAR_GENEL = /^(unknown( author)?|anonymous|wikimedia commons|commons)$/i;

/** Foto�raf�� imzas�n� atıf satırına uygun h�le getirir (yoksa ""). */
function yazarTemizle(value) {
  let s = duzMetin(value, 160);
  if (!s) return "";
  // "Unknown author Unknown author" gibi birebir yinelenen yarımı at.
  const parcalar = s.split(" ");
  if (parcalar.length % 2 === 0) {
    const yari = parcalar.length / 2;
    const ilk = parcalar.slice(0, yari).join(" ");
    if (ilk === parcalar.slice(yari).join(" ")) s = ilk;
  }
  s = s.replace(/[,;:.\-\s]+$/, "").trim();
  if (!s || YAZAR_GENEL.test(s)) return "";
  // �ok uzun kurumsal imzalar g�r�n�r atf� bo�mas�n.
  if (s.length > 70) s = `${s.slice(0, 67).trimEnd()}…`;
  return s;
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
async function commonsAra(sorgu, adet = ADAY, offset = 0, afet = false, marka = "") {
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
    prop: "imageinfo|categories",
    cllimit: "max",
    iiprop: "url|size|extmetadata",
    iiextmetadatafilter: "LicenseShortName|Artist|LicenseUrl|Credit|ImageDescription",
    iiurlwidth: "1280",
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
    return sayfalariCoz(await tekrar.json(), sorgu, afet, marka);
  }
  if (!res.ok) throw new Error(`Commons HTTP ${res.status}`);
  return sayfalariCoz(await res.json(), sorgu, afet, marka);
}

function sayfalariCoz(json, sorgu, afet = false, marka = "") {
  const sayfalar = json?.query?.pages || [];
  return (Array.isArray(sayfalar) ? sayfalar : Object.values(sayfalar))
    .map((s) => uygunGorsel(s, sorgu, afet, marka))
    .filter(Boolean)
    .sort((a, b) => b.skor - a.skor || b.genislik - a.genislik);
}

/** Metinde sözcük olarak geçiyor mu? ("Mini-MAX" ≠ "Minimax", "Tusa" ≠ "TUSAŞ") */
function tamKelimeVar(metin, kelime) {
  const duz = (s) =>
    String(s || "")
      .toLocaleLowerCase("tr")
      .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }[c]));
  const aranan = duz(kelime).trim();
  if (!aranan) return false;
  return duz(metin)
    .split(/[^a-z0-9]+/)
    .some((w) => w === aranan);
}

function uygunGorsel(sayfa, sorgu, afet = false, marka = "") {
  const ii = sayfa?.imageinfo?.[0];
  if (!ii) return null;

  const baslik = String(sayfa.title || "").replace(/^File:/i, "");
  // Yalnızca JPEG: PNG/TIF/WebP dosyaları sayfayı ağırlaştırır.
  if (!/\.jpe?g$/i.test(baslik)) return null;
  if (KOTU_BASLIK.test(baslik)) return null;

  // MARKA DOĞRULAMASI: marka adıyla aranan dosya, Commons'ta o markanın
  // kategorisinde olmalı. Aksi hâlde "TUSAŞ" → Norveç'te "Tusa River",
  // "MiniMax" → itfaiye pompası, "Anthropic" → fosil kemiği gibi eşleşmeler
  // kapak oluyordu. Kategori, dosyanın gerçekten o markaya ait olduğunu
  // gösteren en güvenilir sinyal.
  if (marka) {
    const kategoriler = (sayfa.categories || []).map((c) => c.title || "").join(" ");
    if (!tamKelimeVar(kategoriler, marka)) return null;
    // Marka fotoğrafı olsa da kapak olarak kötü duran kareler: protesto/aktivizm
    // görüntüleri, çadır/stant, tabela, bisiklet, kablo/adaptör.
    if (
      /\b(protest|demonstration|protestors|farbattacke|letzte generation|attack|tent|zelt|booth|stand|bicycle|bike|adapter|cable|banner)\b/i.test(
        baslik
      )
    ) {
      return null;
    }
  }

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

  // Pandemi dönemi kareleri: sorgu pandemiyle ilgili değilse kapak olmaz.
  const aciklama = duzMetin(meta.ImageDescription?.value, 600);
  if (PANDEMI_GORSEL.test(`${baslik} ${aciklama}`) && !PANDEMI_SORGU.test(sorgu)) return null;

  const url = String(ii.thumburl || ii.url || "").split("?")[0];
  // Commons küçük görselleri iki CDN alan adından veriyor.
  if (!/^https:\/\/(upload|thumb)\.wikimedia\.org\//i.test(url)) return null;

  // "Unknown author" gibi imzalar boş bırakılır: atıf satırı yalnızca lisans ve
  // Wikimedia Commons bağlantısını gösterir, uydurma isim yazılmaz. Sanatçı
  // alanı hiç yoksa Commons'un "Credit" (kaynak kurum) alanına düşülür.
  const hamSanatci = duzMetin(meta.Artist?.value);
  const yazar =
    (hamSanatci ? yazarTemizle(hamSanatci) : yazarTemizle(meta.Credit?.value)) || "";

  // Alaka: ÖNCE dosya adı. Dosya adı sorgudaki tek bir sözcüğü bile
  // içermiyorsa fotoğraf kapak olamaz: Commons araması konu bulamadığında
  // açıklaması "municipality office" geçen Macar bir binayı, "stadium" geçen
  // Polonya stadını getirebiliyor (Türkiye haberi için yanlış bağlam).
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
  // ÇEKİCİLİK: kartlarda en iyi duran kare 16:9'a yakın, bol pikselli olandır.
  // (Küçük kareler kartta bulanık, çok basık kareler kırpılmış görünür.)
  skor += Math.max(0, 0.18 - Math.abs(oran - 16 / 9) * 0.3);
  if (w >= 2000 && h >= 1100) skor += 0.12;
  else if (w >= 1600) skor += 0.06;

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
export async function stokGorseller(sorgular, { adet = 3, kullanilan = new Set(), offset = 0, afet = false, marka = "" } = {}) {
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
    for (const [i, sorgu] of temizSorgular.entries()) {
      if (sonuc.length >= adet) break;
      let adaylar = [];
      try {
        // Marka sorgusu yalnızca ilk sırada ve marka adıyla aynıysa kategori
        // doğrulamasıyla çalışır; diğer (konu) sorguları serbesttir.
        const markaFiltre = i === 0 && marka && sorgu === String(marka).trim() ? marka : "";
        adaylar = await commonsAra(sorgu, ADAY, offset, afet, markaFiltre);
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
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3b/Close-up_view_of_a_circuit_board_being_held_near_an_air_conditioning_unit_in_a_contemporary_indoor_environment.jpg/1280px-Close-up_view_of_a_circuit_board_being_held_near_an_air_conditioning_unit_in_a_contemporary_indoor_environment.jpg",
    yazar: "Shixart1985",
    lisans: "CC BY 2.0",
    sayfa: "https://commons.wikimedia.org/wiki/File:Close-up_view_of_a_circuit_board_being_held_near_an_air_conditioning_unit_in_a_contemporary_indoor_environment.jpg",
  },
  "Yapay Zeka": {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2d/Artificial_Intelligence_%28AI%29_and_Robotics_exhibition_at_the_Heinz_Nixdorf_MuseumsForum.jpg/1280px-Artificial_Intelligence_%28AI%29_and_Robotics_exhibition_at_the_Heinz_Nixdorf_MuseumsForum.jpg",
    yazar: "Sergei Magel/HNF",
    lisans: "CC BY-SA 4.0",
    sayfa: "https://commons.wikimedia.org/wiki/File:Artificial_Intelligence_(AI)_and_Robotics_exhibition_at_the_Heinz_Nixdorf_MuseumsForum.jpg",
  },
  Mobil: {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cc/Black_smartphone_in_hand_%28Unsplash%29.jpg/1280px-Black_smartphone_in_hand_%28Unsplash%29.jpg",
    yazar: "Dennis Cortés",
    lisans: "CC0",
    sayfa: "https://commons.wikimedia.org/wiki/File:Black_smartphone_in_hand_(Unsplash).jpg",
  },
  Oyun: {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4b/Hands_holding_video_game_controller_%2850811892858%29.jpg/1280px-Hands_holding_video_game_controller_%2850811892858%29.jpg",
    yazar: "Vu Hoang",
    lisans: "CC BY 2.0",
    sayfa: "https://commons.wikimedia.org/wiki/File:Hands_holding_video_game_controller_(50811892858).jpg",
  },
  Donanım: {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/33/H%C3%A5kan_Lans_computer_color_graphics_card_Datacolor.jpg/1280px-H%C3%A5kan_Lans_computer_color_graphics_card_Datacolor.jpg",
    yazar: "Agnes Andersson",
    lisans: "CC BY 4.0",
    sayfa: "https://commons.wikimedia.org/wiki/File:H%C3%A5kan_Lans_computer_color_graphics_card_Datacolor.jpg",
  },
  Yazılım: {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ef/Programming_code.jpg/1280px-Programming_code.jpg",
    yazar: "Martin Vorel",
    lisans: "CC BY-SA 4.0",
    sayfa: "https://commons.wikimedia.org/wiki/File:Programming_code.jpg",
  },
  İnternet: {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b0/Duga-1_radar_data_center_interior_server_room_2018.jpg/1280px-Duga-1_radar_data_center_interior_server_room_2018.jpg",
    yazar: "Joël van der Loo",
    lisans: "CC BY-SA 4.0",
    sayfa: "https://commons.wikimedia.org/wiki/File:Duga-1_radar_data_center_interior_server_room_2018.jpg",
  },
  Bilim: {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/93/Jet_Propulsion_Laboratory_Plasma_Flow_Research_Lab.jpg/1280px-Jet_Propulsion_Laboratory_Plasma_Flow_Research_Lab.jpg",
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
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Istanbul_city_Photos-_Urban_01.jpg/1280px-Istanbul_city_Photos-_Urban_01.jpg",
    yazar: "Mostafameraji",
    lisans: "CC BY-SA 4.0",
    sayfa: "https://commons.wikimedia.org/wiki/File:Istanbul_city_Photos-_Urban_01.jpg",
  },
  Dünya: {
    // Havalimanı terminali (Sofia) sel/afet haberine saçma düşüyordu.
    // Nötr dünya küresi her uluslararası habere uyar.
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e2/Person_holding_world_globe.jpg/1280px-Person_holding_world_globe.jpg",
    yazar: "Porapak Apichodilok",
    lisans: "CC0",
    lisansUrl: "https://creativecommons.org/publicdomain/zero/1.0",
    sayfa: "https://commons.wikimedia.org/wiki/File:Person_holding_world_globe.jpg",
  },
  Diğer: {
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/36/Man_reading_a_newspaper.jpg/1280px-Man_reading_a_newspaper.jpg",
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
    // Kaynağın kendi og:image'ı ölçülerek doğrulandı; dosya adındaki sözcük
    // ("snow", "fire") haber başlığıyla eşleşmese de doğru kare olabilir.
    if (a?.gorselKaynakSite) continue;
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
