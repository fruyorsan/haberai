# 30 Günlük Trafik Toparlama Planı

> Başlangıç: 8 Kasım 2026 · Site: haberinai.site
> Önceki teşhis: `docs/trafik-dususu-teshis.md` (25 Ekim çöküşü)

## Trafik neden çöktü — kanıtlı özet

Trafik, görseller silindiği için değil, **24 Ekim 2026 13:59'daki
`5ff41e039` commit'i** yüzünden çöktü:

| Tarih | Olay | Kanıt |
| --- | --- | --- |
| 24.10.2026 13:59 | Site haritası 5.487 → **195 URL**, 4.365 habere `noindex` | `git show 5ff41e039` ("sitemap 5487 -> 195 URL") |
| 25.10.2026 | Google yeni sinyali işledi; gösterim ~0 | GSC eğrisi + `docs/trafik-dususu-teshis.md` |
| 28.10 sonrası | Çekirdek 3.657 URL'ye çıkarıldı | `data/indeks.json` → `secilen: 3657` |
| 08.11.2026 | Teknik engel yok: 3.943 URL site haritasında, robots açık | canlı `sitemap-0.xml`, `robots.txt` |

Görsel silme olayı **trafiğin nedeni değil**: 5.753 haberin kapağı zaten yerel
dosya ve toplam 50 uzak görsel yalnızca Wikimedia. Kopya görsel kalmadı
(`docs/telif-taramasi-2026-11-08.md`).

Asıl zemin: 5.803 haberin %31'i 150 kelimenin altında, ortalama gövde 190
kelime, günde 100-190 URL. Google'ın "scaled content abuse" değerlendirmesi
tam olarak bu profile uygulanır.

## Faz 1 — Hafta 1 (8-14 Kasım): temizlik ve şeffaflık

| # | İş | Sahip | Durum |
| --- | --- | --- | --- |
| 1.1 | Telif taraması: kopya kaynak görseli var mı? | Trafik | ✅ Bitti — 0 bulgu |
| 1.2 | Habere görünür `Kaynak:` atfı + `isBasedOn` | Trafik | ✅ Bitti |
| 1.3 | Alt bilgideki yanlış görsel beyanını düzelt | Trafik | ✅ Bitti |
| 1.4 | `image-sitemap.xml` yalnızca gerçekten gösterilen kapağı bildirsin | Trafik | ✅ Bitti |
| 1.5 | Build doğrulaması (6.748 sayfa) | Trafik | ✅ Bitti |
| 1.6 | İçerik kuralları dokümanı | Trafik | ✅ Bitti |
| 1.7 | Künyeye gerçek yayıncı bilgisi (`PUBLISHER_*`) | **Kullanıcı** | ⬜ Bekliyor |
| 1.8 | Yayın hacmini 25/gün'e indir (`GUNLUK_HABER_LIMIT`) | **Kullanıcı** | ⬜ Bekliyor |
| 1.9 | GSC: manuel işlem + güvenlik + "dizinlenmeyen" gerekçeleri kontrolü | **Kullanıcı** | ⬜ Bekliyor |

Ölçüt: 7. gün sonunda günlük yayın ≤ 25, künyede gerçek isim, GSC'de manuel
işlem kaydı yok.

## Faz 2 — Hafta 2 (15-21 Kasım): içerik derinliği

| # | İş | Sahip | Metrik |
| --- | --- | --- | --- |
| 2.1 | Kalite kapısı: gövde ≥ 250 kelime / 4 paragraf | Pipeline | Yayımlanan haberlerin ortalama gövdesi 190 → 280 kelime |
| 2.2 | Aynı olayı işleyen mükerrer haberleri birleştir | Trafik + Pipeline | Tekil konu / haber oranı |
| 2.3 | En iyi 100 habere özgün değer ekle (yerel etki, hesap) ve `refreshedAt` güncelle | Trafik | GSC'de bu 100 URL'in gösterimi |
| 2.4 | Kategori hub sayfalarına 3-5 cümlelik özgün giriş metni | Site | Kategori sayfası ortalama konum |
| 2.5 | Kapak: kalan 50 Wikimedia görselini yerele al | **Kapak** | Dış görsel sayısı 50 → 0 |

Ölçüt: 14. gün sonunda yeni haberlerin %90'ı 250+ kelime.

## Faz 3 — Hafta 3 (22-28 Kasım): teknik ve dağıtım

| # | İş | Sahip | Metrik |
| --- | --- | --- | --- |
| 3.1 | Core Web Vitals ölçümü (mobil LCP/INP/CLS) | Trafik | LCP < 2,5 sn |
| 3.2 | Haber HTML'ini küçült: okuma zinciri 4 → 3 haber | Site | Sayfa boyutu ~128 KB → ~110 KB |
| 3.3 | İç linkleme: her indeksli haber en az 2 hub bağlantısı | Site | Ortalama iç bağlantı |
| 3.4 | IndexNow ile yeni URL'leri Bing/Yandex'e bildir | Pipeline | Bing'de taranan URL sayısı |
| 3.5 | 150 kelime altı 1.813 haberi gözden geçir: tut / 410 kapat | Trafik | İndeksteki ince sayfa sayısı |
| 3.6 | RSS + JSON Feed + llms.txt tutarlılığı | Trafik | — |

Ölçüt: 21. gün sonunda mobil LCP < 2,5 sn, ince sayfa oranı %31 → %10.

## Faz 4 — Hafta 4 (29 Kasım-5 Aralık): ölçüm ve yeniden başvuru

| # | İş | Sahip | Metrik |
| --- | --- | --- | --- |
| 4.1 | GSC 28 günlük karşılaştırma: tıklama, gösterim, TO, indeksli sayfa | Trafik | Tıklama ≥ 40/hafta |
| 4.2 | En çok gösterim alan 20 sorgu için başlık/özet iyileştirmesi | Trafik | Ortalama konum |
| 4.3 | AdSense kontrol listesini yeniden geç (`docs/adsense-uygunluk.md`) | Trafik | Tüm maddeler ✅ |
| 4.4 | AdSense'e yeniden başvuru | **Kullanıcı** | — |

Ölçüt: 30. gün sonunda haftalık tıklama 3 aylık ortalamanın (≈13/hafta)
üzerinde ve indeksli sayfa sayısı düşmemiş.

## Beklenti (dürüst olalım)

- Teknik düzeltmeler 1-2 haftada **taramayı** düzeltir.
- Sıralama/gösterim dönüşü genellikle **bir sonraki core veya spam
  güncellemesinde** gelir; bu 30 günlük planda garanti değil.
- Bu sürede hacim düşük tutulmalı. Tekrar 145/gün'e çıkmak, aynı döngüyü
  baştan başlatır.

## Yapılmayacaklar

- ❌ Toplu `noindex`, site haritasını küçültme
- ❌ Tüm URL'ler için "dizine eklenmesini iste"
- ❌ Tarihleri geriye alma / toplu backdate
- ❌ Kopya görsel veya kaynak metni geri getirme
- ❌ Aynı gün robots/canonical/noindex ayarlarını değiştirme
