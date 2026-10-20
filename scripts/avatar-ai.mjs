// ============================================================================
// AVATAR ÜRETİMİ (AI Horde · Animagine XL) — lo-fi anime seti
// ----------------------------------------------------------------------------
// Kullanım (repo kökünde):
//   node scripts/avatar-ai.mjs gonder         → 22 işi kuyruğa bırakır
//   node scripts/avatar-ai.mjs durum          → ilerlemeyi yazar
//   node scripts/avatar-ai.mjs indir          → bitenleri indirir + WebP'ye çevirir
//   node scripts/avatar-ai.mjs tek mert       → yalnızca bir işi yeniden üretir
//
// Çıktı: site/public/avatar/<kod>.webp (512×512, kalite 82)
// İş kimlikleri: scripts/avatar-ai-isler.json
// ============================================================================
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../site/package.json", import.meta.url));
const sharp = require("sharp");

const KOK = join(dirname(fileURLToPath(import.meta.url)), "..");
const HEDEF = join(KOK, "site", "public", "avatar");
const ISLER = join(KOK, "scripts", "avatar-ai-isler.json");
const API = "https://aihorde.net/api/v2";
const ANAHTAR = process.env.AIHORDE_ANAHTAR || "0000000000";
const MODEL = process.env.AVATAR_MODEL || "Animagine XL";
// Anonim anahtar 576×576 üzeri isteklerde kudos isteyebiliyor; hızlı modeller
// için AVATAR_BOYUT=576 kullan (çıktı yine 512'ye indirilir).
const BOYUT = Number(process.env.AVATAR_BOYUT || 768);

const STIL =
  "masterpiece, best quality, very aesthetic, soft anime style, lofi aesthetic, " +
  "muted pastel colors, gentle lighting, clean lines, soft shading";

const OLUMSUZ =
  "lowres, worst quality, bad anatomy, bad hands, text, watermark, signature, " +
  "logo, extra digits, harsh shadows, photorealistic, 3d render";

