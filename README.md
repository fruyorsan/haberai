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
  `samsung`, `oyun` (hepsi `when:1h`/`when:2h` pencereli). Google News başlıkları
  `Başlık - Kaynak Adı` biçiminde gelir; `src/fetcher.js` kaynağı başlıktan ayırıp
  `source` alanına yazar.
- **İçerik çeşitliliği (teknoloji/oyun/bilim):** oyun kategorisi tek kaynaktan
  (Merlin'in Kazanı) beş kaynağa çıkarıldı (Oyun Günlüğü, IGN Türkiye, Gamereactor
  Türkiye ×2, GN: Oyun); bilim tarafına Sözcü ve Cumhuriyet bilim-teknoloji
  beslemeleri eklendi. Böylece akışın ilgi çeken konularda malzemesi artar.
  Çalışmayan/ölü beslemeler (Oyungezer, Turuncu Levye, Playerbros, OyunAgacı)
  doğrulanıp **bilinçli olarak eklenmedi**.

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

### Alan adı (haberinai.site)

> **Durum: yayında.** `https://haberinai.site` GitHub Pages'te yayında; HTTPS zorunlu, `www` →
> apex 301. DNS Cloudflare'de (`carla.ns.cloudflare.com`, `dion.ns.cloudflare.com`) ve GitHub
> Actions'ta `SITE_URL=https://haberinai.site` ile `CUSTOM_DOMAIN=haberinai.site` tanımlı.
> Kayıtlar "DNS only" (gri bulut) olmalı — turuncu bulut GitHub'ın sertifikasını engeller.

Kod varsayılanı, sitenin **yayında olduğu** adrestir (`https://fruyorsan.github.io`):
kanonik adresler, RSS, site haritaları ve `robots.txt` buradan üretilir. Özel alan adı
yayına girdiğinde repoda `SITE_URL` değişkeni tanımlanır ve tüm adresler tek adımda ona
döner. CNAME dosyası ise **yalnızca** `CUSTOM_DOMAIN` Actions değişkeni tanımlıysa yazılır —
alan adı DNS'te yayına girmeden CNAME eklenirse GitHub Pages, `fruyorsan.github.io`
adresini çözülemeyen alan adına yönlendirir ve site erişilemez olur.

Kayıt sağlayıcıya girilecek DNS kayıtları:

| Tür | Ad | Değer |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `fruyorsan.github.io` |

**Natro'da bu kayıtlar nereye girilir?** Natro, hosting yoksa A/CNAME kaydı düzenlemeye izin
vermez; bu "Premium/Profesyonel DNS" hizmetine bağlıdır (aylık ~0,10 $, kalan kayıt süresi kadar).
İki yol var:

1. **Tümüyle ücretsiz yol (Cloudflare):** Natro panelinde `DNS Değiştir` ile nameserver'ları
   Cloudflare'in verdiği iki adrese çevir; kayıtları Cloudflare'in DNS ekranından gir. Cloudflare
   kayıtları **"DNS only" (gri bulut)** olmalı — turuncu bulut (proxy), GitHub Pages'in sertifika
   almasını engeller.
2. **Tek panelde kalmak (ücretli):** Natro → Alan Adı Yönetimi → ilgili alan adı →
   **Profesyonel DNS** → Yönet; aynı kayıtları buradan gir.

Her iki yolda da önce park kayıtları silinmeli: `@` için `85.159.66.93` A kaydı ve
`www` için `redirect.natrocdn.com` CNAME'i kalmamalı.

Durum kontrolü ve yayına alma:

```bash
npm run domain              # DNS kayıtlarını ve mevcut durumu yazar
npm run domain -- --acikla   # alan adı çözülüyorsa yayına alır (CNAME + SITE_URL)
```

Geri alma: `gh variable delete CUSTOM_DOMAIN` ve GitHub Pages ayarlarından alan adını kaldır.

#### Tek yayın adresi kuralı (Netlify kapatıldı)

Sitenin **tek** adresi `https://haberinai.site`. `fruyorsan.github.io` adresi GitHub Pages
tarafından otomatik olarak özel alan adına yönlendirilir (301).

Netlify yayını **kaldırıldı** (18.10.2026): `haberai.netlify.app` üzerinde çok eski bir
derleme duruyordu (başlık "HaberAI", `canonical: https://fruyorsan.github.io`) ve Google'da
ikinci bir kopya olarak görünüyordu. Artık:

- `pipeline.yml` içinde Netlify adımı yok (`.github/scripts/netlify-deploy.mjs` silindi),
- `netlify.toml` bir sigortadır: Netlify'a yeniden dağıtım yapılırsa tüm istekler
  `haberinai.site`'e 301 yönlendirilir ve `X-Robots-Tag: noindex` gönderilir,
- `/api/sor` fonksiyonu hiçbir sayfadan çağrılmıyor; kodu `site/netlify/functions/sor.mjs`
  altında duruyor (ileride ücretsiz başka bir sağlayıcıya taşınabilir).

