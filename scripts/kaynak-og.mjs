// ==========================================================================
// KAYNAK SAYFANIN KAPAK FOTOĞRAFI (og:image) → `image`
// --------------------------------------------------------------------------
// SORUN: Arşivdeki ~3.000 kayıtta yazı içi fotoğraf yok; `image` alanı hâlâ
// Wikimedia stoğu. Kartlarda başlıkla alakasız kareler görünüyor.
//
// NE YAPAR: Haberin çıktığı sayfayı indirir, `og:image` / `twitter:image`
// etiketini bulur, adresi mutlaklaştırır, logo/şablon adreslerini eler ve
// görselin GERÇEK ölçüsünü doğrular (≥600×300). Uygun kareyi `image` alanına
// yazar. Yerel kapak dosyası olan kayıtlara dokunmaz.
//
// KULLANIM:
//   node scripts/kaynak-og.mjs --gun=30 --limit=300 --paralel=6
//   node scripts/kaynak-og.mjs --dry
// ==========================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTICLES = path.join(KOK, "data", "articles.json");

const arg = (ad, varsayilan) => {
  const bulunan = process.argv.find((a) => a.startsWith(`--${ad}=`));
  return bulunan ? Number(bulunan.split("=")[1]) || varsayilan : varsayilan;
};
const gun = arg("gun", 30);
const limit = arg("limit", 400);
const paralel = arg("paralel", 6);
const dry = process.argv.includes("--dry");
const debug = process.env.DEBUG_OG === "1";

const UA = "Mozilla/5.0 (compatible; HaberinAi/1.0; +https://haberinai.site)";
const STOK = /(^|\.)wikimedia\.org$/i;

const ham = fs.readFileSync(ARTICLES, "utf8");
const satirSonu = ham.includes("\r\n") ? "\r\n" : "\n";
const articles = JSON.parse(ham);

const stokMu = (u) => {
  const s = String(u || "");
  if (!s) return true;
  try {
    return STOK.test(new URL(s).hostname);
  } catch {
    return false;
  }
};

const esik = Date.now() - gun * 86400000;
const hedefler = articles
  .filter((a) => {
    if (!a || !a.id) return false;
    if (String(a.image || "").startsWith("/kapak/")) return false;
    if (!stokMu(a.image)) return false;
    if (Array.isArray(a.images) && a.images.length) return false;
    if (!/^https?:\/\//i.test(String(a.sourceUrl || ""))) return false;
    const t = Date.parse(a.publishedAt || a.generatedAt || 0);
    return !Number.isFinite(t) || t >= esik;
  })
  .sort(
    (a, b) =>
      Date.parse(b.publishedAt || b.generatedAt || 0) - Date.parse(a.publishedAt || a.generatedAt || 0)
  )
  .slice(0, limit);

console.log(`${hedefler.length} haber için kaynak sayfadan og:image aranacak${dry ? " [dry]" : ""}.`);

async function sayfaIndir(url) {
  const yanit = await fetch(url, {
    headers: { "user-agent": UA, "accept-language": "tr,en;q=0.8", accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
  });
  if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`);
  return (await yanit.text()).slice(0, 500000);
}

const KALIPLAR = [
  /<meta[^>]+(?:property|name)=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image(?::url)?["']/i,
  /<meta[^>]+(?:property|name)=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
];
const JUNK = /(logo|favicon|default|placeholder|share-?default|sprite|avatar|ikon|icon|blank|1x1|pixel)/i;

/** Görselin gerçek ölçüsü kapak olmaya uygun mu? */
async function olcuUygun(url) {
  try {
    const yanit = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept: "image/avif,image/webp,image/jpeg,image/png,*/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (!yanit.ok) return false;
    const boyut = Number(yanit.headers.get("content-length") || 0);
    if (boyut && boyut > 12_000_000) return false;
    const veri = Buffer.from(await yanit.arrayBuffer());
    if (veri.length < 6000) return false; // ikon/izleme pikseli
    const bilgi = await sharp(veri).metadata();
    const w = bilgi.width || 0;
    const h = bilgi.height || 0;
    return w >= 600 && h >= 300 && w / h <= 4 && h / w <= 3;
  } catch {
    return false;
  }
}

async function havuz(dizi, esZamanli, islev) {
  let imlec = 0;
  const isciler = Array.from({ length: Math.min(esZamanli, dizi.length) }, async () => {
    while (imlec < dizi.length) await islev(dizi[imlec++]);
  });
  await Promise.all(isciler);
}

let bulunan = 0;
let yok = 0;
let hata = 0;

await havuz(hedefler, paralel, async (a) => {
  try {
    const html = await sayfaIndir(a.sourceUrl);
    let aday = null;
    for (const kalip of KALIPLAR) {
      const ham = kalip.exec(html)?.[1];
      if (!ham) continue;
      const tam = new URL(ham.replace(/&amp;/g, "&"), a.sourceUrl).href;
      if (!/^https?:\/\//i.test(tam) || JUNK.test(tam)) continue;
      aday = tam;
      break;
    }
    if (!aday) {
      yok++;
      if (debug) console.log(`  · ${a.id} og:image yok`);
      return;
    }
    if (!(await olcuUygun(aday))) {
      yok++;
      if (debug) console.log(`  · ${a.id} og:image ölçü/format uygun değil: ${aday.slice(0, 90)}`);
      return;
    }
    a.image = aday;
    a.gorselKaynak = a.gorselKaynak || a.sourceUrl;
    a.ogGorsel = new Date().toISOString();
    bulunan++;
    if (debug) console.log(`  ✓ ${a.id} ${aday.slice(0, 90)}`);
  } catch (err) {
    hata++;
    if (debug) console.log(`  ! ${a.id}: ${err.message}`);
  }
});

console.log(`${bulunan} habere kaynak fotoğrafı yazıldı, ${yok} uygun kare yok, ${hata} hata.`);

if (!dry && bulunan) {
  fs.writeFileSync(ARTICLES, JSON.stringify(articles, null, 2).replace(/\n/g, satirSonu) + satirSonu, "utf8");
}
