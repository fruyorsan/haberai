# Telif Taraması — 8 Kasım 2026

> Kapsam: `data/articles.json` (5.803 haber), `site/public/kapak/`, build çıktısı
> (`site/dist`, 6.748 sayfa). Amaç: ShiftDelete vb. kaynakların birebir kopyalanmış
> görsellerinden sitede kalan var mı?

## Sonuç: Kopya kaynak görseli KALMADI

| Kontrol | Sonuç |
| --- | --- |
| Haberlerde yerel kapak (`/kapak/…`) | 5.753 |
| Haberlerde uzak görsel | **50** — hepsi Wikimedia (`thumb.wikimedia.org` 49, `upload.wikimedia.org` 1) |
| Eksik kapak dosyası (veride var, diskte yok) | **0** |
| `shiftdelete / donanimhaber / webtekno / chip / teknoloji.org` alan adından gelen `<img>` | **0** |
| Build çıktısındaki dış görsel kaynakları | yalnızca `wsrv.nl` (bizim görsel proxy'miz) |
| Kaynak adı geçen haber | 672 — hepsi **metin atfı** (`source` alanı), görsel değil |

Build çıktısında kaynak site adları yalnızca iki yerde geçiyor: haberin
`source` metni ve `sourceUrl` bağlantısı. İkisi de atıf; telif riski değil.

## Gövde içi ek görseller

`gorselEk` alanında 2.602 kayıt var. Sayfaya **yalnızca CC0 / kamu malı**
olanlar giriyor (`site/src/pages/haber/[slug].astro` → `KAMU_MALI` süzgeci):

| Lisans | Adet | Sayfada kullanılıyor mu? |
| --- | --- | --- |
| Kamu malı | 611 | ✅ |
| CC0 | 237 | ✅ |
| No restrictions | 29 | ✅ |
| CC BY-SA 4.0 | 847 | ✖ (atıf gerektirir) |
| CC BY 2.0 / 3.0 / 4.0 / 2.5 | 551 | ✖ |
| CC BY-SA 2.0 / 2.5 / 3.0 | 327 | ✖ |

Atıf gerektiren 1.725 görsel **hiçbir haberde ek görsel olarak basılmıyor**.
Bu doğru karar: sayfada fotoğrafçı/lisans kredisi göstermediğimiz için CC BY
görselleri kullanmak lisans ihlali olurdu.

## Kalan tek risk: eski CC BY kapaklarının kaydı

`/gorsel-kaynaklari/` sayfası arşivdeki CC BY görsellerin toplu lisans kaydını
tutuyor. Bugünkü kapakların tamamı yerel/CC0 olduğu için bu sayfa artık bir
"arşiv kaydı" işlevi görüyor. Silinmesi gerekmez; aksine elinde tutmak,
geçmişteki kullanımın lisans şartını yerine getirdiğini gösterir.

## Yapılacaklar

1. **Yapıldı:** haber sayfasına görünür `Kaynak: <yayın>` atfı ve
   `NewsArticle.isBasedOn` eklendi. Denetimde "nereden aldınız?" sorusunun
   cevabı artık sayfada.
2. **Yapıldı:** alt bilgideki "görsellerde haberin kaynağındaki fotoğraf
   kullanılır" cümlesi kaldırıldı. Yanlış beyandı ve telif itirafı gibi
   okunuyordu.
3. **Öneri (Kapak'ın alanı):** kalan 50 Wikimedia kapağını yerel WebP'ye indirip
   `/kapak/` altına almak — dış bağımlılığı ve `wsrv.nl` üzerinden
   yeniden boyutlamayı kaldırır. Görsel üretim koduna bu turda dokunulmadı.
4. **Öneri (kullanıcı):** ShiftDelete'ten kaldırma talebi geldiyse yanıt olarak
   `/telif/` sürecini göster; sitede o yayına ait görsel dosyası yok.
