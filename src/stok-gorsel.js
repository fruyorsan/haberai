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
  /\b(flood|flooding|earthquake|quake|wildfire|storm|hurricane|typhoon|cyclone|drought|blizzard|avalanche|eruption|tsunami|fire)\b|(?<![\p{L}])sel(?![\p{L}])|su baskını|deprem|sarsıntı|yangın|fırtına|hortum|kuraklık|heyelan|(?<![\p{L}])çığ(?!lık)/iu;

// Afet/hava sorgusunda fotoğrafın adında da afet izi olmalı. Yoksa "sahil
// manzarası" gibi sakin bir kare, "deprem" haberine kapak oluyordu.
// Kök eşleşmesi (sondaki \b yok): "collapsed", "damaged", "burning" de yakalanır.
const FELAKET_GORSEL =
  /\b(flood|inundat|earthquake|quake|fire|burn|blaze|storm|hurricane|typhoon|cyclone|damag|destro|rubble|collaps|rescue|drought|blizzard|snowstorm|avalanche|eruption|lava|wreck|seismograph|seismogram|tectonic)\b|fault line/i;

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
    // Çığ, kar kuralından ÖNCE: aksi hâlde çığ haberi "kar kaplı sokak"
    // fotoğrafına düşüyor ve afet filtresi (FELAKET_GORSEL) onu eliyordu.
    test: /((?<![\p{L}])çığ(?!lık)|avalanche)/iu,
    sorgu: "avalanche snow mountain",
  },
  {
    // KAR, SELDEN ÖNCE bakılır: "snowstorm" içinde "storm" geçtiği için
    // sel kuralı önce çalışınca kar haberi "flooded street cars" sorgusuna
    // düşüyordu (kar haberi + sel fotoğrafı).
    // "ice" tam sözcük aranır: "office", "service", "police", "device"
    // sözcüklerinin içine denk gelip spor/ekonomi haberine karlı araba
    // fotoğrafı koyuyordu ("Sergen Yalcin TFF office meeting").
    test: /(\bsnow\b|blizzard|snowstorm|\bfrost\b|\bice\b|\bicy\b|kar yağışı|(?<![\p{L}])çığ(?!lık))/iu,
    sorgu: "snow covered street cars",
  },
  {
    // "rain" tek başına "train", "brain" içine denk geliyordu; "storm" da
    // "brainstorm" içine. Tam sözcük olarak aranır. "flood" da tam sözcük:
    // "floodlights" (stadyum ışığı) spor haberini sel haberine çeviriyordu.
    test: /(\bflood(?:s|ed|ing)?\b|\brain\b|\brainfall\b|\bstorm\b|downpour|hurricane|typhoon|monsoon|(?<![\p{L}])sel(?![\p{L}])|su baskını|sağanak|yağış|fırtına|hortum)/iu,
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
  {
    // Savunma/silah haberleri: kategori yedeği (şehir sokağı) yerine konuya
    // uygun bir füze/savunma karesi seçilir. "roket" uzay haberlerini de
    // kapsar; uzay fotoğrafı burada da doğru bağlamdır.
    test: /(füze|balistik|missile|ballistic|hava savunma|air defense|roketatar)/i,
    sorgu: "missile rocket launch",
  },
  {
    // "military drone" Commons'ta neredeyse hiç dosya adıyla eşleşmiyordu ve
    // İHA haberi nehir fotoğrafına düşüyordu; genel UAV sorgusu isabetli.
    test: /(SİHA|İHA|insansız hava|\bUAV\b|\bdrone\b)/i,
    sorgu: "unmanned aerial vehicle",
  },
  {
    test: /(dang humması|sivrisinek|mosquito|dengue|sıtma|malaria)/i,
    sorgu: "mosquito",
  },
  {
    test: /(hürmüz|hormuz)/i,
    sorgu: "Strait of Hormuz",
  },
  {
    test: /(led ekran|oled|ekran|display technology|\bdisplay\b)/i,
    sorgu: "LED display screen",
  },
  {
    test: /(protesto|gösteri|eylem|protest|demonstration)/i,
    sorgu: "protest crowd street",
  },
  {
    test: /(seçim|sandık|seçmen|election|ballot)/i,
    sorgu: "election voting ballot",
  },
  {
    // Savunma bütçesi/harcama haberleri: banknot yerine NATO/AB bayrağı ve
    // zirve görüntüsü konuyu daha iyi anlatıyor.
    test: /(savunma bütçe|savunma harcama|defense budget|defence budget|askeri harcama|military spending)/i,
    sorgu: "NATO flags summit",
  },
  {
    // Enerji fiyatı şoku: "enflasyon" kuralından önce bakılır, banknot yerine
    // rafineri/petrol tesisi fotoğrafı seçilir.
    test: /(enerji fiyat|petrol fiyat|doğal gaz fiyat|energy price|oil price|gas price)/i,
    sorgu: "oil refinery energy",
  },
  {
    test: /(bütçe|enflasyon|faiz|vergi|ekonomi|inflation|budget)/i,
    sorgu: "money finance economy",
  },
  {
    test: /(futbol|maç|futbolcu|teknik direktör|soccer|football)/i,
    sorgu: "football stadium match",
  },
];

