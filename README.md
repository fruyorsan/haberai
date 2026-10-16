# HaberinAi — Haber Toplama + AI Hattı

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

# Arşiv yenileme: gövdesi veya editorNote'u eksik eski haberleri yeniden üretir
npm run backfill
npm run backfill:dry          # AI çağrısı yapmadan sadece listeler
BACKFILL_LIMIT=20 npm run backfill   # tur başına işlenecek haber sayısı
```

## Ayarlar

Tüm ayarlar `src/config.js` içinde:

- `feeds` → kaynak RSS adresleri (ekle/çıkar). `fast: true` işaretli olanlar
  "son dakika şeridi" (hızlı) kaynaklarıdır.
- `maxPerRun` → bir çalıştırmada işlenecek **normal** haber sayısı
- `maxAgeHours` → bundan eski haberleri atla
- `model` → Gemini modeli

## Son dakika (hızlı şerit)

Amaç: yeni çıkan önemli/bomba haberleri normal akıştan **önce** yakalayıp işlemek.
Bu, `src/breaking.js` + `src/index.js` + `src/config.js` birlikte çalışır.

### Bir haber ne zaman "son dakika" sayılır?

`isBreaking()` (bkz. `src/breaking.js`) şu iki koşulu birlikte arar:

1. **Tazelik:** yayın zamanı `BREAKING_WINDOW_MIN` (varsayılan **120 dakika**) içinde, ve
2. **Sinyal:** kaynak `fast: true` (hızlı şerit) **veya** başlıkta son dakika sinyali
   (`son dakika`, `az önce`, `duyurdu`, `tanıttı`, `ilk kez`, `şimdi`, `canlı`,
   `rekor`, `kaza`, `deprem`, `istifa`, `vefat`, `hayatını kaybetti`, `açıkladı` …).

Her aday için `breakingScore()` ile bir öncelik puanı hesaplanır (tazelik + fast
kaynak + anahtar kelime) ve son dakika adayları bu puana göre öne alınır.

### Nasıl seçilir ve kota

- Seçim sırası: **önce son dakika adayları** (puan/yenilik sırası), **sonra normal adaylar**
  (tazelik sırası).
- Kota: bir turda en fazla `maxBreakingPerRun` (varsayılan **2**) son dakika **+**
  `maxPerRun` (varsayılan **2**) normal haber işlenir → son dakika varsa tur başına en
  fazla **4** haber. Son dakika yoksa davranış eskisi gibi kalır (**2**).
- Son dakika haberlerinde `maxPerSource` sınırı uygulanmaz: aynı kaynaktan iki son
  dakika haber geçebilir. Normal haberlerde kaynak çeşitliliği korunur.
- Kaydedilen son dakika haberlerine `data/articles.json` içinde **`"breaking": true`**
  alanı eklenir; diğer haberlerde bu alan hiç bulunmaz.

### Hızlı kaynaklar

- **`fast: true` işaretli editöryel kaynaklar:** NTV Son Dakika, TRT Haber Son Dakika,
  AA Güncel, Haber Global, Webtekno, ShiftDelete, DonanımHaber.
- **Google News RSS hızlı sorguları** (olayı dakikalar içinde indeksler):
  `son dakika`, `teknoloji`, `tesla`, `elon musk`, `yapay zeka`, `deprem`, `apple`,
  `samsung` (hepsi `when:1h`/`when:2h` pencereli). Google News başlıkları
  `Başlık - Kaynak Adı` biçiminde gelir; `src/fetcher.js` kaynağı başlıktan ayırıp
  `source` alanına yazar.

### Kalite süzgeci

Google News sorguları arada "SEO çöpü" sitelerden toplama başlıklar getiriyor
(ör. *"… haberi. Son Dakika Güncel haber başlıkları ve gelişmeler"*). Bu tür
başlıklar `src/kalite.js` içindeki `looksLikeSpamTitle()` ile **daha hatta
girmeden** elenir: kalıp eşleşmeleri, 140+ karakter, ayraç/soru işareti yığını,
tamamı büyük harf ve kelime tekrarı. Aynı süzgeç `isBreaking()` içinde de
uygulanır; yani son dakika şeridine çöp başlık düşemez.

### Ayarlar

| Ortam değişkeni | Varsayılan | Açıklama |
| --- | --- | --- |
| `MAX_BREAKING_PER_RUN` | `2` | Tur başına ekstra son dakika kotası |
| `BREAKING_WINDOW_MIN` | `120` | "Son dakika" sayılma penceresi (dakika) |
| `MAX_PER_RUN` | `2` | Tur başına normal haber kotası |


## Otomasyon

`.github/workflows/pipeline.yml` her 5 dakikada bir çalışır. GitHub'da repo ayarlarından
`GEMINI_API_KEY` adında bir **secret** eklemen yeterli.

### Arşiv yenileme

`.github/workflows/backfill.yml` her 10 dakikada bir, gövdesi veya `editorNote` alanı eksik
olan eski haberleri otomatik yeniler (tur başına `BACKFILL_LIMIT=4` haber). Eski haberler
için beklemeden başlatmak istersen: GitHub → **Actions** → **Arsiv Yenileme** →
**Run workflow**. Workflow `data/` değişikliklerini commit edip siteyi yeniden yayınlar.

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

İsteğe bağlı: `SITE_URL` (link adresi, varsayılan `https://fruyorsan.github.io`),
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

## Veri Şeması (`data/articles.json`)

Her haber nesnesi şu alanları taşır: `id`, `title`, `slug`, `summary`, `keyPoints`, `body`,
`comment`, `editorNote`, `tags`, `category`, `source`, `sourceUrl`, `image`, `publishedAt`,
`generatedAt` (yeniden üretilenlerde ayrıca `refreshedAt`). **Son dakika** tespit edilen
haberlerde ek olarak `breaking: true` bulunur (diğerlerinde alan yoktur).

- `summary`: nötr özet — sadece "ne oldu".
- `comment`: editör yorumu — "neden önemli, kimi etkiler, ne olabilir".
- `editorNote`: ana sayfadaki **"öne çıkanlar" slaytı** için kısa manşet notu. Türkçe,
  1-2 cümle (en fazla ~180 karakter); `summary`/`comment` ile aynı cümleleri kullanmaz,
  farklı bir açıdan "neden bakmalısın" sorusuna cevap verir. Yeni haberlerde AI üretir;
  eski haberlerde eksikse arşiv yenileme (`npm run backfill`) tamamlar — alan zaten
  doluysa haber yeniden üretilmez (idempotent).

## Dosya Düzeni

```
src/config.js   → kaynaklar ve ayarlar
src/fetcher.js  → RSS çekme + temizleme
src/breaking.js → son dakika tespiti + öncelik puanı
src/ai.js       → Gemini özet + yorum + başlık/slug/etiket
src/store.js    → kaydet/yükle + tekrar önleme
src/index.js    → akışı yönetir
src/share.js    → sosyal kanallara paylaşım + tekrar önleme
src/share-cli.js → npm run share (arşivi tarayıp yeni haberleri paylaşır)
data/articles.json → üretilen haberler
data/social.json   → paylaşılan haber id'leri (tekrarı önler)
```
