// ==========================================================================
// İLGİ SKORU — Shorts akışında "ShiftDelete tarzı" merak uyandıran, eğlenceli
// ve görsel olarak çarpıcı haberler öne çıksın
// --------------------------------------------------------------------------
// Sıralama DETERMİNİSTİKTİR (rastgelelik yok). Hem /akis/ gövdesi hem de
// /akis/sayfa/<ofset>.json topları bu modülü kullandığı için sonsuz
// kaydırmada kart tekrarı ya da sıra kayması olmaz.
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
 * Kategori ağırlığı (slug). Shorts akışında teknoloji, yapay zekâ, oyun, mobil,
 * donanım, bilim, uzay ve otomobil haberleri okuyucuyu eğlendiren ve merak
 * uyandıran ana vitrindir.
 */
const KATEGORI_AGIRLIK = {
  "yapay-zeka": 38,
  oyun: 36,
  teknoloji: 35,
  mobil: 32,
  donanim: 32,
  uzay: 32,
  bilim: 30,
  otomobil: 28,
  yazilim: 26,
  internet: 25,
  kultur: 16,
  ekonomi: 14,
  spor: 13,
  saglik: 12,
  yasam: 10,
  dunya: 8,
  gundem: 4,
};
const VARSAYILAN_AGIRLIK = 8;

/** Kategorinin temel ilgi ağırlığı (rozet kararında kullanılır). */
export function kategoriAgirlik(slug) {
  return KATEGORI_AGIRLIK[slug] ?? VARSAYILAN_AGIRLIK;
}

/** Görsel ve içerik kalitesiyle öne çıkan kaynaklar. */
const VITRIN_KAYNAKLAR =
  /\b(shiftdelete|webtekno|donanimhaber|technopat|donanim arsivi|chip|webrazzi|tamindir|merlin'in kazani|ign|oyun gunlugu|oyungezer|evrim agaci|pc hocasi)\b/i;

/** Merak uyandıran kalıplar: [aranan metin (sadeleşmiş), puan]. */
const ILGI_KALIPLARI = [
  // Teknoloji / oyun / yapay zekâ / popüler markalar
  ["yapay zeka", 10],
  ["chatgpt", 9],
  ["openai", 9],
  ["gemini", 9],
  ["claude", 8],
  ["deepseek", 9],
  ["grok", 8],
  ["robot", 9],
  ["insansi robot", 11],
  ["algoritma", 6],
  ["yazilim", 5],
  ["guncelleme", 6],
  ["surum", 5],
  ["oyun", 8],
  ["espor", 8],
  ["gta", 10],
  ["playstation", 9],
  ["ps5", 9],
  ["ps6", 10],
  ["xbox", 8],
  ["nintendo", 8],
  ["steam", 8],
  ["konsol", 7],
  ["sizinti", 8],
  ["sizdirildi", 9],
  ["siber", 7],
  ["guvenlik acigi", 8],
  ["hack", 7],
  ["iphone", 9],
  ["apple", 8],
  ["ipad", 7],
  ["macbook", 8],
  ["airpods", 7],
  ["samsung", 8],
  ["galaxy", 7],
  ["xiaomi", 8],
  ["redmi", 7],
  ["huawei", 7],
  ["honor", 7],
  ["oppo", 7],
  ["android", 7],
  ["ios", 7],
  ["islemci", 7],
  ["ekran karti", 8],
  ["nvidia", 9],
  ["rtx", 8],
  ["amd", 7],
  ["intel", 7],
  ["uzay", 9],
  ["nasa", 9],
  ["spacex", 9],
  ["starship", 9],
  ["mars", 8],
  ["kara delik", 9],
  ["kuantum", 8],
  ["teleskop", 7],
  ["elektrikli", 7],
  ["otonom", 8],
  ["tesla", 9],
  ["togg", 9],
  ["ferrari", 8],
  ["porsche", 8],
  ["batarya", 7],
  ["youtube", 8],
  ["whatsapp", 8],
  ["instagram", 8],
  ["tiktok", 7],
  ["netflix", 8],
  ["spotify", 7],
  ["google", 7],
  ["microsoft", 7],
  ["meta", 7],
  ["akilli gozluk", 9],
  ["katlanabilir", 8],
  // Merak / ölçü / sonuç
  ["rekor", 10],
  ["ilk kez", 9],
  ["tanitildi", 8],
  ["duyuruldu", 7],
  ["fiyati", 7],
  ["ozellikleri", 7],
  ["inceleme", 7],
  ["test ett", 7],
  ["karsilastir", 6],
  ["neden", 6],
  ["nasil", 5],
  ["ortaya cikti", 7],
  ["belli oldu", 6],
  ["gizem", 8],
  ["kesfedildi", 8],
  ["itiraf", 7],
  ["iddia", 5],
  ["tartisma", 5],
  ["kriz", 6],
  ["iflas", 7],
  ["yasak", 6],
  ["geri dondu", 6],
  ["ucretsiz", 8],
  ["indirim", 6],
  // Ekonomi / Kripto
  ["bitcoin", 7],
  ["kripto", 6],
  ["dolar", 5],
  ["altin", 5],
  ["faiz", 5],
  ["asgari ucret", 8],
  ["enflasyon", 5],
  // Önemli afet (deprem vb. baskılanmasın)
  ["deprem", 14],
  ["patlama", 10],
  ["yangin", 9],
  ["sel", 8],
  ["firtina", 7],
  // Spor (gerçekten ilgi çeken başlıklar)
  ["transfer", 6],
  ["derbi", 8],
  ["sampiyonlar ligi", 8],
];

/** Rutin/kurumsal/bürokratik kalıplar: Shorts akışında eğlenceyi bozan başlıklar. */
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
  "barosu",
  "sendika",
  "eylem",
  "meclis",
  "komisyon",
  "mutabakat",
  "buyukelci",
  "diplomat",
  "ihale",
  "taramasi",
  "personel",
  "hapis cezasi",
  "tutuklan",
  "gozalti",
  "iddianame",
];

