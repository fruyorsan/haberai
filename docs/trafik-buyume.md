# Trafik Büyüme — Kurulum ve Haftalık Rutin

Bu belge, kod tarafında hazır olan ücretsiz/organik büyüme araçlarının nasıl
açılacağını ve her hafta ne yapılacağını anlatır. Hiçbir adım ücretli değildir.

## Kodda hazır olanlar

- **Paylaşım:** WhatsApp, Telegram, X, Facebook, cihazın kendi paylaşım menüsü
  ve bağlantı kopyala. Her paylaşımda `utm_source` + GA4 `share` olayı vardır.
- **Yazı sonu büyüme bloğu:** okuyucu haberi bitirince paylaşım ve bildirim
  istemi görür. Bildirim istemi 14 gün "Daha sonra" ile ertelenebilir.
- **Sosyal kart:** haber görselleri 1200×630 JPEG olarak verilir; Google
  Discover, WhatsApp, X ve Telegram önizlemeleri için uygun boyuttur.
- **Google News sitemap:** son 48 saatteki haberler + `news:keywords`.
- **Site haritası:** `noindex` olan `/ara/` artık sitemap'e girmez.
- **Kurumsal schema:** `NewsMediaOrganization`, yayın ilkeleri ve düzeltme
  politikası bağlantıları.
- **Sosyal kanal bağlantıları:** yalnızca adres tanımlıysa footer ve schema'ya
  girer; hesap yokken kırık bağlantı görünmez.
- **Otomatik Telegram paylaşımı:** bot token + kanal (`@kanal`) yeterlidir;
  mesajda "Haberi oku" düğmesi ve UTM'li bağlantı bulunur.

## 1) Telegram kanalı (en hızlı dağıtım)

1. Telegram'da **herkese açık** bir kanal aç (ör. `@haberinai`).
2. Kanal yönetiminden botu **yönetici** yap; "Mesaj gönderme" iznini ver.
3. Kanal kullanıcı adını GitHub değişkeni olarak tanımla:

   ```powershell
   gh variable set TELEGRAM_CHANNEL --repo fruyorsan/haberai --body "@haberinai"
   gh variable set TELEGRAM_URL --repo fruyorsan/haberai --body "https://t.me/haberinai"
   ```

   Alternatif: sayısal `chat_id` biliyorsan secret olarak ekle:

   ```powershell
   gh secret set TELEGRAM_CHAT_ID --repo fruyorsan/haberai
   ```

4. Bir sonraki derlemede footer'da "Telegram" bağlantısı çıkar. Otomatik
   paylaşımı hemen denemek için:

   ```powershell
   gh workflow run pipeline.yml --repo fruyorsan/haberai
   ```

   > Not: Otomatik paylaşım en fazla ~2 saatte bir, tur başına 1 haber
   > gönderir (`SHARE_MIN_ARALIK_DK=25`). Kanal ısındıkça bu değer düşürülebilir.

## 2) X / Bluesky (opsiyonel)

Kod hazır; yalnızca anahtarlar yok. Ücretsiz hesap açtıktan sonra:

```powershell
# Bluesky: uygulama şifresi (app password) oluştur
gh secret set BLUESKY_HANDLE --repo fruyorsan/haberai
gh secret set BLUESKY_APP_PASSWORD --repo fruyorsan/haberai
gh variable set BLUESKY_URL --repo fruyorsan/haberai --body "https://bsky.app/profile/..."

# X: developer portalından OAuth 1.0a anahtarları
gh secret set X_API_KEY --repo fruyorsan/haberai
gh secret set X_API_SECRET --repo fruyorsan/haberai
gh secret set X_ACCESS_TOKEN --repo fruyorsan/haberai
gh secret set X_ACCESS_SECRET --repo fruyorsan/haberai
gh variable set X_URL --repo fruyorsan/haberai --body "https://x.com/..."
```

Anahtar yoksa ilgili kanal sessizce atlanır; hiçbir hata üretmez.

