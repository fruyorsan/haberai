# Görsel Ajanı

Haber kapaklarını **başlık ve içeriğe göre** seçen, gerekirse habere özel konsept
görsel üreten katman. Amaç, akışta "bu ne alaka?" dedirten stok kareleri,
yayıncının kendi haber kartını ve rastgele ürün fotoğraflarını ortadan kaldırmak.

- Modül: `src/gorsel-ajan.js`
- CLI: `scripts/gorsel-ajan.mjs`
- Ajan tanımı: `.opencode/agents/gorsel.md`
- Site rozeti: `site/src/pages/haber/[slug].astro` (`kapak.ai === true`)

## Neden ayrı bir ajan?

Eski akış iki kötü uç arasında sıkışıyordu:

1. **Kaynak sitenin og:image'i.** ShiftDelete gibi siteler haber kartı, başlık
   plakası veya ürün tanıtım görseli koyuyor; bunlar kapak olunca haberle
   alakasız görünüyor.
2. **Dosya adı eşleşen ilk Commons karesi.** "telefon" geçen habere eski bir
   telefon müzesi fotoğrafı, "savaş" geçen habere harita düşebiliyordu.

Yeni ajan önce **ne anlatılması gerektiğini** çıkarır, sonra adayları **görerek**
puanlar. Sezgisel puan yalnızca ön eleme içindir; kapak değiştirmek için vision
onayı zorunludur.

## Akış

```
haber (başlık + özet + gövde)
        │
        ▼
1. BRİF (src/ai.js → gorselBrifi)
   "tek karede ne görünmeli" + İngilizce arama sorguları + üretim promptu
        │
        ▼
2. ADAYLAR (src/gorsel-ajan.js → adaylariTopla)
   Wikimedia Commons + Openverse (yalnızca CC0 / kamu malı / CC BY / CC BY-SA)
   + arşivdeki serbest lisanslı gorselEk / gorselKaynak dosyası
   + mevcut kapak (yalnızca karşılaştırma için)
        │
        ▼
3. ÖN ELEME (adaylariDegerlendir)
   indir → boyut/oran → yazılı kart tespiti → parlaklık/renk/çözünürlük puanı
   → en iyi 4 aday
        │
        ▼
4. GÖZ KONTROLÜ (visionSkorla)
   Gemini vision (çoklu görsel) → yoksa Cloudflare Workers AI vision (tek tek)
   alaka %55 + dikkat %30 + kalite %15
        │
        ▼
5. ÜRETİM (gorselUret) — yalnızca gerekirse
   Cloudflare Workers AI (flux-1-schnell / leonardo) → üretilen kareyi de
   vision ile denetle
        │
        ▼
6. KIRP + KAYDET (kapakYaz)
   1280×720 WebP + 480 px kart + 1200×630 sosyal JPEG
```

### 1. Brif

`gorselBrifi(article)` AI'dan şu JSON'u ister:

```json
{
  "sahne": "Akşam odasında elinde telefon tutan 13-15 yaşında bir çocuk...",
  "ozne": "genç ve telefon",
  "nesneler": ["telefon", "yatak odası", "ekran ışığı"],
  "sorgular": ["teenager using smartphone", "child scrolling social media phone"],
  "kacin": ["logo", "metin", "kolaj", "stok ofis toplantısı"],
  "tip": "foto",
  "prompt": "Photorealistic editorial news photograph of ... 35mm, natural light, 16:9 ..."
}
```

Kurallar:

- Somut sahne zorunlu; "teknoloji", "gelecek", "inovasyon" gibi soyut sözcükler
  yasak.
- Haberin ana konusu tek karede anlatılır; ikincil ayrıntıya sapılmaz.
- İnsan varsa yaş/rol ve eylem belirtilir; sırtı dönük, yüzsüz karelerden
  kaçınılır.
- Marka/kişi adı uydurulmaz; Türkiye bağlamı varsa sahneye yansıtılır.

AI sağlayıcısı yoksa `gorselBrifiYedek(article)` devreye girer: başlık,
`gorselSorgu` ve etiketlerden güvenli bir brif üretir. Bu durumda ajan yine
çalışır ama kapak değiştirmek için vision gerekir.

### 2. Adaylar

