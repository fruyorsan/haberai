import { siteOrigin } from "../lib/site-meta.js";

// robots.txt dinamik üretilir: alan adı değiştiğinde site haritası adresleri
// kendiliğinden yeni adrese döner.
//
// YAPAY ZEKÂ BOTLARI: haber sitesi olduğumuz için arama motorlarına ve LLM
// asistanlarına açık olmak istiyoruz. Aşağıdaki liste "bilinçli olarak izin
// verildi" mesajıdır; `User-agent: *` zaten herkesi kapsar, ama adı geçen
// botlar için ayrı blok yazmak bazı tarayıcıların/kontrollerin denetiminde
// "izin verilmiş" olarak görünür ve yanlış anlaşılmayı önler.
const AI_BOTLARI = [
  // OpenAI
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  // Anthropic
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  // Perplexity
  "PerplexityBot",
  "Perplexity-User",
  // Google (Gemini eğitimi + arama)
  "Googlebot",
  "Googlebot-News",
  "Google-Extended",
  "GoogleOther",
  // Microsoft / Bing / Copilot
  "Bingbot",
  "MSNBot",
  "Copilot",
  // Apple
  "Applebot",
  "Applebot-Extended",
  // Meta
  "meta-externalagent",
  "FacebookBot",
  // Diğer LLM ve arşivler
  "CCBot",
  "Amazonbot",
  "YouBot",
  "MistralAI-User",
  "DuckAssistBot",
  "cohere-ai",
  "Diffbot",
  "AI2Bot",
  "Timpibot",
  // Klasik arama motorları
  "YandexBot",
  "DuckDuckBot",
  "Slurp",
  "Bravebot",
];

// Taranmasına gerek olmayan, oturuma/kişiye ait sayfalar.
const KAPALI = ["/hesap/", "/profil/", "/ara/"];

export function GET({ site }) {
  const origin = siteOrigin(site);

  const satirlar = [
    "# HaberinAi — robots.txt",
    "# Haber içeriği arama motorlarına ve yapay zekâ asistanlarına açıktır.",
    "# Makine tarafından okunabilir özet: /llms.txt",
    "# JSON arama indeksi: /search-index.json · JSON Feed: /feed.json",
    "",
    "User-agent: *",
    "Allow: /",
    ...KAPALI.map((y) => `Disallow: ${y}`),
    "",
  ];

  for (const bot of AI_BOTLARI) {
    satirlar.push(`User-agent: ${bot}`, "Allow: /", ...KAPALI.map((y) => `Disallow: ${y}`), "");
  }

  satirlar.push(
    "Sitemap: " + origin + "/sitemap-index.xml",
    "Sitemap: " + origin + "/news-sitemap.xml",
    ""
  );

  return new Response(satirlar.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
