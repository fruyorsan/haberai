# Trafik Düşüşü Teşhisi — 25 Ekim 2026

> Bu dosya, 5 Kasım 2026'da canlı site + GSC ekran görüntüsü + git geçmişi
> üzerinden yapılan incelemeyi kaydeder. Amaç aynı hatayı tekrar etmemek.

## Kısa özet

Trafik 25 Ekim 2026'da **bir gecede sıfıra** düştü. Bunun iki katmanlı nedeni var:

1. **Tetikleyici (bizim hatamız):** 24 Ekim 13:59'da yayına giren
   `5ff41e039` commit'i, 4.485 haberin yalnızca 120'sini indekse açık bıraktı;
   site haritası **5.487 → 195 URL**'e indi, kalan tüm haberlere `noindex`
   basıldı. Google 25 Ekim'de bu sinyali gördü ve görünürlük sıfırlandı.
2. **Asıl zemin (içerik modeli):** Site, RSS'ten toplanan haberleri AI ile
   yeniden yazıp günde 100-200 URL üreten bir yapı. Google'ın "scaled content
   abuse" ve "scraped content" politikaları tam olarak bu modele uygulanıyor.
   Zaten 5.487 URL'in yalnızca ~58'i indekslenmişti. Yani düşüş bir "kaza"
   değil, zayıf temelin üzerine gelen büyük bir sarsıntı.

## Zaman çizelgesi (kanıtlar)

| Tarih / saat | Olay | Sonuç |
| --- | --- | --- |
| 16.10.2026 | Site yayına giriyor, GSC verisi başlıyor | — |
| 17.10.2026 | `CUSTOM_DOMAIN=haberinai.site` | Kanonik adres değişiyor |
| 23-24.10.2026 | GSC zirvesi | ~1.200 gösterim / ~40-58 tıklama (günlük) |
| **24.10.2026 13:59** | **`5ff41e039` — indeks çekirdeği** | **Sitemap 5.487 → 195; 4.365 habere `noindex`** |
| 25.10.2026 | Google yeni sinyali işliyor | **Gösterim ve tıklama ~0** |
| 28-29.10.2026 | Kota kaldırılıyor, çekirdek 3.657 URL'ye çıkıyor | Trafik dönmüyor |
| 05.11.2026 | Canlı durum: teknik engel yok | Trafik hâlâ ~0 |

## Bugünkü teknik durum (5 Kasım 2026, canlı ölçüm)

Bunların **hiçbiri** sorun değil — yani "site kapalı / robots kapalı / noindex
her yerde" gibi bir arıza yok:

- Ana sayfa, haber sayfaları: HTTP 200, `index, follow`
- `robots.txt`: Googlebot/Googlebot-News dâhil `Allow: /`
- `sitemap-0.xml`: 3.776 URL (3.708 haber), `lastmod` güncel
- `news-sitemap.xml`: son 48 saatte 147 URL
- `image-sitemap.xml`: 3.711 görsel
- Googlebot ve normal tarayıcı aynı 200 yanıtı alıyor (Cloudflare challenge yok)
- Canonical'lar `https://haberinai.site` ile tutarlı
- Yayın hattı çalışıyor (5 Kasım'da da commit'ler akıyor)

Yani kalan sorun **teknik değil, Google'ın siteye verdiği güven**.

## Neden "0 gösterim" ama sayfalar indekste?

Site geneli bir kalite/spam sınıflandırıcısı devreye girdiğinde tipik tablo:

- Sayfalar dizinden tamamen silinmez (URL Inspection "indexed" der),
- ama marka dışı hiçbir sorguda gösterim alamazlar,
- manuel işlem kaydı görünmez,
- robots/canonical/noindex tarafında bir engel yoktur.

Ekim 2026'nın son haftasında Google forumlarında bu tabloyu birebir yaşayan
çok sayıda site var (21-28 Ekim arası, %97 düşüş, sayfalar indekste, manuel
işlem yok). Uzman yanıtları "scaled content" ve "scraped content"
politikalarına işaret ediyor. Bu, tek bir teknik düzeltmeyle değil, içerik
modeli değişince ve bir sonraki core/spam güncellemesinde yeniden
değerlendirilince düzelir.

## İlk 10 dakikada doğrulanacaklar (sadece panelden)

Bunlar netleşmeden hiçbir kod değişikliği yapılmamalı:

1. **Doğru property mi?** GSC'de üstteki mülk adı `haberinai.site` mi,
   `fruyorsan.github.io` mu? Eski mülkse veriler yeni alan adına taşınmış
   olabilir; o zaman "trafik öldü" değil "yanlış mülke bakıyorsun" olur.
   İki mülkü de ekle, veriyi `haberinai.site` üzerinden oku.
2. **Manuel işlemler** → boş mu? (Varsa "Scaled content abuse" yazısı çıkar.)
3. **Güvenlik sorunları** → boş mu?
4. **Sayfa dizine ekleme** → "Dizinlenen" kaç, "Dizinlenmeyen" hangi
   gerekçelerle? Özellikle `noindex` ve "Tarandı - dizine eklenmedi"
   sayıları kritik.
