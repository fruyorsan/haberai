// ==========================================================================
// MARKALI KAPAK ÜRETİCİ (16:9, 1280×720)
// --------------------------------------------------------------------------
// NEDEN: Kapak fotoğrafları rastgele Wikimedia kareleriydi; boyut, oran ve
// tipografi haberden habere değişiyordu. Feed'de (Discover, WhatsApp, X,
// Telegram) tutarsız görünüm tıklamayı düşürüyor.
//
// NE YAPAR: Telif güvenli mevcut fotoğrafı 1280×720'ye kırpar, altına koyu
// gradyan + başlık + kategori etiketi + site işareti basar ve
// `site/public/kapak/<id>.webp` olarak yazar. Böylece her kare aynı düzende
// görünür (ShiftDelete/Webtekno'nun görsel tutarlılığının bizdeki karşılığı).
//
// TELİF: Taban fotoğraf değişmez, yalnızca kırpılıp üzerine yazı basılır.
// Atıf `gorselKaynak` alanında korunur; kaynak adres `kapak.kaynak`ta durur.
//
// KULLANIM:
//   npm run kapak                  → indekste açık (aktif) haberler
//   npm run kapak -- --gun=3       → son 3 gün
//   npm run kapak -- --limit=20    → en fazla 20
//   npm run kapak -- --zorla       → kapak varsa da yeniden üret
//   npm run kapak -- --kart        → yalnızca tasarımlı kartları yenile
//                                    (fotoğraf aramaz, hızlıdır)
//   npm run kapak -- --dry
// ==========================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTICLES = path.join(KOK, "data", "articles.json");
const INDEKS = path.join(KOK, "data", "indeks.json");
const CIKTI_DIZIN = path.join(KOK, "site", "public", "kapak");
const URL_TABANI = "/kapak";

const GENISLIK = 1280;
const YUKSEKLIK = 720;
const KALITE = 74;
// Kart boyu: ana sayfada 30 kapak 1280 px indirmesin diye küçük varyant.
const KUCUK_GENISLIK = 480;

const arg = (ad, varsayilan) => {
  const bulunan = process.argv.find((a) => a.startsWith(`--${ad}=`));
  return bulunan ? Number(bulunan.split("=")[1]) || varsayilan : varsayilan;
};
const dry = process.argv.includes("--dry");
const zorla = process.argv.includes("--zorla");
// --kart: fotoğraf aramayı tamamen atla, her hedef için tasarımlı kart üret.
const sadeceKart = process.argv.includes("--kart");
// --id=<haber id>: tek haberi yeniden üret (hata ayıklama).
const tekId = process.argv.find((a) => a.startsWith("--id="))?.split("=")[1] || null;
// --fotoyok: yalnızca fotoğrafı olmayan (tasarımlı zemin) kapakları yeniden dener.
const sadeceFotoYok = process.argv.includes("--fotoyok");
// --kapakli: kapak dosyası olan TÜM haberleri yeniden üretir (eski tasarımdan geçiş).
const sadeceKapakli = process.argv.includes("--kapakli");
// --paralel=N: eşzamanlı indirme sayısı (varsayılan 6).
const paralel = arg("paralel", 6);
// DEBUG_KAPAK=1: her haber için hangi görselin neden seçildiğini yazar.
const debug = process.env.DEBUG_KAPAK === "1";
const gun = arg("gun", 0);
const limit = arg("limit", 2000);

// ------------------------------------------------------------------ veri
const ham = fs.readFileSync(ARTICLES, "utf8");
const satirSonu = ham.includes("\r\n") ? "\r\n" : "\n";
const articles = JSON.parse(ham);

function aktifIdler() {
  if (!fs.existsSync(INDEKS)) return new Set();
  try {
    const d = JSON.parse(fs.readFileSync(INDEKS, "utf8"));
    return new Set((Array.isArray(d.ids) ? d.ids : []).map(String));
  } catch {
    return new Set();
  }
}

const aktif = aktifIdler();
const esik = gun > 0 ? Date.now() - gun * 86400000 : 0;

