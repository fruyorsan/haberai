import fs from "node:fs";
import path from "node:path";

const CIKTI = path.join(process.cwd(), "reports", "kapak-uyum-test");
const manifest = JSON.parse(fs.readFileSync(path.join(CIKTI, "manifest.json"), "utf8"));

const ROZET = {
  urun: ["ÜRÜN", "#2563eb"],
  sahne: ["SAHNE", "#059669"],
  konu: ["KONU", "#0d9488"],
  marka: ["MARKA KARTI", "#b45309"],
  kart: ["TASARIM", "#6b7280"],
  yok: ["YOK", "#dc2626"],
  hata: ["HATA", "#dc2626"],
};

const say = {};
for (const x of manifest) say[x.tur] = (say[x.tur] || 0) + 1;

const kartlar = manifest
  .map((x) => {
    const [etiket, renk] = ROZET[x.tur] || ROZET.kart;
    const gorsel = x.dosya
      ? `<img src="${x.dosya}" alt="">`
      : `<div class="yok">kapak üretilemedi</div>`;
    const alt = [
      x.marka ? `<span class="marka">${x.marka}</span>` : "",
      x.sahne ? `<span class="sahne">konu: ${x.sahne}</span>` : "",
      x.kaynak ? `<span class="kaynak">${x.kaynak}</span>` : "",
      x.lisans ? `<span class="lisans">${x.lisans}</span>` : "",
    ]
      .filter(Boolean)
      .join("");
    const viz = x.vizyon ? `<p class="viz">${x.vizyon}</p>` : "";
    return `<article>
  ${gorsel}
  <div class="govde">
    <span class="rozet" style="background:${renk}">${etiket}</span>
    <h2>${x.baslik}</h2>
    ${viz}
    <p class="meta">${alt}</p>
  </div>
</article>`;
  })
  .join("\n");

const ozet = Object.entries(say)
  .map(([t, n]) => {
    const [etiket, renk] = ROZET[t] || ROZET.kart;
    return `<span class="rozet" style="background:${renk}">${etiket}: ${n}</span>`;
  })
  .join(" ");

const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kapak uyum testi</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; background: #0b0f14; color: #e5e7eb;
         font: 15px/1.5 "Segoe UI", system-ui, sans-serif; }
  header { max-width: 1400px; margin: 0 auto 28px; }
  h1 { margin: 0 0 6px; font-size: 26px; }
  header p { margin: 0 0 14px; color: #9ca3af; }
  .rozet { display: inline-block; padding: 2px 9px; border-radius: 999px;
           font-size: 11px; font-weight: 700; letter-spacing: .04em; color: #fff; }
  .izgara { max-width: 1400px; margin: 0 auto; display: grid;
            grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 22px; }
  article { background: #111823; border: 1px solid #1f2a37; border-radius: 14px;
            overflow: hidden; display: flex; flex-direction: column; }
  article > img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block;
                  background: #000; }
  .yok { aspect-ratio: 16/9; display: grid; place-items: center; color: #6b7280;
         background: #0f172a; font-size: 13px; }
  .govde { padding: 14px 16px 18px; display: flex; flex-direction: column; gap: 8px; }
  h2 { margin: 0; font-size: 15px; line-height: 1.35; font-weight: 600; }
  .viz { margin: 0; font-size: 12.5px; color: #9ca3af; }
  .meta { margin: 0; display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; }
  .meta span { background: #1b2534; color: #93a4ba; padding: 2px 8px; border-radius: 6px; }
  .lisans { color: #6ee7b7 !important; }
</style>
</head>
<body>
<header>
  <h1>Kapak uyum testi</h1>
  <p>Her kapak haberin konusunu gösteren gerçek bir sahne + marka imzası. Üzerinde başlık yazısı yok.</p>
  <div>${ozet}</div>
</header>
<div class="izgara">
${kartlar}
</div>
</body>
</html>
`;

fs.writeFileSync(path.join(CIKTI, "index.html"), html);
console.log("index.html yazildi;", manifest.length, "kapak;", say);
