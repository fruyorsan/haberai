// ============================================================================
// HAZIR AVATAR ÜRETİCİ — sade, yetişkin, soyut desenler
// ----------------------------------------------------------------------------
// Neden hayvan/karakter değil: okuyucu "oyuncak/çizgi film gibi" buldu. Burada
// amaç profil fotoğrafı yerine geçen, uygulama varsayılanı gibi duran sakin
// geometrik kompozisyonlar. Hepsi elle yazılmış SVG: telif yok, indirme yok,
// her cihazda aynı görünür.
//
// Çıktı: site/public/avatar/<slug>.svg  (96x96, yuvarlak)
// Kullanım: node scripts/avatar-uret.mjs
// ============================================================================
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = join(dirname(fileURLToPath(import.meta.url)), "..", "site", "public", "avatar");
const BOY = 96;

/** Ortak çerçeve: yuvarlak kırpma + iki tonlu, yumuşak gradyan zemin. */
function cerceve(slug, renk1, renk2, icerik, ekTanilar = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOY} ${BOY}" width="${BOY}" height="${BOY}" role="img" aria-hidden="true">
<defs>
<linearGradient id="g-${slug}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${renk1}"/>
<stop offset="1" stop-color="${renk2}"/>
</linearGradient>
<clipPath id="k-${slug}"><circle cx="48" cy="48" r="48"/></clipPath>${ekTanilar}
</defs>
<g clip-path="url(#k-${slug})">
<rect width="${BOY}" height="${BOY}" fill="url(#g-${slug})"/>
${icerik}
</g>
</svg>
`;
}

/** 4x4 nokta ızgarası — boyutlar merkeze doğru büyür. */
function noktalar() {
  const parcalar = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const uzaklik = Math.hypot(x - 2, y - 2);
      const r = Math.max(1.4, 4.2 - uzaklik * 1.1);
      const op = 0.22 + (4.2 - r) * 0.14;
      parcalar.push(
        `<circle cx="${24 + x * 12}" cy="${24 + y * 12}" r="${r.toFixed(1)}" fill="#fff" fill-opacity="${op.toFixed(2)}"/>`
      );
    }
  }
  return parcalar.join("\n");
}

const LISTE = [
  {
    slug: "dalga",
    renk: "#2d6a8f",
    icerik: `
<path d="M-10 58C12 40 32 74 54 56S92 36 106 52" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>
<path d="M-10 72C12 54 32 88 54 70S92 50 106 66" fill="none" stroke="#fff" stroke-opacity=".26" stroke-width="3" stroke-linecap="round"/>
<path d="M-10 44C12 26 32 60 54 42S92 22 106 38" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="3" stroke-linecap="round"/>`,
  },
  {
    slug: "yay",
    renk: "#6b4a7a",
    icerik: `
<path d="M16 80A36 36 0 0 1 80 80" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="10" stroke-linecap="round"/>
<path d="M24 80A28 28 0 0 1 72 80" fill="none" stroke="#fff" stroke-opacity=".78" stroke-width="3" stroke-linecap="round"/>
<circle cx="48" cy="80" r="4" fill="#fff" fill-opacity=".85"/>`,
  },
  {
    slug: "halka",
    renk: "#2f6b5c",
    icerik: `
<circle cx="48" cy="48" r="31" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2"/>
<circle cx="48" cy="48" r="21" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="2"/>
<circle cx="48" cy="48" r="7" fill="#fff" fill-opacity=".8"/>
<circle cx="48" cy="27" r="4" fill="#fff" fill-opacity=".55"/>`,
  },
  {
    slug: "blok",
    renk: "#4d4d5f",
    icerik: `
<rect x="16" y="24" width="32" height="48" rx="7" fill="#fff" fill-opacity=".12" transform="rotate(-14 32 48)"/>
<rect x="34" y="20" width="34" height="56" rx="7" fill="#fff" fill-opacity=".2" transform="rotate(8 51 48)"/>
<rect x="46" y="38" width="34" height="34" rx="7" fill="#fff" fill-opacity=".28"/>`,
  },
  {
    slug: "yaprak",
    renk: "#7a5a34",
    icerik: `
