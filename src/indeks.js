// ==========================================================================
// YAYIN ÇEKİRDEĞİ — hangi haberler herkese açık "vitrin"e girer?
// --------------------------------------------------------------------------
// SORUN: Site kısa sürede 4.400'ün üzerinde haber üretti; gövde medyanı ~200
// kelime, aynı olay 5-6 farklı başlıkla tekrar ediyor. Google bunu "ölçekli /
// düşük değerli içerik" olarak okuyor (AdSense: "Düşük değere sahip içerik").
//
// ÇÖZÜM: Yayın hattı aynı tempoda çalışmaya devam eder, ancak site vitrini
// (ana sayfa, kategoriler, etiketler, RSS, site haritası, arama) yalnızca
// KALİTE KAPISINI geçen ve aynı olayı tekrar etmeyen bir "çekirdek" gösterir.
//
//   - Kalite kapısı: yeterli gövde, maddeli özet, editör notu, özgün yorum,
//     gerçek fotoğraf, spam olmayan başlık.
//   - Tekrar ayıklama: başlık benzerliği + günlük kota (varsayılan 12/gün).
//   - Pencere: son 45 gün. Dışındaki haberler sayfa olarak yaşar (okuyucu
//     doğrudan bağlantıyla görür) ama vitrinde listelenmez ve `noindex` olur.
//
// Karar deterministiktir: aynı veri + aynı eşik = aynı liste. Böylece her
// derlemede URL'ler indeksli/noindex arasında zıplamaz.
// ==========================================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isJunkArticle } from "./kalite.js";
import { ayniOlay } from "./dedupe.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const ARTICLES = join(DATA, "articles.json");
const CIKTI = join(DATA, "indeks.json");

/** Günde vitrine girecek en iyi haber sayısı. */
const GUNLUK = Number(process.env.INDEKS_GUNLUK ?? 12);
/** Çekirdeğin geriye dönük penceresi (gün). */
const PENCERE_GUN = Number(process.env.INDEKS_PENCERE_GUN ?? 45);

/**
 * Kalite kapısı eşikleri. Ortam değişkeniyle gevşetilebilir; amaç kaliteyi
 * düşürmek değil, toplu üretimdeki ince haberleri vitrinden uzak tutmaktır.
 */
const ESIK = {
  /** Gövde (karakter). ~250 kelime. */
  govde: Number(process.env.INDEKS_MIN_GOVDE ?? 1200),
  /** En az madde sayısı (keyPoints). */
  madde: Number(process.env.INDEKS_MIN_MADDE ?? 3),
  /** Özet (karakter). */
  ozet: Number(process.env.INDEKS_MIN_OZET ?? 120),
  /** Özgün yorum (karakter). */
  yorum: Number(process.env.INDEKS_MIN_YORUM ?? 150),
  /** Editoryal not (karakter). */
  not: Number(process.env.INDEKS_MIN_NOT ?? 40),
  /** Başlık benzerliği eşiği (0-1). */
  benzerlik: Number(process.env.INDEKS_BENZERLIK ?? 0.55),
};

/** Türkiye saatine göre gün anahtarı (YYYY-MM-DD). */
const gunAnahtari = (t) => {
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
};

const yayinZamani = (a) => {
  const t = Date.parse(a?.generatedAt || a?.publishedAt || 0);
  return Number.isFinite(t) ? t : 0;
};

const metin = (v) => {
  if (Array.isArray(v)) return v.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return String(v ?? "").replace(/\s+/g, " ").trim();
};

/**
 * Kalite puanı — SABİT (zamana bağlı değil), böylece sıralama kaymaz.
 * Uzun ve özgün gövde, maddeli özet, editör notu ve gerçek fotoğraf puanı
 * yükseltir; kısa/aktarma haberler düşük kalır.
 */
function kalitePuani(a) {
  const govde = Math.min(metin(a.body).length, 6000);
  const maddeler = Array.isArray(a.keyPoints) ? a.keyPoints.length : 0;
  const etiket = Array.isArray(a.tags) ? a.tags.length : 0;

  let p = 0;
  p += (govde / 1000) * 30; // 1.200 karakter ≈ 36 puan, 3.000 ≈ 90
  p += Math.min(maddeler, 6) * 8;
  p += Math.min(metin(a.summary).length, 400) / 20;
  p += Math.min(metin(a.comment).length, 600) / 30;
  p += Math.min(metin(a.editorNote).length, 200) / 20;
  p += Math.min(etiket, 6) * 1.5;
  p += typeof a.image === "string" && /^https?:\/\//i.test(a.image) ? 8 : 0;
  p += a.gorselKaynak || (Array.isArray(a.gorselEk) && a.gorselEk.length) ? 4 : 0;
  p += a.breaking === true ? 6 : 0;
  return p;
}

