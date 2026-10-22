-- ============================================================================
-- HaberinAi — LEMON SQUEEZY ABONELİK & PREMİUM / VİP ÜYELİK SİSTEMİ
-- ----------------------------------------------------------------------------
-- Ne yapar:
--   1) Üyeler tablosuna üyelik_tipi ('ucretsiz', 'premium', 'vip') ve
--      üyelik_bitis tarihi ekler.
--   2) Reklamsız okuma ve 'Özgür Premium' haberleri kilitsiz açma yetkisini yönetir.
--   3) Yöneticiye dilediği okuru doğrudan 'Premium' veya 'VIP' yapma imkanı verir.
--   4) Kullanıcının kendi abonelik durumunu okuyabileceği güvenli RPC sunar.
--
-- KURULUM:
--   Supabase Dashboard → SQL Editor → Bu kodun tamamını yapıştırıp Run'a basın.
-- ============================================================================

-- 1. Sütunları ekle
alter table public.uyeler add column if not exists uyelik_tipi text not null default 'ucretsiz';
alter table public.uyeler add column if not exists uyelik_bitis timestamptz default null;
alter table public.uyeler add column if not exists abonelik_id text default null;
alter table public.uyeler add column if not exists musteri_id text default null;

-- Kısıt: sadece geçerli üyelik tipleri
alter table public.uyeler drop constraint if exists uyeler_uyelik_tipi_check;
alter table public.uyeler
  add constraint uyeler_uyelik_tipi_check check (uyelik_tipi in ('ucretsiz', 'premium', 'vip'));

-- 2. Üyenin aktif abonelik durumunu döndüren fonksiyon
create or replace function public.uye_uyelik_bilgisi(p_id uuid, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uye public.uyeler;
  v_aktif boolean := false;
  v_kalan_gun int := 0;
begin
  v_uye := public.uye_dogrula(p_id, p_token);
  if v_uye.id is null then
    return jsonb_build_object('hata', 'Oturum geçersiz.');
  end if;

  -- Eğer süresi dolmamış premium/vip ise aktiftir
  if v_uye.uyelik_tipi in ('premium', 'vip') then
    if v_uye.uyelik_bitis is null or v_uye.uyelik_bitis > now() then
      v_aktif := true;
      if v_uye.uyelik_bitis is not null then
        v_kalan_gun := greatest(0, ceil(extract(epoch from (v_uye.uyelik_bitis - now())) / 86400)::int);
      else
        v_kalan_gun := 9999; -- süresiz / ömür boyu
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'uyelik_tipi', case when v_aktif then v_uye.uyelik_tipi else 'ucretsiz' end,
    'aktif', v_aktif,
    'bitis', v_uye.uyelik_bitis,
    'kalan_gun', v_kalan_gun,
    'abonelik_id', v_uye.abonelik_id
  );
end;
$$;

-- 3. Yönetici: Bir üyeye elle Premium / VIP tanımlama veya süre uzatma
create or replace function public.admin_uyelik_tani(
  p_id uuid,
  p_token text,
  p_hedef uuid,
  p_tip text,
  p_gun int default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tip text := lower(btrim(coalesce(p_tip, 'premium')));
  v_bitis timestamptz;
  v_rozet text;
begin
  if not public.admin_mi(p_id, p_token) then
    return jsonb_build_object('hata', 'Bu işlem yalnızca yöneticiye açıktır.');
  end if;

  if v_tip not in ('ucretsiz', 'premium', 'vip') then
    return jsonb_build_object('hata', 'Geçersiz üyelik tipi.');
  end if;

  if v_tip = 'ucretsiz' then
    v_bitis := null;
    v_rozet := '';
  else
    v_bitis := now() + (greatest(1, coalesce(p_gun, 30)) || ' days')::interval;
    v_rozet := case when v_tip = 'vip' then '👑 VIP' else '⭐ Premium' end;
  end if;

  update public.uyeler
  set uyelik_tipi = v_tip,
      uyelik_bitis = v_bitis,
      etiket = case when etiket = '' or etiket in ('⭐ Premium', '👑 VIP') then v_rozet else etiket end
  where id = p_hedef;

  return jsonb_build_object(
    'ok', true,
    'uyelik_tipi', v_tip,
    'bitis', v_bitis,
    'etiket', v_rozet
  );
end;
$$;

-- 4. Yetkiler
grant execute on function public.uye_uyelik_bilgisi(uuid, text) to anon, authenticated;
grant execute on function public.admin_uyelik_tani(uuid, text, uuid, text, int) to anon, authenticated;

-- PostgREST şemasını yenile
notify pgrst, 'reload schema';
