// KAPAK SAHNE HAVUZU ÜRETİCİ
//
// NEDEN: Commons'tan "arama" ile fotoğraf seçmek güvenilmez. Türkçe başlıkla
// İngilizce dosya adı örtüşmüyor ("Maserati" → Venezuela peyniri). Kategori
// üyeliği konuyu doğrular ama sahne yine rastgele: dizüstü bilgisayar haberine
// 1980'lerin ana bilgisayar odası düşüyor.
//
// ÇÖZÜM: Bir kez üretilen, ELLE ONAYLANMIŞ sahne havuzu. Arama, lisans
// kategorisiyle sınırlanır (`incategory:CC-Zero`), yani sonuçların atıf
// gerektirmediği Commons tarafından garanti edilir; script ayrıca lisans
// alanını tekrar doğrular. Kareler `data/kapak-havuz/` altına 1600×900 JPEG
// olarak yazılır (çalışma anında internet gerekmez, tekrar riski yok).
//
// Ardından kategori başına temas sayfası (contact sheet) üretilir; görseller
// gözle onaylanır.
//
//   node scripts/kapak-havuz-olustur.mjs            → indir + temas sayfası
//   node scripts/kapak-havuz-olustur.mjs --kuru     → indirmeden listele
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HAVUZ_DIZIN = path.join(KOK, "data", "kapak-havuz");
const HAVUZ_JSON = path.join(KOK, "data", "kapak-havuz.json");
const TEMA_DIZIN = path.join(KOK, "data", "kapak-havuz-tema");
const KURU = process.argv.includes("--kuru");
const HEDEF = Number(process.env.HAVUZ_ADET || 14);

const UA = "HaberinaiBot/1.0 (+https://haberinai.site; iletisim@haberinai.site)";
const COMMONS = "https://commons.wikimedia.org/w/api.php";
const IZINLI = /^(cc0\b|public domain\b|pd\b|pd[- ].*|no restrictions\b|copyrighted free use\b)/i;
const KOTU =
  /\b(logo|logos|map|maps|diagram|chart|graph|poster|cover|screenshot|screen shot|scan|scanned|icon|flag|coat of arms|seal|banknote|stamp|coin|signature|drawing|illustration|cartoon|clipart|svg|pdf|document|table|infographic|wikimedia|commons|wikidata|menu|display|thumbnail|unnamed|untitled|placeholder|no image|no photo|policies|policy brief|press release|art project|painting|postcard|album|grave|tomb|portrait|selfie|protest|demonstration|banner|graph|number of|statistics|chart)\b/i;
// Eski/tarama/illüstrasyon: kapak olarak haber gibi durmuyor.
const ESKI =
  /(black and white|monochrome|archival|historical|engraving|lithograph|fortepan|wellcome|bundesarchiv|nationaal archief|constantinople|stamboul|lccn|museum|plateau|woodcut|facsimile|sketch|watercolor)/i;

