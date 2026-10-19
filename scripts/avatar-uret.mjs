// ==========================================================================
// AVATAR ÜRETİCİ — hazır profil fotoğrafları (12 hayvan, 120x120 SVG)
// --------------------------------------------------------------------------
// Neden kod: 12 avatarın aynı göz/yanak/gülüş kalıbını paylaşması ve ileride
// ton/şekil değişince hepsinin birlikte güncellenmesi için. Emoji yerine çizim
// kullanılır: telif sorunu yoktur, her cihazda aynı görünür.
//
// Çalıştır:  node scripts/avatar-uret.mjs
// Çıktı:     site/public/avatar/<slug>.svg
// ==========================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = join(dirname(fileURLToPath(import.meta.url)), "..");
const HEDEF = join(KOK, "site", "public", "avatar");

// --- Ortak parçalar --------------------------------------------------------
const goz = (x, y, r = 5.2) =>
  `<ellipse cx="${x}" cy="${y}" rx="${(r * 0.86).toFixed(1)}" ry="${r}" fill="#2c2b33"/>` +
  `<circle cx="${(x + r * 0.34).toFixed(1)}" cy="${(y - r * 0.46).toFixed(1)}" r="${(r * 0.3).toFixed(1)}" fill="#ffffff"/>`;

const yanak = (y = 78, kat = 1) =>
  `<ellipse cx="${60 - 22}" cy="${y}" rx="6.4" ry="4.2" fill="#ff8fa3" opacity="${0.4 * kat}"/>` +
  `<ellipse cx="${60 + 22}" cy="${y}" rx="6.4" ry="4.2" fill="#ff8fa3" opacity="${0.4 * kat}"/>`;

const gulus = (y, renk = "#3a3742", x = 60, gen = 12) =>
  `<path d="M${x - gen / 2} ${y} q${gen / 2} 6 ${gen} 0" fill="none" stroke="${renk}" stroke-width="2" stroke-linecap="round"/>`;

