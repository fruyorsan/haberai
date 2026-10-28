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
//     telif güvenli fotoğraf, spam olmayan başlık.
//   - Tekrar ayıklama: başlık benzerliği + günlük kota (varsayılan 32/gün).
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

/**
 * Önceki turda dizine açılmış id'ler.
 *
 * Google'da bir kez dizine girmiş URL'yi "kalite sıralaması biraz değişti"
 * diye noindex'e düşürmek, sürekli değişen bir site sinyali üretir. Bu yüzden
 * yeni seçim eski çekirdeğin üzerine kurulur: eski URL'ler yalnızca haber
 * silinmişse düşer.
 */
function oncekiIndeks() {
  try {
    if (!existsSync(CIKTI)) return new Set();
    const d = JSON.parse(readFileSync(CIKTI, "utf8"));
    const ids = Array.isArray(d.ids) ? d.ids : Object.values(d.days || {}).flat();
    return new Set((ids || []).map(String));
  } catch {
    return new Set();
  }
}

/**
 * Günde vitrine girecek en iyi haber sayısı.
 *
 * 32 → 75 (27.10.2026): arşivde kalite kapısını geçen 2.700+ haber varken
 * yalnızca ~400'ü dizine açıktı. Google'a "sitemde 4.800 haber var ama
 * 4.400'ü noindex" demek, trafik düşüşünde en büyük kendi kendine zarar
 * veren kalıptı. Günlük kota, tek bir günün çekirdeği doldurmasını önler;
 * toplam kota (aşağıda) arşivin tamamının indekslenmesini engeller.
 */
const GUNLUK = Number(process.env.INDEKS_GUNLUK || 75);
/** Çekirdeğin toplam üst sınırı. 0 = sınırsız. */
const TOPLAM = Number(process.env.INDEKS_TOPLAM || 900);
/** Çekirdeğin geriye dönük penceresi (gün). */
const PENCERE_GUN = Number(process.env.INDEKS_PENCERE_GUN || 45);

/**
 * Kalite kapısı eşikleri. Ortam değişkeniyle gevşetilebilir; amaç kaliteyi
 * düşürmek değil, toplu üretimdeki ince haberleri vitrinden uzak tutmaktır.
 */
