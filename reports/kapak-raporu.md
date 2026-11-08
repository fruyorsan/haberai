# Kapak Hattı — Kaynak Fotoğrafı Raporu (2026-11-08)

Commit: `40d947416` (yerel, **push edilmedi**)

---

## 1. Kök neden

Kod, kaynak sitenin kendi görselini **kasıtlı olarak devre dışı bırakmıştı**:
`kaynakGorselAdaylari()` her çağrıda boş dizi döndürüyordu. Geriye yalnızca

- Wikimedia Commons CC0 (isim–konu eşleşmesi çok sıkı: `konuUyumPuani >= 1`)
- Openverse
- AI üretimi

kaldığı için arşivdeki 5.803 haberin 4.416'sı (%76) ikonlu tasarım kartına düştü.

İkinci kök neden: havuz karesi eşiği **1** puandı ve puanlama önek benzerliği
sayıyor. `Spain` ↔ `space`, `İstanbul` ↔ `Riyad` gibi çakışmalar 1 puan üretip
**alâkasız kare** bağlıyordu (Riyad erken uyarı haberi → İstanbul silueti).

---

## 2. Dosya bazında değişiklik

| Dosya | Değişiklik |
|---|---|
| `src/kapak-kaynak.js` **(yeni)** | og:image / twitter:image / JSON-LD aday toplama, kalite kapısı, atıf, 1280×720 kırpma |
| `src/kapak-havuz.js` | `HAVUZ_UYUM_ESIGI` **1 → 2** (alâka kapısı) |
| `scripts/kapak-uret.mjs` | `--kaynaktan` turu, kaynak aday zinciri, `kapak.kaynakTur="kaynak"` işareti, 7 günlük deneme defteri, erken çıkış |
| `scripts/kapak-olcum.mjs` **(yeni)** | Salt-okunur ölçüm aracı, JSON rapor |
| `scripts/kapak-once-sonra.mjs` **(yeni)** | Önce/sonra örnek üretici (HTML + manifest) |
| `scripts/veri-birlestir-surucu.mjs` | `kaynakKapakDeneme` / `kaynakKapakNeden` KORUNAN listesine eklendi |
| `.github/workflows/pipeline.yml` | **“Kaynak fotografi ile kartlari onar”** adımı (`--kaynaktan --limit=60 --eski`, `continue-on-error`) |
| `package.json` | `kapak:kaynaktan`, `kapak:olcum`, `kapak:once-sonra` betikleri |
| `data/articles.json` | 31 kaydın kapağı kaynak fotoğrafına geçti (+ `kaynakKapakDeneme` alanı) |

### Kalite kapısı (kalibre edilmiş eşikler)

| Ölçüt | Eşik |
|---|---|
| Min. çözünürlük | 880×480 |
| Oran | 1.2 – 3.0 |
| Entropi | ≥ 4.2 |
| Beyaz oranı | ≤ %62 |
| Std. sapma | ≥ 25 |
| Gradyan | ≥ 7 |
| **Başlık bindirmesi** | **< %8 satır** (yeni) |
| **Ekran görüntüsü** | **gradyan<9 ve std<35 birlikte** (yeni) |

Telif: ShiftDelete, Getty/Reuters/AP/Shutterstock/iStock/Depositphotos/Alamy/imago/DHA/İHA/AA-görsel CDN'i engelli.

---

## 3. Bu partide ölçülen sonuç

### Gerçek parti (ağ kullanıldı)

| Tur | Hedef | Üretilen | Fotoğraf | Kart |
|---|---|---|---|---|
| `--fotoyok --limit=10` | 10 kart | 10 | 8 | 2 |
| `--kaynaktan --limit=40` | 40 kart | 21 | 21 | 0 |
| **Toplam** | **50** | **31** | **29 (%94)** | **2 (%6)** |

Arşiv durumu: **foto 2.904 → 2.933**, **kart 2.549 → 2.520**.

### Kalite ölçümü: 120 mevcut kart üzerinde

```
Gerçek fotoğraf bulundu: 75/120  (%62,5)
Ortalama kaynak: 1340×775, entropi 7,11
```

Reddetme nedenleri (45 vaka):

| Neden | Adet |
|---|---|
| Küçük (AA 864×486, webtekno 640×360) | 15 |
| Sayfada görsel yok | 8 |
| Fotoğraf üstüne basılı başlık | 6 |
| Düz/az detay (entropi) | 5 |
| Telif/rakip yayıncı (shiftdelete) | 3 |
| Bulanık | 4 |
| Paylaşım kartı (kırmızı plaka) | 2 |
| Oran dar / çözülemedi | 2 |

**Önceki ölçüm %60'tı**; üstelik o ölçümde 3 hatalı sınıf (başlık plakası,
oyun ekran görüntüsü, kanal logosu) **geçiyordu**. Yeni kapı bunları reddediyor:
ölçüm aynı oranda ama **temiz**.

---

## 4. Önce/sonra örnekleri (12 haber)

Klasör: `reports/kapak-once-sonra/` — `index.html` tarayıcıda açılır.

