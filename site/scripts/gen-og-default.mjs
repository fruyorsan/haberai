/**
 * Markalı yedek og:image üreticisi — 1200×630 PNG.
 *
 * Yalnızca Node yerleşiklerini kullanır (node:zlib, node:fs, node:path, node:url).
 * Harici bağımlılık (sharp / satori / canvas) YOKTUR.
 *
 * Görsel: koyu gradyan arka plan (#0b0d11 → #14171d), ortada marka kırmızısı
 * yuvarlak-kare zemin içinde dikdörtgenlerle çizilmiş beyaz "H" logotype,
 * altta ince marka kırmızısı aksan şeridi.
 *
 * Çalıştır:  npm run og:default
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 1200;
const H = 630;

// --- Renkler (RGB) ---
const BG_0 = [11, 13, 17]; // #0b0d11
const BG_1 = [20, 23, 29]; // #14171d
const RED = [216, 31, 38]; // #d81f26
const RED_DARK = [168, 18, 24];
const RED_LIGHT = [232, 61, 67];
const WHITE = [255, 255, 255];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Yuvarlatılmış dikdörtgen içinde mi? */
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
  if (cx === x || cy === y) return true; // kenar bölgesi
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Bir noktanın rengi (süpersampling alt örnekleri için). */
function sampleColor(x, y) {
  // Arka plan gradyanı (hafif çapraz)
  const t = clamp((x / W) * 0.4 + (y / H) * 0.6, 0, 1);
  let c = mix(BG_0, BG_1, t);

  // Merkezden yayılan hafif kırmızı parıltı
  const dx = x - W / 2;
  const dy = y - H / 2;
  const d = Math.sqrt(dx * dx + dy * dy) / (Math.max(W, H) * 0.62);
  const glow = Math.pow(Math.max(0, 1 - d), 2) * 0.2;
  c = mix(c, RED, glow);

  // Alt marka kırmızısı aksan şeridi
  if (y >= H - 10) {
    c = mix(RED, RED_LIGHT, x / W);
  }

  // Ortadaki yuvarlak-kare marka zemini
  const S = 240;
  const x0 = W / 2 - S / 2;
  const y0 = H / 2 - S / 2;
  if (inRoundRect(x, y, x0, y0, x0 + S, y0 + S, 52)) {
    const g = clamp(((x - x0) / S) * 0.5 + ((y - y0) / S) * 0.5, 0, 1);
    let sq = mix(RED_LIGHT, RED_DARK, g);
    // İç kenarda ince açık halka (derinlik hissi)
    const border = 4;
    if (
      !inRoundRect(x, y, x0 + border, y0 + border, x0 + S - border, y0 + S - border, 48)
    ) {
      sq = mix(sq, RED_LIGHT, 0.45);
    }

    // Beyaz "H" logotype — yalnızca dikdörtgenler (iki dikey çubuk + yatay çubuk)
    const cx = W / 2;
    const cy = H / 2;
    const bw = 26; // çubuk kalınlığı
    const hw = 132; // H toplam genişliği
    const hh = 140; // H toplam yüksekliği
    const left = cx - hw / 2;
    const right = cx + hw / 2;
    const top = cy - hh / 2;
    const bot = cy + hh / 2;
    const ch = 26; // yatay çubuk yüksekliği
    const inH =
      (x >= left && x <= left + bw && y >= top && y <= bot) ||
      (x >= right - bw && x <= right && y >= top && y <= bot) ||
      (x >= left + bw && x <= right - bw && y >= cy - ch / 2 && y <= cy + ch / 2);
    if (inH) sq = WHITE;

    c = sq;
  }

  return c;
}

/** 2×2 süpersampling ile yumuşak (anti-aliased) piksel. */
const OFFS = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
];
function pixel(x, y) {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [ox, oy] of OFFS) {
    const c = sampleColor(x + ox, y + oy);
    r += c[0];
    g += c[1];
    b += c[2];
  }
  return [r / 4, g / 4, b / 4];
}

// --- PNG kodlama (raw RGBA scanline + zlib DEFLATE + CRC32) ---
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = 6; // renk tipi: RGBA
  ihdr[10] = 0; // sıkıştırma
  ihdr[11] = 0; // filtre
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filtre tipi: None
    rgba.copy(raw, rowStart + 1, y * stride, y * stride + stride);
  }

  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Üret ---
const rgba = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const [r, g, b] = pixel(x, y);
    const i = (y * W + x) * 4;
    rgba[i] = clamp(Math.round(r), 0, 255);
    rgba[i + 1] = clamp(Math.round(g), 0, 255);
    rgba[i + 2] = clamp(Math.round(b), 0, 255);
    rgba[i + 3] = 255;
  }
}

const png = encodePng(W, H, rgba);
const outDir = join(__dirname, "..", "public");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "og-default.png");
writeFileSync(outPath, png);

console.log(`og-default.png üretildi: ${outPath} (${W}x${H}, ${png.length} bayt)`);
