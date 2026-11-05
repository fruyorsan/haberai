// YEREL KAPAK SAHNE HAVUZU
//
// `data/kapak-havuz.json` içinde, gözle onaylanmış CC0 / kamu malı sahne
// fotoğrafları durur. Kapak üretimi bu havuzdan seçer: çalışma anında Commons'a
// gitmek yok, dolayısıyla hız sınırı, ağ hatası ve "alakasız fotoğraf" riski de
// yok. Her kare kendi kategorisinin gerçek bir sahnesini gösterir.
//
// Kapak kimliği olarak dosya adı (`ad`) kullanılır; `kullanilan` kümesi aynı
// karenin bir turda iki habere verilmesini engeller.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { konuUyumPuani } from "../site/src/lib/gorsel-uygun.js";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HAVUZ_JSON = path.join(KOK, "data", "kapak-havuz.json");

let onbellek = null;
function havuzOku() {
  if (onbellek) return onbellek;
  try {
    onbellek = JSON.parse(fs.readFileSync(HAVUZ_JSON, "utf8"));
  } catch {
    // Havuz yoksa kapak üretimi tasarım kartına düşer; bu bir hata değil.
    onbellek = {};
  }
  return onbellek;
}

// Bir karenin sitede kaç haberde kullanıldığı. Havuz küçük (kategori başına
// 3-13 kare), arşiv ise binlerce haber: sayaç olmadan aynı İstanbul panoraması
// yüzlerce sayfada görünür ve site "tek fotoğraflı" görünür.
let kullanimOnbellek = null;
function kullanimOku() {
  if (kullanimOnbellek) return kullanimOnbellek;
  const sayac = new Map();
  try {
    const articles = JSON.parse(fs.readFileSync(path.join(KOK, "data", "articles.json"), "utf8"));
    for (const a of articles) {
      const k = a?.kapak?.kaynak;
      if (typeof k === "string" && k && !/^https?:/i.test(k) && !/^ai:/i.test(k)) {
        sayac.set(k, (sayac.get(k) || 0) + 1);
      }
    }
  } catch {
    // Sayaç okunamazsa her kare kullanılmamış sayılır (havuz yine çalışır).
  }
  kullanimOnbellek = sayac;
  return sayac;
}

/** Bu kare en fazla kaç haberde kullanılabilir? */
export const HAVUZ_KULLANIM_SINIRI = 18;

/**
 * Havuz karesinin kapak olabilmesi için gereken en düşük konu puanı.
 *
 * 1 = dosya adı/açıklamasındaki en az bir anlamlı sözcük haberin başlığı,
 * etiketleri, görsel sorgusu veya özetiyle örtüşmeli. Kategori doğruluğu
 * (ör. "Teknoloji") tek başına yetmez: Apple/Mac yazılım haberine devre kartı
 * verilmesinin nedeni tam olarak buydu.
 */
export const HAVUZ_UYUM_ESIGI = 1;

/** Havuzda bu kategori için en az bir kare var mı? */
export function havuzVarMi(kategori) {
  const h = havuzOku();
  const liste = h[String(kategori || "")];
  return Array.isArray(liste) && liste.length > 0;
}

/** Havuz kaydını dosya adıyla bulur. */
function havuzKaydi(ad) {
  const h = havuzOku();
  for (const liste of Object.values(h)) {
    if (!Array.isArray(liste)) continue;
    const g = liste.find((x) => x.ad === ad);
    if (g) return g;
  }
  return null;
}

/** Elde duran bir havuz karesinin habere konu yakınlığı (0 = eşleşme yok). */
export function kareUyumPuani(article, ad) {
  const g = havuzKaydi(String(ad || ""));
  if (!g) return 0;
  // `ad` yerel dosya adıdır ("teknoloji-circuit-board-2-1319.jpg"); kategori
  // öneki ve sayısal son ek puanı şişirmesin diye özgün Commons adı kullanılır.
  return konuUyumPuani(article, g.dosya || g.ad, g.aciklama || "");
}

