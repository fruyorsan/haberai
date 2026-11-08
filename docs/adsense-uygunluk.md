# AdSense Uygunluk Denetimi — 8 Kasım 2026

> Kapsam: haberinai.site (canlı), `site/src` kaynak kodu, `data/articles.json` (5.803 haber).
> Yöntem: kod + canlı HTML + veri taraması. Tahmin yok; her satırın kanıtı yazılı.

## Kısa sonuç

Sitenin **sayfa eksikliği yok**. AdSense'in istediği kurumsal sayfaların tamamı
yayında ve içerikleri dolu. Reddin en olası gerekçesi **"low value content /
scaled content abuse"**: kısa, birbirine benzeyen, toplu üretilmiş haber hacmi.
İkinci gerekçe **yayıncı kimliğinin görünmemesi** (künyede gerçek kişi/kurum adı
yok, yalnızca "HaberinAi Editör Masası" yazıyor).

## 1. Zorunlu sayfalar

| Sayfa | Durum | Kanıt / not |
| --- | --- | --- |
| Hakkımızda | ✅ Var | `/hakkimizda/` — amaç, yayın yöntemi, AI kullanımı |
| İletişim | ✅ Var | `/iletisim/` — e-posta + form, 24-48 saat yanıt taahhüdü |
| Gizlilik Politikası | ✅ Var | `/gizlilik/` — KVKK, veri sorumlusu, saklama süreleri |
| Çerez Politikası | ✅ Var (birleşik) | `/gizlilik/` içinde çerez tablosu: `cerez-onay`, `_ga`, `IDE/NID/__gads`, OneSignal |
| Kullanım Şartları | ✅ Var | `/kullanim-sartlari/` |
| Editoryal / Yayın İlkesi | ✅ Var | `/yayin-ilkeleri/` — doğrulama, AI şeffaflığı, düzeltme politikası |
| Telif / DMCA bildirimi | ✅ Var | `/telif/` — görsel lisansları, 48 saat / 5651 m.9 için 24 saat |
| Künye | ⚠️ Var ama zayıf | `/kunye/` sayfası hazır; **gerçek yayıncı bilgisi girilmemiş** (`PUBLISHER_*` boş → "HaberinAi Editör Masası") |
| Reklam ve sponsorluk | ✅ Var | `/reklam/` |
| ads.txt | ✅ Var | `google.com, pub-1941805057356673, DIRECT, f08c47fec0942fa0` |

**Yapılacak (kullanıcı, 10 dakika):** künyeye gerçek sorumlu bilgisi girmek.
Kod değişikliği gerekmez, depo değişkeni yeter:

```bash
gh variable set PUBLISHER_NAME   --body "Ad Soyad / ticaret unvanı"
gh variable set PUBLISHER_OWNER  --body "Ad Soyad"
gh variable set PUBLISHER_EDITOR --body "Sorumlu yazı işleri müdürü"
gh variable set PUBLISHER_CITY   --body "İstanbul"
```

## 2. Özgünlük ve "değersiz içerik"

Ölçülen durum (8 Kasım 2026):

| Ölçüt | Değer | Değerlendirme |
| --- | --- | --- |
| Toplam haber | 5.803 | Yüksek hacim |
| Ortalama gövde | **190 kelime** | AdSense için ince |
| 150 kelimeden kısa gövde | **1.813 haber (%31)** | ✖ Risk |
| İndeks çekirdeği | 3.657 haber | Kalite kapısı çalışıyor |
| Kalite kapısının elediği | 2.146 haber | Çoğu "kısa gövde" (1.713) |
| Özet = gövde olan haber | 0 | ✅ Tekrar yok |
| Görünür kaynak atfı | 5.803/5.803 kaynak URL'si var | ✅ **8 Kasım'da sayfaya eklendi** |

**Yapılan kod değişiklikleri (bu tur):**
- Haber sayfasına **görünür kaynak atfı** eklendi (`Kaynak: <yayın>` + açıklama +
  telif bağlantısı). Bilgi kaynağı artık gizlenmiyor.
