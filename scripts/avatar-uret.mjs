// ============================================================================
// KARAKTER AVATAR ÜRETİCİ — düz (flat) vektör karakterler, 2. sürüm
// ----------------------------------------------------------------------------
// İnsan portreleri artık DiceBear Lorelei setinden geliyor (avatar-lorelei.mjs).
// Bu betik yalnızca elle çizilmiş karakterleri üretir.
// Karakterlerde hacimli biçimler, yüz hatları, gölge ve zemin derinliği var.
// Hepsi elle yazılmış SVG: telif yok, indirme yok, her cihazda aynı görünür.
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
const CIZGI = "#2b2d38";
const AGIZ = "#9c4f4b";

/** İki rengi karıştırır (0 = a, 1 = b). */
function karis(a, b, oran) {
  const o = Math.max(0, Math.min(1, oran));
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const y = (x, z) => Math.round(x + (z - x) * o).toString(16).padStart(2, "0");
  return `#${y(r1, r2)}${y(g1, g2)}${y(b1, b2)}`;
}
const acik = (h, o = 0.16) => karis(h, "#ffffff", o);
const koyu = (h, o = 0.18) => karis(h, "#000000", o);

/** Yuvarlak çerçeve: yumuşak dikey zemin + üstte ışık + altta gölge + ince halka. */
function cerceve(slug, bg, icerik) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOY} ${BOY}" width="${BOY}" height="${BOY}" role="img" aria-hidden="true">
<defs>
<clipPath id="k-${slug}"><circle cx="48" cy="48" r="48"/></clipPath>
<linearGradient id="z-${slug}" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${acik(bg, 0.14)}"/>
<stop offset="1" stop-color="${koyu(bg, 0.16)}"/>
</linearGradient>
</defs>
<g clip-path="url(#k-${slug})">
<rect width="${BOY}" height="${BOY}" fill="url(#z-${slug})"/>
<circle cx="28" cy="16" r="38" fill="#ffffff" fill-opacity=".06"/>
<path d="M0 80c13 9 29 13 48 13s35-4 48-13v16H0z" fill="#000000" fill-opacity=".07"/>
${icerik}
</g>
<circle cx="48" cy="48" r="46.6" fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="1.2"/>
</svg>
`;
}

/** Gövde + yaka + boyun + kulak + kafa + yüz. Saçlar sacArka / sacOn ile. */
function insan(o) {
  const ten = o.ten || "#f2c6a0";
  const tenKoyu = koyu(ten, 0.16);
  const tenAcik = acik(ten, 0.14);
  const ust = o.ust || "#ffffff";
  const sac = o.sac || "#33241d";
  const sacKoyuRenk = koyu(sac, 0.3);
  const sacAcikRenk = acik(sac, 0.22);
  const kas = o.kas || sacKoyuRenk;
  return `