/**
 * Başlık afet/hava haberi mi?
 *
 * Yalnızca başlığa bakılır: özetlerde geçen "bütçede deprem güvenliği" gibi
 * yan ifadeler haberi afet sanıp konuyla ilgisiz tüm fotoğrafları eliyordu.
 * Afet haberlerinde deprem/sel/yangın gibi sözcük zaten başlıkta olur.
 */
export function afetMi(baslik, ..._ek) {
  return AFET_SORGU.test(String(baslik || ""));
}

/**
 * Başlığın başındaki kişi adı ("Haydar Baş: ...", "Trump, ...").
 *
 * Commons'ta pek çok tanınmış kişinin serbest lisanslı portresi var; haber
 * başlığı doğrudan bir kişiyle başlıyorsa o kişinin fotoğrafı, konu
 * kurallarından (ör. "ekonomi" → banknot) daha doğru bir kapaktır.
 */
function basliktakiKisi(baslik) {
  const m = /^\s*([A-ZÇĞİÖŞÜ][\p{L}'’.-]+(?:\s+[A-ZÇĞİÖŞÜ][\p{L}'’.-]+){1,2})\s*[:,–—]/u.exec(
    String(baslik || "")
  );
  if (!m) return "";
  const ad = m[1].trim();
  // Kısaltma içeren adlar kişi değil, kurum/marka: "Netze BW, 15 kW..." →
  // "Netze BW" kişi sanılıp Commons'ta Almanca "Netze" (ağ) fotoğrafları
  // aranıyordu.
  if (ad.split(/\s+/).some((t) => /^[A-ZÇĞİÖŞÜ]{2,5}$/u.test(t))) return "";
  // Kurum/kuruluş adları kişi değildir: "İran Ordusu, ..." → kişi araması yapma.
  if (/(Ordusu|Bakanlığı|Bakanı|Hükümeti|Meclisi|Konseyi|Üniversitesi|Şirketi|Ajansı|Bankası|Partisi|Vakfı|Derneği|Kulübü|Belediyesi|Komisyonu|Kurumu|Enstitüsü|Merkezi|Federasyonu|Birliği)$/u.test(ad))
    return "";
  return ad;
}