<path d="M28 72C28 42 50 22 74 22c2 26-16 50-46 50Z" fill="#fff" fill-opacity=".18"/>
<path d="M28 72C28 42 50 22 74 22c2 26-16 50-46 50Z" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.6"/>
<path d="M31 70C44 58 57 44 71 25" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.6" stroke-linecap="round"/>`,
  },
  {
    slug: "konik",
    renk: "#514580",
    icerik: `
<path d="M48 20 75 72H21Z" fill="#fff" fill-opacity=".14"/>
<path d="M48 20 75 72H21Z" fill="none" stroke="#fff" stroke-opacity=".34" stroke-width="1.6"/>
<circle cx="48" cy="52" r="11" fill="#fff" fill-opacity=".62"/>`,
  },
  {
    slug: "izgara",
    renk: "#3a5464",
    icerik: `
<g stroke="#fff" stroke-opacity=".2" stroke-width="1.5">
<path d="M28 0v96M40 0v96M52 0v96M64 0v96M76 0v96"/>
<path d="M0 28h96M0 40h96M0 52h96M0 64h96M0 76h96"/>
</g>
<circle cx="58" cy="46" r="15" fill="#fff" fill-opacity=".2"/>
<circle cx="58" cy="46" r="7" fill="#fff" fill-opacity=".5"/>`,
  },
  {
    slug: "hilal",
    renk: "#7a3038",
    ekTanilar: `
<mask id="m-hilal">
<rect width="${BOY}" height="${BOY}" fill="#fff"/>
<circle cx="61" cy="39" r="25" fill="#000"/>
</mask>`,
    icerik: `
<circle cx="44" cy="49" r="27" fill="#fff" fill-opacity=".85" mask="url(#m-hilal)"/>
<circle cx="71" cy="70" r="3" fill="#fff" fill-opacity=".55"/>`,
  },
  {
    slug: "serit",
    renk: "#3c5a5f",
    icerik: `
<path d="M-8 30C24 30 28 66 64 66s32-20 42-20" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="7" stroke-linecap="round"/>
<path d="M-8 46C24 46 28 82 64 82s32-20 42-20" fill="none" stroke="#fff" stroke-opacity=".24" stroke-width="7" stroke-linecap="round"/>
<path d="M-8 14C24 14 28 50 64 50s32-20 42-20" fill="none" stroke="#fff" stroke-opacity=".13" stroke-width="7" stroke-linecap="round"/>`,
  },
  {
    slug: "nokta",
    renk: "#6b6338",
    icerik: noktalar(),
  },
  {
    slug: "zikzak",
    renk: "#7f3f2f",
    icerik: `
<path d="M-4 62 16 40 36 62 56 40 76 62 100 36" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
<path d="M-4 78 16 56 36 78 56 56 76 78 100 52" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
<path d="M-4 46 16 24 36 46 56 24 76 46 100 20" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`,
  },
  {
    slug: "tunel",
    renk: "#35504f",
    icerik: `
<g fill="none" stroke="#fff" transform="rotate(45 48 48)">
<rect x="14" y="14" width="68" height="68" rx="10" stroke-opacity=".14" stroke-width="2"/>
<rect x="25" y="25" width="46" height="46" rx="7" stroke-opacity=".3" stroke-width="2"/>
<rect x="35" y="35" width="26" height="26" rx="5" stroke-opacity=".5" stroke-width="2"/>
<rect x="43" y="43" width="10" height="10" rx="2" stroke-opacity=".85" stroke-width="2"/>
</g>`,
  },
];

const ZEMINLER = {
  dalga: ["#12324a", "#3f87ad"],
  yay: ["#2e1f3d", "#83578f"],
  halka: ["#0f2f2a", "#3f8c76"],
  blok: ["#23232c", "#5c5c72"],
  yaprak: ["#3a2a17", "#9a7444"],
  konik: ["#251f3d", "#6a5aa0"],
  izgara: ["#18242c", "#476a80"],
  hilal: ["#33121a", "#96414b"],
  serit: ["#16262a", "#4c7278"],
  nokta: ["#2b2814", "#877d47"],
  zikzak: ["#331812", "#9c533c"],
  tunel: ["#122524", "#45706e"],
};

await rm(KOK, { recursive: true, force: true });
await mkdir(KOK, { recursive: true });

for (const a of LISTE) {
  const [z1, z2] = ZEMINLER[a.slug];
  await writeFile(join(KOK, `${a.slug}.svg`), cerceve(a.slug, z1, z2, a.icerik, a.ekTanilar || ""), "utf8");
}

const dosyalar = (await readdir(KOK)).sort();
console.log(`${dosyalar.length} avatar yazıldı: ${KOK}`);
console.log(dosyalar.join(", "));
