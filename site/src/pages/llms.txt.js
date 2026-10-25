import { getCategories, publishedISO, getYayinArticles } from "../lib/articles.js";
import { siteOrigin } from "../lib/site-meta.js";

// ============================================================================
// /llms.txt — yapay zekâ asistanları için site özeti
// ----------------------------------------------------------------------------
// llms.txt, LLM'lerin bir siteyi tek dosyada anlaması için önerilen açık
// biçimdir (https://llmstxt.org). Burada:
//   * sitenin ne olduğu ve yayın ilkeleri,
//   * makine tarafından okunabilir uçlar (JSON, RSS, site haritası),
//   * bölüm bağlantıları,
//   * son haberlerin başlık + tarih + özet listesi
// bulunur. Böylece asistanlar tek istekle güncel bağlam alır.
// ============================================================================
export function GET({ site }) {
  const origin = siteOrigin(site);
  const haberler = getYayinArticles();
  const kategoriler = getCategories();
  const son = haberler.slice(0, 40);

  const cizgi = (s) => String(s || "").replace(/\s+/g, " ").trim();
  // Özetleri kelime ortasında kesmemek için son boşluktan kırp.
  const kirp = (s, n) => {
    const t = cizgi(s);
    if (t.length <= n) return t;
    return t.slice(0, n).replace(/\s+\S*$/, "") + "…";
  };

  const satirlar = [
    "# HaberinAi",
    "",
    "> HaberinAi, Türkiye ve dünyadan son dakika haberlerini yapay zekâ desteğiyle" +
      " özetleyen, her haberde kaynağını gösteren ve özgün editör yorumu ekleyen" +
      " bağımsız Türkçe haber sitesidir. İçerikler ücretsizdir, üyelik gerektirmez.",
    "",
    `Site: ${origin}`,
    `Dil: Türkçe (tr-TR)`,
    `Haber sayısı: ${haberler.length}`,
    `Kategori sayısı: ${kategoriler.length}`,
    "",
    "## Yapay zekâ asistanları için notlar",
    "",
    "- Her haber sayfası `<article>` içinde başlık, özet, gövde, kaynak bağlantısı ve",
    "  yayın tarihi ile verilir; tek tek sayfa çekmek yerine aşağıdaki toplu uçları kullanın.",
    "- Alıntı yaparken site adını (**HaberinAi**) ve haberin tam adresini belirtin.",
    "- Özetler HaberinAi'ye aittir; kaynak gösterilerek alıntılanabilir.",
    "- Görseller Wikimedia Commons'tan serbest lisansla alınır; görsel lisansı haber",
    "  sayfasındaki kaynak notunda belirtilir.",
    "",
    "## Makine tarafından okunabilir kaynaklar",
    "",
    `- [JSON arama indeksi](${origin}/search-index.json): tüm haberler (başlık, özet, kategori, tarih, etiket, görsel).`,
    `- [JSON Feed](${origin}/feed.json): son 50 haber, standart JSON Feed 1.1 biçiminde.`,
    `- [RSS](${origin}/rss.xml): son haberler, XML.`,
    `- [Son dakika JSON](${origin}/breaking.json): son dakika akışı.`,
    `- [Haber site haritası](${origin}/news-sitemap.xml): Google News biçimi, son 48 saat.`,
    `- [Site haritası](${origin}/sitemap-index.xml): tüm sayfalar.`,
    "",
    "## Bölümler",
    "",
    ...kategoriler.map(
      (k) => `- [${k.name}](${origin}/kategori/${k.slug}/): ${k.count} haber.`
    ),
    "",
    "## Son haberler",
    "",
    ...son.map(
      (a) =>
        `- [${cizgi(a.title)}](${origin}${a.url}) — ${publishedISO(a)} — ${a.category}` +
        (a.summary ? `\n  ${kirp(a.summary, 220)}` : "")
    ),
    "",
    "## Yayın ilkeleri",
    "",
    "- Haberler kaynaklara bağlantı verilerek özgün biçimde özetlenir; kaynak site",
    "  fotoğrafları kullanılmaz.",
    "- Yapay zekâ ile üretilen özetler yayın öncesi denetimden geçer; düzeltme",
    "  talepleri 48 saat içinde sonuçlandırılır.",
    "- Reklamlar içerikten görsel olarak ayrılır; sponsorlu içerik \"Sponsorlu\" olarak",
    "  işaretlenir.",
    "",
    "## İletişim ve lisans",
    "",
    `- İletişim: ${origin}/iletisim/`,
    `- Telif ve kullanım: ${origin}/telif/ · ${origin}/kullanim-sartlari/`,
    `- Gizlilik: ${origin}/gizlilik/`,
    "",
  ];

  return new Response(satirlar.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
    },
  });
}
