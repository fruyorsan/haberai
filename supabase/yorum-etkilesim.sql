-- ============================================================================
-- HaberinAi — yorum etkileşimleri (beğeni + silme + anonim sahiplik)
-- ----------------------------------------------------------------------------
-- Supabase Dashboard > SQL Editor'de bu dosyanın TAMAMINI bir kez çalıştır.
-- Mevcut yorumlar silinmez; yalnızca yeni tablolar/fonksiyonlar eklenir.
-- Kurulum sırası: yorumlar.sql → yorum-etkilesim.sql → yorum-bildirim.sql
-- (yanıtlar ve beğeni/yanıt bildirimleri için bkz. supabase/yorum-bildirim.sql)
--
-- Neden ayrı tablolar?
--   * yorum_sahiplik: hesapsız yorumun hangi cihazdan yazıldığını tutar.
--     Böylece hesabı olmayan okur da aynı cihazdan kendi yorumunu silebilir.
--   * yorum_begeniler: yorum başına beğeni sayısı ve "ben beğendim" durumu.
--     Kimlik, üye oturumu varsa "u:<üye-id>", yoksa "c:<cihaz>" olur.
--
-- İki tabloda da RLS açıktır ve DOĞRUDAN policy YOKTUR. Erişim yalnızca
-- aşağıdaki security definer RPC'lerden yapılır; cihaz kimlikleri dışarıya
-- sızmaz.
-- ============================================================================

-- ---------------------------------------------------------------- sahiplik --
create table if not exists public.yorum_sahiplik (
  yorum_id   bigint primary key references public.yorumlar(id) on delete cascade,
  cihaz      text not null,
  created_at timestamptz not null default now(),
  constraint yorum_sahiplik_cihaz_bicim check (char_length(cihaz) between 8 and 80)
);

create index if not exists yorum_sahiplik_cihaz_idx
  on public.yorum_sahiplik (cihaz);

alter table public.yorum_sahiplik enable row level security;

-- ---------------------------------------------------------------- beğeniler --
create table if not exists public.yorum_begeniler (
  yorum_id   bigint not null references public.yorumlar(id) on delete cascade,
  kimlik     text not null,
  created_at timestamptz not null default now(),
  primary key (yorum_id, kimlik),
  constraint yorum_begeniler_kimlik_bicim check (char_length(kimlik) between 3 and 120)
);

create index if not exists yorum_begeniler_kimlik_idx
  on public.yorum_begeniler (kimlik);

alter table public.yorum_begeniler enable row level security;

-- --------------------------------------------------- yorumları listele ------
-- REST yerine tek RPC: beğeni sayısı, "ben beğendim" ve "benim yorumum"
-- bilgileri aynı cevapta gelir. Eski istemciler/REST yedeği bozulmaz.
create or replace function public.yorum_listele(
  p_slug text,
  p_cihaz text default null,
  p_id uuid default null,
  p_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_slug text := btrim(coalesce(p_slug, ''));
  v_uye public.uyeler;
  v_kimlik text;
begin
  if char_length(v_slug) < 1 or char_length(v_slug) > 300 then
    return '[]'::jsonb;
  end if;

  v_uye := public.uye_dogrula(p_id, p_token);
  if v_uye.id is not null then
    v_kimlik := 'u:' || v_uye.id::text;
  elsif char_length(coalesce(p_cihaz, '')) between 8 and 80 then
    v_kimlik := 'c:' || p_cihaz;
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', y.id,
        'ad', y.ad,
        'metin', y.metin,
        'created_at', y.created_at,
        'uye_id', y.uye_id,
        'etiket', coalesce(y.etiket, ''),
        'ust_id', y.ust_id,
        'begeni', (
          select count(*)::int
          from public.yorum_begeniler b
          where b.yorum_id = y.id
        ),
        'begendim', (
          v_kimlik is not null and exists (
            select 1 from public.yorum_begeniler b
            where b.yorum_id = y.id and b.kimlik = v_kimlik
          )
        ),
        'benim', (
          (v_uye.id is not null and y.uye_id = v_uye.id)
          or (
            char_length(coalesce(p_cihaz, '')) between 8 and 80
            and exists (
              select 1 from public.yorum_sahiplik s
              where s.yorum_id = y.id and s.cihaz = p_cihaz
            )
          )
        )
      )
      order by y.created_at desc
    )
    from public.yorumlar y
    where y.slug = v_slug and y.gizli = false
  ), '[]'::jsonb);
end;
$$;

