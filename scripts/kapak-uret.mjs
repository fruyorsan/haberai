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
import { collectImageCandidates } from "../src/gorsel.js";
import { stokGorseller, markaAdi, afetMi } from "../src/stok-gorsel.js";
import { havuzAdaylari, kareUyumPuani, havuzEnIyiUyum } from "../src/kapak-havuz.js";
import { konuUyumPuani, yazilimKonusuMu, kapakUygunMu } from "../site/src/lib/gorsel-uygun.js";
import {
  kaynakAdaylari as kaynakSayfaAdaylari,
  kapakVerisiUygun,
  kaynakAtif,
  kaynakIzinli,
} from "../src/kapak-kaynak.js";
import { kartTaban } from "./kapak-kart.mjs";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_YOL = path.join(KOK, ".env");
if (fs.existsSync(ENV_YOL)) {
  for (const satir of fs.readFileSync(ENV_YOL, "utf8").split(/\r?\n/)) {
    const m = satir.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const ARTICLES = path.join(KOK, "data", "articles.json");
const INDEKS = path.join(KOK, "data", "indeks.json");
const CIKTI_DIZIN = path.join(KOK, "site", "public", "kapak");
const URL_TABANI = "/kapak";

const GENISLIK = 1280;
const YUKSEKLIK = 720;
// 30.10.2026: 74 → 80. Yayıncıların görselleri zaten sıkıştırılmış geliyor
// (1200×675 kare 16 KB olabiliyor); üzerine bir de q74 uygulanınca kapak
// bulanık görünüyordu. q80 fark edilir şekilde net, dosya boyutu hâlâ küçük.
const KALITE = 86;
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
// --uzak: `image` alanı hâlâ başka bir sitenin adresini gösteren (hotlink)
// haberleri hedefler. Kaynak site fotoğrafları artık kullanılmadığı için bu
// arşiv CC0/kamu malı stoğa, AI üretimine veya tasarım kartına taşınır.
const sadeceUzak = process.argv.includes("--uzak");
// --havuz: kapağı kategori sahne havuzundan gelen haberleri, YALNIZCA daha
// yakın konulu bir havuz karesi varsa yeniden üretir. Eski kapaklarda
// "bluetooth haberi → rastgele devre kartı" gibi eşleşmeleri onarır; alakasız
// karelerin toplu hâlde yeniden üretilip dosya çöpü oluşturmasını engeller.
const sadeceHavuz = process.argv.includes("--havuz");
// --varyantsiz: -480 ve -sosyal kopyalarını üretme (arşiv toplu yenilemesi).
const varyantsiz = process.argv.includes("--varyantsiz") || sadeceUzak;
// --uygunsuz: fotoğraflı ama kare–haber bağını KANITLAMAYAN kapakları
// doğrudan tasarım kartına çevirir. Ağ kullanmaz (kart yerel üretilir), bu
// yüzden binlerce eski kapağı tek turda temizleyebilir. Yanlış fotoğraf
// göstermek yerine konuya uygun, kaliteli kart göstermek daha iyidir.
const sadeceUygunsuz = process.argv.includes("--uygunsuz");
// --kapaksiz: yerel kapak dosyası hiç olmayan haberleri hedefler (arşivde
// `image` alanı hâlâ yayıncının CDN'ini gösteren eski kayıtlar). Bunlar sitede
// ya uzak/hotlink görselle ya da hiç görselle çıkıyordu. Tur, yerel havuzdan
// uygun kare bulursa onu kullanır, bulamazsa tasarım kartı üretir.
const sadeceKapaksiz = process.argv.includes("--kapaksiz");
// --kaynaktan (2026-11-08): YALNIZCA tasarım kartı olan haberleri, kaynak
// sayfanın KENDİ og:image / twitter:image karesiyle değiştirir. AI/Openverse
// çağrısı yok, tek ölçüt kalite kapısı (src/kapak-kaynak.js). Kartların %76'ya
// çıkmasının nedeni kaynak fotoğrafının tamamen devre dışı bırakılmış olmasıydı;
// bu tur o fotoğrafı geri getirir. Uygun kare yoksa haber KARTA dokunulmadan
// bırakılır ve 7 gün boyunca yeniden denenmez (`kaynakKapakDeneme`).
const sadeceKaynaktan = process.argv.includes("--kaynaktan");
// --eski: sıra seçiminde en eski haberden başla (arşiv göçü; CI taze turlarıyla
// çakışmamak için yerel çalıştırmalarda kullanılır).
const eskiOnce = process.argv.includes("--eski");
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

// ------------------------------------------------- görsel uygunluğu (sabitler)
// Bu sabitler `uygunMu` tarafından kullanılır; `sirali` filtresi de
// (`--uygunsuz` turu) `uygunMu`'yu çağırdığı için tanımlar buradadır.
const JENERIK = /(thumbnail|placeholder|default|untitled|noimage|no-image|generic|dummy|stock|screenshot|ekran|wikipedia|wiki|logo|wordmark|diagram|chart|graph|harita|map|icon|drawing|clipart|^img|^image|^photo|^dsc|^px[-_]?)/i;

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

/**
 * Mevcut kapak yerel sahne havuzundan mı geliyor ve haberle hiçbir konu
 * sözcüğü örtüşmüyor mu? (ör. Apple/Mac yazılım haberi → devre kartı)
 *
 * Böyle bir kapak `--zorla` olmadan da yeniden üretilir; aksi hâlde hatalı
 * kare, haber arşivde kaldığı sürece yerinde kalır. Yalnızca FOTOĞRAF
 * kapaklar denetlenir: tasarım kartlarında `kaynak` alanı eski fotoğrafı
 * hatırlatıyor olabilir, bu onların yeniden üretilmesini gerektirmez.
 */
function alakasizHavuzKapagi(a) {
  if (a?.kapak?.foto === false) return false;
  // Kaynak sayfanın kendi og:image'inden üretilmiş kapak: yayıncı o kareyi
  // haber için seçti, dosya adı kanıtı aranmaz (aksi hâlde her tur karta
  // düşürüyordu).
  if (a?.kapak?.kaynakTur === "kaynak") return false;
  const kaynak = String(a?.kapak?.kaynak || "");
  if (!kaynak || /^https?:/i.test(kaynak) || /^ai:/i.test(kaynak)) return false;
  if (kaynak.includes("/") || !/\.(jpe?g|png|webp)$/i.test(kaynak)) return false;
  return kareUyumPuani(a, kaynak) === 0;
}

const sirali = articles
  .filter((a) => {
    if (!a || !a.id) return false;
    if (tekId) return a.id === tekId;
    // Görsel ajanının bilinçli seçtiği kapak (kapak.ajan) hiçbir toplu turda
    // ezilmez: aksi halde ajan fotoğrafı yerine yayıncının stok karesi ya da
    // tasarım kartı geri gelebiliyor, metadata ile dosya birbirinden kopuyordu.
    if (a.kapak?.ajan) return false;
    if (sadeceUygunsuz) {
      // Fotoğraflı, kaynağı dış adres olan ve kare–haber bağı kanıtlanamayan
      // kapaklar. AI üretimi ve tasarım kartları kapsam dışı.
      if (a.kapak?.foto === false) return false;
      // Kaynak og:image'inden üretilen kapaklar bu denetimden muaftır: adı
      // `1200x675azure-armor...` gibi olan ama haberin kendi fotoğrafı olan
      // kareleri karta çevirmek hattın kendini geri alması demekti.
      if (a.kapak?.kaynakTur === "kaynak") return false;
      const kaynak = String(a.kapak?.kaynak || "");
      if (!/^https?:\/\//i.test(kaynak)) return false;
      if (/^ai:/i.test(kaynak)) return false;
      const sorgu = a.gorselSorgu || a.title || "";
      return !uygunMu(kaynak, sorgu, a.title);
    }
    if (sadeceKaynaktan) {
      // Yalnızca tasarım kartları; kaynak og:image'i varsa fotoğrafa geç.
      if (!a.kapak || a.kapak.foto !== false) return false;
      if (!/^https?:\/\//i.test(String(a.sourceUrl || ""))) return false;
      if (!kaynakIzinli(a.sourceUrl)) return false;
      const deneme = Date.parse(a.kaynakKapakDeneme || 0);
      if (Number.isFinite(deneme) && Date.now() - deneme < 7 * 86400000) return false;
      return true;
    }
    if (sadeceKapaksiz) {
      return !String(a.image || "").startsWith("/kapak/");
    }
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
    if (sadeceUzak) {
      // Hedef: `image` alanı hâlâ başka bir sitenin adresini gösteren (hotlink)
      // kapak. 07.11.2026: eskiden "kapak.kaynak alanı uzak adres" olan yerel
      // kapaklar da hedefti. Bu, havuzdan/Commons'tan gelen GEÇERLİ her kapağı
      // her turda yeniden üretiyordu — 1.500 kapak sürekli churn ediyor, CI
      // kotası boşa gidiyordu. Artık yalnızca gerçek hotlink hedeflenir.
      const adres = String(a.image || "");
      return /^https?:\/\//i.test(adres) && !adres.startsWith(`${URL_TABANI}/`);
    }
    if (sadeceHavuz) {
      // Onarım turu: yalnızca kapağı yerel sahne havuzundan gelen ve kategoride
      // HABERE DAHA YAKIN bir kare bulunan haberler. Mevcut kapak zaten en iyi
      // eşleşmeyse ya da hiç eşleşme yoksa dokunulmaz; böylece "devre kartı
      // yerine yine devre kartı" üretip dosya çöpü oluşmaz.
      if (!a.kapak || a.kapak.foto === false || a.kapak.ajan) return false;
      const kaynak = String(a.kapak.kaynak || "");
      if (!kaynak || /^https?:/i.test(kaynak) || /^ai:/i.test(kaynak)) return false;
      if (kaynak.includes("/") || !/\.(jpe?g|png|webp)$/i.test(kaynak)) return false;
      return havuzEnIyiUyum(a, a.category) > kareUyumPuani(a, kaynak);
    }
    if (sadeceStokKaynak) {
      // Yerel kapak dosyası olup taban fotoğrafı Wikimedia stoğu olan her kapak
      // (fotoğraf ya da kart) hedeftir: yayıncının kendi fotoğrafı varsa ona
      // geçilir, yoksa mevcut kart korunur. Görsel ajanının bilinçli seçtiği
      // kapaklar (kapak.ajan) bu turda korunur.
      return (
        !a.kapak?.ajan &&
        String(a.image || "").startsWith(`${URL_TABANI}/`) &&
        /wikimedia\.org/i.test(String(a.kapak?.kaynak || ""))
      );
    }
    if (sadeceKapakli) {
      return Boolean(a.kapak);
    }
    if (
      !zorla &&
      typeof a.image === "string" &&
      a.image.startsWith(`${URL_TABANI}/`) &&
      !alakasizHavuzKapagi(a)
    ) {
      return false;
    }
    if (!a.image) return false;
    if (gun > 0) {
      const t = Date.parse(a.publishedAt || a.generatedAt || 0);
      return Number.isFinite(t) && t >= esik;
    }
    return aktif.has(String(a.id));
  })
  // Sıra: varsayılan en yeni haber önce (CI'da tur başına sınır var, taze içerik
  // önce kapsanır). `--eski` arşiv göçü içindir: en eski haberden başlanır,
  // böylece CI'ın taze turlarıyla aynı haberlere iki kez dokunulmaz.
  .sort((a, b) => {
    const t =
      Date.parse(b.publishedAt || b.generatedAt || 0) -
      Date.parse(a.publishedAt || a.generatedAt || 0);
    return eskiOnce ? -t : t;
  });

// SIRA SEÇİMİ. `--fotoyok` turu 4-5 dakikada bir çalışıyor ve en yeni N kartı
// hedefliyor. Sıralama sabit kalınca AYNI N kart her turda yeniden deneniyordu:
// fotoğrafı bulunamayan kartlar kuyruğu tıkıyor, eski kartlara hiç sıra
// gelmiyordu (332 kartın 80'i sonsuza kadar dönüyordu). Artık en yeni 24 kart
// her turda denenir (taze içerik), kalan kota saatte bir kayan pencereden
// doldurulur; böylece birkaç saatte tüm kartlar sırayla denenir.
const hedefler = (() => {
  if (sadeceHavuz || sadeceUygunsuz || sadeceKapaksiz) {
    // Onarım turu döner: düzeltilemeyen (daha yakın kare olmayan) kapaklar
    // listede kalacağı için sabit bir dilim seçilirse her tur aynı 120 haber
    // denenir ve eski kapaklara hiç sıra gelmez. Saatlik kayan pencere.
    // `--uygunsuz` da aynı mantıkla ilerler: kural dışı kalan kapak varsa
    // listede kalır ama saat başı pencere kaydığı için tüm arşiv dolaşılır.
    if (sirali.length <= limit) return sirali;
    const tur = Math.floor(Date.now() / 3600000);
    const bas = (tur * limit) % sirali.length;
    const secilen = [];
    for (let i = 0; i < limit; i++) secilen.push(sirali[(bas + i) % sirali.length]);
    return secilen;
  }
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

// Stok fotoğraf havuzları. Bu adreslerden gelen kareler "yayıncının kendi
// görseli" sayılmaz; `uygunMu` süzgecinden geçmek zorundadır.
const STOK_KONAK = /(wikimedia\.org|openverse|flickr\.com|pixabay\.com|pexels\.com|unsplash\.com)/i;

// ATIF GEREKTİRMEYEN lisanslar. Sayfada görsel kredisi gösterilmediği için
// CC BY / CC BY-SA kapak olarak kullanılmaz; yalnızca CC0 / kamu malı kabul
// edilir. Veri dosyasındaki eski bir görsel yeniden kapak yapılacaksa lisansı
// da bu listeye uymak zorundadır.
const KAMU_MALI =
  /^(cc0\b|public domain\b|pd\b|pd[- ].*|no restrictions\b|kamu mal[ıi]$)/i;
const lisansUygun = (lisans) => KAMU_MALI.test(String(lisans || "").trim());

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
 *
 * Kural `site/src/lib/gorsel-uygun.js` içindeki `kapakUygunMu`'da durur: sorgu
 * bigram'ı, sorgunun en az %60'ı ve başlıktaki iki özel ad. Burada yalnızca
 * dosya adı jenerikliği eklenir — iki taraf da aynı kuralı kullanır, yoksa
 * üretim ile arşiv denetimi birbirinden kopuyor.
 *
 * @param {string} url
 * @param {string} sorgu  İngilizce görsel sorgusu
 * @param {string} [baslik] Haber başlığı (özel ad kanıtı için)
 */
function uygunMu(url, sorgu, baslik = "") {
  const ad = decodeURIComponent(String(url || "").split("/").pop() || "");
  if (!ad || JENERIK.test(ad)) return false;
  return kapakUygunMu({ gorselSorgu: sorgu, title: baslik }, url);
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
      license: "cc0",
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
  //
  // 07.11.2026: 3 → 4 satır. Kartların %14'ünde başlık "…" ile kesiliyordu
  // ("... 3,9 Milyar Euro Yatırım…"); 4 satırda bu oran %0,7'ye iniyor ve
  // dikey yerleşim (etiket + 4×65 px) panelin içinde kalıyor.
  const SATIR_SAYISI = 4;

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

const KATEGORI_RENK = {
  "Yapay Zeka": "#c084fc",
  "Donanım": "#34d399",
  "Yazılım": "#60a5fa",
  "Mobil": "#22d3ee",
  "Oyun": "#a78bfa",
  "Siber Güvenlik": "#2dd4bf",
  "Bilim": "#818cf8",
  "Uzay": "#f472b6",
  "Ekonomi": "#fbbf24",
  "Spor": "#f59e0b",
  "Sağlık": "#fb7185",
  "Kültür": "#e879f9",
  "Dünya": "#38bdf8",
  "Otomobil": "#34d399",
  "Teknoloji": "#60a5fa",
  "Gündem": "#f43f5e",
};

function kapakSvg(w = GENISLIK, h = YUKSEKLIK, kategori = "Gündem", fotoMu = true) {
  const vurgu = KATEGORI_RENK[kategori] || "#f43f5e";
  const sinematik = fotoMu
    ? `<radialGradient id="vin" cx="0.5" cy="0.45" r="0.78">
      <stop offset="0.58" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.48"/>
    </radialGradient>
    <radialGradient id="isik" cx="0.06" cy="0.96" r="0.65">
      <stop offset="0" stop-color="${vurgu}" stop-opacity="0.32"/>
      <stop offset="1" stop-color="${vurgu}" stop-opacity="0"/>
    </radialGradient>`
    : "";
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="kose" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.68"/>
    </linearGradient>
    <linearGradient id="altSerit" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${vurgu}"/>
      <stop offset="0.55" stop-color="#e11d2e"/>
      <stop offset="1" stop-color="#e11d2e"/>
    </linearGradient>
    ${sinematik}
  </defs>
  ${fotoMu ? `<rect width="${w}" height="${h}" fill="url(#vin)"/><rect width="${w}" height="${h}" fill="url(#isik)"/>` : ""}
  <rect x="0" y="${h - 110}" width="${w}" height="110" fill="url(#kose)"/>
  <rect x="0" y="${h - 7}" width="${w}" height="7" fill="url(#altSerit)"/>
  <g font-family="Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif">
    <!-- Sağ alt köşe plakası: yayıncıların köşeye bastığı kendi logolarını
         (AH, Webtekno, DH...) örter. Rozet bu plakanın içinde durur, böylece
         iki logo üst üste binmez. -->
    <path d="M ${w - 236} ${h} L ${w - 236} ${h - 58} Q ${w - 236} ${h - 70} ${w - 224} ${h - 70} L ${w} ${h - 70} L ${w} ${h} Z" fill="#0b0e14" fill-opacity="0.92"/>
    <rect x="${w - 208}" y="${h - 52}" width="12" height="22" rx="2.5" fill="#e11d2e"/>
    <text x="${w - 186}" y="${h - 32}" font-size="22" font-weight="700" fill="#ffffff" letter-spacing="-0.3">haberinai</text>
  </g>
</svg>`;
}

let aiSayac = 0;
let aiKotaDoldu = false;
const AI_TUR_LIMIT = Number(process.env.AI_KAPAK_LIMIT || 25);

/**
 * Yayıncıda temiz fotoğraf bulunamayan haberler için Cloudflare Workers AI
 * (`Llama-3.1` sahne yönetmeni + `Leonardo Phoenix 1.0` / `Lucid Origin` / `FLUX`)
 * ile haberin başlığına ve içeriğine özel 16:9 fotogerçekçi basın fotoğrafı üretir.
 */
async function aiGorselUret(a) {
  const acc = process.env.CLOUDFLARE_ACCOUNT_ID;
  const tok = process.env.CLOUDFLARE_API_TOKEN;
  if (!acc || !tok || aiKotaDoldu || aiSayac >= AI_TUR_LIMIT) {
    if (debug) console.log(`   · ${a.id} AI atlandı: acc=${Boolean(acc)} tok=${Boolean(tok)} kota=${aiKotaDoldu} sayac=${aiSayac}`);
    return null;
  }

  const tabanUrl = `https://api.cloudflare.com/client/v4/accounts/${acc}/ai/run/`;
  const basliklar = {
    Authorization: `Bearer ${tok}`,
    "Content-Type": "application/json",
  };

  let sahne = "";
  try {
    const sys =
      "You are a senior photo editor for a major technology and news magazine. Convert the Turkish news headline and summary into ONE English prompt (max 65 words) for a photorealistic text-to-image model. Rules: 1) Describe a concrete, dramatic, realistic press or studio photograph (35mm or 85mm lens, shallow depth of field, natural color grading, rich rim lighting) that directly illustrates the core subject of the article. 2) Do NOT mention brand names, company names, or real politicians by name; describe the physical object, device, vehicle, stadium, courtroom, or environment instead so the model does not draw gibberish logos. 3) Keep the main subject centered. 4) Explicitly forbid any text, letters, numbers, logos, or watermarks. Output ONLY the prompt.";
    const usr = `Category: ${a.category || "Gündem"}\nHeadline: ${a.title || ""}\nSummary: ${String(a.summary || "").slice(0, 260)}`;
    const r = await fetch(`${tabanUrl}@cf/meta/llama-3.1-8b-instruct`, {
      method: "POST",
      headers: basliklar,
      body: JSON.stringify({
        messages: [
          { role: "system", content: sys },
          { role: "user", content: usr },
        ],
        max_tokens: 120,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (r.status === 429 || r.status === 402) {
      // Prompt modeli (Llama) kotası görsel modelinden bağımsızdır. Burada
      // turu kapatmak, görsel kotası boşken bile kapak üretimini durduruyordu;
      // bunun yerine aşağıdaki yedek İngilizce istemle devam edilir.
      if (debug) console.log(`   · ${a.id} Llama kotası dolu: HTTP ${r.status} (yedek istem)`);
    } else if (!r.ok && debug) {
      console.log(`   · ${a.id} Llama HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
    } else if (r.ok) {
      const j = await r.json();
      sahne = String(j?.result?.response || "")
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  } catch (err) {
    if (debug) console.log(`   · ${a.id} Llama catch: ${err.message}`);
  }

  if (!sahne) {
    sahne = `Professional editorial press photograph representing ${a.category || "news"}: ${a.gorselSorgu || a.title}, 35mm lens, shallow depth of field, cinematic natural lighting, magazine quality.`;
  }
  const sonPrompt = `${sahne} No text, no words, no letters, no numbers, no logos, no watermark.`;

  const modeller = [
    "@cf/leonardo/phoenix-1.0",
    "@cf/leonardo/lucid-origin",
    "@cf/black-forest-labs/flux-1-schnell",
  ];

  for (const m of modeller) {
    try {
      const govde =
        m.includes("flux-1-schnell")
          ? { prompt: sonPrompt }
          : { prompt: sonPrompt, width: GENISLIK, height: YUKSEKLIK };
      const r = await fetch(`${tabanUrl}${m}`, {
        method: "POST",
        headers: basliklar,
        body: JSON.stringify(govde),
        signal: AbortSignal.timeout(28000),
      });
      if (r.status === 429 || r.status === 402) {
        if (debug) console.log(`   · ${a.id} AI kota doldu (${m}): HTTP ${r.status}`);
        aiKotaDoldu = true;
        return null;
      }
      if (!r.ok) {
        if (debug) console.log(`   · ${a.id} AI hata (${m}): HTTP ${r.status}`);
        continue;
      }
      const ct = String(r.headers.get("content-type") || "");
      let buf = null;
      if (ct.startsWith("image/")) {
        buf = Buffer.from(await r.arrayBuffer());
      } else {
        const j = await r.json();
        if (j?.result?.image) buf = Buffer.from(j.result.image, "base64");
      }
      if (buf && buf.length > 8000) {
        aiSayac++;
        return { veri: buf, model: m.split("/").pop() };
      } else if (debug) {
        console.log(`   · ${a.id} AI boş yanıt (${m}): ct=${ct} len=${buf ? buf.length : 0}`);
      }
    } catch (err) {
      if (debug) console.log(`   · ${a.id} AI catch (${m}): ${err.message}`);
    }
  }
  return null;
}

/**
 * Kaynak sitede temiz fotoğraf bulunamadığında haberin Türkçe başlığıyla
 * geniş (16:9) ve yüksek çözünürlüklü gerçek haber/basın fotoğraflarını arar.
 * Adaylar yine `paylasimKartiMi` (başka sitenin yazılı kartını eleme) ve
 * `gorselPuani` (netlik/çözünürlük) filtrelerinden geçer.
 */
async function haberGorselAra(a) {
  const temizBaslik = String(a.title || "")
    .replace(/['"“”‘’?!:;,.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const kisaBaslik = temizBaslik.split(" ").slice(0, 5).join(" ");
  const anahtarKelimeler = [
    ...new Set(
      `${temizBaslik} ${a.gorselSorgu || ""}`
        .toLowerCase()
        .replace(/ı/g, "i")
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ş/g, "s")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c")
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3 && !/^(icin|olan|olarak|daha|yeni|gibi|gore|sonra|once|kadar|tumu|tum|ile|veya)$/.test(w))
    ),
  ];
  const sorgular = [
    kisaBaslik,
    String(a.gorselSorgu || "").trim(),
    temizBaslik,
  ].filter(Boolean);
  const cikti = [];
  for (const sorguMetni of [...new Set(sorgular)]) {
    try {
      const url = `https://www.bing.com/images/search?q=${encodeURIComponent(sorguMetni)}&form=HDRSC2`;
      const r = await fetch(url, {
        headers: {
          "user-agent": UA_TARAYICI,
          accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          "accept-language": "tr-TR,tr;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) continue;
      const html = await r.text();
      for (const m of html.matchAll(/murl&quot;:&quot;(https?:\/\/[^&]+?)&quot;([\s\S]{0,600}?)(?:mad&quot;|< \/a>|<\/a>)/g)) {
        const u = m[1].replace(/&amp;/g, "&");
        const baglam = `${u} ${m[2] || ""}`
          .toLowerCase()
          .replace(/ı/g, "i")
          .replace(/ğ/g, "g")
          .replace(/ü/g, "u")
          .replace(/ş/g, "s")
          .replace(/ö/g, "o")
          .replace(/ç/g, "c");
        if (KAYNAK_JUNK.test(u) || STOK_KONAK.test(u)) continue;
        if (/youtube\.com|ytimg\.com|tiktok\.com|instagram\.com|fbsbx\.com|brosur|aktuelurun|katalog/i.test(u)) continue;
        if (anahtarKelimeler.length && !anahtarKelimeler.some((k) => baglam.includes(k))) continue;
        const temiz = dhTemizUrl(u);
        if (temiz && !cikti.includes(temiz)) cikti.push(temiz);
        if (!cikti.includes(u)) cikti.push(u);
        if (cikti.length >= 10) return cikti;
      }
      if (cikti.length >= 4) break;
    } catch {
      // Sonraki sorguyu dene
    }
  }
  return cikti;
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

const UA_TARAYICI =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const KAYNAK_JUNK =
  /(logo|favicon|default|placeholder|share-?default|sprite|avatar|ikon|icon|blank|1x1|pixel|\/editor\/|\/recommendations\/|dh-instagram|PodCastChannel|dh-oneriyor|populer-yerinde|benzer-haber|adserve\.)/i;

// Birden fazla haberin `images` dizisinde tekrar eden görseller yan menü /
// "ilginizi çekebilir" widget'larından gelmiştir; gövde adayı olarak kullanılmaz.
const ortakYanGorseller = (() => {
  const sayac = new Map();
  for (const x of articles) {
    for (const u of Array.isArray(x?.images) ? x.images : []) {
      const k = String(u || "").trim();
      if (k) sayac.set(k, (sayac.get(k) || 0) + 1);
    }
  }
  const set = new Set();
  for (const [k, n] of sayac.entries()) {
    if (n >= 2) set.add(k);
  }
  return set;
})();

/** DonanımHaber 1200x675 paylaşım kartından yazı içi temiz `/src/..._0.jpg` adresini türetir. */
function dhTemizUrl(u) {
  const s = String(u || "");
  if (/ichef\.bbci\.co\.uk\/ace\/branded_news\//i.test(s)) {
    return s.replace(/\/ace\/branded_news\//i, "/ace/standard/");
  }
  const m = /^(https?:\/\/www\.donanimhaber\.com\/images\/images\/haber\/(\d+)\/)(?:1200x675|600x314|340x191)([^/?#]+)\.(jpe?g|png|webp)$/i.exec(
    s
  );
  return m ? `${m[1]}src/${m[3]}${m[2]}_0.${m[4]}` : null;
}

/**
 * Kaynak makaledeki görsel adayları (öncelik sırasıyla):
 * 1) DonanımHaber yazı içi temiz `/src/` fotoğrafları (başlık plakası yoktur)
 * 2) og:image / twitter:image / JSON-LD
 * 3) Makale gövdesindeki en büyük görseller
 *
 * 2026-11-08: Hat yeniden açıldı. Kural artık `src/kapak-kaynak.js` içinde:
 * rakip üretimi (ShiftDelete) ve ajans CDN'leri yasak, geri kalan kaynaklar
 * kalite kapısından (çözünürlük, oran, bulanıklık, düzlük, beyaz/metin oranı,
 * paylaşım kartı) geçerse kullanılır ve `gorselKaynak` ile atıflanır.
 */
async function kaynakGorselAdaylari(a) {
  const adaylar = await kaynakSayfaAdaylari(a, { adet: 6, debug });
  return adaylar.map((g) => g.url);
}

/** Kaynak makalenin birincil görseli (`--taze` turu için). */
async function kaynakGorselUrl(a) {
  const adaylar = await kaynakGorselAdaylari(a);
  return adaylar[0] || null;
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
    let bandGecis = 0;
    let ustSolSari = 0;
    let solYaziSatir = 0;
    for (let y = 0; y < h; y++) {
      let kirmizi = 0;
      let beyaz = 0;
      let gecis = 0;
      let oncekiRenk = 0; // 1 = kirmizi, 2 = beyaz
      let solSariBeyaz = 0;
      let solKoyu = 0;
      const solSinir = Math.round(w * 0.62);
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * ch;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const beyazMi = r >= 238 && g >= 238 && b >= 238;
        const kirmiziMi = r >= 140 && r - g >= 60 && r - b >= 50;
        const sariMi = r >= 210 && g >= 150 && b <= 55 && r - b >= 160;
        if (beyazMi) {
          beyaz++;
          if (oncekiRenk === 1) gecis++;
          oncekiRenk = 2;
        } else if (kirmiziMi) {
          kirmizi++;
          if (oncekiRenk === 2) gecis++;
          oncekiRenk = 1;
        } else {
          oncekiRenk = 0;
        }
        if (y < Math.round(h * 0.13) && x < Math.round(w * 0.36) && sariMi) ustSolSari++;
        if (x < solSinir && y >= Math.round(h * 0.12) && y <= Math.round(h * 0.62)) {
          if (beyazMi || sariMi) solSariBeyaz++;
          else if (r < 65 && g < 65 && b < 65) solKoyu++;
        }
      }
      if (kirmizi / w >= 0.25 && gecis >= 4) {
        plakaSatir++;
        bandBeyaz += beyaz;
        bandGecis += gecis;
      }
      if (
        solSinir > 0 &&
        solSariBeyaz / solSinir >= 0.06 &&
        solSariBeyaz / solSinir <= 0.48 &&
        solKoyu / solSinir >= 0.32
      ) {
        solYaziSatir++;
      }
    }
    const plakaOran = (plakaSatir / h) * 100;
    const yazi = plakaSatir ? (bandBeyaz / (plakaSatir * w)) * 100 : 0;
    const ortGecis = plakaSatir ? bandGecis / plakaSatir : 0;
    const ustSolAlan = Math.max(1, Math.round(h * 0.13) * Math.round(w * 0.36));
    const sdnKarti = ustSolSari / ustSolAlan >= 0.08 && solYaziSatir / h >= 0.12;
    return {
      kart: (plakaOran >= 8 && plakaOran <= 58 && yazi >= 0.35 && ortGecis >= 6) || sdnKarti,
      plakaOran: sdnKarti ? 100 : plakaOran,
      yazi: sdnKarti ? (solYaziSatir / h) * 100 : yazi,
    };
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
    let beyazSay = 0;
    let siyahSay = 0;
    let adet = 0;
    for (let i = 0; i + 2 < data.length; i += adim) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const p = 0.299 * r + 0.587 * g + 0.114 * b;
      toplam += p;
      kare += p * p;
      if (
        (r >= 238 && g >= 238 && b >= 238) ||
        (r >= 212 && g >= 212 && b >= 212 && Math.max(r, g, b) - Math.min(r, g, b) <= 10)
      ) {
        beyazSay++;
      }
      if (r <= 18 && g <= 18 && b <= 18) siyahSay++;
      const en = Math.max(r, g, b);
      const az = Math.min(r, g, b);
      if (en > 8) doygun += (en - az) / en;
      adet++;
    }
    if (!adet) return null;
    const ort = toplam / adet;
    const std = Math.sqrt(Math.max(0, kare / adet - ort * ort));
    const doy = doygun / adet;
    // Düz/boş kare, bembeyaz belge/broşür ekran görüntüsü veya simsiyah podcast kartı kapak yapılmaz.
    if (std < 9 || (std < 14 && doy < 0.03)) return null;
    if (beyazSay / adet > 0.42 || siyahSay / adet > 0.65) return null;

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

// Aynı turda seçilen fotoğraflar: bir kare iki habere kapak olmasın. Aynı
// markanın iki haberi (ör. iki Samsung haberi) farklı ürün kareleri alır.
const kullanilanKapaklar = new Set();

async function kapakUret(a) {
  const dosya = path.join(CIKTI_DIZIN, `${a.id}.webp`);
  // Daha önce üretilmiş kapağın taban fotoğrafı `kapak.kaynak`ta durur.
  const kaynak = a.kapak?.kaynak || a.image;
  const sorgu = a.gorselSorgu || a.title || "";
  // Stok görselli ESKİ haber: fotoğraf kapak üretilse bile temizlik onu silip
  // haberi stoğa geri döndürür. Onun için doğrudan tasarım kartı üretilir
  // (temizlik, kaynağı stok olan kartları korur).
  const kartaZorla =
    sadeceKart || sadeceUygunsuz || (sadeceStok && !aktif.has(String(a.id)));

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
      // Kapak sağ alt köşesinde bizim 236×70 px opak `#0b0e14` "haberinai"
      // plakamız var; köşedeki küçük yayıncı filigranını zaten örtüyor.
      // Eskiden üstten %18 ve sağdan %10 körlemesine kesiliyordu; bu da normal
      // 16:9 fotoğraflarda insan kafalarını ve ürün üstlerini uçuruyordu.
      // Artık yalnızca açıkça istenirse (`ustYuzde` / `kirpSolYuzde`) kesilir.
      const w = bilgi.width || 0;
      const h = bilgi.height || 0;
      const sol = Math.round((w * Math.min(Math.max(kirpSolYuzde, 0), 40)) / 100);
      const ust = Math.round((h * Math.min(Math.max(ustYuzde, 0), 30)) / 100);
      const kirpW = Math.max(1, w - sol);
      const kirpH = Math.max(1, h - ust);
      const konum =
        w * h <= 16_000_000 && w / Math.max(1, h) >= 1.3 ? sharp.strategy.attention : "centre";
      let boru = sharp(veri);
      if (w > 0 && h > 0 && (sol > 0 || ust > 0) && kirpW > 480 && kirpH > 270) {
        boru = boru.extract({ left: sol, top: ust, width: kirpW, height: kirpH });
      }
      const buyutme = GENISLIK / Math.max(1, kirpW);
      const keskinlik =
        buyutme > 1.3
          ? { sigma: 1.2, m1: 1.2, m2: 0.6 }
          : buyutme > 1.05
            ? { sigma: 0.9, m1: 0.8, m2: 0.4 }
            : { sigma: 0.6 };
      return await boru
        .resize(GENISLIK, YUKSEKLIK, { fit: "cover", position: konum })
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

  /** Yerel havuz karesi: ağ yok, doğrudan dosyadan. */
  const hazirlaYerel = async (yol) => {
    try {
      const veri = fs.readFileSync(yol);
      const bilgi = await sharp(veri).metadata();
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
  } else if (!kartaZorla && !sadeceUygunsuz) {
    // 0) KAYNAK SAYFANIN KENDİ FOTOĞRAFI (og:image / twitter:image / JSON-LD).
    //    Yayıncı o kareyi haber için seçmiş: anlamsal uyumun en güçlü kanıtı.
    //    Aday havuzunun başına konur; kalite kapısından geçmezse sıradaki
    //    adaya geçilir (stok / Openverse / AI / kart).
    try {
      const kaynakAdaylari = await kaynakSayfaAdaylari(a, {
        adet: sadeceKaynaktan ? 4 : 3,
        debug,
      });
      for (const g of kaynakAdaylari) adayEkle(g.url, "kaynak");
      if (debug && !kaynakAdaylari.length) console.log(`   · ${a.id} kaynak sayfada görsel yok`);
    } catch (err) {
      if (debug) console.log(`   · ${a.id} kaynak görsel hatası: ${err.message}`);
    }

    const stokAday = STOK_KONAK.test(String(kaynak || ""));
    if (
      stokAday &&
      lisansUygun(a.gorselKaynak?.lisans) &&
      String(kaynak || "").startsWith("http") &&
      !ortakYanGorseller.has(String(kaynak || "").trim()) &&
      !(sadeceStokKaynak && stokAday) &&
      uygunMu(kaynak, sorgu, a.title)
    ) {
      const temiz = dhTemizUrl(kaynak);
      if (temiz) adayEkle(temiz, "veri");
      adayEkle(kaynak, "veri");
    }

    // ARŞİVDEKİ CC0 / KAMU MALI EK FOTOĞRAFLAR. Bu kareler daha önce bu haber
    // için seçilmiş, yani konuyla ilgisi doğrulanmış; lisansları da atıf
    // gerektirmiyor. Eski uzak kapağı yerelleştirirken jenerik tasarım kartına
    // düşmek yerine bunları denemek çok daha iyi bir kapak veriyor.
    const ekAdaylar = (Array.isArray(a.gorselEk) ? a.gorselEk : [])
      .filter(
        (g) =>
          g &&
          typeof g.url === "string" &&
          /^https?:\/\//i.test(g.url) &&
          lisansUygun(g.lisans) &&
          !ortakYanGorseller.has(g.url.trim())
      )
      .slice(0, 3);
    for (const g of ekAdaylar) {
      const temiz = dhTemizUrl(g.url);
      if (temiz) adayEkle(temiz, "ek");
      adayEkle(g.url, "ek");
    }
  }

  // En fazla 6 aday indirilir (kaynak 4 + stok 2); geçen kaynak karesinde
  // döngü erken biter (hız).
  const degerlendirilen = [];
  const EN_FAZLA_ADAY = 6;
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

    // Kaynak og:image adayı: kalite kapısı (çözünürlük, oran, bulanıklık,
    // düzlük, beyaz/metin ağırlığı) burada uygulanır. `uygunMu` dosya-adı
    // kanıtı aramaz — yayıncı kareyi bu haber için seçmiş.
    if (aday.tip === "kaynak") {
      const kapi = await kapakVerisiUygun(veri);
      if (!kapi.uygun) {
        if (debug) console.log(`   · ${a.id} kaynak elendi (${kapi.neden}): ${aday.url.slice(0, 70)}`);
        continue;
      }
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
      // YAYINCININ KENDİ KAPAĞI (og:image) güçlü öncelik alır (+35). Yan menü
      // veya yazı içindeki daha renkli bir görsel, haberin asıl kapağını ezmemeli.
      siralama: puan + (aday.tip === "kaynak" ? 35 : 0),
    });
    if (debug) {
      console.log(`   · ${a.id} ${aday.tip} puan ${puan.toFixed(0)}: ${aday.url.slice(0, 80)}`);
    }
    if (aday.tip === "kaynak") break; // ilk geçen kaynak karesi yeterli (hız)
    if (puan >= 84) break;
  }

  degerlendirilen.sort((x, y) => y.siralama - x.siralama);

  let taban = null;
  let yeniAtif = null;
  let fotoVar = false;
  let secilenUrl = null;
  let secilenTip = null;

  // 29.10.2026: eşik 42 → 18.
  // KURAL: Konuyla ALAKALI gerçek fotoğraf, tasarımlı karttan HER ZAMAN iyidir.
  // Düşük puan "boş, loş, düz" demektir; alakasız demek değildir. Bu adaylar
  // zaten yayıncının kendi sayfasından (og:image) veya yazı içinden geliyor,
  // yani başlıkla ilgisi tanım gereği doğru. `gorselPuani` bembeyaz/tek renk
  // kareleri null ile eliyor; kalan her kare karttan üstündür.
  const secilen = degerlendirilen[0] && degerlendirilen[0].puan >= 18 ? degerlendirilen[0] : null;
  const KIRP_UST = { kaynak: 0, veri: 0, govde: 0, elle: 0 };
  if (secilen) {
    taban = await kirp(secilen.veri, secilen.bilgi, KIRP_UST[secilen.tip] ?? 0);
    if (taban) {
      fotoVar = true;
      secilenUrl = secilen.url;
      secilenTip = secilen.tip;
      // Kaynak fotoğrafı kullanıldıysa atıf kaydı: hangi sayfadan alındığı ve
      // yayıncı alan adı `gorselKaynak`ta tutulur (telif şikâyeti / kaynak
      // gösterme zinciri). Stok atıfları aşağıdaki kabulEt() içinde yazılır.
      if (secilen.tip === "kaynak") yeniAtif = kaynakAtif(a, secilen.url);
      if (debug) console.log(`   · ${a.id} seçilen: ${secilen.tip} (${secilen.puan.toFixed(0)})`);
    }
  }
  if (!taban && degerlendirilen.length && debug) {
    console.log(`   · ${a.id} tüm adaylar zayıf, tasarımlı karta düşülüyor`);
  }

  // NOT: Bing/görsel arama ile başka sitelerden fotoğraf toplama kaldırıldı.
  // O karelerin lisansı bilinmiyordu (çoğu ajans/rakip yayıncı); kapak yalnızca
  // atıf gerektirmeyen stok havuzdan veya AI üretiminden gelir.
// Commons'tan ATIF GEREKTİRMEYEN (CC0 / kamu malı) fotoğraf seçimi.
//
// TASARIM KARARI: Türkçe bir haber başlığı ile İngilizce Commons dosya adı
// arasında kelime örtüşmesi aramak GÜVENİLMEZ. "Maserati ... satış" → Venezuela
// peyniri satışı, "Premium ... sesli kitap" → Premium Outlets mağazası,
// "Beşiktaş ... maç" → Ihlamur Kasrı bahçesi gibi kapaklar bu yüzden çıktı.
// Yanlış fotoğraf, markalı tasarım kartından çok daha kötü: okurun güvenini
// kaybettiriyor ve sayfayı "alakasız" gösteriyor.
//
// Bu yüzden fotoğraf yalnızca KANITLANABİLİR durumda kullanılır:
//   • Marka/özel ad varsa, Commons KATEGORİSİNDE o ad geçmeli
//     (src/stok-gorsel.js `marka` doğrulaması). "Samsung" → Samsung kategorisi
//     içindeki ürün fotoğrafı. Bu sinyal tesadüfe yer bırakmaz.
//   • Başka hiçbir kelime eşleşmesine güvenilmez.
// Uygun fotoğraf yoksa haber markalı tasarım kartına düşer (kapak-kart.mjs).

if (!taban && !kartaZorla && !sadeceKaynaktan) {
  try {
    // Adayları kabul et: lisans, tekrar, indirme ve "dolu kare" puanı.
    const kabulEt = async (adaylar, etiket) => {
      for (const g of adaylar) {
        if (!lisansUygun(g.lisans)) continue;
        if (kullanilanKapaklar.has(g.url)) continue;
        // ÖNCE rezerve et: paralel çalışan iki haber aynı kareyi indirmeye
        // başlarsa ikisi de "kullanılmamış" görüp aynı kapağı alıyordu.
        kullanilanKapaklar.add(g.url);
        // Yerel havuz karesi: indirme yok, dosyadan okunur.
        const hazir = g.dosyaYolu ? await hazirlaYerel(g.dosyaYolu) : await hazirla(g.url);
        if (!hazir) {
          kullanilanKapaklar.delete(g.url);
          continue;
        }
        const bilgi = await sharp(hazir).metadata();
        const puan = await gorselPuani(hazir, bilgi);
        if (puan === null || puan < 24) {
          kullanilanKapaklar.delete(g.url);
          continue;
        }
        taban = hazir;
        fotoVar = true;
        secilenUrl = g.url;
        yeniAtif = {
          yazar: g.yazar || "",
          lisans: g.lisans || "CC0",
          lisansUrl: g.lisansUrl || "",
          sayfa: g.sayfa || "",
        };
        if (debug) {
          const ad = g.dosyaYolu ? path.basename(g.dosyaYolu) : g.sayfa.slice(0, 62);
          console.log(`   ✦ Havuz ${g.lisans} [${etiket}] (${puan.toFixed(0)}p): ${ad}`);
        }
        return true;
      }
      return false;
    };

    // 1) MARKA / ÖZEL AD: yalnızca Commons kategori üyeliği doğrularsa.
    //    Yazılım/arayüz haberlerinde marka fotoğrafı (Apple Park, mağaza, logo)
    //    haberi anlatmıyor; o haberlerde AI görseli veya tasarım kartı daha
    //    doğru. Donanım/ürün haberlerinde marka fotoğrafı değerlidir.
    const marka = markaAdi(a.title);
    if (marka && !yazilimKonusuMu(a)) {
      const adaylar = (
        await stokGorseller([marka], {
          adet: 4,
          afet: afetMi(a.title, a.summary),
          marka,
          kullanilan: kullanilanKapaklar,
        })
      ).filter((g) => konuUyumPuani(a, g.dosya || g.sayfa || g.url) >= 1);
      await kabulEt(adaylar, marka);
    }

    // 2) KATEGORİ SAHNESİ: gözle onaylanmış YEREL havuzdan. Ağ çağrısı yok,
    //    kare gerçekten o kategorinin sahnesi, aynı tur içinde tekrar etmez.
    //    Haber kimliğinden türeyen başlangıç, aynı kategorideki haberlerin
    //    hep aynı kareyi almamasını sağlar.
    if (!taban) {
      let tohum = 0;
      for (const ch of String(a.id || "")) tohum = (tohum * 31 + ch.charCodeAt(0)) >>> 0;
      const adaylar = havuzAdaylari(a.category, {
        adet: 6,
        kullanilan: kullanilanKapaklar,
        offset: tohum,
        article: a,
      });
      if (debug && !adaylar.length) {
        console.log(`   · ${a.id} havuzda haberle örtüşen kare yok (konu kapısı)`);
      }
      await kabulEt(adaylar, String(a.category || "kategori"));
    }
  } catch (err) {
    if (debug) console.warn(`   ! Commons: ${err.message}`);
  }
}

  if (!taban && !kartaZorla && !sadeceHavuz && !sadeceKaynaktan) {
    const aiSonuc = await aiGorselUret(a);
    if (aiSonuc) {
      const bilgi = await sharp(aiSonuc.veri).metadata();
      taban = await kirp(aiSonuc.veri, bilgi, 0);
      if (taban) {
        fotoVar = true;
        secilenUrl = `ai:${aiSonuc.model}`;
        console.log(`   ✦ AI kapak (${aiSonuc.model}): ${a.title.slice(0, 62)}`);
      }
    }
  }

  if (!taban && !kartaZorla && !sadeceStokKaynak && !sadeceHavuz && FOTO_KATEGORI.has(String(a.category || ""))) {
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

  if (!taban && sadeceHavuz) {
    // Onarım turunda mevcut kapak korunur. Daha yakın bir havuz karesi
    // bulunamadıysa haberi tasarım kartına düşürmek geriye gidiş olur.
    return {
      url: `${URL_TABANI}/${a.id}.webp`,
      atif: null,
      foto: a.kapak?.foto !== false,
      kaynak: a.kapak?.kaynak || null,
      atlandi: true,
    };
  }

  if (!taban && sadeceKaynaktan) {
    // Kaynak fotoğrafı hattı: uygun kare yoksa mevcut tasarım kartı KORUNUR.
    return {
      url: `${URL_TABANI}/${a.id}.webp`,
      atif: null,
      foto: false,
      kaynak: null,
      atlandi: true,
      neden: "kaynak fotoğraf uygun değil",
    };
  }

  if (!taban) {
    // Fotoğraf yoksa/uygun değilse haberin konusuna göre seçilen illüstrasyonlu
    // ve kategori renginde tasarım kartı (`scripts/kapak-kart.mjs`).
    const { boyut, lh, satirlar } = kartBasligi(a.title);
    if (debug) console.log(`   · ${a.id} kart satırları: ${JSON.stringify(satirlar)}`);
    taban = await kartTaban({
      haber: a,
      satirlar,
      boyut,
      lh,
      W: GENISLIK,
      H: YUKSEKLIK,
    });
  }

  if (debug) console.log(`   · ${a.id} taban hazır: ${taban ? taban.length : 0} bayt`);
  let bilesik;
  if (fotoVar) {
    // Gerçek fotoğraf kapaklarda hiçbir filigran/damga/çerçeve basılmaz;
    // fotoğraf doğal ve tertemiz bırakılır.
    bilesik = await sharp(taban).webp({ quality: KALITE, effort: 4 }).toBuffer();
  } else {
    // Tasarım kartı KENDİ marka şeridini ve alt köşe rozetini taşır
    // (kapak-kart.mjs). Burada `kapakSvg` de basılsaydı aynı sayfada iki ayrı
    // "haberinai" işareti ve iki kat karartma üst üste biniyordu.
    bilesik = await sharp(taban).webp({ quality: KALITE, effort: 4 }).toBuffer();
  }

  if (!dry) {
    fs.mkdirSync(CIKTI_DIZIN, { recursive: true });
    yazDosya(dosya, bilesik);
    if (debug) console.log(`   · ${a.id} kapak yazıldı (${bilesik.length} bayt)`);
    // Varyantlar yalnızca taze haberlerde üretilir. Arşiv toplu yenilemesinde
    // (`--uzak`) atlanır: 3.000+ haber × 2 dosya, Cloudflare Pages'in 20.000
    // dosya sınırını aşar. Site varyant yoksa ana kapağı kullanır.
    if (!varyantsiz) {
      // Küçük varyant: liste/kart görünümü için (~20 KB).
      const kucukVeri = await sharp(bilesik)
        .resize(KUCUK_GENISLIK, Math.round((KUCUK_GENISLIK * YUKSEKLIK) / GENISLIK))
        .webp({ quality: 82, effort: 4 })
        .toBuffer();
      yazDosya(dosya.replace(/\.webp$/, "-480.webp"), kucukVeri);
      if (debug) console.log(`   · ${a.id} küçük varyant yazıldı`);
      // Sosyal kart / push görseli: aynı tabandan 1200×630 JPEG. Tasarım
      // kartları kendi marka şeridini taşıdığı için burada ayrıca `kapakSvg`
      // basılmaz (çift "haberinai" işareti oluyordu).
      const sosyalVeri = await sharp(taban)
        .resize(SOSYAL_GENISLIK, SOSYAL_YUKSEKLIK, { fit: "cover", position: "centre" })
        .jpeg({ quality: SOSYAL_KALITE, mozjpeg: true })
        .toBuffer();
      yazDosya(dosya.replace(/\.webp$/, SOSYAL_EK), sosyalVeri);
      if (debug) console.log(`   · ${a.id} sosyal varyant yazıldı (${sosyalVeri.length} bayt)`);
    }
  }
  return {
    url: `${URL_TABANI}/${a.id}.webp`,
    atif: yeniAtif,
    foto: fotoVar,
    // Fotoğrafın nereden geldiği: "kaynak" (yayıncının og:image'i) veya
    // "stok"/"havuz"/"ai". `--uygunsuz` denetimi ve gelecekteki toplu turlar
    // kaynak fotoğrafları yeniden karta çevirmemek için bu alanı okur.
    kaynakTur: fotoVar ? secilenTip || "stok" : null,
    // Kapakta gerçekten kullanılan fotoğraf (sonraki yeniden üretimlerde ve
    // kapak temizliğinde `image` alanına geri yazılır). Tasarım kartında
    // fotoğraf yoktur: eski fotoğrafın kaynağını "kullanılmış" gibi taşımak
    // hem havuz sayacını şişiriyor hem de kartın altında yanlış kaynak
    // bırakıyordu.
    kaynak: fotoVar ? secilenUrl || a.kapak?.kaynak || a.image : null,
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
  // Tasarım kartı olan haberler: kart kendi marka şeridini taşır, üstüne
  // `kapakSvg` basılırsa sayfada iki "haberinai" işareti görünür.
  const kartIdler = new Set(
    articles
      .filter((a) => a?.kapak && a.kapak.foto === false)
      .map((a) => String(a.id))
  );
  for (const id of hedefIdler) {
    const webp = path.join(CIKTI_DIZIN, `${id}.webp`);
    const jpg = path.join(CIKTI_DIZIN, `${id}${SOSYAL_EK}`);
    if (!fs.existsSync(webp) || fs.existsSync(jpg)) continue;
    isler.push({ id, webp, jpg, kart: kartIdler.has(id) });
    if (isler.length >= sosyalLimit) break;
  }
  let sayi = 0;
  let atlanan = 0;
  await havuz(isler, 4, async ({ webp, jpg, kart }) => {
    try {
      if (dry) {
        sayi++;
        return;
      }
      let boru = sharp(webp).resize(SOSYAL_GENISLIK, SOSYAL_YUKSEKLIK, {
        fit: "cover",
        position: "north",
      });
      if (!kart) {
        boru = boru.composite([
          { input: Buffer.from(kapakSvg(SOSYAL_GENISLIK, SOSYAL_YUKSEKLIK)) },
        ]);
      }
      await boru.jpeg({ quality: SOSYAL_KALITE, mozjpeg: true }).toFile(jpg);
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
        !a.kapak.ajan &&
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
      const oncekiAjan = a.kapak?.ajan;
      a.kapak = { v: 3, kaynak: sonuc.kaynak || guncel, foto: sonuc.foto };
      if (sonuc.kaynakTur) a.kapak.kaynakTur = sonuc.kaynakTur;
      if (oncekiAjan) a.kapak.ajan = oncekiAjan;
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
    if (sonuc.atlandi) {
      // Onarım turunda daha yakın kare bulunamadı: mevcut kapak ve JSON korunur.
      if (debug) console.log(`   · ${a.id} daha yakın havuz karesi yok, atlandı`);
      // Kaynak fotoğrafı turunda başarısız deneme 7 gün boyunca tekrar denenmez:
      // aksi hâlde aynı "görseli olmayan" 4.400 haber her turda yeniden taranır.
      if (sadeceKaynaktan && !dry) {
        a.kaynakKapakDeneme = new Date().toISOString();
        if (sonuc.neden) a.kaynakKapakNeden = sonuc.neden;
      }
      return;
    }
    console.log(`${dry ? "[dry] " : ""}${a.title.slice(0, 70)} → ${sonuc.url}`);
    if (!dry) {
      a.image = sonuc.url;
      const oncekiAjan = a.kapak?.ajan;
      // Tasarım kartında fotoğraf yok: `kaynak` alanına eski kapağın kendi
      // yolunu yazmak anlamsız (ve havuz sayacını yanıltıyor).
      a.kapak = {
        v: 3,
        kaynak: sonuc.kaynak || (sonuc.foto ? eski : null),
        foto: sonuc.foto,
      };
      if (sonuc.kaynakTur) a.kapak.kaynakTur = sonuc.kaynakTur;
      if (oncekiAjan) a.kapak.ajan = oncekiAjan;
      if (sonuc.atif) a.gorselKaynak = sonuc.atif;
      if (sadeceKaynaktan) delete a.kaynakKapakDeneme;
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
