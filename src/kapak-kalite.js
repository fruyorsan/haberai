// ==========================================================================
// KAPAK KALİTE KAPISI — "bu kare kapak olabilir mi?"
// --------------------------------------------------------------------------
// NEDEN: 2026-11-08 kullanıcı 12 önce/sonra örneğini reddetti. Reddedilen
// karelerin ortak kusurları:
//   1) fotoğrafın üstüne/altına basılmış büyük başlık bandı
//      ("Çin'de Çöküş Başladı", "İsrail seçiminde kritik soru…"),
//   2) yayıncı filigranı / kanal logosu (BBC NEWS, CNN TÜRK, ajans damgası),
//   3) foto-kolaj / kompozit (adam + yanmış araç, ızgara düzenler),
//   4) ekran görüntüsü, kesik ürün kolajı (düz zeminli katalog karesi),
//   5) kaynak sitenin kendi görseli (telif) — hattan çıkarıldı, ayrı iş.
//
// YÖNTEM (tek geçiş, 960×540 gri tampon üzerinde — küçük punto kaybolmasın):
//   YAZI: satırda (a) baskın düz küme ≥ %45, (b) aşırı tonlu (≥236 / ≤18)
//   piksel oranı %1–45, (c) ≥12 keskin geçiş. Ardışık blok ≥ %6 veya toplam
//   yazı satırı ≥ %18 ise "yazı bandı".
//   FİLİGRAN: köşe kutusunda (genişlik %32, yükseklik %18) ≥ %1,5 saf beyaz
//   VE satırların ≥ %20'sinde ≥4 beyaz koşu (harf/logoyu ayırır, bulutu değil).
//   KOLAJ: ikiye ayıran dikey/yatay çizgide komşu satır-sütun farkı tüm
//   boyunca (≥%90) sürüyor ve ortalama fark yüksek → yapıştırma dikişi.
//   DÜZ ZEMİN: karenin ≥ %93'ü yerel ortalamaya ±4 içinde ve kenar yoğunluğu
//   ~0 → degrade zemin üzerine kesilmiş nesne (ürün kolajı).
//
// Eşikler `reports/kapak-kalite-referans` içindeki 12 kare üzerinde kalibre
// edildi (11 kusurlu + 1 temiz). Ölçüm: scripts/kapak-kalite-kalibre.mjs.
// ==========================================================================
import sharp from "sharp";

export const KALITE_ESIK = {
  // YAZI — 1. kural: düz zemin + keskin geçişler (bant, plaka, kart).
  yaziBaskinKume: 0.5,
  yaziGecis: 12,
  yaziBeyazAz: 0.012,
  yaziBeyazCok: 0.42,
  yaziBlokOran: 0.045,
  yaziToplamOran: 0.18,
  // YAZI — 2. kural: fotoğraf üstüne gölgeli/konturlu büyük başlık.
  // Beyaz harf yoğun ve geçiş sayısı çok yüksek.
  baslikGecis: 24,
  baslikBeyazAz: 0.015,
  baslikBeyazCok: 0.25,
  baslikBlokOran: 0.05,
  baslikToplamOran: 0.12,
  // FİLİGRAN: köşede beyaz harf koşuları.
  filigranBeyaz: 0.015,
  filigranSatir: 0.12,
  // Ekran görüntüsü / beyaz kart köşesi.
  ekranBeyaz: 0.25,
  ekranSatir: 0.04,
  // KOLAJ
  dikisDikeyOran: 0.78,
  dikisDikeyOrt: 80,
  dikisYatayOran: 0.6,
  dikisYatayOrt: 55,
  // DÜZ ZEMİN
  duzZemin: 0.93,
  duzZeminKenar: 0.008,
  // Ölçüm genişliği (küçük yazı kaybolmasın; 960 altı kaynak büyütülmez).
  olcumGenislik: 960,
};