**Panelde yapılacak (tek seferlik, ücretsiz):** Netlify → Sites → ilgili site →
*Site configuration → General → Delete site*. Eski kopya tamamen silinir. Aynı şekilde
Google Search Console'da Netlify mülkü silinir; veriler `https://haberinai.site` mülkünden
izlenir.

### AdSense (reklam)

Reklam kodu ve reklam alanları **yalnızca** yayıncı kimliği tanımlıysa basılır; kimlik
yoksa sitede ne reklam kodu ne de boş reklam kutusu görünür. Onay geldiğinde kod
değişikliği gerekmez, sadece depo değişkenlerini tanımla:

```bash
gh variable set ADSENSE_CLIENT      --body "ca-pub-XXXXXXXXXXXXXXXX"
gh variable set ADSENSE_SLOT_MAKALE  --body "<haber içi birim no>"
gh variable set ADSENSE_SLOT_MAKALE2 --body "<gövde ortası birim no>"
gh variable set ADSENSE_SLOT_LISTE   --body "<liste altı birim no>"
gh workflow run pipeline.yml
```

| Yerleşim | Sayfa | Değişken |
| --- | --- | --- |
| Haber içi 1 (AI yorumundan sonra) | `/haber/<slug>/` | `ADSENSE_SLOT_MAKALE` |
| Gövde ortası ("in-article", 2. paragraftan sonra) | `/haber/<slug>/` | `ADSENSE_SLOT_MAKALE2` |
| Liste altı | ana sayfa + `/haberler/`, `/kategori/…`, `/etiket/…` sayfaları | `ADSENSE_SLOT_LISTE` |
| Haber altı (ilgili haberlerden sonra) | `/haber/<slug>/` | `ADSENSE_SLOT_LISTE` |

`ADSENSE_SLOT_MAKALE2` için panelde **İçerik içi (In-article)** tipinde birim oluştur;
`ADSENSE_SLOT_LISTE` için **Görüntülü (Display)** birim yeterlidir.

`/ads.txt` dosyası da aynı kimlikten üretilir: kimlik tanımlıysa Google kaydı yazılır,
tanımsızsa açıklama satırı kalır. AdSense panelindeki **Otomatik reklamlar** açıksa
kimlik yeterlidir; birim kimlikleri elle yerleşim için gereklidir.

**Çerez izni:** `Base.astro` içinde çerez bildirimi + Google **Consent Mode v2** vardır.
GA4 ve AdSense etiketleri kaynakta her zaman bulunur (AdSense/Search Console doğrulaması
bunları görmek zorundadır), ancak kullanıcı "Kabul et" diyene kadar
`analytics_storage`, `ad_storage`, `ad_user_data` ve `ad_personalization` **denied** kalır:
ölçüm çerezsiz çalışır, reklamlar kişiselleştirilmez. Tercih `localStorage` içindeki
`cerez-onay` anahtarında saklanır ve sayfa yenilendiğinde varsayılan ondan okunur.
Avrupa Birliği trafiği için AdSense panelindeki gizlilik ve ileti mesajlarını da aç.

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
- **Paylaşım aralığı:** kanalın spam görünmemesi için iki paylaşım arasında asgari
  `SHARE_MIN_ARALIK_DK` (varsayılan **25**) dakika beklenir; bu süre açıkken tur başına
  en fazla 1 haber paylaşılır (5 dakikalık hatta karşılığı saatte ~2 paylaşım). Süre
  `data/social.json` içindeki son paylaşım anından (`updatedAt`) hesaplanır.
  Sınırsız paylaşım için `SHARE_MIN_ARALIK_DK=0` ver.

### Desteklenen kanallar ve gereken secret'lar

| Kanal | Ortam değişkenleri | Nereden alınır |
| --- | --- | --- |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Bot: @BotFather · Chat ID: @userinfobot |
| Discord | `DISCORD_WEBHOOK_URL` | Kanal → Integrations → Webhooks |
| Slack | `SLACK_WEBHOOK_URL` | apps.slack.com → Incoming Webhooks |
| Generic webhook (Zapier/Make/IFTTT/n8n) | `SHARE_WEBHOOK_URL` | İlgili serviste webhook oluştur |
| Bluesky | `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` | Settings → App Passwords |
| X / Twitter | `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | developer.x.com (Read+Write izni) |

İsteğe bağlı: `SITE_URL` (link adresi, varsayılan `https://haberinai.site`),
`SHARE_MAX_PER_RUN` (çalıştırma başına paylaşım sayısı),
`SHARE_MIN_ARALIK_DK` (iki paylaşım arası asgari dakika, varsayılan 25).

