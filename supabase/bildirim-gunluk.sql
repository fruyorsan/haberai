-- Günlük sınırlı bildirim modu (varsayılan: günde 7).
--
-- Neden: yeni okuyucu "anında" moduyla açılıyordu ve yoğun günlerde onlarca
-- bildirim alıyordu. Artık yeni hesapların varsayılanı "gunluk7"; isteyen
-- profilden "gunluk10"a çıkarabilir ya da "aninda"yı seçebilir.
--
-- Mevcut hesapların seçimi KORUNUR (aninda/ozet/son aynen kalır). Yalnızca
-- yeni hesaplar ve sütun varsayılanını kullanan kayıtlar etkilenir.
--
-- Uygulama: Supabase → SQL Editor → bu dosyayı çalıştır.

alter table public.uyeler
  alter column bildirim_siklik set default 'gunluk7';

alter table public.uyeler drop constraint if exists uyeler_siklik_bicim;
alter table public.uyeler
  add constraint uyeler_siklik_bicim
  check (bildirim_siklik in ('gunluk7', 'gunluk10', 'aninda', 'ozet', 'son'));

create or replace function public.uye_bildirim_siklik(
  p_id uuid, p_token text, p_siklik text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uye public.uyeler;
  v_siklik text := lower(btrim(coalesce(p_siklik, '')));
begin
  v_uye := public.uye_dogrula(p_id, p_token);
  if v_uye.id is null then return jsonb_build_object('hata', 'Oturum geçersiz.'); end if;
  if v_siklik not in ('gunluk7', 'gunluk10', 'aninda', 'ozet', 'son') then
    return jsonb_build_object('hata', 'Geçersiz bildirim sıklığı.');
  end if;
  update public.uyeler
     set bildirim_siklik = v_siklik, guncelleme = now()
   where id = v_uye.id;
  return jsonb_build_object('ok', true, 'bildirim_siklik', v_siklik);
end;
$$;
