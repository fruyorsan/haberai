// ==========================================================================
// KAYNAK FOTOĞRAFI HATTI — og:image / twitter:image / gövde görselleri
// --------------------------------------------------------------------------
// NEDEN: 2026-11-08 ölçümü — arşivdeki 5.803 haberin 4.416'sının kapağı
// ikonlu tasarım kartıydı (%76). Boru hattı 2026-10'da "yayıncının kendi
// görselini kullanma" kararıyla `kaynakGorselAdaylari()` fonksiyonunu boş
// döndürüyordu; geriye yalnızca CC0 Commons + Openverse + AI kaldı ve bunların
// konu/isim eşleşme kapıları çok sıkı olduğu için kapaklar karta düşüyordu.
//
// NE YAPAR: Haberin çıktığı sitenin KENDİ og:image / twitter:image / JSON-LD
// görselini aday olarak toplar (yayıncı o kareyi zaten haber için seçmiş:
// anlamsal uyum en güçlü sinyal) ve kalite kapısından geçirir:
//   • çözünürlük (1280×720 kapağa upscale etmeyecek kadar büyük),
//   • 16:9 kırpma güvenliği (oran aralığı),
//   • bulanıklık (gradyan), düzlük (entropi, stddev),
//   • beyaz/metin ağırlıklı kare (ekran görüntüsü, ürün kataloğu, paylaşım kartı),
//   • yayıncının başlık bastığı kırmızı/beyaz paylaşım kartı,
//   • jenerik site görseli (logo, avatar, placeholder, 1x1, sprite).
//
// TELİF/AYNI-ESER KURALI: Rakip yayıncının kendi ürettiği görselleri birebir
// kopyalamak yasak (ShiftDelete açıkça yasaklandı → `KAYNAK_YASAK`). Ajans
// CDN'leri (Getty/Reuters/Shutterstock/AA görsel sunucusu) de reddedilir.
// Kullanılan kare `gorselKaynak` + `kapak.kaynakTur="kaynak"` ile kaynak
// sayfaya atıflanır; telif şikâyeti gelirse kaynak bağlantısı hazırdır.
// ==========================================================================
import sharp from "sharp";

const UA_TARAYICI =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Rakip yayıncının ürettiği kareler kopyalanmaz (kullanıcı talimatı).
// Ajans CDN'leri: lisanssız kullanım riski yüksek.
const KAYNAK_YASAK =
  /(^|\.)(shiftdelete\.net|gettyimages\.[a-z.]+|reuters\.com|apimages\.com|shutterstock\.com|istockphoto\.com|depositphotos\.com|alamy\.com|imago-images\.[a-z.]+|dha\.com\.tr|iha\.com\.tr|anadoluajans\.com)$/i;

// Görsel dosyası olmayan adresler (site şablonları, izleme pikselleri).
const GORSEL_DEGIL =
  /(sprite|logo|favicon|avatar|placeholder|default[-_]?(image|img|cover)|no[-_]?image|1x1|pixel|spacer|blank|whatsapp|facebook\.com\/tr|twitter\.com\/|telegram|\.svg(\?|$)|\.gif(\?|$))/i;

/** Kalite kapısı eşikleri — 26 gerçek og:image + bozuk örneklerle kalibre edildi. */
export const ESIK = {
  minGenislik: 880,
  minYukseklik: 480,
  minOran: 1.2,
  maxOran: 3.0,
  minEntropi: 4.2,
  maxBeyazOran: 0.62,
  minStdSapma: 25,
  minGradyan: 7,
  // Başlık bindirmesi: kare yüksekliğinin %8'inden fazlası "koyu zemin +
  // saf beyaz punto" satırıysa yayıncı başlığı fotoğrafın üstüne basmıştır.
  // Gerçek editöryal fotoğraflarda kanal logosu en fazla ~%4 üretir.
  maxBaslikSatiri: 8,
  // Ekran görüntüsü / upscale izi: gradyan ve kontrast BİRLİKTE düşükse
  // (oyun karesi, HUD, bulanık büyütme) kare kapak değildir. Yumuşak odaklı
  // gerçek portreler gradyanı düşük ama kontrastı yüksek tuttuğu için geçer.
  duzGradyan: 9,
  duzStd: 35,
};