/** code → { ad, prompt, olumsuz? } */
export const AVATAR_PROMPTLARI = [
  // ---------------------------------------------------------------- insanlar --
  {
    kod: "ada",
    ad: "Ada",
    prompt:
      "1girl, adult woman, long wavy auburn hair, gentle smile, beige knit sweater, " +
      "three-quarter view, upper body portrait, solo, safe, sfw, fully clothed, " +
      "plain muted pastel background",
    olumsuz: "nsfw, nude, cleavage, child, loli",
  },
  {
    kod: "mert",
    ad: "Mert",
    prompt:
      "1boy, young man, wavy dark hair, black hoodie, side profile, upper body portrait, " +
      "plain muted blue gray background",
  },
  {
    kod: "zeynep",
    ad: "Zeynep",
    prompt:
      "1girl, young woman, dark hair in a bun, small gold earrings, teal shirt, " +
      "three-quarter view, upper body portrait, plain muted pastel background",
  },
  {
    kod: "kerem",
    ad: "Kerem",
    prompt:
      "1boy, young man, round glasses, short brown hair, mustard sweater, " +
      "front view, upper body portrait, plain muted warm background",
  },
  {
    kod: "elif",
    ad: "Elif",
    prompt:
      "1girl, young woman, shoulder-length black hair, red scarf, soft smile, " +
      "upper body portrait, plain muted rose background",
  },
  {
    kod: "deniz",
    ad: "Deniz",
    prompt:
      "1person, androgynous young person, short curly hair, purple hoodie, calm expression, " +
      "upper body portrait, plain muted lavender background",
  },
  {
    kod: "ece",
    ad: "Ece",
    prompt:
      "1girl, young woman, blonde bob haircut, blue denim jacket, side profile, " +
      "upper body portrait, plain muted sky background",
  },
  {
    kod: "bora",
    ad: "Bora",
    prompt:
      "1boy, young man, short dark hair, black knit beanie, olive green jacket, " +
      "three-quarter view, upper body portrait, solo, looking at viewer, " +
      "plain muted forest green background",
  },
  {
    kod: "selin",
    ad: "Selin",
    prompt:
      "1girl, young woman, orange hair, freckles, white shirt, gentle smile, " +
      "upper body portrait, plain muted peach background",
  },
  // ---------------------------------------------------------------- hayvanlar --
  {
    kod: "kedi",
    ad: "Kedi",
    prompt:
      "a fluffy white cat, animal only, no humans, quadruped, four legs, tail, fur, " +
      "sitting on the floor, full body, soft anime illustration, centered composition, " +
      "plain muted pastel pink background",
    olumsuz:
      "1girl, 1boy, person, people, human, catgirl, catboy, kemonomimi, animal ears, " +
      "humanoid, standing",
  },
  {
    kod: "golden",
    ad: "Golden",
    prompt:
      "a golden retriever dog, animal only, no humans, quadruped, four legs, tail, fur, " +
      "sitting, full body, soft anime illustration, centered composition, " +
      "plain muted cream background",
    olumsuz:
      "1girl, 1boy, person, people, human, dogboy, doggirl, kemonomimi, animal ears, " +
      "humanoid, standing",
  },
  {
    kod: "panda",
    ad: "Panda",
    prompt:
      "a panda cub, animal only, no humans, quadruped, four legs, sitting, full body, " +
      "soft round face, soft anime illustration, centered composition, " +
      "plain muted mint background",
    olumsuz:
      "1girl, 1boy, person, people, human, panda girl, kemonomimi, animal ears, " +
      "humanoid, standing",
  },
  {
    kod: "penguen",
    ad: "Penguen",
    prompt:
      "a little penguin, animal only, no humans, full body, standing, round body, " +
      "soft eyes, soft anime illustration, centered composition, " +
      "plain muted ice blue background",
    olumsuz:
      "1girl, 1boy, person, people, human, penguin girl, kemonomimi, animal ears, " +
      "humanoid",
  },
  {
    kod: "kara-kedi",
    ad: "Kara Kedi",
    prompt:
      "cute black cat, glowing yellow eyes, sitting, centered composition, " +
      "plain muted deep blue background",
    olumsuz: "1girl, 1boy, person, people, human",
  },
  // ---------------------------------------------------------- manzara / obje --
  {
    kod: "dag",
    ad: "Dağ",
    prompt:
      "snowy mountain landscape, soft pastel sky, distant clouds, lofi wallpaper, " +
      "centered composition",
    olumsuz: "1girl, 1boy, person, people, human, text",
  },
  {
    kod: "deniz-manzara",
    ad: "Deniz",
    prompt:
      "calm sea at sunset, gentle waves, pastel pink and blue sky, lofi wallpaper, " +
      "centered composition",
    olumsuz: "1girl, 1boy, person, people, human, text",
  },
  {
    kod: "ay",
    ad: "Ay",
    prompt:
      "crescent moon in a pastel night sky, soft clouds, tiny stars, lofi wallpaper, " +
      "centered composition",
    olumsuz: "1girl, 1boy, person, people, human, text",
  },
  {
    kod: "istanbul",
    ad: "İstanbul",
    prompt:
      "istanbul skyline, bosphorus, mosque silhouettes, seagulls, pastel sunset, " +
      "soft anime scenery, lofi wallpaper",
    olumsuz: "1girl, 1boy, person, people, human, text",
  },
  {
    kod: "kulaklik",
    ad: "Kulaklık",
    prompt:
      "pastel over-ear headphones, floating, soft anime illustration, lofi aesthetic, " +
      "centered composition, plain muted lavender background",
    olumsuz: "1girl, 1boy, person, people, human, text",
  },
  {
    kod: "gamepad",
    ad: "Gamepad",
    prompt:
      "pastel game controller, soft anime illustration, lofi aesthetic, " +
      "centered composition, plain muted blue background",
    olumsuz: "1girl, 1boy, person, people, human, text",
  },
  {
    kod: "cicek",
    ad: "Çiçek",
    prompt:
      "single pastel flower, soft petals, soft anime illustration, lofi aesthetic, " +
      "centered composition, plain muted cream background",
    olumsuz: "1girl, 1boy, person, people, human, text",
  },
  {
    kod: "yaprak",
    ad: "Yaprak",
    prompt:
      "monstera leaf, soft green pastel, soft anime illustration, lofi aesthetic, " +
      "centered composition, plain muted sage background",
    olumsuz: "1girl, 1boy, person, people, human, text",
  },
];