/** Haber vitrine girmeye uygun mu? Uygun değilse nedenini döndürür. */
function kapisi(a) {
  const govde = metin(a.body).length;
  if (govde < ESIK.govde) return "kısa gövde";
  if ((Array.isArray(a.keyPoints) ? a.keyPoints.length : 0) < ESIK.madde) return "maddeli özet yok";
  if (metin(a.summary).length < ESIK.ozet) return "kısa özet";
  if (metin(a.comment).length < ESIK.yorum) return "özgün yorum yok";
  if (metin(a.editorNote).length < ESIK.not) return "editör notu yok";
  if (typeof a.image !== "string" || !/^https?:\/\//i.test(a.image)) return "fotoğraf yok";
  if (isJunkArticle(a)) return "spam başlık";
  if (!a.category || a.category === "Diğer") return "kategorisiz";
  return "";
}

function okuArticles() {
  if (!existsSync(ARTICLES)) return [];
  try {
    const d = JSON.parse(readFileSync(ARTICLES, "utf8"));
    const list = Array.isArray(d) ? d : d.articles;
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error(`İndeks: articles.json okunamadı: ${err.message}`);
    return [];
  }
}

function main() {
  const articles = okuArticles();
  if (!articles.length) {
    console.log("İndeks: haber yok, data/indeks.json yazılmadı.");
    return;
  }

  const sinir = Date.now() - PENCERE_GUN * 86400000;
  const adaylar = articles.filter((a) => {
    const t = yayinZamani(a);
    return t && t >= sinir;
  });

  const red = {};
  const uygun = [];
  for (const a of adaylar) {
    const neden = kapisi(a);
    if (neden) {
      red[neden] = (red[neden] || 0) + 1;
      continue;
    }
    uygun.push(a);
  }

  // Yüksek puan önce; eşitlikte yeni haber ve id (deterministik sıra).
  const sirali = [...uygun].sort(
    (a, b) =>
      kalitePuani(b) - kalitePuani(a) ||
      yayinZamani(b) - yayinZamani(a) ||
      String(a.id).localeCompare(String(b.id))
  );

  const kabul = [];
  const tekrarlar = [];
  const gunSayaci = new Map();
  const baslikIndeksi = [];

  for (const a of sirali) {
    const gun = gunAnahtari(yayinZamani(a));
    if (!gun) continue;

    // Tekrar kontrolü kotadan ÖNCE yapılır: aynı olayın kopyası günlük
    // kontenjanı tüketmesin, yerine farklı bir haber girsin.
    const eslesen = baslikIndeksi.find((e) => ayniOlay(a.title, e.title));
    if (eslesen) {
      tekrarlar.push({ title: a.title, twin: eslesen.title });
      red.tekrar = (red.tekrar || 0) + 1;
      continue;
    }

    if ((gunSayaci.get(gun) || 0) >= GUNLUK) {
      red["günlük kota"] = (red["günlük kota"] || 0) + 1;
      continue;
    }

    baslikIndeksi.push({ title: a.title, id: String(a.id) });
    gunSayaci.set(gun, (gunSayaci.get(gun) || 0) + 1);
    kabul.push(a);
  }

  const days = {};
  for (const a of kabul) {
    const gun = gunAnahtari(yayinZamani(a));
    if (!days[gun]) days[gun] = [];
    days[gun].push(String(a.id));
  }

  const ids = kabul.map((a) => String(a.id));

  const cikti = {
    updatedAt: new Date().toISOString(),
    gunluk: GUNLUK,
    pencereGun: PENCERE_GUN,
    esik: ESIK,
    toplamHaber: articles.length,
    aday: adaylar.length,
    uygun: uygun.length,
    secilen: ids.length,
    red,
    ornekTekrarlar: tekrarlar.slice(0, 20),
    days,
    ids,
  };
  mkdirSync(DATA, { recursive: true });
  writeFileSync(CIKTI, `${JSON.stringify(cikti, null, 2)}\n`, "utf8");

  const redOzet = Object.entries(red)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  console.log(
    `İndeks: ${articles.length} haber → ${adaylar.length} aday → ${ids.length} çekirdek URL ` +
      `(${Object.keys(days).length} gün, günde en iyi ${GUNLUK})` +
      (redOzet ? `\n  Elemeler → ${redOzet}` : "")
  );
}

main();