- `NewsArticle` yapısal verisine `isBasedOn` (kaynak URL) eklendi.
- Alt bilgideki **yanlış/riskli cümle** düzeltildi: "görsellerde haberin
  kaynağındaki fotoğraf kullanılır" yazıyordu; oysa kaynak fotoğrafı
  kullanılmıyor. Bu cümle AdSense incelemesinde telif ihlali itirafı gibi
  okunabilirdi.

**Yapılacak (içerik hattı):**
1. Yayın hacmini düşür: `GUNLUK_HABER_LIMIT` 145 → **25**, `YAYIN_ARALIK_DK` → 50.
2. Kalite kapısı eşiğini yükselt: gövde en az **250 kelime / 4 paragraf**;
   altındaki haber yayımlanmaz (noindex'e düşürmek yetmez, hiç üretilmesin).
3. Kısa gövde kuralı: `docs/icerik-kurallari.md`.

## 3. Reklam yerleşimi

| Kural | Durum |
| --- | --- |
| İçerikten fazla reklam yok | ✅ Haber başına en fazla 2 birim |
| İnce/noindex sayfada reklam yok | ✅ `reklamAcik = indeksliMi(article)` |
| "Reklama tıklayın" çağrısı yok | ✅ |
| Reklam engelleyici uyarısı yok | ✅ (bilinçli olarak kapalı) |
| Reklamlar içerikten ayırt edilebilir | ✅ `Sponsorlu` etiketi |
| Reklam yüklemesi çerez onayına bağlı | ✅ Consent Mode v2, onay öncesi `adsbygoogle.js` indirilmiyor |

Not: onay öncesi reklam betiği hiç yüklenmediği için AdSense botu reklam
birimlerini boş görebilir. Bu **politika ihlali değil**, KVKK gereği; yine de
AdSense incelemesi sırasında "sitede reklam yok" izlenimi doğurabilir.
İnceleme haftasında bu davranışı değiştirmeyin (rıza olmadan reklam yüklemek
asıl ihlaldir).

## 4. E-E-A-T / güven sinyalleri

| Sinyal | Durum | Not |
| --- | --- | --- |
| Yayıncı kimliği (ad, adres) | ⚠️ | `PUBLISHER_*` girilmeli |
| Sorumlu müdür | ⚠️ | Aynı şekilde |
| Düzeltme kanalı | ✅ | Her haberin altında "Hata bildir" (mailto, konu ön dolu) |
| Kaynak atfı | ✅ | 8 Kasım'da eklendi |
| AI kullanımı beyanı | ✅ | `/yayin-ilkeleri/#yapay-zeka` + "AI YORUMU" etiketi |
| Yazar/ editör imzası | ⚠️ | Tüm haberler "Haber Merkezi"; kişisel imza yok |
| Görsel lisansı | ✅ | Yalnızca CC0/kamu malı/AI/marka; ayrıntı: `docs/telif-taramasi-2026-11-08.md` |

## 5. Hız ve mobil

- Yerel kapak görselleri 480/1280 px WebP varyantıyla sunuluyor, `preload` +
  `fetchpriority=high` var.
- Uzak (Wikimedia) gövde görselleri `wsrv.nl` üzerinden yeniden boyutlanıyor —
  üçüncü taraf bağımlılığı; sayfa başına ortalama 1-2 görsel.
- Haber HTML'i ~128 KB (gzip öncesi); okuma zinciri 4 tam haber gömüyor. Mobil
  LCP için en büyük risk bu. **Ölçüm gerekli:** PageSpeed Insights / CrUX.

## Öncelik sırası (yeniden başvuru öncesi)

1. `PUBLISHER_*` bilgilerini gir (kullanıcı, 10 dk) — en yüksek etki/efor oranı.
2. Yayın hacmini 25/gün'e indir; 250 kelime altını yayımlama (2 hafta).
3. 150 kelimenin altındaki 1.813 haberi **silme**, noindex'te tut; 30 gün sonra
   ölç ve gerekirse 410 ile kapat.
4. 2 hafta boyunca içerik değiştirmeden bekle, sonra yeniden başvur.
