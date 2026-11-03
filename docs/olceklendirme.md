# Sunucu ve Yayın Ölçeklendirme (ücretsiz)

Bu belge, haber sitesi büyürken **hangi ücretsiz sınırın ne zaman dolacağını**,
hangi önlemlerin kodda hazır olduğunu ve geçişin nasıl yapılacağını anlatır.
Amaç: yeni bir sunucu kiralamadan, yayının kesilmeden büyümesi.

> Ölçüm tarihi: **2 Kasım 2026**. Sayılar her derlemede değişir; güncel değer
> için `npm run butce` çalıştırın veya GitHub Actions özetine bakın.
>
> **Durum (3 Kasım 2026):** Yayın **Cloudflare Pages**'e taşındı
> (`DEPLOY_TARGET=cloudflare`, proje `haberai`). Özel alan adı `haberinai.site`
> ve `www` canlı. GitHub Pages yedek olarak duruyor; artık push edilmiyor.

## 1. Bugünkü durum

| Ölçüm | Değer | Anlamı |
| --- | --- | --- |
| Derleme çıktısı | **9.521 dosya / 823 MB** | Cloudflare 20.000 dosya sınırının %48'i |
| HTML sayfası | 6.485 | Haber + kategori + etiket + sayfalama |
| Yerel kapak | 2.827 | 2.458 webp + 369 sosyal JPEG |
| Kaynak depo | ~945 MB | Git geçmişi; GitHub'ın 1 GB "yumuşak" eşiğine yakın |
| Günlük üretim | 145 haber (değişken) | `GUNLUK_HABER_LIMIT` |
| İndeks çekirdeği | 3.580 haber | 400 günlük pencere + kalite kapısı |

2 Kasım'da yapılan temizlik: **3.100'den fazla küçük/sosyal görsel kopyası** ve
5 ana kapak silindi. Bunlar yalnızca hız için üretilen kopyalardı; eski haberler
artık `wsrv.nl` üzerinden aynı görseli alıyor. Yayın **11.461 → 9.521 dosya**,
**861 MB → 823 MB** indi (aradaki artış yeni haberlerden geliyor).

## 2. Ücretsiz sunucu sınırları

| Sağlayıcı | Depolama | Dosya | Bant genişliği | Not |
| --- | --- | --- | --- | --- |
| **GitHub Pages** | 1 GB | ~10.000 | ~100 GB/ay | Yedek; artık push edilmiyor |
| **Cloudflare Pages** | **Toplam sınır yok** | **20.000** | **Sınırsız** | **Şu an kullanılıyor**; tek dosya 25 MiB; direct upload build kotası yemez |
| **Cloudflare R2** | 10 GB | — | **Egress ücretsiz** | Görselleri siteden ayırmak için |
| **Cloudflare Workers** | — | — | 100.000 istek/gün | İleride dinamik arşiv için |

GitHub Pages'in 1 GB sınırı **sert**, 10.000 dosya sınırı ise pratikte yumuşak.
Yine de 10.000'e yaklaşmak dağıtımın yavaşlamasına ve dosya kırpılmasına yol
açabilir. Bu yüzden hedef **Cloudflare Pages** olmalı.

## 3. Büyüme hesabı (neden hemen geçiş?)

Bir haber kalıcı olarak **1 HTML + 1 ana kapak** ekler; `-480`/`-sosyal`
kopyaları 3 günlük pencerede tutulduğu için sabit kalır. Son ölçümde günlük
artış **~400-500 dosya** (yeni sayfalar + kapak tazeleme). Bu hızda:

| Günlük haber | Ayda eklenen dosya | GitHub 10.000'e | Cloudflare 20.000'e |
| --- | --- | --- | --- |
| 145 | ~9.000-12.000 | **~2 gün** | ~1,5 ay |
| 80 | ~5.000-6.500 | ~4 gün | ~2,5 ay |
| 40 | ~2.500-3.300 | ~8 gün | ~5 ay |

