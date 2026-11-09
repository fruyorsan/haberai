// ==========================================================================
// BAŞLIK ↔ KAPAK UYUMU (v5)
// --------------------------------------------------------------------------
// KULLANICININ ÖRNEKLERİNDEN ÇIKAN KURAL (ShiftDelete / Donanım Haber):
//   Kapak, başlıktaki ÖZNEYİ gösterir; süs fotoğrafı değildir.
//     1. Başlıkta birebir geçen ÜRÜN varsa  -> o ürünün fotoğrafı (tam kare)
//     2. Ürün fotoğrafı yok, MARKA varsa    -> marka kimliği (logo + sahne)
//     3. İkisi de yoksa                     -> konu fotoğrafı (yazısız)
//   Kapakta HABER BAŞLIĞI BASILMAZ. Kocaman yazılı tasarım kartı yok.
//
// LİSANS: yalnızca CC0 / kamu malı / "no restrictions". CC BY ve CC BY-SA
// kullanılmaz (sitede görsel kredisi gösterilmiyor).
//
// KULLANIM:
//   node scripts/kapak-uyum.mjs --limit=8 --out=reports/kapak-uyum-test
// ==========================================================================
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { kapakKaliteOlc } from "../src/kapak-kalite.js";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const W = 1280;
const H = 720;
const UA = "HaberinaiBot/1.0 (+https://haberinai.site; iletisim@haberinai.site)";
const COMMONS = "https://commons.wikimedia.org/w/api.php";
const LOGO_DIZIN = path.join(KOK, "data", "marka-logo");
const HAVUZ_DIZIN = path.join(KOK, "data", "kapak-havuz");

const arg = (ad, vars = null) => {
  const m = process.argv.find((a) => a.startsWith(`--${ad}=`));
  return m ? m.split("=").slice(1).join("=") : vars;
};

// ------------------------------------------------------------------ marka sözlüğü
// sorgu: Commons'ta aranacak BİREBİR ürün/model metni (genel kelime olamaz)
export const MARKALAR = [
  {
    ad: "NVIDIA",
    kelimeler: [/\bnvidia\b/i, /\bgeforce\b/i, /\brtx\s?\d{4}\b/i, /\bgpu\b/i, /\byonga\b/i, /\bekran kart/i],
    sorgular: ["GeForce RTX 4090", "GeForce RTX 3090"],
    logo: "nvidia",
    ton: 108,
  },
  {
    ad: "Apple",
    kelimeler: [/\bapple\b/i, /\biphone\b/i, /\bmacbook\b/i, /\bipad\b/i, /\bairpods?\b/i],
    sorgular: ["iPhone 17 Pro", "iPhone 16 Pro"],
    logo: "apple",
    ton: 210,
  },
  {
    ad: "Samsung",
    kelimeler: [/\bsamsung\b/i, /\bgalaxy\b/i],
    sorgular: ["Samsung Galaxy S25 Ultra", "Samsung Galaxy S24 Ultra"],
    logo: "samsung",
    ton: 212,
  },
  {
    ad: "Xiaomi",
    kelimeler: [/\bxiaomi\b/i, /\bredmi\b/i, /\bpoco\b/i],
    sorgular: ["Xiaomi 15", "Redmi Note 14", "Xiaomi Redmi Note 5"],
    logo: "xiaomi",
    ton: 24,
  },
  {
    ad: "Google",
    kelimeler: [/\bgoogle\b/i, /\bandroid\b/i, /\bgemini\b/i, /\bpixel\b/i],
    sorgular: ["Google Pixel 9 Pro", "Google Pixel 8"],
    logo: "googlegemini",
    ton: 262,
  },
  {
    ad: "OpenAI",
    kelimeler: [/\bopenai\b/i, /\bchatgpt\b/i, /\bgpt-?\d/i, /\bsora\b/i],
    sorgular: [],
    logo: "openai",
    ton: 158,
  },
  {
    ad: "Anthropic",
    kelimeler: [/\banthropic\b/i, /\bclaude\b/i],
    sorgular: [],
    logo: "anthropic",
    ton: 30,
  },
  {
    ad: "Microsoft",
    kelimeler: [/\bmicrosoft\b/i, /\bwindows\b/i, /\bcopilot\b/i, /\bxbox\b/i, /\bsurface\b/i],
    sorgular: ["Xbox Series X"],
    logo: "xbox",
    ton: 120,
  },
  {
    ad: "Meta",
    kelimeler: [/\bmeta\b/i, /\binstagram\b/i, /\bwhatsapp\b/i, /\bquest\b/i, /\boculus\b/i],
    sorgular: ["Meta Quest 3"],
    logo: "meta",
    ton: 216,
  },
  {
    ad: "Netflix",
    kelimeler: [/\bnetflix\b/i],
    sorgular: [],
    logo: "netflix",
    ton: 356,
  },
  {
    ad: "Spotify",
    kelimeler: [/\bspotify\b/i],
    sorgular: [],
    logo: "spotify",
    ton: 138,
  },
  {
    ad: "Tesla",
    kelimeler: [/\btesla\b/i],
    sorgular: ["Tesla Model 3"],
    logo: "tesla",
    ton: 0,
  },
  {
    ad: "Intel",
    kelimeler: [/\bintel\b/i, /\bcore ultra\b/i],
    sorgular: ["Intel Core i9"],
    logo: "intel",
    ton: 205,
  },
  {
    ad: "AMD",
    kelimeler: [/\bamd\b/i, /\bryzen\b/i, /\bradeon\b/i],
    sorgular: ["Ryzen 9 7950X", "AMD Ryzen"],
    logo: "amd",
    ton: 12,
  },
  {
    ad: "Qualcomm",
    kelimeler: [/\bqualcomm\b/i, /\bsnapdragon\b/i],
    sorgular: [],
    logo: "qualcomm",
    ton: 210,
  },
  {
    ad: "BİM",
    kelimeler: [/\bb[İi]M\b/],
    sorgular: ["Bim mağazası konya", "BİM market"],
    logo: null,
    ton: 356,
  },
  {
    ad: "Binance",
    kelimeler: [/\bbinance\b/i, /\bkripto\b/i, /\bbitcoin\b/i, /\bethereum\b/i],
    sorgular: [],
    logo: "binance",
    ton: 44,
  },
  {
    ad: "ASELSAN",
    kelimeler: [/\baselsan\b/i, /\bg[Öö]kden[iİ]z\b/i, /\bsavunma\b/i],
    sorgular: ["ASELSAN"],
    logo: null,
    ton: 205,
  },
];

export function markaBul(baslik, ozet = "") {
  const metin = `${baslik} ${ozet}`;
  for (const m of MARKALAR) if (m.kelimeler.some((r) => r.test(metin))) return m;
  return null;
}

// ------------------------------------------------------------------ SAHNE SÖZLÜĞÜ
// KULLANICININ SON UYARISI: "chat gpt mi binance mi netflix mi... bunlar kapaktaki
// başlıkla yani HABERLE ALAKALI olmalı." Düz logo kartı markayı gösteriyor ama
// HABERİ anlatmıyor. Bu yüzden kapak artık gerçek bir SAHNE fotoğrafı: haberin
// konusunu gösteren kare + köşede marka imzası (kullanıcının ASELSAN örneği).

