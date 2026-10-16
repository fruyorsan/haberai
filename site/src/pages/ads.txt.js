import { ADSENSE_CLIENT, ADSENSE_CERT } from "../lib/site-meta.js";

// AdSense ads.txt: reklam yayıncısı doğrulama dosyası.
//
// Statik yayında (GitHub Pages) sunucu tarafı durum kodu verilemediği için dosya
// her zaman üretilir. Yayıncı kimliği tanımlı değilse yalnızca yorum satırı
// yazılır (geçerli ve boş sayılır); kimlik tanımlandığında Google kaydı eklenir.
export function GET() {
  const pub = String(ADSENSE_CLIENT || "").replace(/^ca-/, "").trim();

  const body = pub
    ? `google.com, ${pub}, DIRECT, ${ADSENSE_CERT}\n`
    : "# AdSense yayinci kimligi (ADSENSE_CLIENT) tanimlandiginda Google kaydi buraya eklenir\n";

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": pub ? "public, max-age=3600" : "public, max-age=300",
    },
  });
}
