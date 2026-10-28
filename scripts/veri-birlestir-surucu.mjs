// ==========================================================================
// data/articles.json İÇİN GIT MERGE SÜRÜCÜSÜ
// --------------------------------------------------------------------------
// SORUN: CI her turda `git merge -X ours origin/main` yapıyordu. Bu, çakışan
// dosyada CI'nın kendi kopyasını tutuyor; bizim elle eklediğimiz kapak ve
// gövde fotoğrafı alanları (kapak, images, gorselKaynak...) bir sonraki
// turda siliniyordu (24 saatte 200 → 94).
//
// ÇÖZÜM: JSON'u habere göre birleştir. İçerik alanları taze taraftan gelir;
// görsel alanları iki taraftan hangisinde doluysa korunur.
//
// KULLANIM (git otomatik çağırır):
//   git config merge.haber-veri.driver "node scripts/veri-birlestir-surucu.mjs %O %A %B"
//   .gitattributes: data/articles.json merge=haber-veri
// ==========================================================================
import fs from "node:fs";

const [, , tabanYol, bizimYol, onlarinYol] = process.argv;
if (!bizimYol || !onlarinYol) {
  console.error("kullanim: veri-birlestir-surucu.mjs <taban> <bizim> <onlarin>");
  process.exit(1);
}

const oku = (yol) => {
  try {
    const ham = fs.readFileSync(yol, "utf8");
    if (!ham.trim()) return [];
    const veri = JSON.parse(ham);
    return Array.isArray(veri) ? veri : [];
  } catch {
    return [];
  }
};

const bizim = oku(bizimYol);
const onlarin = oku(onlarinYol);

// Görsel/toplumsal alanlar: elle veya ayrı betiklerle üretiliyor, taze
// `collect` bunları yeniden yazmıyor. Hangi tarafta doluysa o korunur.
const KORUNAN = [
  "kapak",
  "image",
  "gorselKaynak",
  "images",
  "imagesKaynak",
  "gorselDeneme",
  "refreshedAt",
  "bildirildi",
];

const WIKIMEDIA = /wikimedia\.org/i;
/** Dolu ve "stok" olmayan görsel adresi mi? */
const iyiGorsel = (u) => typeof u === "string" && /^https?:\/\/|^\//i.test(u) && !WIKIMEDIA.test(u);

const bizimHarita = new Map(bizim.filter((a) => a?.id).map((a) => [a.id, a]));
const onlarinHarita = new Map(onlarin.filter((a) => a?.id).map((a) => [a.id, a]));

const birlesmis = [];
const islenen = new Set();

// 1) Onların sırası korunur; içerikleri bizim taze kayıtla güncellenir.
for (const uzak of onlarin) {
  if (!uzak?.id) continue;
  islenen.add(uzak.id);
  const yerel = bizimHarita.get(uzak.id);
  if (!yerel) {
    birlesmis.push(uzak);
    continue;
  }
  const kayit = { ...uzak, ...yerel };
  for (const alan of KORUNAN) {
    const uzakDeger = uzak[alan];
    const yerelDeger = yerel[alan];
    if (alan === "image") {
      // Kaynak sitenin gerçek fotoğrafı, Wikimedia stoğundan üstündür.
      if (iyiGorsel(uzakDeger)) kayit.image = uzakDeger;
      else if (iyiGorsel(yerelDeger)) kayit.image = yerelDeger;
      else if (uzakDeger) kayit.image = uzakDeger;
      continue;
    }
    if (uzakDeger !== undefined && uzakDeger !== null) kayit[alan] = uzakDeger;
    else if (yerelDeger !== undefined) kayit[alan] = yerelDeger;
  }
  birlesmis.push(kayit);
}

// 2) Yalnızca bizde olan yeni haberler başa eklenir.
const yeni = bizim.filter((a) => a?.id && !islenen.has(a.id));
const sonuc = [...yeni, ...birlesmis];

const hedef = bizimYol;
fs.writeFileSync(hedef, JSON.stringify(sonuc.length ? sonuc : bizim, null, 2) + "\n", "utf8");
console.log(`veri birleştirildi: ${sonuc.length} haber (yeni: ${yeni.length})`);
process.exit(0);