/** Verilen sorguya uyan konu sorgusunu döndürür (yoksa ""). */
export function konuSorgu(...metinler) {
  // Metinlerden biri bir kişi adıyla başlıyorsa (genelde haber başlığı) önce
  // o kişi aranır. Sıra önemli değil: İngilizce arama sorgusu bu kalıba
  // ("Ad Soyad:") nadiren uyar.
  for (const m of metinler) {
    const kisi = basliktakiKisi(m);
    if (kisi) return kisi;
  }
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
  // Yalnızca anlamlı sorgular: boş metin veya "photo"/"image" gibi tek başına
  // hiçbir konu belirtmeyen sözcükler Commons'ta rastgele dosya döndürür.
  // (İkinci turda "" + " photo" sorgusu 1.000'den fazla habere aynı havalimanı
  // fotoğrafını koymuştu.)
  const GENEL = new Set([
    "photo",
    "photos",
    "image",
    "images",
    "picture",
    "pictures",
    "news",
    "stock",
    "file",
    "jpg",
    "jpeg",
  ]);
  const anlamli = (s) =>
    s.length >= 3 && s.split(/\s+/).some((w) => w.length >= 3 && !GENEL.has(w.toLowerCase()));
  const temizSorgular = [
    ...new Set(
      (sorgular || [])
        .map((s) => String(s || "").trim())
        .filter(anlamli)
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
  Teknoloji: [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3b/Close-up_view_of_a_circuit_board_being_held_near_an_air_conditioning_unit_in_a_contemporary_indoor_environment.jpg/1280px-Close-up_view_of_a_circuit_board_being_held_near_an_air_conditioning_unit_in_a_contemporary_indoor_environment.jpg",
      yazar: "Shixart1985",
      lisans: "CC BY 2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Close-up_view_of_a_circuit_board_being_held_near_an_air_conditioning_unit_in_a_contemporary_indoor_environment.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ee/Close-up_of_a_VHS_Player_Circuit_Board.jpg/1280px-Close-up_of_a_VHS_Player_Circuit_Board.jpg",
      yazar: "DiscoA340",
      lisans: "CC0",
      lisansUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sayfa: "https://commons.wikimedia.org/wiki/File:Close-up_of_a_VHS_Player_Circuit_Board.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ee/Close-up_of_a_VHS_Player_Circuit_Board_2.jpg/1280px-Close-up_of_a_VHS_Player_Circuit_Board_2.jpg",
      yazar: "DiscoA340",
      lisans: "CC0",
      lisansUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sayfa: "https://commons.wikimedia.org/wiki/File:Close-up_of_a_VHS_Player_Circuit_Board_2.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c4/Macro_circuit_board.JPG/1280px-Macro_circuit_board.JPG",
      yazar: "Ingo Dierking",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Macro_circuit_board.JPG",
    },
  ],
  "Yapay Zeka": [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2d/Artificial_Intelligence_%28AI%29_and_Robotics_exhibition_at_the_Heinz_Nixdorf_MuseumsForum.jpg/1280px-Artificial_Intelligence_%28AI%29_and_Robotics_exhibition_at_the_Heinz_Nixdorf_MuseumsForum.jpg",
      yazar: "Sergei Magel/HNF",
      lisans: "CC BY-SA 4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Artificial_Intelligence_(AI)_and_Robotics_exhibition_at_the_Heinz_Nixdorf_MuseumsForum.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f2/Is_artificial_intelligence_our_future.jpg/1280px-Is_artificial_intelligence_our_future.jpg",
      yazar: "Elekes Andor",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Is_artificial_intelligence_our_future.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/08/Robot_hand_-_VivaTech_%2847816344952%29.jpg/1280px-Robot_hand_-_VivaTech_%2847816344952%29.jpg",
      yazar: "Jérémy Barande",
      lisans: "CC BY-SA 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Robot_hand_-_VivaTech_(47816344952).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/43/Neural_Network_Identifies_Stars.jpg/1280px-Neural_Network_Identifies_Stars.jpg",
      yazar: "Dennis",
      lisans: "CC BY 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Neural_Network_Identifies_Stars.jpg",
    },
  ],
  Mobil: [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cc/Black_smartphone_in_hand_%28Unsplash%29.jpg/1280px-Black_smartphone_in_hand_%28Unsplash%29.jpg",
      yazar: "Dennis Cortés",
      lisans: "CC0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Black_smartphone_in_hand_(Unsplash).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d9/Hand_holding_smartphone_with_ChatGPT_and_OpenAI_text_%2852917312010%29.jpg/1280px-Hand_holding_smartphone_with_ChatGPT_and_OpenAI_text_%2852917312010%29.jpg",
      yazar: "Jernej Furman from Slovenia",
      lisans: "CC BY 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Hand_holding_smartphone_with_ChatGPT_and_OpenAI_text_(52917312010).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d6/Hand_holding_smartphone_with_ChatGPT_%2852917076309%29.jpg/1280px-Hand_holding_smartphone_with_ChatGPT_%2852917076309%29.jpg",
      yazar: "Jernej Furman from Slovenia",
      lisans: "CC BY 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Hand_holding_smartphone_with_ChatGPT_(52917076309).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/09/Business_and_technology_concept_hand_holding_smartphone_and_search_bar_%2852917310335%29.jpg/1280px-Business_and_technology_concept_hand_holding_smartphone_and_search_bar_%2852917310335%29.jpg",
      yazar: "Jernej Furman from Slovenia",
      lisans: "CC BY 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Business_and_technology_concept_hand_holding_smartphone_and_search_bar_(52917310335).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6e/Hand_holding_smartphone_with_blank_white_screen.jpg/1280px-Hand_holding_smartphone_with_blank_white_screen.jpg",
      yazar: "Santeri Viinamäki",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Hand_holding_smartphone_with_blank_white_screen.jpg",
    },
  ],
  Oyun: [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4b/Hands_holding_video_game_controller_%2850811892858%29.jpg/1280px-Hands_holding_video_game_controller_%2850811892858%29.jpg",
      yazar: "Vu Hoang",
      lisans: "CC BY 2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Hands_holding_video_game_controller_(50811892858).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Teletenis_Compact_Color_Video_Game_-_Detached_controllers.jpg/1280px-Teletenis_Compact_Color_Video_Game_-_Detached_controllers.jpg",
      yazar: "José Antonio Ortigueira Amor",
      lisans: "CC BY 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Teletenis_Compact_Color_Video_Game_-_Detached_controllers.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5c/Tele-Partner_Video_game_-_Tank_Battle_-_No_controllers.jpg/1280px-Tele-Partner_Video_game_-_Tank_Battle_-_No_controllers.jpg",
      yazar: "José Antonio Ortigueira Amor",
      lisans: "CC BY 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Tele-Partner_Video_game_-_Tank_Battle_-_No_controllers.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/31/Gaming_PC-Setup_-_Astaroth-_The_Completed_System.jpg/1280px-Gaming_PC-Setup_-_Astaroth-_The_Completed_System.jpg",
      yazar: "Brian Wong",
      lisans: "CC BY-SA 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Gaming_PC-Setup_-_Astaroth-_The_Completed_System.jpg",
    },
  ],
  "Donanım": [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/33/H%C3%A5kan_Lans_computer_color_graphics_card_Datacolor.jpg/1280px-H%C3%A5kan_Lans_computer_color_graphics_card_Datacolor.jpg",
      yazar: "Agnes Andersson",
      lisans: "CC BY 4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:H%C3%A5kan_Lans_computer_color_graphics_card_Datacolor.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/98/Elsa_Victory_3d_Graphics_Card_%2878786593%29.jpeg/1280px-Elsa_Victory_3d_Graphics_Card_%2878786593%29.jpeg",
      yazar: "Dennis Lamczak",
      lisans: "CC BY-SA 3.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Elsa_Victory_3d_Graphics_Card_(78786593).jpeg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/38/ASUS_NVIDIA_GeForce_210_silent_graphics_card_with_HDMI.JPG/1280px-ASUS_NVIDIA_GeForce_210_silent_graphics_card_with_HDMI.JPG",
      yazar: "Joydeep",
      lisans: "CC BY-SA 3.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:ASUS_NVIDIA_GeForce_210_silent_graphics_card_with_HDMI.JPG",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/af/Graphics_Card_Upgrading_-_49259431802.jpg/1280px-Graphics_Card_Upgrading_-_49259431802.jpg",
      yazar: "Keijiro Takahashi",
      lisans: "CC0",
      lisansUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sayfa: "https://commons.wikimedia.org/wiki/File:Graphics_Card_Upgrading_-_49259431802.jpg",
    },
  ],
  "Yazılım": [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ef/Programming_code.jpg/1280px-Programming_code.jpg",
      yazar: "Martin Vorel",
      lisans: "CC BY-SA 4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Programming_code.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2a/Screen-python-code-matplotlib-physics-simulation.jpg/1280px-Screen-python-code-matplotlib-physics-simulation.jpg",
      yazar: "MikeRun",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Screen-python-code-matplotlib-physics-simulation.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/67/Software_Developer_at_work_01.jpg/1280px-Software_Developer_at_work_01.jpg",
      yazar: "Daudi mukiibi",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Software_Developer_at_work_01.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/33/Software_Developer_at_work_02.jpg/1280px-Software_Developer_at_work_02.jpg",
      yazar: "Daudi mukiibi",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Software_Developer_at_work_02.jpg",
    },
  ],
  "İnternet": [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b0/Duga-1_radar_data_center_interior_server_room_2018.jpg/1280px-Duga-1_radar_data_center_interior_server_room_2018.jpg",
      yazar: "Joël van der Loo",
      lisans: "CC BY-SA 4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Duga-1_radar_data_center_interior_server_room_2018.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/57/Data_Center_of_CNPC.jpg/1280px-Data_Center_of_CNPC.jpg",
      yazar: "Charlie fong",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Data_Center_of_CNPC.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e1/Una_batteria_di_grossi_generatori_alimentati_a_gasolio_in_un_Data_Center_in_via_di_ultimazione.jpg/1280px-Una_batteria_di_grossi_generatori_alimentati_a_gasolio_in_un_Data_Center_in_via_di_ultimazione.jpg",
      yazar: "Lapalmauz",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Una_batteria_di_grossi_generatori_alimentati_a_gasolio_in_un_Data_Center_in_via_di_ultimazione.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b2/Data_center_infrastructure_in_the_United_States.jpg/1280px-Data_center_infrastructure_in_the_United_States.jpg",
      yazar: "DOE / National Renewable Energy Laboratory (NREL)",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:Data_center_infrastructure_in_the_United_States.jpg",
    },
  ],
  Bilim: [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/93/Jet_Propulsion_Laboratory_Plasma_Flow_Research_Lab.jpg/1280px-Jet_Propulsion_Laboratory_Plasma_Flow_Research_Lab.jpg",
      yazar: "NASA",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:Jet_Propulsion_Laboratory_Plasma_Flow_Research_Lab.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9e/Supercharger_Research_at_the_Aircraft_Engine_Research_Laboratory_%28GRC-1944-C-03814%29.jpg/1280px-Supercharger_Research_at_the_Aircraft_Engine_Research_Laboratory_%28GRC-1944-C-03814%29.jpg",
      yazar: "NASA Glenn Research Center",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:Supercharger_Research_at_the_Aircraft_Engine_Research_Laboratory_(GRC-1944-C-03814).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/04/Light_Microscope_in_the_bacteriological_laboratory%2C_Minneapolis_Health_Department.jpg/1280px-Light_Microscope_in_the_bacteriological_laboratory%2C_Minneapolis_Health_Department.jpg",
      yazar: "City of Minneapolis Archives",
      lisans: "CC BY 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Light_Microscope_in_the_bacteriological_laboratory,_Minneapolis_Health_Department.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/49/View_of_scientist_looking_at_a_Surveyor_III_components_with_a_microscope_in_a_Lunar_Receiving_Laboratory_sterile_vacuum_cabinet_%28s70-22401%29.jpg/1280px-View_of_scientist_looking_at_a_Surveyor_III_components_with_a_microscope_in_a_Lunar_Receiving_Laboratory_sterile_vacuum_cabinet_%28s70-22401%29.jpg",
      yazar: "NASA",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:View_of_scientist_looking_at_a_Surveyor_III_components_with_a_microscope_in_a_Lunar_Receiving_Laboratory_sterile_vacuum_cabinet_(s70-22401).jpg",
    },
  ],
  Uzay: [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b9/Artemis_I_Launch_%28NHQ202211160017%29.jpg/1280px-Artemis_I_Launch_%28NHQ202211160017%29.jpg",
      yazar: "Joel Kowsky",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:Artemis_I_Launch_(NHQ202211160017).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b8/SES-10_Launch_-_world%27s_first_reflight_of_an_orbital_class_rocket_%2833361035200%29.jpg/1280px-SES-10_Launch_-_world%27s_first_reflight_of_an_orbital_class_rocket_%2833361035200%29.jpg",
      yazar: "SpaceX",
      lisans: "CC0",
      lisansUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sayfa: "https://commons.wikimedia.org/wiki/File:SES-10_Launch_-_world%27s_first_reflight_of_an_orbital_class_rocket_(33361035200).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d9/Rocket_launch_remains.jpg/1280px-Rocket_launch_remains.jpg",
      yazar: "Gocsmán Benedek",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Rocket_launch_remains.jpg",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/1/10/Expedition_7_Soyuz_Rocket_Launch_From_Baikonur%2C_Kazakhstan.jpg",
      yazar: "NASA",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:Expedition_7_Soyuz_Rocket_Launch_From_Baikonur,_Kazakhstan.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/da/NISAR_satellite_orbit_%28SVS5615_-_2415%29.jpg/1280px-NISAR_satellite_orbit_%28SVS5615_-_2415%29.jpg",
      yazar: "NASA's Scientific Visualization Studio - Science and Technology Cor…",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:NISAR_satellite_orbit_(SVS5615_-_2415).jpg",
    },
  ],
  "Sağlık": [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0c/Keynsham_Hospital%2C_Claude_Harrison_Ward.jpg/1280px-Keynsham_Hospital%2C_Claude_Harrison_Ward.jpg",
      yazar: "Rwendland",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Keynsham_Hospital,_Claude_Harrison_Ward.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/71/Corridor%2C_Amersham_Hospital_-_geograph.org.uk_-_7628891.jpg/1280px-Corridor%2C_Amersham_Hospital_-_geograph.org.uk_-_7628891.jpg",
      yazar: "Bryn Holmes",
      lisans: "CC BY-SA 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Corridor,_Amersham_Hospital_-_geograph.org.uk_-_7628891.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/04/Corridor_in_Uddevalla_Hospital.jpg/1280px-Corridor_in_Uddevalla_Hospital.jpg",
      yazar: "W.carter",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Corridor_in_Uddevalla_Hospital.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6d/Corridor_on_the_second_level_-_N%C3%84L_hospital_1.jpg/1280px-Corridor_on_the_second_level_-_N%C3%84L_hospital_1.jpg",
      yazar: "W.carter",
      lisans: "CC0",
      lisansUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sayfa: "https://commons.wikimedia.org/wiki/File:Corridor_on_the_second_level_-_N%C3%84L_hospital_1.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/93/Corridor%2C_Nambour_General_Hospital%2C_2025%2C.jpg/1280px-Corridor%2C_Nambour_General_Hospital%2C_2025%2C.jpg",
      yazar: "Chris Olszewski",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Corridor,_Nambour_General_Hospital,_2025,.jpg",
    },
  ],
  "Kültür": [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a4/Gallery-01-Plank_Museum_and_Visitor_Center.jpg/1280px-Gallery-01-Plank_Museum_and_Visitor_Center.jpg",
      yazar: "Myotus",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Gallery-01-Plank_Museum_and_Visitor_Center.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d0/HKU_%E9%A6%99%E6%B8%AF%E5%A4%A7%E5%AD%B8%E7%BE%8E%E8%A1%93%E5%8D%9A%E7%89%A9%E9%A4%A8_University_Museum_and_Art_Gallery_UMAG_hall_visitors_May-2012_Mr_Yeung.JPG/1280px-HKU_%E9%A6%99%E6%B8%AF%E5%A4%A7%E5%AD%B8%E7%BE%8E%E8%A1%93%E5%8D%9A%E7%89%A9%E9%A4%A8_University_Museum_and_Art_Gallery_UMAG_hall_visitors_May-2012_Mr_Yeung.JPG",
      yazar: "Shaibariheis",
      lisans: "CC BY-SA 3.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:HKU_%E9%A6%99%E6%B8%AF%E5%A4%A7%E5%AD%B8%E7%BE%8E%E8%A1%93%E5%8D%9A%E7%89%A9%E9%A4%A8_University_Museum_and_Art_Gallery_UMAG_hall_visitors_May-2012_Mr_Yeung.JPG",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bc/Visitors_in_Gallery_of_Museo_Reina_Sofia_-_Madrid_-_Spain.jpg/1280px-Visitors_in_Gallery_of_Museo_Reina_Sofia_-_Madrid_-_Spain.jpg",
      yazar: "Adam Jones, Ph.D",
      lisans: "CC BY-SA 3.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Visitors_in_Gallery_of_Museo_Reina_Sofia_-_Madrid_-_Spain.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e6/Gallery-02-Plank_Museum_and_Visitor_Center.jpg/1280px-Gallery-02-Plank_Museum_and_Visitor_Center.jpg",
      yazar: "Myotus",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Gallery-02-Plank_Museum_and_Visitor_Center.jpg",
    },
  ],
  Otomobil: [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/42/Electric_car_charging_station%2C_Batman_%28Turkey%29.jpg/1280px-Electric_car_charging_station%2C_Batman_%28Turkey%29.jpg",
      yazar: "Zalasem1",
      lisans: "CC BY 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Electric_car_charging_station,_Batman_(Turkey).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b0/Electric_car_charging_point%2C_Cluster_of_Nuts_car_park%2C_Wetherby_%288th_April_2020%29.jpg/1280px-Electric_car_charging_point%2C_Cluster_of_Nuts_car_park%2C_Wetherby_%288th_April_2020%29.jpg",
      yazar: "Mtaylor848",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Electric_car_charging_point,_Cluster_of_Nuts_car_park,_Wetherby_(8th_April_2020).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3a/Cologne_Germany_Electric-Car-Charging-Point-at-TUV-Rheinland-01.jpg/1280px-Cologne_Germany_Electric-Car-Charging-Point-at-TUV-Rheinland-01.jpg",
      yazar: "CEphoto, Uwe Aranas",
      lisans: "CC BY-SA 3.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Cologne_Germany_Electric-Car-Charging-Point-at-TUV-Rheinland-01.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/30/Electric_car_charging_at_a_station_during_the_day_with_the_charging_cable_connected_to_the_vehicle.jpg/1280px-Electric_car_charging_at_a_station_during_the_day_with_the_charging_cable_connected_to_the_vehicle.jpg",
      yazar: "Shixart1985",
      lisans: "CC BY 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Electric_car_charging_at_a_station_during_the_day_with_the_charging_cable_connected_to_the_vehicle.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e5/Close-up_of_an_electric_car_charging._Traffic_lights_in_a_blurry_background.jpg/1280px-Close-up_of_an_electric_car_charging._Traffic_lights_in_a_blurry_background.jpg",
      yazar: "Ivan Radic",
      lisans: "CC BY 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Close-up_of_an_electric_car_charging._Traffic_lights_in_a_blurry_background.jpg",
    },
  ],
  "Yaşam": [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/72/Family_picnic_Buena_Vista_Lagoon-557488.jpg/1280px-Family_picnic_Buena_Vista_Lagoon-557488.jpg",
      yazar: "Charles O'Rear",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:Family_picnic_Buena_Vista_Lagoon-557488.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/82/People_walking_along_bayside_park_trail_%286968369700%29.jpg/1280px-People_walking_along_bayside_park_trail_%286968369700%29.jpg",
      yazar: "D Coetzee from San Mateo, CA, USA",
      lisans: "CC0",
      lisansUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sayfa: "https://commons.wikimedia.org/wiki/File:People_walking_along_bayside_park_trail_(6968369700).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ae/Gas_Works_Park_people_walking_%2851521274633%29.jpg/1280px-Gas_Works_Park_people_walking_%2851521274633%29.jpg",
      yazar: "Seattle City Council from Seattle",
      lisans: "CC BY 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Gas_Works_Park_people_walking_(51521274633).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a5/People_walking_in_Croome_Park_-_geograph.org.uk_-_8137048.jpg/1280px-People_walking_in_Croome_Park_-_geograph.org.uk_-_8137048.jpg",
      yazar: "Philip Halling",
      lisans: "CC BY-SA 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:People_walking_in_Croome_Park_-_geograph.org.uk_-_8137048.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/78/Three_people_walking_towards_the_Pen_Ponds_-_geograph.org.uk_-_5574215.jpg/1280px-Three_people_walking_towards_the_Pen_Ponds_-_geograph.org.uk_-_5574215.jpg",
      yazar: "Peter S",
      lisans: "CC BY-SA 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Three_people_walking_towards_the_Pen_Ponds_-_geograph.org.uk_-_5574215.jpg",
    },
  ],
  Ekonomi: [
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/7/78/Market_centre_in_Tokyo_stock_exchange.jpg",
      yazar: "ehnmark",
      lisans: "CC BY 2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Market_centre_in_Tokyo_stock_exchange.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/48/Chicago_Stock_Exchange_Trading_Room_%2833194524816%29.jpg/1280px-Chicago_Stock_Exchange_Trading_Room_%2833194524816%29.jpg",
      yazar: "Christian Collins from Midland, MI, United States",
      lisans: "CC BY-SA 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Chicago_Stock_Exchange_Trading_Room_(33194524816).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9e/Chicago_Stock_Exchange_Trading_Room_Reconstruction_at_the_Art_Institute_of_Chicago.jpg/1280px-Chicago_Stock_Exchange_Trading_Room_Reconstruction_at_the_Art_Institute_of_Chicago.jpg",
      yazar: "https://www.artic.edu/artworks/156538/chicago-stock-exchange-tradin…",
      lisans: "CC0",
      lisansUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sayfa: "https://commons.wikimedia.org/wiki/File:Chicago_Stock_Exchange_Trading_Room_Reconstruction_at_the_Art_Institute_of_Chicago.jpg",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/5/5e/New_Toronto_Stock_Exchange_trading_floor.jpg",
      yazar: "Alexandra Studios",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:New_Toronto_Stock_Exchange_trading_floor.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ea/NY_stock_exchange_traders_floor_LC-U9-10548-6.jpg/1280px-NY_stock_exchange_traders_floor_LC-U9-10548-6.jpg",
      yazar: "Thomas J. O'Halloran",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:NY_stock_exchange_traders_floor_LC-U9-10548-6.jpg",
    },
  ],
  Spor: [
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/8/8f/Besiktas_JK_-_Trabzonspor_match.jpg",
      yazar: "ayhang",
      lisans: "CC BY 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Besiktas_JK_-_Trabzonspor_match.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/24/Football_match_at_Wincham_Park_Stadium_%28geograph_4383139%29.jpg/1280px-Football_match_at_Wincham_Park_Stadium_%28geograph_4383139%29.jpg",
      yazar: "Bill Boaden",
      lisans: "CC BY-SA 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Football_match_at_Wincham_Park_Stadium_(geograph_4383139).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/eb/Football_match_at_The_Arriva_Stadium_-_geograph.org.uk_-_4258205.jpg/1280px-Football_match_at_The_Arriva_Stadium_-_geograph.org.uk_-_4258205.jpg",
      yazar: "Bill Boaden",
      lisans: "CC BY-SA 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Football_match_at_The_Arriva_Stadium_-_geograph.org.uk_-_4258205.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b5/Football_match_at_the_i2i_Stadium_-_geograph.org.uk_-_5307336.jpg/1280px-Football_match_at_the_i2i_Stadium_-_geograph.org.uk_-_5307336.jpg",
      yazar: "Bill Boaden",
      lisans: "CC BY-SA 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Football_match_at_the_i2i_Stadium_-_geograph.org.uk_-_5307336.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ad/Football_match_at_the_i2i_Stadium_-_geograph.org.uk_-_5307343.jpg/1280px-Football_match_at_the_i2i_Stadium_-_geograph.org.uk_-_5307343.jpg",
      yazar: "Bill Boaden",
      lisans: "CC BY-SA 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Football_match_at_the_i2i_Stadium_-_geograph.org.uk_-_5307343.jpg",
    },
  ],
  "Gündem": [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Istanbul_city_Photos-_Urban_01.jpg/1280px-Istanbul_city_Photos-_Urban_01.jpg",
      yazar: "Mostafameraji",
      lisans: "CC BY-SA 4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Istanbul_city_Photos-_Urban_01.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7d/Istanbul_city_Photos-_Urban_07.jpg/1280px-Istanbul_city_Photos-_Urban_07.jpg",
      yazar: "Mostafameraji",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Istanbul_city_Photos-_Urban_07.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f6/Istanbul_city_Photos-_Urban_18.jpg/1280px-Istanbul_city_Photos-_Urban_18.jpg",
      yazar: "Mostafameraji",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Istanbul_city_Photos-_Urban_18.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fb/Istanbul_city_Photos-_Urban_24.jpg/1280px-Istanbul_city_Photos-_Urban_24.jpg",
      yazar: "Mostafameraji",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Istanbul_city_Photos-_Urban_24.jpg",
    },
  ],
  "Dünya": [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e2/Person_holding_world_globe.jpg/1280px-Person_holding_world_globe.jpg",
      yazar: "Porapak Apichodilok",
      lisans: "CC0",
      lisansUrl: "https://creativecommons.org/publicdomain/zero/1.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Person_holding_world_globe.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c6/Globe_of_the_Ancient_World_1977.jpg/1280px-Globe_of_the_Ancient_World_1977.jpg",
      yazar: "DavidHalpernist",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Globe_of_the_Ancient_World_1977.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/dc/United_Nations_Building%2C_Geneva_%28Ank_Kumar%29_02.jpg/1280px-United_Nations_Building%2C_Geneva_%28Ank_Kumar%29_02.jpg",
      yazar: "Ank gsx",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:United_Nations_Building,_Geneva_(Ank_Kumar)_02.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c0/United_Nations_Building%2C_Geneva_%28Ank_Kumar%29_01.jpg/1280px-United_Nations_Building%2C_Geneva_%28Ank_Kumar%29_01.jpg",
      yazar: "Ank gsx",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:United_Nations_Building,_Geneva_(Ank_Kumar)_01.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e9/United_Nations_Building%2C_Geneva_%28Ank_Kumar%29_04.jpg/1280px-United_Nations_Building%2C_Geneva_%28Ank_Kumar%29_04.jpg",
      yazar: "Ank gsx",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:United_Nations_Building,_Geneva_(Ank_Kumar)_04.jpg",
    },
  ],
  "Diğer": [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/36/Man_reading_a_newspaper.jpg/1280px-Man_reading_a_newspaper.jpg",
      yazar: "Michael Slaten",
      lisans: "CC BY-SA 4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Man_reading_a_newspaper.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/eb/Newspaper_Stack_%288582618448%29.jpg/1280px-Newspaper_Stack_%288582618448%29.jpg",
      yazar: "Babak Farrokhi from Tehran, IRAN",
      lisans: "CC BY 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Newspaper_Stack_(8582618448).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/14/ASC_Leiden_-_Library_-_South_African_newspaper_stack_of_Die_Burger_-_2012.jpg/1280px-ASC_Leiden_-_Library_-_South_African_newspaper_stack_of_Die_Burger_-_2012.jpg",
      yazar: "African Studies Centre Leiden",
      lisans: "CC BY-SA 4.0",
      lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:ASC_Leiden_-_Library_-_South_African_newspaper_stack_of_Die_Burger_-_2012.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/14/Interior_view_of_newspaper_delivery_room_showing_man_taking_stack_of_newspapers_from_machine%29_-_World-Telegram_photo_LCCN95506971.jpg/1280px-Interior_view_of_newspaper_delivery_room_showing_man_taking_stack_of_newspapers_from_machine%29_-_World-Telegram_photo_LCCN95506971.jpg",
      yazar: "Miscellaneous Items in High Demand, PPOC, Library of Congress",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:Interior_view_of_newspaper_delivery_room_showing_man_taking_stack_of_newspapers_from_machine)_-_World-Telegram_photo_LCCN95506971.jpg",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/b/b8/RNW%27s_newsroom_-_with_the_big_central_desk_%284461774453%29.jpg",
      yazar: "James Cridland from Brisbane, AU",
      lisans: "CC BY 2.0",
      lisansUrl: "https://creativecommons.org/licenses/by/2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:RNW%27s_newsroom_-_with_the_big_central_desk_(4461774453).jpg",
    },
  ],
};