-- ------------------------------------------------- hesapsız yorum ekle ------
-- Hesapsız yorumlar artık bu RPC'den geçer; cihaz anahtarı sahiplik tablosuna
-- yazılır. Böylece yorumu yazan cihaz daha sonra silebilir.
create or replace function public.yorum_ekle_anon(
  p_slug text,
  p_ad text,
  p_metin text,
  p_cihaz text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_slug text := btrim(coalesce(p_slug, ''));
  v_ad text := left(coalesce(nullif(btrim(p_ad), ''), 'Okur'), 40);
  v_metin text := btrim(coalesce(p_metin, ''));
  v_cihaz text := btrim(coalesce(p_cihaz, ''));
  v_id bigint;
  v_tarih timestamptz;
begin
  if char_length(v_slug) < 1 or char_length(v_slug) > 300 then
    return jsonb_build_object('hata', 'Geçersiz haber.');
  end if;
  if char_length(v_metin) < 2 then
    return jsonb_build_object('hata', 'Yorum çok kısa.');
  end if;
  if char_length(v_metin) > 1200 then
    return jsonb_build_object('hata', 'Yorum çok uzun.');
  end if;
  if char_length(v_cihaz) < 8 or char_length(v_cihaz) > 80 then
    return jsonb_build_object('hata', 'Cihaz anahtarı geçersiz; sayfayı yenileyip tekrar dene.');
  end if;

  insert into public.yorumlar (slug, ad, metin)
  values (v_slug, v_ad, v_metin)
  returning id, created_at into v_id, v_tarih;

  insert into public.yorum_sahiplik (yorum_id, cihaz)
  values (v_id, v_cihaz)
  on conflict (yorum_id) do update set cihaz = excluded.cihaz;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'ad', v_ad,
    'metin', v_metin,
    'created_at', v_tarih,
    'etiket', '',
    'begeni', 0,
    'begendim', false,
    'benim', true
  );
end;
$$;

-- --------------------------------------------------------- beğeni aç/kapa ---
create or replace function public.yorum_begen(
  p_yorum bigint,
  p_cihaz text default null,
  p_id uuid default null,
  p_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uye public.uyeler;
  v_kimlik text;
  v_var boolean;
  v_sayi int;
begin
  if not exists (
    select 1 from public.yorumlar where id = p_yorum and gizli = false
  ) then
    return jsonb_build_object('hata', 'Yorum bulunamadı.');
  end if;

  v_uye := public.uye_dogrula(p_id, p_token);
  if v_uye.id is not null then
    v_kimlik := 'u:' || v_uye.id::text;
  elsif char_length(coalesce(p_cihaz, '')) between 8 and 80 then
    v_kimlik := 'c:' || p_cihaz;
  else
    return jsonb_build_object('hata', 'Beğenmek için sayfayı yenile ya da giriş yap.');
  end if;

  select exists (
    select 1 from public.yorum_begeniler
    where yorum_id = p_yorum and kimlik = v_kimlik
  ) into v_var;

  if v_var then
    delete from public.yorum_begeniler
    where yorum_id = p_yorum and kimlik = v_kimlik;
  else
    insert into public.yorum_begeniler (yorum_id, kimlik)
    values (p_yorum, v_kimlik)
    on conflict (yorum_id, kimlik) do nothing;
  end if;

  select count(*)::int into v_sayi
  from public.yorum_begeniler
  where yorum_id = p_yorum;

  return jsonb_build_object(
    'ok', true,
    'begendim', not v_var,
    'begeni', v_sayi
  );
end;
$$;

-- ------------------------------------------------------- yorum sil (sahibi) --
create or replace function public.yorum_sil(
  p_yorum bigint,
  p_cihaz text default null,
  p_id uuid default null,
  p_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uye public.uyeler;
  v_sayi bigint;
begin
  v_uye := public.uye_dogrula(p_id, p_token);

  delete from public.yorumlar y
  where y.id = p_yorum
    and (
      (v_uye.id is not null and y.uye_id = v_uye.id)
      or (
        y.uye_id is null
        and char_length(coalesce(p_cihaz, '')) between 8 and 80
        and exists (
          select 1 from public.yorum_sahiplik s
          where s.yorum_id = y.id and s.cihaz = p_cihaz
        )
      )
    );

  get diagnostics v_sayi = row_count;
  if v_sayi = 0 then
    return jsonb_build_object('hata', 'Bu yorumu silme yetkin yok.');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- --------------------------------------------------------------- yetkiler ----
grant execute on function public.yorum_listele(text, text, uuid, text)  to anon, authenticated;
grant execute on function public.yorum_ekle_anon(text, text, text, text) to anon, authenticated;
grant execute on function public.yorum_begen(bigint, text, uuid, text)  to anon, authenticated;
grant execute on function public.yorum_sil(bigint, text, uuid, text)    to anon, authenticated;

-- PostgREST şema önbelleğini hemen tazele (yeni RPC'ler anında görünsün).
notify pgrst, 'reload schema';
