// ============================================================================
// HAZIR AVATAR ÜRETİCİ — düz (flat) vektör portreler
// ----------------------------------------------------------------------------
// Okuyucu isteği: "profiller bunlara benzesin" (renkli daire içinde sade,
// çizgi film değil illüstrasyon portreler; insan + birkaç karakter).
// Hepsi elle yazılmış SVG: telif yok, indirme yok, her cihazda aynı görünür,
// 96x96'da net kalır (vektör).
//
// Eski soyut avatarlar SİLİNMEZ: daha önce seçmiş okuyucuların profili bozulmasın.
//
// Çıktı: site/public/avatar/<slug>.svg
// Kullanım: node scripts/avatar-uret.mjs
// ============================================================================
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = join(dirname(fileURLToPath(import.meta.url)), "..", "site", "public", "avatar");
const BOY = 96;
const CIZGI = "#24262f";

/** Yuvarlak çerçeve: daire kırpma + içeride ince açık halka. */
function cerceve(slug, bg, icerik) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOY} ${BOY}" width="${BOY}" height="${BOY}" role="img" aria-hidden="true">
<defs><clipPath id="k-${slug}"><circle cx="48" cy="48" r="48"/></clipPath></defs>
<g clip-path="url(#k-${slug})">
<rect width="${BOY}" height="${BOY}" fill="${bg}"/>
${icerik}
</g>
<circle cx="48" cy="48" r="46.6" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1.2"/>
</svg>
`;
}

/** Gövde + boyun + kafa + yüz. Saçlar sacArka (kafanın arkası) ve sacOn ile. */
function insan(o) {
  const ten = o.ten || "#f2c6a0";
  const tenKoyu = o.tenKoyu || "#e0ab84";
  return `
<path d="M13 98c2-17 15.5-27 35-27s33 10 35 27z" fill="${o.ust || "#ffffff"}"/>
${o.sacArka || ""}
<path d="M40 62h16v10c0 5-16 5-16 0z" fill="${tenKoyu}"/>
<ellipse cx="48" cy="45" rx="17" ry="19" fill="${ten}"/>
<circle cx="41.5" cy="45" r="1.7" fill="${CIZGI}"/>
<circle cx="54.5" cy="45" r="1.7" fill="${CIZGI}"/>
<path d="M44.6 53.2q3.4 2.6 6.8 0" fill="none" stroke="${CIZGI}" stroke-width="1.5" stroke-linecap="round"/>
${o.ekstra || ""}
${o.sacOn || ""}
${o.kulak || ""}`;
}

/** Kısa/erkek saç üstü. */
function sacKisa(renk) {
  return `<path d="M31 41c.6-12 8-19 17-19s16.4 7 17 19c-3.2-7-9-10-17-10s-13.8 3-17 10z" fill="${renk}"/>`;
}

/** Uzun saç: omuzlara dökülen arka kütle + üst kat. */
function sacUzun(renk) {
  return {
    sacArka: `<path d="M27 46c0-15 9-24 21-24s21 9 21 24v26c0 6-6 7-9 2V47H36v27c-3 5-9 4-9-2z" fill="${renk}"/>`,
    sacOn: `<path d="M31 40c2.6-9 9-14 17-14s14.4 5 17 14c-5-5.2-10.4-7-17-7s-12 1.8-17 7z" fill="${renk}"/>`,
  };
}

/** Küt (bob) saç. */
function sacBob(renk) {
  return {
    sacArka: `<path d="M28.5 47c0-15 8.5-24 19.5-24s19.5 9 19.5 24v9c0 3-2.5 4-4 2V47H32.5v11c-1.5 2-4 1-4-2z" fill="${renk}"/>`,
    sacOn: `<path d="M31 40c2.4-9 9-14 17-14s14.6 5 17 14c-5-5-10.4-7-17-7s-12 2-17 7z" fill="${renk}"/>`,
  };
}

const AVATARLAR = [
  // ---------------- İNSAN PORTRELERİ ----------------
  {
    slug: "ada",
    bg: "#e4573d",
    renk: "#e4573d",
    icerik: insan({
      ust: "#ffffff",
      sac: "#e4573d",
      ...sacUzun("#2b2b36"),
      ekstra: `<circle cx="36.5" cy="49" r="2.6" fill="#e88a76" fill-opacity=".55"/>
