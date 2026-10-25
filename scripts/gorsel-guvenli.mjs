// TELİF GÜVENLİ GÖRSEL MIGRATION
//
// Arşivdeki kapak fotoğraflarının bir kısmı haber kaynağının sitesinden
// (og:image) alınmıştı. Bu fotoğraflar ajans lisanslı olabilir; atıf yazmak
// kullanım hakkı doğurmaz.
//
// Bu betik her haberi şu sırayla güvenli bir görsele geçirir:
//   1. Vitrin için elle seçilmiş güvenli kapak (scripts/vitrin-doldur.mjs),
//   2. Haberin kendi gövde içi Commons fotoğrafı (konuyla ilgiliyse),
//   3. Wikimedia Commons araması (AI'nın `gorselSorgu` alanı + kategori),
//   4. Kategori yedeği (lisansı ve kaynağı sabit Commons dosyası).
//
// Kaynak sayfadan alınmış `images` adresleri HER ZAMAN silinir. Kapak ve
// `gorselEk` yalnızca upload.wikimedia.org / thumb.wikimedia.org olabilir.
//
// Kullanım:
//   npm run gorsel-guvenli
//   npm run gorsel-guvenli:dry
//   node scripts/gorsel-guvenli.mjs --core --limit=150 --concurrency=4
//   node scripts/gorsel-guvenli.mjs --sadece-kaynak

import fs from "node:fs";
import {
  stokGorseller,
  KATEGORI_SORGU,
  yedekGorsel,
  atif,
  kisaSorgu,
  konuSorgu,
  afetMi,
  markaAdi,
} from "../src/stok-gorsel.js";
import { stokEkUygunMu } from "../site/src/lib/gorsel-uygun.js";
import { GUVENLI_KAPAK } from "./vitrin-doldur.mjs";

const arg = (ad, varsayilan) => {
  const bulunan = process.argv.find((a) => a.startsWith(`--${ad}=`));
  return bulunan ? bulunan.slice(ad.length + 3) || varsayilan : varsayilan;
};
const sayi = (ad, varsayilan) => {
  const n = Number(arg(ad, varsayilan));
  return Number.isFinite(n) && n >= 0 ? n : varsayilan;
};

const DRY = process.argv.includes("--dry");
const CORE = process.argv.includes("--core");
const SADECE_KAYNAK = process.argv.includes("--sadece-kaynak");
const LIMIT = sayi("limit", 0); // 0 = sınırsız
const ESZAMANLI = Math.max(1, Math.min(12, sayi("concurrency", 4)));
const GECIKME = sayi("delay", 120);
const KAYIT_ARALIGI = sayi("save-every", 200);
// Belirli haberleri (ör. yanlış eşleşmiş bir kapak) yeniden işlemek için:
//   node scripts/gorsel-guvenli.mjs --ids=<id1>,<id2>
const IDS = String(arg("ids", ""))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const GUVENLI = /^https:\/\/(upload|thumb)\.wikimedia\.org\//i;
const guvenli = (url) => GUVENLI.test(String(url || ""));

const dosya = "data/articles.json";
const satirSonu = fs.readFileSync(dosya, "utf8").includes("\r\n") ? "\r\n" : "\n";
const articles = JSON.parse(fs.readFileSync(dosya, "utf8"));

const coreIds = new Set();
if (CORE) {
  try {
    const indeks = JSON.parse(fs.readFileSync("data/indeks.json", "utf8"));
    for (const id of indeks.ids || []) coreIds.add(String(id));
  } catch {
    console.error("data/indeks.json okunamadı; --core yok sayıldı.");
  }
}

/** Kapakta veya ek görsellerde güvenli olmayan bir adres var mı? */
const kirli = (a) =>
  !guvenli(a.image) ||
  Boolean(a.gorselKaynakSite) ||
  (Array.isArray(a.images) && a.images.length > 0) ||
  (Array.isArray(a.gorselEk) && a.gorselEk.some((g) => !guvenli(g?.url))) ||
  // Kategori yedeğine düşmüş haber: daha iyi bir eşleşme için bir kez daha
  // denenir (en fazla 2 tur; sonsuz döngü olmaz).
  (Number(a.gorselYedek) > 0 && Number(a.gorselYedek) < 2);

