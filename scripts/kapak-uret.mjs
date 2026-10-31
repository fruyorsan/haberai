// ==========================================================================
// MARKALI KAPAK ÜRETİCİ (16:9, 1280×720)
// --------------------------------------------------------------------------
// NEDEN: Kapak fotoğrafları rastgele Wikimedia kareleriydi; boyut, oran ve
// tipografi haberden habere değişiyordu. Feed'de (Discover, WhatsApp, X,
// Telegram) tutarsız görünüm tıklamayı düşürüyor.
//
// NE YAPAR: Haberin kendi fotoğrafını (kaynak sayfanın og:image'i ya da
// yazı içindeki fotoğraflar) aday olarak toplar, aralarından GÖZE EN İYİ
// GÖRÜNENİ seçer (çözünürlük, ayrıntı, parlaklık, renklilik, 16:9'a yakınlık),
// 1280×720'ye kırpar ve `site/public/kapak/<id>.webp` olarak yazar. Fotoğraflı
// kapaklarda metin YOKTUR: kare konuyu anlatır, gözü başlığa bırakır. Hiçbir
// aday yeterli değilse kategori etiketi + başlık basılan tasarımlı kart üretilir.
//
// TELİF: Taban fotoğraf değişmez, yalnızca kırpılıp hafifçe canlandırılır.
// Atıf `gorselKaynak` alanında korunur; kullanılan fotoğrafın adresi
// `kapak.kaynak`ta durur (temizlikte `image` alanına geri yazılır).
//
// KULLANIM:
//   npm run kapak                  → indekste açık (aktif) haberler
//   npm run kapak -- --gun=3       → son 3 gün
//   npm run kapak -- --limit=20    → en fazla 20
//   npm run kapak -- --zorla       → kapak varsa da yeniden üret
//   npm run kapak -- --kart        → yalnızca tasarımlı kartları yenile
//                                    (fotoğraf aramaz, hızlıdır)
//   npm run kapak -- --fotoyok     → fotoğrafsız (tasarımlı) kapakları
//                                    yeniden dener; yayıncının fotoğrafı
//                                    bulunursa fotoğraflı kapağa geçilir
//   npm run kapak -- --sosyal      → eksik 1200×630 JPEG (og:image + push)
//                                    kopyalarını tamamlar (ağ kullanmaz)
//   npm run kapak -- --dry
// ==========================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTICLES = path.join(KOK, "data", "articles.json");
const INDEKS = path.join(KOK, "data", "indeks.json");
const CIKTI_DIZIN = path.join(KOK, "site", "public", "kapak");
const URL_TABANI = "/kapak";

const GENISLIK = 1280;
const YUKSEKLIK = 720;
// 30.10.2026: 74 → 80. Yayıncıların görselleri zaten sıkıştırılmış geliyor
// (1200×675 kare 16 KB olabiliyor); üzerine bir de q74 uygulanınca kapak
// bulanık görünüyordu. q80 fark edilir şekilde net, dosya boyutu hâlâ küçük.
const KALITE = 80;
// Kart boyu: ana sayfada 30 kapak 1280 px indirmesin diye küçük varyant.
const KUCUK_GENISLIK = 480;

// SOSYAL KART: og:image ve web push aynı dosyayı kullanır. WhatsApp, X,
// Facebook, Telegram ve Windows/Android bildirimleri WebP'yi her zaman kabul
// etmez; 1200×630 JPEG her platformda çalışır. Dış CDN (wsrv.nl) soğukken
// dönüşüm 5-9 sn sürebildiği için görseli burada, depoda üretiyoruz.
const SOSYAL_GENISLIK = 1200;
const SOSYAL_YUKSEKLIK = 630;
const SOSYAL_KALITE = 80;
const SOSYAL_EK = "-sosyal.jpg";

const arg = (ad, varsayilan) => {
  const bulunan = process.argv.find((a) => a.startsWith(`--${ad}=`));
  return bulunan ? Number(bulunan.split("=")[1]) || varsayilan : varsayilan;
};
const dry = process.argv.includes("--dry");
const zorla = process.argv.includes("--zorla");
// --kart: fotoğraf aramayı tamamen atla, her hedef için tasarımlı kart üret.
const sadeceKart = process.argv.includes("--kart");
// --id=<haber id>: tek haberi yeniden üret (hata ayıklama).
const tekId = process.argv.find((a) => a.startsWith("--id="))?.split("=")[1] || null;
// --fotoyok: yalnızca fotoğrafı olmayan (tasarımlı zemin) kapakları yeniden dener.
const sadeceFotoYok = process.argv.includes("--fotoyok");
// --kapakli: kapak dosyası olan TÜM haberleri yeniden üretir (eski tasarımdan geçiş).
const sadeceKapakli = process.argv.includes("--kapakli");
// --stok: `image` alanı hâlâ Wikimedia stoğu olan haberleri hedefler (yaş sınırı
// yok). Kaynaktan gerçek fotoğraf bulunursa o, bulunamazsa habere özgü tasarım
// kartı üretilir; böylece başlıkla ilgisiz stok kareler kalkar.
const sadeceStok = process.argv.includes("--stok");
// --stokkaynak: yerel kapak dosyası olan ama `kapak.kaynak` alanı hâlâ Wikimedia
// stoğu olan haberleri hedefler. Bu kareler başlıkla ilgisiz olabiliyor; yeniden
// üretimde stok adayı hiç denenmez: yayıncının kendi fotoğrafı bulunursa o,
// bulunamazsa kategori + kısa çengel taşıyan tasarım kartı üretilir.
const sadeceStokKaynak = process.argv.includes("--stokkaynak");
// --gorsel=<adres|/yol>: aday arama atlanır, kapak bu görselden üretilir.
// Uygunsuz (müstehcen) bir kapak fotoğrafının yerine güvenli kare koymak için.
const elleGorsel =
  process.argv.find((a) => a.startsWith("--gorsel="))?.slice("--gorsel=".length) || null;
// --kirp-sol=<yüzde>: kaynağın solundan atılacak pay. Kadrajın solunda kalan
// uygunsuz bir figürü kapağın dışında bırakmak için.
const kirpSolYuzde = arg("kirp-sol", 0);
// --paralel=N: eşzamanlı indirme sayısı (varsayılan 6).
const paralel = arg("paralel", 6);
// DEBUG_KAPAK=1: her haber için hangi görselin neden seçildiğini yazar.
const debug = process.env.DEBUG_KAPAK === "1";
const gun = arg("gun", 0);
const limit = arg("limit", 2000);

// ------------------------------------------------------------------ veri
const ham = fs.readFileSync(ARTICLES, "utf8");
const satirSonu = ham.includes("\r\n") ? "\r\n" : "\n";
const articles = JSON.parse(ham);

function aktifIdler() {
  if (!fs.existsSync(INDEKS)) return new Set();
  try {
    const d = JSON.parse(fs.readFileSync(INDEKS, "utf8"));
    return new Set((Array.isArray(d.ids) ? d.ids : []).map(String));
  } catch {
    return new Set();
  }
}

const aktif = aktifIdler();
const esik = gun > 0 ? Date.now() - gun * 86400000 : 0;

const sirali = articles
  .filter((a) => {
    if (!a || !a.id) return false;
    if (tekId) return a.id === tekId;
    if (sadeceKart) {
      // Yalnızca hâlihazırda tasarım kartı olan kapaklar yenilenir.
      return a.kapak && a.kapak.foto === false && a.image?.startsWith(`${URL_TABANI}/`);
    }
    if (sadeceFotoYok) {
      return a.kapak && a.kapak.foto === false;
    }
    if (sadeceStok) {
      return /wikimedia\.org/i.test(String(a.image || ""));
    }
    if (sadeceStokKaynak) {
      // Yerel kapak dosyası olup taban fotoğrafı Wikimedia stoğu olan her kapak
      // (fotoğraf ya da kart) hedeftir: yayıncının kendi fotoğrafı varsa ona
      // geçilir, yoksa mevcut kart korunur.
      return (
        String(a.image || "").startsWith(`${URL_TABANI}/`) &&
        /wikimedia\.org/i.test(String(a.kapak?.kaynak || ""))
      );
    }
    if (sadeceKapakli) {
      return Boolean(a.kapak);
    }
    if (!zorla && typeof a.image === "string" && a.image.startsWith(`${URL_TABANI}/`)) return false;
    if (!a.image) return false;
    if (gun > 0) {
      const t = Date.parse(a.publishedAt || a.generatedAt || 0);
      return Number.isFinite(t) && t >= esik;
    }
    return aktif.has(String(a.id));
  })
  // En yeni haber önce: tur başına sınır varsa (CI'da 60) taze içerik kapsanır.
  .sort(
    (a, b) =>
      Date.parse(b.publishedAt || b.generatedAt || 0) - Date.parse(a.publishedAt || a.generatedAt || 0)
  );

