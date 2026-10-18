// ==========================================================================
// İLGİ SKORU — Shorts akışında "merak uyandıran" haberler öne çıksın
// --------------------------------------------------------------------------
// Akış eskiden yalnızca "en yeni" sırasındaydı. Bu yüzden belediye, tören,
// sergi, kampanya gibi rutin yerel haberler teknoloji, oyun, yapay zekâ ve
// merak uyandıran konuları gölgeliyordu. Bu dosya her habere bir "ilgi puanı"
// verir:
//
//   kategori ağırlığı + merak/ölçü işaretleri + tazelik + son dakika
//   − rutin/kurumsal kalıp cezası
//
// Sıralama DETERMİNİSTİKTİR (rastgelelik yok). Hem /akis/ gövdesi hem de
// /akis/sayfa/<ofset>.json topları bu modülü kullandığı için sonsuz
// kaydırmada kart tekrarı ya da sıra kayması olmaz.
//
// Puan ölçeği 0-130 (kategori 34 + işaret 32 + son dakika 14 + tazelik 46).
// Kart rozeti (🔥) sabit bir eşik değil, arşivin en üst %8'i ile kategori
// ağırlığının birlikte değerlendirilmesiyle verilir (ilgiRozetEsik).
//
// Kalıplar kelime BAŞINDA aranır: "oyun" → "oyunları" ✓, "koyun" ✗.
// Kısa/karışabilen kalıplar (TAM_KELIME) tam kelime ister: "sel" → "selam" ✗.
// ==========================================================================
import { publishedTime, getArticles } from "./articles.js";
import { kapakKaynagi } from "./kapak.js";

/** Türkçe küçük harfe indirger ve aksanları sadeleştirir (eşleşme kolay olsun). */
function sade(metin) {
  return String(metin || "")
    .replace(/[İIı]/g, "i")
    .replace(/[Şş]/g, "s")
    .replace(/[Ğğ]/g, "g")
    .replace(/[Üü]/g, "u")
    .replace(/[Öö]/g, "o")
    .replace(/[Çç]/g, "c")
    .replace(/[Ââ]/g, "a")
    .toLowerCase();
}

/**
 * Kategori ağırlığı (slug). "Konu ilgi çekici mi?" sorusunun temel cevabı.
 * Gündem/spor/ekonomi sıfır değildir: son dakika ve tazelik puanı onları da
 * akışın üst kısmına taşıyabilir.
 */
const KATEGORI_AGIRLIK = {
  "yapay-zeka": 34,
  oyun: 32,
  teknoloji: 30,
  uzay: 30,
  bilim: 26,
  donanim: 26,
  yazilim: 24,
  mobil: 24,
  internet: 22,
  otomobil: 20,
  ekonomi: 16,
  dunya: 14,
  spor: 14,
  kultur: 12,
  saglik: 12,
  yasam: 8,
  gundem: 6,
};
const VARSAYILAN_AGIRLIK = 10;

/** Kategorinin temel ilgi ağırlığı (rozet kararında kullanılır). */
export function kategoriAgirlik(slug) {
  return KATEGORI_AGIRLIK[slug] ?? VARSAYILAN_AGIRLIK;
}