// ------------------------------------------------------------------ ürün tipi
// KULLANICININ 4. HATASI: "Xiaomi Redmi M100 telefon" haberine Xiaomi'nin
// ARABASI (SU7) konmuştu. Marka eşleşmesi tek başına yetmez; cihaz TÜRÜ de
// eşleşmeli. Başlıktaki tip kelimesi ile fotoğrafın tipi aynı olmalı.
const TIPLER = {
  telefon: {
    baslik: /\b(telefon|ak[ıi]ll[ıi] telefon|smartphone|iphone|redmi|poco|pixel|galaxy s\d|nit ekran|kamera|selfie|foldable|katlanabilir)\b/i,
    dosya: /\b(phone|smartphone|iphone|galaxy|redmi|pixel|xiaomi \d|mobile|handset|fold|front|back|rear)\b/i,
    marka: { Apple: true, Samsung: true, Xiaomi: true, Google: true },
  },
  laptop: {
    baslik: /\b(laptop|diz[üu]st[üu]|notebook|macbook|ultrabook|chromebook)\b/i,
    dosya: /\b(laptop|notebook|macbook|thinkpad|ultrabook|chromebook|computer|keyboard)\b/i,
    marka: { Apple: true, Microsoft: true, Intel: true, AMD: true },
  },
  konsol: {
    baslik: /\b(konsol|console|playstation|ps5|xbox|nintendo|switch|oyun konsolu)\b/i,
    dosya: /\b(console|playstation|ps5|xbox|nintendo|switch|controller|gamepad)\b/i,
    marka: { Microsoft: true },
  },
  ekranKarti: {
    baslik: /\b(ekran kart[ıi]|gpu|geforce|rtx|radeon|yonga|grafik i[şs]lemci)\b/i,
    dosya: /\b(graphics card|gpu|geforce|rtx|radeon|founders edition|gddr)\b/i,
    marka: { NVIDIA: true, AMD: true },
  },
  islemci: {
    baslik: /\b(i[şs]lemci|cpu|ryzen|core ultra|snapdragon|dimensity|exynos)\b/i,
    dosya: /\b(cpu|processor|ryzen|core i\d|snapdragon|dimensity|socket|die shot)\b/i,
    marka: { Intel: true, AMD: true, Qualcomm: true },
  },
  araba: {
    baslik: /\b(araba|otomobil|ara[çc]|suv|sedan|model [3sy]|elektrikli otomobil|oto)\b/i,
    dosya: /\b(car|automobile|tesla|model [3sy]|suv|sedan|vehicle|su7)\b/i,
    marka: { Tesla: true },
  },
  kulaklik: {
    baslik: /\b(kulakl[ıi]k|headphone|earbuds|airpods|tws)\b/i,
    dosya: /\b(headphone|earphone|earbuds|airpods|headset)\b/i,
    marka: {},
  },
  tv: {
    baslik: /\b(televizyon|\btv\b|soundbar|hoparl[öo]r|projektör)\b/i,
    dosya: /\b(television|\btv\b|soundbar|speaker|monitor|display)\b/i,
    marka: {},
  },
  market: {
    baslik: /\b(market|ma[ğg]aza|[üu]r[üu]n sat|indirim|katalog)\b/i,
    dosya: /\b(market|supermarket|shop|store|ma[ğg]aza)\b/i,
    marka: { "BİM": true },
  },
};

/** Başlıktan ürün tipi çıkarır; yoksa markanın varsayılan tipini döndürür. */
export function tipBul(baslik, ozet, markaAd) {
  const metin = `${baslik} ${ozet}`;
  for (const [tip, k] of Object.entries(TIPLER)) {
    if (k.baslik.test(metin)) return tip;
  }
  for (const [tip, k] of Object.entries(TIPLER)) {
    if (markaAd && k.marka[markaAd]) return tip;
  }
  return null;
}

// ------------------------------------------------------------------ sahne (konu) sorguları
// KULLANICININ SON UYARISI: "bunlar kapaktaki başlıkla yani haberle alakalı!!!"
// Marka kartı (koyu zemin + logo) tek başına YETMİYOR: ChatGPT haberi de,
// Netflix haberi de aynı boş kartı alıyordu. Referans karelerdeki dil şu:
//   gerçek bir SAHNE (fabrika, cihaz, tabela, çip, ekran) + marka imzası.
// Bu yüzden marka yolunda önce ÜRÜN fotoğrafı, sonra KONU fotoğrafı denenir;
// ikisi de yoksa ancak o zaman düz marka kartına düşülür.
//
// Sorgular başlıktaki somut kelimelerden türetilir; markanın adı tek başına
// sorgu olmaz (Commons'ta marka adı çoğu zaman logo/ürün standı getiriyor).
// Sorgular Commons'ta GERÇEKTEN CC0 + büyük + fotoğraf döndüren ifadelerden
// seçildi (tek tek ölçüldü). "stock market screen", "programmer working laptop"
// gibi ifadeler orada yalnızca çöp (1909 şehir rehberi, sinema afişi) getiriyor.
const KONU_SORGULARI = {
  telefon: ["mobile phone on desk", "smartphone lying", "smartphone in hand"],
  laptop: ["laptop computer desk", "laptop on desk office", "laptop keyboard close up"],
  konsol: ["Xbox One console", "Xbox controller", "game console"],
  ekranKarti: ["Nvidia graphics card", "graphics card", "cpu socket motherboard"],
  islemci: ["semiconductor wafer", "silicon wafer", "cpu socket motherboard"],
  araba: ["Tesla car", "electric car charging station", "car front"],
  kulaklik: ["headphones", "headphones close up"],
  muzik: ["headphones", "headphones close up"],
  tv: ["home cinema", "cinema auditorium seats", "television in living room"],
  market: ["supermarket aisle", "grocery store shelves"],
  // Tip çıkmayan marka haberleri (OpenAI, Netflix, Binance, Spotify...)
  yazilim: ["computer code screen", "data center server room", "computer monitor desk"],
  finans: ["Bitcoin ATM", "bitcoin mining", "stock exchange trading floor"],
  medya: ["film camera on set", "cinema auditorium seats", "television studio camera"],
  savunma: ["naval ship at sea", "warship", "radar antenna"],
  uzay: ["rocket launch", "satellite in space"],
  genel: ["data center server room", "computer circuit board", "computer monitor desk"],
};

/** Başlık/özetten konu anahtarını çıkarır (marka ne olursa olsun). */
function konuAnahtari(baslik, ozet, brand, tip) {
  const bas = String(baslik || "").toLowerCase();
  const m = `${baslik} ${ozet}`.toLowerCase();
  if (tip && KONU_SORGULARI[tip]) return tip;
  // Önce BAŞLIK: asıl konu orada. Özet, markanın alanını ezmesin.
  if (/\b(g[öo]kden[ıi]z|savunma|f[üu]ze|gem[ıi]|radar|drone|iha)\b/.test(bas)) return "savunma";
  if (/\b(uydu|roket|uzay|mars|nasa|spacex)\b/.test(bas)) return "uzay";
  if (/\b(kripto|bitcoin|borsa|dondurul|milyar dolar|sald[ıi]r[ıi])\b/.test(bas)) return "finans";
  if (brand) {
    const varsayilan = {
      OpenAI: "yazilim", Anthropic: "yazilim", Google: "yazilim", NVIDIA: "islemci",
      AMD: "islemci", Intel: "islemci", Qualcomm: "islemci", Arm: "islemci",
      Netflix: "tv", Spotify: "muzik", Meta: "medya",
      Binance: "finans", "BİM": "market", ASELSAN: "savunma", Tesla: "araba",
      Apple: "telefon", Samsung: "telefon", Xiaomi: "telefon", Microsoft: "konsol",
    };
    if (varsayilan[brand.ad]) return varsayilan[brand.ad];
  }
  // Marka yoksa ya da tanınmıyorsa özete de bakılır.
  if (/\b(savunma|f[üu]ze|gem[ıi]|radar|drone|iha)\b/.test(m)) return "savunma";
  if (/\b(film|dizi|yay[ıi]n|sinema|studio|i[çc]erik|yap[ıi]m|[öo]d[üu]l|abone)\b/.test(m)) return "medya";
  if (/\b(yapay zeka|model|gpt|claude|gemini|llm|algoritma|veri merkezi|sunucu|bulut)\b/.test(m))
    return "yazilim";
  if (/\b(kripto|bitcoin|borsa|gelir|ciro|maa[şs]|fiyat)\b/.test(m)) return "finans";
  return "genel";
}

