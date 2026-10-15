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

`.github/workflows/pipeline.yml` her 30 dakikada bir çalışır. GitHub'da repo ayarlarından
`GEMINI_API_KEY` adında bir **secret** eklemen yeterli.

## Dosya Düzeni

```
src/config.js   → kaynaklar ve ayarlar
src/fetcher.js  → RSS çekme + temizleme
src/ai.js       → Gemini özet + yorum + başlık/slug/etiket
src/store.js    → kaydet/yükle + tekrar önleme
src/index.js    → akışı yönetir
data/articles.json → üretilen haberler
```
