/**
 * Bildirim / uygulama ikonu üreticisi — kare PNG (192 ve 512).
 *
 * Neden ayrı ikon: web push bildirimlerinde (OneSignal → chrome_web_icon)
 * tarayıcı KARE bir ikon bekler; og:image (1200×630) buraya sığdırıldığında
 * kenarlarda boşluk kalıp çirkin görünüyor. Burada kare, tam taşan marka
 * kırmızısı zemin + beyaz "H" üretilir.
 *
 * Yalnızca Node yerleşikleri (node:zlib, node:fs, node:path, node:url).
 * Çalıştır:  npm run ikon
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Renkler (RGB) ---
const RED_LIGHT = [232, 61, 67]; // #e83d43
const RED = [216, 31, 38]; // #d81f26
const RED_DARK = [168, 18, 24]; // #a81218
const WHITE = [255, 255, 255];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * Bir noktanın rengi (0..1 ölçekli koordinatla, boyuttan bağımsız).
 * Tam taşan kırmızı gradyan + ortada beyaz "H" logotype (yalnızca dikdörtgen).
 */
function sample(u, v) {
  // Çapraz marka gradyanı
  let c = mix(RED_LIGHT, RED_DARK, clamp(u * 0.45 + v * 0.55, 0, 1));
  c = mix(c, RED, 0.35);

  // Üstte hafif ışık (cam hissi)
  if (v < 0.5) c = mix(c, WHITE, (0.5 - v) * 0.12);

  // Beyaz "H": iki dikey çubuk + yatay çubuk
  const cx = 0.5;
  const cy = 0.5;
  const hw = 0.46; // H toplam genişliği
  const hh = 0.48; // H toplam yüksekliği
  const bw = 0.1; // çubuk kalınlığı
  const ch = 0.1; // yatay çubuk yüksekliği
  const left = cx - hw / 2;
  const right = cx + hw / 2;
  const top = cy - hh / 2;
  const bot = cy + hh / 2;
  const inH =
    (u >= left && u <= left + bw && v >= top && v <= bot) ||
    (u >= right - bw && u <= right && v >= top && v <= bot) ||
    (u >= left + bw && u <= right - bw && v >= cy - ch / 2 && v <= cy + ch / 2);
  if (inH) c = WHITE;

  return c;
}

/** 2×2 süpersampling ile anti-aliased piksel. */
const OFFS = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
];
function pixel(x, y, size) {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [ox, oy] of OFFS) {
    const c = sample((x + ox) / size, (y + oy) / size);
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
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filtre: None
    rgba.copy(raw, rowStart + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function uret(size, dosya) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y, size);
      const i = (y * size + x) * 4;
      rgba[i] = clamp(Math.round(r), 0, 255);
      rgba[i + 1] = clamp(Math.round(g), 0, 255);
      rgba[i + 2] = clamp(Math.round(b), 0, 255);
      rgba[i + 3] = 255;
    }
  }
  const png = encodePng(size, size, rgba);
  const outDir = join(__dirname, "..", "public");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, dosya);
  writeFileSync(outPath, png);
  console.log(`${dosya} üretildi: ${size}×${size}, ${png.length} bayt`);
}

uret(192, "ikon-192.png");
uret(512, "ikon-512.png");