5. **Crawl stats** → Googlebot son 2 haftada kaç istek attı, 200/301/404/5xx
   dağılımı ne? 5xx varsa hosting sorunu ayrıca konuşulur.
6. **Site haritaları** → `sitemap-index.xml` ve `news-sitemap.xml`
   "Başarılı" mı, son okuma tarihi ne?

## Kurtarma planı (öncelik sırasıyla)

### 1. İndeks politikasını bir daha oynatma (yapıldı)

- `src/indeks.js` artık önceki çekirdeği devralıyor; bir haber bir kez
  indekse girdiyse kalite sırası düşse bile `noindex`'e dönmüyor.
- Kural: **hiçbir koşulda "toplu noindex" yok.** Kalite kapısı tek tek
  çalışır, site geneline aynı gün uygulanmaz.
- Mevcut durumda 5.850 haberin ~2.100'ü hâlâ `noindex` (kısa gövde vb.).
  Bu oran tek başına felaket değil; ama bir daha **%97'ye çıkarılmamalı**.

### 2. Yayın hacmini düşür (en önemli tek adım)

Google'ın "scaled content" değerlendirmesi sayfa sayısıyla doğrudan ilgili.

| Ayar | Şu an | Öneri |
| --- | --- | --- |
| `GUNLUK_HABER_LIMIT` | 145 | **20-30** |
| `YAYIN_ARALIK_DK` | 10 | **45-60** |
| `SAATLIK_HABER_LIMIT` | 10 (varsayılan) | **2** |

```bash
gh variable set GUNLUK_HABER_LIMIT --body "25"
gh variable set YAYIN_ARALIK_DK --body "50"
gh variable set SAATLIK_HABER_LIMIT --body "2"
```

Amaç az haber değil, **az ama farklı** haber. Aynı olayı 5 kez yazmak
hacmi artırır, güveni azaltır.

### 3. Haberin "AI dolgusu"nu azalt

Şu an gövde, haberin kendisinden çok genel geçer cümlelerle şişiyor
(örnek: Riyad erken uyarı haberinde "sensör ağları, yapay zeka analizi,
yüzde 80 bilgilendirme" gibi kaynakta olmayan ayrıntılar). Google'ın
Ekim 2026 AI içerik rehberi, yayından önce **elle doğrulama** istiyor.

Her haberde minimum:
- Kaynak adı + kaynak bağlantısı (görünür),
- En az 1 özgün değer: yerel etki, karşılaştırma, hesap, uzman yorumu,
- Uydurma istatistik yok; kaynakta olmayan sayı/iddia yok.

### 4. Tek adres, tek kopya

- `fruyorsan.github.io` hâlâ eski bir derlemeyi 200 ile servis ediyor
  (canonical'ı `haberinai.site` olduğu için büyük risk değil, ama kopya).
- `www.haberinai.site` 301 yerine 200 dönüyor.
- Cloudflare'de iki kural yeterli:
  - `www.haberinai.site/*` → `https://haberinai.site/$1` (301)
  - Mümkünse `fruyorsan.github.io` için de 301 ya da o depoyu boşalt.
- GitHub Pages yedeği artık yayınlanmıyor (`DEPLOY_TARGET=cloudflare`);
  eski kopya zamanla kendiliğinden eskir, yine de 301 eklemek daha temiz.

### 5. GSC'ye "yeniden tara" sinyali ver

Tek seferlik, abartmadan:

1. `sitemap-index.xml` ve `news-sitemap.xml`'i yeniden gönder.
2. En iyi 20-30 haberi URL Denetimi → **Dizine eklenmesini iste**
   (tüm 3.700 URL'i değil; kota ve güven açısından zararlı).
3. Ana sayfa + 5 kategori sayfası için aynısını yap.
4. 2-3 hafta boyunca **hiçbir indeks ayarını değiştirme.**

### 6. Beklenti

- Bu tür site geneli düşüşlerde hızlı geri dönüş yok.
- Teknik düzeltmeler 1-2 haftada taranmayı düzeltir; **sıralama/gösterim
  dönüşü genellikle bir sonraki core veya spam güncellemesinde** gelir.
- Bu sürede hacim düşük, içerik özgün tutulmalı; aksi hâlde aynı döngü
  tekrar eder.

## Yapılmaması gerekenler

- ❌ Sitemap'i tekrar küçültmek, toplu `noindex` basmak
- ❌ Tüm URL'ler için "dizine eklenmesini iste" göndermek
- ❌ Tarihleri geriye almak / toplu backdate
- ❌ Silinen URL'leri 404 bırakmak (301 veya 410 kullan)
- ❌ Aynı gün içinde robots/canonical/noindex ayarlarını değiştirmek

## İlgili dosyalar

- `src/indeks.js` — indeks çekirdeği ve kalite kapısı
- `site/src/pages/haber/[slug].astro` — `noindex={!indeksliMi(article)}`
- `site/astro.config.mjs` — sitemap filtresi
- `.github/workflows/pipeline.yml` — yayın hattı
- `docs/trafik-buyume.md` — 24.10 sonrası ilk post-mortem
