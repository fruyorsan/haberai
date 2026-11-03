// YEDEK_GORSEL havuzunu ATIF GEREKTİRMEYEN (CC0 / kamu malı) fotoğraflarla
// yeniden üretir.
//
// NEDEN: Havuzun çoğu CC BY / CC BY-SA karelerden oluşuyordu. Sitede görsel
// kredisi gösterilmediği için bu lisanslar kullanılamaz. Kategori başına 4
// CC0/PD kare bulunur; Commons'ta yeterli kare yoksa mevcut CC0 kayıt korunur.
//
// Kullanım: node scripts/yedek-havuz-yenile.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { YEDEK_GORSEL, KATEGORI_SORGU, stokGorseller } from "../src/stok-gorsel.js";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSYA = path.join(KOK, "src", "stok-gorsel.js");

const KAMU_MALI = /^(cc0\b|public domain\b|pd\b|pd[- ].*|no restrictions\b|kamu mal[ıi]$)/i;
const HEDEF = 4;

const kategoriler = Object.keys(YEDEK_GORSEL);
const yeni = {};

for (const kategori of kategoriler) {
  const mevcut = (YEDEK_GORSEL[kategori] || []).filter((g) => KAMU_MALI.test(String(g.lisans || "")));
  const secili = [];
  const gorulen = new Set();
  const ekle = (g) => {
    if (!g?.url || gorulen.has(g.url) || !KAMU_MALI.test(String(g.lisans || ""))) return;
    gorulen.add(g.url);
    secili.push({
      url: g.url,
      yazar: g.yazar || "",
      lisans: g.lisans,
      ...(g.lisansUrl ? { lisansUrl: g.lisansUrl } : {}),
      sayfa: g.sayfa || "",
    });
  };
  for (const g of mevcut) ekle(g);

  if (secili.length < HEDEF) {
    const sorgular = [KATEGORI_SORGU[kategori], kategori].filter(Boolean);
    try {
      const bulunan = await stokGorseller(sorgular, { adet: HEDEF * 3 });
      for (const g of bulunan) {
        if (secili.length >= HEDEF) break;
        ekle(g);
      }
    } catch (err) {
      console.warn(`! ${kategori}: ${err.message}`);
    }
  }

  yeni[kategori] = secili.slice(0, HEDEF);
  console.log(
    `${kategori.padEnd(14)} ${yeni[kategori].length}/${HEDEF} ` +
      `(mevcut uygun: ${mevcut.length})`
  );
}

const gecerli = Object.fromEntries(Object.entries(yeni).filter(([, v]) => v.length));
if (!gecerli.Diğer) {
  const ilk = Object.values(gecerli)[0] || [];
  if (ilk.length) gecerli.Diğer = ilk.slice(0, 2);
}

const govde = Object.entries(gecerli)
  .map(([kategori, liste]) => {
    const kayitlar = liste
      .map((g) => {
        const satirlar = [
          `      url: ${JSON.stringify(g.url)},`,
          `      yazar: ${JSON.stringify(g.yazar)},`,
          `      lisans: ${JSON.stringify(g.lisans)},`,
        ];
        if (g.lisansUrl) satirlar.push(`      lisansUrl: ${JSON.stringify(g.lisansUrl)},`);
        satirlar.push(`      sayfa: ${JSON.stringify(g.sayfa)},`);
        return `    {\n${satirlar.join("\n")}\n    },`;
      })
      .join("\n");
    return `  ${JSON.stringify(kategori)}: [\n${kayitlar}\n  ],`;
  })
  .join("\n");

const kaynak = fs.readFileSync(DOSYA, "utf8");
const bas = kaynak.indexOf("export const YEDEK_GORSEL = {");
const son = kaynak.indexOf("\n};", bas);
if (bas < 0 || son < 0) {
  console.error("YEDEK_GORSEL bloğu bulunamadı");
  process.exit(1);
}
const yeniBlok = `export const YEDEK_GORSEL = {\n${govde}\n};`;
fs.writeFileSync(DOSYA, kaynak.slice(0, bas) + yeniBlok + kaynak.slice(son + 3), "utf8");
console.log(`\nYEDEK_GORSEL yenilendi: ${Object.keys(gecerli).length} kategori, ${Object.values(gecerli).reduce((n, v) => n + v.length, 0)} görsel.`);
