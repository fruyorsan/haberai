// ==========================================================================
// GEMINI ANAHTAR HAVUZU
// --------------------------------------------------------------------------
// Gemini'nin ücretsiz planı model başına günde ~20 istek verir. Tek anahtar
// birkaç haberden sonra tükenince görsel ajanı vision'sız kalıyordu. Bu modül
// birden çok anahtarı sırayla kullanır:
//
//   GEMINI_API_KEY=anahtar1
//   GEMINI_API_KEY_2=anahtar2
//   GEMINI_API_KEY_3=anahtar3,anahtar4     (virgülle birden fazla)
//
// Anahtarlar loglara basılmaz; her biri sıra numarasıyla (#1, #2) anılır.
// ==========================================================================

const ANAHTAR_ADI = /^GEMINI_API_KEY(?:_(\d+))?$/i;

/** Ortamdaki tüm Gemini anahtarları, tekrarsız ve sıralı döndürür. */
export function geminiAnahtarlari() {
  const bulunan = [];
  for (const [ad, deger] of Object.entries(process.env)) {
    const m = ANAHTAR_ADI.exec(ad);
    if (!m || !deger) continue;
    bulunan.push({ sira: m[1] ? Number(m[1]) : 1, ad, deger });
  }
  bulunan.sort((a, b) => a.sira - b.sira || a.ad.localeCompare(b.ad));

  const anahtarlar = [];
  for (const { deger } of bulunan) {
    for (const parca of String(deger).split(/[\s,]+/)) {
      const anahtar = parca.trim();
      if (anahtar && !anahtarlar.includes(anahtar)) anahtarlar.push(anahtar);
    }
  }
  return anahtarlar;
}
