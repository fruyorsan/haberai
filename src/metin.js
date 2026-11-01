// ==========================================================================
// METİN ONARIMI (bozuk karakter kodlaması)
// --------------------------------------------------------------------------
// Bazı kaynaklar UTF-8 metni OEM kod sayfasıyla (CP437) çözüp yayınlıyor:
// "Gündem" yerine "G├╝ndem", "İsrail" yerine "─░srail". Bu bozulma başlık,
// özet, gövde, kategori ve kaynak adına kadar her alana yayılabiliyor ve
// sitede okunamaz haber olarak görünüyordu.
//
// Aşağıdaki tablo CP437'nin 0x80-0xFF aralığını verir. Bozuk metin baytlara
// geri çevrilip UTF-8 olarak yeniden çözülür. Kutu/çizim karakterleri Türkçe
// haber metninde geçmediği için tespit güvenli: iki tanesi bile yeterli.
// ==========================================================================

// İki olası kaynak kod sayfası: Türkçe Windows konsolu (CP857) ve ABD
// varsayılanı (CP437). Aynı bayt farklı glife düştüğü için ikisi de denenir;
// yalnızca geçerli UTF-8 üreten tablo kabul edilir.
const CP857_UST =
  "ÇüéâäàåçêëèïîıÄÅÉæÆôöòûùİÖÜø£ØŞşáíóúñÑĞğ¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ºªÊËÈ\uf8bbÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµ\uf8bc×ÚÛÙìÿ¯´\u00ad±\uf8bd¾¶§÷¸°¨·¹³²■\u00a0";

const CP437_UST =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00a0";

const TABLOLAR = [CP857_UST, CP437_UST].map((tablo) => {
  const ters = new Map();
  for (let i = 0; i < tablo.length; i++) {
    if (!ters.has(tablo[i])) ters.set(tablo[i], 0x80 + i);
  }
  return ters;
});

const KUTU = /[\u2500-\u259F]/g;

/** Metin CP437/UTF-8 karışmasıyla bozulmuş görünüyor mu? */
export function bozukMetinMi(metin) {
  if (typeof metin !== "string" || metin.length < 4) return false;
  return (metin.match(KUTU) || []).length >= 2;
}

/** Bozuk metni onarır; çevrilemiyorsa olduğu gibi döner. */
export function metinDuzelt(metin) {
  if (!bozukMetinMi(metin)) return metin;
  for (const ters of TABLOLAR) {
    const baytlar = [];
    let uygun = true;
    for (const ch of metin) {
      const kod = ch.codePointAt(0);
      if (kod < 0x80) {
        baytlar.push(kod);
        continue;
      }
      const b = ters.get(ch);
      if (b === undefined) {
        uygun = false; // emoji vb. varsa bu tabloyla çevrilemez
        break;
      }
      baytlar.push(b);
    }
    if (!uygun) continue;
    try {
      const cozulen = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(baytlar));
      // Hâlâ kutu karakteri ya da bozuk bayt varsa bu gerçek bir çizim metnidir.
      if (/[\u2500-\u259F\uFFFD]/.test(cozulen)) continue;
      if (cozulen === metin) continue;
      return cozulen;
    } catch {
      // geçersiz UTF-8: sıradaki tabloyu dene
    }
  }
  return metin;
}

/**
 * Bir nesne/dizideki tüm metin alanlarını yerinde onarır.
 * `sayac.alan` kaç alanın değiştiğini sayar (günlük için).
 */
export function metinleriDuzelt(deger, sayac) {
  if (typeof deger === "string") {
    const yeni = metinDuzelt(deger);
    if (yeni !== deger && sayac) sayac.alan++;
    return yeni;
  }
  if (Array.isArray(deger)) {
    for (let i = 0; i < deger.length; i++) deger[i] = metinleriDuzelt(deger[i], sayac);
    return deger;
  }
  if (deger && typeof deger === "object") {
    for (const anahtar of Object.keys(deger)) {
      deger[anahtar] = metinleriDuzelt(deger[anahtar], sayac);
    }
  }
  return deger;
}