// --- Hayvanlar -------------------------------------------------------------
// her biri: ad (Türkçe), slug (dosya), zemin (daire rengi), çizim (SVG gövde)
const HAYVANLAR = [
  {
    ad: "Kedi",
    slug: "kedi",
    zemin: "#ffe3ee",
    cizim: `
      <path d="M28 48 L31 17 L54 35 Z" fill="#f2a03d"/>
      <path d="M92 48 L89 17 L66 35 Z" fill="#f2a03d"/>
      <path d="M33.5 43 L35.5 25 L49.5 36 Z" fill="#f8c9a4"/>
      <path d="M86.5 43 L84.5 25 L70.5 36 Z" fill="#f8c9a4"/>
      <ellipse cx="60" cy="68" rx="34" ry="31" fill="#f2a03d"/>
      <path d="M50 42 q4 5 1 9 M60 40 q4 5 0 10 M70 42 q-4 5 -1 9" fill="none" stroke="#d9862a" stroke-width="2.6" stroke-linecap="round"/>
      <ellipse cx="60" cy="79" rx="17" ry="11" fill="#ffe6cf"/>
      <path d="M55.5 74 h9 l-4.5 5 z" fill="#e8707f"/>
      ${gulus(80)}
      <path d="M20 72 h13 M20 79 h13 M87 72 h13 M87 79 h13" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="0.9"/>
      ${yanak(78, 0.8)}
      ${goz(47, 62)}${goz(73, 62)}`,
  },
  {
    ad: "Köpek",
    slug: "kopek",
    zemin: "#e8f0ff",
    cizim: `
      <ellipse cx="26" cy="66" rx="11" ry="20" fill="#a9784a"/>
      <ellipse cx="94" cy="66" rx="11" ry="20" fill="#a9784a"/>
      <ellipse cx="60" cy="66" rx="33" ry="31" fill="#d9a86c"/>
      <ellipse cx="60" cy="80" rx="16" ry="11" fill="#f6e3cb"/>
      <ellipse cx="60" cy="74" rx="5.4" ry="4.2" fill="#3a3742"/>
      ${gulus(80)}
      <path d="M55 84 q5 9 10 0 z" fill="#ff8fa3"/>
      ${yanak(74, 0.7)}
      ${goz(47, 60)}${goz(73, 60)}`,
  },
  {
    ad: "Tilki",
    slug: "tilki",
    zemin: "#ffe7d6",
    cizim: `
      <path d="M30 50 L29 15 L55 34 Z" fill="#ef7a3d"/>
      <path d="M90 50 L91 15 L65 34 Z" fill="#ef7a3d"/>
      <path d="M32.5 40 L32 22 L46 33 Z" fill="#3a3742"/>
      <path d="M87.5 40 L88 22 L74 33 Z" fill="#3a3742"/>
      <ellipse cx="60" cy="68" rx="34" ry="31" fill="#ef7a3d"/>
      <ellipse cx="60" cy="82" rx="22" ry="15" fill="#fff4ec"/>
      <path d="M54 76 h12 l-6 6 z" fill="#3a3742"/>
      ${gulus(83, "#3a3742", 60, 11)}
      ${yanak(76, 0.55)}
      ${goz(47, 62)}${goz(73, 62)}`,
  },
  {
    ad: "Baykuş",
    slug: "baykus",
    zemin: "#e9e2ff",
    cizim: `
      <path d="M30 42 L38 20 L52 34 Z" fill="#7aa9c2"/>
      <path d="M90 42 L82 20 L68 34 Z" fill="#7aa9c2"/>
      <ellipse cx="60" cy="68" rx="34" ry="31" fill="#8fbcd4"/>
      <ellipse cx="60" cy="82" rx="21" ry="17" fill="#f6ead6"/>
      <circle cx="46" cy="60" r="14" fill="#f6ead6"/>
      <circle cx="74" cy="60" r="14" fill="#f6ead6"/>
      <path d="M54 74 h12 l-6 8 z" fill="#f0a23c"/>
      ${goz(46, 60, 6.4)}${goz(74, 60, 6.4)}
      <path d="M38 86 q22 12 44 0" fill="none" stroke="#d9c6a8" stroke-width="2.2" stroke-linecap="round"/>`,
  },
  {
    ad: "Panda",
    slug: "panda",
    zemin: "#eef0f5",
    cizim: `
      <circle cx="33" cy="40" r="12" fill="#2f2f36"/>
      <circle cx="87" cy="40" r="12" fill="#2f2f36"/>
      <ellipse cx="60" cy="68" rx="34" ry="31" fill="#ffffff" stroke="#dfe1e8" stroke-width="1.6"/>
      <ellipse cx="47" cy="63" rx="9.5" ry="12" fill="#2f2f36" transform="rotate(-16 47 63)"/>
      <ellipse cx="73" cy="63" rx="9.5" ry="12" fill="#2f2f36" transform="rotate(16 73 63)"/>
      ${goz(47, 62, 5)}${goz(73, 62, 5)}
      <ellipse cx="60" cy="78" rx="5.6" ry="4.4" fill="#2f2f36"/>
      ${gulus(83)}
      ${yanak(78, 0.35)}`,
  },
  {
    ad: "Kurbağa",
    slug: "kurbaga",
    zemin: "#e6f7d9",
    cizim: `
      <circle cx="42" cy="36" r="13" fill="#7cc45c"/>
      <circle cx="78" cy="36" r="13" fill="#7cc45c"/>
      <circle cx="42" cy="35" r="9" fill="#ffffff"/>
      <circle cx="78" cy="35" r="9" fill="#ffffff"/>
      ${goz(42, 35, 5)}${goz(78, 35, 5)}
      <ellipse cx="60" cy="72" rx="34" ry="30" fill="#7cc45c"/>
      <path d="M40 76 q20 16 40 0" fill="none" stroke="#3f6b2e" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="48" cy="66" r="1.6" fill="#3f6b2e"/>
      <circle cx="72" cy="66" r="1.6" fill="#3f6b2e"/>
      ${yanak(72, 0.75)}`,
  },
  {
    ad: "Penguen",
    slug: "penguen",
    zemin: "#e6f2f9",
    cizim: `
      <ellipse cx="60" cy="68" rx="33" ry="31" fill="#37414f"/>
      <ellipse cx="60" cy="76" rx="23" ry="22" fill="#fdfdff"/>
      <path d="M52 72 h16 l-8 9 z" fill="#f0a23c"/>
      ${goz(48, 58, 5.4)}${goz(72, 58, 5.4)}
      ${yanak(84, 0.4)}`,
  },
  {
    ad: "Koala",
    slug: "koala",
    zemin: "#eef1f6",
    cizim: `
      <circle cx="27" cy="58" r="16" fill="#b8c1cc"/>
      <circle cx="93" cy="58" r="16" fill="#b8c1cc"/>
      <circle cx="27" cy="58" r="9" fill="#e6dfe0"/>
      <circle cx="93" cy="58" r="9" fill="#e6dfe0"/>
      <ellipse cx="60" cy="68" rx="32" ry="30" fill="#b8c1cc"/>
      <ellipse cx="60" cy="80" rx="16" ry="12" fill="#d7dde4"/>
      <ellipse cx="60" cy="76" rx="9" ry="7.4" fill="#4a4a55"/>
      ${gulus(86, "#5a5560", 60, 10)}
      ${goz(45, 60, 4.6)}${goz(75, 60, 4.6)}`,
  },
  {
    ad: "Ayı",
    slug: "ayi",
    zemin: "#ffeedd",
    cizim: `
      <circle cx="33" cy="38" r="12" fill="#b5814f"/>
      <circle cx="87" cy="38" r="12" fill="#b5814f"/>
      <circle cx="33" cy="38" r="6" fill="#d9ab7d"/>
      <circle cx="87" cy="38" r="6" fill="#d9ab7d"/>
      <ellipse cx="60" cy="68" rx="34" ry="31" fill="#b5814f"/>
      <ellipse cx="60" cy="80" rx="17" ry="12" fill="#e8cba6"/>
      <ellipse cx="60" cy="75" rx="6" ry="4.6" fill="#3a3742"/>
      ${gulus(82)}
      ${yanak(76, 0.5)}
      ${goz(47, 61)}${goz(73, 61)}`,
  },
  {
    ad: "Tavşan",
    slug: "tavsan",
    zemin: "#fdeaf3",
    cizim: `
      <ellipse cx="48" cy="24" rx="8.5" ry="21" fill="#f7f3ef" stroke="#e6dfd8" stroke-width="1.4"/>
      <ellipse cx="72" cy="24" rx="8.5" ry="21" fill="#f7f3ef" stroke="#e6dfd8" stroke-width="1.4"/>
      <ellipse cx="48" cy="24" rx="4" ry="14" fill="#ffc2d6"/>
      <ellipse cx="72" cy="24" rx="4" ry="14" fill="#ffc2d6"/>
      <ellipse cx="60" cy="70" rx="33" ry="30" fill="#f7f3ef" stroke="#e6dfd8" stroke-width="1.6"/>
      <path d="M55 74 h10 l-5 5 z" fill="#f2879f"/>
      ${gulus(80, "#3a3742", 60, 10)}
      <rect x="55.5" y="83" width="3.6" height="5" rx="1.2" fill="#ffffff" stroke="#e6dfd8" stroke-width="0.9"/>
      <rect x="60.9" y="83" width="3.6" height="5" rx="1.2" fill="#ffffff" stroke="#e6dfd8" stroke-width="0.9"/>
      ${yanak(74, 0.9)}
      ${goz(47, 62)}${goz(73, 62)}`,
  },
  {
    ad: "Aslan",
    slug: "aslan",
    zemin: "#fff3d6",
    cizim: `
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
        .map((i) => {
          const a = (Math.PI * 2 * i) / 12;
          const x = (60 + Math.cos(a) * 33).toFixed(1);
          const y = (68 + Math.sin(a) * 32).toFixed(1);
          return `<circle cx="${x}" cy="${y}" r="13" fill="#d98f2e"/>`;
        })
        .join("")}
      <circle cx="60" cy="68" r="30" fill="#e8a33d"/>
      <ellipse cx="60" cy="68" rx="26" ry="24" fill="#f7c86a"/>
      <ellipse cx="60" cy="80" rx="16" ry="11" fill="#fdefd6"/>
      <path d="M55 75 h10 l-5 5.5 z" fill="#8a5a2b"/>
      ${gulus(82, "#8a5a2b")}
      <circle cx="44" cy="76" r="1.3" fill="#8a5a2b"/>
      <circle cx="76" cy="76" r="1.3" fill="#8a5a2b"/>
      ${goz(47, 61)}${goz(73, 61)}`,
  },
  {
    ad: "Fil",
    slug: "fil",
    zemin: "#e9eef7",
    cizim: `
      <ellipse cx="24" cy="66" rx="14" ry="19" fill="#8b99b0"/>
      <ellipse cx="96" cy="66" rx="14" ry="19" fill="#8b99b0"/>
      <ellipse cx="60" cy="66" rx="33" ry="31" fill="#9aa7bd"/>
      <path d="M60 86 q-2 12 -9 17" fill="none" stroke="#9aa7bd" stroke-width="13" stroke-linecap="round"/>
      <path d="M60 86 q-2 12 -9 17" fill="none" stroke="#8b99b0" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
      ${goz(46, 60)}${goz(74, 60)}
      ${yanak(72, 0.55)}`,
  },
];

// --- Yazım -----------------------------------------------------------------
mkdirSync(HEDEF, { recursive: true });
let sayi = 0;
for (const h of HAYVANLAR) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="${h.ad} avatarı"><circle cx="60" cy="60" r="60" fill="${h.zemin}"/>${h.cizim}</svg>`;
  writeFileSync(join(HEDEF, `${h.slug}.svg`), svg.trim() + "\n", "utf8");
  sayi++;
}
console.log(`${sayi} avatar yazıldı: ${HEDEF}`);
