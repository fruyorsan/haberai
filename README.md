# HaberAI — Haber Toplama + AI Hattı

RSS kaynaklarından haber toplar, Google Gemini ile **özetler + kendi yorumunu katar** ve
`data/articles.json` dosyasına kaydeder. Site katmanı (Astro) sonra bunu okuyacak.

## Kurulum

```powershell
cd C:\Users\xwqfu\Desktop\haber-sitesi
npm install
```

## API Anahtarı

1. https://aistudio.google.com/app/apikey adresine git (ücretsiz).
2. "Create API key" ile anahtarı al.
3. Proje kökündeki `.env` dosyasını aç, `GEMINI_API_KEY=` satırına yapıştır.

## Çalıştırma

```powershell
# Sadece test: haberleri çeker, AI çağırmaz, kaydetmez
npm run collect:dry

# Gerçek çalıştırma: çeker, AI ile işler, data/articles.json'a ekler
npm run collect
```

## Ayarlar

Tüm ayarlar `src/config.js` içinde:

- `feeds` → kaynak RSS adresleri (ekle/çıkar)
- `maxPerRun` → bir çalıştırmada işlenecek haber sayısı
- `maxAgeHours` → bundan eski haberleri atla
- `model` → Gemini modeli

## Otomasyon

`.github/workflows/pipeline.yml` her 5 dakikada bir çalışır. GitHub'da repo ayarlarından
`GEMINI_API_KEY` adında bir **secret** eklemen yeterli.

## Sosyal Dağıtım

Yeni yayınlanan haberleri sosyal kanallara **otomatik** paylaşan opsiyonel bir adımdır.
**Hiçbir kanal için anahtar girmesen de hat çalışır** — paylaşım sessizce atlanır.

### Nasıl çalışır?

- Toplama akışı bittikten sonra `src/share.js` devreye girer. Ayrıca `npm run share`
  (`src/share-cli.js`) arşivi baştan tarayıp henüz paylaşılmamış haberleri paylaşır.
- Paylaşılan haber `id`'leri **`data/social.json`** dosyasında tutulur. Böylece aynı haber
  ikinci kez paylaşılmaz. Dosya ilk paylaşımda otomatik oluşturulur.
- Paylaşım metni: **başlık + kısa özet + link** (`SITE_URL` + `/haber/{slug}/`).
- Kanal başına bağımsız çalışır: biri hata verirse diğerleri etkilenmez.
- İlk kez anahtar eklediğinde eski arşiv tek seferde paylaşılmasın diye bir çalıştırmada
  en fazla `SHARE_MAX_PER_RUN` (varsayılan 5) haber paylaşılır.

### Desteklenen kanallar ve gereken secret'lar

| Kanal | Ortam değişkenleri | Nereden alınır |
| --- | --- | --- |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Bot: @BotFather · Chat ID: @userinfobot |
| Discord | `DISCORD_WEBHOOK_URL` | Kanal → Integrations → Webhooks |
| Slack | `SLACK_WEBHOOK_URL` | apps.slack.com → Incoming Webhooks |
| Generic webhook (Zapier/Make/IFTTT/n8n) | `SHARE_WEBHOOK_URL` | İlgili serviste webhook oluştur |
| Bluesky | `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` | Settings → App Passwords |
| X / Twitter | `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | developer.x.com (Read+Write izni) |

İsteğe bağlı: `SITE_URL` (link adresi, varsayılan `https://haberai.netlify.app`),
`SHARE_MAX_PER_RUN` (çalıştırma başına paylaşım sayısı).

Generic webhook'a gönderilen gövde:
```json
{ "title": "...", "summary": "...", "url": "...", "category": "...", "image": "..." }
```

### GitHub Actions'ta açmak

Repo → **Settings → Secrets and variables → Actions** bölümünde yukarıdaki değişkenleri
**secret** olarak ekle (yalnızca kullanmak istediğin kanalları eklemen yeterli). Workflow
içindeki "Sosyal paylasim" adımı bu değerleri otomatik geçirir ve `data/social.json`'u da
commit eder.

### Nasıl test edilir?

```powershell
# Arşivi tarar ama HİÇBİR şey paylaşmaz (istek yok, dosya yazılmaz)
npm run share:dry

# Anahtar yoksa: "paylaşım kanalı yapılandırılmadı" der ve temiz çıkar
npm run share
```

> Not: X/Twitter OAuth 1.0a imzası `node:crypto` ile manuel üretilir; anahtarlar
> girilene ve canlı denenene kadar "doğrulanmadı" kabul edilmelidir.

## Dosya Düzeni

```
src/config.js   → kaynaklar ve ayarlar
src/fetcher.js  → RSS çekme + temizleme
src/ai.js       → Gemini özet + yorum + başlık/slug/etiket
src/store.js    → kaydet/yükle + tekrar önleme
src/index.js    → akışı yönetir
src/share.js    → sosyal kanallara paylaşım + tekrar önleme
src/share-cli.js → npm run share (arşivi tarayıp yeni haberleri paylaşır)
data/articles.json → üretilen haberler
data/social.json   → paylaşılan haber id'leri (tekrarı önler)
```