// Kategori → İngilizce arama cümleleri. Hepsi "sahne" tarifi: bir haber
// fotoğrafı gibi görünen, konuyu doğrudan anlatan kareler.
const KONU = {
  Teknoloji: ["circuit board", "microchip", "electronic components", "soldering electronics"],
  "Yapay Zeka": ["robot arm industry", "humanoid robot", "robot vacuum", "industrial robot"],
  Mobil: ["smartphone in hand", "smartphone on table", "mobile phone camera", "phone apps screen"],
  Oyun: ["video game controller", "arcade hall", "gaming console", "esports gaming"],
  Donanım: ["computer hardware", "graphics card", "computer keyboard desk", "laptop repair"],
  Yazılım: ["programming source code", "programmer laptop", "code screen terminal"],
  İnternet: ["server room", "data center building", "network cables", "fiber optic cables"],
  Bilim: ["laboratory scientist", "microscope research", "chemistry laboratory", "telescope observatory"],
  Uzay: ["rocket launch", "spacecraft orbit", "astronaut spacewalk", "satellite earth"],
  Sağlık: ["hospital corridor", "doctor stethoscope", "medical equipment", "ambulance"],
  Kültür: ["concert stage lights", "art gallery visitors", "theatre auditorium", "cinema audience"],
  Yaşam: ["street food market", "cafe terrace people", "park bench autumn", "family picnic park"],
  Otomobil: ["car on road", "electric car charging", "car factory", "automobile traffic"],
  Ekonomi: ["euro banknotes coins", "shopping mall interior", "business meeting office", "shipping containers port"],
  Spor: ["football stadium", "football match", "basketball game", "athletics running track"],
  Gündem: ["Istanbul street", "Istanbul square", "Istanbul bazaar", "city traffic Turkey"],
  Dünya: ["earth from space", "airplane takeoff", "cargo ship port", "passport travel"],
  Diğer: ["newspaper stack", "library books", "reading newspaper"],
};

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) =>
  String(s || "")
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }[c]))
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const duzMetin = (v, max = 120) =>
  String(v || "")
    .replace(/<span[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/span>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

async function ara(sorgu, adet = 20) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    generator: "search",
    gsrnamespace: "6",
    // Lisans kategorisiyle sınırla: atıf gerektirmeyen dosyalar.
    gsrsearch: `${sorgu} incategory:CC-Zero filetype:bitmap`,
    gsrlimit: String(adet),
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiextmetadatafilter: "LicenseShortName|Artist|LicenseUrl|ImageDescription",
    iiurlwidth: "1600",
  });
  const res = await fetch(`${COMMONS}?${params}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) return [];
  const json = await res.json();
  const sayfalar = Object.values(json?.query?.pages || {});
  const uygun = [];
  // Commons arama motoru esnek: "artificial intelligence robot" sorgusuna
  // bıldırcın yemeği ("quail") döndürebiliyor (קווייל/benzeri eşleşmeler).
  // Bu yüzden dosya adı ya da açıklaması, sorgunun ANLAMLI bir kelimesini
  // içermek zorunda.
  const anlamli = sorgu
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
  for (const s of sayfalar) {
    const ii = s?.imageinfo?.[0];
    if (!ii) continue;
    const baslik = String(s.title || "").replace(/^File:/i, "");
    if (!/\.jpe?g$/i.test(baslik)) continue;
    const lisans = duzMetin(ii.extmetadata?.LicenseShortName?.value, 40);
    if (!IZINLI.test(lisans)) continue;
    if (/^pd[\s-]?art/i.test(lisans)) continue;
    if (KOTU.test(baslik)) continue;
    if (ESKI.test(baslik)) continue;
    const aciklama = duzMetin(ii.extmetadata?.ImageDescription?.value, 120);
    const metin = `${baslik} ${aciklama}`.toLowerCase();
    if (!anlamli.some((t) => metin.includes(t))) continue;
    const w = Number(ii.width) || 0;
    const h = Number(ii.height) || 0;
    if (w < 1400 || h < 800) continue;
    const oran = w / h;
    if (oran < 1.2 || oran > 2.6) continue;
    const url = String(ii.thumburl || ii.url || "").split("?")[0];
    if (!/^https:\/\/(upload|thumb)\.wikimedia\.org\//i.test(url)) continue;
    uygun.push({
      dosya: baslik,
      url,
      sayfa: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(baslik.replace(/ /g, "_"))}`,
      lisans,
      yazar: duzMetin(ii.extmetadata?.Artist?.value, 70),
      genislik: w,
      yukseklik: h,
      aciklama,
    });
  }
  uygun.sort((a, b) => b.genislik * b.yukseklik - a.genislik * a.yukseklik);
  return uygun;
}

async function indir(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (res.status === 429) { await bekle(3000 * (i + 1)); continue; }
      return null;
    } catch {
      await bekle(1500);
    }
  }
  return null;
}