<circle cx="59.5" cy="49" r="2.6" fill="#e88a76" fill-opacity=".55"/>`,
    }),
  },
  {
    slug: "mert",
    bg: "#6a4fc1",
    renk: "#6a4fc1",
    icerik: insan({
      ust: "#ffffff",
      ten: "#e8b389",
      tenKoyu: "#d29a6f",
      sacOn: sacKisa("#4a3020"),
      ekstra: `<path d="M32 47h32" stroke="#4a3020" stroke-opacity=".2" stroke-width="0"/>`,
    }),
  },
  {
    slug: "zeynep",
    bg: "#1c8c82",
    renk: "#1c8c82",
    icerik: insan({
      ust: "#26364d",
      ten: "#d9a273",
      tenKoyu: "#c58c5e",
      ...sacBob("#23232b"),
      kulak: `<circle cx="30.5" cy="49" r="2.2" fill="#e8c25a"/>`,
    }),
  },
  {
    slug: "kerem",
    bg: "#e8a62b",
    renk: "#e8a62b",
    icerik: insan({
      ust: "#ffffff",
      sacOn: `<g fill="#d9a441">
<circle cx="34" cy="38" r="5"/><circle cx="41" cy="31" r="5.4"/><circle cx="49" cy="28" r="5.6"/>
<circle cx="57" cy="31" r="5.2"/><circle cx="63" cy="38" r="4.6"/>
<path d="M32 40c3-8 9-12 16-12s13 4 16 12c-5-4-10-6-16-6s-11 2-16 6z"/></g>`,
    }),
  },
  {
    slug: "elif",
    bg: "#d9364b",
    renk: "#d9364b",
    icerik: insan({
      ust: "#ffffff",
      sac: "#d9b45a",
      ...sacBob("#d9b45a"),
      ekstra: `<circle cx="36.5" cy="49.5" r="2.4" fill="#ef8a7a" fill-opacity=".5"/>
<circle cx="59.5" cy="49.5" r="2.4" fill="#ef8a7a" fill-opacity=".5"/>`,
    }),
  },
  {
    slug: "deniz",
    bg: "#d9d3ee",
    renk: "#8a6fd1",
    icerik: insan({
      ust: "#3f7d63",
      sac: "#7a5bb5",
      ...sacUzun("#7a5bb5"),
      ekstra: `<circle cx="36.5" cy="49" r="2.4" fill="#c99ad6" fill-opacity=".6"/>
<circle cx="59.5" cy="49" r="2.4" fill="#c99ad6" fill-opacity=".6"/>`,
    }),
  },
  {
    slug: "ece",
    bg: "#cfe0ea",
    renk: "#4b83a8",
    icerik: insan({
      ust: "#c0392f",
      ten: "#d6a075",
      tenKoyu: "#c08a5e",
      sacArka: `<path d="M29 45c0-14 8.4-23 19-23s19 9 19 23v4H29z" fill="#2a221e"/>`,
      sacOn: `<circle cx="48" cy="20.5" r="7.4" fill="#2a221e"/>
<path d="M31 40c2.6-9 9-14 17-14s14.4 5 17 14c-5-5.2-10.4-7-17-7s-12 1.8-17 7z" fill="#2a221e"/>`,
    }),
  },
  {
    slug: "bora",
    bg: "#1f6f54",
    renk: "#1f6f54",
    icerik: insan({
      ust: "#ffffff",
      ten: "#8a5a3b",
      tenKoyu: "#754a2f",
      sacOn: sacKisa("#141419"),
      ekstra: `<path d="M32 44c2.6-10 8.6-15 16-15s13.4 5 16 15" fill="none" stroke="#141419" stroke-width="0"/>`,
    }),
  },
  {
    slug: "selin",
    bg: "#e2743a",
    renk: "#e2743a",
    icerik: insan({
      ust: "#e8c25a",
      sac: "#9a4a2c",
      sacArka: `<path d="M27 46c0-15 9-24 21-24s21 9 21 24v8c0 4-3 5-5 2V46H32v10c-2 3-5 2-5-2z" fill="#9a4a2c"/>
<path d="M66 40c7 3 9 10 8 19-2 3-5 2-6-1-1-6-2-11-5-14z" fill="#9a4a2c"/>`,
      sacOn: `<path d="M31 40c2.6-9 9-14 17-14s14.4 5 17 14c-5-5.2-10.4-7-17-7s-12 1.8-17 7z" fill="#9a4a2c"/>`,
      ekstra: `<circle cx="59.8" cy="53" r="1.4" fill="#e8c25a"/>
<circle cx="36.4" cy="49.4" r="2.4" fill="#f0a07a" fill-opacity=".55"/>`,
    }),
  },

  // ---------------- KARAKTERLER ----------------
  {
    slug: "tavsan",
    bg: "#e4573d",
    renk: "#e4573d",
    icerik: `