Bu hesap, arşiv sayfalarının silinmediği ve indeks penceresinin 400 gün kaldığı
varsayımıyla yapılmıştır. **Sınırsız büyüme** için üçüncü adım (R2 + eski HTML
arşivi) gerekir; ilk iki adım aylar kazandırır.

> **Öneri:** Kalite stratejisiyle uyumlu olarak `GUNLUK_HABER_LIMIT=40`
> civarında kalmak, ücretsiz katmanlarda yıllık ölçek için en güvenli yoldur.
> 145/gün ile Cloudflare'de bile 2 ayda 20.000 dosya sınırına yaklaşılır.

## 4. Kodda hazır olan önlemler

### 4.1 Kapasite kontrolü

`scripts/yayin-butcesi.mjs` her derlemeden sonra çıktıyı ölçer:

```bash
npm run butce                     # GitHub + Cloudflare karşılaştırması
npm run butce -- --hedef=cloudflare
npm run butce -- --hedef=both --sert   # sert sınır aşılırsa hata kodu
```

Pipeline'da `Yayin butcesi` adımı olarak çalışır; sonuç Actions özet ekranına da
yazılır. GitHub Pages'te dosya sınırı yumuşak olduğu için yalnızca **1 GB**
sert kabul edilir; Cloudflare'de 20.000 dosya ve 25 MiB/dosya serttir.

### 4.2 Küçük/sosyal görsel penceresi

`scripts/kapak-temizle.mjs --varyant-gun=3`:

- **Ana kapak** indeks çekirdeğinde kaldığı sürece korunur.
- **`-480.webp`** ve **`-sosyal.jpg`** yalnızca son 3 günün haberlerinde tutulur.
- Eski haberlerde `imageUrl` / `socialImageUrl` otomatik olarak `wsrv.nl`
  yedeğine düşer; kırık görsel oluşmaz.

### 4.3 Önbellek ve sıkıştırma

`site/public/_headers` (Cloudflare Pages / Netlify):

- HTML: Cloudflare Pages yanıtları her istekte doğrular (`max-age=0,
  must-revalidate`); haber tazeliği için bilinçli tercih.
- `/_astro/*`: 1 yıl, `immutable`.
- `/kapak/*`: 1 gün taze + 7 gün bayat.
- Feed ve site haritaları: 5-60 dk.

Cloudflare Pages Brotli, HTTP/3 ve global anycast CDN'i otomatik verir.

### 4.4 Yayın hedefi seçimi

`.github/workflows/pipeline.yml` içindeki `Yayin hedefi sec` adımı:

| `DEPLOY_TARGET` | Davranış |
| --- | --- |
| tanımsız / `github` | Yalnızca GitHub Pages |
| `both` | GitHub Pages **ve** Cloudflare Pages |
| `cloudflare` | Yalnızca Cloudflare Pages |
| `auto` | Pages tokeni varsa `both`, yoksa `github` |

`both` modunda Cloudflare hatası GitHub yayınını **engellemez**
(`continue-on-error`), böylece haber akışı durmaz.

## 5. Cloudflare Pages'e geçiş (tamamlandı — 3 Kasım 2026)

