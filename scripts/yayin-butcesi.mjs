// ==========================================================================
// YAYIN BÜTÇESİ — dağıtımdan önce kapasite kontrolü
// --------------------------------------------------------------------------
// NEDEN: Site tamamen statik. Her haber bir HTML sayfası, her kapak bir dosya
// demek. Ücretsiz statik sunucuların sert sınırları vardır:
//
//   GitHub Pages      : 1 GB yayın boyutu, ~10.000 dosya (dosya sınırı yumuşak)
//   Cloudflare Pages  : 20.000 dosya, dosya başına 25 MiB, toplam boyut yok
//
// Sınır aşıldığında dağıtım sessizce yarıda kalabilir veya site eski içerikte
// donabilir. Bu betik derleme çıktısını ölçer, hedefe göre yüzdeyi yazar ve
// sert sınır aşıldıysa sıfırdan farklı kodla çıkar.
//
// KULLANIM:
//   node scripts/yayin-butcesi.mjs
//   node scripts/yayin-butcesi.mjs --hedef=cloudflare
//   node scripts/yayin-butcesi.mjs --hedef=both --sert
//   node scripts/yayin-butcesi.mjs --json
// ==========================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(KOK, "site", "dist");

const HEDEFLER = {
  github: {
    ad: "GitHub Pages",
    dosya: 10_000,
    dosyaSert: false, // yumuşak sınır: aşılınca dağıtım hemen durmaz
    toplamBayt: 1024 ** 3,
    dosyaBayt: 100 * 1024 ** 2,
    not: "1 GB yayın + ~10.000 dosya",
  },
  cloudflare: {
    ad: "Cloudflare Pages",
    dosya: 20_000,
    dosyaSert: true,
    toplamBayt: 0, // toplam boyut sınırı yok
    dosyaBayt: 25 * 1024 ** 2,
    not: "20.000 dosya + dosya başına 25 MiB; toplam boyut sınırsız",
  },
};

const arg = (ad, varsayilan) => {
  const bulunan = process.argv.find((a) => a.startsWith(`--${ad}=`));
  if (!bulunan) return varsayilan;
  return bulunan.slice(ad.length + 3).trim() || varsayilan;
};

const hedefArg = (arg("hedef", process.env.DEPLOY_TARGET || "both") || "both").toLowerCase();
const sert = process.argv.includes("--sert");
const json = process.argv.includes("--json");

const secilen =
  hedefArg === "both" || hedefArg === "auto"
    ? ["github", "cloudflare"]
    : HEDEFLER[hedefArg]
      ? [hedefArg]
      : null;

if (!secilen) {
  console.error(`Bilinmeyen hedef: ${hedefArg}. Seçenekler: github, cloudflare, both, auto`);
  process.exit(2);
}

if (!fs.existsSync(DIST)) {
  console.error(`Derleme çıktısı yok: ${DIST}\nÖnce: cd site && npm run build`);
  process.exit(2);
}

const sayi = new Intl.NumberFormat("tr-TR");
const mb = (bayt) => `${(bayt / 1024 ** 2).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`;
const gb = (bayt) =>
  `${(bayt / 1024 ** 3).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} GB`;
const boyut = (bayt) => (bayt >= 1024 ** 3 ? gb(bayt) : mb(bayt));

function tara(dir) {
  let dosya = 0;
  let bayt = 0;
  const uzantilar = new Map();
  const ust = new Map();
  const enBuyuk = [];

  const gez = (d, kokAd) => {
    for (const g of fs.readdirSync(d, { withFileTypes: true })) {
      const yol = path.join(d, g.name);
      if (g.isDirectory()) {
        gez(yol, kokAd ?? g.name);
        continue;
      }
      if (!g.isFile()) continue;
      const st = fs.statSync(yol);
      dosya++;
      bayt += st.size;
      const ext = path.extname(g.name).toLowerCase() || "(uzantısız)";
      uzantilar.set(ext, (uzantilar.get(ext) || 0) + 1);
      if (kokAd) ust.set(kokAd, (ust.get(kokAd) || 0) + st.size);
      enBuyuk.push({ yol: path.relative(DIST, yol), bayt: st.size });
      if (enBuyuk.length > 400) {
        enBuyuk.sort((a, b) => b.bayt - a.bayt);
        enBuyuk.length = 20;
      }
    }
  };

  gez(dir, null);
  enBuyuk.sort((a, b) => b.bayt - a.bayt);
  return {
    dosya,
    bayt,
    uzantilar: [...uzantilar.entries()].sort((a, b) => b[1] - a[1]),
    ust: [...ust.entries()].sort((a, b) => b[1] - a[1]),
    enBuyuk: enBuyuk.slice(0, 8),
  };
}

const olcum = tara(DIST);
const satirlar = [];
const uyarilar = [];
let sertHata = false;