function islerOku() {
  try {
    return JSON.parse(readFileSync(ISLER, "utf8"));
  } catch {
    return {};
  }
}

function islerYaz(v) {
  writeFileSync(ISLER, JSON.stringify(v, null, 2) + "\n");
}

async function json(url, secenek) {
  const r = await fetch(url, secenek);
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    j = { hata: t.slice(0, 300) };
  }
  return { durum: r.status, j };
}

async function gonder(liste) {
  const kayit = islerOku();
  for (const a of liste) {
    if (kayit[a.kod] && kayit[a.kod].id) {
      console.log(`atlandı (var): ${a.kod}`);
      continue;
    }
    const govde = {
      prompt: `${STIL}, ${a.prompt}`,
      params: {
        width: BOYUT,
        height: BOYUT,
        steps: 28,
        n: 1,
        sampler_name: "k_euler_a",
      },
      negative_prompt: `${OLUMSUZ}${a.olumsuz ? ", " + a.olumsuz : ""}`,
      models: [MODEL],
      nsfw: false,
      r2: true,
    };
    const { durum, j } = await json(`${API}/generate/async`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANAHTAR },
      body: JSON.stringify(govde),
    });
    if (j && j.id) {
      kayit[a.kod] = { id: j.id, ad: a.ad, kudos: j.kudos, tarih: new Date().toISOString() };
      islerYaz(kayit);
      console.log(`kuyrukta: ${a.kod} → ${j.id} (${j.kudos} kudos)`);
    } else {
      console.log(`HATA ${a.kod}: ${durum} ${JSON.stringify(j).slice(0, 200)}`);
    }
    // Anonim API'yi boğmamak için kısa bekleme.
    await new Promise((r) => setTimeout(r, 1200));
  }
}

async function durum() {
  const kayit = islerOku();
  for (const [kod, v] of Object.entries(kayit)) {
    const { j } = await json(`${API}/generate/check/${v.id}`);
    const biten = j.done ? "BİTTİ" : j.faulted ? "HATA" : "bekliyor";
    console.log(
      `${kod.padEnd(14)} ${biten.padEnd(8)} sıra:${String(j.queue_position ?? "-").padStart(4)} ` +
        `işlem:${j.processing ? "evet" : "hayır"}`
    );
  }
}

async function indir(sadece) {
  if (!existsSync(HEDEF)) mkdirSync(HEDEF, { recursive: true });
  const kayit = islerOku();
  for (const [kod, v] of Object.entries(kayit)) {
    if (sadece && kod !== sadece) continue;
    const hedef = join(HEDEF, `${kod}.webp`);
    if (existsSync(hedef) && !sadece) {
      console.log(`atlandı (dosya var): ${kod}`);
      continue;
    }
    const { j } = await json(`${API}/generate/status/${v.id}`);
    const g = (j.generations || [])[0];
    if (!g || !g.img) {
      console.log(`hazır değil: ${kod}`);
      continue;
    }
    const r = await fetch(g.img);
    if (!r.ok) {
      console.log(`indirilemedi: ${kod} (${r.status})`);
      continue;
    }
    const ham = Buffer.from(await r.arrayBuffer());
    await sharp(ham)
      .resize(512, 512, { fit: "cover", position: "centre" })
      .webp({ quality: 82, effort: 4 })
      .toFile(hedef);
    console.log(`yazıldı: ${kod}.webp (${Math.round(ham.length / 1024)} KB → 512px)`);
  }
}

const komut = process.argv[2] || "durum";
if (komut === "gonder") {
  await gonder(AVATAR_PROMPTLARI);
} else if (komut === "tek") {
  const kod = process.argv[3];
  const a = AVATAR_PROMPTLARI.find((x) => x.kod === kod);
  if (!a) {
    console.log("bilinmeyen kod:", kod);
    process.exit(1);
  }
  const kayit = islerOku();
  delete kayit[kod];
  islerYaz(kayit);
  await gonder([a]);
} else if (komut === "indir") {
  await indir(process.argv[3]);
} else {
  await durum();
}
