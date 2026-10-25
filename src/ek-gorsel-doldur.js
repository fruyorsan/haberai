// Arşivdeki fotoğrafsız haberlere gövde içi (satır arası) fotoğraf ekler.
//
// Kaynak: yalnızca Wikimedia Commons (ücretsiz, serbest lisans, API anahtarı
// gerekmez). Haberin kendi `gorselSorgu` alanı, kısaltılmış sorgu, konu sorgusu
// ve etiketleriyle arama yapılır; bulunan dosyanın adı haberin başlığı/etiketleri
// ve görsel sorgusuyla eşleşmiyorsa (bkz. site/src/lib/gorsel-uygun.js) elenir.
//
// Arşivde bir kez kullanılan fotoğraf başka habere eklenmez: aynı kare onlarca
// sayfada görünürse hem tekrar eden içerik olur hem de haberin değeri düşer.
//
// Kullanım:
//   node src/ek-gorsel-doldur.js            → 40 habere kadar ekle
//   EK_GORSEL_LIMIT=200 npm run ek-gorsel   → tur başına hedef sayı
//   npm run ek-gorsel -- --dry              → hiçbir şey yazma, yalnızca rapor
//
// Ortam değişkenleri:
//   EK_GORSEL_LIMIT       tur başına en fazla haber (varsayılan 40)
//   EK_GORSEL_GUN         yalnızca son N günün haberleri (varsayılan 90)
//   EK_GORSEL_TEKRAR_GUN  aynı haberi yeniden denemeden önce beklenen gün (30)
//
// Tekrar deneme durumu `ekGorselDeneme` alanında tutulur; `backfill.js`in kapak
// fotoğrafı için kullandığı `gorselDeneme` alanına dokunulmaz.
import { readFile } from "node:fs/promises";
import { loadArticles, saveArticles } from "./store.js";
import {
  stokGorseller,
  kisaSorgu,
  konuSorgu,
  afetMi,
  markaAdi,
  atif,
} from "./stok-gorsel.js";
import { stokEkUygunMu } from "../site/src/lib/gorsel-uygun.js";

const DRY = process.argv.includes("--dry");
const LIMIT = sayi(process.env.EK_GORSEL_LIMIT, 40);
const GUN = sayi(process.env.EK_GORSEL_GUN, 90);
const TEKRAR_GUN = sayi(process.env.EK_GORSEL_TEKRAR_GUN, 30);
const AZAMI_FOTOGRAF = 2; // site de gövdeye en fazla 2 ek fotoğraf koyuyor
const KAYDET_ARALIGI = 5; // kaç haberde bir diske yazılsın (kesinti güvenliği)

function sayi(deger, varsayilan) {
  const n = Number(deger);
  return Number.isFinite(n) && n >= 0 ? n : varsayilan;
}

/** Aynı fotoğrafın farklı boyut/kırpma sürümlerini eşleştirmek için kimlik. */
const kimlik = (url) =>
  decodeURIComponent(String(url || ""))
    .toLowerCase()
    .split("?")[0]
    .split("#")[0]
    .replace(/\/thumb\/([0-9a-f]\/[0-9a-f]{2}\/[^/]+)\/\d+px-[^/]+$/, "/$1")
    .replace(/-\d{2,4}x\d{2,4}(?=\.\w+$)/, "")
    .replace(/\.(jpe?g|png|webp|avif|gif)$/, "");

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Google'a açık "indeks çekirdeği" haberlerinin kimlikleri (data/indeks.json).
 * Dosya yoksa boş küme döner; doldurma yine çalışır.
 */
async function cekirdekIdleri() {
  try {
    const ham = await readFile(new URL("../data/indeks.json", import.meta.url), "utf8");
    const j = JSON.parse(ham);
    const ids = new Set();
    for (const liste of Object.values(j?.days || {})) {
      for (const id of Array.isArray(liste) ? liste : []) ids.add(String(id));
    }
    return ids;
  } catch {
    return new Set();
  }
}

/** Commons dosya adı (log için kısa). */
const dosyaAdi = (url) => {
  const ham = decodeURIComponent(String(url || "").split("?")[0]);
  const parca = ham.split("/").pop() || "";
  return parca.replace(/^\d+px-/, "").slice(0, 60);
};

const articles = await loadArticles();

// Arşivde kullanılmış tüm fotoğraflar (kapak + kaynak içi + ek fotoğraflar).
const kullanilanUrller = new Set();
const kullanilanKimlikler = new Set();
for (const a of articles) {
  const adaylar = [
    a.image,
    ...(Array.isArray(a.images) ? a.images : []),
    ...(Array.isArray(a.gorselEk) ? a.gorselEk.map((g) => g?.url) : []),
  ];
  for (const u of adaylar) {
    if (!u) continue;
    kullanilanUrller.add(String(u));
    const k = kimlik(u);
    if (k) kullanilanKimlikler.add(k);
  }
}

const simdi = Date.now();
const esik = simdi - GUN * 86400000;
const tekrarEsigi = TEKRAR_GUN * 86400000;