> **Durum (18.10.2026):** `TELEGRAM_BOT_TOKEN` tanımlı (bot: **@Haberinaibot**).
> Eksik olan tek şey `TELEGRAM_CHAT_ID`: botun paylaşım yapacağı **kanal**.
> Kurulum: Telegram'da herkese açık bir kanal aç (ör. `@haberinai`) → kanal
> ayarları → **Yöneticiler → Yönetici ekle → @Haberinaibot** (mesaj gönderme
> izniyle) → sonra:
> ```powershell
> gh secret set TELEGRAM_CHAT_ID --body "@haberinai" --repo fruyorsan/haberai
> ```
> Kanal herkese açıksa `@kullaniciadi` yeterlidir (sayısal ID gerekmez).
> Böylece her yeni haber otomatik olarak kanala düşer ve oradan siteye trafik akar
> (her gönderiye kanonik haber bağlantısı gider).

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

## Yorumlar (giscus — sunucusuz, reklamsız)

Site tamamen statik (GitHub Pages) ve Netlify kapandığı için yorumları saklayacak
bir arka uç yok. Bu yüzden yorumlar **giscus** ile yapılır: yorumlar deponun
**Discussions** bölümünde tutulur, sayfaya yalnızca bir iframe gömülür. Sunucu,
veritabanı, üyelik ve reklam yoktur.

- Bileşen: `site/src/components/Yorumlar.astro` (ayarlar: `site/src/lib/site-meta.js` → `GISCUS`)
- Haber sayfası: yazının altında tam yorum bölümü (görünür alana yaklaşınca yüklenir).
- Akış (`/akis/`): karttaki 💬 düğmesi **alttan açılan panel**de yorumları gösterir
  (`Akis.astro` → `.ysheet`, tek iframe; 24 kart için 24 iframe kurulmaz).
- Yorum anahtarı: haberin `slug`'ı (`data-mapping="specific"`) — adres değişse de
  tartışma aynı kalır.

**Tek seferlik kurulum (1 tık):** Discussions açıldı (bu repoda açık; kategori
`Announcements`). Kalan adım:
<https://github.com/apps/giscus> → **Install** → `fruyorsan/haberai` seç.
Kurulmadan da site bozulmaz: giscus yüklenemezse kutu gizlenir ve yerine Telegram
paneli gösterilir (`TELEGRAM_URL`).

## IndexNow (Bing/Yandex anında bildirim)

Google'ın aksine Bing ve Yandex, **IndexNow** protokolünü destekler: yeni bir URL
yayınlandığında site bunu tek bir HTTP isteğiyle arama motorlarına haber verir; sitemap
taramasını beklemez. Workflow içindeki **"IndexNow bildirimi"** adımı her turda çalışır
(`continue-on-error: true` — hata hattı durdurmaz).

- Anahtar dosyası: `site/public/<INDEXNOW_KEY>.txt` (içinde anahtarın kendisi yazar).
  Yayındaki adresi `https://haberinai.site/<INDEXNOW_KEY>.txt` olur ve istek
  `keyLocation` alanında bu adresi bildirir.
- Yalnızca **son 3 günde** yayınlanmış, daha önce bildirilmemiş en fazla **40** URL
  gönderilir; eski arşiv site haritasından taranır.
- Tekrarı önlemek için gönderilen haber id'leri `data/indexnow.json`'da tutulur
  (workflow bunu `data/` ile birlikte commit eder).
- İstek başarısız olursa (ağ hatası / 5xx) işaret konmaz, sonraki turda yeniden denenir.

```powershell
npm run indexnow:dry            # ne gönderileceğini yazar, istek atmaz
npm run indexnow                # gerçekten gönderir
node src/indexnow.mjs --tumu    # bir kerelik: tüm arşivi gönderir (pencere + sınır yok)
```

> Not: IndexNow yalnızca Bing/Yandex içindir. Google için tek yol Search Console'da
> property doğrulaması + `sitemap-index.xml` gönderimidir.

## Bildirimler (web push — son dakika + takip edilen konular)

Arama düğmesinin yanındaki **zil düğmesi**. Okuyucu isterse son dakika haberleri ve
takip ettiği konular için bildirim alır; site kapalıyken de bildirim gelir
(service worker + OneSignal).

**Ne zaman bildirim gider?**

| Tür | Kim alır | Sıklık |
| --- | --- | --- |
| Son dakika (`breaking: true`) | Tüm aboneler | Asgari 25 dk arayla, günde en fazla 6 |
| Takip edilen konu (kategori) | Yalnızca o kategoriyi takip edenler | Kategori başına en fazla 3 saatte 1, günde en fazla 3 |

- Gece **23:00–07:00** arasında yalnızca konu bildirimleri durur; son dakika haberleri
  gece de gider (acil gelişme kaçmasın). Toplam günlük tavan 9 bildirimdir.
- "Benzer haberler" bilerek bildirilmez: sayfa içi öneridir, telefonu titretmeye değmez
  ve okuyucu iznini kaybettirir.
- Aynı haber iki kez gönderilmez: gönderilen id'ler `data/bildirim.json`'da tutulur
  (workflow `data/` ile birlikte commit eder).

**Haber sayfasında "Bu kategoriyi takip et"** düğmesi kategori rozetinin yanındadır:
tıklanınca o kategori takip edilir ve ilk kez bildirim izni istenir.

