// Gövde içi stok fotoğraf uygunluk denetiminin küçük regresyon testi.
// Çalıştırma: npm run test:gorsel
import assert from "node:assert/strict";
import { stokEkUygunMu } from "../src/lib/gorsel-uygun.js";

const wikimedia = (dosya) =>
  `https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1a/${encodeURIComponent(dosya)}/1280px-${encodeURIComponent(dosya)}`;

const ornekler = [
  {
    ad: "Libya haberi için İstanbul şehir fotoğrafı elenir",
    article: {
      title: "Libya yönetimi Türkiye ile iş birliği anlaşmasına resmen onay verdi",
      tags: ["Libya", "Türkiye"],
      gorselSorgu: "Libya Turkish flags diplomacy meeting",
    },
    url: wikimedia("Istanbul_city_Photos-_Urban_07.jpg"),
    beklenen: false,
  },
  {
    ad: "İran açıklaması için stüdyo ışığı fotoğrafı elenir",
    article: {
      title: "Tom Barrack İran'a Yeni Saldırı Olasılığını Onayladı",
      tags: ["İran", "ABD"],
      gorselSorgu: "Tom Barrack interview studio",
    },
    url: wikimedia("MOI_PA_learn_camer_setup_and_studio_lighting.jpg"),
    beklenen: false,
  },
  {
    ad: "Sorgu yoksa eski kayıt cezalandırılmaz (deprem fotoğrafı kalır)",
    article: {
      title: "Bulancak Ortaokulu'nda Öğrenciler Deprem Anını Uygulamalı Öğreniyor",
      tags: ["Deprem", "Eğitim"],
      gorselSorgu: "",
    },
    url: wikimedia("Exterior_of_a_damaged_building_after_7.8_magnitude_earthquake_in_Turkiye.jpg"),
    beklenen: true,
  },
  {
    ad: "Türkçe 'yangın' ile İngilizce 'fire' eşleşir",
    article: {
      title: "Bolu Yaylası'nda Ahşap Yayla Evi ve Ahır Yangında Yok Oldu",
      tags: ["Yangın", "Bolu"],
      gorselSorgu: "Bolu village fire",
    },
    url: wikimedia("Roadside_forest_fire_and_long_parapet.jpg"),
    beklenen: true,
  },
  {
    ad: "Ürün fotoğrafı marka sorgusuyla eşleşir",
    article: {
      title: "Apple, iPhone Duo katlanabilir telefon üretimini yüzde 44 artırdı",
      tags: ["Apple", "iPhone"],
      gorselSorgu: "iPhone Duo foldable smartphone",
    },
    url: wikimedia("IPhone_Duo_launching_at_Apple_Store_TRX_02.jpg"),
    beklenen: true,
  },
  {
    ad: "Konu taşımayan 'thumbnail' dosyası elenir",
    article: {
      title: "ABD yetkilileri Cadılar Bayramı öncesinde güvenlik önlemlerini artırdı",
      tags: ["ABD"],
      gorselSorgu: "Halloween celebration street NYC",
    },
    url: wikimedia("thumbnail.jpg"),
    beklenen: false,
  },
  {
    ad: "Yol haberi için yabancı ülkeden genel manzara yolu elenir",
    article: {
      title: "Ulaştırma Bakanlığı, Çankırı yolunu tamamlayarak süreyi kısalttı",
      tags: ["Ulaştırma Bakanlığı", "Çankırı", "karayolu"],
      gorselSorgu: "new asphalt highway road mountains",
    },
    url: wikimedia("Mt_cook_road_New_Zealand_(Unsplash).jpg"),
    beklenen: false,
  },
  {
    ad: "Marka → ürün ailesi köprüsü (Samsung → Galaxy) çalışır",
    article: {
      title: "Samsung, One UI beta afişini yeniledi",
      tags: ["Samsung", "One UI"],
      gorselSorgu: "Samsung One UI beta interface screenshot",
    },
    url: wikimedia("Galaxy_S26_series.jpg"),
    beklenen: true,
  },
];

let gecen = 0;
for (const o of ornekler) {
  const sonuc = stokEkUygunMu(o.article, o.url);
  assert.equal(sonuc, o.beklenen, `${o.ad}: beklenen ${o.beklenen}, gelen ${sonuc}`);
  gecen++;
}

console.log(`✓ ${gecen}/${ornekler.length} görsel uygunluk testi geçti.`);