/** Gövde içi fotoğrafı olmayan, sorgusu hazır ve yerleştirmeye uygun haberler. */
const uygunlar = articles.filter((a) => {
  const sorgu = String(a.gorselSorgu || "").trim();
  if (sorgu.length < 2) return false;
  if (Array.isArray(a.gorselEk) && a.gorselEk.length) return false;
  if (Array.isArray(a.images) && a.images.length) return false;
  const paragraf = Array.isArray(a.body) ? a.body.filter(Boolean).length : 0;
  if (paragraf < 3) return false; // fotoğraf metni bölmeli, metni tek başına bırakmamalı
  const tarih = Date.parse(a.publishedAt || a.generatedAt || "");
  if (!Number.isFinite(tarih) || tarih < esik) return false;
  const deneme = Date.parse(a.ekGorselDeneme || "");
  if (Number.isFinite(deneme) && simdi - deneme < tekrarEsigi) return false;
  return true;
});

// Öncelik: Google'a açık indeks çekirdeği, sonra son dakika haberleri, sonra
// en yeni, sonra daha uzun gövde. (Gerçek tıklanma verisi Search Console
// erişimi olmadan yok; dizine giren sayfa + tazelik + gövde uzunluğu ücretsiz
// ve savunulabilir bir vekil.)
const cekirdek = await cekirdekIdleri();
const cekirdekMi = (a) => (cekirdek.has(String(a.id)) ? 1 : 0);

const sirala = (x, y) =>
  cekirdekMi(y) - cekirdekMi(x) ||
  (y.breaking ? 1 : 0) - (x.breaking ? 1 : 0) ||
  Date.parse(y.publishedAt || y.generatedAt || 0) -
    Date.parse(x.publishedAt || x.generatedAt || 0) ||
  (Array.isArray(y.body) ? y.body.length : 0) - (Array.isArray(x.body) ? x.body.length : 0);

const hedefler = uygunlar.sort(sirala).slice(0, LIMIT);

console.log(
  `Gövde içi fotoğraf doldurma: ${hedefler.length} hedef / ${uygunlar.length} uygun haber` +
    ` (indeks çekirdeğinde ${uygunlar.filter(cekirdekMi).length}, son ${GUN} gün,` +
    ` tur sınırı ${LIMIT})${DRY ? " — DENEME, yazılmayacak" : ""}`
);

let eklenenHaber = 0;
let eklenenFotograf = 0;
let bulunamayan = 0;
let denenen = 0;

for (const [i, a] of hedefler.entries()) {
  denenen++;
  const sorgu = String(a.gorselSorgu || "").trim();
  const paragraf = Array.isArray(a.body) ? a.body.filter(Boolean).length : 0;
  const istenen = paragraf >= 5 ? AZAMI_FOTOGRAF : 1;

  let bulunan = [];
  try {
    bulunan = await stokGorseller(
      [konuSorgu(sorgu, a.title), sorgu, kisaSorgu(sorgu), ...(a.tags || []).slice(0, 2)],
      {
        adet: istenen + 2,
        kullanilan: kullanilanUrller,
        afet: afetMi(a.title, a.summary),
        marka: markaAdi(a.title),
      }
    );
  } catch (e) {
    console.log(`  ! ağ hatası: ${String(e?.message || e).slice(0, 80)}`);
    continue;
  }

  const secilen = [];
  for (const g of bulunan) {
    if (secilen.length >= istenen) break;
    if (!g?.url) continue;
    const k = kimlik(g.url);
    if (!k || kullanilanKimlikler.has(k)) continue;
    if (!stokEkUygunMu(a, g.url)) continue;
    kullanilanUrller.add(String(g.url));
    kullanilanKimlikler.add(k);
    secilen.push(g);
  }

  a.ekGorselDeneme = new Date().toISOString();

  if (!secilen.length) {
    bulunamayan++;
    console.log(`  · [${i + 1}/${hedefler.length}] ${a.title.slice(0, 56)} — uygun fotoğraf yok`);
  } else {
    a.gorselEk = secilen.map((g) => ({
      url: g.url,
      ...atif(g),
      ...(g.altyazi ? { altyazi: g.altyazi } : {}),
    }));
    eklenenHaber++;
    eklenenFotograf += secilen.length;
    console.log(
      `  + [${i + 1}/${hedefler.length}] ${a.title.slice(0, 46)} — ${secilen.length} fotoğraf: ` +
        secilen.map((g) => dosyaAdi(g.url)).join(" | ")
    );
  }

  if (!DRY && denenen % KAYDET_ARALIGI === 0) await saveArticles(articles);
  if (i + 1 < hedefler.length) await bekle(250);
}

if (!DRY) await saveArticles(articles);

console.log(
  `\nBitti. Denenen: ${denenen}, fotoğraf eklenen haber: ${eklenenHaber},` +
    ` eklenen fotoğraf: ${eklenenFotograf}, uygun fotoğraf bulunamayan: ${bulunamayan}` +
    `\nBu turda denenmeyen uygun haber: ${Math.max(0, uygunlar.length - denenen)}` +
    (DRY ? "\n(Deneme modu: data/articles.json değiştirilmedi.)" : "")
);