## 3) Google ve Bing'e bildir (tek sefer)

1. **Google Search Console** → `haberinai.site` → Site haritaları:
   - `https://haberinai.site/sitemap-index.xml`
   - `https://haberinai.site/news-sitemap.xml`
   - Ana sayfa + son 5 haber için "URL Denetimi → Dizine eklenmesini iste".
2. **Bing Webmaster Tools** → site ekle → sitemap'leri gönder.
   IndexNow anahtarı zaten yayında; yeni haberler otomatik bildirilir.
3. **Google Publisher Center** → yayın oluştur → `haberinai.site` ekle.
   Bu, Google News/Discover görünürlüğü için en önemli tek adımdır.

## 4) Ölçüm

GA4'te şu olaylar görünür:

| Olay | Anlamı |
| --- | --- |
| `share` | Paylaşım düğmesine tıklandı (`method`: whatsapp/telegram/x/facebook/native/copy_link) |
| `push_subscribe` | Yazı sonundaki istemden bildirim aboneliği kuruldu |
| `push_cta_dismiss` | "Daha sonra" ile istem ertelendi |

Sosyal trafik `utm_source` ile ayrışır. Haftalık olarak GA4 → Trafik Edinme
raporunda hangi kanalın **etkileşimli oturum** getirdiğine bak; yalnızca
tıklama değil, okuma süresi ve sayfa/session önemli.

## 5) Haftalık 30 dakikalık rutin

1. GA4'te en çok okunan 3 haberi bul.
2. Bu haberleri Telegram kanalında ve X/Bluesky'de yeniden paylaş (yeni UTM ile).
3. Discover'da çıkan/çıkmayan başlıkları karşılaştır: merak uyandıran ama
   abartısız başlıklar daha iyi çalışır.
4. Bir "günün özeti" veya "haftanın özeti" haberi yayınla; bunu kanalda sabitle.
5. Search Console'da yeni keşfedilen sayfaları ve 404'leri kontrol et.

## 6) Günlük yayın kotası ve tempo (2026-10-23)

Hattın en büyük sorunu hacimdi: 5 günde ~3.800 haber (günde 450-770).
Google bu yaşta bir siteye bu hızda güvenmiyor; sayfaların çoğu "tarandı,
dizine eklenmedi" durumunda kalıyor.

Türkiye'deki teknoloji sitelerinin son 24 saatteki gerçek ortalaması
(23.10.2026 ölçümü):

| Site | Son 24 saatte haber |
| --- | --- |
| ShiftDelete | 43 |
| DonanımHaber | 42 |
| CHIP | 34 |
| Webtekno | 31 |
| Tamindir | 30 |
| Webrazzi | 9 |

Ortalama **~36/gün**. Varsayılan kota bu yüzden **40 haber/gün** ve haberler
günün ilk saatlerinde tükenmesin diye **36 dakikada 1** olacak şekilde
yayınlanıyor (40 × 36 dk ≈ 24 saat). Son dakika adayı varsa bekleme 12
dakikaya iner; ancak **saatte en fazla 2 haber** yayınlanır.

Kota ayrıca **günün geçen oranına** göre sınırlanır: öğlene kadar en fazla
~20, 20:00'de ~33, gün sonunda 40. İlk denemede (24.10.2026) yalnızca saatlik
tavan olduğu için 11:30'da 24 haber çıkmıştı; oransal sınır bunu dengeler.
"Son dakika" adayı gün içinde neredeyse hiç bitmediği için yalnızca 12
dakikalık aralık tek başına kotayı 8 saatte tüketirdi; saatlik tavan ve
oransal sınır birlikte akışı gün boyuna yayar.

Ayarlar `src/config.js` içinde; GitHub'da kod değiştirmeden değiştirilebilir:

```bash
# Günde 40 haber (varsayılan). 0 = sınırsız (eski davranış).
gh variable set GUNLUK_HABER_LIMIT --body "40"
# Normal haberler arası en kısa süre (dk).
gh variable set YAYIN_ARALIK_DK --body "36"
# Son dakika adayı varsa en kısa süre (dk).
gh variable set SON_DAKIKA_ARALIK_DK --body "12"
# Saatte en fazla haber (0 = sınırsız).
gh variable set SAATLIK_HABER_LIMIT --body "2"
```

Kota, `Europe/Istanbul` saatine göre gece yarısı sıfırlanır. Kota dolduğunda
hat yeni haber üretmez; veri onarımı ve piyasa güncellemesi devam eder.
Kotayı geçici olarak kapatmak için `GUNLUK_HABER_LIMIT=0` yeterlidir.

## 7) Bildirim bütçesi (40 habere göre)

Günde 40 haber üretildiği için bildirimler de bu tempoya göre sınırlandı.
Varsayılan (`gun10`) modda bir okuyucuya günde en fazla:

| Tür | Günlük tavan | Aralık | Saat |
| --- | --- | --- | --- |
| Konu bildirimi | 10 | 96 dk | 07:00-21:24 |
| Genel son dakika | 2 | 4 saat | Gece dahil |
| Günün özeti | 3 | — | 09:00 / 15:00 / 21:00 |

Yani ortalama **her 4 haberde 1 bildirim**. Konu bildirimleri 23:00-07:00
arasında susar; sabah 13:00'e kadar en fazla 4 tanesi gider, akşam saatlerine
de bildirim kalır. Bir kategoriye 2 saatte en fazla 1 bildirim gider.

### Haber akışıyla senkron

Bildirim, rastgele bir saatte "elde ne varsa" göndermez; **haber akışına bağlıdır**:

- Aday havuzu = **son konu bildiriminden bu yana yayınlanan haberler**
  (pencere: geçen süre + 12 dk, en az 40 dk, en fazla 150 dk). Sabit 8 saatlik
  havuz kaldırıldı; o yüzden 6 saat önceki haber "yeni" diye gitmiyor.
- **Senkron freni:** eldeki en yeni haber 60 dakikadan eskiyse bildirim
  gönderilmez, yeni haber beklenir. Yani bildirim, haber yayınlandıktan hemen
  sonraki turda (≈3 dk) çıkar; hat durduğunda boşuna bildirim gitmez.
- Her kategoride yalnızca **en yeni yayın dilimi** (en yeni haberden 40 dk
  içindeki haberler) dikkate alınır. Böylece okuyucu bildirime tıkladığında
  sayfada gördüğü haber, bildirimdeki haberle aynı olur.
- Aynı dilim içinde "en çok tıklanacak" haber seçilir: önce **son dakika**,
  sonra **ilgi puanı** (başlık merakı + gerçek fotoğraf + tazelik).
- **Genel son dakika** 90 dk taze sayılır (4 saat değil); saatler önceki
  "son dakika" haberi tüm aboneye gitmez.

Böylece 40 haber/gün → 10 konu bildirimi = **her 4 haberde 1 bildirim** ve her
bildirim gerçekten o an çıkan bir habere denk gelir.

Genel son dakika yalnızca gerçekten acil başlıklarda gider: depremde
AFAD/Kandilli veya bir il adı geçmesi şarttır. "Vanuatu'da 6,9 deprem" gibi
uzak haberler ve ürün tanıtımları tüm aboneye değil, yalnızca o kategorinin
takipçisine gider.

Profilde "Seçtiğim başlıklardaki tüm haberler" (`hepsi`) modunu seçen okuyucu
bilinçli olarak tümünü alır; bu modda günlük tavan uygulanmaz.

## Sınırlar

- Google News/Discover kabulü garanti değildir; içerik özgünlüğü ve yayın
  ilkeleri belirleyicidir.
- Toplu üretilmiş 3.800+ haber, arama motorlarında "ince içerik" riski taşır.
  Bu yüzden özgün yorum/analiz ve kaynak bağlantısı korunmalıdır.
- Ücretli reklam, e-posta aracı veya sunucu bu plana dâhil değildir.
