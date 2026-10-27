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

## 8) İndeks çekirdeği (2026-10-24)

SORUN: Site 7 günde 3.718 haber yayınladı; Google 5.487 URL'den yalnızca
~58'ini dizine aldı (%1). Bu, "ölçekli/zayıf içerik" damgasıdır: Google sitenin
tamamına güvenmediği için yeni ve kaliteli haberler de taranmıyor.

ÇÖZÜM: Dizine açık sayfa sayısını küçük ve kaliteli bir çekirdeğe indirmek.
Site gezinmesi değişmez; okuyucu her haberi görmeye devam eder.

| Ne | Kural |
| --- | --- |
| Haber | Günde en iyi **32** haber, **45 günlük** pencere |
| Diğer haberler | `noindex, follow` (dizine girmez, link değeri korunur) |
| Sayfalama | 2. sayfa ve sonrası `noindex, follow` |
| Etiket | Yalnızca **50+** haberi olan etiket sayfaları indekslenir |
| Site haritası | Yalnızca indekslenebilir URL'ler (noindex URL giremez) |

Seçim deterministiktir ve `data/indeks.json`'da tutulur. **Geçmiş günler
dondurulur**: dün indekste olan haber bugün noindex olmaz. Yalnızca bugünün
listesi, gün içinde eklenen haberlerle güncellenir. Böylece Google aynı URL için
her gün farklı sinyal görmez.

**2026-10-26:** Günlük çekirdek 24 → **32**; görsel puanı ayrıştırıldı:
yerel/kendi kapak görseli (+14) ve ek görseller (her biri +4, en fazla 3)
sıralamada Wikimedia stoğunun önüne geçer. Yayın kotası da 135 → **160**
(9 dk aralık, saatte en fazla 8).

Kalite puanı: gövde uzunluğu (2000+ karakter), `keyPoints` sayısı (5),
editör notu, yorum, gerçek fotoğraf, etiket sayısı. Tazelik puanı bilinçli
olarak yok — sıralama gün içinde kaymasın.

Üretim: `npm run indeks` (pipeline'da `collect` sonrası otomatik çalışır).
Kapatmak için `INDEKS_GUNLUK=0` değil, `data/indeks.json`'ı silmek yeterli:
dosya yoksa kısıtlama uygulanmaz ve tüm haberler yeniden açık olur.

**Beklenen sonuç:** site haritası 5.487 → ~200 URL; 2-4 hafta içinde GSC'de
"Dizinlenen" sayısının 58 → 150+ çıkması. Silinen sayfa yok, geri alınabilir.

## 9) Kapak görselleri (2026-10-26)

Kapak fotoğrafları haberden habere farklı oran/kalitede geliyordu; feed'de
tutarsız görünüm tıklamayı düşürüyor. Artık her haber için tek oranda, haberle
**birebir alakalı** bir kapak üretilir:

| Ne | Değer |
| --- | --- |
| Boyut / oran | **1280×720** (16:9) WebP, kart için 480 px varyant |
| Düzen | Tam kare fotoğraf + alt köşede küçük `haberinai` işareti + alt kenarda 6 px kırmızı şerit |
| Fotoğraf kaynağı | 1) haberin çıktığı sitenin kendi kapak görseli (`og:image`) 2) veri dosyasındaki görsel (uygunluk denetimli) 3) stok arama |
| Metin | **Görselin üstüne başlık basılmaz.** Başlık kartın/vitrinin kendi metninde; görsele ikinci kez yazmak fotoğrafı kirletiyor ve kırpılınca yarım görünüyor. |
| Sosyal kart | Aynı kapak, wsrv üzerinden 1200×630 JPEG (WhatsApp/X için) |

İlk tercih kaynak sitenin kendi görselidir: o görsel haberin konusunu (cihaz,
uygulama, kişi) doğru gösterir. Kaynak görsel alınamazsa veri dosyasındaki
görsel kullanılır; burada dosya adının arama sorgusuyla en az iki kelime
eşleşmesi (veya sorgunun %75'i) gerekir ve `thumbnail`, `logo`, `map`,
`screenshot` gibi jenerik dosyalar reddedilir. Hiçbiri yoksa marka renkleriyle
tasarımlı zemin üretilir (nadir).

```bash
npm run kapak                # indekste açık haberler
npm run kapak -- --gun=3     # son 3 gün
npm run kapak -- --zorla     # kapak varsa yeniden üret
npm run kapak -- --kart      # yalnızca tasarımlı zeminleri yenile
node scripts/kapak-uret.mjs --varyant   # eksik 480 px varyantları tamamla
```

Pipeline'da `indeks` adımından sonra tur başına en fazla 60 kapak üretilir
(`--gun=2`); üretilenler `site/public/kapak/` altına yazılır ve commit'e girer.

## Sınırlar

- Google News/Discover kabulü garanti değildir; içerik özgünlüğü ve yayın
  ilkeleri belirleyicidir.
- Toplu üretilmiş 3.800+ haber, arama motorlarında "ince içerik" riski taşır.
  Bu yüzden özgün yorum/analiz ve kaynak bağlantısı korunmalıdır.
- Ücretli reklam, e-posta aracı veya sunucu bu plana dâhil değildir.