let hedefler = IDS.length
  ? articles.filter((a) => IDS.includes(String(a.id)))
  : articles.filter(kirli);
if (SADECE_KAYNAK && !IDS.length) {
  hedefler = hedefler.filter((a) => !guvenli(a.image) || a.gorselKaynakSite);
}
if (CORE && coreIds.size && !IDS.length) {
  hedefler = hedefler.filter((a) => coreIds.has(String(a.id)));
}

hedefler.sort(
  (a, b) =>
    String(b.publishedAt || b.generatedAt || "").localeCompare(
      String(a.publishedAt || a.generatedAt || "")
    )
);
if (LIMIT > 0) hedefler = hedefler.slice(0, LIMIT);

const kullanilan = new Set();
for (const a of articles) {
  if (a.image) kullanilan.add(String(a.image));
  for (const g of Array.isArray(a.gorselEk) ? a.gorselEk : []) {
    if (g?.url) kullanilan.add(String(g.url));
  }
}

const ozet = { temiz: 0, harita: 0, ek: 0, arama: 0, yedek: 0, hata: 0 };
let imlec = 0;
let islenen = 0;

const kaydet = () => {
  const metin = JSON.stringify(articles, null, 2).replace(/\n/g, satirSonu) + satirSonu;
  fs.writeFileSync(dosya, metin, "utf8");
};

console.log(
  `Arşiv: ${articles.length} haber | temizlenecek: ${hedefler.length}` +
    `${CORE ? ` | yalnızca çekirdek` : ""}${DRY ? " | DRY" : ""}`
);
if (DRY) {
  for (const [i, a] of hedefler.slice(0, 20).entries()) {
    console.log(
      `  ${i + 1}. [${a.category}] ${a.title.slice(0, 62)}\n     ${String(a.image || "(görsel yok)").slice(0, 100)}`
    );
  }
  console.log("\n--dry: hiçbir şey yazılmadı.");
  process.exit(0);
}