| Bileşen | Değer |
| --- | --- |
| Proje | `haberai` → `https://haberai.pages.dev` |
| Yayın yöntemi | `wrangler pages deploy` (direct upload, build kotası yemez) |
| GitHub otomatik dağıtımı | **Kapalı** (her push'ta build tetikleyip 500/ay kotayı bitiriyordu) |
| Alan adları | `haberinai.site`, `www.haberinai.site` (Proxied) |
| DNS | `@` ve `www` CNAME → `haberai.pages.dev` |
| `DEPLOY_TARGET` | `cloudflare` (GitHub Pages adımı atlanıyor) |

Mevcut `CLOUDFLARE_API_TOKEN` **yalnızca Workers AI** (kapak üretimi) içindir;
Pages için ayrı `CLOUDFLARE_PAGES_TOKEN` kullanılır.

Adımlar (kayıt için):

1. **Cloudflare → My Profile → API Tokens → Create Token → Custom token.**
   İzinler: `Account` → **Cloudflare Pages** → **Edit** ve
   `Account` → **Account Settings** → **Read**.
2. `gh secret set CLOUDFLARE_PAGES_TOKEN`
3. Proje adı `CLOUDFLARE_PROJECT` değişkeniyle verilir (`haberai`). Workflow ilk
   çalışmada `pages project create` ile projeyi oluşturmayı da dener (idempotent).
4. Geçiş sırasında `DEPLOY_TARGET=both` ile iki hedefe yayınlanır; doğrulandıktan
   sonra `cloudflare` yapılır.
5. **DNS:** `@` ve `www` için `CNAME → haberai.pages.dev`, **Proxied**.
   GitHub Pages A kayıtları (`185.199.108-111.153`) ve
   `www → fruyorsan.github.io` silinir.
6. SSL/TLS modu **Full (strict)** kalabilir; sertifikayı Cloudflare yönetir.
7. GitHub Pages yedek olarak bırakılır (silinmez). Geri dönmek için:

   ```bash
   gh variable set DEPLOY_TARGET --body "both"    # ya da "github"
   ```

> **Dikkat:** `*.pages.dev` bazı ISS'lerde (TR) DNS/SNI ile engellenir. Test için
> özel alan adını kullanın; `pages.dev` adresi çalışmıyor görünebilir.

### Geri alma

- DNS'i Cloudflare Pages'ten GitHub Pages'e geri alın (A kayıtları +
  `www` CNAME).
- `gh variable set DEPLOY_TARGET --body "github"`.
- Hiçbir içerik silinmez; iki hedef de aynı `site/dist` çıktısını kullanır.

## 6. Görselleri R2'ye ayırma (ikinci dalga)

Cloudflare Pages 20.000 dosya sınırına gelindiğinde görselleri siteden ayırmak
gerekir. R2'nin ücretsiz katmanı **10 GB depolama** ve **ücretsiz egress**
verir; 100.000 kapak rahatça sığar.

Planlanan yapı:

```
haberinai.site (Cloudflare Pages)  →  yalnızca HTML/JS/CSS
img.haberinai.site (R2 + Cache)    →  /kapak/*.webp, /kapak/*-sosyal.jpg
```

Adımlar:

1. Cloudflare → R2 → **Create bucket** → `haberinai-gorsel`.
2. Bucket → **Settings → Public access → Custom domain** → `img.haberinai.site`.
3. R2 → **Manage R2 API Tokens** → Object Read & Write, yalnızca bu bucket.
4. GitHub'a ekleyin:

   ```bash
   gh secret set R2_ACCESS_KEY_ID
   gh secret set R2_SECRET_ACCESS_KEY
   gh variable set R2_ACCOUNT_ID  --body "<Cloudflare hesap kimliği>"
   gh variable set R2_BUCKET      --body "haberinai-gorsel"
   gh variable set R2_PUBLIC_URL  --body "https://img.haberinai.site"
   ```

5. Yükleme betiği ve `dist/kapak` temizliği bu belgenin ikinci fazında
   eklenecek. O zamana kadar kapaklar Cloudflare Pages'te kalır.

## 7. İzleme ve bakım

Her hafta:

```bash
npm run butce
```

- **%75**: planlama zamanı.
- **%90**: geçiş/dosya azaltma zamanı.
- **Sert sınır**: pipeline `--sert` ile dağıtımdan önce durur.

Actions özetinde tablo görünür. Anormal artış varsa ilk bakılacak yer
`site/dist/kapak` ve `site/dist/haber` klasörleridir.

## 8. Neden bu mimari?

- **Statik site + CDN** en ucuz ve en hızlı çözümdür; veritabanı/sunucu
  bakımı yoktur.
- **Cloudflare Pages** toplam boyut sınırı koymadığı için 786 MB'lık çıktı
  sorun olmaktan çıkar; bant genişliği ücretsizdir.
- **Görselleri R2'ye ayırmak** dosya sayısını HTML sayısına indirir; yeni
  haberler yalnızca 1 dosya ekler.
- **Kapasite kontrolü** sınırın sessizce aşılmasını engeller; sorun kullanıcıya
  değil, dağıtımdan önce CI'a görünür.