// SIRA SEÇİMİ. `--fotoyok` turu 4-5 dakikada bir çalışıyor ve en yeni N kartı
// hedefliyor. Sıralama sabit kalınca AYNI N kart her turda yeniden deneniyordu:
// fotoğrafı bulunamayan kartlar kuyruğu tıkıyor, eski kartlara hiç sıra
// gelmiyordu (332 kartın 80'i sonsuza kadar dönüyordu). Artık en yeni 24 kart
// her turda denenir (taze içerik), kalan kota saatte bir kayan pencereden
// doldurulur; böylece birkaç saatte tüm kartlar sırayla denenir.
const hedefler = (() => {
  if (!sadeceFotoYok || sirali.length <= limit) return sirali.slice(0, limit);
  const sabit = Math.min(24, limit);
  const donen = limit - sabit;
  if (donen <= 0) return sirali.slice(0, limit);
  const kalan = sirali.slice(sabit);
  const tur = Math.floor(Date.now() / 3600000);
  const bas = (tur * donen) % kalan.length;
  const secilen = [];
  for (let i = 0; i < Math.min(donen, kalan.length); i++) {
    secilen.push(kalan[(bas + i) % kalan.length]);
  }
  return [...sirali.slice(0, sabit), ...secilen];
})();

console.log(
  `Kapak: ${hedefler.length} haber hedefte ` +
    `(${gun > 0 ? `son ${gun} gün` : `indekste açık ${aktif.size} haber`})` +
    `${dry ? " [dry]" : ""}`
);

// ------------------------------------------------------------- yardımcılar
const XML = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// ------------------------------------------------------ görsel uygunluğu
// Sorun: arama bazen "1280px-thumbnail.jpg" gibi jenerik bir Commons karesi
// döndürüyor; haber kiraz hasadıyken kare Amerikan marketi olabiliyor.
// Kural: dosya adı jenerikse VEYA arama sorgusuyla hiç ortak kelime yoksa
// fotoğraf reddedilir. Reddedilen fotoğrafın yerine önce Openverse (CC0/CC BY)
// aranır, bulunamazsa fotoğrafsız markalı kart üretilir. Yanlış fotoğraf,
// fotoğrafsız karttan daha çok güven kaybettirir.

const JENERIK = /(thumbnail|placeholder|default|untitled|noimage|no-image|generic|dummy|stock|screenshot|ekran|wikipedia|wiki|logo|wordmark|diagram|chart|graph|harita|map|icon|drawing|clipart|^img|^image|^photo|^dsc|^px[-_]?)/i;

// Stok fotoğraf havuzları. Bu adreslerden gelen kareler "yayıncının kendi
// görseli" sayılmaz; `uygunMu` süzgecinden geçmek zorundadır.
const STOK_KONAK = /(wikimedia\.org|openverse|flickr\.com|pixabay\.com|pexels\.com|unsplash\.com)/i;

// Fotoğrafın güvenilir sayıldığı kategoriler: buralarda Commons'ta gerçek
// ürün/cihaz kareleri var. Gündem/Dünya/Spor/Ekonomi gibi haberlerde stok
// fotoğraf neredeyse her zaman yanlış olduğu için marka adı geçmiyorsa
// fotoğraf hiç kullanılmaz — yanlış kare, tasarımlı kareden daha çok güven
// kaybettiriyor.
const FOTO_KATEGORI = new Set([
  "Teknoloji",
  "Mobil",
  "Donanım",
  "Yazılım",
  "İnternet",
  "Oyun",
  "Bilim",
  "Uzay",
  "Otomobil",
  "Yapay Zeka",
]);

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "at", "for", "with", "to", "from",
  "turkey", "turkish", "turkiye", "istanbul", "new", "photo", "image", "file", "commons",
]);

const TR_ASCII = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

const tokenler = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[çğıöşüâîû]/g, (c) => TR_ASCII[c] || c)
    .replace(/\.(jpe?g|png|webp|avif|gif)$/i, "")
    .replace(/^\d+px-/, "")
    .split(/[^a-z0-9]+/)
    .map((t) => t.replace(/(lari|leri|lar|ler|s)$/i, ""))
    .filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t));