/** Bir habere güvenli kapak + temiz ek görseller yazar. */
async function isle(a) {
  const onceki = String(a.image || "");

  // Kapak zaten güvenliyse yalnızca kaynak ek görselleri temizle.
  // `--ids` ile açıkça seçilen haberler ve kategori yedeğine düşmüş haberler
  // (gorselYedek) kapak güvenli olsa da yeniden aranır.
  if (guvenli(onceki) && !a.gorselKaynakSite && !IDS.length && !(Number(a.gorselYedek) > 0)) {
    delete a.images;
    if (Array.isArray(a.gorselEk)) {
      a.gorselEk = a.gorselEk.filter((g) => guvenli(g?.url));
      if (!a.gorselEk.length) delete a.gorselEk;
    }
    ozet.temiz++;
    return;
  }

  let sec = GUVENLI_KAPAK.get(a.sourceUrl) || null;
  let kaynak = "harita";

  // 1) Haberin kendi gövde içi Commons fotoğrafı (konuyla ilgiliyse).
  //    `--ids` ile elle seçilen haberlerde atlanır: taze arama yapılır.
  if (!sec && !IDS.length) {
    const ek = (Array.isArray(a.gorselEk) ? a.gorselEk : []).find(
      (g) => guvenli(g?.url) && stokEkUygunMu(a, g.url)
    );
    if (ek) {
      sec = ek;
      kaynak = "ek";
    }
  }

  // 2) Commons araması: AI'nın İngilizce sorgusu + kategori.
  //    Sorgu yoksa arama YAPILMAZ: boş sorgu Commons'ta rastgele dosya
  //    döndürüyor ve yüzlerce habere aynı fotoğrafı koyuyordu.
  const sorgu = String(a.gorselSorgu || "").trim();
  if (!sec && sorgu.length >= 2) {
    const marka = markaAdi(a.title);
    const yedekDeneme = Number(a.gorselYedek) || 0;
    // Sıra önemli: önce haberin kendi sorgusu denenir. Kategori sorgusu en
    // sonda kalır; aksi hâlde 2. turda "kategori görseli" hemen eşleşip
    // konuya özel aramayı gölgeliyordu (seismograph → İstanbul sokak).
    const ekSorgular = yedekDeneme > 0
      ? [
          `${sorgu} photo`,
          ...(Array.isArray(a.tags) ? a.tags.slice(0, 2) : []),
          `${KATEGORI_SORGU[a.category] || ""} photo`,
        ]
      : [];
    try {
      const bulunan = await stokGorseller(
        [
          marka,
          konuSorgu(sorgu, a.title),
          sorgu,
          kisaSorgu(sorgu),
          ...ekSorgular,
          KATEGORI_SORGU[a.category],
        ],
        {
          adet: 1,
          // Önce arşivde kullanılmamış kare aranır; hepsi kullanıldıysa
          // stokGorseller kendi içinde tekrarı göze alır.
          kullanilan,
          afet: afetMi(a.title, a.summary),
          marka,
        }
      );
      if (bulunan.length) {
        sec = bulunan[0];
        kaynak = "arama";
      }
    } catch {
      // Ağ hatası: kategori yedeğine düş.
    }
  }

  // 3) Son çare: kategorinin doğrulanmış Commons görseli.
  if (!sec) {
    sec = yedekGorsel(a.category, a.id);
    kaynak = "yedek";
    // Bir sonraki turda farklı sorgularla yeniden denenir.
    a.gorselYedek = (Number(a.gorselYedek) || 0) + 1;
  } else {
    delete a.gorselYedek;
  }

  a.image = sec.url;
  a.gorselKaynak = atif(sec);
  delete a.gorselKaynakSite;
  delete a.images;

  if (Array.isArray(a.gorselEk)) {
    a.gorselEk = a.gorselEk.filter(
      (g) => guvenli(g?.url) && String(g.url) !== String(sec.url)
    );
    if (!a.gorselEk.length) delete a.gorselEk;
  }

  kullanilan.add(String(sec.url));
  ozet[kaynak]++;
  if (onceki && onceki !== sec.url) {
    // Loglarda hangi kaynaktan gelindiğini görmek için host yeterli.
    try {
      return new URL(onceki).hostname;
    } catch {
      return "";
    }
  }
  return "";
}

async function isci() {
  while (imlec < hedefler.length) {
    const i = imlec++;
    const a = hedefler[i];
    try {
      await isle(a);
    } catch (err) {
      ozet.hata++;
      console.warn(`  ! ${a.slug}: ${String(err.message).slice(0, 120)}`);
    }
    islenen++;
    if (islenen % 50 === 0 || islenen === hedefler.length) {
      console.log(
        `  ${islenen}/${hedefler.length} → harita:${ozet.harita} ek:${ozet.ek} ` +
          `arama:${ozet.arama} yedek:${ozet.yedek} hata:${ozet.hata}`
      );
    }
    if (!DRY && islenen % KAYIT_ARALIGI === 0) kaydet();
    if (GECIKME > 0) await new Promise((r) => setTimeout(r, GECIKME));
  }
}

await Promise.all(Array.from({ length: ESZAMANLI }, () => isci()));
kaydet();

const kalan = articles.filter(kirli).length;
console.log(
  `\nBitti. Harita: ${ozet.harita} | gövde içi Commons: ${ozet.ek} | ` +
    `Commons araması: ${ozet.arama} | kategori yedeği: ${ozet.yedek} | ` +
    `zaten temiz: ${ozet.temiz} | hata: ${ozet.hata}`
);
console.log(`Kalan kaynak/temizlenmemiş görsel: ${kalan} (0 olmalı).`);
if (kalan > 0) process.exitCode = 1;
