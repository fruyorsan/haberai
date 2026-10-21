// Haber görsellerini "ShiftDelete tarzı" (büyük, yatay, gerçek fotoğraf)
// seçmek için aday toplama + kalite denetimi.
//
// Sorun: RSS/og:image bazen logo, küçük thumbnail (75x75, 300x200) ya da
// placeholder döndürüyor. Bu modül:
//   1. sayfadan TÜM görsel adaylarını toplar (og:image, twitter:image, JSON-LD, <img>),
//   2. URL'den "kötü aday" (logo/ikon/placeholder) olanları eler,
//   3. adayı gerçekten indirip (küçük bir parça) boyut/ögb yönünü ölçer,
//   4. büyük + yatay olanı seçer; hiçbiri geçmezse null döner (site markalı
//      kapak görseline düşer).
//
// Ölçüm aynı zamanda bir "hotlink çalışıyor mu?" testidir: ziyaretçinin
// tarayıcısı da aynı isteği Referer göndermeden yapar.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

// Kalite eşikleri (16:9'lu haber fotoğrafları için makul değerler)
const MIN_W = 600;
const MIN_H = 300;
const MIN_RATIO = 1.1; // 1.1'den basık olanlar genelde banner/kupür
const MAX_RATIO = 2.9; // 2.9'dan uzun olanlar genelde ince şerit/logo
const MIN_BYTES = 12 * 1024; // çok küçük dosyalar ikon olur

/** URL'ye bakarak "bu görsel olamaz" denen adayları eler. */
export function looksLikeIcon(url) {
  const u = String(url || "");
  if (!/^https?:\/\//i.test(u)) return true;
  if (/\.svg(\?|#|$)/i.test(u)) return true;
  return /(logo|favicon|sprite|avatar|gravatar|placeholder|no[-_]?image|default[-_/]?(image|img|thumb)|watermark|share[-_]?(icon|default)|icon[-_/]|[-_/]icon|1x1|pixel\.(gif|png)|blank\.(gif|png)|transparent\.(gif|png))/i.test(
    u
  );
}

/** URL'deki ipuçlarına göre aday puanı (büyük görseller öne geçsin). */
export function urlHintScore(url) {
  const u = String(url || "").toLowerCase();
  let s = 0;
  if (/\/(1200|1280|1440|1600|1920|2000|2400)(\/|[^0-9])/.test(u)) s += 4;
  if (/(large|big|full|original|high|hd|xxl|master)/.test(u)) s += 3;
  if (/\.(jpe?g|webp)(\?|#|$)/.test(u)) s += 2;
  if (/\.png(\?|#|$)/.test(u)) s += 1;
  if (/\/(thumb|thumbnail|small|tiny|mini)\b/.test(u)) s -= 4;
  if (/([-_/])(150x150|300x|150x|100x|64x|50x|thumb)/.test(u)) s -= 3;
  if (/(width|w)=(7[05]|1[0-9][0-9]|2[0-9][0-9])(&|$)/.test(u)) s -= 3;
  if (/placeholder|logo|icon/i.test(u)) s -= 5;
  return s;
}

/**
 * Aday görselin dosya adı habere ait mi? Sayfa içindeki <img>'ler arasında
 * yan menü/ilgili haber görselleri de var; yalnızca dosya adı başlık, slug
 * veya kaynak adresiyle ortak sözcük taşıyanlar kabul edilir.
 */
export function dosyaAdiEslesiyor(url, metin) {
  let ad = "";
  try {
    ad = decodeURIComponent(String(url || "").split("/").pop() || "");
  } catch {
    ad = String(url || "").split("/").pop() || "";
  }
  const parcalar = ad
    .replace(/\?.*$/, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .split(/[-_+.]+/)
    .filter((p) => p.length >= 4 && !/^\d+$/.test(p));

  const sadeles = (s) =>
    String(s || "")
      .toLocaleLowerCase("tr")
      .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }[c]))
      .replace(/[^a-z0-9]+/g, "");

  const esles = (a, b) => {
    if (!a || !b) return false;
    const n = Math.min(a.length, b.length);
    let i = 0;
    while (i < n && a[i] === b[i]) i++;
    // Türkçe ekler yüzünden tam eşitlik aranmaz ("iphone" ~ "iphone'un").
    return i >= 5 || (i >= 4 && (i === a.length || i === b.length));
  };

  const kelimeler = String(metin || "")
    .toLocaleLowerCase("tr")
    .replace(/[^a-z0-9çğıöşü]+/g, " ")
    .split(/\s+/)
    .filter((k) => k.length >= 4 && !/^\d+$/.test(k))
    .map(sadeles);

  return parcalar.some((p) => {
    const sp = sadeles(p);
    return kelimeler.some((k) => esles(sp, k));
  });
}

/**
 * Kaynak sayfanın görsellerinden haberin kapağını seçer.
 *
 * Sıra: og:image → (og uygun değilse) dosya adı başlıkla eşleşen sayfa içi
 * adaylar. Adaylar gerçekten indirilip ölçülür; hiçbiri geçmezse null döner ve
 * çağıran taraf Commons marka/stok akışına düşer.
 */
export async function chooseArticleImage(extras, metin, { minWidth = 700 } = {}) {
  const image = extras?.image || null;
  const images = Array.isArray(extras?.images) ? extras.images : [];

  const secilen = image ? await chooseImage([image], { max: 1, maxProbes: 5, minWidth }) : null;
  if (secilen) return secilen;

  const eslesen = images.filter((u) => dosyaAdiEslesiyor(u, metin));
  if (!eslesen.length) return null;
  return chooseImage(eslesen, { max: 4, maxProbes: 6, keepOrder: true, minWidth });
}

/** Görsel dosya başlığından (ilk ~256KB) genişlik/yükseklik okur. */
export function imageSize(buf) {
  if (!buf || buf.length < 16) return null;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: "png" };
  }
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), type: "gif" };
  }
  // WEBP
  if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const kind = buf.toString("ascii", 12, 16);
    if (kind === "VP8 ") {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, type: "webp" };
    }
    if (kind === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1, type: "webp" };
    }
    if (kind === "VP8X") {
      return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1, type: "webp" };
    }
  }
  // JPEG (SOF işaretçisini tara)
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), type: "jpeg" };
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = buf.readUInt16BE(i + 2);
      if (!Number.isFinite(len) || len < 2) break;
      i += 2 + len;
    }
  }
  return null;
}