/** Gri tampon + satır istatistikleri. */
async function tampon(veri) {
  const md = await sharp(veri).metadata();
  const w0 = md.width || 0;
  const h0 = md.height || 0;
  const E = KALITE_ESIK.olcumGenislik;
  const olcek = w0 > E ? E / w0 : 1;
  const W = Math.max(64, Math.round(w0 * olcek));
  const H = Math.max(36, Math.round(h0 * olcek));
  const { data, info } = await sharp(veri)
    .resize(W, H, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  const G = new Float32Array(w * h);
  const BEYAZ = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += ch) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    G[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    BEYAZ[p] = r >= 236 && g >= 236 && b >= 236 ? 1 : 0;
  }
  // BEYAZ GÖVDE ÖLÇÜTÜ: ürünün kendi beyaz yüzeyi (telefon arka camı, krom
  // gövde) yazı sanılıp iyi kareler eleniyordu. Yazı harfleri çok sayıda KÜÇÜK
  // ayrık adacıktır; ürün gövdesi TEK BÜYÜK bitişik alandır. En büyük beyaz
  // bileşenin tüm kareye oranı %8'i geçerse beyaz sinyali "gövde" sayılır.
  let enBuyukBeyaz = 0;
  let bb = { x0: 0, y0: 0, x1: 0, y1: 0 };
  {
    const gorulen = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) {
      if (gorulen[p] || !BEYAZ[p]) continue;
      let yigin = [p];
      gorulen[p] = 1;
      let boy = 0;
      let bx0 = w, by0 = h, bx1 = 0, by1 = 0;
      while (yigin.length) {
        const q = yigin.pop();
        boy++;
        const qy = (q / w) | 0;
        const qx = q % w;
        if (qx < bx0) bx0 = qx;
        if (qx > bx1) bx1 = qx;
        if (qy < by0) by0 = qy;
        if (qy > by1) by1 = qy;
        if (qx > 0 && !gorulen[q - 1] && BEYAZ[q - 1]) { gorulen[q - 1] = 1; yigin.push(q - 1); }
        if (qx < w - 1 && !gorulen[q + 1] && BEYAZ[q + 1]) { gorulen[q + 1] = 1; yigin.push(q + 1); }
        if (qy > 0 && !gorulen[q - w] && BEYAZ[q - w]) { gorulen[q - w] = 1; yigin.push(q - w); }
        if (qy < h - 1 && !gorulen[q + w] && BEYAZ[q + w]) { gorulen[q + w] = 1; yigin.push(q + w); }
      }
      if (boy > enBuyukBeyaz) {
        enBuyukBeyaz = boy;
        bb = { x0: bx0, y0: by0, x1: bx1, y1: by1 };
      }
    }
  }
  const enBuyukOran = enBuyukBeyaz / (w * h);
  // Yazı BANDI beyaz zeminli olabilir: o zaman en büyük beyaz bileşen neredeyse
  // tüm genişliği kaplayan ince bir şerittir. Telefon gövdesi ise geniş ama
  // kısa olmayan, ortada duran bir bloktur.
  const bbGenis = (bb.x1 - bb.x0 + 1) / w;
  const bbYuk = (bb.y1 - bb.y0 + 1) / h;
  const bantGibi = bbGenis >= 0.85 && bbYuk <= 0.45;
  const beyazGovde = enBuyukOran > 0.08 && !bantGibi;
  return { G, BEYAZ, w, h, beyazGovde };
}

/**
 * Kalite ölçümü.
 * @param {Buffer} veri
 * @returns {Promise<object>}
 */