<path d="M9 97c2.6-16.5 17-25.5 39-25.5s36.4 9 39 25.5z" fill="${ust}"/>
<path d="M39 72c1.6 5.6 4.8 8.6 9 8.6s7.4-3 9-8.6" fill="none" stroke="${koyu(ust, 0.2)}" stroke-width="2" stroke-linecap="round"/>
${o.sacArka || ""}
<path d="M41 56h14v12.5c0 4-14 4-14 0z" fill="${tenKoyu}"/>
<circle cx="31.9" cy="46.4" r="3.5" fill="${ten}"/>
<circle cx="64.1" cy="46.4" r="3.5" fill="${ten}"/>
<circle cx="32.5" cy="46.8" r="1.5" fill="${tenKoyu}" fill-opacity=".55"/>
<circle cx="63.5" cy="46.8" r="1.5" fill="${tenKoyu}" fill-opacity=".55"/>
<ellipse cx="48" cy="44" rx="16.6" ry="18.6" fill="${ten}"/>
<ellipse cx="48" cy="58.6" rx="9.4" ry="3.2" fill="${tenKoyu}" fill-opacity=".45"/>
<path d="M37.8 38.6q3.3-1.7 6.4-.4" fill="none" stroke="${kas}" stroke-width="1.9" stroke-linecap="round"/>
<path d="M58.2 38.6q-3.3-1.7-6.4-.4" fill="none" stroke="${kas}" stroke-width="1.9" stroke-linecap="round"/>
<ellipse cx="41.6" cy="44.8" rx="2" ry="2.4" fill="${CIZGI}"/>
<ellipse cx="54.4" cy="44.8" rx="2" ry="2.4" fill="${CIZGI}"/>
<circle cx="42.3" cy="43.8" r=".7" fill="#ffffff"/>
<circle cx="55.1" cy="43.8" r=".7" fill="#ffffff"/>
<path d="M48 47.6v3.2" stroke="${tenKoyu}" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".85"/>
<path d="M44.8 55.2q3.2 3 6.4 0" fill="none" stroke="${AGIZ}" stroke-width="1.8" stroke-linecap="round"/>
<path d="M45.6 56.4q2.4 1.7 4.8 0" fill="#d98b83" fill-opacity=".55"/>
<ellipse cx="36.6" cy="50.4" rx="3.2" ry="2" fill="#e88a76" fill-opacity=".32"/>
<ellipse cx="59.4" cy="50.4" rx="3.2" ry="2" fill="#e88a76" fill-opacity=".32"/>
${o.ekstra || ""}
${o.sacOn({ sac, sacKoyu: sacKoyuRenk, sacAcik: sacAcikRenk, ten, tenAcik })}
${o.kulak || ""}`;
}

// ---------------------------------------------------------------------------
// SAÇ MODELLERİ — hepsi kafa üstünü kaplayan dolgun bir kat + perçem içerir.
// ---------------------------------------------------------------------------

/** Kısa saç: yandan ayrık, hacimli üst + favoriler. */
function sacKisa(sac, sacKoyuR, sacAcikR) {
  return `
<path d="M31.2 48.8C30 33.6 37.6 24 48 24c10.4 0 18 9.6 16.8 24.8-1.4-6.6-3.4-11-6-14-2.8 3-6.6 4.4-10.8 4.4-4.2 0-8-1.4-10.8-4.4-2.6 3-4.6 7.4-6 14z" fill="${sac}"/>
<path d="M35.2 31.8c3.6-3.8 7.8-5.6 12.8-5.6 4 0 7.4 1.2 10.2 3.6" fill="none" stroke="${sacAcikR}" stroke-width="1.5" stroke-linecap="round" opacity=".5"/>
<path d="M31.6 44.6l1.5-2.8 1.5 5.8-1.9.5z" fill="${sac}"/>
<path d="M64.4 44.6l-1.5-2.8-1.5 5.8 1.9.5z" fill="${sac}"/>
<path d="M39 33.4c2.8-2 5.8-2.8 9-2.4" fill="none" stroke="${sacKoyuR}" stroke-width="1.2" stroke-linecap="round" opacity=".45"/>`;
}

/** Uzun saç: omuzlara dökülen arka kütle + ortadan ayrık perçem. */
function sacUzun(sac, sacKoyuR, sacAcikR) {
  return {
    sacArka: `<path d="M26.4 46c0-15.2 9.4-24.4 21.6-24.4S69.6 30.8 69.6 46v24c0 6.6-6.6 8-9.6 2.4V47.4H36v25c-3 5.6-9.6 4.2-9.6-2.4z" fill="${sac}"/>
<path d="M30 60c-.6 8 .8 14 3.4 18M66 60c.6 8-.8 14-3.4 18" stroke="${sacKoyuR}" stroke-width="1.4" fill="none" opacity=".35" stroke-linecap="round"/>`,
    sacOn: ({
      sac: s,
      sacKoyu: k,
      sacAcik: a,
    }) => `
<path d="M31.2 48.8C30 33.6 37.6 24 48 24c10.4 0 18 9.6 16.8 24.8-1.4-6.6-3.4-11-6-14-2.6 2.8-6.2 4.2-10.8 4.2s-8.2-1.4-10.8-4.2c-2.6 3-4.6 7.4-6 14z" fill="${s}"/>
<path d="M48 24v7.4" stroke="${k}" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>
<path d="M35.4 31.6c3.4-3.4 7.4-5.2 12-5.2" fill="none" stroke="${a}" stroke-width="1.5" stroke-linecap="round" opacity=".45"/>`,
  };
}

/** Küt (bob) saç: çene hizasında biten dolgun model. */
function sacBob(sac, sacKoyuR) {
  return {
    sacArka: `<path d="M27.6 46c0-14.4 9-23.4 20.4-23.4S68.4 31.6 68.4 46v11.6c0 4.6-4.2 5.6-6.4 2.2V47.2H34v12.6c-2.2 3.4-6.4 2.4-6.4-2.2z" fill="${sac}"/>
