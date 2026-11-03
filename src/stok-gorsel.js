// TELİF GÜVENLİ GÖRSELLER (STOK)
//
// NEDEN: Kaynak sitelerin haber fotoğrafları çoğu zaman ajans (AA, Getty, Reuters,
// DHA...) lisanslıdır. Onları hotlink etmek izinsiz kullanımdır; atıf yazmak da
// bunu yasal hâle getirmez. Bu yüzden kaynağın fotoğrafı ARTIK KULLANILMIYOR.
//
// YERİNE: Wikimedia Commons / Openverse'teki YALNIZCA ATIF GEREKTİRMEYEN
// dosyalar (CC0 / kamu malı / "no restrictions"). CC BY ve CC BY-SA bilinçli
// olarak KULLANILMAZ: bu lisanslar atıf şartı getirir, sitede ise hiçbir yerde
// görsel kredisi gösterilmiyor. Böylece:
//   * izinsiz fotoğraf yok (telif/DMCA riski yok),
//   * atıf yükümlülüğü de yok (lisansla çelişen bir durum kalmıyor),
//   * API anahtarı / ücretli hesap gerekmiyor (0 $ bütçe).
//
// Fotoğrafçı ve lisans bilgisi veri dosyasında (`gorselKaynak` / `gorselEk`)
// iç kayıt olarak durur; arşivdeki eski CC BY kapakların toplu atıf kaydı
// `/gorsel-kaynaklari/` sayfasında yayınlanır.
//
// Görsel seçimi habere özeldir: AI, haberi anlatan İngilizce bir arama sorgusu
// üretir (gorselSorgu). Sorgu boşsa etiketler, sonra kategori sorgusu denenir.

const UA = "HaberinaiBot/1.0 (+https://haberinai.site; iletisim@haberinai.site)";
const COMMONS = "https://commons.wikimedia.org/w/api.php";

