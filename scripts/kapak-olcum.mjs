// ==========================================================================
// KAPAK ÖLÇÜMÜ — kaynak fotoğrafı hattı ne kadar haber için gerçek fotoğraf
// buluyor? Hiçbir dosyaya yazmaz (salt ölçüm), yalnızca rapor üretir.
//
// Kullanım:
//   node scripts/kapak-olcum.mjs --limit=120 --paralel=6
//   node scripts/kapak-olcum.mjs --limit=120 --json=reports/kapak-olcum.json
//   node scripts/kapak-olcum.mjs --hedef=kart|tumu   (varsayılan: kart)
//   node scripts/kapak-olcum.mjs --gun=30            (son N gün; 0 = tüm arşiv)
// ==========================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { kaynakAdaylari, kapakVerisiUygun, kaynakHost, kaynakIzinli } from "../src/kapak-kaynak.js";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (ad, vars) => {
  const b = process.argv.find((a) => a.startsWith(`--${ad}=`));
  return b ? b.slice(ad.length + 3) : vars;
};
const LIMIT = Number(arg("limit", 120)) || 120;
const PARALEL = Number(arg("paralel", 6)) || 6;
const GUN = Number(arg("gun", 0)) || 0;
const HEDEF = arg("hedef", "kart");
const JSON_YOL = arg("json", "");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const articles = JSON.parse(fs.readFileSync(path.join(KOK, "data", "articles.json"), "utf8"));
const liste = Array.isArray(articles) ? articles : articles.articles;

const esik = GUN > 0 ? Date.now() - GUN * 86400000 : 0;
let adaylar = liste.filter((a) => a?.id && a?.sourceUrl);
if (HEDEF === "kart") adaylar = adaylar.filter((a) => a.kapak?.foto === false);
if (GUN > 0)
  adaylar = adaylar.filter((a) => {
    const t = Date.parse(a.publishedAt || a.generatedAt || 0);
    return Number.isFinite(t) && t >= esik;
  });

// Arşivin tamamından eşit aralıklı örnek (en yeni haberlerle sınırlı kalmasın).
const adim = Math.max(1, Math.floor(adaylar.length / LIMIT));
const ornek = [];
for (let i = 0; i < adaylar.length && ornek.length < LIMIT; i += adim) ornek.push(adaylar[i]);

async function indir(url) {
  const r = await fetch(url, {
    headers: { "user-agent": UA, accept: "image/avif,image/webp,image/jpeg,image/png,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function olc(a) {
  const kayit = {
    id: a.id,
    baslik: a.title,
    kategori: a.category,
    kaynak: kaynakHost(a.sourceUrl),
    durum: "yok",
    neden: "",
    adaySayisi: 0,
    url: "",
    kalite: null,
  };
  if (!kaynakIzinli(a.sourceUrl)) {
    kayit.durum = "yasak";
    kayit.neden = "telif/rakip yayıncı";
    return kayit;
  }
  let adaylar = [];
  try {
    adaylar = await kaynakAdaylari(a, { adet: 6 });
  } catch (e) {
    kayit.neden = e.message;
    return kayit;
  }
  kayit.adaySayisi = adaylar.length;
  if (!adaylar.length) {
    kayit.neden = "sayfada görsel yok";
    return kayit;
  }
  const nedenler = [];
  for (const ad of adaylar.slice(0, 4)) {
    let veri;
    try {
      veri = await indir(ad.url);
    } catch (e) {
      nedenler.push(`indirilemedi (${e.message})`);
      continue;
    }
    const k = await kapakVerisiUygun(veri);
    if (k.uygun) {
      kayit.durum = "gecti";
      kayit.url = ad.url;
      kayit.kalite = k.olcum;
      return kayit;
    }
    nedenler.push(k.neden);
  }
  kayit.durum = "reddedildi";
  kayit.neden = nedenler.slice(0, 3).join(" | ");
  return kayit;
}

async function havuzla(isler, n) {
  const sonuc = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, isler.length) }, async () => {
      while (i < isler.length) {
        const idx = i++;
        sonuc[idx] = await isler[idx]();
      }
    })
  );
  return sonuc;
}

console.log(`Ölçüm: ${ornek.length} haber (${HEDEF}, ${GUN ? `son ${GUN} gün` : "tüm arşiv"}), paralel ${PARALEL}`);
const t0 = Date.now();
let biten = 0;
const kayitlar = await havuzla(
  ornek.map((a) => async () => {
    const r = await olc(a);
    biten++;
    if (biten % 20 === 0) console.log(`  … ${biten}/${ornek.length}`);
    return r;
  }),
  PARALEL
);

const say = (k) => kayitlar.filter((r) => r.durum === k).length;
const gecen = kayitlar.filter((r) => r.durum === "gecti");
const oran = ((gecen.length / Math.max(1, kayitlar.length)) * 100).toFixed(1);

const nedenGrupla = {};
for (const r of kayitlar.filter((x) => x.durum !== "gecti")) {
  const n = (r.neden || "bilinmiyor")
    .replace(/\d+/g, "#")
    .replace(/\(#+×#+\)/, "(boyut)")
    .replace(/\(#+\.#+\)/, "(oran)")
    .split(" | ")[0]
    .trim()
    .slice(0, 60);
  nedenGrupla[n] = (nedenGrupla[n] || 0) + 1;
}

const hostTablo = {};
for (const r of kayitlar) {
  const h = r.kaynak || "?";
  hostTablo[h] ||= { toplam: 0, gecti: 0 };
  hostTablo[h].toplam++;
  if (r.durum === "gecti") hostTablo[h].gecti++;
}

const kaliteOrt = gecen.length
  ? {
      genislik: Math.round(gecen.reduce((s, r) => s + (r.kalite?.w || 0), 0) / gecen.length),
      yukseklik: Math.round(gecen.reduce((s, r) => s + (r.kalite?.h || 0), 0) / gecen.length),
      entropi: +(gecen.reduce((s, r) => s + (r.kalite?.entropi || 0), 0) / gecen.length).toFixed(2),
    }
  : null;

console.log(`\n=== SONUÇ (${((Date.now() - t0) / 1000).toFixed(0)} sn) ===`);
console.log(`Gerçek fotoğraf bulundu: ${gecen.length}/${kayitlar.length} (%${oran})`);
console.log(`  geçti ${say("gecti")} · reddedildi ${say("reddedildi")} · yasak kaynak ${say("yasak")} · görsel yok ${say("yok")}`);
console.log("Reddetme nedenleri:", nedenGrupla);
console.log("Ortalama kaynak çözünürlüğü:", kaliteOrt);
console.log("Kaynak bazında:", Object.entries(hostTablo).sort((a, b) => b[1].toplam - a[1].toplam).slice(0, 12).map(([h, v]) => `${h} ${v.gecti}/${v.toplam}`).join(" · "));

if (JSON_YOL) {
  fs.mkdirSync(path.dirname(path.join(KOK, JSON_YOL)), { recursive: true });
  fs.writeFileSync(
    path.join(KOK, JSON_YOL),
    JSON.stringify({ tarih: new Date().toISOString(), hedef: HEDEF, gun: GUN, toplam: kayitlar.length, gecen: gecen.length, oran: Number(oran), kaliteOrt, nedenGrupla, hostTablo, kayitlar }, null, 1),
    "utf8"
  );
  console.log(`Rapor: ${JSON_YOL}`);
}