const hedefler = articles
  .filter((a) => {
    if (!a || !a.id) return false;
    if (tekId) return a.id === tekId;
    if (sadeceKart) {
      // Yalnızca hâlihazırda tasarım kartı olan kapaklar yenilenir.
      return a.kapak && a.kapak.foto === false && a.image?.startsWith(`${URL_TABANI}/`);
    }
    if (sadeceFotoYok) {
      return a.kapak && a.kapak.foto === false;
    }
    if (sadeceKapakli) {
      return Boolean(a.kapak);
    }
    if (!zorla && typeof a.image === "string" && a.image.startsWith(`${URL_TABANI}/`)) return false;
    if (!a.image) return false;
    if (gun > 0) {
      const t = Date.parse(a.publishedAt || a.generatedAt || 0);
      return Number.isFinite(t) && t >= esik;
    }
    return aktif.has(String(a.id));
  })
  // En yeni haber önce: tur başına sınır varsa (CI'da 60) taze içerik kapsanır.
  .sort(
    (a, b) =>
      Date.parse(b.publishedAt || b.generatedAt || 0) - Date.parse(a.publishedAt || a.generatedAt || 0)
  )
  .slice(0, limit);

console.log(
  `Kapak: ${hedefler.length} haber hedefte ` +
    `(${gun > 0 ? `son ${gun} gün` : `indekste açık ${aktif.size} haber`})` +
    `${dry ? " [dry]" : ""}`
);

// ------------------------------------------------------------- yardımcılar
const XML = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// ------------------------------------------------------ görsel uygunluğu
// Sorun: arama bazen "1280px-thumbnail.jpg" gibi jenerik bir Commons karesi
// döndürüyor; haber kiraz hasadıyken kare Amerikan marketi olabiliyor.
// Kural: dosya adı jenerikse VEYA arama sorgusuyla hiç ortak kelime yoksa
// fotoğraf reddedilir. Reddedilen fotoğrafın yerine önce Openverse (CC0/CC BY)
// aranır, bulunamazsa fotoğrafsız markalı kart üretilir. Yanlış fotoğraf,
// fotoğrafsız karttan daha çok güven kaybettirir.

const JENERIK = /(thumbnail|placeholder|default|untitled|noimage|no-image|generic|dummy|stock|screenshot|ekran|wikipedia|wiki|logo|wordmark|diagram|chart|graph|harita|map|icon|drawing|clipart|^img|^image|^photo|^dsc|^px[-_]?)/i;

// Fotoğrafın güvenilir sayıldığı kategoriler: buralarda Commons'ta gerçek
// ürün/cihaz kareleri var. Gündem/Dünya/Spor/Ekonomi gibi haberlerde stok
// fotoğraf neredeyse her zaman yanlış olduğu için marka adı geçmiyorsa
// fotoğraf hiç kullanılmaz — yanlış kare, tasarımlı kareden daha çok güven
// kaybettiriyor.
const FOTO_KATEGORI = new Set([
  "Teknoloji",
  "Mobil",
  "Donanım",
  "Yazılım",
  "İnternet",
  "Oyun",
  "Bilim",
  "Uzay",
  "Otomobil",
  "Yapay Zeka",
]);

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "at", "for", "with", "to", "from",
  "turkey", "turkish", "turkiye", "istanbul", "new", "photo", "image", "file", "commons",
]);

const TR_ASCII = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

const tokenler = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[çğıöşüâîû]/g, (c) => TR_ASCII[c] || c)
    .replace(/\.(jpe?g|png|webp|avif|gif)$/i, "")
    .replace(/^\d+px-/, "")
    .split(/[^a-z0-9]+/)
    .map((t) => t.replace(/(lari|leri|lar|ler|s)$/i, ""))
    .filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t));