| Kaynak | Lisans filtresi | Not |
| --- | --- | --- |
| Wikimedia Commons | CC0, kamu malı, CC BY, CC BY-SA | `filetype:bitmap`, min 700×350, oran 1.15–2.8 |
| Openverse | `cc0,by,by-sa` | `size=large`, `aspect_ratio=wide`, `mature=false` |
| Arşiv (`gorselEk`) | CC0, kamu malı, CC BY, CC BY-SA | Habere daha önce eklenmiş, altyazısı bağlanmış kareler |
| Arşiv (`gorselKaynak`) | Commons dosyasıysa | Tasarım kartının altındaki gerçek fotoğraf |
| Mevcut kapak | — | Yalnızca "yeni aday gerçekten daha iyi mi?" karşılaştırması |

**Kaynak sitenin kendi fotoğrafları aday yapılmaz.** İki nedeni var:

1. Ajans telifli olabiliyorlar (AA, Getty, Reuters, DHA...); atıf yazmak yasal
   hâle getirmez.
2. Kullanıcının şikâyet ettiği "ShiftDelete'in kendi haber kartı" sorununun
   kaynağı tam olarak bu görsellerdi.

Aynı görselin farklı boyut kopyaları `kimlik(url)` ile eşleştirilir; arşivde
başka habere kapak olmuş kareler `kullanilan` kümesiyle elenir.

### 3. Ön eleme

`gorselPuani` 0–100 arası sezgisel kalite puanı verir:

- kontrast (standart sapma) ve detay,
- parlaklık dengesi (aşırı karanlık/aydınlık elenir),
- çözünürlük,
- 16:9'a yakınlık,
- renk doygunluğu.

Ayrıca `metinKartiMi` kırmızı/beyaz başlık plakalı yayıncı kartlarını yakalar.
Bu puan yalnızca **ön eleme**dir; nihai karar vision'ındır.

### 4. Göz kontrolü

`visionSkorla` önce Gemini'yi dener (`config.ai.geminiModels`), yoksa Cloudflare
Workers AI vision'ı (`@cf/meta/llama-3.2-11b-vision-instruct`) kullanır.

> **Cloudflare vision ilk kullanım:** Workers AI, Llama vision modeli için lisans
> onayı ister. Model bir kez `403 Model Agreement` dönerse Cloudflare panelinden
> (AI → Workers AI → model sayfası) koşulları kabul edin. Onaydan sonra aynı
> hesap modeli kullanabilir. Ücretsiz planda günlük neuron kotası vardır; kota
> bitince vision ve üretim `429` döner, ajan o gün kapak değiştirmez.
>
> **Gemini ücretsiz plan:** Model başına günde ~20 istek. Birden fazla model
> tanımlıysa ajan sırayla dener; biri `429` dönerse sonraki modele geçer.
> `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3` (veya virgülle ayrılmış liste) tanımlıysa
> aynı model her anahtarla ayrı ayrı denenir; kotayı anahtar sayısı çarpar.
> Bu yüzden `GORSEL_AJAN_LIMIT` varsayılanı düşük tutulur (3) ve brifler önce
> Groq'a gider; Gemini kotası vision'a kalır. Anahtarlar loglara basılmaz,
> yalnızca `#1`, `#2` sıra numarası görünür.

| Ölçüt | Ağırlık | Anlamı |
| --- | --- | --- |
| `alaka` | %55 | Görsel haberin ana konusunu doğrudan anlatıyor mu? |
| `dikkat` | %30 | Okuyucu akışta bu kareye tıklamak ister mi? |
| `kalite` | %15 | Kompozisyon, ışık, netlik; yazı/logo/kolaj cezası |

`uygun: false` olan aday asla seçilmez. Vision sağlayıcısı yoksa **kapak
değiştirilmez**; sezgisel puana göre alakasız kare seçmek bilinçli olarak
engellenmiştir.

Seçim eşiği: arama/arşiv adayı için `alaka >= 60` **ve** `skor >= 62`. Mevcut
kapak 66 puanın üzerindeyse yeni aday ondan en az +5 puan yüksek olmalıdır.
AI üretimi için de `alaka >= 60`, `kalite >= 50`, `skor >= 62` ve mevcut/seçili
adaydan en az +4 puan şartı aranır. Böylece "genel atmosfer" diye yüksek puan
alan alakasız kareler ve filigran/bozuk yazı taşıyan üretimler elenir.

### 5. Üretim

Arama sonucu yoksa ya da en iyi aday 70 puanın altındaysa konsept görsel
üretilir:

- `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` varsa sırayla
  `@cf/black-forest-labs/flux-1-schnell`, `@cf/leonardo/phoenix-1.0`,
  `@cf/leonardo/lucid-origin`.
- `GORSEL_POLLINATIONS=1` ise ücretsiz yedek olarak Pollinations denenir
  (varsayılan kapalı; servis sık sık 503 döndürüyor).

Üretilen görsel de vision'dan geçer. Mevcut iyi kapaktan veya arama adayından
**anlamlı biçimde** (en az +4 puan) yüksek değilse seçilmez; iyi kapak riske
atılmaz. Prompt'a her zaman "no text, no words, no letters, no numbers, no
logos, no watermark, no collage" eklenir.

### 6. Kaydetme

- `site/public/kapak/<id>.webp` — 1280×720, quality 86
- `site/public/kapak/<id>-480.webp` — 480 px kart
- `site/public/kapak/<id>-sosyal.jpg` — 1200×630, quality 80

`data/articles.json` alanları:

```json
{
  "image": "/kapak/<id>.webp",
  "kapak": {
    "v": 3,
    "kaynak": "https://commons.wikimedia.org/... veya ai:flux-1-schnell",
    "foto": true,
    "ai": true,
    "ajan": {
      "v": 1,
      "secim": "commons | openverse | ai",
      "skor": 84,
      "neden": "kısa gerekçe",
      "brif": "ideal sahne",
      "sorgular": ["..."],
      "model": "flux-1-schnell",
      "tarih": "2026-11-01T..."
    }
  },
  "gorselKaynak": {
    "yazar": "Fotoğrafçı veya haberinai görsel ajanı",
    "lisans": "CC BY-SA 4.0 veya AI üretimi",
    "lisansUrl": "https://...",
    "sayfa": "https://commons.wikimedia.org/wiki/File:..."
  },
  "gorselAjan": {
    "tarih": "2026-11-01T...",
    "sonuc": "degisti | atlandi | hata",
    "neden": "..."
  }
}
```

`kapak.ajan` işareti, diğer kapak betiklerinin (`--taze`, `--stokkaynak`) bu
kapağı ezmemesini sağlar. `gorselAjan` ise başarısız hedefin 12 saat boyunca
yeniden denenmemesini sağlar.

## CLI

```powershell
# Hedefleri listele (AI çağırmaz, hiçbir şey yazmaz)
npm run gorsel-ajan:dry

# Gerçek tur: en fazla 3 hedef
npm run gorsel-ajan

# Daha geniş tur
node scripts/gorsel-ajan.mjs --limit=6 --gun=4 --debug

# Tek haberi zorla yenile
node scripts/gorsel-ajan.mjs --id=<haber-id> --zorla --debug

# Tüm arşiv (günlük AI bütçesi yine geçerli)
node scripts/gorsel-ajan.mjs --gun=0 --limit=0
```

### Hedef önceliği

| Öncelik | Durum | Neden |
| --- | --- | --- |
| 0 | `kapak.foto === false` | Tasarım kartı; fotoğraf yok |
| 1 | `kapak.kaynak` uzak adres | Kaynak sitenin og:image'inden üretilmiş |
| 2 | `kapak` yok / uzak `image` | Henüz işlenmemiş |
| 3 | Yerel ama ajansız kapak | Eski kapak |
| 9 | `kapak.ajan` var | Varsayılan olarak atlanır (`--zorla` ile işlenir) |

Sıralama: öncelik, sonra yayın tarihi (yeniden eskiye).

### Günlük AI bütçesi

`data/gorsel-ajan-durum.json`:

```json
{ "gun": "2026-11-01", "ai": 37, "guncel": "2026-11-01T12:34:56.000Z" }
```

- Gün değişince sayaç sıfırlanır.
- Bir hedefe en az **2 birim** gerekir (brif + vision); tek birim kaldıysa tur
  boşa harcanmadan bitirilir.