**OneSignal kurulumu (site tarafı tamam):**

| Parça | Nerede | Durum |
| --- | --- | --- |
| App ID | `site/src/lib/site-meta.js` (varsayılan) ya da `gh variable set ONESIGNAL_APP_ID` | ✅ tanımlı |
| REST API Key | `gh secret set ONESIGNAL_REST_API_KEY` (gizli) | ✅ tanımlı — gelmeden hiçbir push **gönderilmez** |
| SDK + init | `site/src/layouts/Base.astro` (`<head>`) | ✅ |
| Service worker | `site/public/OneSignalSDKWorker.js` → `/OneSignalSDKWorker.js` | ✅ |
| Zil + panel + takip | `site/src/components/Bildirim.astro` | ✅ |

- Kurulum dokümanı: <https://documentation.onesignal.com/docs/en/web-sdk-setup>
  (SDK `<head>`'de yüklenir, `appId` ile init edilir; service worker sitede kök).
- OneSignal panelinde **Site URL** tam olarak `https://haberinai.site` olmalıdır.
- **REST API Key** girilene kadar zil/takip çalışır (okuyucu abone olur) ama otomatik
  haber bildirimi gitmez; anahtar girildiği an gönderim başlar.
- **Gizlilik:** `setConsentRequired(true)` ile okuyucu bildirimlere izin verene kadar
  OneSignal veri toplamaz; izin verildiğinde `setConsentGiven(true)` çağrılır.
- Tarayıcı izin penceresi kendiliğinden açılmaz (slidedown kapalı) — yalnızca zil ya da
  "kategoriyi takip et" düğmesine basılınca istenir.
- Safari (macOS 13+) ve iOS 16.4+ VAPID ile çalışır, ek sertifika gerekmez; iPhone'da
  bildirim için site **Ana Ekrana eklenmelidir** (panel bunu okuyucuya yazar).
- **iPhone tuzağı:** iOS'ta web push yalnızca "Ana Ekrana Ekle" ile açılan uygulamada
  çalışır. Akıştaki bildirim istemi iPhone'u tanırsa düğme yerine yolu gösterir
  ("Paylaş → Ana Ekrana Ekle"); Safari sekmesinde basmak sessizce hiçbir şey yapmaz.
- **iPhone için Apple Developer hesabı GEREKMEZ** (OneSignal belgesi: iOS web push
  standart Web Push + VAPID; `.p8` yalnızca yerel iOS uygulaması için). Şartlar:
  iOS 16.4+, HTTPS, service worker, **`display: standalone`** manifest, okuyucunun
  siteyi Ana Ekrana ekleyip **ikonundan** açması ve izni **o uygulamada bir dokunuşla**
  istemesi. Tarayıcı sekmesinde `window.Notification` yoktur → izin istemek imkânsız.
  Manifest `id` alanı bilerek YOK: sonradan eklenirse ikon kimliği değişir ve mevcut
  abonelik düşer (OneSignal: "leave `id` unchanged / leave it out").
  iPhone'da test: ikonu sil → yeniden ekle → ikondan aç → "Bildirimleri aç" → İzin Ver.
  İzin bir kez reddedilirse iOS aynı web uygulaması için tekrar sormaz: ikonu silip
  yeniden eklemek gerekir.
- **Hoş geldin bildirimi:** Okuyucu izni verdiğinde günlük tavan dolmuş olsa bile
  **ilk anda bir kez** "🔔 Bildirimler açıldı" bildirimi gider. Sebep: tavan doluyken
  yeni abone saatlerce sessizlikle karşılaşıp "çalışmıyor" sanıyordu. Günlük tavandan
  ve asgari aralıktan bağımsızdır; `data/bildirim.json` → `hosGeldin` ile yalnızca bir
  kez gönderilir (0 cihaza düşerse işaret konmaz, ilk abonede tekrar denenir).
- **Elle test:** GitHub → Actions → **Bildirim Testi** → *Run workflow*. Tüm abonelere,
  günlük tavanı ve asgari aralığı yok sayarak tek bir test bildirimi gider
  (`BILDIRIM_TEST=1`). Ana hattın kuyruğunda bekleyip iptal olmasın diye ayrı bir
  workflow'dur (`bildirim-test.yml`) ve depoya hiçbir şey yazmaz.
  Yerelde: `$env:BILDIRIM_TEST="1"; npm run bildirim`
- **Günlük teşhis (CI günlüğü):** her turda `abone sayısı: N` ve uygulama satırı yazılır:
  `apns (iOS): kurulu/KURULU DEĞİL | safari_web_id | chrome_web`. iPhone'dan abone
  olunup bildirim gelmiyorsa ilk bakılacak yer `apns (iOS)` alanıdır.
- **"Abone oldum ama bildirim gelmiyor" — en sık sebep:** tarayıcı izni verilmiş ama
  OneSignal aboneliği kurulmamış olabilir. Gönderim yanıtı o zaman
  `{"errors":["All included players are not subscribed"]}` döner (kayıt vardır,
  abonelik yoktur). Site tarafı artık bunu ayırt eder: `Bildirim.astro` yalnızca
  abonelik kimliği (`PushSubscription.id`) oluştuysa "açık" der; tarayıcı izni tek
  başına yeterli sayılmaz (eskiden sayılıyordu → okuyucu "açıldı" görüp hiç bildirim
  almıyordu). Sayfa açılışında izin varsa abonelik bir kez daha kurulmayı dener.
  Ayrıntılı cihaz durumu için: Actions → **Bildirim Testi** → günlükte
  `notification_types` (1 = abone, 0 = izin yok, -1/-2 = kapatılmış).
- **Günlük tavan neden doluyor:** son dakika 6 + konu 3 = 9. Yoğun günlerde öğlene kadar
  dolabilir; bu kasıtlıdır (okuyucuyu boğmamak için). İlk izlenim "hoş geldin"
  bildirimiyle kurtarılır.

**Dosyalar:** `site/src/components/Bildirim.astro` (zil + panel + abonelik),
`site/public/OneSignalSDKWorker.js` (service worker), `site/public/ikon-192.png`
(bildirim ikonu — `npm run ikon` ile üretilir), `src/bildirim.js` (gönderim + kurallar).

**Gizlilik:** OneSignal betiği sayfa açılışında yüklenmez; yalnızca okuyucu zile ya da
takip düğmesine bastığında yüklenir. Tercihler (son dakika / konular) localStorage'da
tutulur, sunucuya yalnızca OneSignal **etiketi** olarak yazılır
(`son_dakika=1`, `kategori_<slug>=1`) — bildirim bu etiketlere göre gönderilir.

```powershell
npm run bildirim:dry     # ne gönderileceğini yazar, istek atmaz
npm run bildirim         # gerçekten gönderir
```

## Shorts Haber (`/akis/`) — kısa kısa haber akışı

Ana sayfa "gazete", **Shorts Haber** "telefon uygulaması" gibi çalışır: dikey kaydırmalı,
tam ekran kartlar (büyük gerçek fotoğraf → vurucu başlık → kısa AI özeti), tek dokunuşla
**beğen / kaydet / paylaş**, çift dokunuşta kalp animasyonu, masaüstünde karta karta
ilerleme (↑/↓, `j`/`k`, `l` beğen, `s` kaydet). Beğeni ve kayıtlar **cihazda** (localStorage)
tutulur; sunucu ve hesap gerekmez.

**Neden bu mimari:** site tamamen statik (GitHub Pages). Statik bir uç nokta sorgu
dizesini (`?offset=`, `?kategori=`) göremez — her istek aynı dosyayı döndürür ve akışta
tekrarlar oluşur. Bu yüzden:

- İlk tur **HTML içinde** 24 haber bağı gerçek `<a>` olarak basılır (taranabilir, hafif).
- Sonsuz kaydırma topları **üretim anında hazırlanan dosyalardan** gelir:
  `/akis/sayfa/0.json`, `/akis/sayfa/24.json`, … (her dosyada 24 kartın hazır HTML'i).
- Kategori akışları ayrı **gerçek adreslerdir**: `/akis/kategori/<slug>/`
  (`noindex, follow`; site haritasına girmez — `/kategori/<slug>/` arşivinin kopyası
  gibi görünmesinler diye). Kategori sayfalarında ilk tur 60 karttır; toplar global
  listeden geldiği için istemci kategori dışı ve tekrar eden kartları ayıklar ve
  görünür kart birikene kadar sıradaki topları okur.
- Kaydırma tetikleyicisi `IntersectionObserver` + `scroll` yedeği; ayrıca her koşulda
  çalışan **"Daha fazla haber"** düğmesi vardır (IO tetiklenmezse akış tıkanmaz).
- Yükleme sırasında "Yükleniyor…" satırı açılıp kapanır; **gözcü (sentinel) öğenin
  kendisi asla `hidden` olmaz** (gizli öğe IntersectionObserver tarafından görülemez).

İlgili dosyalar:

```
site/src/components/Akis.astro        → akış gövdesi (genel + kategori ortak)
site/src/lib/akis-kart.js             → kart şablonu (sunucu ve toplar aynı şablonu kullanır)
site/src/pages/akis/index.astro       → /akis/ (CollectionPage + ItemList şeması)
site/src/pages/akis/kategori/[slug].astro → /akis/kategori/<slug>/ (noindex)
site/src/pages/akis/sayfa/[no].json.js    → /akis/sayfa/<ofset>.json topları
site/src/components/AltMenu.astro     → telefondaki sabit alt gezinme (Shorts merkezde)
site/public/manifest.json             → ana ekrana eklenince doğrudan /akis/ açılır
```

Ayarlar: `AKIS_ILK` (sayfada basılan kart sayısı, varsayılan 24) ve `AKIS_TUR` (top
başına kart, varsayılan 24) `site/src/lib/akis-kart.js` içindedir. Stil `global.css`
sonundadır — **global olması bilinçlidir**: sonsuz kaydırmayla gelen kartlar Astro'nun
bileşen kapsamlı (scoped) stillerini alamaz.

### Akış sırası: ilgi puanı (ne öne çıkar)

Akış **kronolojik değildir**. `site/src/lib/ilgi.js` her habere 0-130 arası bir
**ilgi puanı** verir ve global akış bu puana göre sıralanır:

```
ilgi = kategori ağırlığı + merak/ölçü işaretleri + tazelik + son dakika
       − rutin/kurumsal kalıp cezası
```

- **Kategori ağırlığı:** yapay zekâ/oyun/teknoloji/uzay/donanım önde; gündem/spor
  arkada ama sıfır değil.
- **Merak/ölçü işaretleri:** `rekor`, `ilk kez`, `deprem`, `sel`, `saldırı`, `transfer`,
  `yapay zeka`, `iphone`… (üst sınırlı: tek başına kategori ağırlığını ezmesin).
  Başlıkta sayı/`%` varsa ek puan.
- **Tazelik:** yarı ömrü ~21 saat. Eski ama "ilginç" bir haber, yeni bir yerel haberi
  geçemez; akışın tepesi taze kalır.
- **Ceza:** `belediye`, `tören`, `ziyaret`, `sergi`, `kampanya`, `protokol` gibi rutin
  kalıplar puanı düşürür (akışı dolduran ama merak uyandırmayan başlıklar).
- **Son dakika** rozetli haberler ek puan alır.
- **Gerçek fotoğraf şartı (birincil ölçüt):** kapak güvenlik süzgecinden
  (`lib/kapak.js`) geçen fotoğrafı olmayan haberler, puanı ne olursa olsun listenin
  SONUNA düşer. Aksi halde akışın tepesine "H" harfli yer tutucu kart çıkıyordu
  (fotoğrafı elenen bir haber ilgi puanı yüksek olduğu için ilk sıralara oturuyordu).
  Bu haberler silinmez; arşivde, kendi kategori sayfasında ve haberin kendi
  sayfasında kalır. `kapakliOneSirala()` aynı kuralı kronolojik kategori
  akışlarına uygular (grup içinde sıra korunur). Kart üzerinde marka/harf yer
  tutucusu GÖSTERİLMEZ.

Sıralama **deterministiktir** (rastgelelik yok): `/akis/` gövdesi ile
`/akis/sayfa/<ofset>.json` topları aynı fonksiyonu kullandığı için sonsuz kaydırmada
kart tekrarı ya da sıra kayması olmaz. Kategori akışları (`/akis/kategori/<slug>/`)
kendi içinde kronolojik kalır (yalnızca fotoğraflı/fotoğrafsız gruplaması uygulanır).

> Neden: akış eskiden "en yeni" sırasındaydı ve belediye/tören/sergi gibi rutin yerel
> haberler teknoloji, oyun ve merak uyandıran konuları gölgeliyordu.

### "Sana özel" düğmesi

Akış satırının sağındaki **✨ Sana özel** düğmesi, yüklü kartları **beğendiğin
kategorilere göre** yeniden dizer (ilgi puanı + beğenilen kategorinin beğeni sayısı × 9).
Böylece akış, okurun kendi tercihlerinden öğrenir; kapattığında sunucu sırasına
dönülür (`data-siraKaydi` ile saklanır). Veri cihazda kalır, sunucuya hiçbir şey
gönderilmez. (Sıralama yalnızca düğmeye basıldığında uygulanır; kaydırma sırasında
kartlar zıplamaz.)

### "Gördün" hafızası (taze haber önce)

Bir kez gördüğün (ya da beğendiğin/kaydettiğin) haber **bir sonraki ziyarette akışın
tepesinde durmaz**: açılışta görülmemişler öne, görülenler alta alınır (grup içinde
sunucu sırası korunur). Kart görselinin sol üstünde küçük **✓ gördün** rozeti çıkar ve
görsel hafifçe soluklaşır — böylece sıralamanın neden değiştiği anlaşılır.

- Kayıt: `localStorage` → `akis-gorulen` (son 400 slug, cihazda kalır, sunucuya gitmez).
- Bir kart ekranın %60'ından fazlası görününce "görüldü" sayılır (IntersectionObserver);
  beğen/kaydet düğmeleri de anında işaretler.
- Sıralama **yalnızca açılışta** uygulanır (kaydırma sırasında içerik parmağın altından
  kaymasın). ✨ *Sana özel* açıksa dokunulmaz; o okuyucunun kendi seçimidir.

### 🔥 İlgi rozeti (kronolojik listelerde)

`lib/ilgi.js` rozeti **yalnızca akış dışındaki kronolojik listelerde** (ana sayfa,
kategori, tüm haberler, arama) ve **yalnızca "beklenmedik" haberlerde** gösterir:
puan tüm arşivin en üst %8'inde **ve** kategori zaten ilgi çekici değilse (`kategori
ağırlığı < 20`). Böylece teknoloji/oyun sayfalarında her kart işaretlenmez; gündem
akışından sıyrılan gerçekten ilginç haberler görünür olur. /akis/ akışında rozet
kullanılmaz — orada liste zaten ilgi sırasındadır, 24 kartın 24'ünü işaretlemek
anlamsız olurdu. Üretim: `site/src/components/ArticleCard.astro` (`.card__fire`),
"son dakika" rozetiyle aynı köşeyi paylaşır ama ikisi aynı anda görünmez.

### Üst menü düzeni (kalabalığı önleme)

Üst üste benzer satırlar menüyü karıştırdığı için şu kurallar uygulanır:

- Üst menü (`.nav`) **5 sade sekmedir**: Ana Sayfa · **Shorts** · Son Dakika · Piyasa ·
  Tüm Haberler. Özel dolgu/rozet yok; yalnızca Shorts'un oynatma ikonu ve marka rengi
  vardır (vurgu için alttaki sabit menü ve ana sayfa bandı kullanılır). "Yapay Zeka"
  sekmesi kaldırıldı: aynı bağlantı kategori şeridinde zaten var.
- **Telefonda (≤720px) üst menü gizlenir**: aynı işi sabit alt menü (Anasayfa · Shorts ·
  Son Dakika · Piyasa · Ara) ve kategori şeridi yapıyor. Böylece üstte üst üste iki
  kaydırma satırı kalmaz.
- **Shorts sayfaları global kategori şeridini kapatır** (`<Base kategoriSeridi={false}>`);
  akış kendi tek satırını taşır: solda kategori çipleri (kayar), sağda süzgeçler.
- Süzgeçler telefonda ikona iner; **seçili süzgece tekrar basmak süzgeci kaldırır**
  (ayrı "Tümü" düğmesi yok).

## Fotoğraflar (kapak güvenliği + haber içi ek fotoğraflar)

Kaynak sitelerin RSS/haber sayfalarındaki görseller her zaman doğru olmuyor; yanlış
fotoğraf göstermek okuyucu güvenini sarsıyor. Bu yüzden iki katmanlı bir süzgeç var:

**1) Kapak görseli (`site/src/lib/kapak.js`).** Bir görsel şu durumlarda gösterilmez:

- Dosya adı yer tutucu desenindeyse (`habergorseli…`, `default`, `placeholder`, `no-image`…).
  Örnek: Sözcü'nün aynı `habergorseli….png` dosyasını 30+ habere kapak yapması.
- Aynı görsel arşivde **5'ten çok** habere kapak olmuşsa (sitelerin "genel haber görseli").
- Dosya adı haberin kendi başlığı/adresiyle hiç örtüşmüyorsa: RSS bazen komşu bir haberin
  fotoğrafını veriyor (ör. "İbrahim Sadri'nin gösterisi" haberinde Kerem Görsev konserinin
  fotoğrafı). Karşılaştırma Türkçe ekleri tolere eder ("beykozdaki" ≈ "beykozda").

Eleme kararı verilen yerde sırayla şunlar denenir: habere toplanmış **doğrulanmış ek
fotoğraf** → markalı kapak (`/og-default.png`). Böylece sitede hiçbir yerde yanlış/genel
fotoğraf görünmez. Aynı süzgeç kartlarda, vitrinde, "Okumaya Devam Et" zincirinde, arama
sonuçlarında ve `og:image` etiketinde de uygulanır.

**2) Haber içi ek fotoğraflar (`src/ek-gorsel.mjs`).** Haber sayfasında okurken metnin
arasında 1-2 gerçek fotoğraf görünür (kaynak atıflı). Fotoğraf yalnızca "aynı haber"
olduğu kanıtlanabilen adaylardan seçilir: aynı kök alan adı **ve** kapak/kaynak adresle
ayırt edici sözcük ya da haber kimliği paylaşımı. Ayrıca arşivde başka bir haberin kapağı
veya ek fotoğrafı olan görseller hiç eklenmez (yan sütundaki "diğer haberler" küçük
resimleri tam da bu yüzden yanlış olur). Kanıt yoksa ek fotoğraf eklenmez.

```powershell
npm run ek-gorsel:dry      # hangi haberlere bakılacağını listeler
npm run ek-gorsel          # gerçekten tarar (EK_GORSEL_LIMIT kadar haber)
$env:EK_GORSEL_LIMIT="40"; $env:EK_GORSEL_KAYNAK="tamindir"; node src/ek-gorsel.mjs --debug
```

- Veri alanları: `images` (ek fotoğraf adresleri) ve `imagesAt` (bu haber tarandı).
- Tarama **Arsiv Yenileme** workflow'unda saatte bir çalışır (`EK_GORSEL_LIMIT=40`);
  bakılan haber `imagesAt` ile işaretlenir, bir daha indirilmez. Sayfa hiç açılamazsa
  işaret konmaz ve sonraki turda yeniden denenir.
- Site tarafı bu fotoğrafları 1. paragraftan sonra ve gövdenin ortasına doğru gösterir;
  fotoğraf yüklenemezse figür tamamen kaldırılır (sayfa bozulmaz).

## Hız (performans) notları

Site 0 $ bütçeyle GitHub Pages'te durduğu için ölçüm ve kazanç elle yapılır. Ölçüm:
uç noktaların gerçek boyutu + sayfadaki istek listesi (bkz. `hiz` ölçüm betikleri).

- **gtag.js (Google Analytics) ertelenir.** Etiketin kendisi ~500 KB'lık bir indirmedir
  ve mobilde ilk boyama için yarışır. Bu yüzden yalnızca sayfa tamamen yüklendikten
  **1,2 saniye sonra** ya da okur sayfayla ilk kez etkileşince (dokunma/tuş/kaydırma)
  indirilir. Consent Mode ve olay komutları kuyrukta bekler (`dataLayer`); betik
  geldiğinde işlenir. Bedeli: 1,2 saniyeden kısa süren oturumlar ölçülmez — bilinçli
  tercih. Kod: `site/src/layouts/Base.astro`.
- **Responsive görseller (`srcset`).** Görseller ücretsiz görsel CDN'inden (wsrv.nl)
  geçer. `imageSrcset(src, [400, 720])` ile telefon 1x ekranlar 400 px alır (720 px
  yerine, ~%60 küçük dosya), 2x/3x ekranlar yine 720 px'e düşer — yani hiçbir durumda
  daha büyük dosya indirilmez. Küçük genişliklerde kalite otomatik düşer (q66).
  - Akış kartı: `sizes="(max-width:720px) 100vw, 380px"`
  - Liste kartı: `(max-width:600px) 96vw, (max-width:1000px) 48vw, 380px`
  - Haber/vitrin görseli: `(max-width:900px) 100vw, 1100px`
- **LCP ön yüklemesi srcset ile eşleşir.** `Base.astro` preload bağlantısına
  `imagesrcset`/`imagesizes` geçer; aksi halde tarayıcı hem ön yüklediği hem de
  `<img>` için seçtiği fotoğrafı indirir (biri boşa gider).
- **Arama sonuçları ham fotoğraf göstermez.** `/search-index.json` yalnızca ham adresi
  taşır (dosya küçük kalsın); `/ara/` sayfası görseli istemcide 480 px'e küçültür
  (`gorselUrl()`). Önceden 1 MB'a kadar fotoğraf inebiliyordu.
- **Tembel yükleme:** akışın ilk kartı `fetchpriority="high"` (LCP), kalanı
  `loading="lazy"`; liste kartları lazy + `decoding="async"`.
- **Görsel kurtarma `srcset` ile uyumlu:** görsel CDN'i getiremezse kaynak adrese
  düşülür. Ancak `srcset` niteliği dururken `src` değiştirmek görüntüyü değiştirmez;
  bu yüzden `onerror` önce `srcset`/`sizes` niteliklerini kaldırır. Aksi halde
  "kurtarma" sessizce başarısız olur ve kart markalı zeminde kalırdı.
- **Kart içi reklam görünür kartla hizalanır:** akışta süzgeç uygulanınca görünür
  kart sayısı değişir; `reklamiYerlestir()` reklamı yeniden 8. **görünür** kartın
  altına taşır (gizli kartların ardında kalıp akışın ortasında yüzmez).

## Veri Şeması (`data/articles.json`)

Her haber nesnesi şu alanları taşır: `id`, `title`, `slug`, `summary`, `keyPoints`, `body`,
`comment`, `editorNote`, `tags`, `category`, `source`, `sourceUrl`, `image`, `publishedAt`,
`generatedAt` (yeniden üretilenlerde ayrıca `refreshedAt`). **Son dakika** tespit edilen
haberlerde ek olarak `breaking: true` bulunur (diğerlerinde alan yoktur).

- `summary`: nötr özet — sadece "ne oldu".
- `comment`: editör yorumu — "neden önemli, kimi etkiler, ne olabilir". İstem
  (`src/ai.js`) beş adımlı bir yazım planı izler: kesin yargı → kaynaktan somut öğe →
  kime etki → en az bir karşılaştırma/ölçü/senaryo → (varsa) risk-fırsat. Ayrıca
  kategoriye özel **analiz ekseni** verilir (`ANALIZ_ACISI`): oyun → fiyat, platform,
  çıkış tarihi, donanım gereksinimi; mobil → fiyat/performans, batarya, yazılım destek
  süresi. Kaynakta sayı/tarih varsa yorum bunlardan en az birini kullanmak zorundadır;
  kaynakta olmayan sayı/isim/tarih yazılmaz.
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
src/indexnow.mjs → Bing/Yandex'e IndexNow bildirimi (yeni URL'ler)
data/articles.json → üretilen haberler
data/social.json   → paylaşılan haber id'leri (tekrarı önler)
data/indexnow.json → IndexNow'a bildirilen haber id'leri (tekrarı önler)
```