// Aynı nesnenin 8 kare fotoğrafı (bir stadyumun 6 açısı) kapak havuzunda
// çeşitlilik sağlamaz. Dosya adındaki ek/numara farkını atarak "aile"
// oluşturulur; her aileden en fazla AİLE_SINIR kare alınır.
const aileAnahtari = (baslik) =>
  String(baslik || "")
    .toLowerCase()
    .replace(/\.(jpe?g|png)$/i, "")
    .replace(/[_\s-]+/g, " ")
    .replace(/\b(top|bottom|front|back|side|overhead|view|detail|close ?up|left|right)\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const AİLE_SINIR = 2;

// ---------------------------------------------------------------- kalite süzgeci
// İndirilen kare, kapak olarak kullanılmadan önce ÖLÇÜLÜR. Dosya adına bakmak
// yetmiyor: "laboratory" araması 1950'lerin siyah-beyaz arşivini, aynı sahnenin
// on kopyasını getirebiliyor.

/** Ortalama renk doygunluğu (0-1). Siyah-beyaz/sepya kareler elenir. */
async function doygunluk(buf) {
  const { data, info } = await sharp(buf)
    .resize(64, 64, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let toplam = 0;
  const n = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    toplam += max === 0 ? 0 : (max - min) / max;
  }
  return toplam / n;
}

/** 64 bitlik fark hash'i (dHash): benzer kareleri yakalar. */
async function dhash(buf) {
  const { data, info } = await sharp(buf)
    .resize(9, 8, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let hash = 0n;
  let bit = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const sol = data[y * info.width + x];
      const sag = data[y * info.width + x + 1];
      if (sol > sag) hash |= 1n << bit;
      bit++;
    }
  }
  return hash;
}

const hamming = (a, b) => {
  let x = a ^ b;
  let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
};

/** Kare kapak olarak kullanılabilir mi? */
async function kaliteli(buf, mevcutHashler) {
  try {
    const doy = await doygunluk(buf);
    // 0.06 altı: pratikte gri/tek renk. Haber fotoğrafı gibi durmuyor.
    if (doy < 0.06) return { ok: false, neden: "renksiz" };
    const h = await dhash(buf);
    for (const m of mevcutHashler) {
      // 10 bitten az fark: aynı sahnenin/nesnenin yakın kopyası.
      if (hamming(h, m) <= 10) return { ok: false, neden: "benzer" };
    }
    return { ok: true, hash: h, doygunluk: doy };
  } catch {
    return { ok: false, neden: "okunamadi" };
  }
}

fs.mkdirSync(HAVUZ_DIZIN, { recursive: true });
fs.mkdirSync(TEMA_DIZIN, { recursive: true });

const havuz = fs.existsSync(HAVUZ_JSON) ? JSON.parse(fs.readFileSync(HAVUZ_JSON, "utf8")) : {};
let eklenen = 0;

