import { BREAKING_MAX, getBreakingItems } from "../lib/breaking.js";

// Statik Astro endpoint: /breaking.json → istemci tarafı canlı "son dakika" şeridi
// bu dosyayı 60 sn'de bir cache-bust ile yoklar. Statik host olduğu için
// güncellik, build anındaki veriye + tarayıcı önbellek süresine bağlıdır.
export function GET() {
  const items = getBreakingItems({ limit: BREAKING_MAX });

  return new Response(
    JSON.stringify({ generatedAt: new Date().toISOString(), items }),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // Kısa önbellek: canlı hissi korur, gereksiz istekleri azaltır.
        "Cache-Control": "public, max-age=60",
      },
    }
  );
}