<path d="M34 58.6c3.6 2.4 8.6 3.6 14 3.6s10.4-1.2 14-3.6" fill="none" stroke="${sacKoyuR}" stroke-width="1.2" opacity=".35"/>`,
    sacOn: ({ sac: s, sacAcik: a }) => `
<path d="M31.2 48.8C30 33.6 37.6 24 48 24c10.4 0 18 9.6 16.8 24.8-1.4-6.6-3.4-11-6-14-2.6 2.8-6.2 4.2-10.8 4.2s-8.2-1.4-10.8-4.2c-2.6 3-4.6 7.4-6 14z" fill="${s}"/>
<path d="M35.6 31.4c3.4-3.2 7.4-4.8 12-4.8" fill="none" stroke="${a}" stroke-width="1.6" stroke-linecap="round" opacity=".45"/>`,
  };
}

/** Topuz: tepede toplanmış saç + kısa perçem. */
function sacTopuz(sac, sacKoyuR, sacAcikR) {
  return `
<circle cx="48" cy="20.4" r="7.6" fill="${sac}"/>
<circle cx="48" cy="20.4" r="4.6" fill="${sacKoyuR}" fill-opacity=".25"/>
<path d="M31.4 48.6C30.2 34 37.6 24.6 48 24.6s17.8 9.4 16.6 24c-1.6-6.4-3.8-10.6-6.6-13.4-2.4 2.6-5.6 4-10 4s-7.6-1.4-10-4c-2.8 2.8-5 7-6.6 13.4z" fill="${sac}"/>
<path d="M33.4 33.6c3.2-4 7.4-6 12.4-6" fill="none" stroke="${sacAcikR}" stroke-width="1.6" stroke-linecap="round" opacity=".45"/>
<path d="M31.8 44.4l1.4-2.6 1.4 5.6-1.8.5z" fill="${sac}"/>
<path d="M64.2 44.4l-1.4-2.6-1.4 5.6 1.8.5z" fill="${sac}"/>`;
}

/** Kıvırcık: bukle kümeleri + kısa üst kat. */
function sacKivircik(sac, sacKoyuR, sacAcikR) {
  return `
<g fill="${sac}">
<circle cx="34.5" cy="36" r="5.4"/><circle cx="41" cy="29.6" r="5.8"/><circle cx="48" cy="27.4" r="6"/>
<circle cx="55" cy="29.6" r="5.8"/><circle cx="61.5" cy="36" r="5.4"/><circle cx="64.4" cy="43.4" r="4.6"/>
<circle cx="31.6" cy="43.4" r="4.6"/><circle cx="37.6" cy="33" r="4.6"/>
<circle cx="58.4" cy="33" r="4.6"/><circle cx="48" cy="34.6" r="6.2"/>
</g>
<path d="M37 34c3-3.4 6.8-5 11.4-5 4.4 0 8 1.4 10.8 4.2" fill="none" stroke="${sacAcikR}" stroke-width="1.6" stroke-linecap="round" opacity=".5"/>
<path d="M39 31.6c3.2-2.2 6.4-3.2 9.8-2.8" fill="none" stroke="${sacKoyuR}" stroke-width="1.2" stroke-linecap="round" opacity=".35"/>`;
}

/** At kuyruğu: yanda toplanmış uzun saç. */
function sacKuyruk(sac, sacKoyuR, sacAcikR) {
  return {
    sacArka: `<path d="M66 38c7.6 2.6 10.4 10 8.6 20.4-1.4 7.4-5 10.6-8.4 9-3-1.4-2.4-5.2-.6-9.4 2-4.8 2.4-9.6 1-14.2z" fill="${sac}"/>
<path d="M68.6 51c1.6 4.4 1.8 8.6.6 12.6" fill="none" stroke="${sacKoyuR}" stroke-width="1.4" stroke-linecap="round" opacity=".4"/>`,
    sacOn: ({ sac: s, sacAcik: a }) => `
