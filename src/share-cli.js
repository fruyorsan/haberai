// Tek başına sosyal paylaşım: arşivdeki TÜM haberleri okur, data/social.json'da
// kayıtlı olmayan (yani yeni) haberleri yapılandırılmış kanallara paylaşır.
// Workflow bunu "Haberleri topla" adımından sonra çalıştırır (npm run share).
import { loadArticles } from "./store.js";
import { shareNewArticles } from "./share.js";

const DRY = process.argv.includes("--dry");

async function main() {
  const articles = await loadArticles();
  console.log(`Arşivde ${articles.length} haber var.`);
  const result = await shareNewArticles(articles, { dry: DRY });
  console.log(`Sosyal paylaşım bitti: ${result.shared} haber paylaşıldı.`);
}

main().catch((err) => {
  console.error(`Sosyal paylaşım hatası: ${err.message}`);
  process.exit(1);
});