- Bütçe bitince mevcut kapaklara dokunulmaz.

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `GORSEL_AJAN_LIMIT` | `3` | Tur başına en fazla hedef |
| `GORSEL_AJAN_GUN` | `3` | Geriye dönük gün penceresi (`0` = tümü) |
| `GORSEL_GUNLUK_AI` | `120` | Günlük en fazla AI çağrısı |
| `GORSEL_URETIM` | açık | `0` = AI görsel üretimini kapat |
| `GORSEL_TEKRAR_SAAT` | `12` | Başarısız hedefi yeniden denemeden önce bekleme |
| `GORSEL_POLLINATIONS` | kapalı | `1` = Pollinations yedeğini de dene |
| `CLOUDFLARE_ACCOUNT_ID` | — | Workers AI vision + üretim |
| `CLOUDFLARE_API_TOKEN` | — | Workers AI yetkili token |
| `CLOUDFLARE_VISION_MODEL` | `@cf/meta/llama-3.2-11b-vision-instruct` | Vision modeli |
| `GEMINI_API_KEY` | — | Gemini vision + brif |
| `GEMINI_API_KEY_2`, `_3` | — | Ek Gemini anahtarları; günlük kota havuzunu çoğaltır |
| `GROQ_API_KEY` | — | Brif için metin modeli |

## Pipeline

`.github/workflows/pipeline.yml` içinde "Gorsel ajani" adımı, mevcut kapak
betiklerinden **sonra**, sosyal JPEG üretiminden **önce** çalışır:

```yaml
- name: Gorsel ajani
  continue-on-error: true
  env:
    SITE_URL: ${{ vars.SITE_URL }}
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
    GEMINI_API_KEY_2: ${{ secrets.GEMINI_API_KEY_2 }}
    GEMINI_API_KEY_3: ${{ secrets.GEMINI_API_KEY_3 }}
    GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
    CLOUDFLARE_ACCOUNT_ID: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    GORSEL_AJAN_LIMIT: ${{ vars.GORSEL_AJAN_LIMIT }}
    GORSEL_AJAN_GUN: ${{ vars.GORSEL_AJAN_GUN }}
    GORSEL_GUNLUK_AI: ${{ vars.GORSEL_GUNLUK_AI }}
    GORSEL_URETIM: ${{ vars.GORSEL_URETIM }}
  run: npm run gorsel-ajan
```

`continue-on-error: true` sayesinde ajan çökse bile haber akışı durmaz. Ajan
kapakları `kapak.ajan` ile işaretlendiği için `--taze` ve `--stokkaynak`
turları onları ezmez.

## Telif ve etik

- Yalnızca **CC0 / kamu malı / CC BY / CC BY-SA** fotoğraflar seçilir; GFDL,
  fair use ve "non-free" dosyalar elenir.
- `gorselKaynak` (yazar, lisans, lisans URL'si, dosya sayfası) boş bırakılmaz.
- AI üretiminde `kapak.ai = true` yazılır ve sitede "AI görsel" rozeti çıkar.
- Kan, ceset, müstehcenlik, yanıltıcı kurgu ve haberle ilgisiz kişi fotoğrafı
  kapak olmaz.
- Kaynak sitenin fotoğrafı **yeni kapak olarak seçilmez** (bkz. "Adaylar").

## Sorun giderme

| Belirti | Olası neden | Çözüm |
| --- | --- | --- |
| "görsel denetimi yapılamadı" | Gemini/Cloudflare anahtarı yok veya kota bitti | `GEMINI_API_KEY` / `CLOUDFLARE_API_TOKEN` ekle; kota sıfırlanmasını bekle |
| Hiç hedef yok | Son 3 günde uygun haber yok veya hepsi `kapak.ajan` | `--gun=0` veya `--zorla` dene |
| Aynı kapak değişmiyor | Mevcut kapak vision'da yüksek puan almış | Bu doğru davranış; zorlamak için `--zorla` |
| Openverse timeout | API zaman zaman yavaş | `istek()` bir kez retry yapar; Commons yine çalışır |
| Pollinations 503 | Servis geçici olarak kapalı | Varsayılan kapalı; `GORSEL_POLLINATIONS=1` ile açma |
| AI üretimi çalışmıyor | Cloudflare anahtarı yok | `GORSEL_URETIM=0` ile kapat veya anahtar ekle |

## Kalite kontrolü

Bir kapak "tamam" sayılmadan önce:

- [ ] Kare haberi tek başına anlatıyor.
- [ ] Somut insan/nesne/eylem var; soyut grafik değil.
- [ ] Yazı, logo, watermark, kolaj, harita, ekran görüntüsü yok.
- [ ] Aşırı eski/siyah-beyaz arşiv değil.
- [ ] Lisans ve kaynak belli; AI ise `kapak.ai` işaretli.
- [ ] Mevcut kapaktan gerçekten daha iyi.
