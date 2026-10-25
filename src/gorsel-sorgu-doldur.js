// ==========================================================================
// EKSİK GÖRSEL SORGULARINI DOLDUR — indeks çekirdeğindeki eski haberler
// --------------------------------------------------------------------------
// SORUN: Gövde içi fotoğraf doldurma (`ek-gorsel-doldur.js`) yalnızca
// `gorselSorgu` alanı dolu haberleri işler. İndeks çekirdeğine giren eski
// haberlerin bir kısmında bu alan hiç yok; bu yüzden Google'a açık sayfalar
// fotoğrafsız kalıyor.
//
// ÇÖZÜM: Yalnızca EKSİK sorgular için AI'dan kısa bir İngilizce arama sorgusu
// istenir (tam makale üretilmez; kotayı az harcar). Sonuç `gorselSorgu` alanına
// yazılır; fotoğrafı bir sonraki turda `ek-gorsel` adımı Commons'tan bulur.
//
// Kapsam: `data/indeks.json` varsa yalnızca indeks çekirdeğindeki haberler;
// yoksa son SORGU_GUN günün haberleri. Gövde içi fotoğrafı zaten olanlar
// atlanır (sorguya gerek yok).
//
// Kullanım:
//   npm run gorsel-sorgu:dry     → AI çağırmadan hedefleri listeler
//   npm run gorsel-sorgu         → tur başına SORGU_LIMIT haber (varsayılan 12)
//   SORGU_LIMIT=48 npm run gorsel-sorgu
//
// Ortam değişkenleri:
//   SORGU_LIMIT       tur başına en fazla haber (varsayılan 12)
//   SORGU_GUN         indeks yoksa geriye dönük pencere (varsayılan 45)
//   SORGU_TEKRAR_GUN  başarısız sorguyu yeniden denemeden önce beklenen gün (7)
// ==========================================================================
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadArticles, saveArticles } from "./store.js";
import { gorselSorgusu } from "./ai.js";
import { config } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEKS = join(__dirname, "..", "data", "indeks.json");

const DRY = process.argv.includes("--dry");
const LIMIT = sayi(process.env.SORGU_LIMIT, 12);
const GUN = sayi(process.env.SORGU_GUN, 45);
const TEKRAR_GUN = sayi(process.env.SORGU_TEKRAR_GUN, 7);
const KAYDET_ARALIGI = 5;

function sayi(deger, varsayilan) {
  const n = Number(deger);
  return Number.isFinite(n) && n >= 0 ? n : varsayilan;
}

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

/** İndeks çekirdeğindeki haber kimlikleri; dosya yoksa null. */
async function cekirdekIdleri() {
  if (!existsSync(INDEKS)) return null;
  try {
    const j = JSON.parse(await readFile(INDEKS, "utf8"));
    const ids = new Set();
    for (const liste of Object.values(j?.days || {})) {
      for (const id of Array.isArray(liste) ? liste : []) ids.add(String(id));
    }
    return ids.size ? ids : null;
  } catch {
    return null;
  }
}

const articles = await loadArticles();
const cekirdek = await cekirdekIdleri();
const simdi = Date.now();
const esik = simdi - GUN * 86400000;
const tekrarEsigi = TEKRAR_GUN * 86400000;

const govdeParagraf = (a) => (Array.isArray(a.body) ? a.body.filter(Boolean).length : 0);
const govdeGorseliVar = (a) =>
  (Array.isArray(a.gorselEk) && a.gorselEk.length > 0) ||
  (Array.isArray(a.images) && a.images.length > 0);

const uygunlar = articles.filter((a) => {
  if (!a?.id) return false;
  if (String(a.gorselSorgu || "").trim().length >= 2) return false;
  if (govdeGorseliVar(a)) return false; // sorguya gerek yok
  if (govdeParagraf(a) < 3) return false; // fotoğraf metni bölmeli
  if (cekirdek && !cekirdek.has(String(a.id))) return false;

  const tarih = Date.parse(a.publishedAt || a.generatedAt || "");
  if (!cekirdek && (!Number.isFinite(tarih) || tarih < esik)) return false;

  // Başarısız denemeyi her turda yinelememek için bekleme penceresi.
  const deneme = Date.parse(a.gorselSorguDeneme || "");
  if (Number.isFinite(deneme) && simdi - deneme < tekrarEsigi) return false;
  return true;
});

// En yeni ve gövdesi daha dolu haberler önce: çekirdekteki taze sayfalar
// fotoğrafı daha erken alır.
const hedefler = uygunlar
  .sort(
    (x, y) =>
      Date.parse(y.publishedAt || y.generatedAt || 0) -
        Date.parse(x.publishedAt || x.generatedAt || 0) ||
      govdeParagraf(y) - govdeParagraf(x)
  )
  .slice(0, LIMIT);

console.log(
  `Görsel sorgusu doldurma: ${hedefler.length} hedef / ${uygunlar.length} eksik` +
    ` (${cekirdek ? "indeks çekirdeği" : `son ${GUN} gün`}, tur sınırı ${LIMIT})` +
    (DRY ? " — DENEME, yazılmayacak" : "")
);

if (DRY) {
  for (const [i, a] of hedefler.entries()) {
    console.log(`  · [${i + 1}/${hedefler.length}] ${a.title}`);
  }
} else {
  let eklenen = 0;
  let bulunamayan = 0;
  let denenen = 0;

  for (const [i, a] of hedefler.entries()) {
    denenen++;
    try {
      const sorgu = await gorselSorgusu(a);
      a.gorselSorguDeneme = new Date().toISOString();
      if (sorgu) {
        a.gorselSorgu = sorgu;
        eklenen++;
        console.log(`  + [${i + 1}/${hedefler.length}] ${a.title.slice(0, 52)} — "${sorgu}"`);
      } else {
        bulunamayan++;
        console.log(`  · [${i + 1}/${hedefler.length}] ${a.title.slice(0, 52)} — sorgu üretilemedi`);
      }
    } catch (err) {
      if (err?.allExhausted) {
        console.log("AI kotası/durumu: görsel sorgusu doldurma bu turda durduruldu.");
        break;
      }
      bulunamayan++;
      console.warn(`  ! ${a.slug || a.id}: ${String(err?.message || err).slice(0, 120)}`);
    }

    if ((i + 1) % KAYDET_ARALIGI === 0) await saveArticles(articles);
    if (i + 1 < hedefler.length) await bekle(config.aiDelayMs);
  }

  await saveArticles(articles);
  console.log(
    `\nBitti. Denenen: ${denenen}, sorgu eklenen: ${eklenen}, üretilemeyen: ${bulunamayan}` +
      `\nBu turda denenmeyen eksik: ${Math.max(0, uygunlar.length - denenen)}`
  );
}
