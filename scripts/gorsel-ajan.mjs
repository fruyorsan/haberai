// ==========================================================================
// GÖRSEL AJANI — kapakları haberin anlamına göre yeniden seçer
// --------------------------------------------------------------------------
// Bu betik `src/gorsel-ajan.js` modülünü çalıştırır. Sıra:
//   1) En kötü kapakları seçer: tasarım kartı (foto=false), kaynak sitenin
//      kendi og:image'inden üretilmiş kapak, sonra yeni/yerel kapaklar.
//   2) Her hedef için AI brifi + Commons/Openverse/kaynak adayları + vision
//      puanlaması yapar; hiçbiri yetmezse AI görsel üretir.
//   3) Sonucu data/articles.json'a ve site/public/kapak/ altına yazar.
//
// AI kotası korunur: günlük çağrı sayısı data/gorsel-ajan-durum.json'da
// tutulur. Bütçe bitince tur sessizce durur; mevcut kapaklara dokunulmaz.
//
// Kullanım:
//   npm run gorsel-ajan                  → varsayılan tur (3 hedef)
//   npm run gorsel-ajan:dry              → hiçbir şey yazmadan hedefleri göster
//   node scripts/gorsel-ajan.mjs --limit=5 --gun=3 --debug
//   node scripts/gorsel-ajan.mjs --id=<haber-id> --zorla
//
// Ortam değişkenleri:
//   GORSEL_AJAN_LIMIT   tur başına en fazla haber (varsayılan 3)
//   GORSEL_AJAN_GUN     geriye dönük gün penceresi (varsayılan 3, 0 = tümü)
//   GORSEL_GUNLUK_AI    günlük en fazla AI çağrısı (varsayılan 120)
//   GORSEL_URETIM       0 = AI görsel üretimini kapat (varsayılan açık)
//   GORSEL_TEKRAR_SAAT  başarısız hedefi yeniden denemeden önce bekleme (12)
//   GORSEL_POLLINATIONS 1 = Pollinations üretimini de dene (varsayılan kapalı)
// ==========================================================================
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadArticles, saveArticles } from "../src/store.js";
import { ajanKapakUret, kimlik } from "../src/gorsel-ajan.js";

const KOK = process.cwd();
const DURUM_DOSYA = path.join(KOK, "data", "gorsel-ajan-durum.json");

const DRY = process.argv.includes("--dry");
const DEBUG = process.argv.includes("--debug");
const ZORLA = process.argv.includes("--zorla");

