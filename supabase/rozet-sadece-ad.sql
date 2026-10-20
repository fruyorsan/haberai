-- Tek seferlik güvenlik yaması:
-- Rozet yazmak artık SADECE görünen etiketi değiştirir; rol/yetki vermez.
-- Supabase Dashboard > SQL Editor'de bu dosyanın tamamını çalıştır.

create or replace function public.admin_etiket(
  p_id uuid, p_token text, p_hedef uuid, p_etiket text, p_rol text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_etiket text := nullif(btrim(coalesce(p_etiket, '')), '');
  v_hedef public.uyeler;
begin
  if not public.admin_mi(p_id, p_token) then
    return jsonb_build_object('hata', 'Bu işlem yalnızca yöneticiye açık.');
  end if;
  if v_etiket is not null and char_length(v_etiket) > 24 then
    return jsonb_build_object('hata', 'Rozet en fazla 24 karakter olmalı.');
  end if;
  select * into v_hedef from public.uyeler where id = p_hedef;
  if v_hedef.id is null then
    return jsonb_build_object('hata', 'Okuyucu bulunamadı.');
  end if;
  update public.uyeler
     set etiket = coalesce(v_etiket, ''),
         guncelleme = now()
   where id = v_hedef.id;
  return jsonb_build_object(
    'ok', true,
    'id', v_hedef.id,
    'etiket', coalesce(v_etiket, ''),
    'rol', v_hedef.rol
  );
end;
$$;