<path d="M31.2 48.8C30 33.6 37.6 24 48 24c10.4 0 18 9.6 16.8 24.8-1.4-6.6-3.4-11-6-14-2.6 2.8-6.2 4.2-10.8 4.2s-8.2-1.4-10.8-4.2c-2.6 3-4.6 7.4-6 14z" fill="${s}"/>
<path d="M63 42c1.6-4.6 2-8.6 1.2-12" fill="none" stroke="${s}" stroke-width="6" stroke-linecap="round"/>
<path d="M35.6 31.4c3.4-3.2 7.4-4.8 12-4.8" fill="none" stroke="${a}" stroke-width="1.6" stroke-linecap="round" opacity=".45"/>`,
  };
}

/** Dalgalı uzun: yandan savrulan dalga + uzun kütle. */
function sacDalga(sac, sacKoyuR, sacAcikR) {
  return {
    sacArka: `<path d="M26.4 46c0-15.2 9.4-24.4 21.6-24.4S69.6 30.8 69.6 46v20c0 7-6.6 9-9.6 3.4V47.4H36v22c-3 5.6-9.6 3.6-9.6-3.4z" fill="${sac}"/>
<path d="M29.6 58c-1 9 .6 15.4 3.8 19.6M66.4 58c1 9-.6 15.4-3.8 19.6" stroke="${sacKoyuR}" stroke-width="1.6" fill="none" opacity=".35" stroke-linecap="round"/>`,
    sacOn: ({ sac: s, sacAcik: a, sacKoyu: k }) => `
<path d="M31 49C29.6 33 37.4 23.4 48 23.4c10.6 0 18.4 9.6 17 25.6-1.6-7-4-11.8-6.8-14.8-3.2 3.4-7.2 5-12 5-3.8 0-7.2-1-10-3-2.6 3.2-4.4 7.8-5.2 12.8z" fill="${s}"/>
<path d="M32.4 43.4c3.4-7.4 9.6-11.6 17.4-11.2" fill="none" stroke="${a}" stroke-width="2.2" stroke-linecap="round" opacity=".55"/>
<path d="M36 31.4c3.4-3 7.4-4.6 12-4.6" fill="none" stroke="${k}" stroke-width="1.2" stroke-linecap="round" opacity=".3"/>`,
  };
}

const AVATARLAR = [

// ---------------- KARAKTERLER ----------------
  {
    slug: "tavsan",
    bg: "#e4573d",
    renk: "#e4573d",
    icerik: `
<ellipse cx="37.6" cy="28" rx="6.4" ry="17.4" fill="#ffffff" transform="rotate(-8 37.6 28)"/>
<ellipse cx="58.4" cy="28" rx="6.4" ry="17.4" fill="#ffffff" transform="rotate(8 58.4 28)"/>
<ellipse cx="37.8" cy="29" rx="2.9" ry="12.4" fill="#f2b3aa" transform="rotate(-8 37.8 29)"/>
<ellipse cx="58.2" cy="29" rx="2.9" ry="12.4" fill="#f2b3aa" transform="rotate(8 58.2 29)"/>
<path d="M16 97c2.4-15 14.6-23 32-23s29.6 8 32 23z" fill="#2f3550"/>
<path d="M39 75h18l-9 14z" fill="#ffffff"/>
<path d="M42.4 78h11.2l-5.6 8z" fill="#e4573d" fill-opacity=".55"/>
<ellipse cx="48" cy="51" rx="17.4" ry="16.6" fill="#ffffff"/>
<ellipse cx="48" cy="59" rx="10" ry="5" fill="#eceff5"/>
<circle cx="41.2" cy="49" r="2" fill="${CIZGI}"/>
<circle cx="54.8" cy="49" r="2" fill="${CIZGI}"/>
<circle cx="41.9" cy="48.2" r=".7" fill="#ffffff"/>
<circle cx="55.5" cy="48.2" r=".7" fill="#ffffff"/>
<path d="M45.4 55.6h5.2l-2.6 2.6z" fill="#eb8f7f"/>
<path d="M48 58.2v2.2" stroke="${CIZGI}" stroke-width="1.3" stroke-linecap="round"/>
<path d="M45.6 61.6q2.4 1.8 4.8 0" fill="none" stroke="${CIZGI}" stroke-width="1.3" stroke-linecap="round"/>
<path d="M40 60.8h-3.4M40 63.2h-3.4M56 60.8h3.4M56 63.2h3.4" stroke="${CIZGI}" stroke-opacity=".4" stroke-width="1.1" stroke-linecap="round"/>
<g fill="#ffffff" fill-opacity=".7">
<path d="M76 30l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>
<path d="M22 64l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6z"/>
</g>`,
  },
  {
    slug: "panda",
    bg: "#e8a62b",
    renk: "#e8a62b",
    icerik: `