function kalipRe(kalip, tamKelime) {
  const kacisli = kalip.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${kacisli}${tamKelime ? "(?![a-z0-9])" : ""}`);
}

const TAM_KELIME = new Set(["sel", "altin", "neden", "zam", "test", "panel", "yardim", "ios", "amd", "ps5", "ps6", "gta", "rtx"]);

const ILGI_RE = ILGI_KALIPLARI.map(([kalip, puan]) => [kalipRe(kalip, TAM_KELIME.has(kalip)), puan]);
const RUTIN_RE = RUTIN_KALIPLARI.map((kalip) => kalipRe(kalip, TAM_KELIME.has(kalip)));

/** Haberin görseli kaynağın kendi gerçek fotoğrafı mı (stok değil)? */
export function gercekKaynaktanGorselMi(a) {
  const img = String(a?.image || "");
  if (!img || !/^https?:\/\//i.test(img)) return false;
  if (/wikimedia\.org|wikipedia\.org/i.test(img)) return false;
  return Boolean(a?.gorselKaynakSite || !a?.gorselKaynak);
}

/**
 * Tek bir haberin ilgi puanı (0-150).
 * @param {any} a haber kaydı
 * @param {number} simdi karşılaştırma zamanı (ms)
 */
export function ilgiSkoru(a, simdi = Date.now()) {
  const metin = sade(`${a?.title || ""} ${a?.summary || ""}`);
  const katAgirlik = KATEGORI_AGIRLIK[a?.categorySlug] ?? VARSAYILAN_AGIRLIK;
  let puan = katAgirlik;

  // Merak/ölçü işaretleri
  let ipucu = 0;
  for (const [re, p] of ILGI_RE) if (re.test(metin)) ipucu += p;
  if (metin.includes("%")) ipucu += 4;
  if (/\d/.test(metin)) ipucu += 2;
  puan += Math.min(ipucu, 34);

  // Gerçek kaynak görseli (ShiftDelete kalitesinde ürün/haber kapağı) büyük avantaj alır;
  // stok görselli haberler geriye düşer.
  if (gercekKaynaktanGorselMi(a)) {
    puan += 18;
  } else {
    puan -= 10;
  }

  // Teknoloji/oyun/bilim odaklı vitrin yayıncılarına ek bonus
  if (VITRIN_KAYNAKLAR.test(sade(a?.source || ""))) {
    puan += 10;
  }

  // Son dakika bonusu: yalnızca ilgi çekici kategorilerde tam puan alır,
  // rutin diplomasi/gündem haberlerinin teknoloji/oyun vitrinini ezmesini önler.
  if (a?.breaking === true) {
    puan += katAgirlik >= 20 ? 12 : 4;
  }

  // Tazelik: yarı ömrü ~24 saat.
  const t = publishedTime(a);
  const yasSaat = t ? Math.max(0, (simdi - t) / 3_600_000) : 200;
  puan += 44 * Math.exp(-yasSaat / 32);

  // Rutin/bürokratik kalıp cezası
  let ceza = 0;
  for (const re of RUTIN_RE) if (re.test(metin)) ceza += 11;
  puan -= Math.min(ceza, 36);

  return Math.max(0, Math.min(150, Math.round(puan)));
}

/**
 * Tüm akışı sıralar.
 *
 * BİRİNCİL ÖLÇÜT GERÇEK FOTOĞRAF: kapak güvenlik süzgecinden (lib/kapak.js)
 * geçen bir fotoğrafı olmayan haberler en arkaya düşer.
 * İkincil ölçüt ilgi puanı, eşitlikte daha yeni haber, sonra özgün sıra.
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
 */
export function kapakliOneSirala(liste) {
  const kapakli = [];
  const kapaksiz = [];
  for (const a of liste) (kapakKaynagi(a) ? kapakli : kapaksiz).push(a);
  return [...kapakli, ...kapaksiz];
}

/**
 * İlgi eşiği: listenin en ilgi çekici `oran` kadarının altındaki puan.
 */
export function ilgiEsik(liste, oran = 0.15) {
  if (!liste.length) return Infinity;
  const puanlar = liste.map((a) => ilgiSkoru(a)).sort((x, y) => y - x);
  const sira = Math.max(0, Math.ceil(puanlar.length * oran) - 1);
  return Math.max(puanlar[sira], 62);
}

let rozetEsik = null;
export function ilgiRozetEsik() {
  if (rozetEsik === null) rozetEsik = ilgiEsik(getArticles(), 0.08);
  return rozetEsik;
}
