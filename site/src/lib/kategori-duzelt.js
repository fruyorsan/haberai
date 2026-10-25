// ==========================================================================
// KATEGORİ DÜZELTME (görüntüleme katmanı)
// --------------------------------------------------------------------------
// Yapay zekâ bazen kaynağın bölümüne bakıp haberi yanlış kategoriye atıyor:
// Formula 1 haberi "Dünya", MotoGP "Gündem" olabiliyor. Aşağıdaki kurallar
// yalnızca ÇOK BELİRGİN durumlarda devreye girer; şüphede mevcut kategori
// korunur. Amaç veriyi yeniden yazmak değil, okuyucunun gördüğü sınıflamayı
// tutarlı kılmak.
// ==========================================================================

const SPOR =
  /\b(f1|formula\s*1|grand\s*prix|motogp|moto\s*2|moto\s*3|süper\s*lig|şampiyonlar\s*ligi|uefa|fifa|nba|euroleague|basketbol|voleybol|futbol|gol|maç|transfer|teknik\s*direktör|şampiyona|olimpiyat|atletizm|tenis|boks|güreş)\b/i;

const UZAY =
  /\b(nasa|esa|jaxa|uzay|roket|uydu|astronot|mars|jüpiter|satürn|teleskop|james\s*webb|spacex|starship|falcon\s*9|artemis|ay\s*görevi|güneş\s*sistemi|exoplanet|kozmik)\b/i;

const SPOR_KATEGORI = "Spor";
const UZAY_KATEGORI = "Uzay";

/** Kategori adını (varsa) düzeltir; aksi halde girdiyi aynen döndürür. */
export function kategoriDuzelt(kategori, baslik = "", ozet = "") {
  const mevcut = String(kategori || "").trim() || "Diğer";
  const metin = `${baslik} ${ozet}`;

  // Zaten doğru kategoriyse dokunma.
  if (mevcut === SPOR_KATEGORI || mevcut === UZAY_KATEGORI) return mevcut;

  // Spor: yalnızca başlıkta güçlü sinyal varsa taşınır (gövdedeki tesadüfi
  // "maç" kelimesi yeterli değildir).
  if (SPOR.test(String(baslik))) return SPOR_KATEGORI;

  // Uzay: teknoloji/gündem/dünya arasında kalmış uzay haberleri.
  if (["Teknoloji", "Gündem", "Dünya", "Bilim", "Diğer"].includes(mevcut) && UZAY.test(metin)) {
    return UZAY_KATEGORI;
  }

  return mevcut;
}