/** Merak uyandıran kalıplar: [aranan metin (sadeleşmiş), puan]. */
const ILGI_KALIPLARI = [
  // Teknoloji / oyun / yapay zekâ
  ["yapay zeka", 9],
  ["chatgpt", 8],
  ["openai", 8],
  ["robot", 7],
  ["algoritma", 6],
  ["yazilim", 5],
  ["guncelleme", 6],
  ["surum", 5],
  ["oyun", 8],
  ["espor", 8],
  ["gta", 8],
  ["playstation", 8],
  ["xbox", 7],
  ["nintendo", 7],
  ["steam", 6],
  ["konsol", 6],
  ["sizinti", 7],
  ["siber", 7],
  ["guvenlik acigi", 8],
  ["hack", 7],
  ["iphone", 7],
  ["samsung", 6],
  ["xiaomi", 6],
  ["android", 6],
  ["islemci", 6],
  ["ekran karti", 7],
  ["nvidia", 7],
  ["uzay", 8],
  ["nasa", 8],
  ["spacex", 8],
  ["teleskop", 7],
  ["elektrikli", 7],
  ["batarya", 6],
  ["yapay zekâ", 9],
  // Merak / ölçü / sonuç
  ["rekor", 10],
  ["ilk kez", 9],
  ["inceleme", 7],
  ["test ett", 7],
  ["karsilastir", 6],
  ["neden", 6],
  ["nasil", 5],
  ["ortaya cikti", 6],
  ["belli oldu", 5],
  ["itiraf", 7],
  ["iddia", 5],
  ["tartisma", 5],
  ["kriz", 7],
  ["darbe", 7],
  ["iflas", 7],
  ["yasak", 6],
  ["karar verdi", 5],
  ["geri dondu", 5],
  ["ucretsiz", 6],
  ["indirim", 5],
  // Ekonomi (Türkiye gündeminde yüksek ilgi)
  ["dolar", 6],
  ["euro", 5],
  ["borsa", 5],
  ["altin", 5],
  ["faiz", 6],
  ["asgari ucret", 8],
  ["enflasyon", 6],
  // Önemli / büyük olay (baskılanmasın: deprem, savaş vb. puanı yükseltir)
  ["deprem", 14],
  ["savas", 12],
  ["saldiri", 12],
  ["patlama", 12],
  ["yangin", 11],
  ["sel", 10],
  ["firtina", 8],
  ["can kaybi", 10],
  ["hayatini kaybetti", 9],
  ["yarali", 7],
  ["kurtarma", 7],
  ["vefat", 6],
  ["tahliye", 10],
  ["acil durum", 8],
  // Spor (gerçekten ilgi çeken başlıklar)
  ["transfer", 7],
  ["derbi", 8],
  ["sampiyon", 7],
  ["milli takim", 6],
  ["dunya kupasi", 7],
];

/** Rutin/kurumsal kalıplar: akışı dolduran ama merak uyandırmayan başlıklar. */
const RUTIN_KALIPLARI = [
  "belediye",
  "kaymakam",
  "valiligi",
  "valisi",
  "mudurlugu",
  "acilis",
  "toren",
  "ziyaret",
  "toplanti",
  "basin aciklamasi",
  "sergi",
  "etkinlik",
  "festival",
  "kutlama",
  "kampanya",
  "duyuru",
  "bilgilendir",
  "seminer",
  "pazaryeri",
  "muhtar",
  "protokol",
  "temizlik",
  "yol calismasi",
  "yesil alan",
  "kermes",
  "soylesi",
  "panel",
  "hizmete girdi",
  "hizmete acildi",
  "denetim",
  "kursu",
  "yardim",
];

/**
 * Kalıpları düzenli ifadeye çevirir.
 *
 * Neden `includes` değil: kısa kalıplar kelime ortasında eşleşip yanlış puan
 * veriyordu ("koyun" → "oyun", "nedeniyle" → "neden", "altıncı" → "altın").
 * Kurallar:
 *   - Kalıp kelime BAŞINDA aranır: "oyun" → "oyunları" ✓, "koyun" ✗.
 *   - `TAM_KELIME` içindekiler tam kelime ister: "sel" → "selam" ✗.
 */