const TEK_ID = String(arg("id", "") || "").trim();
const KATEGORILER = String(arg("kategori", "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const GUN = sayi(arg("gun", process.env.GORSEL_AJAN_GUN || 3), 3);
const LIMIT = sayi(arg("limit", process.env.GORSEL_AJAN_LIMIT || 3), 3);
const GUNLUK_AI = sayi(process.env.GORSEL_GUNLUK_AI || 120, 120);
const TEKRAR_SAAT = sayi(process.env.GORSEL_TEKRAR_SAAT || 12, 12);
const URETIM = process.env.GORSEL_URETIM !== "0";

function arg(ad, varsayilan) {
  const onek = `--${ad}=`;
  const i = process.argv.findIndex((x) => x === `--${ad}` || x.startsWith(onek));
  if (i < 0) return varsayilan;
  const x = process.argv[i];
  const deger = x === `--${ad}` ? process.argv[i + 1] : x.slice(onek.length);
  return deger === undefined || String(deger).startsWith("--") ? varsayilan : deger;
}

function sayi(deger, varsayilan) {
  const n = Number(deger);
  return Number.isFinite(n) && n >= 0 ? n : varsayilan;
}

// ------------------------------------------------------------ günlük bütçe
const bugun = new Date().toISOString().slice(0, 10);

function durumOku() {
  try {
    if (!existsSync(DURUM_DOSYA)) return { gun: bugun, ai: 0 };
    const d = JSON.parse(readFileSync(DURUM_DOSYA, "utf8"));
    if (d?.gun !== bugun) return { gun: bugun, ai: 0 };
    return { gun: bugun, ai: Math.max(0, Number(d.ai) || 0) };
  } catch {
    return { gun: bugun, ai: 0 };
  }
}

const durum = durumOku();
let kalan = Math.max(0, GUNLUK_AI - durum.ai);

const sayac = {
  izinVar: () => kalan > 0,
  kalan: () => kalan,
  artir: () => {
    if (kalan <= 0) return;
    kalan--;
    durum.ai++;
    durum.guncel = new Date().toISOString();
  },
};

function durumYaz() {
  if (DRY) return;
  try {
    mkdirSync(path.dirname(DURUM_DOSYA), { recursive: true });
    writeFileSync(DURUM_DOSYA, `${JSON.stringify(durum, null, 2)}\n`, "utf8");
  } catch (err) {
    console.warn(`  ! günlük bütçe yazılamadı: ${err.message}`);
  }
}

// ------------------------------------------------------------------ hedefler
const articles = await loadArticles();
const simdi = Date.now();
const esik = GUN > 0 ? simdi - GUN * 86400000 : 0;
const tekrarEsigi = TEKRAR_SAAT * 3600000;

/** Arşivde kullanılmış görseller: aynı kare iki habere kapak olmasın. */
const kullanilan = new Set();
for (const a of articles) {
  for (const u of [a?.image, a?.kapak?.kaynak]) {
    const k = kimlik(u);
    if (k && !k.startsWith("ai:")) kullanilan.add(k);
  }
}

/**
 * 0 = tasarım kartı (en kötü), 1 = kaynak sitenin kendi görselinden üretilmiş
 * kapak, 2 = henüz işlenmemiş uzak görsel, 3 = yerel ama ajansız kapak.
 */
function oncelik(a) {
  if (!a?.kapak) return 2;
  if (a.kapak.foto === false) return 0;
  if (a.kapak.ajan) return 9;
  if (/^https?:\/\//i.test(String(a.kapak.kaynak || ""))) return 1;
  if (String(a.image || "").startsWith("/kapak/")) return 3;
  return 2;
}

const uygunlar = articles.filter((a) => {
  if (!a?.id || !a?.title) return false;
  if (TEK_ID && String(a.id) !== TEK_ID) return false;
  if (!TEK_ID && KATEGORILER.length && !KATEGORILER.includes(a.category)) return false;
  if (!TEK_ID && a.kapak?.ajan && !ZORLA) return false;

  if (!TEK_ID && GUN > 0) {
    const t = Date.parse(a.publishedAt || a.generatedAt || 0);
    if (!Number.isFinite(t) || t < esik) return false;
  }

  if (!TEK_ID && !ZORLA) {
    const deneme = Date.parse(a.gorselAjan?.tarih || 0);
    if (Number.isFinite(deneme) && simdi - deneme < tekrarEsigi) return false;
  }
  return true;
});

const hedefler = uygunlar
  .sort(
    (x, y) =>
      oncelik(x) - oncelik(y) ||
      Date.parse(y.publishedAt || y.generatedAt || 0) -
        Date.parse(x.publishedAt || x.generatedAt || 0)
  )
  .slice(0, LIMIT > 0 ? LIMIT : undefined);

console.log(
  `Görsel ajanı: ${hedefler.length} hedef / ${uygunlar.length} uygun` +
    ` (${GUN > 0 ? `son ${GUN} gün` : "tüm arşiv"}, tur sınırı ${LIMIT || "sınırsız"})`
);
console.log(
  `  AI bütçesi: ${kalan}/${GUNLUK_AI}` +
    ` · üretim ${URETIM ? "açık" : "kapalı"}` +
    (DRY ? " · DENEME, yazılmayacak" : "")
);

if (DRY) {
  for (const [i, a] of hedefler.entries()) {
    console.log(`  · [${i + 1}/${hedefler.length}] öncelik ${oncelik(a)} — ${a.title}`);
  }
  process.exit(0);
}

if (!hedefler.length) {
  durumYaz();
  process.exit(0);
}

// ------------------------------------------------------------------ çalıştır
let degisen = 0;
let atlanan = 0;
let hata = 0;
let sonKayit = 0;

for (const [i, a] of hedefler.entries()) {
  // Bir hedefe en az 2 birim gerekir: brif + vision. Tek birim kaldıysa
  // bütçeyi boşa harcamadan turu bitir.
  if (sayac.kalan() < 2) {
    console.log("  · AI bütçesi bitti; kalan hedefler sonraki tura kaldı.");
    break;
  }

  console.log(
    `  · [${i + 1}/${hedefler.length}] ${a.title.slice(0, 80)} ` +
      `(öncelik ${oncelik(a)}, ${a.kapak?.foto === false ? "kart" : a.kapak?.kaynak ? "kaynak kapak" : "yeni"})`
  );

  try {
    const sonuc = await ajanKapakUret(a, {
      kullanilan,
      dry: false,
      zorla: ZORLA,
      uret: URETIM,
      sayac,
      debug: DEBUG,
      kok: KOK,
    });

    a.gorselAjan = {
      tarih: new Date().toISOString(),
      sonuc: sonuc.degisti ? "degisti" : "atlandi",
      neden: sonuc.neden || "",
      ...(sonuc.secim?.kaynak ? { secim: sonuc.secim.kaynak } : {}),
      ...(Number.isFinite(sonuc.secim?.skor) ? { skor: Math.round(sonuc.secim.skor) } : {}),
    };

    if (sonuc.degisti) {
      a.image = sonuc.url;
      a.kapak = sonuc.kapak;
      a.gorselKaynak = sonuc.gorselKaynak;
      const k = kimlik(sonuc.kapak?.kaynak);
      if (k && !k.startsWith("ai:")) kullanilan.add(k);
      degisen++;
      console.log(
        `    ✓ ${sonuc.secim?.kaynak || "yeni kapak"} ` +
          `(${sonuc.secim?.skor ?? "-"}p) — ${sonuc.secim?.neden || sonuc.neden}`
      );
    } else {
      atlanan++;
      console.log(`    · değişmedi — ${sonuc.neden}`);
    }
  } catch (err) {
    hata++;
    a.gorselAjan = {
      tarih: new Date().toISOString(),
      sonuc: "hata",
      neden: String(err?.message || err).slice(0, 200),
    };
    console.warn(`    ! ${err.message}`);
  }

  durumYaz();
  if (degisen + atlanan + hata - sonKayit >= 3) {
    await saveArticles(articles);
    sonKayit = degisen + atlanan + hata;
  }
}

if (degisen || atlanan || hata) await saveArticles(articles);
durumYaz();

console.log(
  `Görsel ajanı turu: ${degisen} kapak değişti, ${atlanan} atlandı, ${hata} hata` +
    ` · kalan AI bütçesi ${sayac.kalan()}/${GUNLUK_AI}`
);
