# HaberinAi İçerik Kuralları (yayın hattı için)

> Sürüm: 8 Kasım 2026 · Geçerlilik: `src/` veri hattı ve AI istemleri
> (`src/ai.js`, `src/kalite.js`, `src/indeks.js`).
> Amaç: AdSense'in "low value / scaled content" değerlendirmesini besleyen
> içerik profilini kalıcı olarak düzeltmek.

## 1. Yayın hacmi

| Ayar | Eski | Yeni hedef |
| --- | --- | --- |
| `GUNLUK_HABER_LIMIT` | 145 | **25** |
| `YAYIN_ARALIK_DK` | 10 | **50** |
| `SAATLIK_HABER_LIMIT` | 10 | **2** |

Kural: **az ama farklı.** Günde 25 kaliteli haber, 145 kısa haberden daha
fazla organik trafik getirir; Google'ın değerlendirmesi sayfa sayısından çok
sayfa başına değere bakıyor.

## 2. Yayın kapısı (hepsi sağlanmadan haber yayımlanmaz)

1. **Gövde ≥ 250 kelime ve ≥ 4 paragraf.** 150 kelimenin altındaki hiçbir haber
   yayımlanmaz.
2. **Özet gövdeden farklı** olmalı (kopyala-yapıştır özet yasak).
3. **En az 3 madde** "öne çıkanlar" ve her madde tek başına anlamlı.
4. **Kaynak zorunlu:** `source` (yayın adı) ve `sourceUrl` (tam adres) dolu.
   Sayfada görünür atıf olarak basılır.
5. **Kaynakta olmayan sayı, tarih, kurum adı ve iddia yazılmaz.** Kaynakta
   olmayan istatistik uydurmak, sitenin en büyük güven kaybı nedeni.
6. **Aynı olay için tek haber.** Aynı gün aynı konuyu işleyen ikinci haber
   yayımlanmaz; gelişme varsa mevcut haber güncellenir (`refreshedAt`).
7. **Benzerlik eşiği:** başka bir metinle %55'ten fazla örtüşme → yeniden yaz.

## 3. Özgün değer (her haberde en az biri)

- Yerel etki: bu gelişme Türkiye'deki kullanıcıyı nasıl etkiler?
- Karşılaştırma: önceki sürüm/rakip/önceki yıl ile fark.
- Hesap: fiyat, tasarruf, süre, pazar payı — kaynaktaki verilerden türetilerek.
- Bağlam: neden şimdi, kim kazanır, kim kaybeder.

Bu dörtlüden hiçbiri yoksa haber "AI dolgusu"dur; yayımlanmaz.

## 4. Dil ve başlık

- Başlık ≤ 70 karakter, tıklamayla vaat edilen şey metinde karşılanır.
- Tıklamayla yanıltan başlık (clickbait), abartılı "şok / inanılmaz" yasak.
- Kaynaktaki iddia kesin bilgi gibi sunulmaz: "iddia edildi", "açıkladı".

## 5. Görsel

- Kaynak sitenin fotoğrafı **hiçbir koşulda** kullanılmaz.
- Yalnızca: yerel `/kapak/…`, CC0 / kamu malı, AI üretimi (rozetli) veya markalı
  tasarım kartı.
- CC BY / CC BY-SA görsel gövdeye **girmez** (sayfada kredi gösterilmiyor).

## 6. Yapay zekâ şeffaflığı

- Her haberde "AI YORUMU" bölümü ayrı etiketlenir.
- Yayın ilkelerinde AI kullanımı açıklanır (`/yayin-ilkeleri/#yapay-zeka`).
- İnsan editör denetimi olmadan hiçbir haber yayımlanmaz.

## 7. İndeks politikası

- Site geneline **toplu `noindex` asla** uygulanmaz (24 Ekim 2026 hatası).
- Kalite kapısı tek tek çalışır; bir haber bir kez indekse girdiyse geri
  düşürülmez (`src/indeks.js`).
- İnce haberler indeks dışında kalır ve **reklam göstermez**.