// Yalnızca ATIF GEREKTİRMEYEN lisanslar: CC0, kamu malı, "no restrictions".
// CC BY / CC BY-SA kullanılmaz: sitede görsel kredisi gösterilmediği için atıf
// yükümlülüğü doğar. GFDL, "fair use", "non-free" vb. zaten kabul edilmez.
const IZINLI_LISANS =
  /^(cc0\b|public domain\b|pd\b|pd[- ].*|no restrictions\b)/i;

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
  "Teknoloji": [
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
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/12/Caviar_2340_Hard_Drive_Circuit_Board_Side_2.jpg/1280px-Caviar_2340_Hard_Drive_Circuit_Board_Side_2.jpg",
      yazar: "ComputerUserUser",
      lisans: "CC0",
      lisansUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sayfa: "https://commons.wikimedia.org/wiki/File:Caviar_2340_Hard_Drive_Circuit_Board_Side_2.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a4/Caviar_2340_Hard_Drive_Circuit_Board_Side_1.jpg/1280px-Caviar_2340_Hard_Drive_Circuit_Board_Side_1.jpg",
      yazar: "ComputerUserUser",
      lisans: "CC0",
      lisansUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sayfa: "https://commons.wikimedia.org/wiki/File:Caviar_2340_Hard_Drive_Circuit_Board_Side_1.jpg",
    },
  ],
  "Mobil": [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cc/Black_smartphone_in_hand_%28Unsplash%29.jpg/1280px-Black_smartphone_in_hand_%28Unsplash%29.jpg",
      yazar: "Dennis Cortés",
      lisans: "CC0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Black_smartphone_in_hand_(Unsplash).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/93/Smartphone_in_Hand_%28Unsplash%29.jpg/1280px-Smartphone_in_Hand_%28Unsplash%29.jpg",
      yazar: "NeONBRAND neonbrand",
      lisans: "CC0",
      lisansUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sayfa: "https://commons.wikimedia.org/wiki/File:Smartphone_in_Hand_(Unsplash).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cc/Smartphone-mobile-hand-technology-internet-finger.jpg/1280px-Smartphone-mobile-hand-technology-internet-finger.jpg",
      yazar: "",
      lisans: "CC0",
      lisansUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sayfa: "https://commons.wikimedia.org/wiki/File:Smartphone-mobile-hand-technology-internet-finger.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3c/SZ_Shenzhen_man_in_white_shirt_long_sleeve_May_2024_R12S_human_hand_holding_smartphone.jpg/1280px-SZ_Shenzhen_man_in_white_shirt_long_sleeve_May_2024_R12S_human_hand_holding_smartphone.jpg",
      yazar: "TANNMY NAISZE Wanguo",
      lisans: "CC0",
      lisansUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sayfa: "https://commons.wikimedia.org/wiki/File:SZ_Shenzhen_man_in_white_shirt_long_sleeve_May_2024_R12S_human_hand_holding_smartphone.jpg",
    },
  ],
  "Oyun": [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c4/Mongolian_Prime_Minister_Oyun-Erdene_Signs_Secretary_Blinken%27s_Guestbook.jpg/1280px-Mongolian_Prime_Minister_Oyun-Erdene_Signs_Secretary_Blinken%27s_Guestbook.jpg",
      yazar: "U.S. Department of State",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:Mongolian_Prime_Minister_Oyun-Erdene_Signs_Secretary_Blinken%27s_Guestbook.jpg",
    },
  ],
  "Donanım": [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/af/Graphics_Card_Upgrading_-_49259431802.jpg/1280px-Graphics_Card_Upgrading_-_49259431802.jpg",
      yazar: "Keijiro Takahashi",
      lisans: "CC0",
      lisansUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sayfa: "https://commons.wikimedia.org/wiki/File:Graphics_Card_Upgrading_-_49259431802.jpg",
    },
  ],
  "İnternet": [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b2/Data_center_infrastructure_in_the_United_States.jpg/1280px-Data_center_infrastructure_in_the_United_States.jpg",
      yazar: "DOE / National Renewable Energy Laboratory (NREL)",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:Data_center_infrastructure_in_the_United_States.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f5/Data_center_roof.jpg/1280px-Data_center_roof.jpg",
      yazar: "Rsparks3",
      lisans: "CC0",
      lisansUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sayfa: "https://commons.wikimedia.org/wiki/File:Data_center_roof.jpg",
    },
  ],
  "Bilim": [
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
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/49/View_of_scientist_looking_at_a_Surveyor_III_components_with_a_microscope_in_a_Lunar_Receiving_Laboratory_sterile_vacuum_cabinet_%28s70-22401%29.jpg/1280px-View_of_scientist_looking_at_a_Surveyor_III_components_with_a_microscope_in_a_Lunar_Receiving_Laboratory_sterile_vacuum_cabinet_%28s70-22401%29.jpg",
      yazar: "NASA",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:View_of_scientist_looking_at_a_Surveyor_III_components_with_a_microscope_in_a_Lunar_Receiving_Laboratory_sterile_vacuum_cabinet_(s70-22401).jpg",
    },
  ],
  "Uzay": [
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
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6d/Corridor_on_the_second_level_-_N%C3%84L_hospital_1.jpg/1280px-Corridor_on_the_second_level_-_N%C3%84L_hospital_1.jpg",
      yazar: "W.carter",
      lisans: "CC0",
      lisansUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sayfa: "https://commons.wikimedia.org/wiki/File:Corridor_on_the_second_level_-_N%C3%84L_hospital_1.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0a/Doctor_examines_patient_with_stethoscope.jpg/1280px-Doctor_examines_patient_with_stethoscope.jpg",
      yazar: "Unknown photographer",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:Doctor_examines_patient_with_stethoscope.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7b/Doctor_examines_patient_with_stethoscope_%281%29.jpg/1280px-Doctor_examines_patient_with_stethoscope_%281%29.jpg",
      yazar: "Unknown photographer",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:Doctor_examines_patient_with_stethoscope_(1).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7b/Doctor_examines_patient_with_stethoscope_%282%29.jpg/1280px-Doctor_examines_patient_with_stethoscope_%282%29.jpg",
      yazar: "Unknown photographer",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:Doctor_examines_patient_with_stethoscope_(2).jpg",
    },
  ],
  "Otomobil": [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3d/Charging_station_for_electric_cars._Strzelecka_24-26_Street%2C_Tomasz%C3%B3w_Mazowiecki%2C_Poland.jpg/1280px-Charging_station_for_electric_cars._Strzelecka_24-26_Street%2C_Tomasz%C3%B3w_Mazowiecki%2C_Poland.jpg",
      yazar: "WrS.tm.pl",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:Charging_station_for_electric_cars._Strzelecka_24-26_Street,_Tomasz%C3%B3w_Mazowiecki,_Poland.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/af/Tesla_3_charging_at_the_electric_car_charging_station_in_Tomasz%C3%B3w_Mazowiecki%2C_Ko%C5%9Bciuszki_11_Square._October_24%2C_2024.jpg/1280px-Tesla_3_charging_at_the_electric_car_charging_station_in_Tomasz%C3%B3w_Mazowiecki%2C_Ko%C5%9Bciuszki_11_Square._October_24%2C_2024.jpg",
      yazar: "WrS.tm.pl",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:Tesla_3_charging_at_the_electric_car_charging_station_in_Tomasz%C3%B3w_Mazowiecki,_Ko%C5%9Bciuszki_11_Square._October_24,_2024.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/36/Lidl_Charging_Station_for_electric_cars_in_Tomasz%C3%B3w_Mazowiecki%2C_Poland.jpg/1280px-Lidl_Charging_Station_for_electric_cars_in_Tomasz%C3%B3w_Mazowiecki%2C_Poland.jpg",
      yazar: "WrS.tm.pl",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:Lidl_Charging_Station_for_electric_cars_in_Tomasz%C3%B3w_Mazowiecki,_Poland.jpg",
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
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f9/Magnuson_Park_Walking_Tour_%2827353428293%29.jpg/1280px-Magnuson_Park_Walking_Tour_%2827353428293%29.jpg",
      yazar: "Seattle City Council from Seattle",
      lisans: "CC0",
      lisansUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sayfa: "https://commons.wikimedia.org/wiki/File:Magnuson_Park_Walking_Tour_(27353428293).jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8a/Magnuson_Park_Walking_Tour_%2827966929405%29.jpg/1280px-Magnuson_Park_Walking_Tour_%2827966929405%29.jpg",
      yazar: "Seattle City Council from Seattle",
      lisans: "CC0",
      lisansUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sayfa: "https://commons.wikimedia.org/wiki/File:Magnuson_Park_Walking_Tour_(27966929405).jpg",
    },
  ],
  "Ekonomi": [
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
  "Spor": [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c7/1926_02_25_Gol_Spor_Fenerbahce_Galatasaray_Karmasi.jpg/1280px-1926_02_25_Gol_Spor_Fenerbahce_Galatasaray_Karmasi.jpg",
      yazar: "Gol Spor Dergisi",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:1926_02_25_Gol_Spor_Fenerbahce_Galatasaray_Karmasi.jpg",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/2/20/1925_06_23_Gol_Spor_Fenerbahce_Sahaya_Cikiyor.jpg",
      yazar: "Gol Spor Dergisi",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:1925_06_23_Gol_Spor_Fenerbahce_Sahaya_Cikiyor.jpg",
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
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5f/World_globe_%28Unsplash_gEKMstKfZ6w%29.jpg/1280px-World_globe_%28Unsplash_gEKMstKfZ6w%29.jpg",
      yazar: "Ben White benwhitephotography",
      lisans: "CC0",
      lisansUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sayfa: "https://commons.wikimedia.org/wiki/File:World_globe_(Unsplash_gEKMstKfZ6w).jpg",
    },
  ],
  "Diğer": [
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/14/Interior_view_of_newspaper_delivery_room_showing_man_taking_stack_of_newspapers_from_machine%29_-_World-Telegram_photo_LCCN95506971.jpg/1280px-Interior_view_of_newspaper_delivery_room_showing_man_taking_stack_of_newspapers_from_machine%29_-_World-Telegram_photo_LCCN95506971.jpg",
      yazar: "Miscellaneous Items in High Demand, PPOC, Library of Congress",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:Interior_view_of_newspaper_delivery_room_showing_man_taking_stack_of_newspapers_from_machine)_-_World-Telegram_photo_LCCN95506971.jpg",
    },
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6d/Business_Woman_is_reading_Newspaper_-_35870943420.jpg/1280px-Business_Woman_is_reading_Newspaper_-_35870943420.jpg",
      yazar: "tranmautritam (tranmautritam.com / unsplash.com/@tranmautritam)",
      lisans: "CC0",
      lisansUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sayfa: "https://commons.wikimedia.org/wiki/File:Business_Woman_is_reading_Newspaper_-_35870943420.jpg",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/0/0c/StateLibQld_1_201763_Elderly_woman_reading_the_newspaper%2C_1930-1940.jpg",
      yazar: "Item is held by John Oxley Library, State Library of Queensland",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:StateLibQld_1_201763_Elderly_woman_reading_the_newspaper,_1930-1940.jpg",
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
  // ATIF GEREKTİRMEYEN kareler yeğlenir. Havuzda CC BY / CC BY-SA kayıtları
  // var; sitede görsel kredisi gösterilmediği için onlar kullanılamaz. Uygun
  // kare yoksa null döner ve çağıran taraf markalı tasarım kartına geçer.
  const uygun = (g) => IZINLI_LISANS.test(String(g?.lisans || "").trim());
  const temiz = (havuz || []).filter(uygun);
  const genel = YEDEK_GORSEL.Diğer.filter(uygun);
  const secili =
    (temiz.length ? temiz[tohumSayi(tohum) % temiz.length] : null) ||
    (genel.length ? genel[tohumSayi(tohum) % genel.length] : null);
  if (!secili) return null;
  return {
    ...secili,
    genislik: 1400,
    yukseklik: 933,
    dosya: String(secili.sayfa || "").split("File:").pop(),
  };
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
