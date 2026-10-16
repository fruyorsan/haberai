// Her haber icin markali kapak gorseli (1200x675 SVG) uretir.
// Kaynak sitelerin gorselleri TELIF nedeniyle kullanilmaz; bu kapaklar
// tamamen HaberAI'ya aittir: kategoriye gore renklenen gradyan, basligin
// ozet satirlari, kategori cipi ve marka filigrani.
import { getArticles } from "../../lib/articles.js";

export function getStaticPaths() {
  return getArticles().map((a) => ({
    params: { slug: a.slug },
    props: {
      title: a.title || "",
      category: a.category || "Haber",
      source: a.source || "",
    },
  }));
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

/** Kategori adindan sabit renk tonu (sitedeki diger bilesenlerle ayni mantik). */
function hue(str) {
  let h = 0;
  const s = String(str || "haber");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

const THIN = "iIljJı!.,;:'|()[]{}";
const WIDE = "MWmwŞĞÜÖÇ@%&";

/** Kaba karakter genisligi tahmini (SVG'de otomatik sarma yok). */
function charW(ch, size) {
  if (ch === " ") return 0.29 * size;
  if (THIN.includes(ch)) return 0.4 * size;
  if (WIDE.includes(ch)) return 0.9 * size;
  if (/[A-ZÇĞİÖŞÜ]/.test(ch)) return 0.7 * size;
  return 0.55 * size;
}

function textWidth(text, size, letterSpacing = 0) {
  const chars = [...String(text)];
  const base = chars.reduce((n, c) => n + charW(c, size), 0);
  return base + Math.max(0, chars.length - 1) * letterSpacing;
}

/** Basligi en fazla `maxLines` satira sarar; tasarsa "…" ile kisaltir. */
function wrap(text, size, maxWidth, maxLines) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (!cur || textWidth(test, size) <= maxWidth) cur = test;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;

  const cut = lines.slice(0, maxLines);
  let last = cut[maxLines - 1];
  while (last && textWidth(`${last} …`, size) > maxWidth) last = last.replace(/\s+\S*$/, "");
  cut[maxLines - 1] = `${(last || "").trim()} …`;
  return cut;
}

export function GET({ props }) {
  const title = String(props.title || "").trim();
  const category = String(props.category || "Haber").trim();
  const H = hue(category);

  const base1 = `hsl(${H} 52% 27%)`;
  const base2 = `hsl(${H} 60% 12%)`;
  const glow = `hsl(${H} 74% 60%)`;
  const brand = "#e8212a"; // HaberAI kirmizisi (her kapakta sabit)

  const len = title.length;
  const size = len <= 46 ? 58 : len <= 78 ? 50 : 44;
  const lines = wrap(title, size, 820, 3);
  const lh = Math.round(size * 1.16);
  // Baslik blogu, cip ile marka satiri arasinda dikeyde ortalanir (1-3 satir).
  const firstBaseline = Math.round(350 - ((lines.length - 1) * lh) / 2);

  const chipText = category.toLocaleUpperCase("tr-TR");
  const chipFont = 21;
  const chipLetter = 1.7;
  const chipTextW = textWidth(chipText, chipFont, chipLetter);
  const chipW = Math.round(chipTextW + 34 + 30); // dolgu + nokta
  const chipH = 44;

  const titleTspans = lines
    .map((line, i) => `<tspan x="64" y="${firstBaseline + i * lh}">${esc(line)}</tspan>`)
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="1200" height="675" role="img" aria-label="${esc(`${category}: ${title} — HaberAI özgün kapak görseli`)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${base1}"/>
      <stop offset="1" stop-color="${base2}"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.92" cy="0.04" r="0.85">
      <stop offset="0" stop-color="${glow}" stop-opacity="0.42"/>
      <stop offset="1" stop-color="${glow}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.42"/>
    </linearGradient>
    <pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.2" fill="#ffffff" fill-opacity="0.09"/>
    </pattern>
  </defs>

  <rect width="1200" height="675" fill="url(#bg)"/>
  <rect width="1200" height="675" fill="url(#halo)"/>
  <rect width="1200" height="675" fill="url(#dots)"/>
  <path d="M0 675 L470 0 L700 0 L230 675 Z" fill="#ffffff" fill-opacity="0.045"/>
  <rect width="1200" height="675" fill="url(#fade)"/>

  <text x="1235" y="640" text-anchor="end" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="700" font-weight="800" fill="#ffffff" fill-opacity="0.075">H</text>

  <rect x="0" y="0" width="12" height="675" fill="${brand}"/>

  <g>
    <rect x="64" y="60" rx="${chipH / 2}" width="${chipW}" height="${chipH}" fill="#ffffff" fill-opacity="0.16"/>
    <rect x="64" y="60" rx="${chipH / 2}" width="${chipW}" height="${chipH}" fill="none" stroke="#ffffff" stroke-opacity="0.22"/>
    <circle cx="${64 + 22}" cy="${60 + chipH / 2}" r="5.5" fill="${brand}"/>
    <text x="${64 + 38}" y="${60 + chipH / 2 + 7.5}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="${chipFont}" font-weight="700" letter-spacing="${chipLetter}" fill="#ffffff">${esc(chipText)}</text>
  </g>

  <text font-family="system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="${size}" font-weight="800" letter-spacing="-1" fill="#ffffff">${titleTspans}</text>

  <rect x="66" y="556" width="96" height="3" rx="1.5" fill="${brand}"/>
  <text x="64" y="606" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="30" font-weight="800" fill="#ffffff" fill-opacity="0.95">Haber<tspan fill="${brand}">AI</tspan></text>
  <text x="64" y="636" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="16" font-weight="600" letter-spacing="0.6" fill="#ffffff" fill-opacity="0.55">ÖZGÜN KAPAK GÖRSELİ · haberai</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=2592000",
    },
  });
}