/** Görseli (ilk 256KB) indirip boyut + tip + toplam boyut bilgisini döner. */
export async function probeImage(url) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "image/avif,image/webp,image/jpeg,image/png,image/*,*/*;q=0.8",
        Range: "bytes=0-262143",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const ctype = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!/^image\//.test(ctype)) return null;
    if (/svg/.test(ctype)) return null;

    let total = 0;
    const cr = res.headers.get("content-range");
    if (cr && cr.includes("/")) total = Number(cr.split("/").pop()) || 0;
    if (!total) total = Number(res.headers.get("content-length") || 0) || 0;

    const buf = Buffer.from(await res.arrayBuffer());
    if (!total) total = buf.length;
    const dim = imageSize(buf);
    if (!dim) return null;
    return { width: dim.width, height: dim.height, type: dim.type, bytes: total, finalUrl: res.url || url };
  } catch {
    return null;
  }
}

/** Ölçülen görsel kalite eşiklerini geçiyor mu? */
export function passesQuality(info) {
  if (!info || !info.width || !info.height) return false;
  if (info.width < MIN_W || info.height < MIN_H) return false;
  const ratio = info.width / info.height;
  if (ratio < MIN_RATIO || ratio > MAX_RATIO) return false;
  if (info.bytes && info.bytes < MIN_BYTES) return false;
  return true;
}

