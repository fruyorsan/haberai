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

/** Havuzda bu kategori için en az bir kare var mı? */
export function havuzVarMi(kategori) {
  const h = havuzOku();
  const liste = h[String(kategori || "")];
  return Array.isArray(liste) && liste.length > 0;
}

/**
 * Kategoriye göre havuz adayları.
 *
 * - `adet`   : en fazla kaç aday dönsün
 * - `kullanilan`: bu turda kullanılmış kapak kimlikleri (dosya adları)
 * - `offset` : haber kimliğinden türetilen başlangıç; aynı kategorideki
 *              haberlerin hep aynı kareyi almamasını sağlar
 *
 * Sınırı aşmış kareler hiç dönmez: o haber tasarım kartına düşer. Tek bir
 * fotoğrafın onlarca sayfada tekrar etmesi, markalı karttan daha kötü.
 */
export function havuzAdaylari(kategori, { adet = 6, kullanilan = new Set(), offset = 0 } = {}) {
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

  // En az kullanılan öne: dağıtım eşit olsun.
  const puan = (g) => sayac.get(g.ad) || 0;
  const sirali = [...uygun].sort((x, y) => puan(x) - puan(y));
  const esitler = sirali.filter((g) => puan(g) === puan(sirali[0]));
  // Aynı kullanım düzeyindekiler arasında haber kimliğine göre dön.
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