<ellipse cx="38" cy="27" rx="6.2" ry="17" fill="#ffffff" transform="rotate(-8 38 27)"/>
<ellipse cx="58" cy="27" rx="6.2" ry="17" fill="#ffffff" transform="rotate(8 58 27)"/>
<ellipse cx="38.4" cy="28" rx="2.6" ry="11" fill="#f0a9a0" transform="rotate(-8 38.4 28)"/>
<ellipse cx="57.6" cy="28" rx="2.6" ry="11" fill="#f0a9a0" transform="rotate(8 57.6 28)"/>
<path d="M17 98c2-15 14-23 31-23s29 8 31 23z" fill="#2f3550"/>
<path d="M41 76h14l-7 14z" fill="#ffffff"/>
<ellipse cx="48" cy="52" rx="17" ry="16" fill="#ffffff"/>
<circle cx="41" cy="50" r="1.9" fill="${CIZGI}"/>
<circle cx="55" cy="50" r="1.9" fill="${CIZGI}"/>
<path d="M45.2 56.5h5.6l-2.8 2.6z" fill="#eb8f7f"/>
<path d="M48 59.4v2.2M45.4 62.4q2.6 2 5.2 0" fill="none" stroke="${CIZGI}" stroke-width="1.3" stroke-linecap="round"/>
<path d="M31 56h-8M31 59.5h-8M65 56h8M65 59.5h8" stroke="${CIZGI}" stroke-opacity=".35" stroke-width="1.1" stroke-linecap="round"/>`,
  },
  {
    slug: "panda",
    bg: "#e8a62b",
    renk: "#e8a62b",
    icerik: `
<circle cx="32" cy="33" r="9" fill="#22242c"/>
<circle cx="64" cy="33" r="9" fill="#22242c"/>
<circle cx="48" cy="50" r="21" fill="#ffffff"/>
<ellipse cx="39" cy="46" rx="6" ry="7" fill="#22242c" transform="rotate(-16 39 46)"/>
<ellipse cx="57" cy="46" rx="6" ry="7" fill="#22242c" transform="rotate(16 57 46)"/>
<circle cx="40" cy="45.4" r="2" fill="#ffffff"/>
<circle cx="56" cy="45.4" r="2" fill="#ffffff"/>
<path d="M45 56.6q3 2.6 6 0" fill="none" stroke="${CIZGI}" stroke-width="1.6" stroke-linecap="round"/>
<path d="M48 52.6l-1.8 2.2h3.6z" fill="${CIZGI}"/>`,
  },
  {
    slug: "astronot",
    bg: "#232a3d",
    renk: "#3d5a9e",
    icerik: `
<g fill="#ffffff">
<path d="M18 24l1.1 3.2L22 28.4l-2.9 1.2L18 33l-1.1-3.4L14 28.4l2.9-1.2z" opacity=".9"/>
<path d="M78 20l.8 2.3 2.2.8-2.2.9-.8 2.3-.8-2.3-2.2-.9 2.2-.8z" opacity=".65"/>
<path d="M74 62l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" opacity=".45"/>
<circle cx="24" cy="60" r="1.2" opacity=".6"/>
<circle cx="69" cy="43" r="1" opacity=".5"/>
</g>
<path d="M20 98c2-13 13-20 28-20s26 7 28 20z" fill="#e9edf5"/>
<path d="M40 78h16v8H40z" fill="#c9d2e0"/>
<path d="M44 80h8v6h-8z" fill="#e88a3d"/>
<circle cx="48" cy="46" r="22" fill="#f2f5fa"/>
<circle cx="48" cy="46" r="22" fill="none" stroke="#c3ccda" stroke-width="1.6"/>
<ellipse cx="48" cy="48" rx="16.5" ry="13.5" fill="#2f4a74"/>
<path d="M38 43c4-3 10-4 15-2" stroke="#7fa3d6" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>
<path d="M35 62c8 4 18 4 26 0" stroke="#c3ccda" stroke-width="2" fill="none"/>`,
  },
  {
    slug: "robot",
    bg: "#232a3d",
    renk: "#3f8c76",
    icerik: `
