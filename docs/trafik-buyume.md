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

## Sınırlar

- Google News/Discover kabulü garanti değildir; içerik özgünlüğü ve yayın
  ilkeleri belirleyicidir.
- Toplu üretilmiş 3.800+ haber, arama motorlarında "ince içerik" riski taşır.
  Bu yüzden özgün yorum/analiz ve kaynak bağlantısı korunmalıdır.
- Ücretli reklam, e-posta aracı veya sunucu bu plana dâhil değildir.