for (const [kategori, sorgular] of Object.entries(KONU)) {
  havuz[kategori] = Array.isArray(havuz[kategori]) ? havuz[kategori] : [];
  const mevcut = new Set(havuz[kategori].map((g) => g.dosya));
  // Tüm havuzdaki dosya adları (kategoriler arası çakışma da olmasın).
  const mevcutAdlar = new Set(Object.values(havuz).flat().map((g) => g.ad));
  const aileler = {};
  for (const g of havuz[kategori]) {
    const k = aileAnahtari(g.dosya);
    aileler[k] = (aileler[k] || 0) + 1;
  }
  // Mevcut havuzun parmak izleri: yeni aday bu karelere benzemesin.
  const hashler = [];
  for (const g of havuz[kategori]) {
    try {
      hashler.push(await dhash(await sharp(path.join(KOK, g.yerel)).toBuffer()));
    } catch { /* bozuk dosya: yok say */ }
  }
  console.log(`\n[${kategori}] ${havuz[kategori].length}/${HEDEF}`);
  let redRenksiz = 0, redBenzer = 0;
  for (const sorgu of sorgular) {
    if (havuz[kategori].length >= HEDEF) break;
    const adaylar = await ara(sorgu, 20);
    console.log(`  "${sorgu}" → ${adaylar.length} aday`);
    for (const g of adaylar) {
      if (havuz[kategori].length >= HEDEF) break;
      if (mevcut.has(g.dosya)) continue;
      const aile = aileAnahtari(g.dosya);
      if ((aileler[aile] || 0) >= AİLE_SINIR) continue;
      const ozet = slug(g.dosya.replace(/\.jpe?g$/i, "")).slice(0, 40);
      // Dosya adı BENZERSİZ olmalı: aynı ad iki kayda verilirse biri diğerinin
      // dosyasını ezer ve seçimde "dosya yok" hatası çıkar.
      let ad = `${slug(kategori)}-${ozet}-${aile.length % 1000}${g.dosya.length % 100}.jpg`;
      if (mevcutAdlar.has(ad)) {
        let s = 2;
        while (mevcutAdlar.has(ad.replace(/\.jpg$/, `-${s}.jpg`))) s++;
        ad = ad.replace(/\.jpg$/, `-${s}.jpg`);
      }
      const hedef = path.join(HAVUZ_DIZIN, ad);
      if (KURU) { console.log(`    + ${ad}`); eklenen++; mevcutAdlar.add(ad); aileler[aile] = (aileler[aile] || 0) + 1; continue; }
      if (!fs.existsSync(hedef)) {
        const veri = await indir(g.url);
        if (!veri || veri.length < 40000) { await bekle(600); continue; }
        // KALİTE SÜZGECİ: indirilen ham veri üzerinde, diske yazmadan önce.
        const karar = await kaliteli(veri, hashler);
        if (!karar.ok) {
          if (karar.neden === "renksiz") redRenksiz++;
          if (karar.neden === "benzer") redBenzer++;
          continue;
        }
        try {
          await sharp(veri)
            // Kapak 1280×720; havuzda da aynı boyutu tutmak depoyu küçük,
            // üretimi hızlı tutar (yeniden kırpma gerekmez).
            .resize(1280, 720, { fit: "cover", position: "attention" })
            .jpeg({ quality: 82, mozjpeg: true })
            .toFile(hedef);
        } catch {
          continue;
        }
        hashler.push(karar.hash);
        await bekle(400);
      }
      havuz[kategori].push({ ...g, yerel: `data/kapak-havuz/${ad}`, ad });
      mevcut.add(g.dosya);
      aileler[aile] = (aileler[aile] || 0) + 1;
      eklenen++;
      console.log(`    + ${ad}`);
    }
    await bekle(900);
  }
  console.log(`  elenen: ${redRenksiz} renksiz, ${redBenzer} benzer`);
}

if (!KURU) fs.writeFileSync(HAVUZ_JSON, JSON.stringify(havuz, null, 2) + "\n", "utf8");
const toplam = Object.values(havuz).reduce((n, l) => n + l.length, 0);
console.log(`\nHavuz: ${toplam} görsel (${eklenen} yeni)`);
for (const [k, l] of Object.entries(havuz)) console.log(`  ${k.padEnd(12)} ${l.length}`);

// ---------------------------------------------------------------- temas sayfası
if (!KURU) {
  for (const [kategori, liste] of Object.entries(havuz)) {
    if (!liste.length) continue;
    const KUTU = 380;
    const KOLON = 4;
    const satir = Math.ceil(liste.length / KOLON);
    const parcalar = [];
    for (const [i, g] of liste.entries()) {
      const x = (i % KOLON) * KUTU;
      const y = Math.floor(i / KOLON) * KUTU;
      try {
        const buf = await sharp(path.join(KOK, g.yerel))
          .resize(KUTU - 8, KUTU - 8, { fit: "cover" })
          .toBuffer();
        parcalar.push({ input: buf, left: x + 4, top: y + 4 });
      } catch {
        continue;
      }
    }
    if (!parcalar.length) continue;
    await sharp({
      create: {
        width: KOLON * KUTU,
        height: satir * KUTU,
        channels: 3,
        background: "#111",
      },
    })
      .composite(parcalar)
      .png()
      .toFile(path.join(TEMA_DIZIN, `${slug(kategori)}.png`));
  }
  console.log(`\nTemas sayfaları: ${TEMA_DIZIN}`);
}

