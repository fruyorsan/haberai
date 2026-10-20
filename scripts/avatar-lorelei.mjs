// ============================================================================
// LORELEI AVATARLARI — DiceBear 9.x "lorelei" stili
// ----------------------------------------------------------------------------
// İnsan portreleri elle çizilmiş SVG'lerden daha kaliteli olduğu için
// DiceBear'ın Lorelei seti kullanılıyor. Dosyalar depoya kaydedilir; site
// çalışırken dış servise istek gitmez (hızlı + gizlilik dostu).
//
// Lisans: Lorelei — Lisa Wischofsky, CC0 1.0 (kamu malı)
// https://www.dicebear.com/styles/lorelei/
// Yine de kaynak, profil sayfasında küçük bir atıfla anılıyor.
//
// Kullanım: node scripts/avatar-lorelei.mjs
// ============================================================================
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = join(dirname(fileURLToPath(import.meta.url)), "..", "site", "public", "avatar");

// Renkler site paletiyle uyumlu; yüz ifadeleri güler yüzlü seçeneklerden.
const AVATARLAR = [
  { ad: "ada", bg: "e4573d", ten: "e8b98f", sac: "2b2b36", hair: 21, eyes: 10, mouth: 2, nose: 2 },
  { ad: "mert", bg: "6a4fc1", ten: "e8b98f", sac: "4a3323", hair: 6, eyes: 6, mouth: 4, nose: 1 },
  { ad: "zeynep", bg: "1c8c82", ten: "c98a5e", sac: "23232b", hair: 15, eyes: 15, mouth: 2, nose: 3 },
  { ad: "kerem", bg: "e8a62b", ten: "f0c9a8", sac: "6b4a2a", hair: 44, eyes: 4, mouth: 5, nose: 1 },
  { ad: "elif", bg: "d9364b", ten: "f2d6c0", sac: "d9b45a", hair: 18, eyes: 19, mouth: 4, nose: 4, kpe: 100, ear: 1 },
  { ad: "deniz", bg: "d9d3ee", ten: "e8c3a4", sac: "7a5bb5", hair: 32, eyes: 6, mouth: 4, nose: 5 },
  { ad: "ece", bg: "cfe0ea", ten: "d9a273", sac: "2a221e", hair: 31, eyes: 1, mouth: 2, nose: 3, kpe: 100, ear: 3 },
  { ad: "bora", bg: "1f6f54", ten: "8a5a3b", sac: "141419", hair: 43, eyes: 23, mouth: 5, nose: 1 },
  { ad: "selin", bg: "e2743a", ten: "eac3a5", sac: "9a4a2c", hair: 35, eyes: 6, mouth: 2, nose: 4, kpe: 100, ear: 2 },
];

const p2 = (n) => String(n).padStart(2, "0");

function adres(a) {
  const kpe = a.kpe || 0;
  return (
    "https://api.dicebear.com/9.x/lorelei/svg" +
    `?seed=${a.ad}` +
    `&backgroundColor=${a.bg}&radius=50&scale=100` +
    `&skinColor=${a.ten}&hairColor=${a.sac}` +
    `&hair=variant${p2(a.hair)}&eyes=variant${p2(a.eyes)}&mouth=happy${p2(a.mouth)}&nose=variant${p2(a.nose)}` +
    "&beardProbability=0&glassesProbability=0&frecklesProbability=0&hairAccessoriesProbability=0" +
    `&earringsProbability=${kpe}` +
    (kpe ? `&earrings=variant${p2(a.ear)}&earringsColor=e8c25a` : "")
  );
}

await mkdir(KOK, { recursive: true });
for (const a of AVATARLAR) {
  const yanit = await fetch(adres(a), { signal: AbortSignal.timeout(30000) });
  if (!yanit.ok) throw new Error(`${a.ad}: HTTP ${yanit.status}`);
  const svg = await yanit.text();
  if (!svg.startsWith("<svg")) throw new Error(`${a.ad}: SVG bekleniyordu`);
  await writeFile(join(KOK, `${a.ad}.svg`), svg, "utf8");
  console.log(`${a.ad}.svg — ${svg.length} bayt`);
}
console.log(`${AVATARLAR.length} Lorelei avatarı yazıldı: ${KOK}`);