/** Başlığa özgü ek sahne sorguları (genel kelime değil, haberde geçen kavram). */
function baslikSorgulari(baslik, ozet) {
  const m = `${baslik} ${ozet}`.toLowerCase();
  const ek = [];
  // Yalnızca Commons'ta gerçekten CC0 fotoğraf döndüren ifadeler.
  const kaliplar = [
    [/\bveri merkezi|data center|sunucu\b/, "data center server room"],
    [/\b[çc]ip|yonga|tpu|gpu|npu\b/, "semiconductor wafer"],
    [/\bfabrika|[üu]retim tesisi|factory\b/, "manufacturing plant"],
    [/\bvr|sanal ger[çc]eklik|g[öo]zl[üu]k\b/, "virtual reality goggles"],
    [/\bkatlanabilir|foldable\b/, "foldable smartphone"],
    [/\b[şs]arj|batarya|pil\b/, "battery charging"],
    [/\bf[üu]ze|missile|g[öo]kden[ıi]z\b/, "missile launcher"],
    [/\bgemi|ship|naval\b/, "naval ship at sea"],
  ];
  for (const [r, q] of kaliplar) if (r.test(m)) ek.push(q);
  return ek;
}

/** Habere göre sıralı sahne sorguları: en özel olandan en genele. */
export function sahneSorgulari(baslik, ozet, brand, tip) {
  const anahtar = konuAnahtari(baslik, ozet, brand, tip);
  const ozel = [...baslikSorgulari(baslik, ozet), ...(KONU_SORGULARI[anahtar] || [])];
  // Konuya özel sorgu varsa ona sadık kal: her habere "veri merkezi" eklemek
  // bütün kapakları aynı sunucu salonuna çekiyordu.
  const liste = ozel.length ? ozel : KONU_SORGULARI.genel;
  return { anahtar, sorgular: [...new Set(liste)] };
}

async function sahneAdaylariTek(sorgu, { adet = 20 } = {}) {
  return sahneAdaylar(sorgu, { adet });
}


// ------------------------------------------------------------------ Commons
const IZINLI = /^(cc0|public domain|pd|pd-|no restrictions)/i;
// Yazı/ekran görüntüsü/logo ızgarası: kapak olamaz. Kullanıcının reddettiği
// Google "Quick Share" kapağı Japonca arayüz ekran görüntüsüydü, Xbox kapağı
// ise düz logo ızgarasıydı.
const EKRAN_YASak =
  /\b(screenshot|screen shot|screen|interface|ui|menu|display of|app|software|login|settings|about screen|unboxing|packaging|box|render|vector|wordmark|typography|lettering)\b/i;
const YASAK_AD =
  /\b(logo|logos|map|diagram|chart|poster|cover|screenshot|icon|flag|coat of arms|seal|stamp|coin|signature|drawing|illustration|cartoon|painting|lithograph|engraving|archival|scan|scanned|document|menu|infographic)\b/i;

function jaccard(ad, metin) {
  const norm = (s) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N} ]+/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);
  const a = new Set(norm(ad));
  const b = new Set(norm(metin));
  let k = 0;
  for (const x of a) if (b.has(x)) k++;
  return k / Math.max(1, a.size);
}

/**
 * SAHNE KAPAĞI — kullanıcının ASELSAN/Netflix/ChatGPT referanslarındaki dil:
 * gerçek bir sahne fotoğrafı (fabrika, gemi, cihaz, veri merkezi) tam kare kaplar;
 * marka imzası köşede küçük ve okunur durur. Kapak "haberi" anlatır, sadece
 * markayı değil. Başlık yazısı BASILMAZ.
 */
async function sahneKapak(buf, brand, ton) {
  const m = await sharp(buf).metadata();
  const oran = (m.width || 1) / (m.height || 1);

  const taban =
    oran >= 1.2
      ? await sharp(buf)
          .rotate()
          .resize(W, H, { fit: "cover", position: "attention" })
          .modulate({ saturation: 1.05, brightness: 0.97 })
          .toBuffer()
      : await sharp(buf)
          .rotate()
          .resize(W, H, { fit: "cover" })
          .modulate({ brightness: 0.45, saturation: 0.85 })
          .blur(16)
          .png()
          .toBuffer();

  // Okunurluk: üstten ve alttan hafif karartma; marka imzası alt-solda.
  const katman = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="alt" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.45" stop-color="#000000" stop-opacity="0"/>
        <stop offset="1" stop-color="${hsl(ton, 55, 4)}" stop-opacity="0.82"/>
      </linearGradient>
      <linearGradient id="ust" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000000" stop-opacity="0.34"/>
        <stop offset="0.35" stop-color="#000000" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#ust)"/>
    <rect width="${W}" height="${H}" fill="url(#alt)"/>
  </svg>`);

  const parcalar = [{ input: taban }];
  if (oran < 1.2) {
    // Dikey kare: bulanık zemin üstüne ortalanmış sahne.
    const on = await sharp(buf)
      .rotate()
      .resize(W, H, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    parcalar.push({ input: on, gravity: "center" });
  }
  parcalar.push({ input: katman });

  // MARKA İMZASI: küçük logo (ya da logosu yoksa harf aralıklı ad).
  const imza = await markaImzasi(brand);
  if (imza) parcalar.push({ input: imza.gor, left: 54, top: H - 54 - imza.yukseklik });

  return sharp(parcalar[0].input)
    .composite(parcalar.slice(1))
    .webp({ quality: 88 })
    .toBuffer();
}

/** Sahne kapağının sol altına giden küçük marka imzası (logo veya ad). */
async function markaImzasi(brand) {
  if (!brand) return null;
  const boy = 46;
  if (brand.logo) {
    try {
      const logo = await logoPngYap(brand.logo, boy * 2);
      if (logo) {
        const { data, info } = await sharp(logo)
          .trim({ threshold: 10 })
          .toBuffer({ resolveWithObject: true });
        if (!info.width || !info.height) return null;
        const oran = info.height / info.width;
        const g = await sharp(data)
          .resize(Math.round(boy / Math.min(1, oran)), boy, { fit: "inside" })
          .png()
          .toBuffer();
        const md = await sharp(g).metadata();
        return { gor: g, yukseklik: md.height || boy };
      }
    } catch {
      /* logo yoksa ada düşülür */
    }
  }
  // Logosuz marka: sahne üzerinde ince, harf aralıklı küçük ad.
  const ad = String(brand.ad).toUpperCase().replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const svg = Buffer.from(`<svg width="520" height="72" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="52" font-family="Arial, Helvetica, sans-serif" font-size="40"
      font-weight="700" letter-spacing="7" fill="#ffffff" fill-opacity="0.95">${ad}</text>
  </svg>`);
  const g = await sharp(svg).png().toBuffer();
  return { gor: g, yukseklik: 72 };
}

/**
 * Konu sahnesi: marka olmasa da haberin öznesini gösteren gerçek fotoğraf.
 * Ölçüm + vizyon kapılarından geçen ilk kare kullanılır.
 */
async function sahneKarti(article, brand, tip) {
  const { anahtar, sorgular } = sahneSorgulari(article.title, article.summary, brand, tip);
  const denenen = new Set();
  const not = [];
  for (const sorgu of sorgular) {
    if (denenen.has(sorgu)) continue;
    denenen.add(sorgu);
    let liste = [];
    try {
      liste = await sahneAdaylar(sorgu, { adet: 18 });
    } catch (e) {
      not.push(`${sorgu}: ${e.message}`);
      continue;
    }
    if (!liste.length) not.push(`${sorgu}: uygun CC0 sahne yok`);
    for (const aday of liste.slice(0, 4)) {
      if (KULLANILAN.has(aday.dosya)) continue;
      let buf;
      try {
        buf = await indir(aday.url);
      } catch {
        continue;
      }
      const kalite = await kaliteKapisi(buf);
      if (!kalite.uygun) {
        not.push(`${aday.dosya}: ${kalite.neden}`);
        continue;
      }
      // Vizyon kotası bittiğinde (uygun=null) sahneyi elemek yerine ölçüm
      // kapısına güvenilir; yalnızca açık bir "uygun değil" reddeder.
      const viz = await vizyonUygun(buf, article.title, article.summary, "sahne");
      if (viz.uygun === false) {
        not.push(`${aday.dosya}: ${viz.neden || "vizyon onayı yok"}`);
        continue;
      }
      const kapak = await sahneKapak(buf, brand, brand?.ton ?? 214);
      const son = await vizyonUygun(kapak, article.title, article.summary, "sahne");
      if (son.uygun === false) {
        not.push(`${aday.dosya}: kapak kadrajı uymadı (${son.neden})`);
        continue;
      }
      KULLANILAN.add(aday.dosya);
      return {
        tur: brand ? "sahne" : "konu",
        marka: brand?.ad || null,
        tip,
        sahne: anahtar,
        sorgu,
        dosya: aday.dosya,
        lisans: aday.lisans,
        yazar: aday.yazar,
        vizyon: viz.uygun === null ? "vizyon kotası yok, ölçümle geçti" : son.neden || viz.neden,
        gor: kapak,
        not,
      };
    }
  }
  return { yok: true, not };
}

/** Birebir model eşleşen, CC0, büyük ve fotoğraf olan adayları döndürür. */
export async function adaylar(sorgu, { adet = 25, tip = null } = {}) {
  const u = new URL(COMMONS);
  const p = {
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `${sorgu} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: String(adet),
    prop: "imageinfo",
    iiprop: "url|extmetadata|size|mime",
    iiurlwidth: "1600",
    iiextmetadatafilter: "LicenseShortName|ImageDescription|Artist",
  };
  for (const k in p) u.searchParams.set(k, p[k]);
  const r = await fetch(u, { headers: { "user-agent": UA } });
  if (!r.ok) return [];
  const j = await r.json();
  const sayfalar = Object.values(j.query?.pages || {});
  return sayfalar
    .map((pg) => {
      const ii = pg.imageinfo?.[0] || {};
      const md = ii.extmetadata || {};
      return {
        dosya: pg.title.replace(/^File:/, ""),
        lisans: (md.LicenseShortName?.value || "").trim(),
        aciklama: (md.ImageDescription?.value || "").replace(/<[^>]+>/g, " ").trim(),
        yazar: (md.Artist?.value || "").replace(/<[^>]+>/g, " ").trim(),
        genislik: ii.width || 0,
        yukseklik: ii.height || 0,
        url: ii.thumburl || ii.url,
        sayfa: ii.descriptionurl,
      };
    })
    .filter((a) => IZINLI.test(a.lisans))
    .filter((a) => a.genislik >= 1200 && a.yukseklik >= 700)
    .filter((a) => !YASAK_AD.test(a.dosya))
    .filter((a) => !EKRAN_YASak.test(a.dosya))
    // AD EŞLEŞMESİ ŞART: aranan ürüne ait kelimeler dosya adında geçmeli.
    .filter((a) => jaccard(sorgu, a.dosya) >= 0.5)
    // TÜR KAPISI: başlık "telefon" diyorsa fotoğraf telefon olmalı.
    .filter((a) => (tip ? TIPLER[tip].dosya.test(a.dosya) : true))
    // MAĞAZA/SERGİ ÇEKİMLERİ ELENİR: ürün vitrinde/standa, arkasında dev marka
    // yazısı, önünde adı yazan etiket olur. Kapak olarak zayıftır ve vizyon
    // bunu bazen "ürünü gösteriyor" diye onaylıyordu (Google Pixel standı).
    // Sıralamayla sona atmak yetmiyor: tek aday kalınca yine seçiliyordu.
    .filter(
      (a) =>
        !/shown in|on display|museum|expo|booth|hands-on|store display|in store|at the stand/i.test(
          a.dosya
        )
    )
    // GÖRÜNÜŞ TERCİHİ + AD EŞLEŞMESİ: tek sort. Eskiden iki ayrı .sort() vardı
    // ve ikincisi birincinin görünüş tercihini siliyordu (arka yüz karesi
    // varken ön yüz/ekran karesi seçiliyordu).
    .sort((a, b) => {
      // Telefon/tablet kapağında EKRAN YÜZÜ değil ÜRÜNÜN KENDİSİ istenir:
      // ön yüz çoğu zaman arayüz ekranıdır (Rusça menü, Japonca uyarı) ve kapak
      // olarak ekran görüntüsü gibi durur. Arka/yan gövde, kamera adası öne çıkar.
      const iyi = (ad) =>
        // Mağaza/sergi çekimleri: ürün standda, arkasında dev marka yazısı,
        // önünde adı yazan etiket. Kapak olarak zayıf; en sona atılır.
        /shown in|on display|museum|expo|booth|hands-on|store display/i.test(ad) ? 4
        : /back|rear|behind/i.test(ad) ? 0
        : /side|edge|corner|bottom|top/i.test(ad) ? 2
        : /front|screen|display|interface|\bui\b/i.test(ad) ? 3
        : 1;
      const g = iyi(a.dosya) - iyi(b.dosya);
      if (g) return g;
      const ka = jaccard(sorgu, a.dosya);
      const kb = jaccard(sorgu, b.dosya);
      return kb - ka || b.genislik * b.yukseklik - a.genislik * a.yukseklik;
    });
}

