/**
 * Bildirim / uygulama ikonu üreticisi — kare PNG (192 ve 512).
 *
 * Neden ayrı ikon: web push bildirimlerinde (OneSignal → chrome_web_icon)
 * tarayıcı KARE bir ikon bekler; og:image (1200×630) buraya sığdırıldığında
 * kenarlarda boşluk kalıp çirkin görünüyor.
 *
 * Tasarım (tek dosya, harici bağımlılık yok):
 *   - Yuvarlatılmış kare zemin: çapraz marka kırmızısı gradyan + üst-sol ışık
 *     + alt-sağ derinlik + diyagonal cam parlaması + iç kenar ışığı (rim).
 *   - "H" logotype: yuvarlatılmış uçlu kalemler (kapsül SDF), beyazdan hafif
 *     griye inen dikey gradyan ve altına düşen yumuşak gölge (derinlik).
 *   - Sağ üstte iki kıvılcım (dört köşeli yıldız): sitenin "yapay zekâ" kimliği.
 *
 * Şekiller SDF (işaretli uzaklık fonksiyonu) ile çizilir; 4×4 süpersampling
 * sayesinde kenarlar her boyutta pürüzsüz kalır. Tasarım oransal (0..1)
 * çalıştığı için aynı görsel 24 px'te de 512 px'te de aynı görünür.
 *
 * Çalıştır:  npm run ikon
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Renkler (RGB) ---
const MARKA = [216, 31, 38]; // #d81f26
const MARKA_ACIK = [247, 84, 92]; // #f7545c
const MARKA_KOYU = [140, 8, 16]; // #8c0810
const GOLGE = [96, 6, 12];
const BEYAZ = [255, 255, 255];
const BEYAZ_ALT = [233, 235, 243];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Yumuşak geçiş (0..1). */
function smooth(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// --- Şekiller (SDF; negatif = içeride) ---

/** Merkezi (0.5, 0.5) olan yuvarlatılmış kare. */
function sdKare(x, y, hw, hh, r) {
  const qx = Math.abs(x - 0.5) - (hw - r);
  const qy = Math.abs(y - 0.5) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

/** İki nokta arası yuvarlatılmış kalem (kapsül). */
function sdKapsul(x, y, ax, ay, bx, by, r) {
  const pax = x - ax;
  const pay = y - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay || 1), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
}

// --- Ölçüler (ikonun kenarına göre oran) ---
const KOSE_R = 0.19; // yuvarlatılmış kare köşesi
const H_DIKEY = 0.19; // H dikey yarım uzunluğu (çizgi)
const H_UZAKLIK = 0.15; // H kalemlerinin merkezden uzaklığı
const H_KALEM = 0.066; // dikey kalem yarı kalınlığı
const H_ORTA = 0.056; // yatay kalem yarı kalınlığı
const YILDIZ_1 = { x: 0.805, y: 0.215, r: 0.062 };
const YILDIZ_2 = { x: 0.87, y: 0.3, r: 0.028 };

/** H logotype'ının SDF'i (üç yuvarlatılmış kalemin birleşimi). */
function sdH(u, v) {
  return Math.min(
    sdKapsul(u, v, 0.5 - H_UZAKLIK, 0.5 - H_DIKEY, 0.5 - H_UZAKLIK, 0.5 + H_DIKEY, H_KALEM),
    sdKapsul(u, v, 0.5 + H_UZAKLIK, 0.5 - H_DIKEY, 0.5 + H_UZAKLIK, 0.5 + H_DIKEY, H_KALEM),
    sdKapsul(u, v, 0.5 - H_UZAKLIK + 0.02, 0.5, 0.5 + H_UZAKLIK - 0.02, 0.5, H_ORTA)
  );
}

/** Dört köşeli kıvılcım (astroit): çekirdek + yumuşak hale. */
function yildiz(u, v, y) {
  const dx = Math.abs(u - y.x) / y.r;
  const dy = Math.abs(v - y.y) / y.r;
  const d = Math.sqrt(dx) + Math.sqrt(dy);
  return {
    cekirdek: 1 - smooth(0.96, 1.06, d),
    hale: (1 - smooth(1, 1.9, d)) * 0.22,
  };
}

/** Tek noktanın rengi: [r, g, b, a]. */
function ornek(u, v) {
  const d = sdKare(u, v, 0.5, 0.5, KOSE_R);
  if (d > 0) return [0, 0, 0, 0];

  // Zemin: çapraz marka gradyanı
  let c = mix(MARKA_ACIK, MARKA_KOYU, clamp(u * 0.35 + v * 0.75, 0, 1));
  c = mix(c, MARKA, 0.45);

  // Üst-sol ışığı (kaynak hissi) — ölçülü: fazlası ucuz parlama gibi duruyor.
  c = mix(c, BEYAZ, clamp(0.26 - Math.hypot(u - 0.26, v - 0.14) * 1.15, 0, 0.26) * 0.34);
  // Alt-sağ derinliği
  c = mix(c, MARKA_KOYU, clamp(0.34 - Math.hypot(u - 0.95, v - 0.98) * 0.95, 0, 0.34) * 0.55);
  // Alt kenarda oturma
  c = mix(c, GOLGE, smooth(0.62, 1, v) * 0.14);

  // Diyagonal cam parlaması
  const g = u * 0.6 + v * 0.8;
  c = mix(c, BEYAZ, smooth(0.1, 0.34, g) * (1 - smooth(0.34, 0.62, g)) * 0.07);

  // İç kenar ışığı (üstte çok hafif)
  const kenar = smooth(-0.026, -0.017, d) * (1 - smooth(-0.017, -0.006, d));
  c = mix(c, BEYAZ, kenar * (1 - smooth(0.25, 0.85, v)) * 0.3);

  // H'nin altına düşen yumuşak gölge (derinlik)
  c = mix(c, GOLGE, (1 - smooth(-0.006, 0.026, sdH(u, v - 0.016))) * 0.42);

  // H: beyazdan hafif griye inen dikey gradyan
  if (sdH(u, v) < 0) {
    const t = clamp((v - (0.5 - H_DIKEY - H_KALEM)) / (2 * (H_DIKEY + H_KALEM)), 0, 1);
    c = mix(BEYAZ, BEYAZ_ALT, t * 0.8);
  }

  // Kıvılcımlar
  for (const y of [YILDIZ_1, YILDIZ_2]) {
    const { cekirdek, hale } = yildiz(u, v, y);
    if (hale > 0) c = mix(c, BEYAZ, hale);
    if (cekirdek > 0) c = mix(c, BEYAZ, cekirdek * 0.97);
  }

  return [c[0], c[1], c[2], 1];
}

/** İkonu verilen boyutta RGBA tamponu olarak çizer (4×4 süpersampling). */
export function ikonRGBA(size) {
  const ORNEK = 4;
  const n = ORNEK * ORNEK;
  const rgba = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ORNEK; sy++) {
        for (let sx = 0; sx < ORNEK; sx++) {
          const u = (px + (sx + 0.5) / ORNEK) / size;
          const v = (py + (sy + 0.5) / ORNEK) / size;
          const c = ornek(u, v);
          // Ön çarpımlı toplama: kenarlarda koyu saçak oluşmasın.
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      }
      const i = (py * size + px) * 4;
      rgba[i] = clamp(Math.round(a > 0 ? r / a : 0), 0, 255);
      rgba[i + 1] = clamp(Math.round(a > 0 ? g / a : 0), 0, 255);
      rgba[i + 2] = clamp(Math.round(a > 0 ? b / a : 0), 0, 255);
      rgba[i + 3] = clamp(Math.round((a / n) * 255), 0, 255);
    }
  }
  return rgba;
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

/** RGBA tamponunu PNG dosyasına çevirir. */
export function pngKodla(width, height, rgba) {
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
  const png = pngKodla(size, size, ikonRGBA(size));
  const outDir = join(__dirname, "..", "public");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, dosya), png);
  console.log(`${dosya} üretildi: ${size}×${size}, ${png.length} bayt`);
}

// Doğrudan çalıştırıldıysa dosyaları üret.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  uret(192, "ikon-192.png");
  uret(512, "ikon-512.png");
}