function host(u) {
  try {
    return new URL(u).host.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Bu kaynak siteden görsel alınabilir mi? */
export function kaynakIzinli(url) {
  const h = host(url);
  if (!h) return false;
  return !KAYNAK_YASAK.test(h);
}

/** HTML içinden görsel adaylarını öncelik sırasıyla çıkarır. */
function htmlAdaylari(html, taban) {
  const adaylar = [];
  const ekle = (u, alt = "") => {
    if (!u) return;
    try {
      const tam = new URL(String(u).replace(/&amp;/g, "&").trim(), taban).href;
      if (/^https?:\/\//i.test(tam)) adaylar.push({ url: tam, alt: String(alt || "") });
    } catch {}
  };

  // 1) og:image (+ secure_url / url) — iki yazım sırası da var.
  const kaliplar = [
    /<meta[^>]+property=["']og:image(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url|:url)?["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/i,
  ];
  for (const k of kaliplar) {
    const m = k.exec(html);
    if (m) ekle(m[1]);
  }
  // og:image:alt — anlamsal denetim için tek ipucu.
  const altM = /<meta[^>]+property=["']og:image:alt["'][^>]+content=["']([^"']*)["']/i.exec(html);
  if (altM && adaylar[0]) adaylar[0].alt = altM[1];

  // 2) JSON-LD "image" (NewsArticle).
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const d = JSON.parse(m[1].trim());
      const yigin = Array.isArray(d) ? d : [d];
      for (const o of yigin) {
        const g = o?.image;
        if (typeof g === "string") ekle(g);
        else if (Array.isArray(g)) for (const x of g) ekle(typeof x === "string" ? x : x?.url);
        else if (g?.url) ekle(g.url);
      }
    } catch {}
  }

  // 3) DonanımHaber paylaşım kartı → temiz `/src/` karesi (başlık plakası yok).
  for (const a of [...adaylar]) {
    const m = /^(https?:\/\/[^/]+\/images\/images\/haber\/(\d+)\/)(?:1200x675|600x314|340x191)([^/?#]+)\.(jpe?g|png|webp)$/i.exec(a.url);
    if (m) adaylar.unshift({ url: `${m[1]}src/${m[3]}${m[2]}_0.${m[4]}`, alt: a.alt });
  }

  // 4) Gövde görselleri: en büyük `width` bildirilenler önce.
  const govde = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const etiket = m[0];
    const src = /(?:data-src|data-original|srcset|src)=["']([^"'\s]+)/i.exec(etiket)?.[1];
    if (!src) continue;
    const gen = Number(/\bwidth=["']?(\d+)/i.exec(etiket)?.[1] || 0);
    const alt = /alt=["']([^"']*)["']/i.exec(etiket)?.[1] || "";
    govde.push({ src, gen, alt });
  }
  govde.sort((x, y) => y.gen - x.gen);
  for (const g of govde.slice(0, 8)) ekle(g.src, g.alt);

  // Tekrarları temizle + jenerik/logo adreslerini at.
  const gorulen = new Set();
  return adaylar.filter((a) => {
    if (gorulen.has(a.url)) return false;
    gorulen.add(a.url);
    return !GORSEL_DEGIL.test(a.url);
  });
}

/**
 * Haberin kaynak sayfasından görsel adayları.
 * @param {object} article  `sourceUrl` dolu haber kaydı.
 * @param {{adet?:number, debug?:boolean}} [sec]
 * @returns {Promise<Array<{url:string, alt:string, tip:string}>>}
 */
export async function kaynakAdaylari(article, { adet = 6, debug = false } = {}) {
  const adres = String(article?.sourceUrl || "");
  if (!/^https?:\/\//i.test(adres)) return [];
  if (!kaynakIzinli(adres)) {
    if (debug) console.log(`      · kaynak yasaklı (telif): ${host(adres)}`);
    return [];
  }
  try {
    const yanit = await fetch(adres, {
      headers: {
        "user-agent": UA_TARAYICI,
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "accept-language": "tr-TR,tr;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (!yanit.ok) {
      if (debug) console.log(`      · kaynak sayfa HTTP ${yanit.status}`);
      return [];
    }
    const html = (await yanit.text()).slice(0, 500000);
    return htmlAdaylari(html, yanit.url || adres)
      .filter((a) => kaynakIzinli(a.url))
      .slice(0, adet)
      .map((a) => ({ ...a, tip: "kaynak" }));
  } catch (err) {
    if (debug) console.log(`      · kaynak sayfa hatası: ${err.message}`);
    return [];
  }
}

/** Gri tonda gradyan/kenar/beyaz istatistikleri (bulanıklık ve grafik tespiti). */
async function pikselOlcum(veri) {
  const st = await sharp(veri).stats();
  const { data: gri, info } = await sharp(veri)
    .resize(384, 384, { fit: "inside" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const gw = info.width;
  const gh = info.height;
  let kenar = 0;
  let toplam = 0;
  let beyaz = 0;
  let gradyan = 0;
  for (let y = 1; y < gh; y++) {
    for (let x = 1; x < gw; x++) {
      const i = y * gw + x;
      const g = gri[i];
      const dx = Math.abs(g - gri[i - 1]);
      const dy = Math.abs(g - gri[i - gw]);
      gradyan += dx + dy;
      if (dx + dy > 60) kenar++;
      toplam++;
      if (g > 242) beyaz++;
    }
  }
  const sd = st.channels.map((c) => c.stdev);
  return {
    entropi: st.entropy,
    stdSapma: sd.reduce((s, v) => s + v, 0) / (sd.length || 1),
    gradyan: gradyan / Math.max(1, toplam),
    kenarOran: kenar / Math.max(1, toplam),
    beyazOran: beyaz / Math.max(1, toplam),
  };
}

/**
 * Yayıncının fotoğrafın üstüne başlık bastığı kareleri yakalar.
 * İki ayrı kalıp var:
 *  1) kırmızı plaka + beyaz punto (klasik paylaşım kartı),
 *  2) fotoğrafın altına/sağına oturan büyük punto başlık ("Çin'de Çöküş
 *     Başladı" tipi) veya alt banda basılmış kanal yazısı.
 * Gerçek fotoğrafta parlak piksel vardır ama "koyu zemin + saf beyaz yazı"
 * satırı yüksekliğin %8'ini geçmez.
 */
async function paylasimKartiMi(veri) {
  try {
    const { data, info } = await sharp(veri)
      .resize(400, 400, { fit: "inside" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width: w, height: h, channels: ch } = info;

    // --- 1) kırmızı plaka kalıbı (eski dedektör) ---
    let plakaSatir = 0;
    let beyazSatir = 0;
    // --- 2) koyu zemin üstünde saf beyaz punktolu başlık satırları ---
    const satirlar = [];
    let kartSatir = 0;
    let run = 0;
    let enUzunBlok = 0;

    for (let y = 0; y < h; y++) {
      let kirmizi = 0;
      let beyazPlaka = 0;
      let gecisPlaka = 0;
      let oncekiPlaka = -1;
      let saf = 0;
      let gecisSaf = 0;
      let oncekiSaf = false;
      let lsum = 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * ch;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        lsum += l;

        const beyazMi = r >= 238 && g >= 238 && b >= 238;
        const kirmiziMi = r >= 140 && r - g >= 60 && r - b >= 50;
        if (kirmiziMi) {
          kirmizi++;
          if (oncekiPlaka === 0) gecisPlaka++;
          oncekiPlaka = 1;
        } else {
          if (beyazMi) beyazPlaka++;
          if (oncekiPlaka === 1) gecisPlaka++;
          oncekiPlaka = 0;
        }

        const safMi = r >= 245 && g >= 245 && b >= 245;
        if (safMi) saf++;
        if (safMi !== oncekiSaf) gecisSaf++;
        oncekiSaf = safMi;
      }
      if (kirmizi / w >= 0.25 && gecisPlaka >= 4) {
        plakaSatir++;
        if (beyazPlaka / w >= 0.03) beyazSatir++;
      }
      satirlar.push({ saf: saf / w, gecis: gecisSaf, ort: lsum / w });
    }

    for (let y = 0; y < h; y++) {
      const s = satirlar[y];
      let cevre = 0;
      let n = 0;
      for (let k = Math.max(0, y - 6); k <= Math.min(h - 1, y + 6); k++) {
        cevre += satirlar[k].ort;
        n++;
      }
      cevre /= n;
      const yazi =
        s.saf >= 0.01 && s.saf <= 0.5 && s.gecis >= 12 && s.ort < 200 && cevre < 150;
      if (yazi) {
        kartSatir++;
        run++;
        if (run > enUzunBlok) enUzunBlok = run;
      } else run = 0;
    }

    const plakaOran = (plakaSatir / h) * 100;
    const yazi = beyazSatir / h;
    const baslik = (kartSatir / h) * 100;
    const baslikBlok = (enUzunBlok / h) * 100;
    return {
      kart: (plakaOran >= 8 && yazi >= 0.04) || baslik >= ESIK.maxBaslikSatiri,
      plakaOran,
      yazi,
      baslik,
      baslikBlok,
    };
  } catch {
    return { kart: false, plakaOran: 0, yazi: 0, baslik: 0, baslikBlok: 0 };
  }
}

/**
 * Kapak olarak kullanılabilir mi? (kalite kapısı)
 * @param {Buffer} veri Görsel baytları.
 * @returns {Promise<{uygun:boolean, neden:string, olcum:object}>}
 */
export async function kapakVerisiUygun(veri) {
  let md;
  try {
    md = await sharp(veri).metadata();
  } catch {
    return { uygun: false, neden: "çözülemedi", olcum: {} };
  }
  const w = md.width || 0;
  const h = md.height || 0;
  const oran = w / Math.max(1, h);
  const temel = { w, h, oran: +oran.toFixed(2) };
  if (w < ESIK.minGenislik || h < ESIK.minYukseklik)
    return { uygun: false, neden: `küçük (${w}×${h})`, olcum: temel };
  if (oran < ESIK.minOran)
    return { uygun: false, neden: `oran dar (${oran.toFixed(2)})`, olcum: temel };
  if (oran > ESIK.maxOran)
    return { uygun: false, neden: `oran aşırı geniş (${oran.toFixed(2)})`, olcum: temel };

  const kart = await paylasimKartiMi(veri);
  if (kart.kart)
    return {
      uygun: false,
      neden:
        kart.baslik >= ESIK.maxBaslikSatiri
          ? `fotoğraf üstüne basılı başlık (satır %${kart.baslik.toFixed(1)})`
          : `yayıncı paylaşım kartı (plaka %${kart.plakaOran.toFixed(0)}, yazı %${(kart.yazi * 100).toFixed(1)})`,
      olcum: temel,
    };

  let p;
  try {
    p = await pikselOlcum(veri);
  } catch {
    return { uygun: false, neden: "piksel okunamadı", olcum: temel };
  }
  const olcum = {
    ...temel,
    entropi: +p.entropi.toFixed(2),
    std: +p.stdSapma.toFixed(1),
    gradyan: +p.gradyan.toFixed(1),
    kenar: +p.kenarOran.toFixed(3),
    beyaz: +p.beyazOran.toFixed(2),
  };
  if (p.entropi < ESIK.minEntropi) return { uygun: false, neden: `düz/az detay (entropi ${olcum.entropi})`, olcum };
  if (p.beyazOran > ESIK.maxBeyazOran)
    return { uygun: false, neden: `beyaz/metin ağırlıklı (%${Math.round(p.beyazOran * 100)})`, olcum };
  if (p.stdSapma < ESIK.minStdSapma) return { uygun: false, neden: `düşük kontrast (std ${olcum.std})`, olcum };
  if (p.gradyan < ESIK.minGradyan) return { uygun: false, neden: `bulanık (gradyan ${olcum.gradyan})`, olcum };
  // Ekran görüntüsü / upscale: gradyan ve kontrast birlikte düşük. Oyun karesi,
  // HUD, yakınlaştırılmış düşük çözünürlüklü görsel buraya düşer.
  if (p.gradyan < ESIK.duzGradyan && p.stdSapma < ESIK.duzStd)
    return { uygun: false, neden: `ekran görüntüsü/düz (gradyan ${olcum.gradyan}, std ${olcum.std})`, olcum };
  return { uygun: true, neden: "geçti", olcum };
}

/**
 * Kaynak görseli için atıf kaydı. Site `gorselKaynak` alanını lisans
 * kayıtlarında kullanır; burada fotoğrafın hangi haber sayfasından alındığı
 * ve yayıncı alan adı tutulur (telif şikâyetinde kaynak zinciri).
 */
export function kaynakAtif(article, url) {
  const site = host(url) || (() => {
    try {
      return host(article?.sourceUrl);
    } catch {
      return "";
    }
  })();
  return {
    yazar: "",
    lisans: "Kaynak sitesi",
    lisansUrl: String(article?.sourceUrl || ""),
    sayfa: String(article?.sourceUrl || ""),
    site,
  };
}

/**
 * Standart haber kapağına (1280×720) kırpar: odak-noktası (`attention`)
 * kullanır, böylece yüz/ürün merkezde kalır; küçük kaynağı hafif keskinleştirir.
 * @param {Buffer} veri
 * @param {{genislik?:number, yukseklik?:number}} [olcu]
 */
export async function kapakKirp(veri, { genislik = 1280, yukseklik = 720 } = {}) {
  const bilgi = await sharp(veri).metadata();
  const w = bilgi.width || 0;
  const h = bilgi.height || 0;
  const buyutme = genislik / Math.max(1, w);
  const keskinlik =
    buyutme > 1.3
      ? { sigma: 1.2, m1: 1.2, m2: 0.6 }
      : buyutme > 1.05
        ? { sigma: 0.9, m1: 0.8, m2: 0.4 }
        : { sigma: 0.6 };
  const konum =
    w * h <= 16_000_000 && w / Math.max(1, h) >= 1.3 ? sharp.strategy.attention : "centre";
  return sharp(veri)
    .resize(genislik, yukseklik, { fit: "cover", position: konum })
    .sharpen(keskinlik)
    .toBuffer();
}

export { host as kaynakHost };
