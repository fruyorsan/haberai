// Kategori yedeği havuzu için Commons'tan aday görsel toplar.
// Çıktı: JSON (kategori -> görsel listesi). Lisans/atıf alanları dolu gelir.
import fs from "node:fs";
import { stokGorseller } from "../src/stok-gorsel.js";

const SORGULAR = {
  "Gündem": ["Istanbul street city", "Ankara city view", "Turkey city square"],
  "Dünya": ["world map globe", "United Nations building", "international flags"],
  "Ekonomi": ["stock exchange trading", "bank building facade", "Turkish lira banknotes"],
  "Spor": ["football stadium match", "basketball game", "athletics running track"],
  "Teknoloji": ["circuit board close up", "technology laboratory", "computer server rack"],
  "Sağlık": ["hospital corridor", "medical equipment", "doctor stethoscope"],
  "Yapay Zeka": ["artificial intelligence robot", "robot hand", "neural network"],
  "Donanım": ["computer graphics card", "motherboard components", "computer hardware"],
  "Uzay": ["rocket launch", "satellite orbit", "astronomical telescope"],
  "Bilim": ["science laboratory research", "microscope laboratory", "chemistry lab"],
  "Kültür": ["museum gallery visitors", "library books shelves", "concert hall"],
  "Otomobil": ["electric car charging", "car factory assembly", "traffic road cars"],
  "Mobil": ["smartphone in hand", "mobile phone screen", "tablet device"],
  "Oyun": ["video game controller", "gaming setup", "arcade machine"],
  "Yazılım": ["programming code screen", "software developer", "computer code"],
  "İnternet": ["data center server room", "fiber optic cables", "network switch"],
  "Yaşam": ["people walking park", "family picnic", "city park bench"],
  "Diğer": ["newspaper stack", "newsroom desk", "journalism press"],
};

const hedef = 4; // kategori başına
const sonuc = {};
const kullanilan = new Set();

for (const [kategori, sorgular] of Object.entries(SORGULAR)) {
  const bulunan = [];
  for (const q of sorgular) {
    if (bulunan.length >= hedef) break;
    let adaylar = [];
    try {
      adaylar = await stokGorseller([q], { adet: hedef });
    } catch {
      adaylar = [];
    }
    for (const g of adaylar) {
      if (bulunan.length >= hedef) break;
      const anahtar = String(g.sayfa || g.url);
      if (kullanilan.has(anahtar)) continue;
      kullanilan.add(anahtar);
      bulunan.push({
        url: g.url,
        yazar: g.yazar || "",
        lisans: g.lisans || "",
        lisansUrl: g.lisansUrl || "",
        sayfa: g.sayfa || "",
      });
    }
    await new Promise((r) => setTimeout(r, 900));
  }
  sonuc[kategori] = bulunan;
  console.log(`${kategori}: ${bulunan.length} görsel`);
}

fs.writeFileSync("yedek-havuz.json", JSON.stringify(sonuc, null, 2), "utf8");
console.log("yazıldı: yedek-havuz.json");