async function indir(url) {
  const r = await fetch(url, { headers: { "user-agent": UA } });
  if (!r.ok) throw new Error("indir " + r.status);
  return Buffer.from(await r.arrayBuffer());
}

// ------------------------------------------------------------------ sahne adayları
// Sahne sorguları GENEL kelimelerdir ("server room", "electric car charging").
// Commons araması gevşek: "mobile phone on desk" sorgusu MacBook fotoğrafı da
// döndürüyor. Bu yüzden adayın dosya adı/açıklaması sorgunun en az bir anlamlı
// kelimesini İÇERMEK ZORUNDA. Bu filtre olmadan telefon haberine laptop, Netflix
// haberine inşaat vinci kapak oluyordu.
const SAHNE_YASAK =
  /\b(screenshot|screen shot|diagram|chart|map|poster|logo|logos|icon|flag|coat of arms|seal|stamp|coin|signature|drawing|illustration|cartoon|painting|lithograph|engraving|archival scan|document|infographic|render|clipart|vector)\b/i;

// Sorgu kelimelerinden anlamsız olanlar (eşleşme ararken yok sayılır).
const SAHNE_STOP = new Set([
  "the", "and", "with", "for", "from", "that", "this", "into", "over", "under",
  "close", "view", "photo", "image", "picture", "shot", "left", "right", "front",
  "back", "top", "side", "full", "high", "low", "new", "old", "set", "one", "two",
]);

function sahneKelimeleri(sorgu) {
  return sorgu
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !SAHNE_STOP.has(w));
}