const ESIK = {
  /** Gövde (karakter). ~250 kelime. */
  govde: Number(process.env.INDEKS_MIN_GOVDE ?? 1200),
  /** En az paragraf sayısı (gövde). */
  paragraf: Number(process.env.INDEKS_MIN_PARAGRAF ?? 3),
  /** Her paragrafın en az karakteri (en az `paragraf` kadarı dolu olmalı). */
  paragrafKarakter: Number(process.env.INDEKS_MIN_PARAGRAF_KARAKTER ?? 120),
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

/** Gövde paragrafları (boş olanlar atılır). */
const paragraflar = (a) =>
  (Array.isArray(a?.body) ? a.body : []).map(metin).filter(Boolean);

/** Karşılaştırma için sadeleştirilmiş metin (noktalama ve büyük/küçük farkı yok). */
const sadeles = (s) =>
  metin(s)
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const kelimeler = (s) => sadeles(s).split(" ").filter(Boolean);

/** İki metin arasında `n` kelimelik birebir ortak dizi var mı? */
function ortakDizi(a, b, n = 8) {
  const wa = kelimeler(a);
  const wb = kelimeler(b);
  if (wa.length < n || wb.length < n) return false;
  const kume = new Set();
  for (let i = 0; i + n <= wb.length; i++) kume.add(wb.slice(i, i + n).join(" "));
  for (let i = 0; i + n <= wa.length; i++) {
    if (kume.has(wa.slice(i, i + n).join(" "))) return true;
  }
  return false;
}

/** İki metin aynı ya da biri diğerinin neredeyse tamamı mı? */
function ayniMetin(a, b) {
  const x = sadeles(a);
  const y = sadeles(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const kisa = x.length <= y.length ? x : y;
  const uzun = x.length <= y.length ? y : x;
  return kisa.length >= 120 && uzun.includes(kisa);
}

/**
 * Kullanılabilir görsel: yerel kapak (/...) ya da haberin kaynağındaki gerçek
 * fotoğraf (https). Kaynak sitelerin og:image / yazı içi fotoğrafları habere
 * özgü olduğu için çekirdeğe girebilir; yalnızca boş/yer tutucu adresler elenir.
 */
const kullanilabilirGorsel = (u) =>
  typeof u === "string" && (/^\/(?!\/)/.test(u) || /^https?:\/\//i.test(u));

/**
 * Kalite puanı — SABİT (zamana bağlı değil), böylece sıralama kaymaz.
 * Uzun ve özgün gövde, maddeli özet, editör notu ve telif güvenli fotoğraf
 * puanı yükseltir; kısa/aktarma haberler düşük kalır.
 */
function kalitePuani(a) {
  const govde = Math.min(metin(a.body).length, 6000);
  const govdeParagraf = paragraflar(a);
  const maddeler = Array.isArray(a.keyPoints) ? a.keyPoints.length : 0;
  const etiket = Array.isArray(a.tags) ? a.tags.length : 0;

  let p = 0;
  p += (govde / 1000) * 30; // 1.200 karakter ≈ 36 puan, 3.000 ≈ 90
  p += Math.min(govdeParagraf.length, 7) * 2;
  p += Math.min(maddeler, 6) * 8;
  p += Math.min(metin(a.summary).length, 400) / 20;
  p += Math.min(metin(a.comment).length, 600) / 30;
  p += Math.min(metin(a.editorNote).length, 200) / 20;
  p += Math.min(etiket, 6) * 1.5;
  // Görsel: kalite kapısı zaten kullanılabilir görsel şartı koyuyor, yani bu
  // puan tek başına eleme yapmaz — sıralamayı ayrıştırır. Kendi/yerel kapak
  // görseli ve ek görseller (gorselEk) stok fotoğraftan daha ilgi çekici
  // olduğu için öne geçer.
  const yerelGorsel = typeof a.image === "string" && /^\/(?!\/)/.test(a.image);
  const ekGorsel = Array.isArray(a.gorselEk) ? a.gorselEk.length : 0;
  p += yerelGorsel ? 14 : 6;
  p += Math.min(ekGorsel, 3) * 4;
  p += a.breaking === true ? 6 : 0;
  return p;
}

/** Haber vitrine girmeye uygun mu? Uygun değilse nedenini döndürür. */
function kapisi(a) {
  const govdeMetni = metin(a.body);
  const govde = govdeMetni.length;
  if (govde < ESIK.govde) return "kısa gövde";

  const govdeParagraf = paragraflar(a);
  if (govdeParagraf.length < ESIK.paragraf) return "paragraf yapısı zayıf";
  const doluParagraf = govdeParagraf.filter((p) => p.length >= ESIK.paragrafKarakter).length;
  if (doluParagraf < ESIK.paragraf) return "kısa paragraflar";

  // Aynı cümlenin/paragrafın iç tekrarı: metni şişirilmiş görünümden koparır.
  for (let i = 0; i < govdeParagraf.length; i++) {
    for (let j = i + 1; j < govdeParagraf.length; j++) {
      if (ayniMetin(govdeParagraf[i], govdeParagraf[j])) return "tekrarlı paragraf";
    }
  }

  if ((Array.isArray(a.keyPoints) ? a.keyPoints.length : 0) < ESIK.madde) return "maddeli özet yok";

  const ozet = metin(a.summary);
  if (ozet.length < ESIK.ozet) return "kısa özet";
  // Özet, gövdenin ilk paragrafının kopyası ya da gövdeden uzun bir dizi
  // taşıyorsa "özgün özet" değildir; vitrine alınmaz.
  if (govdeParagraf.some((p) => ayniMetin(ozet, p)) || ortakDizi(ozet, govdeMetni, 8)) {
    return "özet gövdeyle aynı";
  }

  const yorum = metin(a.comment);
  if (yorum.length < ESIK.yorum) return "özgün yorum yok";
  // Yorum; özet veya gövdeden uzun bir cümle dizisi kopyalıyorsa analiz değil
  // tekrardır. (Yorumun kendi yargısı ve somut bir ayrıntı içermesi beklenir.)
  if (ortakDizi(yorum, `${ozet} ${govdeMetni}`, 8)) return "yorum özgün değil";

  const not = metin(a.editorNote);
  if (not.length < ESIK.not) return "editör notu yok";
  if (ayniMetin(not, ozet) || ayniMetin(not, yorum) || ortakDizi(not, ozet, 8)) {
    return "editör notu özetle aynı";
  }

  if (typeof a.image !== "string" || !a.image) return "fotoğraf yok";
  if (!kullanilabilirGorsel(a.image)) return "geçersiz görsel";
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

  // Toplam kota: kabul listesi kalite sırasındadır; en iyi TOPLAM haber kalır.
  // Böylece yeni gelen düşük kaliteli bir haber, eski ve güçlü bir haberin
  // yerini almaz.
  if (TOPLAM > 0 && kabul.length > TOPLAM) {
    red["toplam kota"] = (red["toplam kota"] || 0) + (kabul.length - TOPLAM);
    kabul.length = TOPLAM;
  }

  // İndeks sürekliliği: dün dizinde olan bir URL bugün noindex'e düşmesin.
  // Bu istisna toplam kotanın biraz üzerine çıkabilir (birkaç on URL); kota
  // zaten büyümeyi sınırlamak için var, mevcut dizini küçültmek için değil.
  const secili = new Set(kabul.map((a) => String(a.id)));
  const idMap = new Map(articles.map((a) => [String(a.id), a]));
  let geriEklenen = 0;
  for (const id of oncekiIndeks()) {
    if (secili.has(id)) continue;
    const a = idMap.get(id);
    if (!a) continue;
    kabul.push(a);
    secili.add(id);
    geriEklenen++;
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
    toplam: TOPLAM,
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
      `(${Object.keys(days).length} gün, günde en iyi ${GUNLUK}` +
      (geriEklenen ? `, önceki çekirdekten ${geriEklenen} URL korundu` : "") +
      ")" +
      (redOzet ? `\n  Elemeler → ${redOzet}` : "")
  );
}

main();