// ------------------------------------------------------------- numaralı tema
// Seçim yapmak için her kareye numara basılır. Kullanım: sheet'e bak,
// `data/kapak-havuz-secim.json` içine kategori başına TUTULACAK numaraları yaz,
// sonra `--sec` ile havuzu daralt.
if (process.argv.includes("--numarali")) {
  for (const [kategori, liste] of Object.entries(havuz)) {
    if (!liste.length) continue;
    const KUTU = 400;
    const KOLON = 4;
    const satir = Math.ceil(liste.length / KOLON);
    const parcalar = [];
    for (const [i, g] of liste.entries()) {
      const x = (i % KOLON) * KUTU;
      const y = Math.floor(i / KOLON) * KUTU;
      try {
        const buf = await sharp(path.join(KOK, g.yerel))
          .resize(KUTU - 8, KUTU - 8, { fit: "cover" })
          .toBuffer();
        parcalar.push({ input: buf, left: x + 4, top: y + 4 });
        const etiket = Buffer.from(
          `<svg width="120" height="56"><rect width="120" height="56" fill="#000" opacity="0.72"/>` +
            `<text x="12" y="40" font-family="Arial" font-size="34" font-weight="bold" fill="#fff">${i}</text></svg>`
        );
        parcalar.push({ input: etiket, left: x + 4, top: y + 4 });
      } catch {
        continue;
      }
    }
    if (!parcalar.length) continue;
    await sharp({
      create: { width: KOLON * KUTU, height: satir * KUTU, channels: 3, background: "#111" },
    })
      .composite(parcalar)
      .png()
      .toFile(path.join(TEMA_DIZIN, `${slug(kategori)}-numarali.png`));
  }
  console.log(`Numaralı temas sayfaları: ${TEMA_DIZIN}`);
}

// ------------------------------------------------------------------ seçim
// data/kapak-havuz-secim.json  →  { "Spor": [0,2,3], ... }
// Listede olmayan kategoriler olduğu gibi bırakılır.
if (process.argv.includes("--sec")) {
  const secimYolu = path.join(KOK, "data", "kapak-havuz-secim.json");
  if (!fs.existsSync(secimYolu)) {
    console.error("data/kapak-havuz-secim.json yok.");
    process.exit(1);
  }
  const secim = JSON.parse(fs.readFileSync(secimYolu, "utf8"));
  let atilan = 0;
  for (const [kategori, indeksler] of Object.entries(secim)) {
    const liste = havuz[kategori] || [];
    if (!Array.isArray(indeksler) || !indeksler.length) continue;
    const tutulan = indeksler.map((i) => liste[i]).filter(Boolean);
    atilan += liste.length - tutulan.length;
    // Kullanılmayan dosyaları diskten de sil.
    for (const g of liste) {
      if (!tutulan.includes(g)) {
        try { fs.unlinkSync(path.join(KOK, g.yerel)); } catch { /* zaten yok */ }
      }
    }
    havuz[kategori] = tutulan;
  }
  fs.writeFileSync(HAVUZ_JSON, JSON.stringify(havuz, null, 2) + "\n", "utf8");
  console.log(`Seçim uygulandı; ${atilan} kare atıldı.`);
  const toplamSec = Object.values(havuz).reduce((n, l) => n + l.length, 0);
  console.log(`Kalan: ${toplamSec}`);
  for (const [k, l] of Object.entries(havuz)) console.log(`  ${k.padEnd(12)} ${l.length}`);
}