// ZORUNLU NESNE: sorgunun kendi konusu. Kelime eşleşmesi gevşek kaldığı için
// ("mobile phone on desk" sorgusu MacBook fotoğrafını da getiriyor) her sorgu
// için karede görünmesi gereken şeyi açıkça yazıyoruz. Dosya adı ya da açıklama
// bu kalıba UYMALI; uymayan aday hiç indirilmez.
const SAHNE_MUST = {
  "mobile phone on desk": /phone|smartphone|iphone|android|mobile/i,
  "smartphone lying": /phone|smartphone|iphone|android|mobile/i,
  "smartphone in hand": /phone|smartphone|iphone|android|mobile/i,
  "laptop computer desk": /laptop|notebook|macbook|computer/i,
  "laptop on desk office": /laptop|notebook|macbook/i,
  "laptop keyboard close up": /laptop|keyboard/i,
  "Xbox One console": /xbox/i,
  "Xbox controller": /xbox/i,
  "game console": /console|game|xbox|playstation|nintendo/i,
  "PlayStation 4 console": /playstation|ps4/i,
  "video game console controller": /console|controller|game/i,
  "Nvidia graphics card": /graphic|geforce|nvidia|card/i,
  "graphics card": /graphic|card|gpu/i,
  "cpu socket motherboard": /cpu|socket|motherboard|processor/i,
  "microchip close up": /chip|microchip|integrated|circuit/i,
  "silicon wafer": /wafer|silicon|semiconductor/i,
  "semiconductor wafer": /wafer|silicon|semiconductor|chip/i,
  "Intel processor chip": /intel|processor|chip/i,
  "Tesla car": /tesla/i,
  "electric car charging station": /charg|electric|tesla/i,
  "car front": /car|automobile|vehicle/i,
  headphones: /headphone|earphone|headset/i,
  "headphones close up": /headphone|earphone|headset/i,
  "television in living room": /televis|tv\b/i,
  "home cinema": /home.?theat|theat|cinema|projector/i,
  "smart tv": /televis|tv\b|smart/i,
  "cinema screen": /cinema|screen|projection/i,
  "supermarket aisle": /supermarket|aisle|store|grocery/i,
  "grocery store shelves": /grocery|store|shelf|shelves|market/i,
  "computer code screen": /code|programming|developer|screen/i,
  "data center server room": /data center|server|rack/i,
  "computer monitor desk": /monitor|desk|display|computer/i,
  "stock exchange trading floor": /stock exchange|trading floor|nyse|exchange/i,
  "money dollars banknotes": /dollar|banknote|money|cash/i,
  "Bitcoin Price": /bitcoin/i,
  "Bitcoin ATM": /bitcoin|atm/i,
  "bitcoin mining": /bitcoin|mining|miner/i,
  "film camera on set": /film|camera|movie|set/i,
  "cinema auditorium seats": /cinema|auditorium|theat|seat/i,
  "television studio camera": /television|studio|camera/i,
  "naval ship at sea": /naval|ship|vessel|fleet|warship/i,
  warship: /warship|naval|fleet|destroyer|frigate/i,
  "radar antenna": /radar|antenna|array/i,
  "rocket launch": /rocket|launch|liftoff|atlantis/i,
  "satellite in space": /satellite|orbit|space/i,
  "computer circuit board": /circuit|board|mainboard|motherboard/i,
  "battery charging": /battery|charg/i,
  "foldable smartphone": /foldable|fold|flexible/i,
  "virtual reality goggles": /virtual reality|vr\b|goggle|headset/i,
  "manufacturing plant": /factory|manufactur|plant|industrial/i,
  "missile launcher": /missile|launcher|rocket/i,
};

export async function sahneAdaylar(sorgu, { adet = 20 } = {}) {
  const u = new URL(COMMONS);
  const p = {
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `${sorgu} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: String(adet),
    prop: "imageinfo",
    iiprop: "url|extmetadata|size|mime",
    iiurlwidth: "1600",
    iiextmetadatafilter: "LicenseShortName|ImageDescription|Artist",
  };
  for (const k in p) u.searchParams.set(k, p[k]);
  const r = await fetch(u, { headers: { "user-agent": UA } });
  if (!r.ok) return [];
  const j = await r.json();
  const kelimeler = sahneKelimeleri(sorgu);
  return Object.values(j.query?.pages || {})
    .map((pg) => {
      const ii = pg.imageinfo?.[0] || {};
      const md = ii.extmetadata || {};
      return {
        dosya: pg.title.replace(/^File:/, ""),
        lisans: (md.LicenseShortName?.value || "").trim(),
        aciklama: (md.ImageDescription?.value || "").replace(/<[^>]+>/g, " ").trim(),
        yazar: (md.Artist?.value || "").replace(/<[^>]+>/g, " ").trim(),
        genislik: ii.width || 0,
        yukseklik: ii.height || 0,
        url: ii.thumburl || ii.url,
        sayfa: ii.descriptionurl,
      };
    })
    .filter((a) => IZINLI.test(a.lisans))
    .filter((a) => a.genislik >= 1400 && a.yukseklik >= 800)
    // Yatay kare tercih edilir: kapak 16:9, dikey karede sahnenin yarısı kesilir.
    .filter((a) => a.genislik / a.yukseklik >= 1.2)
    .filter((a) => !SAHNE_YASAK.test(a.dosya))
    .filter(
      (a) =>
        !/shown in|on display|museum|expo|booth|hands-on|store display|in store|at the stand/i.test(a.dosya)
    )
    // ANLAM EŞLEŞMESİ: sorgunun bir kelimesi dosya adında/açıklamada geçmeli.
    .filter((a) => {
      if (!kelimeler.length) return true;
      const metin = `${a.dosya} ${a.aciklama}`.toLowerCase();
      return kelimeler.some((w) => metin.includes(w));
    })
    // ZORUNLU NESNE: kare gerçekten sorgunun konusunu göstermeli. Bu kontrol
    // SADECE dosya adına bakar: açıklamalar uzun ve gürültülü ("... with iPhone"
    // geçen bir laptop fotoğrafı telefon sorgusunu geçiyordu).
    .filter((a) => {
      const must = SAHNE_MUST[sorgu];
      if (!must) return true;
      return must.test(a.dosya);
    });
}

// Aynı fotoğraf iki habere kapak olmasın (kullanıcının kuralı).
const KULLANILAN = new Set();

// ------------------------------------------------------------------ vizyon kapısı
// SON KAPI: kare + başlık birlikte vision'a gider. "Bu görsel bu haberin kapağı
// olur mu?" sorusuna EVET demezse kare kullanılmaz. Ekran görüntüsü, logo
// ızgarası, üzerinde yazı, kolaj ve yanlış konu burada elenir.
const VIZYON_MODELLER = ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-2.5-flash"];

// VİZYON ÖNBELLEĞİ: aynı kare + aynı başlık için model bir kez sorulur.
// Ücretsiz kotayı tekrar çalıştırmalarda yakmamak için sonuç diske yazılır.
const ONBELLEK_YOL = path.join(KOK, "reports", ".vizyon-onbellek.json");
let onbellek = null;
function onbellekYukle() {
  if (onbellek) return onbellek;
  try {
    onbellek = JSON.parse(fs.readFileSync(ONBELLEK_YOL, "utf8"));
  } catch {
    onbellek = {};
  }
  return onbellek;
}
function onbellekYaz() {
  try {
    fs.mkdirSync(path.dirname(ONBELLEK_YOL), { recursive: true });
    fs.writeFileSync(ONBELLEK_YOL, JSON.stringify(onbellek));
  } catch {
    /* önbellek yazılamazsa çalışma sürer */
  }
}


function geminiAnahtar() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const envYol = path.join(KOK, ".env");
  if (!fs.existsSync(envYol)) return null;
  for (const satir of fs.readFileSync(envYol, "utf8").split(/\r?\n/)) {
    const m = satir.match(/^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return null;
}

const VIZYON_KURAL = `Haber başlığı: {BASLIK}
Özet: {OZET}

Bu görsel, bu haberin KAPAK fotoğrafı olarak kullanılacak. Değerlendir.

UYGUN (uygun=true) olması için:
- Görsel, başlıktaki somut özneyi gösteriyor: bahsedilen ürün/marka/olay.
  (Örn. "Redmi telefon" haberi -> telefon fotoğrafı; "NVIDIA yongası" -> ekran kartı.)
- Fotoğraf gibi görünüyor: gerçek bir çekim, ürün veya sahne.
- Haber bir marka/şirket haberi ise sahnede o markanın logosu olabilir; logo
  bilerek yerleştirilmiş bir tasarım öğesidir, filigran sayılmaz.

UYGUN DEĞİL (uygun=false):
- Yanlış konu: başka bir ürün (telefon haberi için otomobil), başka bir şirket.
- Görselin yarısından çoğu el, kol, kumaş, masa gibi ilgisiz bir şeyle kaplı.
- Ürünün yalnızca yan kesiti görünüyor, ürün olarak tanınmıyor.
- Ekran görüntüsü, arayüz, uygulama ekranı, web sayfası fotoğrafı.
- Mağaza/stand çekimi: ürün bir sergi standında, arkasında dev marka yazısı,
  önünde ürün adı yazan etiket/plaka var. Ürün uzaktan ve küçük görünüyor.
- Üzerine basılmış haber başlığı/manset bandı, kanal logosu, filigran.
- Düz logo/kelime markası ızgarası, afiş, illüstrasyon, gravür, kolaj.
- Emin değilsen: uygun=false.

Yalnızca JSON döndür: {"uygun": true|false, "neden": "en fazla 10 kelime"}`;

// SAHNE kuralı: stok bir fotoğraf haberin TAM ÜRÜNÜNÜ gösteremez (GÖKDENİZ
// gemisinin kendi fotoğrafı stokta yok). Burada aranan şey "haberin konusunu
// genel düzeyde doğru anlatıyor mu": savunma haberi için savaş gemisi, kripto
// haberi için bitcoin/borsa ekranı gibi. Birebir model eşleşmesi ARANMAZ.
const VIZYON_SAHNE = `Haber başlığı: {BASLIK}
Özet: {OZET}

Bu fotoğraf, bu haberin KAPAK görseli olacak. Sahne olarak uygun mu? Değerlendir.

UYGUN (uygun=true):
- Fotoğraf, haberin KONU ALANINI doğru yansıtıyor. Birebir model/renk/varyant
  eşleşmesi ARANMAZ. Aynı markanın ya da aynı ürün kategorisinin gerçek bir
  fotoğrafı yeterlidir.
  Örn. "özel timsah tasarımlı Xbox" -> herhangi bir Xbox konsolu fotoğrafı.
  "GÖKDENİZ sivil gemilere uyarlandı" -> denizde gemi.
  "Binance'e saldırı, kripto donduruldu" -> bitcoin/borsa/kripto sahnesi.
  "Yeni VR filmi" -> VR gözlük takan kişi. "Veri merkezi" -> sunucu salonu.
- Gerçek bir fotoğraf: ürün, cihaz, fabrika, gemi, bina, ekran, insan, ofis.
- Üzerinde marka logosu/amblemi olabilir; bu filigran sayılmaz.

UYGUN DEĞİL (uygun=false):
- Konuyla ilgisiz: haber teknoloji/savunma/finans/medya iken manzara, yemek,
  hayvan, spor, çiçek, inşaat, tarihî gravür gibi tamamen alakasız bir kare.
- Haber kripto/para iken sadece nakit banknot; haber konsol iken başka marka.
- Düz logo, kelime markası, ikon, bayrak, harita, diyagram, grafik, afiş.
- Ekran görüntüsü, uygulama arayüzü, web sayfası, slayt, veri tablosu.
- Kolaj, montaj, illüstrasyon, 3B render, karikatür, çizim.
- Üzerine basılmış gazete/haber başlığı bandı, kanal logosu.
- Fotoğrafın yarısından çoğu bulanık, boş ya da karanlık.
- Emin değilsen: uygun=false.

Yalnızca JSON döndür: {"uygun": true|false, "neden": "en fazla 10 kelime"}`;

export async function vizyonUygun(buf, baslik, ozet = "", kip = "urun") {
  const anahtar = geminiAnahtar();
  if (!anahtar) return { uygun: null, neden: "vizyon anahtarı yok" };
  const kucuk = await sharp(buf).resize(640, 360, { fit: "inside" }).jpeg({ quality: 78 }).toBuffer();
  const anahtarMetin = createHash("sha1").update(kucuk).update(baslik).update(kip).digest("hex");
  const ka = onbellekYukle();
  if (ka[anahtarMetin]) return { ...ka[anahtarMetin], onbellek: true };
  const kural = kip === "sahne" ? VIZYON_SAHNE : VIZYON_KURAL;
  const govde = {
    contents: [
      {
        parts: [
          { text: kural.replace("{BASLIK}", baslik).replace("{OZET}", ozet.slice(0, 400)) },
          { inlineData: { mimeType: "image/jpeg", data: kucuk.toString("base64") } },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  };
  for (const model of VIZYON_MODELLER) {
    // Hız sınırı (429) ve geçici 5xx: kare hemen elenmesin, birkaç kez beklenip
    // yeniden denenir. Aksi halde kotası olan model bile "yanıt vermedi" olup
    // iyi ürün fotoğrafları boşa gidiyordu.
    for (let deneme = 0; deneme < 3; deneme++) {
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${anahtar}`,
          { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) }
        );
        if (r.status === 429 || r.status >= 500) {
          await new Promise((c) => setTimeout(c, 4000 * (deneme + 1)));
          continue;
        }
        if (!r.ok) break;
        const j = await r.json();
        const metin = j.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
        if (!metin) break;
        const v = JSON.parse(metin);
        if (typeof v.uygun === "boolean") {
          const sonuc = { uygun: v.uygun, neden: String(v.neden || "").slice(0, 80), model };
          ka[anahtarMetin] = sonuc;
          onbellekYaz();
          return sonuc;
        }
        break;
      } catch {
        await new Promise((c) => setTimeout(c, 2000));
      }
    }
  }
  return { uygun: null, neden: "vizyon yanıt vermedi" };
}

