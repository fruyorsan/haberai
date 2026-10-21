# Güvenlik Politikası

HaberinAi'nin güvenliğini ciddiye alıyoruz. Bir güvenlik açığı bulduysanız lütfen
bunu herkese açık bir issue, pull request veya sosyal medya gönderisiyle
paylaşmayın.

## Açık bildirimi

Özel bildirim için GitHub'ın **Report a vulnerability** akışını kullanın:

https://github.com/fruyorsan/haberai/security/advisories/new

Bu akış, bildiriminizi yalnızca repo yöneticilerinin görebileceği özel bir
güvenlik duyurusu olarak iletir.

## Kapsam

- `site/` altındaki Astro uygulaması ve istemci tarafı JavaScript
- RSS → AI veri hattı (`src/`, `scripts/`)
- Supabase tabloları, RLS politikaları ve RPC'ler
- GitHub Actions iş akışları ve dağıtım zinciri

## Bildirimde bulunurken

Mümkünse şunları ekleyin:

- Açığın etkilediği URL veya dosya
- Yeniden üretme adımları
- Beklenen ve gerçekleşen davranış
- Varsa önerdiğiniz düzeltme

Lütfen gerçek kullanıcı verilerini, erişim anahtarlarını veya kişisel bilgileri
bildirime eklemeyin. Yararlı bir bildirim için teşekkür ederiz.