/** Başlıktaki özel ad (marka, kulüp, kişi, yer) fotoğraf adında geçiyor mu? */
function ozelAdUyuyor(url, baslik) {
  const adK = new Set(tokenler(decodeURIComponent(String(url || "").split("/").pop() || "")));
  const adaylar = String(baslik || "")
    .split(/[\s,.;:!?'"()’“”–—-]+/)
    .filter((w) => w.length > 3);
  return adaylar.some((w) => {
    const t = tokenler(w).join("");
    return t.length > 3 && [...adK].some((k) => k.includes(t) || t.includes(k));
  });
}

/**
 * Kapak fotoğrafı habere gerçekten uyuyor mu?
 * "Turkey cherry orchard" sorgusunun "Cherry Point" askeri üssündeki hindi
 * bovlingi fotoğrafını getirmesi gibi eşleşmeleri kesmek için sorgu
 * kelimelerinin çoğunluğu dosya adında geçmek zorunda.
 */
function uygunMu(url, sorgu) {
  const ad = decodeURIComponent(String(url || "").split("/").pop() || "");
  if (!ad || JENERIK.test(ad)) return false;
  const adKelimeleri = new Set(tokenler(ad));
  const sorguKelimeleri = [...new Set(tokenler(sorgu))];
  if (!sorguKelimeleri.length) return true;
  const eslesen = sorguKelimeleri.filter((k) => adKelimeleri.has(k)).length;
  const oran = eslesen / sorguKelimeleri.length;
  return eslesen >= 2 || oran >= 0.75;
}

// Openverse: Wikimedia dışında CC0 / CC BY lisanslı fotoğraf havuzu (ücretsiz).
let openverseSon = 0;
async function openverseAra(sorgu) {
  const bekle = 1500 - (Date.now() - openverseSon);
  if (bekle > 0) await new Promise((r) => setTimeout(r, bekle));
  openverseSon = Date.now();
  const u =
    "https://api.openverse.org/v1/images/?" +
    new URLSearchParams({
      q: sorgu,
      license: "cc0,by,by-sa",
      size: "large",
      page_size: "10",
    });
  const yanit = await fetch(u, {
    headers: { "user-agent": "HaberinAi/1.0 (https://haberinai.site)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!yanit.ok) throw new Error(`Openverse HTTP ${yanit.status}`);
  const d = await yanit.json();
  const sorguKelimeleri = tokenler(sorgu);
  const adaylar = (Array.isArray(d.results) ? d.results : [])
    .filter((r) => r?.url && (r.width || 0) >= 1100 && (r.height || 0) >= 600)
    .filter((r) => {
      const metin = `${r.title || ""} ${(r.tags || []).map((t) => t.name).join(" ")}`.toLowerCase();
      return sorguKelimeleri.some((k) => metin.includes(k));
    })
    .sort((a, b) => (b.width || 0) - (a.width || 0));
  const secili = adaylar[0];
  if (!secili) return null;
  return {
    url: secili.url,
    yazar: secili.creator || "Openverse",
    lisans: String(secili.license || "CC").toUpperCase() + (secili.license_version ? ` ${secili.license_version}` : ""),
    lisansUrl: secili.license_url || "",
    sayfa: secili.foreign_landing_url || secili.url,
  };
}


// Fotoğrafın üzerine YALNIZCA ince marka izleri basılır: alt kenarda 6 px
// kırmızı şerit + sağ altta küçük "haberinai" yazısı. Başlık zaten kartın
// yanında yazıyor; görselin üstüne ikinci kez başlık basmak fotoğrafı
// kirletiyor ve kırpıldığında yarım metin görünüyor.
// Metni kelime sınırında en fazla `enFazla` karakterlik satırlara böler.
function sar(metin, enFazla) {
  const kelimeler = String(metin || "").replace(/\s+/g, " ").trim().split(" ");
  const satirlar = [];
  let satir = "";
  for (const k of kelimeler) {
    if (!k) continue;
    const aday = satir ? `${satir} ${k}` : k;
    if (!satir || aday.length <= enFazla) satir = aday;
    else {
      satirlar.push(satir);
      satir = k;
    }
  }
  if (satir) satirlar.push(satir);
  return satirlar;
}

// Tasarımlı kartlar için başlık: kapakta uzun başlık yerine kısa bir "çengel".
// Uzun metin küçük puntoda okunmuyor ve kartı kalabalıklaştırıyor; 2 satırı
// geçmeyen 3-5 kelimelik ifade + kategori etiketi yeterli, göz başlığa gider.
const KART_SON_EK = new Set([
  "ve", "ile", "için", "bir", "bu", "şu", "da", "de", "ta", "te", "ya", "veya",
  "ama", "ancak", "ki", "en", "çok", "daha", "göre", "kadar", "sonra", "önce",
  "üzerine", "karşı", "olarak", "ise", "mi", "mı", "mu", "mü",
]);

// 81 il: kart başlığında "İstanbul Sultangazi'de Araç Alev..." gibi yer adıyla
// başlayan ifadeler yerine olayı anlatan kısım tercih edilir.
const ILLER = new Set(
  ("adana adıyaman afyonkarahisar ağrı aksaray amasya ankara antalya ardahan artvin " +
    "aydın balıkesir bartın batman bayburt bilecik bingöl bitlis bolu burdur bursa çanakkale " +
    "çankırı çorum denizli diyarbakır düzce edirne elazığ erzincan erzurum eskişehir gaziantep " +
    "giresun gümüşhane hakkari hatay ısparta ığdır istanbul izmir kahramanmaraş karabük karaman kars " +
    "kastamonu kayseri kilis kırıkkale kırklareli kırşehir kocaeli konya kütahya malatya manisa " +
    "mardin mersin muğla muş nevşehir niğde ordu osmaniye rize sakarya samsun siirt sinop sivas " +
    "şırnak tekirdağ tokat trabzon tunceli uşak van yalova yozgat zonguldak")
    .split(" ")
    .filter(Boolean)
);

/** Baştaki yer adı mı? ("Ankara'da", "Sultangazi'de", "Silivri'deki", "İzmir") */
function yerAdiMi(kelime) {
  const duz = String(kelime || "").toLocaleLowerCase("tr");
  const kok = duz.replace(/['’].*$/, "");
  if (ILLER.has(kok)) return true;
  return /['’](de|da|te|ta|nde|nda|deki|daki|teki|taki|den|dan|ten|tan)$/.test(duz);
}

function kartBasligi(baslik) {
  const temiz = String(baslik || "")
    .replace(/\s*[|–—-]\s*(son dakika|flaş|video|foto|galeri|izle).*$/i, "")
    .replace(/["“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // İki nokta/uzun çizgi varsa öncesi genelde tam bir ifadedir ("Romanya'da
  // sarsıntı: AFAD ve EMSC..."). Onu kullanmak kesilmiş cümle görüntüsünü önler.
  const onBolum = temiz.split(/\s*[:–—]\s*/)[0].trim();
  const sonraBolum = temiz.split(/\s*[:–—]\s*/).slice(1).join(" ").trim();
  let onKelimeler = onBolum.split(" ").filter(Boolean);

  // "Silivri'deki gemi faciasında yeni gelişme: Bir cansız bedene ulaşıldı"
  // gibi başlıklarda ilk parça haberin kendisini söylemiyor (gelişme, açıklama,
  // iddia...); asıl olay iki noktadan sonra gelir.
  const belirsiz = /(yeni gelişme|gelişme|açıklama|iddia|detay|soru|işte|dikkat|neden|nasıl)/i;
  let olayKismi = false;
  if (belirsiz.test(onBolum) && sonraBolum.split(" ").filter(Boolean).length >= 3) {
    onKelimeler = sonraBolum.split(" ").filter(Boolean);
    olayKismi = true;
  }

  // "Beşiktaş, Olympiakos karşısında 81-73 yenildi" gibi başlıklarda ilk parça
  // tek kelimeyse (özne) olayı anlatan ikinci parça kullanılır.
  if (onKelimeler.length < 3) {
    const virgulSonrasi = temiz.split(/\s*,\s*/).slice(1).join(", ").trim();
    if (virgulSonrasi.split(" ").filter(Boolean).length >= 3) {
      onKelimeler = virgulSonrasi.split(" ").filter(Boolean);
    }
  }

  // Baştaki yer adlarını at ("İstanbul Sultangazi'de Araç Alev Topuna Dönüştü"
  // → "Araç Alev Topuna Dönüştü").
  let atilan = 0;
  while (onKelimeler.length > 3 && atilan < 2 && yerAdiMi(onKelimeler[0])) {
    onKelimeler.shift();
    atilan++;
  }

  const onMetin = onKelimeler.join(" ");
  // 40 karakter sınırı, yeri atılmış kısa ifadeyi gereksiz yere tüm başlığa
  // düşürüyordu; iki satıra sığan 52 karaktere kadar kullan.
  //
  // 29.10.2026: "Dünya Sağlık Örgütü: Yemen'de çatışmalar 9 binden fazla can
  // aldı" gibi başlıklarda iki nokta öncesi yalnızca ÖZNE'dir (kurum/kişi).
  // Kartta sadece "Dünya Sağlık Örgütü" yazıyordu; haber görünmüyordu.
  // Özne kısaysa (<= 4 kelime) ve olay kısmı uzunsa tam başlık kullanılır:
  // kart "Dünya Sağlık Örgütü: Yemen'de çatışmalar…" der.
  const sonraKelime = sonraBolum.split(" ").filter(Boolean).length;
  const ozneKisa = !olayKismi && onKelimeler.length <= 4 && sonraKelime >= 4;
  const kaynak =
    onKelimeler.length >= 2 && onMetin.length <= 52 && !ozneKisa ? onMetin : temiz;

  // İki satıra sığacak şekilde kelime kelime doldur; sığmayan kuyruk atılır
  // (yarım kalan "... Araç" gibi ifadeler yerine tam ifade kalsın). Başlık
  // "ABD'nin İran'a yönelik operasyonları..." gibi tamlayan zinciriyle
  // başlıyorsa ilk kelimeler atlanarak anlamlı bir pencere seçilir.
  //
  // 29.10.2026: 18 → 26 karakter. 18'de 70 karakterlik bir başlıktan yalnızca
  // "Samsung / Electronics" görünüyordu; kart "boş ve anlamsız" duruyordu.
  // 58 px yazıda 26 karakter ~830 px, sol alana (64–1000 px) rahat sığıyor.
  const SATIR_HARF = 26;
  const BITIREN = new Set([
    ...KART_SON_EK,
    "yönelik", "ilişkin", "dair", "doğru", "başlayan", "süren", "olan", "yer", "yerde",
  ]);
  // Tamlayan hâliyle biten kelimeler de yarım cümle gibi durur
  // ("... operasyonlarının"). Bunlar da "eksik" sayılır.
  const eksikKelime = (k) => {
    const d = String(k || "").toLocaleLowerCase("tr");
    return BITIREN.has(d) || /(nın|nin|nun|nün)$/.test(d) || d.length <= 3;
  };
  const kelimeler = kaynak.split(" ").filter(Boolean);

  // 3 satıra kadar: 2 satırda 52 karakter sığıyordu ve uzun başlıklar hep
  // "…" ile kesiliyordu. 3 satırda ~78 karakter, haber başlığının tamamını
  // verir; blok yine 720 px yüksekliğe rahat oturur.
  const SATIR_SAYISI = 3;

  const satirlariKur = (baslangic) => {
    const satirlar = [];
    let satir = "";
    let kullanilan = 0;
    for (let i = baslangic; i < kelimeler.length; i++) {
      if (satirlar.length >= SATIR_SAYISI) break;
      const kelime = kelimeler[i];
      const aday = satir ? `${satir} ${kelime}` : kelime;
      if (!satir || aday.length <= SATIR_HARF) satir = aday;
      else {
        satirlar.push(satir);
        satir = kelime;
      }
      kullanilan = i + 1;
    }
    if (satir && satirlar.length < SATIR_SAYISI) satirlar.push(satir);

    // Son satırı bağlaç/edat/sıfatla bitirme ("... AFAD ve", "... İran'a yönelik").
    while (satirlar.length) {
      const sonlar = satirlar[satirlar.length - 1].split(" ").filter(Boolean);
      const son = sonlar[sonlar.length - 1] || "";
      // Tek/iki haneli sayıyla bitirme ("... çatışmalar 9"): sayı tek başına
      // bir şey anlatmaz; "…" ile devam etmek daha doğrudur.
      const yalinSayi = /^\d{1,2}$/.test(son);
      if (!BITIREN.has(son.toLocaleLowerCase("tr")) && !yalinSayi) break;
      if (sonlar.length > 1) satirlar[satirlar.length - 1] = sonlar.slice(0, -1).join(" ");
      else satirlar.pop();
    }

    // Son satır tek kelimeye düşerse ("Starlink antenlerini ateşe / verdi")
    // bir üst satırın son kelimesini aşağı alarak dengele.
    if (satirlar.length >= 2) {
      let son = satirlar[satirlar.length - 1].split(" ").filter(Boolean);
      while (son.length === 1 && satirlar.length >= 2) {
        const onceki = satirlar[satirlar.length - 2].split(" ").filter(Boolean);
        if (onceki.length <= 1) break;
        const aday = `${onceki[onceki.length - 1]} ${son.join(" ")}`;
        if (aday.length > SATIR_HARF) break;
        son = [onceki.pop(), ...son];
        satirlar[satirlar.length - 2] = onceki.join(" ");
        satirlar[satirlar.length - 1] = son.join(" ");
      }
    }

    return { satirlar, kullanilan };
  };

  // Kart başlığı HER ZAMAN başlığın ilk kelimesinden başlar. Daha önce
  // pencereyi kaydırıp "yüklemle biten" parçayı seçmeye çalışan bir sürüm
  // vardı; sonuç "İle dizüstü bilgisayarlara / süper çip getirdi" gibi
  // ortadan başlayan, öznesi kaybolmuş metinlerdi. Başlık cümlesi gibi
  // okunmalı: baştan başla, sığmayan kuyruğu "…" ile bitir.
  const secim = satirlariKur(0);
  const satirlar = secim.satirlar;

  const temizSatirlar = satirlar
    .map((s) => s.replace(/[,.;:!?]+$/, "").trim())
    .filter(Boolean)
    // Yer adı atıldığında cümle küçük harfle başlıyordu ("gemi faciasında...").
    .map((s, i) =>
      i === 0 && s ? s.charAt(0).toLocaleUpperCase("tr") + s.slice(1) : s
    );

  // Başlığın tamamı sığmadıysa sonuna "…" konur. Aksi hâlde kart, cümle
  // ortasında kesilmiş gibi görünüyordu ("Apple'ın ucuz bellek dönemi sona").
  // "…" okuyucuya "devamı var" der; eksik cümle izlenimini kaldırır.
  const sonKelime = (dizi) =>
    String(dizi[dizi.length - 1] || "")
      .replace(/[,.;:!?…]+$/g, "")
      .toLocaleLowerCase("tr");
  const kirpildi =
    temizSatirlar.length > 0 &&
    sonKelime(temizSatirlar.join(" ").split(" ")) !== sonKelime(kelimeler);
  if (kirpildi) temizSatirlar[temizSatirlar.length - 1] += "…";

  return { boyut: 58, lh: 70, satirlar: temizSatirlar };
}

function kapakSvg(w = GENISLIK, h = YUKSEKLIK) {
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="kose" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.62"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${h - 110}" width="${w}" height="110" fill="url(#kose)"/>
  <rect x="0" y="${h - 6}" width="${w}" height="6" fill="#e11d2e"/>
  <g font-family="Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif">
    <!-- Sağ alt köşe plakası: yayıncıların köşeye bastığı kendi logolarını
         (AH, Webtekno, DH...) örter. Rozet bu plakanın içinde durur, böylece
         iki logo üst üste binmez. -->
    <path d="M ${w - 236} ${h} L ${w - 236} ${h - 58} Q ${w - 236} ${h - 70} ${w - 224} ${h - 70} L ${w} ${h - 70} L ${w} ${h} Z" fill="#0b0e14" fill-opacity="0.9"/>
    <rect x="${w - 208}" y="${h - 52}" width="12" height="22" rx="2.5" fill="#e11d2e"/>
    <text x="${w - 186}" y="${h - 32}" font-size="22" font-weight="700" fill="#ffffff" letter-spacing="-0.3">haberinai</text>
  </g>
</svg>`;
}

// Windows'ta antivirüs/indeksleyici yeni dosyayı bir an kilitleyebiliyor:
// yazmayı birkaç kez dene, hepsi başarısız olursa hatayı yukarı ver.
function yazDosya(yol, veri, deneme = 4) {
  for (let i = 0; i < deneme; i++) {
    try {
      fs.writeFileSync(yol, veri);
      return;
    } catch (err) {
      if (i === deneme - 1) throw err;
    }
  }
}

/** Kaynak makalenin kendi görseli: og:image / twitter:image. */
async function kaynakGorselUrl(a) {
  const adres = String(a.sourceUrl || "");
  if (!/^https?:\/\//i.test(adres)) return null;
  try {
    const yanit = await fetch(adres, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; HaberinAi/1.0; +https://haberinai.site)",
        "accept-language": "tr,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(9000),
    });
    if (!yanit.ok) return null;
    const html = (await yanit.text()).slice(0, 400000);
    const kaliplar = [
      /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/i,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    ];
    for (const kalip of kaliplar) {
      const bulunan = kalip.exec(html)?.[1];
      if (bulunan) {
        const tam = new URL(bulunan.replace(/&amp;/g, "&"), adres).href;
        // Site logosu / varsayılan paylaşım kartı haber görseli değildir.
        if (/^https?:\/\//i.test(tam) && !/(logo|favicon|default|placeholder|share-?default|sprite)/i.test(tam)) {
          return tam;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Fotoğrafı getir (Wikimedia 403 vermesin diye UA gönderilir).
async function gorselIndir(url) {
  const yerel = String(url || "");
  if (yerel.startsWith("/")) {
    const dosya = path.join(KOK, "site", "public", ...yerel.split("/").filter(Boolean));
    if (fs.existsSync(dosya)) return fs.readFileSync(dosya);
    return null;
  }
  const yanit = await fetch(yerel, {
    headers: {
      "user-agent": "HaberinAi/1.0 (https://haberinai.site; kapak uretimi)",
      accept: "image/avif,image/webp,image/jpeg,image/png,*/*",
      "accept-language": "tr",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`);
  return Buffer.from(await yanit.arrayBuffer());
}

/**
 * Bir fotoğrafın kapak olarak ne kadar çekici olacağını 0-100 arası puanlar.
 * NEDEN: Eskiden "ilk bulunan görsel" kapak oluyordu; sonuç bulanık ekran
 * görüntüleri, bembeyaz ürün kareleri veya neredeyse düz şablon görselleriydi.
 * Burada çözünürlük, ayrıntı (kontrast), parlaklık, renklilik ve 16:9'a
 * yakınlık birlikte değerlendirilir; en yüksek puanlı kare kapak olur.
 * Düz/boş kareler (std çok düşük) hiç aday sayılmaz.
 */
/**
 * YAYINCININ "PAYLAŞIM KARTI" MIDIR?
 *
 * DonanımHaber, Donanım Günlüğü, NTV gibi siteler og:image olarak fotoğrafın
 * üzerine kendi başlıklarını bastıkları hazır kartlar veriyor: kırmızı/turuncu
 * bir plaka + beyaz punto yazı ("Kasım'da Çıkacak / 10 Oyun!", "Şarj Hızı /
 * Belli Oldu"). Bu kare kapak olunca kartta İKİ başlık birden görünüyor ve
 * başka bir sitenin reklamı gibi duruyor.
 *
 * Tespit: satır bazında kırmızı/turuncu doluluk + o satırlardaki beyaz yazı
 * oranı. Domates, yangın ya da kırmızı araba fotoğrafı kırmızı satır üretir
 * ama içinde beyaz punto yazı yoktur; bu yüzden ikisi birlikte aranır.
 */
async function paylasimKartiMi(veri) {
  try {
    const { data, info } = await sharp(veri)
      .resize(200, 200, { fit: "inside" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width: w, height: h, channels: ch } = info;
    let plakaSatir = 0;
    let bandBeyaz = 0;
    for (let y = 0; y < h; y++) {
      let kirmizi = 0;
      let beyaz = 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * ch;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r >= 240 && g >= 240 && b >= 240) beyaz++;
        if (r >= 140 && r - g >= 60 && r - b >= 50) kirmizi++;
      }
      // Plaka her zaman kareyi kaplamaz: "Şarj Hızı / Belli Oldu" kartında
      // kırmızı şerit genişliğin ~%28'i kadar. 0.25 eşiği bunu yakalar,
      // domates/yangın gibi gerçek kırmızı fotoğraflar zaten %80+ üretir;
      // ayrımı yapan asıl ölçüt aşağıdaki beyaz yazı oranıdır.
      if (kirmizi / w >= 0.25) {
        plakaSatir++;
        bandBeyaz += beyaz;
      }
    }
    const plakaOran = (plakaSatir / h) * 100;
    const yazi = plakaSatir ? (bandBeyaz / (plakaSatir * w)) * 100 : 0;
    return { kart: plakaOran >= 8 && yazi >= 0.35, plakaOran, yazi };
  } catch {
    return { kart: false, plakaOran: 0, yazi: 0 };
  }
}

async function gorselPuani(veri, bilgi) {
  const w = bilgi?.width || 0;
  const h = bilgi?.height || 0;
  if (w < 640 || h < 320) return null;
  try {
    const { data, info } = await sharp(veri)
      .resize(180, 180, { fit: "inside" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const adim = info.channels;
    let toplam = 0;
    let kare = 0;
    let doygun = 0;
    let adet = 0;
    for (let i = 0; i + 2 < data.length; i += adim) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const p = 0.299 * r + 0.587 * g + 0.114 * b;
      toplam += p;
      kare += p * p;
      const en = Math.max(r, g, b);
      const az = Math.min(r, g, b);
      if (en > 8) doygun += (en - az) / en;
      adet++;
    }
    if (!adet) return null;
    const ort = toplam / adet;
    const std = Math.sqrt(Math.max(0, kare / adet - ort * ort));
    const doy = doygun / adet;
    // Düz/boş kare (beyaz zemin, boş şablon, tek renk): kapak yapılmaz.
    if (std < 9 || (std < 14 && doy < 0.03)) return null;

    const sinir = (x) => Math.max(0, Math.min(1, x));
    const detayPuan = sinir((std - 14) / 42); // 14 → 0, 56+ → 1
    const parlakPuan = sinir(1 - Math.abs(ort - 118) / 105);
    const cozunurlukPuan = sinir(Math.min(w, h) / 900);
    const hedef = GENISLIK / YUKSEKLIK;
    const oranPuan = Math.sqrt(Math.min(w / h, hedef) / Math.max(w / h, hedef));
    const renkPuan = sinir(1 - Math.abs(doy - 0.32) / 0.34);
    return (
      100 *
      (0.33 * detayPuan +
        0.22 * parlakPuan +
        0.18 * cozunurlukPuan +
        0.15 * oranPuan +
        0.12 * renkPuan)
    );
  } catch {
    return null;
  }
}

async function kapakUret(a) {
  const dosya = path.join(CIKTI_DIZIN, `${a.id}.webp`);
  // Daha önce üretilmiş kapağın taban fotoğrafı `kapak.kaynak`ta durur.
  const kaynak = a.kapak?.kaynak || a.image;
  const sorgu = a.gorselSorgu || a.title || "";
  // Stok görselli ESKİ haber: fotoğraf kapak üretilse bile temizlik onu silip
  // haberi stoğa geri döndürür. Onun için doğrudan tasarım kartı üretilir
  // (temizlik, kaynağı stok olan kartları korur).
  const kartaZorla =
    sadeceKart || (sadeceStok && !aktif.has(String(a.id)));

  /**
   * 16:9 kırp + hafif canlandırma.
   * `ustYuzde`: üstten atılacak pay. Yayıncıların og:image paylaşım kartlarında
   * sağ ÜST köşede kendi logoları ve büyük başlık metinleri oluyor (ShiftDelete,
   * Webtekno...). Bu hem bedava reklam hem de kartın üstünde ikinci bir başlık
   * gibi duruyordu. Üstten %18 atmak logoyu ve yayıncının başlığını tamamen
   * dışarıda bırakır; geriye haberin kendi fotoğrafı kalır.
   */
  const kirp = async (veri, bilgi, ustYuzde = 0) => {
    try {
      // KAYNAK FİLİGRANI: yayıncılar kendi logolarını sağ alt köşeye basıyor
      // (AndroidHeadlines "AH", Webtekno, DonanımHaber...). Kapağın sağ alt
      // köşesinde bizim "haberinai" rozetimiz var; iki logo üst üste binince
      // amatör görünüyordu. Kırpmadan önce sağdan %10, alttan %7 atılır: köşe
      // filigranı dışarıda kalır, kompozisyon neredeyse aynıdır.
      const w = bilgi.width || 0;
      const h = bilgi.height || 0;
      // --kirp-sol: sol taraftan istenen pay atılır (kadrajda istenmeyen figür).
      const sol = Math.round((w * Math.min(Math.max(kirpSolYuzde, 0), 40)) / 100);
      const ust = Math.round((h * Math.min(Math.max(ustYuzde, 0), 30)) / 100);
      const kirpW = Math.max(1, Math.round((w - sol) * 0.9));
      const kirpH = Math.max(1, Math.round((h - ust) * 0.93));
      // "attention" büyük görsellerde çok pahalı (saniyelerce CPU). 4000 px'e
      // kadar ilgi alanına göre kırp; daha büyüklerde merkez yeterli.
      const konum =
        w * h <= 16_000_000 ? sharp.strategy.attention : "centre";
      let boru = sharp(veri);
      if (w > 0 && h > 0 && kirpW > 640 && kirpH > 360) {
        boru = boru.extract({ left: sol, top: ust, width: kirpW, height: kirpH });
      }
      // KÜÇÜK KAYNAK: yayıncı 640×360 gibi küçük bir kare verdiyse 1280'e
      // büyütmek zorundayız. Büyütme oranı arttıkça daha güçlü keskinleştirme
      // uygulanır; aksi hâlde kapak "bulanık" görünüyordu.
      const buyutme = GENISLIK / Math.max(1, kirpW);
      const keskinlik =
        buyutme > 1.3
          ? { sigma: 1.2, m1: 1.2, m2: 0.6 }
          : buyutme > 1.05
            ? { sigma: 0.9, m1: 0.8, m2: 0.4 }
            : { sigma: 0.6 };
      return await boru
        .resize(GENISLIK, YUKSEKLIK, { fit: "cover", position: konum })
        .modulate({ saturation: 1.08, brightness: 1.02 })
        .sharpen(keskinlik)
        .toBuffer();
    } catch {
      return null;
    }
  };

  /** Tek adımda indir + hazırla (Openverse/yedek adaylar için). */
  const hazirla = async (url) => {
    try {
      const veri = await gorselIndir(url);
      if (!veri) return null;
      const bilgi = await sharp(veri).metadata();
      // Çok küçük görseller (logo, ikon, 300 px kare) kapak olmaz.
      if ((bilgi.width || 0) < 640 || (bilgi.height || 0) < 320) return null;
      return await kirp(veri, bilgi, 0);
    } catch {
      return null;
    }
  };

  // Aday fotoğraflar ÖNCELİK sırasıyla toplanır, sonra en iyi GÖRÜNEN seçilir.
  // "İlk bulunan" mantığı bulanık ekran görüntülerini ya da bembeyaz ürün
  // karelerini kapak yapıyordu; puanlama göze en çok hitap eden kareyi seçer.
  const adaylar = [];
  const adayEkle = (url, tip) => {
    if (typeof url !== "string" || !url) return;
    if (adaylar.some((c) => c.url === url)) return;
    adaylar.push({ url, tip });
  };

  if (elleGorsel) {
    // Elle seçilen görsel: diğer adaylar hiç denenmez (müstehcen kapak değişimi).
    adayEkle(elleGorsel, "elle");
  } else if (!kartaZorla) {
    // 1) KAYNAK SİTENİN KENDİ GÖRSELİ (og:image). Haberin çıktığı sayfadaki
    //    kapak görseli tanım gereği başlıkla alakalı.
    if (String(a.sourceUrl || "").startsWith("http")) {
      const kaynakFoto = await kaynakGorselUrl(a);
      if (debug) {
        console.log(
          `   · ${a.id} kaynak görsel: ${kaynakFoto ? kaynakFoto.slice(0, 80) : "BULUNAMADI"}`
        );
      }
      // NOT: `a.image` ile aynı adres olabilir — ilk üretimde veri dosyasındaki
      // adres zaten kaynağın og:image'idir. Eskiden bu durumda aday atlanıyordu;
      // ardından aşağıdaki `uygunMu` süzgeci de dosya adı "695086-700x400.jpg"
      // gibi sayı/hash olan yayıncı fotoğraflarını eliyor ve haber hiç
      // fotoğrafı yokmuş gibi tasarımlı karta düşüyordu. Tekrarları `adayEkle`
      // zaten ayıklar.
      if (kaynakFoto) adayEkle(kaynakFoto, "kaynak");
    }
    // 2) YAZININ İÇİNDEKİ FOTOĞRAFLAR: yayıncı kendi metnine koyduğu için
    //    başlıkla alakaları yüksek (ürün, kişi, olay karesi).
    for (const u of Array.isArray(a.images) ? a.images.slice(0, 2) : []) adayEkle(u, "govde");
    // 3) VERİ DOSYASINDAKİ GÖRSEL. İki tür var:
    //    a) Yayıncının kendi görseli (og:image / RSS media) — habere ait olduğu
    //       kesin, dosya adı ne olursa olsun kullanılır.
    //    b) Stok kare (Wikimedia/Openverse) — yalnızca dosya adı arama
    //       sorgusuyla eşleşiyorsa kullanılır; yanlış stok kare, tasarımlı
    //       karttan daha çok güven kaybettirir.
    const stokAday = STOK_KONAK.test(String(kaynak || ""));
    const yayinciGorseli =
      !stokAday && !String(kaynak || "").startsWith(`${URL_TABANI}/`);
    const fotoIzinli = yayinciGorseli
      ? true
      : uygunMu(kaynak, sorgu) &&
        (FOTO_KATEGORI.has(String(a.category || "")) || ozelAdUyuyor(kaynak, a.title));
    // Stok kaynaklı eski kapağı yenilerken aynı stok kareyi tekrar seçme.
    if (fotoIzinli && !(sadeceStokKaynak && stokAday)) adayEkle(kaynak, "veri");
  }

  // En fazla 4 aday indirilir; iyi bir kare çıkınca erken bırakılır (hız).
  const degerlendirilen = [];
  const EN_FAZLA_ADAY = 4;
  for (const aday of adaylar) {
    if (degerlendirilen.length >= EN_FAZLA_ADAY) break;
    let veri = null;
    let bilgi = null;
    try {
      veri = await gorselIndir(aday.url);
      if (!veri) continue;
      bilgi = await sharp(veri).metadata();
    } catch (err) {
      if (debug) console.log(`   · ${a.id} ${aday.tip} indirilemedi: ${err.message}`);
      continue;
    }
    // Yayıncının başlığı fotoğrafın üstüne basılmış "paylaşım kartı" ise kapak
    // olarak kullanılmaz: bizim kartımızda ikinci bir başlık gibi duruyor.
    // Temiz bir gövde fotoğrafı varsa o seçilir, yoksa tasarımlı karta düşülür.
    const kartKontrol = await paylasimKartiMi(veri);
    if (kartKontrol.kart) {
      if (debug) {
        console.log(
          `   · ${a.id} ${aday.tip} elendi (yayıncı başlık plakası: %${kartKontrol.plakaOran.toFixed(0)} plaka, %${kartKontrol.yazi.toFixed(2)} yazı)`
        );
      }
      continue;
    }

    const puan = await gorselPuani(veri, bilgi);
    if (puan === null) {
      if (debug) console.log(`   · ${a.id} ${aday.tip} elendi (küçük/düz): ${aday.url.slice(0, 80)}`);
      continue;
    }
    degerlendirilen.push({
      ...aday,
      veri,
      bilgi,
      puan,
      // YAYINCININ KENDİ KAPAĞI (og:image) küçük bir öncelik alır. Puanlama
      // "detay/parlaklık" ölçtüğü için dokulu bir stok kare (devre kartı, bina)
      // düz bir ürün ekran görüntüsünden yüksek puan alabiliyor ve haberin
      // gerçek kapağı eleniyordu. Yayıncı hangi kareyi kapak yaptıysa o kare
      // haberin konusuna en yakın olandır.
      siralama: puan + (aday.tip === "kaynak" ? 10 : 0),
    });
    if (debug) {
      console.log(`   · ${a.id} ${aday.tip} puan ${puan.toFixed(0)}: ${aday.url.slice(0, 80)}`);
    }
    if (puan >= 84) break;
  }

  degerlendirilen.sort((x, y) => y.siralama - x.siralama);

  let taban = null;
  let yeniAtif = null;
  let fotoVar = false;
  let secilenUrl = null;

  // 29.10.2026: eşik 42 → 18.
  // KURAL: Konuyla ALAKALI gerçek fotoğraf, tasarımlı karttan HER ZAMAN iyidir.
  // Düşük puan "boş, loş, düz" demektir; alakasız demek değildir. Bu adaylar
  // zaten yayıncının kendi sayfasından (og:image) veya yazı içinden geliyor,
  // yani başlıkla ilgisi tanım gereği doğru. `gorselPuani` bembeyaz/tek renk
  // kareleri null ile eliyor; kalan her kare karttan üstündür.
  const secilen = degerlendirilen[0] && degerlendirilen[0].puan >= 18 ? degerlendirilen[0] : null;
  // Yayıncının og:image / veri görseli genelde bir "paylaşım kartı"dır: sağ üst
  // köşede yayıncının logosu ve kendi başlığı olur. Üstten kırpıp o katmanı
  // atıyoruz. Yazı içi fotoğraflarda ve elle seçilenlerde böyle bir katman yok.
  const KIRP_UST = { kaynak: 18, veri: 16, govde: 0, elle: 0 };
  if (secilen) {
    taban = await kirp(secilen.veri, secilen.bilgi, KIRP_UST[secilen.tip] ?? 0);
    if (taban) {
      fotoVar = true;
      secilenUrl = secilen.url;
      if (debug) console.log(`   · ${a.id} seçilen: ${secilen.tip} (${secilen.puan.toFixed(0)})`);
    }
  }
  if (!taban && degerlendirilen.length && debug) {
    console.log(`   · ${a.id} tüm adaylar zayıf, tasarımlı karta düşülüyor`);
  }

  if (!taban && !kartaZorla && !sadeceStokKaynak && FOTO_KATEGORI.has(String(a.category || ""))) {
    try {
      const ov = await openverseAra(sorgu);
      if (ov) {
        taban = await hazirla(ov.url);
        if (taban) {
          fotoVar = true;
          yeniAtif = {
            yazar: ov.yazar,
            lisans: ov.lisans,
            lisansUrl: ov.lisansUrl,
            sayfa: ov.sayfa,
          };
          console.log(`   ↻ uygun olmayan fotoğraf yerine Openverse: ${ov.sayfa.slice(0, 70)}`);
        }
      }
    } catch (err) {
      console.warn(`   ! Openverse: ${err.message}`);
    }
  }

  if (!taban) {
    // Fotoğraf yoksa/uygun değilse tasarımlı zemin. Boş bir gradyan "yer
    // tutucu" gibi duruyordu; bu yüzden zemine kategori etiketi + başlık
    // basılır (fotoğraflı kapaklarda metin YOK, orada fotoğraf konuşur).
    const { boyut, lh, satirlar } = kartBasligi(a.title);
    if (debug) console.log(`   · ${a.id} kart satırları: ${JSON.stringify(satirlar)}`);
    const ilkY = 330 - ((satirlar.length - 1) * lh) / 2;
    const kategori = XML(String(a.category || "").toLocaleUpperCase("tr"));
    // Kategori artık düz sarı yazı değil, sarı bir "hap" (pill) içinde: boş
    // görünen zeminde tek başına duran küçük yazı kayboluyordu. Hap, başlığın
    // üstünde sabit bir çapa oluşturuyor.
    const hapY = Math.round(ilkY - 104);
    const hapW = Math.max(120, Math.round(kategori.length * 15.2 + 44));
    const baslikSvg = satirlar
      .map(
        (s, i) =>
          // Önce 3 px kaydırılmış koyu kopya (gölge), sonra asıl metin: fotoğraf
          // olmayan zeminde bile başlık zeminden net ayrışsın.
          `<text x="64" y="${Math.round(ilkY + i * lh + 3)}" font-size="${boyut}" font-weight="700" fill="#000000" fill-opacity="0.35" letter-spacing="-0.8">${XML(s)}</text>` +
          `<text x="64" y="${Math.round(ilkY + i * lh)}" font-size="${boyut}" font-weight="700" fill="#ffffff" letter-spacing="-0.8">${XML(s)}</text>`
      )
      .join("\n              ");
    taban = await sharp({
      create: { width: GENISLIK, height: YUKSEKLIK, channels: 3, background: "#080c15" },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="${GENISLIK}" height="${YUKSEKLIK}" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="zemin" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#080c15"/>
                  <stop offset="0.55" stop-color="#111a2c"/>
                  <stop offset="1" stop-color="#1d0f1a"/>
                </linearGradient>
                <radialGradient id="isik" cx="0.16" cy="0.08" r="0.85">
                  <stop offset="0" stop-color="#3b4a6b" stop-opacity="0.55"/>
                  <stop offset="0.55" stop-color="#1a2338" stop-opacity="0.18"/>
                  <stop offset="1" stop-color="#000000" stop-opacity="0"/>
                </radialGradient>
                <linearGradient id="kama" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#e11d2e" stop-opacity="0.95"/>
                  <stop offset="0.55" stop-color="#b81728" stop-opacity="0.8"/>
                  <stop offset="1" stop-color="#7d0e1c" stop-opacity="0.5"/>
                </linearGradient>
                <pattern id="izgara" width="44" height="44" patternUnits="userSpaceOnUse">
                  <path d="M44 0H0V44" fill="none" stroke="#ffffff" stroke-opacity="0.035" stroke-width="1"/>
                </pattern>
              </defs>
              <rect width="${GENISLIK}" height="${YUKSEKLIK}" fill="url(#zemin)"/>
              <rect width="${GENISLIK}" height="${YUKSEKLIK}" fill="url(#isik)"/>
              <rect width="${GENISLIK}" height="${YUKSEKLIK}" fill="url(#izgara)"/>
              <!-- zeminin sağında büyük, soluk marka harfi (derinlik) -->
              <text x="${GENISLIK - 430}" y="${YUKSEKLIK - 30}" font-family="Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif" font-size="540" font-weight="800" fill="#ffffff" fill-opacity="0.045">H</text>
              <!-- sağdan giren kırmızı kama -->
              <path d="M ${GENISLIK + 40} -40 L ${GENISLIK + 40} ${YUKSEKLIK + 40} L 690 ${YUKSEKLIK + 40} L 1030 -40 Z" fill="url(#kama)"/>
              <!-- sarı ince çizgi -->
              <path d="M 1000 -40 L 660 ${YUKSEKLIK + 40}" stroke="#ffd23f" stroke-width="7" stroke-opacity="0.9" fill="none"/>
              <!-- ikinci, koyu kama (derinlik) -->
              <path d="M ${GENISLIK + 40} -40 L ${GENISLIK + 40} ${YUKSEKLIK + 40} L 1010 ${YUKSEKLIK + 40} L 1215 -40 Z" fill="#05070d" fill-opacity="0.42"/>
              <g font-family="Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif">
                ${
                  kategori
                    ? `<rect x="64" y="${hapY}" width="${hapW}" height="46" rx="23" fill="#ffd23f"/>
                       <text x="${64 + Math.round(hapW / 2)}" y="${hapY + 31}" font-size="22" font-weight="700" fill="#0a0f1a" letter-spacing="2.6" text-anchor="middle">${kategori}</text>`
                    : ""
                }
                ${baslikSvg}
              </g>
            </svg>`
          ),
        },
      ])
      .png()
      .toBuffer();
  }

  if (debug) console.log(`   · ${a.id} taban hazır: ${taban ? taban.length : 0} bayt`);
  const svg = kapakSvg();
  const bilesik = await sharp(taban)
    .composite([{ input: Buffer.from(svg) }])
    .webp({ quality: KALITE, effort: 4 })
    .toBuffer();

  if (!dry) {
    fs.mkdirSync(CIKTI_DIZIN, { recursive: true });
    yazDosya(dosya, bilesik);
    if (debug) console.log(`   · ${a.id} kapak yazıldı (${bilesik.length} bayt)`);
    // Küçük varyant: liste/kart görünümü için (~20 KB).
    const kucukVeri = await sharp(bilesik)
      .resize(KUCUK_GENISLIK, Math.round((KUCUK_GENISLIK * YUKSEKLIK) / GENISLIK))
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    yazDosya(dosya.replace(/\.webp$/, "-480.webp"), kucukVeri);
    if (debug) console.log(`   · ${a.id} küçük varyant yazıldı`);
    // Sosyal kart / push görseli: aynı tabandan 1200×630 JPEG. Marka izi
    // sosyal boyutta yeniden basılır; böylece kırpma rozeti kesmez.
    const sosyalVeri = await sharp(taban)
      .resize(SOSYAL_GENISLIK, SOSYAL_YUKSEKLIK, { fit: "cover", position: "centre" })
      .composite([
        { input: Buffer.from(kapakSvg(SOSYAL_GENISLIK, SOSYAL_YUKSEKLIK)) },
      ])
      .jpeg({ quality: SOSYAL_KALITE, mozjpeg: true })
      .toBuffer();
    yazDosya(dosya.replace(/\.webp$/, SOSYAL_EK), sosyalVeri);
    if (debug) console.log(`   · ${a.id} sosyal varyant yazıldı (${sosyalVeri.length} bayt)`);
  }
  return {
    url: `${URL_TABANI}/${a.id}.webp`,
    atif: yeniAtif,
    foto: fotoVar,
    // Kapakta gerçekten kullanılan fotoğraf (sonraki yeniden üretimlerde ve
    // kapak temizliğinde `image` alanına geri yazılır).
    kaynak: secilenUrl || a.kapak?.kaynak || a.image,
  };
}

// ------------------------------------------------------- sosyal görsel modu
// Eksik `-sosyal.jpg` dosyalarını tamamlar. Kapak üretimi yeni haberler için
// zaten yazıyor; bu tur eski kapakları (indeks çekirdeği + son N gün) geriye
// dönük kapsar. Ağ kullanmaz: yalnızca depodaki WebP'yi JPEG'e çevirir.
// Sınırlı çalışır (varsayılan 120 dosya/tur) ki her 5 dakikalık turda CPU'yu
// kilitlemesin; birkaç turda tüm kapaklar tamamlanır.
if (process.argv.includes("--sosyal")) {
  const sosyalGun = arg("gun", 3);
  const sosyalLimit = arg("limit", 120);
  const sosyalEsik = Date.now() - sosyalGun * 86400000;
  // Temizliğin KORUDUĞU küme ile aynı kapsam: indeks çekirdeği (günlük
  // dondurulmuş listeler dahil), son N gün ve stok kaynaklı tasarım kartları.
  const indeksIdler = new Set(aktif);
  try {
    const d = JSON.parse(fs.readFileSync(INDEKS, "utf8"));
    if (d.days && typeof d.days === "object") {
      for (const liste of Object.values(d.days)) {
        if (Array.isArray(liste)) for (const id of liste) indeksIdler.add(String(id));
      }
    }
  } catch {}
  const hedefIdler = new Set();
  for (const a of articles) {
    if (!a || !a.id) continue;
    if (!/^\/kapak\/[A-Za-z0-9]+\.webp$/i.test(String(a.image || ""))) continue;
    const t = Date.parse(a.publishedAt || a.generatedAt || 0);
    const stokKarti =
      a.kapak &&
      a.kapak.foto === false &&
      /wikimedia\.org/i.test(String(a.kapak.kaynak || ""));
    if (
      indeksIdler.has(String(a.id)) ||
      stokKarti ||
      (Number.isFinite(t) && t >= sosyalEsik)
    ) {
      hedefIdler.add(String(a.id));
    }
  }
  const isler = [];
  for (const id of hedefIdler) {
    const webp = path.join(CIKTI_DIZIN, `${id}.webp`);
    const jpg = path.join(CIKTI_DIZIN, `${id}${SOSYAL_EK}`);
    if (!fs.existsSync(webp) || fs.existsSync(jpg)) continue;
    isler.push({ id, webp, jpg });
    if (isler.length >= sosyalLimit) break;
  }
  let sayi = 0;
  let atlanan = 0;
  await havuz(isler, 4, async ({ webp, jpg }) => {
    try {
      if (dry) {
        sayi++;
        return;
      }
      await sharp(webp)
        .resize(SOSYAL_GENISLIK, SOSYAL_YUKSEKLIK, { fit: "cover", position: "north" })
        .composite([{ input: Buffer.from(kapakSvg(SOSYAL_GENISLIK, SOSYAL_YUKSEKLIK)) }])
        .jpeg({ quality: SOSYAL_KALITE, mozjpeg: true })
        .toFile(jpg);
      sayi++;
    } catch (err) {
      atlanan++;
      console.warn(`   ! ${path.basename(jpg)}: ${err.message}`);
    }
  });
  console.log(
    `Sosyal görsel${dry ? " [dry]" : ""}: ${sayi} dosya üretildi` +
      `${atlanan ? `, ${atlanan} atlandı` : ""} ` +
      `(hedef: ${hedefIdler.size}, eksik: ${isler.length}).`
  );
  process.exit(0);
}

// --------------------------------------------------------- marka izi modu
// Var olan kapaklara (yeni tasarım öncesi üretilmiş olanlara) yalnızca marka
// izini ekler; fotoğrafı yeniden indirmez. Tek seferlik geçiş için.
if (process.argv.includes("--marka")) {
  const dosyalar = fs.readdirSync(CIKTI_DIZIN).filter((f) => f.endsWith(".webp") && !f.endsWith("-480.webp"));
  let sayi = 0;
  let atlanan = 0;
  await havuz(dosyalar, 3, async (f) => {
    const yol = path.join(CIKTI_DIZIN, f);
    try {
      const veri = await sharp(yol)
        .composite([{ input: Buffer.from(kapakSvg()) }])
        .webp({ quality: KALITE, effort: 4 })
        .toBuffer();
      yazDosya(yol, veri);
      await sharp(veri)
        .resize(KUCUK_GENISLIK, Math.round((KUCUK_GENISLIK * YUKSEKLIK) / GENISLIK))
        .webp({ quality: 82, effort: 4 })
        .toFile(yol.replace(/\.webp$/, "-480.webp"));
      await sharp(veri)
        // Sosyal oran 1200×630; 16:9 kaynaktan alttan 45 px atılır. Alttaki
        // eski rozet de bu kırpmayla gider, yerine sosyal boyuta uygun rozet
        // basılır (çift logo / kesik logo olmaz).
        .resize(SOSYAL_GENISLIK, SOSYAL_YUKSEKLIK, { fit: "cover", position: "north" })
        .composite([{ input: Buffer.from(kapakSvg(SOSYAL_GENISLIK, SOSYAL_YUKSEKLIK)) }])
        .jpeg({ quality: SOSYAL_KALITE, mozjpeg: true })
        .toFile(yol.replace(/\.webp$/, SOSYAL_EK));
      sayi++;
    } catch (err) {
      atlanan++;
      console.warn(`   ! ${f}: ${err.message}`);
    }
  });
  console.log(`${sayi} kapağa marka izi eklendi${atlanan ? `, ${atlanan} atlandı` : ""}.`);
  process.exit(0);
}

// ------------------------------------------------------- küçük varyant modu
// 1280 px kapaklar üretildikten sonra eksik 480 px kart varyantlarını tamamlar.
if (process.argv.includes("--varyant")) {
  const hedefKucuk = (f) => path.join(CIKTI_DIZIN, f.replace(/\.webp$/, "-480.webp"));
  let sayi = 0;
  if (fs.existsSync(CIKTI_DIZIN)) {
    for (const f of fs.readdirSync(CIKTI_DIZIN)) {
      if (!f.endsWith(".webp") || f.endsWith("-480.webp")) continue;
      const kucuk = hedefKucuk(f);
      if (fs.existsSync(kucuk)) continue;
      await sharp(path.join(CIKTI_DIZIN, f))
        .resize(KUCUK_GENISLIK, Math.round((KUCUK_GENISLIK * YUKSEKLIK) / GENISLIK))
        .webp({ quality: 82, effort: 4 })
        .toFile(kucuk);
      sayi++;
    }
  }
  console.log(`${sayi} küçük kapak varyantı üretildi.`);
  process.exit(0);
}

// ------------------------------------------------------- taze kapak turu
// Yayıncılar haberin görselini yayından SONRA değiştirebiliyor: önce genel bir
// kare (stok devre kartı, kurum binası...) koyup birkaç saat sonra gerçek
// fotoğrafla değiştirmek yaygın. Kapak bir kez üretildiği için eski/alakasız
// kare sitede kalıyordu (ör. "sahte VS Code eklentisi" haberinde devre kartı).
// Bu tur son N günün fotoğraflı kapaklarını kaynaktaki GÜNCEL og:image ile
// karşılaştırır ve yalnızca görsel gerçekten değiştiyse kapağı yeniler.
// Saatte bir farklı dilim denenir; her turda tüm liste taranmaz.
if (process.argv.includes("--taze")) {
  const tazeGun = arg("gun", 2);
  const tazeLimit = arg("limit", 12);
  const tazeEsik = Date.now() - tazeGun * 86400000;
  const tohum = Math.floor(Date.now() / 3600000);
  const sirala = (id) => {
    let h = tohum >>> 0;
    for (const c of String(id)) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
    return h;
  };
  const normalize = (u) => String(u || "").split(/[?#]/)[0];
  // Aynı görselin farklı boyut kopyaları (…-800.jpg / …-150x84.jpg) yeni adres
  // gibi görünür; boşuna yeniden üretmemek için dosya adı kökü karşılaştırılır.
  const kok = (u) => {
    const dosya = normalize(u).split("/").pop() || "";
    return dosya
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]\d{2,4}(x\d{2,4})?$/i, "")
      .toLowerCase();
  };
  const adaylar = articles
    .filter(
      (a) =>
        a &&
        a.id &&
        a.kapak &&
        a.kapak.foto === true &&
        /^https?:\/\//i.test(String(a.sourceUrl || "")) &&
        (Date.parse(a.publishedAt || a.generatedAt || 0) || 0) >= tazeEsik
    )
    .sort((x, y) => sirala(x.id) - sirala(y.id))
    .slice(0, tazeLimit);

  let yenilenen = 0;
  let ayni = 0;
  await havuz(adaylar, Math.min(paralel, 4), async (a) => {
    try {
      const guncel = await kaynakGorselUrl(a);
      if (!guncel) return;
      if (normalize(a.kapak.kaynak) === normalize(guncel) || kok(a.kapak.kaynak) === kok(guncel)) {
        ayni++;
        return;
      }
      if (debug) console.log(`   · ${a.id} görsel değişmiş → ${guncel.slice(0, 80)}`);
      // Yeni adresi kaynağa yaz: kapak seçimi güncel kareye kilitlenir.
      a.kapak.kaynak = guncel;
      const sonuc = await kapakUret(a);
      a.image = sonuc.url;
      a.kapak = { v: 2, kaynak: sonuc.kaynak || guncel, foto: sonuc.foto };
      console.log(`Taze kapak: ${a.title.slice(0, 62)}`);
      yenilenen++;
    } catch (err) {
      console.warn(`  ! ${a.id}: ${err.message}`);
    }
  });
  if (!dry && yenilenen) {
    fs.writeFileSync(
      ARTICLES,
      JSON.stringify(articles, null, 2).replace(/\n/g, satirSonu) + satirSonu
    );
  }
  console.log(
    `Taze kapak turu: ${yenilenen} yenilendi, ${ayni} aynı, ${adaylar.length} bakıldı.`
  );
  process.exit(0);
}

// ------------------------------------------------------------------ çalıştır
let uretilen = 0;
let hata = 0;

/** Basit iş havuzu: ağ beklemesi çok olduğu için kapaklar paralel üretilir. */
async function havuz(dizi, esZamanli, islev) {
  let imlec = 0;
  const isciler = Array.from({ length: Math.min(esZamanli, dizi.length) }, async () => {
    while (imlec < dizi.length) {
      const oge = dizi[imlec++];
      await islev(oge);
    }
  });
  await Promise.all(isciler);
}

await havuz(hedefler, paralel, async (a) => {
  const eski = a.image;
  try {
    const sonuc = await kapakUret(a);
    console.log(`${dry ? "[dry] " : ""}${a.title.slice(0, 70)} → ${sonuc.url}`);
    if (!dry) {
      a.image = sonuc.url;
      a.kapak = { v: 2, kaynak: sonuc.kaynak || eski, foto: sonuc.foto };
      if (sonuc.atif) a.gorselKaynak = sonuc.atif;
    }
    uretilen++;
  } catch (err) {
    hata++;
    console.warn(`  ! ${a.id}: ${err.message}`);
  }
});

if (!dry && uretilen) {
  fs.writeFileSync(ARTICLES, JSON.stringify(articles, null, 2).replace(/\n/g, satirSonu) + satirSonu);
}
console.log(
  `\n${uretilen} kapak ${dry ? "üretilecek" : "üretildi"}` + (hata ? `, ${hata} hata` : "") + "."
);