// ------------------------------------------------------------------ görsel işleme
function hsl(h, s, l) {
  const S = s / 100;
  const L = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const x = (v) => Math.round(255 * v).toString(16).padStart(2, "0");
  return `#${x(f(0))}${x(f(8))}${x(f(4))}`;
}

/** Ürün fotoğrafı: tam kare, yazısız, hafif sinematik grade. */
async function urunKapak(buf, ton) {
  const m = await sharp(buf).metadata();
  const oran = (m.width || 1) / (m.height || 1);

  const grade = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="v" cx="0.5" cy="0.45" r="0.75">
        <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>
        <stop offset="1" stop-color="${hsl(ton, 60, 8)}" stop-opacity="0.55"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#v)"/>
  </svg>`);

  // 16:9'a YAKIN kare: doğrudan kırpılır (ürün kadrajı zaten geniş).
  // DİKEY veya çok geniş kare: kırpmak ürünün yarısını kesiyordu; ürün olduğu
  // gibi ortalanır, arkası aynı fotoğrafın bulanık dolgusuyla kapatılır.
  if (oran >= 1.25 && oran <= 2.1) {
    const taban = await sharp(buf)
      .rotate()
      .resize(W, H, { fit: "cover", position: "attention" })
      .modulate({ saturation: 1.06 })
      .toBuffer();
    return sharp(taban).composite([{ input: grade }]).webp({ quality: 86 }).toBuffer();
  }

  const zemin = await sharp(buf)
    .rotate()
    .resize(W, H, { fit: "cover" })
    .modulate({ brightness: 0.45, saturation: 0.8 })
    .blur(18)
    .png()
    .toBuffer();

  // .png() ŞART: JPEG çıkışta saydam dolgu siyaha düzleşiyor ve kapakta
  // kocaman siyah şeritler kalıyordu.
  const urun = await sharp(buf)
    .rotate()
    .resize(W, H, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp(zemin)
    .composite([{ input: urun, gravity: "center" }, { input: grade }])
    .webp({ quality: 86 })
    .toBuffer();
}

async function logoSvg(slug) {
  const yerel = path.join(LOGO_DIZIN, slug + ".svg");
  if (fs.existsSync(yerel)) return fs.readFileSync(yerel, "utf8");
  const r = await fetch(`https://cdn.jsdelivr.net/npm/simple-icons@13/icons/${slug}.svg`);
  if (!r.ok) throw new Error("logo yok: " + slug);
  const s = await r.text();
  fs.mkdirSync(LOGO_DIZIN, { recursive: true });
  fs.writeFileSync(yerel, s);
  return s;
}

/**
 * Ölçüm kapısı. Ekran görüntüsü ve foto-kolaj REDDEDİLİR.
 * "Düz zemin" ise reddedilmez: ShiftDelete'in kullandığı temiz ürün çekimleri
 * tam olarak düz zeminli (stüdyo) karelerdir. Kırpılıp derecelendirilince kapak
 * olur. Bu yüzden düz zemin yalnızca NOT olarak geçer.
 *
 * YAZI / BAŞLIK / FİLİGRAN: piksel ölçümü tek başına karar vermez. Ürünün kendi
 * parlak gövdesi (iPhone arka camı, krom kenar, kamera adası) "büyük başlık" ya
 * da "filigran" gibi ölçülüyordu ve iyi ürün fotoğrafları eleniyordu. Gerçek
 * yazı bandını ayırt etmek görsel anlam gerektirir; o kararı VİZYON kapısı
 * verir. Ölçüm yalnızca ŞÜPHE notu düşer. Sert ret sadece kare neredeyse
 * tamamen yazıysa (aşırı uç) uygulanır.
 */