/**
 * Kategori yedeği: havuzdan deterministik seçim.
 *
 * Her kategori için 4 güvenli görsel var; `tohum` (haber id'si/slug) verilirse
 * aynı haber her zaman aynı görseli alır, farklı haberler havuzda dağılır.
 * Böylece tek bir yedek görsel yüzlerce haberde tekrar etmez.
 */
function tohumSayi(tohum) {
  const s = String(tohum || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function yedekGorsel(kategori, tohum = "") {
  const havuz = Array.isArray(YEDEK_GORSEL[kategori]) ? YEDEK_GORSEL[kategori] : null;
  const g = (havuz && havuz.length ? havuz[tohumSayi(tohum) % havuz.length] : null) || YEDEK_GORSEL.Diğer[0];
  return { ...g, genislik: 1400, yukseklik: 933, dosya: String(g.sayfa || "").split("File:").pop() };
}

/** Verilen adres kategori yedek havuzundaki görsellerden biri mi? */
export function yedekMi(url) {
  const u = String(url || "");
  if (!u) return false;
  for (const havuz of Object.values(YEDEK_GORSEL)) {
    if (Array.isArray(havuz) && havuz.some((g) => g.url === u)) return true;
  }
  return false;
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
    const yedek = yedekGorsel(a.category, a.id);
    if (!yedek?.url) continue;
    a.image = yedek.url;
    a.gorselKaynak = atif(yedek);
    sayi++;
  }
  return sayi;
}
