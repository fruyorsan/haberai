// IndexNow: yeni/yenilenmiş haberleri Bing ve Yandex'e anında bildirir.
//
// Tasarım ilkeleri:
//  - Google IndexNow'u desteklemez; orada sitemap + Search Console yeterlidir.
//  - Tekrarlama önleme: gönderilen haber id'leri data/indexnow.json'da tutulur.
//  - Hata hattı durdurmaz: istek başarısızsa işaret konmaz, sonraki turda yeniden denenir.
//
// Anahtar dosyası: site/public/<INDEXNOW_KEY>.txt — içinde anahtarın kendisi yazar.
// Anahtarı değiştirirsen dosyayı da yeni adla oluştur (yoksa 403 döner).
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const ARTICLES_FILE = join(DATA_DIR, "articles.json");
const STATE_FILE = join(DATA_DIR, "indexnow.json");

const DEFAULT_SITE_URL = "https://haberinai.site";
const DEFAULT_KEY = "4885591a24bc0c6d40e8cbbb5c77fb50";
const ENDPOINT = "https://api.indexnow.org/indexnow";

const KEY = (process.env.INDEXNOW_KEY || DEFAULT_KEY).trim();
const LIMIT = Number(process.env.INDEXNOW_LIMIT ?? 40); // tur başına en fazla URL
const KEEP = Number(process.env.INDEXNOW_KEEP ?? 5000); // durum dosyasında tutulacak kayıt
// Yalnızca son N günün haberleri bildirilir; eski arşiv site haritasından taranır.
// (IndexNow "yeni/değişen URL" protokolüdür, toplu arşiv gönderimi önerilmez.)
const GUN = Number(process.env.INDEXNOW_GUN ?? 3);
const dry = process.argv.includes("--dry");
const tumu = process.argv.includes("--tumu"); // bir kerelik: pencere ve sınırı yok say

function siteUrl() {
  return (process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function haberUrl(haber) {
  const slug = String(haber?.slug || "").trim();
  return slug ? `${siteUrl()}/haber/${slug}/` : null;
}

async function main() {
  const ham = await readJson(ARTICLES_FILE, []);
  const haberler = Array.isArray(ham) ? ham : ham.articles || [];
  const durum = await readJson(STATE_FILE, { gonderilenler: {} });
  const gonderilen =
    durum.gonderilenler && typeof durum.gonderilenler === "object" ? durum.gonderilenler : {};

  const esikZaman = GUN > 0 ? Date.now() - GUN * 24 * 60 * 60 * 1000 : 0;

  const bekleyen = haberler
    .filter((h) => h && h.id && !gonderilen[h.id])
    .filter((h) => {
      if (tumu || !esikZaman) return true;
      const t = Date.parse(h.publishedAt || "");
      return Number.isNaN(t) ? false : t >= esikZaman;
    })
    .sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")))
    .map((h) => ({ id: h.id, url: haberUrl(h) }))
    .filter((x) => x.url);

  const secilen = LIMIT > 0 && !tumu ? bekleyen.slice(0, LIMIT) : bekleyen;

  console.log("\n=== IndexNow (Bing/Yandex) ===");
  console.log(`  site     : ${siteUrl()}`);
  console.log(`  anahtar  : ${KEY}`);
  console.log(
    `  arşiv    : ${haberler.length} haber | gönderilmiş: ${Object.keys(gonderilen).length} | bekleyen: ${bekleyen.length}`
  );
  console.log(
    `  pencere  : ${tumu ? "tüm arşiv (--tumu)" : `son ${GUN} gün`} | bu turda: ${secilen.length} URL${
      LIMIT > 0 && !tumu ? ` (üst sınır ${LIMIT})` : ""
    }`
  );

  if (!secilen.length) {
    console.log("  → Gönderilecek yeni haber yok.\n");
    return;
  }

  const urlList = secilen.map((x) => x.url);
  for (const u of urlList.slice(0, 5)) console.log(`     • ${u}`);
  if (urlList.length > 5) console.log(`     … +${urlList.length - 5} URL`);

  if (dry) {
    console.log("  → --dry: istek gönderilmedi.\n");
    return;
  }

  const govde = {
    host: new URL(siteUrl()).host,
    key: KEY,
    keyLocation: `${siteUrl()}/${KEY}.txt`,
    urlList,
  };

  let yanit;
  try {
    yanit = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(govde),
      signal: AbortSignal.timeout(30000),
    });
  } catch (hata) {
    console.log(`  ✗ İstek başarısız: ${hata?.message || hata} — işaret konmadı, sonraki turda tekrar denenecek.\n`);
    return;
  }

  const metin = (await yanit.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 200);

  if (!yanit.ok) {
    console.log(`  ✗ IndexNow reddetti (HTTP ${yanit.status})${metin ? ` — ${metin}` : ""}`);
    if (yanit.status === 403 || yanit.status === 422) {
      console.log("    Not: bu kodlar genelde anahtar dosyasının yayında olmadığını gösterir:");
      console.log(`    ${siteUrl()}/${KEY}.txt\n`);
    } else {
      console.log("");
    }
    return;
  }

  const simdi = new Date().toISOString();
  for (const x of secilen) gonderilen[x.id] = simdi;

  // Durum dosyası sınırsız büyümesin: en eski kayıtlar budanır.
  const idler = Object.keys(gonderilen);
  if (KEEP > 0 && idler.length > KEEP) {
    idler.sort((a, b) => String(gonderilen[a]).localeCompare(String(gonderilen[b])));
    for (const id of idler.slice(0, idler.length - KEEP)) delete gonderilen[id];
  }

  await writeFile(STATE_FILE, `${JSON.stringify({ gonderilenler: gonderilen }, null, 2)}\n`, "utf8");
  console.log(`  ✓ ${secilen.length} URL gönderildi (HTTP ${yanit.status})${metin ? ` — ${metin}` : ""}\n`);
}

main().catch((hata) => {
  console.log(`  ✗ IndexNow hatası: ${hata?.message || hata}\n`);
});