<g fill="#ffffff">
<path d="M20 26l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" opacity=".8"/>
<path d="M76 66l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8z" opacity=".55"/>
<circle cx="72" cy="30" r="1.2" opacity=".5"/>
<circle cx="26" cy="68" r="1" opacity=".45"/>
</g>
<path d="M28 98c1.6-12 9.4-18 20-18s18.4 6 20 18z" fill="#39405a"/>
<rect x="36" y="74" width="24" height="8" rx="3" fill="#8fa3bd"/>
<rect x="26" y="32" width="44" height="34" rx="12" fill="#dbe4ee"/>
<rect x="31" y="38" width="34" height="22" rx="8" fill="#2b3550"/>
<circle cx="41" cy="48" r="3.4" fill="#5fd6c4"/>
<circle cx="55" cy="48" r="3.4" fill="#5fd6c4"/>
<circle cx="42.2" cy="46.8" r="1.1" fill="#ffffff" opacity=".9"/>
<circle cx="56.2" cy="46.8" r="1.1" fill="#ffffff" opacity=".9"/>
<path d="M44 55h8" stroke="#5fd6c4" stroke-width="2" stroke-linecap="round"/>
<path d="M48 32v-6" stroke="#8fa3bd" stroke-width="3" stroke-linecap="round"/>
<circle cx="48" cy="23" r="3.4" fill="#e8a62b"/>
<rect x="20" y="46" width="5" height="12" rx="2.5" fill="#8fa3bd"/>
<rect x="71" y="46" width="5" height="12" rx="2.5" fill="#8fa3bd"/>`,
  },
  {
    slug: "korsan",
    bg: "#232a3d",
    renk: "#d9364b",
    icerik: `
<g fill="#ffffff">
<path d="M22 30l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" opacity=".75"/>
<path d="M74 24l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" opacity=".55"/>
<circle cx="70" cy="58" r="1.2" opacity=".5"/>
</g>
<path d="M16 98c2-15 14.5-23 32-23s30 8 32 23z" fill="#8c2f36"/>
<path d="M40 76h16l-8 14z" fill="#f0d7b8"/>
<ellipse cx="48" cy="50" rx="17" ry="18" fill="#e3b184"/>
<path d="M30 44c1-12 8.5-19 18-19s17 7 18 19c-4-6-10.5-9-18-9s-14 3-18 9z" fill="#3a2a22"/>
<path d="M29 41c1.4-9 8-14 19-14s17.6 5 19 14l-3 1c-2-6-7.6-9-16-9s-14 3-16 9z" fill="#c8383f"/>
<path d="M66 43c4-1 6 1 6 4 0 3-2 5-5 4z" fill="#c8383f"/>
<circle cx="41.4" cy="50" r="1.8" fill="${CIZGI}"/>
<circle cx="54.6" cy="50" r="1.8" fill="${CIZGI}"/>
<path d="M44.6 58q3.4 2.4 6.8 0" fill="none" stroke="${CIZGI}" stroke-width="1.5" stroke-linecap="round"/>
<circle cx="67" cy="55" r="1.8" fill="#e8c25a"/>
<path d="M31 47c3-2 6-2 8 0" stroke="#3a2a22" stroke-width="1.4" fill="none"/>`,
  },
  {
    slug: "buyucu",
    bg: "#232a3d",
    renk: "#7a5bb5",
    icerik: `
<g fill="#ffffff">
<path d="M20 26l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" opacity=".8"/>
<path d="M76 30l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8z" opacity=".55"/>
<circle cx="70" cy="62" r="1.2" opacity=".5"/>
</g>
<path d="M14 98c2-16 16-24 34-24s32 8 34 24z" fill="#4b3a75"/>
<path d="M40 72h16v8H40z" fill="#e8c9a6"/>
<ellipse cx="48" cy="50" rx="16" ry="17" fill="#eccfae"/>
<path d="M34 44c1-10 6-16 14-16s13 6 14 16c-4-5-8-7-14-7s-10 2-14 7z" fill="#d8d8e0"/>
<path d="M31 84c2-10 8-16 17-16s15 6 17 16c-3 4-7 6-17 6s-14-2-17-6z" fill="#f2f2f5"/>
<path d="M43 33 48 8l5 25z" fill="#5c4a8c"/>
<path d="M28 37c6-4 34-4 40 0-6 4-34 4-40 0z" fill="#6a58a0"/>
<circle cx="48" cy="11" r="2.4" fill="#e8c25a"/>
<circle cx="41.4" cy="48" r="1.8" fill="${CIZGI}"/>
<circle cx="54.6" cy="48" r="1.8" fill="${CIZGI}"/>
<path d="M44.4 55q3.6 2.4 7.2 0" fill="none" stroke="${CIZGI}" stroke-width="1.5" stroke-linecap="round"/>
<path d="M42 58c2 8 10 8 12 0" fill="#f2f2f5"/>`,
  },
];

await mkdir(KOK, { recursive: true });

for (const a of AVATARLAR) {
  await writeFile(join(KOK, `${a.slug}.svg`), cerceve(a.slug, a.bg, a.icerik), "utf8");
}

const dosyalar = (await readdir(KOK)).filter((d) => d.endsWith(".svg")).sort();
console.log(`${AVATARLAR.length} yeni avatar yazıldı: ${KOK}`);
console.log("Yeni dosyalar:", AVATARLAR.map((a) => `${a.slug}.svg`).join(", "));
console.log(`Klasördeki toplam avatar: ${dosyalar.length}`);
