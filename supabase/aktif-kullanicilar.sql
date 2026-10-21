-- ============================================================================
-- HaberinAi — CANLI AKTİF KULLANICILAR & YÖNETİCİ PANELİ (Supabase)
-- ----------------------------------------------------------------------------
-- Ne yapar:
--   1) Sitede gezinen tüm ziyaretçilerin (anonim okurlar ve üyeler) son 2-3
--      dakikadaki canlı nabzını (kalp atışı) kaydederek ANLIK CANLI ZİYARETÇİ
--      sayısını ve hangi sayfalarda olduklarını hesaplar.
--   2) Kayıtlı üyelerin son aktiflik (son görülme) zamanını tutar.
--   3) YALNIZCA 'yonetici' rolüne sahip kullanıcıya özel canlı istatistik
--      fonksiyonu sunar (güvenlik sunucu tarafında doğrulanır).
--
-- KURULUM:
--   1) https://supabase.com → Projeniz → sol menüden "SQL Editor"
--   2) Bu dosyanın TAMAMINI yapıştırın ve "Run" butonuna basın.
-- ============================================================================

-- 1. Üyeler tablosuna son_aktif sütunu ekle (yoksa)
alter table public.uyeler add column if not exists son_aktif timestamptz not null default now();

-- 2. Aktif ziyaretçiler tablosu (anlık canlı varlık takibi)
create table if not exists public.aktif_ziyaretciler (
  ziyaretci_id text primary key,
  uye_id       uuid references public.uyeler(id) on delete set null,
  kadi         text,
  sayfa        text not null default '/',
  son_gorulme  timestamptz not null default now()
);

create index if not exists aktif_ziyaretciler_son_gorulme_idx
  on public.aktif_ziyaretciler (son_gorulme desc);

create index if not exists aktif_ziyaretciler_uye_idx
  on public.aktif_ziyaretciler (uye_id);

-- RLS: Doğrudan tablo sorgulaması dışarı kapalıdır.
alter table public.aktif_ziyaretciler enable row level security;

-- 3. Kalp Atışı (Heartbeat): Sayfa açıkken istemciden düzenli çağrılır
create or replace function public.kalp_atisi(
  p_ziyaretci text,
  p_sayfa     text default '/',
  p_id        uuid default null,
  p_token     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uye public.uyeler;
  v_kadi text := null;
  v_zid text := nullif(btrim(coalesce(p_ziyaretci, '')), '');
begin
  if v_zid is null then
    return jsonb_build_object('ok', false);
  end if;

  -- Eğer giriş yapmış bir kullanıcıysa kimliği doğrula ve son_aktif güncelle
  if p_id is not null and p_token is not null then
    v_uye := public.uye_dogrula(p_id, p_token);
    if v_uye.id is not null then
      v_kadi := v_uye.kadi;
      update public.uyeler set son_aktif = now() where id = v_uye.id;
    end if;
  end if;

  -- Aktif oturum kaydını ekle veya tazele
  insert into public.aktif_ziyaretciler (ziyaretci_id, uye_id, kadi, sayfa, son_gorulme)
  values (v_zid, v_uye.id, v_kadi, coalesce(nullif(btrim(p_sayfa), ''), '/'), now())
  on conflict (ziyaretci_id) do update
  set uye_id = excluded.uye_id,
      kadi = excluded.kadi,
      sayfa = excluded.sayfa,
      son_gorulme = now();

  -- %5 olasılıkla eski (5 dakikadan eski) verileri otomatik temizle
  if random() < 0.05 then
    delete from public.aktif_ziyaretciler where son_gorulme < now() - interval '5 minutes';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- 4. Yönetici Canlı İstatistikleri (YALNIZCA YÖNETİCİ ÇAĞIRABİLİR)
create or replace function public.admin_canli_istatistik(p_id uuid, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_canli_toplam integer := 0;
  v_canli_uye integer := 0;
  v_canli_anonim integer := 0;
  v_sayfalar jsonb;
  v_son_aktif_uyeler jsonb;
  v_kayitli_uyeler jsonb;
begin
  -- Güvenlik: Kullanıcı oturumu yönetici rolüne sahip mi?
  if not public.admin_mi(p_id, p_token) then
    return jsonb_build_object('hata', 'Bu bölüm yalnızca yöneticiye açık.');
  end if;

  -- Son 2.5 dakika (150 saniye) içindeki aktif ziyaretçiler
  select
    count(*),
    count(*) filter (where uye_id is not null),
    count(*) filter (where uye_id is null)
  into v_canli_toplam, v_canli_uye, v_canli_anonim
  from public.aktif_ziyaretciler
  where son_gorulme >= now() - interval '150 seconds';

  -- En çok gezilen canlı sayfalar
  select coalesce(jsonb_agg(jsonb_build_object(
    'sayfa', sayfa,
    'ziyaretci', cnt
  )), '[]'::jsonb)
  into v_sayfalar
  from (
    select sayfa, count(*) as cnt
    from public.aktif_ziyaretciler
    where son_gorulme >= now() - interval '150 seconds'
    group by sayfa
    order by cnt desc
    limit 8
  ) s;

  -- Canlı veya son 24 saatte aktif olmuş üyeler
  select coalesce(jsonb_agg(jsonb_build_object(
    'kadi', u.kadi,
    'ad', u.ad,
    'avatar', case when u.avatar like '/avatar/%' then u.avatar else null end,
    'rol', u.rol,
    'etiket', u.etiket,
    'son_aktif', u.son_aktif,
    'canli_mi', (az.ziyaretci_id is not null),
    'sayfa', az.sayfa
  )), '[]'::jsonb)
  into v_son_aktif_uyeler
  from public.uyeler u
  left join lateral (
    select ziyaretci_id, sayfa
    from public.aktif_ziyaretciler
    where uye_id = u.id and son_gorulme >= now() - interval '150 seconds'
    order by son_gorulme desc
    limit 1
  ) az on true
  where u.son_aktif >= now() - interval '24 hours' or az.ziyaretci_id is not null
  order by (az.ziyaretci_id is not null) desc, u.son_aktif desc
  limit 25;

  -- Tüm kayıtlı üyeler ve rozet listesi
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id,
    'kadi', u.kadi,
    'ad', u.ad,
    'avatar', case when u.avatar like '/avatar/%' then u.avatar else null end,
    'rol', u.rol,
    'etiket', u.etiket,
    'olusturma', u.olusturma,
    'son_aktif', u.son_aktif,
    'yorum', (select count(*) from public.yorumlar y where y.uye_id = u.id),
    'canli_mi', exists (
      select 1 from public.aktif_ziyaretciler az
      where az.uye_id = u.id and az.son_gorulme >= now() - interval '150 seconds'
    )
  ) order by u.olusturma asc), '[]'::jsonb)
  into v_kayitli_uyeler
  from public.uyeler u;

  return jsonb_build_object(
    'ok', true,
    'canli_toplam', v_canli_toplam,
    'canli_uye', v_canli_uye,
    'canli_anonim', v_canli_anonim,
    'sayfalar', v_sayfalar,
    'son_aktif_uyeler', v_son_aktif_uyeler,
    'kayitli_uyeler', v_kayitli_uyeler
  );
end;
$$;

-- 5. Yetkiler
grant execute on function public.kalp_atisi(text, text, uuid, text) to anon, authenticated;
grant execute on function public.admin_canli_istatistik(uuid, text) to anon, authenticated;

-- PostgREST şemasını tazele
notify pgrst, 'reload schema';