| # | Haber | Kaynak |
|---|---|---|
| 1 | Hatay İskenderun'da ciple çarpışan motosikletli yaralandı | haberglobal.com |
| 2 | Fenerbahçe, Göztepe ile 10. Hafta Maçı Açıldı | haberglobal.com |
| 3 | AI maliyet endişesi ABD borsasında sert satışa yol açtı | bbc.co.uk |
| 4 | Binance TR, adreslerindeki tüm varlıkların güvende olduğunu açıkladı | donanimhaber.com |
| 5 | Beetekno güncel oyun ve teknoloji dünyasını analiz ediyor | beetekno.com |
| 6 | İspanya'daki tren kazasında can kaybı 69'a yükseldi | trthaber.com |
| 7 | Bronx'ta e-scooter yangını: 1 çocuk hayatını kaybetti | abdpost.com |
| 8 | Toyota, Benzinli Motorları 2032'ye Kadar 1,5 Milyar Euro… | donanimhaber.com |
| 9 | Putin ve Pezeşkiyan Moskova'da çok kutuplu dünya düzenini görüştü | cnnturk.com |
| 10 | e-Nabız onay süreçlerinde yeni dönem | chip.com.tr |
| 11 | Yapay zeka analizleri Galatasaray'ın tartışmalı pozisyonunu yorumladı | fotospor.com.tr |
| 12 | Brezilya seçimlerinde dijital seferberlik: Lula ordusu | bbc.co.uk |

12/12 kare gözle tek tek denetlendi; hepsi gerçek editoryal fotoğraf,
başlık plakası/ekran görüntüsü yok.

---

## 5. Alâka hatası için eklenen kapı

Brief'teki örnek (Riyad erken uyarı → İstanbul silueti) ölçüldü:

```
konuUyumPuani("Riyad…", "İstanbul_skyline…") = 1   → eski eşikte GEÇİYOR
HAVUZ_UYUM_ESIGI = 2                                → artık REDDEDİLİYOR
```

Ek olarak çalışma ağacındaki **1.682 fotoğraf→kart** dönüşümü denetlendi:
bunlar gerçekten alâkasız Commons kareleriydi (Iveco satın alma → Malta zırhlı
araç, radar eğitimi → gemi). Toplu hâlde tek commit'e alınmadı; arşiv
`git checkout` ile HEAD'e döndürüldü. Kart temizliği mevcut CI adımında
(`--uygunsuz`) parti parti devam edecek.

---

## 6. Boru hattına bağlandı

`pipeline.yml` içine eklendi (Görsel ajanından **önce**):

```yaml
- name: Kaynak fotografi ile kartlari onar
  continue-on-error: true
  run: node scripts/kapak-uret.mjs --kaynaktan --limit=60 --paralel=6 --eski
```

Zincir 5 dakikada bir çalıştığı için: **saatte ~720 kart denenir**.
Uygun kare bulunamayan haberler 7 gün yeniden denenmez (`kaynakKapakDeneme`),
böylece aynı 2.500 kart sonsuza kadar dönmez.

Tahmini erime: kalan **2.520 kart** × %62,5 başarı ≈ **1.575 kart** gerçek
fotoğrafa döner; kalan ~945 kart (AA 864×486, görselsiz sayfalar, telifli
kaynaklar) tasarım kartı olarak kalır.

---

## 7. Doğrulamalar

| Kontrol | Sonuç |
|---|---|
| `node --check` (tüm değişen dosyalar) | ✅ |
| `node site/scripts/gorsel-uygun-test.mjs` | ✅ 8/8 + 6/6 |
| `cd site && npm run build` | ✅ 6.748 sayfa |
| `node scripts/kapak-olcum.mjs --limit=120` | ✅ %62,5 |
| `node scripts/kapak-once-sonra.mjs --adet=12` | ✅ 12/12 |
| `data/articles.json` alan denetimi | ✅ yalnız `kapak`, `gorselKaynak`, `kaynakKapakDeneme` |
| Trafik'in `docs/` + `site/src/components` + `site/src/pages` | ✅ dokunulmadı |
| `.env` | ✅ okunmadı/yazılmadı |

---

## 8. Kalan riskler

1. **AA görselleri 864×486** → 880 eşiğine takılıyor (~250 haber). 1280'e
   büyütmek bulanık kapak üretirdi; bilinçli tercih. Eşiği 860'a çekmek
   tartışılabilir.
2. **Telif**: kaynak sitenin og:image'i kullanılıyor ve `gorselKaynak` ile
   atıflanıyor. Hukuken “alıntı” sınırında; şikâyet gelirse kaynak zinciri hazır
   ama toplu kullanım risk taşır. ShiftDelete ve ajans CDN'leri engelli.
3. **Alâka kapısı hâlâ sözcük tabanlı.** Görsel-ajanı (vision) devrede ama
   günlük AI bütçesi sınırlı; otomatik turda anlamsal doğrulama yok.
4. **Sıralama**: geçen ilk aday kazanıyor, alternatifler puanlanmıyor (hız
   tercihi). Aynı sayfada daha iyi bir og:image varsa seçilmez.
5. **Kırmızı plaka dedektörü** tek gerçek portreyi (BBC, kırmızı zemin) eliyor.
   Kayıp küçük, ama sıfır değil.
6. `data/kapak-havuz/*` çalışma ağacında değişik görünüyor (önceki turlardan);
   commit'e alınmadı.
7. **Push yapılmadı** — yayına almak için `git push origin main` gerekir.