/** HTML'den görsel adaylarını toplar (meta + JSON-LD + <img>). */
export function collectImageCandidates(html, baseUrl) {
  const out = [];
  const push = (value, score = 0) => {
    if (!value) return;
    let v = String(value).trim().replace(/&amp;/g, "&");
    if (!v || v.startsWith("data:")) return;
    if (/^\/\//.test(v)) v = `https:${v}`;
    if (!/^https?:\/\//i.test(v)) {
      try {
        v = new URL(v, baseUrl || undefined).href;
      } catch {
        return;
      }
    }
    out.push({ url: v, score });
  };

  // 1) og/twitter meta etiketleri (en güvenilir sinyal)
  const metaRe =
    /<meta[^>]+(?:property|name)=["'](og:image:secure_url|og:image:url|og:image|twitter:image:src|twitter:image)["'][^>]*>/gi;
  for (const tag of html.match(metaRe) || []) {
    const m = /content=["']([^"']+)["']/i.exec(tag);
    if (m) push(m[1], 10);
  }

  // 2) JSON-LD "image"
  const ldRe = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let ld;
  while ((ld = ldRe.exec(html))) {
    const block = ld[1];
    const imgRe = /"image"\s*:\s*(?:"([^"]+)"|\[\s*"([^"]+)")/gi;
    let m;
    while ((m = imgRe.exec(block))) push(m[1] || m[2], 8);
  }

  // 3) Sayfa içindeki <img> etiketleri (srcset'teki en büyük seçilir)
  const imgRe = /<img\b[^>]*>/gi;
  let tag;
  while ((tag = imgRe.exec(html))) {
    const srcset = /srcset=["']([^"']+)["']/i.exec(tag);
    if (srcset) {
      const parts = srcset[1]
        .split(",")
        .map((p) => {
          const [u, d] = p.trim().split(/\s+/);
          return { u, w: Number((d || "").replace(/\D/g, "")) || 0 };
        })
        .filter((p) => p.u);
      parts.sort((a, b) => b.w - a.w);
      if (parts[0]) push(parts[0].u, 6);
    }
    const src = /\bsrc=["']([^"']+)["']/i.exec(tag);
    const w = Number(/\bwidth=["']?(\d+)/i.exec(tag)?.[1] || 0);
    const h = Number(/\bheight=["']?(\d+)/i.exec(tag)?.[1] || 0);
    if (src) {
      const small = (w && w < 400) || (h && h < 220);
      push(src[1], small ? 1 : 5);
    }
  }

  // Aynı URL'yi bir kez tut (en yüksek puanla), sonra puana göre sırala.
  const best = new Map();
  for (const c of out) {
    const prev = best.get(c.url);
    if (!prev || c.score > prev.score) best.set(c.url, c);
  }
  return [...best.values()]
    .filter((c) => !looksLikeIcon(c.url))
    .sort((a, b) => b.score - a.score || urlHintScore(b.url) - urlHintScore(a.url))
    .map((c) => c.url);
}

/**
 * Aynı fotoğrafın daha büyük sürümünü tahmin eder (ShiftDelete/WordPress
 * tarzı `foo-780x470.jpg` → `foo-1280x720.jpg`, `?w=600` → `?w=1280`).
 * Tahmin yanlışsa indirme başarısız olur ve aday sessizce elenir.
 */
export function biggerVariants(url) {
  const u = String(url || "");
  if (!/^https?:\/\//i.test(u)) return [];
  const out = [];

  // foo-780x470.jpg → foo-1280x720.jpg (+ sürümsüz orijinal)
  const m = /^(.*?)-(\d{2,4})x(\d{2,4})(\.(?:jpe?g|png|webp|avif))(\?[^#]*)?$/i.exec(u);
  if (m) {
    const [, base, w, h, ext, q = ""] = m;
    const oran = Number(h) / Number(w);
    for (const hedef of [1280, 1920]) {
      if (hedef > Number(w)) out.push(`${base}-${hedef}x${Math.round(hedef * oran)}${ext}${q}`);
    }
    out.push(`${base}${ext}${q}`);
  }

  // ?w=600&h=400 → ?w=1280&h=720
  if (/[?&]w=\d{2,4}/.test(u)) {
    out.push(u.replace(/([?&]w=)\d{2,4}/, "$11280").replace(/([?&]h=)\d{2,4}/, "$1720"));
  }
  if (/[?&](?:width|maxwidth|max-width)=\d{2,4}/i.test(u)) {
    out.push(u.replace(/([?&](?:width|maxwidth|max-width)=)\d{2,4}/i, "$11280"));
  }
  // ?resize=600,400 tarzı
  if (/[?&]resize=\d{2,4}(%2C|,)\d{2,4}/i.test(u)) {
    out.push(u.replace(/([?&]resize=)\d{2,4}(%2C|,)\d{2,4}/i, "$11280$2" + "720"));
  }

  return [...new Set(out)].filter((v) => v !== u);
}

/**
 * Aday listesinden en iyi görseli seçer: URL ipuçlarına göre sıralar,
 * en fazla `maxProbes` adayı ölçer, kalite eşiklerini geçen en büyük/best olanı
 * döner. Adayın daha büyük sürümleri de denenir (daha keskin fotoğraf).
 * Hiçbiri geçmezse null (site markalı kapağa düşer).
 */
export async function chooseImage(
  candidates,
  { max = 5, maxProbes = 9, minWidth = MIN_W, keepOrder = false } = {}
) {
  const list = (candidates || [])
    .filter(Boolean)
    .map((c) => (typeof c === "string" ? c : c.url))
    .filter((u) => /^https?:\/\//i.test(u) && !looksLikeIcon(u));

  const uniq = [...new Set(list)];
  // Kaynak sayfanın og:image'ı listenin başında gelir; `keepOrder` ile bu sıra
  // korunur (sayfadaki alakasız <img>'ler öne geçmesin).
  if (!keepOrder) uniq.sort((a, b) => urlHintScore(b) - urlHintScore(a));

  // En iyi adaylar + onların daha büyük sürümleri (yüksek çözünürlük şansı).
  const havuz = [];
  for (const u of uniq.slice(0, max)) {
    havuz.push(u);
    for (const v of biggerVariants(u)) havuz.push(v);
  }

  let best = null;
  let deneme = 0;
  for (const url of havuz) {
    if (deneme >= maxProbes) break;
    if (best && best.width >= 1280) break; // bu kadarı fazlasıyla yeterli
    deneme++;
    const info = await probeImage(url);
    if (!passesQuality(info)) continue;
    if (info.width < minWidth) continue;
    const score = info.width + urlHintScore(url) * 30;
    if (!best || score > best.score) best = { url: info.finalUrl || url, score, width: info.width };
  }
  return best ? best.url : null;
}
