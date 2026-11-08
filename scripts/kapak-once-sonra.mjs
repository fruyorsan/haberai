// ==========================================================================
// KAPAK ÖNCE/SONRA RAPORU
// --------------------------------------------------------------------------
// Gerçek arşivden N haberi seçer, her biri için:
//   • mevcut kapağı (tasarım kartı) `--eski.webp` olarak kopyalar,
//   • yeni kaynak fotoğrafı hattını çalıştırıp `--yeni.webp` üretir,
//   • başlık, kategori, kaynak sayfa, fotoğraf adresi ve kalite ölçümünü
//     `manifest.json` + `README.md` + `index.html` içine yazar.
//
// SADECE reports/ altına yazar: data/articles.json ve site/public değişmez
// (yayına alma kararı insanın/CI turunun).
//
// Kullanım:
//   node scripts/kapak-once-sonra.mjs --adet=12 --deneme=40
// ==========================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  kaynakAdaylari,
  kapakVerisiUygun,
  kapakKirp,
  kaynakAtif,
  kaynakHost,
  kaynakIzinli,
} from "../src/kapak-kaynak.js";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (ad, vars) => {
  const b = process.argv.find((a) => a.startsWith(`--${ad}=`));
  return b ? b.slice(ad.length + 3) : vars;
};
const ADET = Number(arg("adet", 12)) || 12;
const DENEME = Number(arg("deneme", 40)) || 40;
const CIKTI = path.join(KOK, "reports", "kapak-once-sonra");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const articles = JSON.parse(fs.readFileSync(path.join(KOK, "data", "articles.json"), "utf8"));
const liste = Array.isArray(articles) ? articles : articles.articles;

// Tasarım kartları, arşivin tamamından eşit aralıklı taranır.
const kartlar = liste.filter(
  (a) =>
    a?.id &&
    a?.title &&
    a.kapak?.foto === false &&
    /^https?:\/\//i.test(String(a.sourceUrl || "")) &&
    kaynakIzinli(a.sourceUrl)
);
const gorulenHost = new Map();
const adaylar = [];
const adim = Math.max(1, Math.floor(kartlar.length / (DENEME * 3)));
for (let i = 0; i < kartlar.length; i += adim) adaylar.push(kartlar[i]);