async function kaliteKapisi(buf) {
  const o = await kapakKaliteOlc(buf);
  if (o.yaziSatirOran >= 0.55 || o.baslikSatirOran >= 0.6)
    return { uygun: false, neden: "kare yazı dolu" };
  if (o.ekran) return { uygun: false, neden: `ekran görüntüsü/beyaz kart (${o.ekran.bolge})` };
  if (o.kolaj) return { uygun: false, neden: "foto-kolaj" };
  const suphe = [];
  if (o.yaziBlokOran >= 0.045 || o.yaziSatirOran >= 0.18) suphe.push("yazı şüphesi");
  if (o.baslikBlokOran >= 0.05 || o.baslikSatirOran >= 0.12) suphe.push("başlık şüphesi");
  if (o.filigran) suphe.push(`filigran şüphesi (${o.filigran.bolge})`);
  if (suphe.length) return { uygun: true, supheli: suphe.join(", "), neden: "geçti" };
  return { uygun: true, neden: o.duzZemin ? "temiz stüdyo zeminli ürün karesi" : "geçti" };
}
async function logoPngYap(slug, boy) {
  const svg = await logoSvg(slug);
  // Bazı simple-icons dosyaları (ör. NVIDIA) dolu bir dikdörtgen artifact'ı
  // içeriyor. even-odd dolgu kuralı bu bloğu boşaltıyor.
  const svgHam = svg.replace("<svg ", '<svg fill="#ffffff" fill-rule="evenodd" ');
  const ham = await sharp(Buffer.from(svgHam), { density: 1200 })
    .resize(boy, boy, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const { data, info } = await sharp(ham).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let dolu = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 40) dolu++;

  // ARTEFAKT KONTROLÜ: simple-icons'ta bazı dosyalar (ör. NVIDIA) ikonun yanına
  // keskin köşeli, dolu bir dikdörtgen ekliyor; kartta kocaman beyaz blok oluyor.
  // Gerçek bir logo merkezde ve simetriktir; artefakt ise kenara taşar, köşeleri
  // dolu kalır. Bu yüzden opak alanın dört köşesine bakılır: bazıları dolu,
  // bazıları boşsa kare bozulmuştur ve ikon kullanılmaz.
  let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  const alfa = (x, y) => data[(y * info.width + x) * 4 + 3];
  const kose = [
    alfa(x0 + 2, y0 + 2) > 200,
    alfa(x1 - 2, y0 + 2) > 200,
    alfa(x0 + 2, y1 - 2) > 200,
    alfa(x1 - 2, y1 - 2) > 200,
  ];
  const doluKose = kose.filter(Boolean).length;
  if (doluKose > 0 && doluKose < 4) return null;
  if (dolu / (info.width * info.height) > 0.9) return null;
  return sharp(ham)
    .trim({ threshold: 10 })
    .resize(boy, boy, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

/**
 * Marka kimliği kartı — kullanıcının onayladığı "A · Marka düz" dili:
 * düz marka renginde koyu sinematik zemin, ışık halkası, ortada dev logo.
 * Rastgele fotoğraf YOK: alakasız bulanık kare, kötü fotoğraftan da kötüdür.
 */
async function markaKapak(brand) {
  const boy = 300;
  let amblem = null;
  if (brand.logo) {
    try {
      amblem = await logoPngYap(brand.logo, boy);
    } catch {
      amblem = null;
    }
  }

  const koyu = hsl(brand.ton, 72, 5);
  const orta = hsl(brand.ton, 78, 17);
  const isik = hsl(brand.ton, 100, 64);

  const zemin = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="taban" x1="0" y1="0" x2="0.8" y2="1">
        <stop offset="0" stop-color="${orta}"/>
        <stop offset="1" stop-color="${koyu}"/>
      </linearGradient>
      <radialGradient id="hale" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="${isik}" stop-opacity="0.30"/>
        <stop offset="0.45" stop-color="${isik}" stop-opacity="0.10"/>
        <stop offset="1" stop-color="${isik}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="vinyet" cx="0.5" cy="0.5" r="0.75">
        <stop offset="0.5" stop-color="#000000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0.55"/>
      </radialGradient>
      <pattern id="nokta" width="26" height="26" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.1" fill="#ffffff" fill-opacity="0.05"/>
      </pattern>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#taban)"/>
    <rect width="${W}" height="${H}" fill="url(#nokta)"/>
    <ellipse cx="${W / 2}" cy="${H / 2}" rx="${W * 0.42}" ry="${H * 0.62}" fill="url(#hale)"/>
    <rect width="${W}" height="${H}" fill="url(#vinyet)"/>
  </svg>`);

  if (amblem) {
    return sharp(zemin)
      .composite([{ input: amblem, gravity: "center" }])
      .webp({ quality: 88 })
      .toBuffer();
  }

  // Logosu olmayan marka: ince harf aralıklı büyük ad (tabela dili).
  const yazi = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
      font-family="Arial, Helvetica, sans-serif" font-size="104" font-weight="700"
      letter-spacing="16" fill="#ffffff" fill-opacity="0.96">${String(brand.ad)
        .toUpperCase()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}</text>
  </svg>`);
  return sharp(zemin).composite([{ input: yazi }]).webp({ quality: 88 }).toBuffer();
}

/**
 * Son çare — YAZISIZ tasarım kartı: kategori tonunda derin gradyan, ince
 * geometrik doku ve tek bir soyut motif. Başlık basılmaz; "üzerine yazı
 * basılmış clickbait kart" tam olarak reddedilen şeydi.
 */
const KATEGORI_TON = {
  Teknoloji: 212,
  "Yapay Zeka": 268,
  Mobil: 192,
  Donanım: 168,
  Yazılım: 232,
  İnternet: 200,
  Oyun: 300,
  Bilim: 152,
  Uzay: 250,
  Otomobil: 18,
  Spor: 138,
  Ekonomi: 44,
  Dünya: 206,
  Gündem: 356,
  Kültür: 330,
  Sağlık: 172,
};

async function tasarimKarti(article) {
  const ton = KATEGORI_TON[article.category] ?? 214;
  const koyu = hsl(ton, 60, 6);
  const orta = hsl(ton, 62, 13);
  const isik = hsl(ton, 92, 60);

  const svg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="t" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${orta}"/>
        <stop offset="1" stop-color="${koyu}"/>
      </linearGradient>
      <radialGradient id="h" cx="0.68" cy="0.42" r="0.5">
        <stop offset="0" stop-color="${isik}" stop-opacity="0.34"/>
        <stop offset="1" stop-color="${isik}" stop-opacity="0"/>
      </radialGradient>
      <pattern id="d" width="34" height="34" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.2" fill="#ffffff" fill-opacity="0.045"/>
      </pattern>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#t)"/>
    <rect width="${W}" height="${H}" fill="url(#d)"/>
    <ellipse cx="${W * 0.68}" cy="${H * 0.42}" rx="${W * 0.4}" ry="${H * 0.55}" fill="url(#h)"/>
    <g opacity="0.5" stroke="${isik}" stroke-opacity="0.55" fill="none" stroke-width="2">
      <circle cx="${W * 0.68}" cy="${H * 0.42}" r="150"/>
      <circle cx="${W * 0.68}" cy="${H * 0.42}" r="228"/>
      <circle cx="${W * 0.68}" cy="${H * 0.42}" r="306"/>
    </g>
    <circle cx="${W * 0.68}" cy="${H * 0.42}" r="78" fill="${isik}" fill-opacity="0.16"/>
  </svg>`);
  return sharp(svg).webp({ quality: 88 }).toBuffer();
}

/**
 * D — Konu fotoğrafı: havuzdan, başlıkla ÖLÇÜLÜ eşleşen yazısız kare.
 * Havuz kareleri genel kelimeyle eşleşmesin diye eşik yüksek tutulur.
 */
async function konuKapak(article) {
  const havuz = JSON.parse(fs.readFileSync(path.join(KOK, "data", "kapak-havuz.json"), "utf8"));
  const liste = havuz[article.category] || [];
  if (!liste.length) return null;

  const baslikKelimeleri = new Set(
    String(`${article.title} ${article.summary}`)
      .toLowerCase()
      .replace(/[^\p{L}\p{N} ]+/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4)
  );

  const puanli = liste
    .map((k) => {
      const ad = String(k.dosya || "").toLowerCase();
      let puan = 0;
      for (const w of baslikKelimeleri) if (ad.includes(w)) puan += 2;
      return { k, puan };
    })
    .filter((x) => x.puan >= 2)
    .sort((a, b) => b.puan - a.puan);

  for (const { k } of puanli.slice(0, 4)) {
    let buf;
    try {
      buf = await indir(k.url);
    } catch {
      continue;
    }
    const kalite = await kaliteKapisi(buf);
    if (!kalite.uygun) continue;
    const viz = await vizyonUygun(buf, article.title, article.summary);
    if (viz.uygun === false) continue;
    return { tur: "konu", kaynak: k.dosya, lisans: k.lisans, gor: await urunKapak(buf, 214) };
  }
  return null;
}

// ------------------------------------------------------------------ kapak üretimi
/** Kenar bölgesinin tekdüzeliği: temiz/stüdyo zeminli kareler daha yüksek puan alır. */
async function zeminTemizligi(buf) {
  try {
    const { data, info } = await sharp(buf)
      .resize(240, 135, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    let toplam = 0;
    let kare = 0;
    const kenar = 14;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const disari = x < kenar || y < kenar || x >= w - kenar || y >= h - kenar;
        if (!disari) continue;
        const i = (y * w + x) * 3;
        const ort = (data[i] + data[i + 1] + data[i + 2]) / 3;
        toplam += ort;
        kare += ort * ort;
      }
    }
    const n = Math.max(1, (w * h) - (w - kenar * 2) * (h - kenar * 2));
    const ort = toplam / n;
    const sapma = Math.sqrt(Math.max(0, kare / n - ort * ort));
    // Koyu ve dağınık kenar = kalabalık sahne; tekdüze kenar = ürün çekimi.
    return sapma + Math.abs(ort - 150) * 0.25;
  } catch {
    return 999;
  }
}

export async function kapakUret(article) {
  const brand = markaBul(article.title, article.summary);
  const tip = tipBul(article.title, article.summary, brand?.ad);
  const not = [];

  if (brand) {
    const gecenler = [];
    for (const sorgu of brand.sorgular) {
      const liste = await adaylar(sorgu, { tip });
      for (const aday of liste.slice(0, 6)) {
        if (gecenler.length >= 3) break;
        try {
          const buf = await indir(aday.url);
          // KAPI 1 — ölçüm: üzerine basılmış yazı, filigran, ekran, kolaj.
          const kalite = await kaliteKapisi(buf);
          if (!kalite.uygun) {
            not.push(`${aday.dosya}: ${kalite.neden}`);
            continue;
          }
          // KAPI 2 — vizyon: bu kare bu HABERİN kapağı mı?
          // Vizyon "evet" demezse kare kullanılmaz; emin olamayan kare kapak
          // olmaz. Model yanıt vermezse bir kez daha denenir.
          let viz = await vizyonUygun(buf, article.title, article.summary);
          if (viz.uygun === null) viz = await vizyonUygun(buf, article.title, article.summary);
          if (viz.uygun !== true) {
            not.push(`${aday.dosya}: ${viz.neden || "vizyon onayı yok"}`);
            continue;
          }
          gecenler.push({ ...aday, buf, sorgu, vizyon: viz.neden, skor: await zeminTemizligi(buf) });
        } catch (e) {
          not.push(`${sorgu}: ${e.message}`);
        }
      }
      if (!liste.length) not.push(`${sorgu}: tür/uyum kapısını geçen CC0 kare yok`);
    }

    // En temiz zeminli kare seçilir: ürün fotoğrafı gibi duran kare kazanır.
    // SON KAPI: üretilen kapağın kendisi vizyona gider. Kırpma yüzünden konu
    // kadrajdan çıkmışsa (ör. ürün yerine kol/kumaş görünmesi) kare elenir.
    gecenler.sort((a, b) => a.skor - b.skor);
    for (const en of gecenler.slice(0, 3)) {
      const kapak = await urunKapak(en.buf, brand.ton);
      const son = await vizyonUygun(kapak, article.title, article.summary);
      if (son.uygun === false) {
        not.push(`${en.dosya}: kapak kadrajı uymadı (${son.neden})`);
        continue;
      }
      return {
        tur: "urun",
        marka: brand.ad,
        tip,
        sorgu: en.sorgu,
        dosya: en.dosya,
        lisans: en.lisans,
        yazar: en.yazar,
        vizyon: son.neden || en.vizyon,
        gor: kapak,
        not,
      };
    }
  }

  // SAHNE: ürün fotoğrafı bulunamadıysa haberin KONUSUNU gösteren gerçek sahne
  // + köşede marka imzası. Kullanıcının son uyarısı tam buydu: "haberle alakalı".
  try {
    const sahne = await sahneKarti(article, brand, tip);
    if (!sahne.yok) return { ...sahne, not: [...not, ...sahne.not] };
    not.push(...sahne.not);
  } catch (e) {
    not.push(`sahne: ${e.message}`);
  }

  // (c) Son çare: koyu marka zemini + logo (logosu yoksa adı).
  if (brand) {
    try {
      return { tur: "marka", marka: brand.ad, gor: await markaKapak(brand), not };
    } catch (e) {
      not.push(`marka kartı: ${e.message}`);
    }
  }

  // (d) Hiçbiri yoksa: alâkasız fotoğraf yerine YAZISIZ temiz tasarım kartı.
  try {
    return { tur: "kart", marka: brand?.ad || null, gor: await tasarimKarti(article), not };
  } catch (e) {
    not.push(`tasarım kartı: ${e.message}`);
  }

  return { tur: "yok", marka: brand?.ad || null, not };
}

export async function calistir({ limit = 8, out = "reports/kapak-uyum-test", filtre = null } = {}) {
  const hepsi = JSON.parse(fs.readFileSync(path.join(KOK, "data", "articles.json"), "utf8"));
  const arr = Array.isArray(hepsi) ? hepsi : hepsi.articles || [];

  // Kullanıcının gösterdiği haber türlerini kapsayan, güncel başlıklar.
  let secili = arr.filter((a) => a.category === "Teknoloji" || a.category === "Yapay Zeka");
  if (filtre) secili = secili.filter((a) => filtre.test(a.title));
  const gorulen = new Set();
  secili = secili.filter((a) => {
    const b = markaBul(a.title, a.summary);
    if (!b || gorulen.has(b.ad)) return false;
    gorulen.add(b.ad);
    return true;
  });
  secili = secili.slice(0, limit);

  const cikti = path.join(KOK, out);
  fs.mkdirSync(cikti, { recursive: true });
  const manifest = [];

  for (const a of secili) {
    try {
      const s = await kapakUret(a);
      if (!s.gor) {
        manifest.push({ baslik: a.title, tur: "yok", marka: s.marka, not: s.not });
        continue;
      }
      const ad = `${a.slug.slice(0, 60)}.webp`;
      fs.writeFileSync(path.join(cikti, ad), s.gor);
      manifest.push({ baslik: a.title, slug: a.slug, dosya: ad, tur: s.tur, marka: s.marka, tip: s.tip, sahne: s.sahne, sorgu: s.sorgu, lisans: s.lisans, kaynak: s.dosya, vizyon: s.vizyon, not: s.not });
      console.log(`${s.tur.padEnd(5)} ${s.marka.padEnd(9)} ${a.title.slice(0, 62)}`);
    } catch (e) {
      manifest.push({ baslik: a.title, tur: "hata", hata: e.message });
      console.log("HATA ", a.title.slice(0, 60), e.message);
    }
  }
  fs.writeFileSync(path.join(cikti, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

if (process.argv[1] && process.argv[1].endsWith("kapak-uyum.mjs")) {
  await calistir({ limit: Number(arg("limit", 8)), out: arg("out", "reports/kapak-uyum-test") });
}