export async function kapakKaliteOlc(veri) {
  const { G, BEYAZ, w, h, beyazGovde } = await tampon(veri);

  // --- YAZI satırları ------------------------------------------------------
  // İki ayrı kural:
  //  T1: düz zemin (baskın küme ≥ %50) + saf beyaz harf + keskin geçişler
  //      → bant, plaka, beyaz kart (ekran görüntüsü).
  //  T2: fotoğraf üzerine gölgeli büyük başlık → beyaz harf yoğun, geçiş çok.
  let yaziSatir = 0;
  let yaziBlok = 0;
  let yaziRun = 0;
  let baslikSatir = 0;
  let baslikBlok = 0;
  let baslikRun = 0;
  for (let y = 0; y < h; y++) {
    const alt = y * w;
    // Medyan için 64 kademeli histogram (hız).
    const hist = new Uint32Array(64);
    for (let x = 0; x < w; x++) hist[Math.min(63, G[alt + x] >> 2)]++;
    let acc = 0;
    let medyan = 0;
    for (let k = 0; k < 64; k++) {
      acc += hist[k];
      if (acc >= w / 2) {
        medyan = k * 4 + 2;
        break;
      }
    }
    let baskin = 0;
    let beyaz = 0;
    let gecis = 0;
    let isaret = 0;
    for (let x = 0; x < w; x++) {
      const v = G[alt + x];
      if (Math.abs(v - medyan) <= 16) baskin++;
      if (BEYAZ[alt + x]) beyaz++;
      if (x > 0) {
        const d = v - G[alt + x - 1];
        const s = d > 25 ? 1 : d < -25 ? -1 : 0;
        if (s && s !== isaret && isaret) gecis++;
        if (s) isaret = s;
      }
    }
    const oran = beyaz / w;
    const t1 =
      baskin / w >= KALITE_ESIK.yaziBaskinKume &&
      oran >= KALITE_ESIK.yaziBeyazAz &&
      oran <= KALITE_ESIK.yaziBeyazCok &&
      gecis >= KALITE_ESIK.yaziGecis;
    if (t1) {
      yaziSatir++;
      yaziRun++;
      if (yaziRun > yaziBlok) yaziBlok = yaziRun;
    } else yaziRun = 0;

    const t2 =
      gecis >= KALITE_ESIK.baslikGecis &&
      oran >= KALITE_ESIK.baslikBeyazAz &&
      oran <= KALITE_ESIK.baslikBeyazCok;
    if (t2) {
      baslikSatir++;
      baslikRun++;
      if (baslikRun > baslikBlok) baslikBlok = baslikRun;
    } else baslikRun = 0;
  }

  // --- FİLİGRAN ------------------------------------------------------------
  const koseler = [
    { ad: "sol-ust", x0: 0, x1: 0.32, y0: 0, y1: 0.18 },
    { ad: "sag-ust", x0: 0.68, x1: 1, y0: 0, y1: 0.18 },
    { ad: "sol-alt", x0: 0, x1: 0.32, y0: 0.82, y1: 1 },
    { ad: "sag-alt", x0: 0.68, x1: 1, y0: 0.82, y1: 1 },
  ];
  let filigran = null;
  let filigranOlcum = 0;
  let ekran = null;
  for (const k of koseler) {
    const xs = Math.round(k.x0 * w);
    const xe = Math.round(k.x1 * w);
    const ys = Math.round(k.y0 * h);
    const ye = Math.round(k.y1 * h);
    let beyaz = 0;
    let n = 0;
    let iyiSatir = 0;
    let satir = 0;
    let kosuToplam = 0;
    let kosuSayi = 0;
    for (let y = ys; y < ye; y++) {
      const alt = y * w;
      let wc = 0;
      let kosu = 0;
      let onceki = 0;
      let buSatirKosu = 0;
      for (let x = xs; x < xe; x++) {
        n++;
        const b = BEYAZ[alt + x];
        if (b) {
          beyaz++;
          wc++;
          if (!onceki) {
            kosu++;
            buSatirKosu++;
          }
        }
        onceki = b;
      }
      kosuToplam += buSatirKosu ? wc / buSatirKosu : 0;
      kosuSayi += buSatirKosu ? 1 : 0;
      satir++;
      if (wc >= 12 && kosu >= 4) iyiSatir++;
    }
    const oran = beyaz / Math.max(1, n);
    const satirOran = iyiSatir / Math.max(1, satir);
    // OKUNAKLI FİLİGRAN ÖLÇÜTÜ: gerçek filigran HARF adacıklarından oluşur —
    // küçük, ayrık beyaz parçalar. Ürünün kendi beyaz gövdesi/parlak metali ise
    // köşede TEK BÜYÜK bitişik beyaz blok verir (iPhone arka yüzü böyle
    // eleniyordu). En büyük beyaz bağlı bileşen köşenin %2'sini aşarsa filigran
    // sayılmaz.
    let enBuyuk = 0;
    {
      const gw = xe - xs;
      const gh = ye - ys;
      const gorulen = new Uint8Array(gw * gh);
      for (let gy = 0; gy < gh; gy++) {
        for (let gx = 0; gx < gw; gx++) {
          const bas = gy * gw + gx;
          if (gorulen[bas] || !BEYAZ[(ys + gy) * w + xs + gx]) continue;
          let yigin = [bas];
          gorulen[bas] = 1;
          let boy = 0;
          while (yigin.length) {
            const p = yigin.pop();
            boy++;
            const py = (p / gw) | 0;
            const px = p % gw;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = px + dx;
              const ny = py + dy;
              if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
              const np = ny * gw + nx;
              if (gorulen[np] || !BEYAZ[(ys + ny) * w + xs + nx]) continue;
              gorulen[np] = 1;
              yigin.push(np);
            }
          }
          if (boy > enBuyuk) enBuyuk = boy;
        }
      }
    }
    const enBuyukOran = enBuyuk / Math.max(1, (xe - xs) * (ye - ys));
    if (
      enBuyukOran <= 0.02 &&
      oran >= KALITE_ESIK.filigranBeyaz &&
      satirOran >= KALITE_ESIK.filigranSatir &&
      oran * satirOran > filigranOlcum
    ) {
      filigranOlcum = oran * satirOran;
      filigran = { bolge: k.ad, oran: +oran.toFixed(3), satir: +satirOran.toFixed(2), blok: +enBuyukOran.toFixed(3) };
    }
    // Beyaz kart / ekran görüntüsü: köşenin büyük kısmı saf beyaz ve içinde
    // yazı satırları var (telefon ekranı, ürün kataloğu kartı).
    if (!ekran && oran >= KALITE_ESIK.ekranBeyaz && satirOran >= KALITE_ESIK.ekranSatir) {
      ekran = { bolge: k.ad, oran: +oran.toFixed(3), satir: +satirOran.toFixed(2) };
    }
  }

  // --- KOLAJ dikişi --------------------------------------------------------
  const dikis = (dikey) => {
    const n = dikey ? w : h;
    const boy = dikey ? h : w;
    let en = { oran: 0, ort: 0, konum: -1 };
    for (let p = 1; p < n; p++) {
      let sayi = 0;
      let toplam = 0;
      for (let q = 0; q < boy; q++) {
        const a = dikey ? G[q * w + p - 1] : G[(p - 1) * w + q];
        const b = dikey ? G[q * w + p] : G[p * w + q];
        const d = Math.abs(b - a);
        if (d >= 28) sayi++;
        toplam += d;
      }
      // Kalibrasyonda görüldü: yapıştırma dikişi hem oranı hem ortalaması
      // yüksek tutar; doğal dikey kenar (direk, kapı) oranı düşürür.
      const oran = sayi / boy;
      const ort = toplam / boy;
      if (oran > en.oran && ort > en.ort) en = { oran: +oran.toFixed(2), ort: +ort.toFixed(0), konum: p };
      else if (oran === en.oran && ort > en.ort) en = { oran: +oran.toFixed(2), ort: +ort.toFixed(0), konum: p };
    }
    return en;
  };
  const dv = dikis(true);
  const dy = dikis(false);
  const kolaj =
    (dv.oran >= KALITE_ESIK.dikisDikeyOran && dv.ort >= KALITE_ESIK.dikisDikeyOrt) ||
    (dy.oran >= KALITE_ESIK.dikisYatayOran && dy.ort >= KALITE_ESIK.dikisYatayOrt);

  // --- DÜZ ZEMİN (kesik ürün / degrade şablon) ----------------------------
  let duz = 0;
  let kenar = 0;
  for (let y = 0; y < h; y++) {
    const alt = y * w;
    for (let x = 0; x < w; x++) {
      // Yatay 7 px ortalama.
      let s = 0;
      let c = 0;
      for (let j = Math.max(0, x - 3); j <= Math.min(w - 1, x + 3); j++) {
        s += G[alt + j];
        c++;
      }
      if (Math.abs(G[alt + x] - s / c) < 4) duz++;
      if (x > 0 && Math.abs(G[alt + x] - G[alt + x - 1]) > 40) kenar++;
    }
  }
  const duzOran = duz / (w * h);
  const kenarOran = kenar / (w * h);

  // Beyaz gövde: karede tek büyük beyaz alan varsa (ürün cihazı) yazı/filigran
  // kuralları beyaz sinyale güvenmez; vizyon kapısına bırakılır.
  const yaziGuvenilir = !beyazGovde;

  return {
    genislik: w,
    yukseklik: h,
    beyazGovde,
    yaziGuvenilir,
    yaziSatirOran: +(yaziSatir / h).toFixed(3),
    yaziBlokOran: +(yaziBlok / h).toFixed(3),
    baslikSatirOran: +(baslikSatir / h).toFixed(3),
    baslikBlokOran: +(baslikBlok / h).toFixed(3),
    filigran,
    ekran,
    dikisDikey: dv,
    dikisYatay: dy,
    kolaj,
    duzOran: +duzOran.toFixed(3),
    kenarOran: +kenarOran.toFixed(4),
    duzZemin: duzOran >= KALITE_ESIK.duzZemin && kenarOran <= KALITE_ESIK.duzZeminKenar,
  };
}