async function indir(url) {
  const r = await fetch(url, {
    headers: { "user-agent": UA, accept: "image/avif,image/webp,image/jpeg,image/png,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

fs.mkdirSync(CIKTI, { recursive: true });
const kayitlar = [];
let denenen = 0;

for (const a of adaylar) {
  if (kayitlar.length >= ADET || denenen >= DENEME) break;
  // Aynı kaynaktan en fazla 2 örnek: rapor tek siteden ibaret görünmesin.
  const h = kaynakHost(a.sourceUrl);
  if ((gorulenHost.get(h) || 0) >= 2) continue;
  denenen++;
  try {
    const kandidler = await kaynakAdaylari(a, { adet: 5 });
    let secilen = null;
    const redler = [];
    for (const k of kandidler) {
      let veri;
      try {
        veri = await indir(k.url);
      } catch (e) {
        redler.push(`indirilemedi (${e.message})`);
        continue;
      }
      const kapi = await kapakVerisiUygun(veri);
      if (!kapi.uygun) {
        redler.push(kapi.neden);
        continue;
      }
      secilen = { ...k, veri, kapi };
      break;
    }
    if (!secilen) {
      console.log(`  ✗ ${a.title.slice(0, 55)} — ${redler[0] || "görsel yok"}`);
      continue;
    }
    gorulenHost.set(h, (gorulenHost.get(h) || 0) + 1);
    const yeni = await kapakKirp(secilen.veri);
    const eskiYol = path.join(KOK, "site", "public", "kapak", `${a.id}.webp`);
    const eskiKopya = path.join(CIKTI, `${a.id}--eski.webp`);
    const yeniYol = path.join(CIKTI, `${a.id}--yeni.webp`);
    if (fs.existsSync(eskiYol)) fs.copyFileSync(eskiYol, eskiKopya);
    fs.writeFileSync(yeniYol, yeni);

    const atif = kaynakAtif(a, secilen.url);
    kayitlar.push({
      id: a.id,
      baslik: a.title,
      kategori: a.category,
      tarih: String(a.publishedAt || a.generatedAt || "").slice(0, 10),
      haberUrl: `https://haberinai.site/haber/${a.slug}/`,
      kaynakSayfa: a.sourceUrl,
      kaynakSite: kaynakHost(a.sourceUrl),
      fotoUrl: secilen.url,
      atif,
      kalite: secilen.kapi.olcum,
      eski: fs.existsSync(eskiKopya) ? path.basename(eskiKopya) : null,
      yeni: path.basename(yeniYol),
    });
    console.log(`  ✓ ${kayitlar.length}/${ADET} ${a.title.slice(0, 55)} (${secilen.kapi.olcum.w}×${secilen.kapi.olcum.h})`);
  } catch (e) {
    console.log(`  ! ${a.id}: ${e.message}`);
  }
}

const tarih = new Date().toISOString();
fs.writeFileSync(
  path.join(CIKTI, "manifest.json"),
  JSON.stringify({ tarih, adet: kayitlar.length, kayitlar }, null, 1),
  "utf8"
);

const kacis = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const satirlar = kayitlar
  .map(
    (k, i) => `<tr>
  <td class="no">${i + 1}</td>
  <td><a href="${kacis(k.haberUrl)}" target="_blank" rel="noopener">${kacis(k.baslik)}</a>
      <div class="meta">${kacis(k.kategori)} · ${kacis(k.tarih)} · kaynak: ${kacis(k.kaynakSite)}</div></td>
  <td>${k.eski ? `<img src="${kacis(k.eski)}" alt="önce" loading="lazy">` : "<em>yok</em>"}</td>
  <td><img src="${kacis(k.yeni)}" alt="sonra" loading="lazy"></td>
  <td class="meta">${k.kalite.w}×${k.kalite.h}<br>${k.kalite.oran}:1<br>entropi ${k.kalite.entropi}<br>
      <a href="${kacis(k.kaynakSayfa)}" target="_blank" rel="noopener nofollow">kaynak sayfa</a></td>
</tr>`
  )
  .join("\n");

fs.writeFileSync(
  path.join(CIKTI, "index.html"),
  `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<title>Kapak önce/sonra — haberinai.site</title>
<style>
body{font:14px/1.5 system-ui,Segoe UI,Arial;margin:24px;background:#0b0e14;color:#e8edf5}
h1{font-size:20px;margin:0 0 4px}.alt{color:#93a1b5;margin:0 0 20px}
table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #1e2733;padding:10px;vertical-align:top}
img{width:320px;aspect-ratio:16/9;object-fit:cover;border-radius:8px;display:block;background:#111}
.no{color:#5d6b80;width:28px}.meta{color:#93a1b5;font-size:12px;margin-top:4px}
a{color:#5aa9ff;text-decoration:none}
</style></head><body>
<h1>Kapak önce / sonra</h1>
<p class="alt">${kayitlar.length} haber · ${kacis(tarih.slice(0, 16).replace("T", " "))} ·
Sol: eski tasarım kartı · Sağ: kaynak sitenin kendi fotoğrafından üretilen yeni kapak (1280×720).</p>
<table><tbody>
${satirlar}
</tbody></table></body></html>
`,
  "utf8"
);

const md = [
  `# Kapak önce/sonra — ${tarih.slice(0, 10)}`,
  "",
  `${kayitlar.length} haber. Eski kapak: ikonlu tasarım kartı. Yeni kapak: kaynak sayfanın kendi`,
  "og:image fotoğrafı, 1280×720 kırpılmış (kalite kapısından geçmiş).",
  "",
  "| # | Haber | Kategori | Kaynak | Fotoğraf | Kalite |",
  "|---|---|---|---|---|---|",
  ...kayitlar.map(
    (k, i) =>
      `| ${i + 1} | [${k.baslik.replace(/\|/g, "\\|").slice(0, 70)}](${k.haberUrl}) | ${k.kategori} | ${k.kaynakSite} | \`${k.fotoUrl.slice(-58)}\` | ${k.kalite.w}×${k.kalite.h}, ${k.kalite.oran}:1, entropi ${k.kalite.entropi} |`
  ),
  "",
  "Görsel karşılaştırma: `index.html` (tarayıcıda açın) · makine okunur kayıt: `manifest.json`.",
  "",
].join("\n");
fs.writeFileSync(path.join(CIKTI, "README.md"), md, "utf8");

console.log(`\n${kayitlar.length} örnek → ${path.relative(KOK, CIKTI)}\\ (index.html, README.md, manifest.json)`);