<circle cx="31.6" cy="32.4" r="9.4" fill="#232630"/>
<circle cx="64.4" cy="32.4" r="9.4" fill="#232630"/>
<circle cx="31.6" cy="32.4" r="5" fill="#3a3e4c"/>
<circle cx="64.4" cy="32.4" r="5" fill="#3a3e4c"/>
<circle cx="48" cy="50" r="21.4" fill="#ffffff"/>
<ellipse cx="39" cy="46" rx="6.4" ry="7.4" fill="#232630" transform="rotate(-16 39 46)"/>
<ellipse cx="57" cy="46" rx="6.4" ry="7.4" fill="#232630" transform="rotate(16 57 46)"/>
<circle cx="40.2" cy="45.2" r="2.2" fill="#ffffff"/>
<circle cx="55.8" cy="45.2" r="2.2" fill="#ffffff"/>
<circle cx="40.8" cy="44.6" r=".8" fill="#232630"/>
<circle cx="55.2" cy="44.6" r=".8" fill="#232630"/>
<path d="M48 51.6l-2 2.6h4z" fill="#232630"/>
<path d="M48 54.4v1.8" stroke="#232630" stroke-width="1.4" stroke-linecap="round"/>
<path d="M44.8 57.4q3.2 2.6 6.4 0" fill="none" stroke="#232630" stroke-width="1.5" stroke-linecap="round"/>
<ellipse cx="36.4" cy="53" rx="3.4" ry="2" fill="#f2b3aa" fill-opacity=".55"/>
<ellipse cx="59.6" cy="53" rx="3.4" ry="2" fill="#f2b3aa" fill-opacity=".55"/>`,
  },
  {
    slug: "astronot",
    bg: "#232a3d",
    renk: "#3d5a9e",
    icerik: `