function kalipRe(kalip, tamKelime) {
  const kacisli = kalip.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${kacisli}${tamKelime ? "(?![a-z0-9])" : ""}`);
}

/** Kısa/karışabilen kalıplar tam kelime olarak aranır. */
const TAM_KELIME = new Set(["sel", "altin", "neden", "zam", "test", "panel", "yardim"]);

const ILGI_RE = ILGI_KALIPLARI.map(([kalip, puan]) => [kalipRe(kalip, TAM_KELIME.has(kalip)), puan]);
const RUTIN_RE = RUTIN_KALIPLARI.map((kalip) => kalipRe(kalip, TAM_KELIME.has(kalip)));

/**
 * Tek bir haberin ilgi puanı (0-130).
 * @param {any} a haber kaydı
 * @param {number} simdi karşılaştırma zamanı (ms) — üretimde tek seferlik
 */
export function ilgiSkoru(a, simdi = Date.now()) {
  const metin = sade(`${a?.title || ""} ${a?.summary || ""}`);
  let puan = KATEGORI_AGIRLIK[a?.categorySlug] ?? VARSAYILAN_AGIRLIK;

  // Merak/ölçü işaretleri (üst sınır: tek başına kategori ağırlığını ezmesin)
  let ipucu = 0;
  for (const [re, p] of ILGI_RE) if (re.test(metin)) ipucu += p;
  if (metin.includes("%")) ipucu += 5;
  if (/\d/.test(metin)) ipucu += 3;
  puan += Math.min(ipucu, 32);

  if (a?.breaking === true) puan += 14;

  // Tazelik: yarı ömrü ~21 saat. Üstteki haberler taze kalır, eski teknoloji
  // haberi yeni bir yerel haberi geçemez. Tarihi okunamayan haber (t = 0)
  // tazelik puanı almaz.
  const t = publishedTime(a);
  const yasSaat = t ? Math.max(0, (simdi - t) / 3_600_000) : 200;
  puan += 46 * Math.exp(-yasSaat / 30);

  // Rutin kalıp cezası
  let ceza = 0;
  for (const re of RUTIN_RE) if (re.test(metin)) ceza += 9;
  puan -= Math.min(ceza, 27);

  return Math.max(0, Math.min(130, Math.round(puan)));
}

/**
 * Tüm akışı sıralar.
 *
 * BİRİNCİL ÖLÇÜT GERÇEK FOTOĞRAF: kapak güvenlik süzgecinden (lib/kapak.js)
 * geçen bir fotoğrafı olmayan haberlerin arkasına düşer. Aksi halde akışın
 * tepesine "H" harfli yer tutucu kart çıkıyordu (yanlış/genel fotoğrafı elenen
 * haberler ilgi puanı yüksek olduğu için ilk sıralara oturuyordu). Kullanıcı
 * kuralı: akışta her kart GERÇEK fotoğrafla görünür. Fotoğrafsız haberler
 * silinmez; arşivde, kategori sayfalarında ve haberin kendi sayfasında kalır.
 *
 * İkincil ölçüt ilgi puanı, eşitlikte daha yeni haber, sonra özgün sıra
 * (kararlı sıralama — rastgelelik yok, sayfa ile sonsuz kaydırma topları aynı).
 */
export function ilgiSirala(liste) {
  const simdi = Date.now();
  return liste
    .map((a, i) => ({ a, i, p: ilgiSkoru(a, simdi), k: kapakKaynagi(a) ? 1 : 0 }))
    .sort(
      (x, y) =>
        y.k - x.k || y.p - x.p || publishedTime(y.a) - publishedTime(x.a) || x.i - y.i
    )
    .map((x) => x.a);
}

/**
 * Kronolojik bir listeyi "önce gerçek fotoğraflı" olacak şekilde gruplar.
 * Grup içinde sıra KORUNUR (eskiden yeniye). Kategori akışları kronolojik
 * kalsın ama tepelerine fotoğrafsız kart çıkmasın diye kullanılır.
 */
export function kapakliOneSirala(liste) {
  const kapakli = [];
  const kapaksiz = [];
  for (const a of liste) (kapakKaynagi(a) ? kapakli : kapaksiz).push(a);
  return [...kapakli, ...kapaksiz];
}

/**
 * İlgi eşiği: listenin en ilgi çekici `oran` kadarının altındaki puan.
 * (Akıştaki sıralama için değil, rozet kararı için kullanılır.)
 */
export function ilgiEsik(liste, oran = 0.15) {
  if (!liste.length) return Infinity;
  const puanlar = liste.map((a) => ilgiSkoru(a)).sort((x, y) => y - x);
  const sira = Math.max(0, Math.ceil(puanlar.length * oran) - 1);
  return Math.max(puanlar[sira], 62);
}

/**
 * Kart rozeti ("🔥 ilgi çekici") eşiği: tüm arşivin en ilgi çekici %8'i.
 * Bir kez hesaplanır (sayfa başına yeniden hesaplamak gereksiz).
 *
 * Rozet neden yalnızca listelerde: /akis/ akışı ZATEN ilgi sırasında olduğu
 * için orada rozet her kartı işaretler ve anlamını yitirir. Kronolojik
 * listelerde (ana sayfa, kategori, tüm haberler) ise gerçek bir "bunu oku"
 * işaretidir.
 */
let rozetEsik = null;
export function ilgiRozetEsik() {
  if (rozetEsik === null) rozetEsik = ilgiEsik(getArticles(), 0.08);
  return rozetEsik;
}
