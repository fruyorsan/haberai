// ==========================================================================
// WEB PUSH BİLDİRİMİ (OneSignal) — son dakika + takip edilen konular
// --------------------------------------------------------------------------
// Sitenin sözü: okuyucu neye abone olduysa YALNIZCA onu alır. Bu yüzden:
//
//   1) SON DAKİKA (haber kaydında breaking === true):
//      tüm abonelere gider. Asgari aralık SON_MIN_ARALIK_DK, günlük tavan
//      SON_MAX_GUN. Gece de gönderilir (acil gelişme beklenir).
//
//   2) KONU TAKİBİ (okuyucunun işaretlediği kategori):
//      OneSignal etiketiyle yalnızca o konuyu takip edenlere gider
//      (kategori_<slug> = 1). Kategori başına en fazla KAT_MIN_ARALIK_DK
//      dakikada bir; ayrıca günlük tavan ve sessiz saat (23:00-07:00 TR)
//      uygulanır. Böylece "spor takip ediyorum" diyen okuyucu günde en fazla
//      birkaç bildirim alır, cihaz susmaz.
//
// Tekrar önleme: gönderilen haber id'leri data/bildirim.json'da tutulur
// (src/share.js → data/social.json ile aynı mantık). Aynı haber iki kez gitmez.
//
// Kurulum (ikisi de yoksa kanal sessizce atlanır):
//   gh variable set ONESIGNAL_APP_ID --body "<App ID>"
//   gh secret  set ONESIGNAL_REST_API_KEY --body "<REST API anahtarı>"
//
// Elle deneme:  npm run bildirim:dry   (hiçbir istek gönderilmez, dosya yazılmaz)
// ==========================================================================
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getArticles, imageUrl } from "../site/src/lib/articles.js";
import { kapakKaynagi } from "../site/src/lib/kapak.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const DURUM_DOSYA = join(DATA_DIR, "bildirim.json");

const APP_ID = String(process.env.ONESIGNAL_APP_ID || "").trim();
const REST_KEY = String(process.env.ONESIGNAL_REST_API_KEY || "").trim();
const SITE_URL = (process.env.SITE_URL || "https://fruyorsan.github.io").replace(/\/+$/, "");

// --- Ayarlar (env ile değiştirilebilir) ---
const SON_MIN_ARALIK_DK = Number(process.env.BILDIRIM_SON_ARALIK_DK ?? 25);
const SON_MAX_GUN = Number(process.env.BILDIRIM_SON_MAX_GUN ?? 6);
const SON_TTL_SAAT = Number(process.env.BILDIRIM_SON_TTL_SAAT ?? 6);
const KAT_MIN_ARALIK_DK = Number(process.env.BILDIRIM_KAT_ARALIK_DK ?? 180);
const KAT_MAX_GUN = Number(process.env.BILDIRIM_KAT_MAX_GUN ?? 3);
const KAT_TTL_SAAT = Number(process.env.BILDIRIM_KAT_TTL_SAAT ?? 3);
const TOPLAM_MAX_GUN = Number(process.env.BILDIRIM_TOPLAM_MAX_GUN ?? 9);
// Sessiz saat: yalnızca KONU bildirimleri için (Türkiye saati, UTC+3).
const SESSIZ_BAS = Number(process.env.BILDIRIM_SESSIZ_BAS ?? 23);
const SESSIZ_BIT = Number(process.env.BILDIRIM_SESSIZ_BIT ?? 7);

const TR_OFFSET_DK = 180; // Türkiye UTC+3 (yaz saati uygulaması yok)
// Gönderilen id listesi sınırsız büyümesin.
const SENT_LIMIT = 400;

// --------------------------------------------------------------------------
// Yardımcılar
// --------------------------------------------------------------------------

/** Türkiye saatine göre gün ve saat. */
function trZaman(ms) {
  const t = new Date(ms + TR_OFFSET_DK * 60000);
  return {
    gun: t.toISOString().slice(0, 10),
    saat: t.getUTCHours(),
  };
}

function yayinZamani(a) {
  const t = Date.parse(a?.generatedAt || a?.publishedAt || 0);
  return Number.isFinite(t) ? t : 0;
}