<g fill="#ffffff">
<path d="M18 24l1.1 3.2L22 28.4l-2.9 1.2L18 33l-1.1-3.4L14 28.4l2.9-1.2z" opacity=".9"/>
<path d="M78 20l.8 2.3 2.2.8-2.2.9-.8 2.3-.8-2.3-2.2-.9 2.2-.8z" opacity=".65"/>
<circle cx="24" cy="60" r="1.2" opacity=".6"/>
<circle cx="69" cy="43" r="1" opacity=".5"/>
<circle cx="74" cy="18" r=".9" opacity=".45"/>
<circle cx="20" cy="40" r=".8" opacity=".4"/>
<circle cx="70" cy="82" r=".8" opacity=".35"/>
</g>
<circle cx="73" cy="74" r="7" fill="#3d5a9e" opacity=".85"/>
<ellipse cx="73" cy="74" rx="11.4" ry="2.8" fill="none" stroke="#7fa3d6" stroke-width="1.4" transform="rotate(-16 73 74)" opacity=".8"/>
<path d="M16 97c2.6-14.4 14.2-22 32-22s29.4 7.6 32 22z" fill="#e9edf5"/>
<path d="M20 90c6.4-6.2 15.8-9.4 28-9.4s21.6 3.2 28 9.4" fill="none" stroke="#c9d2e0" stroke-width="1.6"/>
<rect x="39.6" y="79.4" width="16.8" height="12.6" rx="2.8" fill="#c9d2e0"/>
<circle cx="44.2" cy="83.4" r="1.5" fill="#e88a3d"/>
<circle cx="48" cy="83.4" r="1.5" fill="#5fd6c4"/>
<rect x="42.8" y="87" width="10.4" height="1.6" rx=".8" fill="#8fa3bd"/>
<circle cx="48" cy="45" r="23.4" fill="#f2f5fa"/>
<circle cx="48" cy="45" r="23.4" fill="none" stroke="#c3ccda" stroke-width="2"/>
<ellipse cx="48" cy="47" rx="15.4" ry="14.6" fill="#e8b98f"/>
<path d="M33.6 40.6c1.6-6.2 7.2-10.2 14.4-10.2s12.8 4 14.4 10.2c-4-3.4-8.6-5.2-14.4-5.2s-10.4 1.8-14.4 5.2z" fill="#4a3323"/>
<circle cx="42.4" cy="46.6" r="2" fill="#2b2d38"/>
<circle cx="53.6" cy="46.6" r="2" fill="#2b2d38"/>
<circle cx="43.1" cy="45.8" r=".7" fill="#ffffff"/>
<circle cx="54.3" cy="45.8" r=".7" fill="#ffffff"/>
<path d="M45.2 52.8q2.8 2.6 5.6 0" fill="none" stroke="#9c4f4b" stroke-width="1.6" stroke-linecap="round"/>
<ellipse cx="39.4" cy="50.8" rx="2.6" ry="1.5" fill="#e88a76" fill-opacity=".3"/>
<ellipse cx="56.6" cy="50.8" rx="2.6" ry="1.5" fill="#e88a76" fill-opacity=".3"/>
<circle cx="48" cy="45" r="19.6" fill="#7fa3d6" fill-opacity=".1"/>
<path d="M35 34c5.4-4.2 13-5.4 19.6-3.2" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" opacity=".75"/>
<path d="M34.4 39c3.2-2.8 7.2-4.4 11-4.6" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" opacity=".45"/>
<circle cx="60.8" cy="54.4" r="1.8" fill="#ffffff" fill-opacity=".3"/>
<path d="M34.6 61.8c7.6 3.4 19.2 3.4 26.8 0" fill="none" stroke="#c3ccda" stroke-width="2"/>
<path d="M39.6 68.4h16.8v3.4H39.6z" fill="#c9d2e0"/>`,
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
<circle cx="70" cy="82" r=".8" opacity=".35"/>
</g>
<path d="M27 97c1.8-12.6 9.8-19 21-19s19.2 6.4 21 19z" fill="#39405a"/>
<path d="M33 82h30" stroke="#2b3145" stroke-width="1.4" opacity=".7"/>
<rect x="35.4" y="71.4" width="25.2" height="10" rx="3.8" fill="#8fa3bd"/>
<rect x="38.4" y="74.4" width="19.2" height="1.8" rx=".9" fill="#6d7f99"/>
<circle cx="48" cy="78.6" r="1.6" fill="#5fd6c4"/>
<rect x="23.6" y="30.4" width="48.8" height="37.4" rx="13.2" fill="#dbe4ee"/>
<rect x="23.6" y="30.4" width="48.8" height="37.4" rx="13.2" fill="none" stroke="#aebccd" stroke-width="1.4"/>
<path d="M29.6 36.4c3.6-2.4 8.4-3.6 13.4-3.6" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" opacity=".85"/>
<rect x="29.2" y="37.4" width="37.6" height="24" rx="9" fill="#2b3550"/>
<rect x="29.2" y="37.4" width="37.6" height="24" rx="9" fill="none" stroke="#1f2740" stroke-width="1.2"/>
<circle cx="40.2" cy="47.4" r="4.2" fill="#5fd6c4"/>
<circle cx="55.8" cy="47.4" r="4.2" fill="#5fd6c4"/>
<circle cx="41.5" cy="45.9" r="1.5" fill="#ffffff" fill-opacity=".95"/>
<circle cx="57.1" cy="45.9" r="1.5" fill="#ffffff" fill-opacity=".95"/>
<path d="M43.2 54.6h9.6" stroke="#5fd6c4" stroke-width="2.4" stroke-linecap="round"/>
<rect x="16.8" y="43.6" width="6.4" height="13.6" rx="3.2" fill="#8fa3bd"/>
<rect x="72.8" y="43.6" width="6.4" height="13.6" rx="3.2" fill="#8fa3bd"/>
<circle cx="20" cy="50.4" r="1.4" fill="#6d7f99"/>
<circle cx="76" cy="50.4" r="1.4" fill="#6d7f99"/>
<path d="M48 30.4v-7" stroke="#8fa3bd" stroke-width="3.2" stroke-linecap="round"/>
<circle cx="48" cy="19.6" r="3.8" fill="#e8a62b"/>
<circle cx="48" cy="19.6" r="7.4" fill="#e8a62b" fill-opacity=".18"/>
<circle cx="31.2" cy="35.4" r="1.1" fill="#aebccd"/>
<circle cx="64.8" cy="35.4" r="1.1" fill="#aebccd"/>
<circle cx="31.2" cy="63" r="1.1" fill="#aebccd"/>
<circle cx="64.8" cy="63" r="1.1" fill="#aebccd"/>
<path d="M34.6 63.6c7.6 3 19.2 3 26.8 0" fill="none" stroke="#c9d2e0" stroke-width="1.4"/>`,
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
<circle cx="24" cy="76" r=".9" opacity=".4"/>
</g>
<path d="M12 97c2.6-16 16.4-24.4 36-24.4S81.4 81 84 97z" fill="#8c2f36"/>
<path d="M36 73.6l12 10.4 12-10.4 3.4 2.8-15.4 13.6L32.6 76.4z" fill="#a83b43"/>
<path d="M40 76l8 7 8-7" fill="none" stroke="#f0d7b8" stroke-width="2"/>
<path d="M41 56h14v12c0 4-14 4-14 0z" fill="#d2a073"/>
<ellipse cx="48" cy="50" rx="17" ry="18.4" fill="#e3b184"/>
<path d="M34.4 56.4c2.6 10.6 8.8 16 13.6 16s11-5.4 13.6-16c-2.8 5.8-7.8 9-13.6 9s-10.8-3.2-13.6-9z" fill="#5a463a" fill-opacity=".22"/>
<path d="M31 44.8c1.4-12.8 8.6-19.8 17-19.8s15.6 7 17 19.8c-4.4-6.6-10.4-9.8-17-9.8s-12.6 3.2-17 9.8z" fill="#3a2a22"/>
<path d="M28.4 42.2c1.4-9.8 8.6-15.6 19.6-15.6s18.2 5.8 19.6 15.6l-3.6.8c-2.2-6.8-7.8-10-16-10s-13.8 3.2-16 10z" fill="#c8383f"/>
<path d="M27.2 42.4c5.6-3.2 42-3.2 47.6 0-5.6 3.2-42 3.2-47.6 0z" fill="#a82c33"/>
<path d="M66.8 41.2c4.8-1.4 7.4 1 7 4.6-.4 3.4-3.2 5.2-7 3.8z" fill="#c8383f"/>
<path d="M69.2 43.6c1.8-1 3.2.4 2.8 2.2" fill="none" stroke="#a82c33" stroke-width="1.2" stroke-linecap="round"/>
<circle cx="32.2" cy="56.6" r="3.2" fill="none" stroke="#e8c25a" stroke-width="1.8"/>
<circle cx="32.2" cy="56.6" r="4.8" fill="#e8c25a" fill-opacity=".18"/>
<circle cx="41.6" cy="50" r="2.1" fill="#2b2d38"/>
<circle cx="54.4" cy="50" r="2.1" fill="#2b2d38"/>
<circle cx="42.3" cy="49.2" r=".7" fill="#ffffff"/>
<circle cx="55.1" cy="49.2" r=".7" fill="#ffffff"/>
<path d="M37.6 44.2q3.2-1.8 6.4-.4M58.4 44.2q-3.2-1.8-6.4-.4" fill="none" stroke="#3a2a22" stroke-width="1.8" stroke-linecap="round"/>
<path d="M56 41.6l3.2 3.2" stroke="#b97f5e" stroke-width="1.2" stroke-linecap="round"/>
<path d="M48 53.4v3" stroke="#c99a70" stroke-width="1.3" stroke-linecap="round"/>
<path d="M45 58.6q3 2.4 6 0" fill="none" stroke="${AGIZ}" stroke-width="1.7" stroke-linecap="round"/>
<path d="M45.6 59.8q2.4 1.5 4.8 0" fill="#d98b83" fill-opacity=".45"/>
<path d="M44.8 62c.4 3 1.8 4.6 3.2 4.6s2.8-1.6 3.2-4.6c-1 .8-2.2 1.2-3.2 1.2s-2.2-.4-3.2-1.2z" fill="#3a2a22" fill-opacity=".8"/>`,
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
<circle cx="24" cy="70" r="1" opacity=".4"/>
</g>
<path d="M10 97c2.6-16.6 17-25 38-25s35.4 8.4 38 25z" fill="#4b3a75"/>
<path d="M39.4 71.4l8.6 9.6 8.6-9.6 3.6 2.6-12.2 13.6L36 74z" fill="#5c4a8c"/>
<path d="M43 74l5 5 5-5" fill="none" stroke="#e8c25a" stroke-width="1.6"/>
<path d="M41 55h14v12c0 4-14 4-14 0z" fill="#d8b48c"/>
<ellipse cx="48" cy="49.4" rx="16.4" ry="17.4" fill="#eccfae"/>
<path d="M33.4 44.6c1-10.8 6.4-16.8 14.6-16.8s13.6 6 14.6 16.8c-4-5.6-8.6-7.8-14.6-7.8s-10.6 2.2-14.6 7.8z" fill="#d8d8e0"/>
<path d="M31 83.6c2.4-10.4 8.6-16.4 17-16.4s14.6 6 17 16.4c-3.4 4.2-7.8 6.2-17 6.2s-13.6-2-17-6.2z" fill="#f2f2f5"/>
<path d="M40.6 66.6c2 8 13 8 14.8 0" fill="#f2f2f5"/>
<path d="M42.4 70.6c1.6 5.6 9.6 5.6 11.2 0" fill="#d8d8e0"/>
<path d="M40.2 71.8c1.2 6 4.4 9.6 7.8 9.6s6.6-3.6 7.8-9.6" fill="none" stroke="#d8d8e0" stroke-width="1.4" stroke-linecap="round"/>
<path d="M44.2 75c.6 4.2 2 6.8 3.8 6.8s3.2-2.6 3.8-6.8" fill="none" stroke="#c9c9d2" stroke-width="1.2" stroke-linecap="round"/>
<path d="M43.4 32.6L48 6.6l4.6 26z" fill="#5c4a8c"/>
<path d="M44.6 26.6l3.4-14 3.4 14z" fill="#6f5aa6"/>
<path d="M27.6 36.4c6.4-4.2 34.4-4.2 40.8 0-6.4 4.2-34.4 4.2-40.8 0z" fill="#6a58a0"/>
<path d="M28.4 36c6.2-3.6 33-3.6 39.2 0" fill="none" stroke="#8a76c4" stroke-width="1.4"/>
<path d="M34 32.6l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" fill="#e8c25a" fill-opacity=".9"/>
<path d="M58.4 30.6l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6z" fill="#e8c25a" fill-opacity=".75"/>
<circle cx="48" cy="9.6" r="2.4" fill="#e8c25a"/>
<circle cx="48" cy="9.6" r="4.6" fill="#e8c25a" fill-opacity=".25"/>
<path d="M38.6 43.6q3.2-1.6 6.2-.4M57.4 43.6q-3.2-1.6-6.2-.4" fill="none" stroke="#c9c9d2" stroke-width="1.9" stroke-linecap="round"/>
<circle cx="41.4" cy="48.4" r="2" fill="${CIZGI}"/>
<circle cx="54.6" cy="48.4" r="2" fill="${CIZGI}"/>
<circle cx="42.1" cy="47.6" r=".7" fill="#ffffff"/>
<circle cx="55.3" cy="47.6" r=".7" fill="#ffffff"/>
<path d="M45 54.6q3 2.4 6 0" fill="none" stroke="${AGIZ}" stroke-width="1.7" stroke-linecap="round"/>
<ellipse cx="39.6" cy="52.6" rx="2.4" ry="1.4" fill="#e88a76" fill-opacity=".28"/>
<ellipse cx="56.4" cy="52.6" rx="2.4" ry="1.4" fill="#e88a76" fill-opacity=".28"/>`,
  },
];

await mkdir(KOK, { recursive: true });
for (const a of AVATARLAR) {
  await writeFile(join(KOK, `${a.slug}.svg`), cerceve(a.slug, a.bg, a.icerik), "utf8");
}
const dosyalar = (await readdir(KOK)).filter((d) => d.endsWith(".svg")).sort();
console.log(`${AVATARLAR.length} avatar yazıldı: ${KOK}`);
console.log("Yeni/yenilenen:", AVATARLAR.map((a) => `${a.slug}.svg`).join(", "));
console.log(`Klasördeki toplam avatar: ${dosyalar.length}`);
