// ============================================================================
// POLLINATIONS AVATARLARI — hayvan / manzara / obje seti
// ----------------------------------------------------------------------------
// AI Horde kuyruğu uzadığında Pollinations (ücretsiz) ile üretilen 576×576
// JPEG'leri 512×512 WebP'ye çevirir. Pollinations görselin sağ altına küçük
// bir logo basıyor; kırpma alt 64 px'i atarak logoyu temizler.
//
// Kullanım: node scripts/avatar-pollinations.mjs
// Girdi: %TEMP%/poll-<ad>.jpg   Çıktı: site/public/avatar/<kod>.webp
// ============================================================================
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../site/package.json", import.meta.url));
const sharp = require("sharp");

const KOK = join(dirname(fileURLToPath(import.meta.url)), "..");
const HEDEF = join(KOK, "site", "public", "avatar");
const TEMP = process.env.TEMP || process.env.TMP || ".";

/** poll dosyası (uzantısız) → avatar kodu */
const ESLE = {
  "poll-ada2": "ada",
  "poll-bora": "bora",
  "poll-kedi3": "kedi",
  "poll-golden": "golden",
  "poll-panda": "panda",
  "poll-penguen": "penguen",
  "poll-dag2": "dag",
  "poll-deniz": "deniz-manzara",
  "poll-ay": "ay",
  "poll-kulaklik": "kulaklik",
  "poll-gamepad": "gamepad",
  "poll-cicek": "cicek",
};

for (const [dosya, kod] of Object.entries(ESLE)) {
  const kaynak = join(TEMP, `${dosya}.jpg`);
  if (!existsSync(kaynak)) {
    console.log(`atlandı (yok): ${dosya}.jpg → ${kod}`);
    continue;
  }
  const hedef = join(HEDEF, `${kod}.webp`);
  // 576×576 → üstteki 576×512'lik bölüm (alt 64 px logo) → 512×512.
  await sharp(kaynak)
    .extract({ left: 0, top: 0, width: 576, height: 512 })
    .resize(512, 512, { fit: "cover" })
    .webp({ quality: 82, effort: 4 })
    .toFile(hedef);
  console.log(`yazıldı: ${kod}.webp`);
}