/** Haberin kategorisindeki EN YAKIN havuz karesinin konu puanı. */
export function havuzEnIyiUyum(article, kategori) {
  const h = havuzOku();
  const liste = h[String(kategori || "")] || h["Diğer"] || [];
  let en = 0;
  for (const g of liste) {
    const p = konuUyumPuani(article, g.dosya || g.ad, g.aciklama || "");
    if (p > en) en = p;
  }
  return en;
}

/**
 * Kategoriye göre havuz adayları.
 *
 * - `adet`   : en fazla kaç aday dönsün
 * - `kullanilan`: bu turda kullanılmış kapak kimlikleri (dosya adları)
 * - `offset` : haber kimliğinden türetilen başlangıç; aynı kategorideki
 *              haberlerin hep aynı kareyi almamasını sağlar
 * - `article`: haber kaydı. Verilirse kareler önce habere KONU yakınlığına
 *              göre sıralanır (başlık/etiket/özet/görsel sorgusu ↔ dosya adı +
 *              açıklama) ve puanı `HAVUZ_UYUM_ESIGI`nin altında kalanlar
 *              elenir. Kategori doğru olsa bile haberle tek sözcük örtüşmeyen
 *              kare kapak olmaz; o haber tasarım kartına (veya AI görseline)
 *              düşer.
 *
 * Sınırı aşmış kareler hiç dönmez: o haber tasarım kartına düşer. Tek bir
 * fotoğrafın onlarca sayfada tekrar etmesi, markalı karttan daha kötü.
 */
export function havuzAdaylari(
  kategori,
  { adet = 6, kullanilan = new Set(), offset = 0, article = null } = {}
) {
  const h = havuzOku();
  // Kategori bulunamazsa "Diğer" (gazete/kitap sahneleri) güvenli yedektir.
  const liste = h[String(kategori || "")] || h["Diğer"] || [];
  if (!liste.length) return [];

  const sayac = kullanimOku();
  // Tur içinde her kare BİR kez: 6 Gündem karesi aynı yayın turunda 6 haberden
  // fazlasında görünmesin. Toplam kullanım da sınırlı: bir kare en fazla
  // HAVUZ_KULLANIM_SINIRI haberde yer alır, sonrası tasarım kartına düşer.
  const uygun = liste
    .filter((g) => !kullanilan.has(g.ad))
    .filter((g) => (sayac.get(g.ad) || 0) < HAVUZ_KULLANIM_SINIRI);
  if (!uygun.length) return [];

  const kullanim = (g) => sayac.get(g.ad) || 0;
  // Konu yakınlığı: "bluetooth aktarım" haberine devre kartı değil, kablosuz
  // ses/veri karesi denk gelsin. `g.dosya` Commons'taki özgün addır; yerel
  // `ad` içindeki kategori öneki ("teknoloji-", "donanim-") eşleşme sayılmaz.
  const uyum = (g) =>
    article ? konuUyumPuani(article, g.dosya || g.ad, g.aciklama || "") : 0;

  // KONU KAPISI: en az bir anlamlı sözcük örtüşmüyorsa kare aday bile değil.
  const konulu = article ? uygun.filter((g) => uyum(g) >= HAVUZ_UYUM_ESIGI) : uygun;
  if (!konulu.length) return [];

  const sirali = [...konulu].sort(
    (x, y) => uyum(y) - uyum(x) || kullanim(x) - kullanim(y)
  );

  // En alakalı + en az kullanılan grup içinde haber kimliğine göre dön.
  const basX = uyum(sirali[0]);
  const basK = kullanim(sirali[0]);
  const esitler = sirali.filter((g) => uyum(g) === basX && kullanim(g) === basK);
  if (esitler.length > 1) {
    const bas = Math.max(0, offset) % esitler.length;
    const donmus = [...esitler.slice(bas), ...esitler.slice(0, bas)];
    return donmus.concat(sirali.slice(esitler.length)).slice(0, adet).map(sarmal);
  }
  return sirali.slice(0, adet).map(sarmal);
}

function sarmal(g) {
  return {
    ...g,
    // Kapak kimliği: uzak URL yerine havuz dosyası.
    url: g.ad,
    dosyaYolu: path.join(KOK, g.yerel),
  };
}