/**
 * Kare kapak olarak kullanılabilir mi?
 * @param {Buffer} veri
 * @returns {Promise<{uygun:boolean, neden:string, olcum:object}>}
 */
export async function kapakKareUygun(veri) {
  let o;
  try {
    o = await kapakKaliteOlc(veri);
  } catch (err) {
    return { uygun: false, neden: `ölçülemedi (${err.message})`, olcum: {} };
  }
  // ÖLÇÜMÜN SINIRI (2026-11-08): "bu karede yazı mı var?" sorusunu piksel
  // ölçümü tek başına güvenilir yanıtlayamıyor. Telefonun kamera adası, parlak
  // metal kenar, ürün dokusu yüksek kontrastlı satırlar üretiyor ve gerçek
  // başlık bandı gibi ölçülüyor (iPhone arka yüzü: "başlık %17.9" — oysa karede
  // hiç yazı yok). Bu yüzden yazı/başlık/filigran bulguları SERT RET değil,
  // ŞÜPHE olarak döner; son sözü görsel anlamı okuyan vizyon kapısı söyler.
  // Sert ret yalnızca kare neredeyse tamamen yazıysa uygulanır.
  const suphe = [];
  const cokYazi = o.yaziBlokOran >= 0.15 || o.yaziSatirOran >= 0.45;
  const cokBaslik = o.baslikBlokOran >= 0.30 || o.baslikSatirOran >= 0.55;
  if (cokYazi) {
    return {
      uygun: false,
      neden:
        `üzerine basılmış yazı/başlık bandı ` +
        `(blok %${(o.yaziBlokOran * 100).toFixed(1)}, toplam %${(o.yaziSatirOran * 100).toFixed(1)})`,
      olcum: o,
    };
  }
  if (cokBaslik) {
    return {
      uygun: false,
      neden:
        `fotoğraf üstüne basılmış büyük başlık ` +
        `(blok %${(o.baslikBlokOran * 100).toFixed(1)}, toplam %${(o.baslikSatirOran * 100).toFixed(1)})`,
      olcum: o,
    };
  }
  if (o.yaziBlokOran >= 0.045 || o.yaziSatirOran >= 0.18) suphe.push("yazı şüphesi");
  if (o.baslikBlokOran >= 0.05 || o.baslikSatirOran >= 0.12) suphe.push("başlık şüphesi");
  if (o.filigran) suphe.push(`filigran şüphesi (${o.filigran.bolge})`);
  if (o.ekran) {
    return {
      uygun: false,
      neden: `ekran görüntüsü/beyaz kart (${o.ekran.bolge}: beyaz %${(o.ekran.oran * 100).toFixed(0)})`,
      olcum: o,
    };
  }
  if (o.kolaj) {
    return {
      uygun: false,
      neden: `foto-kolaj (dikey ${o.dikisDikey.oran}/${o.dikisDikey.ort}, yatay ${o.dikisYatay.oran}/${o.dikisYatay.ort})`,
      olcum: o,
    };
  }
  // DÜZ ZEMİN reddedilmez: ShiftDelete'in kullandığı temiz ürün çekimleri tam
  // olarak düz zeminli (stüdyo) karelerdir. Yalnızca not düşülür.
  if (suphe.length) return { uygun: true, supheli: suphe.join(", "), neden: "geçti", olcum: o };
  return {
    uygun: true,
    neden: o.duzZemin ? "temiz stüdyo zeminli ürün karesi" : "geçti",
    olcum: o,
  };
}
