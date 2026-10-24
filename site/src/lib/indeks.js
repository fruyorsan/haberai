import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Astro, build sırasında bu modülü site/dist/.prerender/chunks altına
// paketlediği için import.meta.url kaynak dosyayı göstermiyor. Veri klasörü
// articles.js / market.js ile aynı şekilde aranır.
const ROOT_CANDIDATES = [
  join(process.cwd(), ".."), // site/ -> depo kökü
  process.cwd(), // depo kökü
  join(__dirname, "..", "..", ".."), // kaynak dosya (doğrudan çalıştırma)
];
const ROOT =
  ROOT_CANDIDATES.find((root) => existsSync(join(root, "data", "indeks.json"))) ??
  join(process.cwd(), "..");
const FILE = join(ROOT, "data", "indeks.json");

let cache;

/**
 * İndeks çekirdeği: Google'a açık haberlerin id kümesi.
 *
 * `null` dönerse "kısıtlama yok" demektir (dosya yok/bozuk). Bu bilinçli bir
 * güvenlik davranışıdır: ilk kurulumda ya da bir aksilikte siteyi toptan
 * noindex'e düşürmek yerine her şeyi açık bırakır. src/indeks.js her turda
 * dosyayı ürettiği için bu durum kalıcı olmaz.
 *
 * @returns {Set<string>|null}
 */
export function indeksSeti() {
  if (cache !== undefined) return cache;
  if (!existsSync(FILE)) {
    console.warn(`[indeks] indeks.json yok, kısıtlama uygulanmıyor: ${FILE}`);
    cache = null;
    return cache;
  }
  try {
    const d = JSON.parse(readFileSync(FILE, "utf8"));
    const days = d && typeof d.days === "object" && d.days ? d.days : null;
    if (!days) {
      cache = null;
      return cache;
    }
    const set = new Set();
    for (const liste of Object.values(days)) {
      if (Array.isArray(liste)) for (const id of liste) set.add(String(id));
    }
    if (set.size === 0) {
      console.warn(`[indeks] indeks.json boş, kısıtlama uygulanmıyor: ${FILE}`);
      cache = null;
      return cache;
    }
    cache = set;
    return cache;
  } catch (err) {
    console.warn(`[indeks] indeks.json okunamadı (${FILE}): ${err.message}`);
    cache = null;
    return cache;
  }
}

/** Bu haber site haritasına/indexe açık mı? */
export function indeksliMi(a) {
  const set = indeksSeti();
  if (!set) return true;
  return set.has(String(a?.id ?? ""));
}

// ==========================================================================
// LİSTE SAYFALARI — hangi gezinme sayfaları dizine girecek?
// --------------------------------------------------------------------------
// SORUN: site haritasındaki 5.487 URL'in yalnızca 4.485'i haberdi; geri kalanı
// otomatik üretilmiş sayfalama ve etiket sayfalarıydı (601 etiket URL'i,
// 187 /haberler/ sayfası, 197 kategori sayfası). Bunlar aynı haberleri tekrar
// tekrar listeleyen "ince" sayfalardır; Google'ın ölçekli içerik sinyalini
// besler. Her biri kendi başına sıralama kazanmaz, ama tarama bütçesini
// tüketir.
//
// KURAL:
//   - Sayfalama (2. sayfa ve sonrası) → noindex, follow. İçindeki linkler
//     izlenir, okuyucu gezinmeye devam eder.
//   - Etiket sayfası yalnızca yeterince haberi varsa indekslenir (hub değeri).
//   - Kategori ilk sayfası ve /haberler/ ilk sayfası indekslenir.
// ==========================================================================
export const ETIKET_MIN_HABER = Number(process.env.INDEKS_ETIKET_MIN ?? 50);

/** Etiket sayfası (ilk sayfa) indekslenmeli mi? */
export function etiketIndeksliMi(haberSayisi) {
  return Number(haberSayisi) >= ETIKET_MIN_HABER;
}