/** Başlıktaki özel ad (marka, kulüp, kişi, yer) fotoğraf adında geçiyor mu? */
function ozelAdUyuyor(url, baslik) {
  const adK = new Set(tokenler(decodeURIComponent(String(url || "").split("/").pop() || "")));
  const adaylar = String(baslik || "")
    .split(/[\s,.;:!?'"()’“”–—-]+/)
    .filter((w) => w.length > 3);
  return adaylar.some((w) => {
    const t = tokenler(w).join("");
    return t.length > 3 && [...adK].some((k) => k.includes(t) || t.includes(k));
  });
}

/**
 * Kapak fotoğrafı habere gerçekten uyuyor mu?
 * "Turkey cherry orchard" sorgusunun "Cherry Point" askeri üssündeki hindi
 * bovlingi fotoğrafını getirmesi gibi eşleşmeleri kesmek için sorgu
 * kelimelerinin çoğunluğu dosya adında geçmek zorunda.
 */
function uygunMu(url, sorgu) {
  const ad = decodeURIComponent(String(url || "").split("/").pop() || "");
  if (!ad || JENERIK.test(ad)) return false;
  const adKelimeleri = new Set(tokenler(ad));
  const sorguKelimeleri = [...new Set(tokenler(sorgu))];
  if (!sorguKelimeleri.length) return true;
  const eslesen = sorguKelimeleri.filter((k) => adKelimeleri.has(k)).length;
  const oran = eslesen / sorguKelimeleri.length;
  return eslesen >= 2 || oran >= 0.75;
}

// Openverse: Wikimedia dışında CC0 / CC BY lisanslı fotoğraf havuzu (ücretsiz).
let openverseSon = 0;
async function openverseAra(sorgu) {
  const bekle = 1500 - (Date.now() - openverseSon);
  if (bekle > 0) await new Promise((r) => setTimeout(r, bekle));
  openverseSon = Date.now();
  const u =
    "https://api.openverse.org/v1/images/?" +
    new URLSearchParams({
      q: sorgu,
      license: "cc0,by,by-sa",
      size: "large",
      page_size: "10",
    });
  const yanit = await fetch(u, {
    headers: { "user-agent": "HaberinAi/1.0 (https://haberinai.site)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!yanit.ok) throw new Error(`Openverse HTTP ${yanit.status}`);
  const d = await yanit.json();
  const sorguKelimeleri = tokenler(sorgu);
  const adaylar = (Array.isArray(d.results) ? d.results : [])
    .filter((r) => r?.url && (r.width || 0) >= 1100 && (r.height || 0) >= 600)
    .filter((r) => {
      const metin = `${r.title || ""} ${(r.tags || []).map((t) => t.name).join(" ")}`.toLowerCase();
      return sorguKelimeleri.some((k) => metin.includes(k));
    })
    .sort((a, b) => (b.width || 0) - (a.width || 0));
  const secili = adaylar[0];
  if (!secili) return null;
  return {
    url: secili.url,
    yazar: secili.creator || "Openverse",
    lisans: String(secili.license || "CC").toUpperCase() + (secili.license_version ? ` ${secili.license_version}` : ""),
    lisansUrl: secili.license_url || "",
    sayfa: secili.foreign_landing_url || secili.url,
  };
}


// Fotoğrafın üzerine YALNIZCA ince marka izleri basılır: alt kenarda 6 px
// kırmızı şerit + sağ altta küçük "haberinai" yazısı. Başlık zaten kartın
// yanında yazıyor; görselin üstüne ikinci kez başlık basmak fotoğrafı
// kirletiyor ve kırpıldığında yarım metin görünüyor.
// Metni kelime sınırında en fazla `enFazla` karakterlik satırlara böler.
function sar(metin, enFazla) {
  const kelimeler = String(metin || "").replace(/\s+/g, " ").trim().split(" ");
  const satirlar = [];
  let satir = "";
  for (const k of kelimeler) {
    if (!k) continue;
    const aday = satir ? `${satir} ${k}` : k;
    if (!satir || aday.length <= enFazla) satir = aday;
    else {
      satirlar.push(satir);
      satir = k;
    }
  }
  if (satir) satirlar.push(satir);
  return satirlar;
}

// Tasarımlı kartlar için başlık: en çok 3 satır, sığmazsa punto küçülür.
function kartBasligi(baslik) {
  const secenekler = [
    { boyut: 62, harf: 22 },
    { boyut: 54, harf: 26 },
    { boyut: 46, harf: 31 },
  ];
  for (const s of secenekler) {
    const satirlar = sar(baslik, s.harf);
    if (satirlar.length <= 3) return { boyut: s.boyut, lh: Math.round(s.boyut * 1.22), satirlar };
  }
  const satirlar = sar(baslik, 34).slice(0, 3);
  satirlar[satirlar.length - 1] = satirlar[satirlar.length - 1].replace(/[\s,.;:!?]+$/, "") + "…";
  return { boyut: 42, lh: 51, satirlar };
}

function kapakSvg() {
  const kenar = 34;
  return `<svg width="${GENISLIK}" height="${YUKSEKLIK}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="kose" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.62"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${YUKSEKLIK - 110}" width="${GENISLIK}" height="110" fill="url(#kose)"/>
  <rect x="0" y="${YUKSEKLIK - 6}" width="${GENISLIK}" height="6" fill="#e11d2e"/>
  <g font-family="Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif">
    <rect x="${GENISLIK - kenar - 172}" y="${YUKSEKLIK - 66}" width="172" height="40" rx="8" fill="#000000" fill-opacity="0.42"/>
    <rect x="${GENISLIK - kenar - 152}" y="${YUKSEKLIK - 57}" width="12" height="21" rx="2.5" fill="#e11d2e"/>
    <text x="${GENISLIK - kenar - 130}" y="${YUKSEKLIK - 39}" font-size="22" font-weight="700" fill="#ffffff" letter-spacing="-0.3">haberinai</text>
  </g>
</svg>`;
}

// Windows'ta antivirüs/indeksleyici yeni dosyayı bir an kilitleyebiliyor:
// yazmayı birkaç kez dene, hepsi başarısız olursa hatayı yukarı ver.
function yazDosya(yol, veri, deneme = 4) {
  for (let i = 0; i < deneme; i++) {
    try {
      fs.writeFileSync(yol, veri);
      return;
    } catch (err) {
      if (i === deneme - 1) throw err;
    }
  }
}

/** Kaynak makalenin kendi görseli: og:image / twitter:image. */
async function kaynakGorselUrl(a) {
  const adres = String(a.sourceUrl || "");
  if (!/^https?:\/\//i.test(adres)) return null;
  try {
    const yanit = await fetch(adres, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; HaberinAi/1.0; +https://haberinai.site)",
        "accept-language": "tr,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(9000),
    });
    if (!yanit.ok) return null;
    const html = (await yanit.text()).slice(0, 400000);
    const kaliplar = [
      /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/i,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    ];
    for (const kalip of kaliplar) {
      const bulunan = kalip.exec(html)?.[1];
      if (bulunan) {
        const tam = new URL(bulunan.replace(/&amp;/g, "&"), adres).href;
        // Site logosu / varsayılan paylaşım kartı haber görseli değildir.
        if (/^https?:\/\//i.test(tam) && !/(logo|favicon|default|placeholder|share-?default|sprite)/i.test(tam)) {
          return tam;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Fotoğrafı getir (Wikimedia 403 vermesin diye UA gönderilir).
async function gorselIndir(url) {
  const yerel = String(url || "");
  if (yerel.startsWith("/")) {
    const dosya = path.join(KOK, "site", "public", ...yerel.split("/").filter(Boolean));
    if (fs.existsSync(dosya)) return fs.readFileSync(dosya);
    return null;
  }
  const yanit = await fetch(yerel, {
    headers: {
      "user-agent": "HaberinAi/1.0 (https://haberinai.site; kapak uretimi)",
      accept: "image/avif,image/webp,image/jpeg,image/png,*/*",
      "accept-language": "tr",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`);
  return Buffer.from(await yanit.arrayBuffer());
}

async function kapakUret(a) {
  const dosya = path.join(CIKTI_DIZIN, `${a.id}.webp`);
  // Daha önce üretilmiş kapağın taban fotoğrafı `kapak.kaynak`ta durur.
  const kaynak = a.kapak?.kaynak || a.image;
  const sorgu = a.gorselSorgu || a.title || "";

  const indir = async (url) => {
    try {
      const veri = await gorselIndir(url);
      if (!veri) return null;
      // Çok küçük görseller (logo, ikon, 300 px kare) kapak olmaz.
      const bilgi = await sharp(veri).metadata();
      if ((bilgi.width || 0) < 640 || (bilgi.height || 0) < 320) return null;
      // "attention" büyük görsellerde çok pahalı (saniyelerce CPU). 4000 px'e
      // kadar ilgi alanına göre kırp; daha büyüklerde merkez yeterli.
      const konum =
        (bilgi.width || 0) * (bilgi.height || 0) <= 16_000_000
          ? sharp.strategy.attention
          : "centre";
      // 16:9 kırp.
      return await sharp(veri)
        .resize(GENISLIK, YUKSEKLIK, { fit: "cover", position: konum })
        .modulate({ saturation: 1.1, brightness: 1.02 })
        .sharpen({ sigma: 0.6 })
        .toBuffer();
    } catch {
      return null;
    }
  };

  let taban = null;
  let yeniAtif = null;
  let fotoVar = false;

  // 1) KAYNAK SİTENİN KENDİ GÖRSELİ (og:image).
  // Haberin çıktığı sayfadaki kapak görseli tanım gereği başlıkla alakalı:
  // Webtekno/ShiftDelete gibi siteler ürünü/personeli doğru fotoğrafla veriyor.
  // Bu yüzden ilk tercih bu; stok arama yalnızca o bulunamazsa devreye girer.
  if (!sadeceKart && String(a.sourceUrl || "").startsWith("http")) {
    const kaynakFoto = await kaynakGorselUrl(a);
    if (debug) {
      console.log(
        `   · ${a.id} kaynak görsel: ${kaynakFoto ? kaynakFoto.slice(0, 80) : "BULUNAMADI"}`
      );
    }
    if (kaynakFoto && kaynakFoto !== a.image) {
      taban = await indir(kaynakFoto);
      if (taban) fotoVar = true;
      else if (debug) console.log(`   · ${a.id} kaynak görsel indirilemedi`);
    }
  }

  // 2) Haberin veri dosyasındaki görsel (kaynak görsel yoksa/engellendiyse).
  // Wikimedia'dan gelen alakasız kareleri kesmek için uygunluk denetimi var.
  if (!taban) {
    const fotoIzinli =
      !sadeceKart &&
      uygunMu(kaynak, sorgu) &&
      (FOTO_KATEGORI.has(String(a.category || "")) || ozelAdUyuyor(kaynak, a.title));
    if (fotoIzinli) {
      taban = await indir(kaynak);
      fotoVar = Boolean(taban);
    }
  }

  if (!taban && !sadeceKart && FOTO_KATEGORI.has(String(a.category || ""))) {
    try {
      const ov = await openverseAra(sorgu);
      if (ov) {
        taban = await indir(ov.url);
        if (taban) {
          fotoVar = true;
          yeniAtif = {
            yazar: ov.yazar,
            lisans: ov.lisans,
            lisansUrl: ov.lisansUrl,
            sayfa: ov.sayfa,
          };
          console.log(`   ↻ uygun olmayan fotoğraf yerine Openverse: ${ov.sayfa.slice(0, 70)}`);
        }
      }
    } catch (err) {
      console.warn(`   ! Openverse: ${err.message}`);
    }
  }

  if (!taban) {
    // Fotoğraf yoksa/uygun değilse tasarımlı zemin. Boş bir gradyan "yer
    // tutucu" gibi duruyordu; bu yüzden zemine kategori etiketi + başlık
    // basılır (fotoğraflı kapaklarda metin YOK, orada fotoğraf konuşur).
    const { boyut, lh, satirlar } = kartBasligi(a.title);
    const ilkY = 330 - ((satirlar.length - 1) * lh) / 2;
    const kategori = XML(String(a.category || "").toLocaleUpperCase("tr"));
    const harf = XML((a.category || "H").trim().charAt(0).toLocaleUpperCase("tr"));
    const baslikSvg = satirlar
      .map(
        (s, i) =>
          `<text x="64" y="${Math.round(ilkY + i * lh)}" font-size="${boyut}" font-weight="700" fill="#ffffff" letter-spacing="-0.8">${XML(s)}</text>`
      )
      .join("\n              ");
    taban = await sharp({
      create: { width: GENISLIK, height: YUKSEKLIK, channels: 3, background: "#0a0f1a" },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="${GENISLIK}" height="${YUKSEKLIK}" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="zemin" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#0a0f1a"/>
                  <stop offset="0.62" stop-color="#141a29"/>
                  <stop offset="1" stop-color="#1b1020"/>
                </linearGradient>
                <linearGradient id="kama" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#e11d2e" stop-opacity="0.92"/>
                  <stop offset="1" stop-color="#8d1020" stop-opacity="0.55"/>
                </linearGradient>
                <pattern id="izgara" width="44" height="44" patternUnits="userSpaceOnUse">
                  <path d="M44 0H0V44" fill="none" stroke="#ffffff" stroke-opacity="0.035" stroke-width="1"/>
                </pattern>
              </defs>
              <rect width="${GENISLIK}" height="${YUKSEKLIK}" fill="url(#zemin)"/>
              <rect width="${GENISLIK}" height="${YUKSEKLIK}" fill="url(#izgara)"/>
              <!-- sağdan giren kırmızı kama -->
              <path d="M ${GENISLIK + 40} -40 L ${GENISLIK + 40} ${YUKSEKLIK + 40} L 690 ${YUKSEKLIK + 40} L 1030 -40 Z" fill="url(#kama)"/>
              <!-- sarı ince çizgi -->
              <path d="M 1000 -40 L 660 ${YUKSEKLIK + 40}" stroke="#ffd23f" stroke-width="7" stroke-opacity="0.9" fill="none"/>
              <!-- ikinci, koyu kama (derinlik) -->
              <path d="M ${GENISLIK + 40} -40 L ${GENISLIK + 40} ${YUKSEKLIK + 40} L 1010 ${YUKSEKLIK + 40} L 1215 -40 Z" fill="#05070d" fill-opacity="0.42"/>
              <text x="1252" y="556" font-family="Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif"
                    font-size="560" font-weight="700" fill="#ffffff" fill-opacity="0.10"
                    text-anchor="end">${harf}</text>
              <g font-family="Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif">
                ${kategori ? `<text x="64" y="${Math.round(ilkY - 58)}" font-size="25" font-weight="700" fill="#ffd23f" letter-spacing="3.4">${kategori}</text>` : ""}
                ${baslikSvg}
              </g>
            </svg>`
          ),
        },
      ])
      .png()
      .toBuffer();
  }

  if (debug) console.log(`   · ${a.id} taban hazır: ${taban ? taban.length : 0} bayt`);
  const svg = kapakSvg();
  const bilesik = await sharp(taban)
    .composite([{ input: Buffer.from(svg) }])
    .webp({ quality: KALITE, effort: 4 })
    .toBuffer();

  if (!dry) {
    fs.mkdirSync(CIKTI_DIZIN, { recursive: true });
    yazDosya(dosya, bilesik);
    if (debug) console.log(`   · ${a.id} kapak yazıldı (${bilesik.length} bayt)`);
    // Küçük varyant: liste/kart görünümü için (~20 KB).
    const kucukVeri = await sharp(bilesik)
      .resize(KUCUK_GENISLIK, Math.round((KUCUK_GENISLIK * YUKSEKLIK) / GENISLIK))
      .webp({ quality: 78, effort: 4 })
      .toBuffer();
    yazDosya(dosya.replace(/\.webp$/, "-480.webp"), kucukVeri);
    if (debug) console.log(`   · ${a.id} küçük varyant yazıldı`);
  }
  return { url: `${URL_TABANI}/${a.id}.webp`, atif: yeniAtif, foto: fotoVar };
}

// --------------------------------------------------------- marka izi modu
// Var olan kapaklara (yeni tasarım öncesi üretilmiş olanlara) yalnızca marka
// izini ekler; fotoğrafı yeniden indirmez. Tek seferlik geçiş için.
if (process.argv.includes("--marka")) {
  const dosyalar = fs.readdirSync(CIKTI_DIZIN).filter((f) => f.endsWith(".webp") && !f.endsWith("-480.webp"));
  let sayi = 0;
  let atlanan = 0;
  await havuz(dosyalar, 3, async (f) => {
    const yol = path.join(CIKTI_DIZIN, f);
    try {
      const veri = await sharp(yol)
        .composite([{ input: Buffer.from(kapakSvg()) }])
        .webp({ quality: KALITE, effort: 4 })
        .toBuffer();
      yazDosya(yol, veri);
      await sharp(veri)
        .resize(KUCUK_GENISLIK, Math.round((KUCUK_GENISLIK * YUKSEKLIK) / GENISLIK))
        .webp({ quality: 78, effort: 4 })
        .toFile(yol.replace(/\.webp$/, "-480.webp"));
      sayi++;
    } catch (err) {
      atlanan++;
      console.warn(`   ! ${f}: ${err.message}`);
    }
  });
  console.log(`${sayi} kapağa marka izi eklendi${atlanan ? `, ${atlanan} atlandı` : ""}.`);
  process.exit(0);
}

// ------------------------------------------------------- küçük varyant modu
// 1280 px kapaklar üretildikten sonra eksik 480 px kart varyantlarını tamamlar.
if (process.argv.includes("--varyant")) {
  const hedefKucuk = (f) => path.join(CIKTI_DIZIN, f.replace(/\.webp$/, "-480.webp"));
  let sayi = 0;
  if (fs.existsSync(CIKTI_DIZIN)) {
    for (const f of fs.readdirSync(CIKTI_DIZIN)) {
      if (!f.endsWith(".webp") || f.endsWith("-480.webp")) continue;
      const kucuk = hedefKucuk(f);
      if (fs.existsSync(kucuk)) continue;
      await sharp(path.join(CIKTI_DIZIN, f))
        .resize(KUCUK_GENISLIK, Math.round((KUCUK_GENISLIK * YUKSEKLIK) / GENISLIK))
        .webp({ quality: 78, effort: 4 })
        .toFile(kucuk);
      sayi++;
    }
  }
  console.log(`${sayi} küçük kapak varyantı üretildi.`);
  process.exit(0);
}

// ------------------------------------------------------------------ çalıştır
let uretilen = 0;
let hata = 0;

/** Basit iş havuzu: ağ beklemesi çok olduğu için kapaklar paralel üretilir. */
async function havuz(dizi, esZamanli, islev) {
  let imlec = 0;
  const isciler = Array.from({ length: Math.min(esZamanli, dizi.length) }, async () => {
    while (imlec < dizi.length) {
      const oge = dizi[imlec++];
      await islev(oge);
    }
  });
  await Promise.all(isciler);
}

await havuz(hedefler, paralel, async (a) => {
  const eski = a.image;
  const taban = a.kapak?.kaynak || eski;
  try {
    const sonuc = await kapakUret(a);
    console.log(`${dry ? "[dry] " : ""}${a.title.slice(0, 70)} → ${sonuc.url}`);
    if (!dry) {
      a.image = sonuc.url;
      a.kapak = { v: 2, kaynak: taban, foto: sonuc.foto };
      if (sonuc.atif) a.gorselKaynak = sonuc.atif;
    }
    uretilen++;
  } catch (err) {
    hata++;
    console.warn(`  ! ${a.id}: ${err.message}`);
  }
});

if (!dry && uretilen) {
  fs.writeFileSync(ARTICLES, JSON.stringify(articles, null, 2).replace(/\n/g, satirSonu) + satirSonu);
}
console.log(
  `\n${uretilen} kapak ${dry ? "üretilecek" : "üretildi"}` + (hata ? `, ${hata} hata` : "") + "."
);