for (const anahtar of secilen) {
  const h = HEDEFLER[anahtar];
  const dosyaYuzde = (olcum.dosya / h.dosya) * 100;
  const boyutYuzde = h.toplamBayt ? (olcum.bayt / h.toplamBayt) * 100 : null;
  const dosyaAsim = olcum.dosya > h.dosya;
  const boyutAsim = Boolean(h.toplamBayt) && olcum.bayt > h.toplamBayt;
  const buyukDosya = olcum.enBuyuk.find((f) => f.bayt > h.dosyaBayt);

  if ((dosyaAsim && h.dosyaSert) || boyutAsim || buyukDosya) sertHata = true;

  if (dosyaYuzde >= 90 || (boyutYuzde !== null && boyutYuzde >= 90)) {
    uyarilar.push(
      `${h.ad}: sınıra çok yakın (dosya %${dosyaYuzde.toFixed(0)}` +
        (boyutYuzde !== null ? `, boyut %${boyutYuzde.toFixed(0)}` : "") +
        "). Yeni hedefe geçme zamanı."
    );
  } else if (dosyaYuzde >= 75 || (boyutYuzde !== null && boyutYuzde >= 75)) {
    uyarilar.push(
      `${h.ad}: kapasitenin %${Math.max(dosyaYuzde, boyutYuzde ?? 0).toFixed(0)} kadarı kullanıldı.`
    );
  }
  if (dosyaAsim && !h.dosyaSert) {
    uyarilar.push(
      `${h.ad}: ${sayi.format(olcum.dosya)} dosya, yumuşak sınır ${sayi.format(h.dosya)} aşıldı. ` +
        "Dağıtım hâlâ çalışıyor olabilir; kalıcı çözüm Cloudflare Pages + R2."
    );
  }
  if (dosyaAsim && h.dosyaSert) {
    uyarilar.push(`HATA: ${h.ad} dosya sınırı aşıldı (${sayi.format(olcum.dosya)} > ${sayi.format(h.dosya)}).`);
  }
  if (boyutAsim) {
    uyarilar.push(`HATA: ${h.ad} toplam boyut sınırı aşıldı (${boyut(olcum.bayt)} > ${boyut(h.toplamBayt)}).`);
  }
  if (buyukDosya) {
    uyarilar.push(
      `HATA: ${h.ad} dosya başına sınırı aşan dosya var: ` +
        `${buyukDosya.yol} (${boyut(buyukDosya.bayt)} > ${boyut(h.dosyaBayt)}).`
    );
  }

  satirlar.push({
    anahtar,
    ...h,
    dosyaYuzde,
    boyutYuzde,
    dosyaAsim,
    boyutAsim,
  });
}

if (json) {
  console.log(
    JSON.stringify(
      {
        olcum: {
          dosya: olcum.dosya,
          bayt: olcum.bayt,
          uzantilar: olcum.uzantilar,
          ustDizinler: olcum.ust,
          enBuyuk: olcum.enBuyuk,
        },
        hedefler: satirlar,
        uyarilar,
        sertHata,
      },
      null,
      2
    )
  );
} else {
  console.log("YAYIN BÜTÇESİ");
  console.log(`Çıktı: ${path.relative(KOK, DIST)}`);
  console.log(`Dosya: ${sayi.format(olcum.dosya)}`);
  console.log(`Boyut: ${boyut(olcum.bayt)}`);
  console.log("");
  console.log("Hedefler:");
  for (const s of satirlar) {
    const d = `${sayi.format(olcum.dosya)} / ${sayi.format(s.dosya)} (%${s.dosyaYuzde.toFixed(0)})`;
    const b = s.toplamBayt
      ? `${boyut(olcum.bayt)} / ${boyut(s.toplamBayt)} (%${s.boyutYuzde.toFixed(0)})`
      : `${boyut(olcum.bayt)} (toplam sınır yok)`;
    console.log(`  ${s.ad.padEnd(17)} dosya ${d.padEnd(26)} boyut ${b}`);
    console.log(`  ${"".padEnd(17)} ${s.not}`);
  }
  console.log("");
  console.log("En büyük dosyalar:");
  for (const f of olcum.enBuyuk.slice(0, 5)) {
    console.log(`  ${boyut(f.bayt).padStart(9)}  ${f.yol}`);
  }
  console.log("");
  console.log("Dosya türleri:");
  for (const [ext, adet] of olcum.uzantilar.slice(0, 8)) {
    console.log(`  ${ext.padEnd(10)} ${sayi.format(adet)}`);
  }
  if (uyarilar.length) {
    console.log("");
    console.log("UYARILAR:");
    for (const u of uyarilar) console.log(`  - ${u}`);
  } else {
    console.log("");
    console.log("Durum: hedeflerin içinde.");
  }
}

// GitHub Actions özet ekranına da yaz (varsa).
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    "## Yayın bütçesi",
    "",
    "| Hedef | Dosya | Boyut | Durum |",
    "| --- | --- | --- | --- |",
    ...satirlar.map((s) => {
      const durum = s.dosyaAsim && s.dosyaSert ? "❌ sınır aşıldı" : s.dosyaYuzde >= 90 || (s.boyutYuzde ?? 0) >= 90 ? "⚠️ sınıra yakın" : "✅";
      const b = s.toplamBayt ? `${boyut(olcum.bayt)} / ${boyut(s.toplamBayt)}` : `${boyut(olcum.bayt)} / sınırsız`;
      return `| ${s.ad} | ${sayi.format(olcum.dosya)} / ${sayi.format(s.dosya)} | ${b} | ${durum} |`;
    }),
    "",
    ...(uyarilar.length ? uyarilar.map((u) => `- ${u}`) : ["- Sorun yok."]),
    "",
  ].join("\n");
  try {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  } catch {
    /* özet yazılamazsa sessiz geç */
  }
}

process.exit(sert && sertHata ? 1 : 0);