/** Haber `saat` saatten taze mi? */
function taze(a, saat, now) {
  const t = yayinZamani(a);
  return t > 0 && now - t <= saat * 3600000;
}

function kisalt(str, max) {
  const s = String(str || "").replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/**
 * OneSignal yanıtındaki alıcı (cihaz) sayısını günlüğe ekler.
 * Neden: gönderim "başarılı" görünse de abone yoksa kimseye ulaşmaz. Alıcı
 * sayısını CI günlüğünde görünür kılmak, "bildirim gerçekten gitti mi?"
 * sorusunu tek bakışta yanıtlar (0 ise cihazda zile basılmamış demektir).
 */
function aliciNotu(yanit) {
  const n = Number(yanit?.recipients);
  if (!Number.isFinite(n)) return "";
  if (n === 0) return " → alıcı: 0 (abone yok: cihazda bildirim izni verilmemiş)";
  return ` → alıcı: ${n}`;
}

async function durumOku() {
  if (!existsSync(DURUM_DOSYA))
    return { updatedAt: null, sent: [], sonKategori: {}, gun: "", gunSayi: {}, hosGeldin: false };
  try {
    const d = JSON.parse(await readFile(DURUM_DOSYA, "utf8"));
    return {
      updatedAt: d.updatedAt || null,
      sent: Array.isArray(d.sent) ? d.sent.map(String) : [],
      sonKategori: d.sonKategori && typeof d.sonKategori === "object" ? d.sonKategori : {},
      gun: d.gun || "",
      gunSayi: d.gunSayi && typeof d.gunSayi === "object" ? d.gunSayi : {},
      hosGeldin: d.hosGeldin === true,
    };
  } catch {
    return { updatedAt: null, sent: [], sonKategori: {}, gun: "", gunSayi: {}, hosGeldin: false };
  }
}

async function durumYaz(durum) {
  await mkdir(DATA_DIR, { recursive: true });
  const sent = [...new Set(durum.sent.map(String))].slice(-SENT_LIMIT);
  const payload = {
    updatedAt: durum.updatedAt,
    gun: durum.gun,
    gunSayi: durum.gunSayi,
    sonKategori: durum.sonKategori,
    sent,
    hosGeldin: durum.hosGeldin === true,
  };
  await writeFile(DURUM_DOSYA, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/**
 * OneSignal'deki abone sayısı. Okunamazsa null döner (çağıran karar verir).
 * Neden gerekli: günlük tavan dolduğunda gönderim yapılmadığı için
 * yanıttaki "recipients" alanı da gelmez; abone sayısını ayrıca sormak
 * gerekiyor (hem günlük bilgi hem "hoş geldin" kararı için).
 */
async function aboneSayisi() {
  try {
    const res = await fetch(`https://api.onesignal.com/apps/${APP_ID}/users?limit=1`, {
      headers: { Authorization: `Key ${REST_KEY}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const n = Number(j?.total_count);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Bildirimin tıklanınca gideceği adres + görsel + metin. */
function bildirimIcerigi(a, { baslik }) {
  const kapak = kapakKaynagi(a);
  return {
    baslik,
    icerik: kisalt(a.title, 120),
    url: `${SITE_URL}/haber/${a.slug || a.id}/`,
    gorsel: kapak ? imageUrl(kapak, 720) : `${SITE_URL}/og-default.png`,
  };
}

/**
 * OneSignal `idempotency_key` alanı YALNIZCA UUID kabul eder (düz metin
 * reddedilir: "is not a valid UUID"). Haber id'sinden değişmez bir UUID
 * üretilir: aynı haber → aynı anahtar → bir aksilikte ikinci gönderim
 * denemesi OneSignal tarafından yinelenen sayılıp düşürülür.
 * @param {string} metin
 * @returns {string} 8-4-4-4-12 biçiminde UUID (sürüm 5 görünümlü)
 */
function uuidAnahtar(metin) {
  const h = createHash("sha256").update(String(metin)).digest("hex");
  const varyant = ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${varyant}${h.slice(
    17,
    20
  )}-${h.slice(20, 32)}`;
}

/**
 * OneSignal'e bir bildirim gönderir.
 * @param {{baslik:string,icerik:string,url:string,gorsel?:string,etiket?:string,ttl:number,anahtar:string}} p
 */
async function gonder(p) {
  const govde = {
    app_id: APP_ID,
    target_channel: "push",
    headings: { tr: p.baslik, en: p.baslik },
    contents: { tr: p.icerik, en: p.icerik },
    url: p.url,
    chrome_web_icon: `${SITE_URL}/ikon-192.png`,
    chrome_web_badge: `${SITE_URL}/ikon-192.png`,
    ttl: p.ttl,
    idempotency_key: uuidAnahtar(p.anahtar),
  };
  if (p.gorsel) govde.chrome_web_image = p.gorsel;
  if (p.etiket) {
    govde.filters = [{ field: "tag", key: p.etiket, relation: "=", value: "1" }];
  } else {
    govde.included_segments = ["Subscribed Users"];
  }

  const res = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${REST_KEY}` },
    body: JSON.stringify(govde),
    signal: AbortSignal.timeout(20000),
  });
  const metin = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${metin.slice(0, 300)}`);
  return metin ? JSON.parse(metin) : null;
}

// --------------------------------------------------------------------------
// Ana akış
// --------------------------------------------------------------------------

/**
 * Bekleyen bildirimleri gönderir.
 * @param {{dry?: boolean}} [opts] dry=true → hiçbir istek gönderilmez, durum yazılmaz.
 */
export async function bildirimleriGonder({ dry = false } = {}) {
  if (!APP_ID || !REST_KEY) {
    console.log("Bildirim: ONESIGNAL_APP_ID veya ONESIGNAL_REST_API_KEY tanımlı değil, atlanıyor.");
    return { gonderilen: 0, neden: "anahtar yok" };
  }

  const now = Date.now();
  const tr = trZaman(now);
  const durum = await durumOku();

  // Gün değiştiyse sayaçlar sıfırlanır.
  if (durum.gun !== tr.gun) {
    durum.gun = tr.gun;
    durum.gunSayi = { son: 0, kategori: 0 };
  }

  const gonderilmis = new Set(durum.sent.map(String));
  const yeni = getArticles().filter((a) => a.id && !gonderilmis.has(String(a.id)));
  const gunToplam = (durum.gunSayi.son || 0) + (durum.gunSayi.kategori || 0);

  console.log(
    `Bildirim: ${yeni.length} yeni haber adayı, gün içinde gönderilen ` +
      `${gunToplam}/${TOPLAM_MAX_GUN} (son dakika ${durum.gunSayi.son || 0}/${SON_MAX_GUN}, ` +
      `konu ${durum.gunSayi.kategori || 0}/${KAT_MAX_GUN})${dry ? " [dry]" : ""}`
  );

  let sayilan = 0;

  // ---- 0) HOŞ GELDİN / TEST BİLDİRİMİ ----
  // Neden var: okuyucu bildirim iznini verdiğinde HİÇBİR ŞEY görmezse "çalışmıyor"
  // sanır. Günlük tavan dolduğunda (son dakika 6 + konu 3) yeni aboneye saatlerce
  // bildirim gitmez; bu yüzden izni veren okuyucuya ilk anda bir kez "hoş geldin"
  // gönderilir. Günlük tavandan ve asgari aralıktan BAĞIMSIZDIR; yalnızca bir kez
  // çalışır (durum.hosGeldin). Elle test: BILDIRIM_TEST=1 (tavan yok sayılır).
  const test = process.env.BILDIRIM_TEST === "1";
  const abone = await aboneSayisi();
  console.log(`Bildirim: abone sayısı: ${abone === null ? "okunamadı" : abone}${dry ? " [dry]" : ""}`);

  // Teşhis: iPhone/Safari web push kurulu mu? iPhone'da bildirim gelmiyorsa
  // sebep neredeyse her zaman budur (Apple platformu + APNs anahtarı tanımlı
  // değilse iOS aboneleri sessizce abone olamaz). Ayrıntı README'de.
  if (!dry) {
    try {
      const r = await fetch(`https://api.onesignal.com/apps/${APP_ID}`, {
        headers: { Authorization: `Key ${REST_KEY}` },
        signal: AbortSignal.timeout(15000),
      });
      if (r.ok) {
        const a = await r.json();
        console.log(
          `Bildirim: uygulama "${a.name}" | kayıt: ${a.players ?? "-"} | ` +
            `apns (iOS): ${a.apns_env ? "kurulu" : "KURULU DEĞİL"} | ` +
            `safari_web_id: ${a.safari_web_id ? "var" : "yok"} | ` +
            `chrome_web: ${a.chrome_web_origin ? "var" : "yok"}`
        );
      } else {
        console.log(`Bildirim: uygulama bilgisi okunamadı (HTTP ${r.status}).`);
      }
    } catch {
      /* teşhis amaçlı; gönderimi engellemez */
    }
  }

  if (!dry && (test || durum.hosGeldin !== true) && (test || abone === null || abone > 0)) {
    try {
      const yanit = await gonder({
        baslik: test ? "🔔 Test bildirimi" : "🔔 Bildirimler açıldı",
        icerik: test
          ? "Bildirimler çalışıyor. HaberinAi'de son dakika haberleri artık cebinde."
          : "Son dakika haberleri artık buradan gelecek. İlk önemli gelişmede haber vereceğiz.",
        url: `${SITE_URL}/${test ? "" : "son-dakika/"}`,
        ttl: 86400,
        anahtar: `hos-geldin-${tr.gun}-${test ? Date.now() : "1"}`,
      });
      console.log(`  ✓ [${test ? "test" : "hoş geldin"}]${yanit?.id ? ` (${yanit.id})` : ""}${aliciNotu(yanit)}`);
      // "Hoş geldin" yalnızca gerçekten bir cihaza ulaştıysa bir kez gönderilmiş
      // sayılır. Abone yoksa (0 cihaz) işaret konmaz; ilk abone geldiğinde
      // gönderilir. Böylece "izin verdim, hiç bildirim gelmedi" durumu oluşmaz.
      const ulasan = Number(yanit?.recipients);
      const ulasti = Number.isFinite(ulasan) ? ulasan > 0 : abone === null ? true : abone > 0;
      if (ulasti) durum.hosGeldin = true;
      sayilan++;
    } catch (err) {
      console.warn(`  ✗ [hoş geldin] ${err.message}`);
    }
  } else if (!test && !dry && durum.hosGeldin !== true && abone === 0) {
    console.log("Bildirim: henüz abone yok — hoş geldin bildirimi bekletiliyor.");
  }

  // ---- 1) SON DAKİKA ----
  if (gunToplam < TOPLAM_MAX_GUN && (durum.gunSayi.son || 0) < SON_MAX_GUN) {
    const gecenDk = durum.updatedAt ? (now - Date.parse(durum.updatedAt)) / 60000 : Infinity;
    if (gecenDk < SON_MIN_ARALIK_DK) {
      console.log(
        `Bildirim: son gönderimden ${Math.round(gecenDk)} dk geçti ` +
          `(asgari ${SON_MIN_ARALIK_DK} dk); son dakika bekletiliyor.`
      );
    } else {
      const aday = yeni
        .filter((a) => a.breaking === true && taze(a, SON_TTL_SAAT, now))
        .sort((a, b) => yayinZamani(b) - yayinZamani(a))[0];

      if (aday) {
        const icerik = bildirimIcerigi(aday, { baslik: "🔴 SON DAKİKA" });
        if (dry) {
          console.log(`  [dry] son dakika → ${icerik.icerik}`);
        } else {
          try {
            const yanit = await gonder({
              ...icerik,
              ttl: 86400,
              anahtar: `son-${aday.id}`,
            });
            console.log(
              `  ✓ [son dakika] ${kisalt(aday.title, 60)}${yanit?.id ? ` (${yanit.id})` : ""}${aliciNotu(yanit)}`
            );
            durum.sent.push(String(aday.id));
            durum.updatedAt = new Date(now).toISOString();
            durum.gunSayi.son = (durum.gunSayi.son || 0) + 1;
            sayilan++;
          } catch (err) {
            console.warn(`  ✗ [son dakika] ${err.message}`);
          }
        }
      }
    }
  }

  // ---- 2) TAKİP EDİLEN KONULAR ----
  const sessiz = tr.saat >= SESSIZ_BAS || tr.saat < SESSIZ_BIT;
  const gunToplam2 = (durum.gunSayi.son || 0) + (durum.gunSayi.kategori || 0);
  if (sessiz) {
    console.log(`Bildirim: sessiz saat (TR ${tr.saat}:00) → konu bildirimi gönderilmiyor.`);
  } else if (gunToplam2 >= TOPLAM_MAX_GUN || (durum.gunSayi.kategori || 0) >= KAT_MAX_GUN) {
    console.log("Bildirim: konu bildirimi için günlük tavan doldu.");
  } else {
    // Her kategori için en taze haber; bekleme süresi dolmuş kategorilerden
    // EN UZUN SÜREDİR bildirilmeyen seçilir (adil sıra, tek kategori akışı ezmesin).
    const grup = new Map();
    for (const a of yeni) {
      if (a.breaking === true || !taze(a, KAT_TTL_SAAT, now)) continue;
      const k = a.categorySlug || "diger";
      const varOlan = grup.get(k);
      if (!varOlan || yayinZamani(a) > yayinZamani(varOlan)) grup.set(k, a);
    }

    const uygun = [...grup.entries()]
      .filter(([slug]) => {
        const son = durum.sonKategori?.[slug];
        if (!son) return true;
        return (now - Date.parse(son)) / 60000 >= KAT_MIN_ARALIK_DK;
      })
      .sort(
        ([a], [b]) =>
          Date.parse(durum.sonKategori?.[a] || 0) - Date.parse(durum.sonKategori?.[b] || 0)
      );

    if (!uygun.length) {
      console.log(
        `Bildirim: konu bildirimi için uygun kategori yok ` +
          `(${grup.size} kategoride taze haber var, hepsi bekleme süresinde).`
      );
    } else {
      const [slug, aday] = uygun[0];
      const icerik = bildirimIcerigi(aday, { baslik: `${aday.category} • yeni haber` });
      if (dry) {
        console.log(`  [dry] konu (${slug}) → ${icerik.icerik}`);
      } else {
        try {
          const yanit = await gonder({
            ...icerik,
            ttl: 21600,
            etiket: `kategori_${slug}`,
            anahtar: `kat-${aday.id}`,
          });
          console.log(
            `  ✓ [konu:${slug}] ${kisalt(aday.title, 60)}${yanit?.id ? ` (${yanit.id})` : ""}${aliciNotu(yanit)}`
          );
          durum.sent.push(String(aday.id));
          durum.updatedAt = new Date(now).toISOString();
          durum.sonKategori[slug] = new Date(now).toISOString();
          durum.gunSayi.kategori = (durum.gunSayi.kategori || 0) + 1;
          sayilan++;
        } catch (err) {
          console.warn(`  ✗ [konu:${slug}] ${err.message}`);
        }
      }
    }
  }

  if (!dry && sayilan) {
    try {
      await durumYaz(durum);
    } catch (err) {
      console.warn(`Bildirim: data/bildirim.json yazılamadı (${err.message}).`);
    }
  }

  return {
    gonderilen: sayilan,
    gun: tr.gun,
    sessiz,
    sonDakikaAdayi: yeni.filter((a) => a.breaking === true && taze(a, SON_TTL_SAAT, now)).length,
    konuAdayi: yeni.filter((a) => a.breaking !== true && taze(a, KAT_TTL_SAAT, now)).length,
    dry,
  };
}

// Doğrudan çalıştırıldıysa (CLI) gönderimi başlat.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dry = process.argv.includes("--dry");
  bildirimleriGonder({ dry })
    .then((r) => {
      console.log(
        `Bildirim sonucu: ${r.gonderilen} gönderim` +
          (r.sonDakikaAdayi !== undefined
            ? ` (aday: son dakika ${r.sonDakikaAdayi}, konu ${r.konuAdayi})`
            : "") +
          (r.neden ? ` — ${r.neden}` : "")
      );
    })
    .catch((err) => {
      console.error(`Bildirim hatası: ${err.message}`);
      process.exitCode = 1;
    });
}
