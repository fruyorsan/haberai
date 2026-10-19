-- ============================================================================
-- HaberinAi — yorumlar (Supabase / PostgreSQL)
-- ----------------------------------------------------------------------------
-- Tek seferlik kurulum:
--   1) https://supabase.com → ücretsiz proje aç
--   2) Soldaki "SQL Editor" → bu dosyanın TAMAMINI yapıştır → Run
--   3) Project Settings → API:
--        Project URL      → gh variable set YORUM_URL  --body "https://xxxx.supabase.co"
--        anon public key  → gh variable set YORUM_ANON --body "eyJhbGci..."
--   4) gh workflow run pipeline.yml  (site yeniden derlenir)
--
-- OKUYUCU HESABI GEREKMEZ. anon anahtarı tarayıcıya yazılır; aşağıdaki RLS
-- politikaları yalnızca "oku + yorum ekle" izni verir. Silme/gizleme yalnızca
-- panelden (service_role) yapılır.
-- ============================================================================

create table if not exists public.yorumlar (
  id         bigint generated always as identity primary key,
  slug       text        not null,
  ad         text        not null default 'Okur',
  metin      text        not null,
  created_at timestamptz not null default now(),
  gizli      boolean     not null default false
);

create index if not exists yorumlar_slug_zaman_idx
  on public.yorumlar (slug, created_at desc);

alter table public.yorumlar enable row level security;

-- Okuma: herkes, yalnızca gizlenmemiş yorumlar.
drop policy if exists "yorumlari oku" on public.yorumlar;
create policy "yorumlari oku"
  on public.yorumlar
  for select
  to anon, authenticated
  using (gizli = false);

-- Yazma: herkes (hesap yok). Alan sınırları ve hız sınırı burada zorlanır.
drop policy if exists "yorum ekle" on public.yorumlar;
create policy "yorum ekle"
  on public.yorumlar
  for insert
  to anon, authenticated
  with check (
    char_length(slug) between 1 and 300
    and char_length(ad) between 1 and 40
    and char_length(metin) between 2 and 1200
    and gizli = false
    and created_at <= now() + interval '1 minute'
  );

-- Flood koruması: son 30 saniyede 25'ten fazla yorum gelirse reddet.
-- (Tek tek spam'e karşı değil, toplu bombardımana karşı ilk kapı.)
create or replace function public.yorum_hiz_siniri()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.yorumlar where created_at > now() - interval '30 seconds') >= 25 then
    raise exception 'Cok fazla yorum geldi, biraz sonra tekrar dene.';
  end if;
  return new;
end;
$$;

drop trigger if exists yorum_hiz_siniri_t before insert on public.yorumlar;
create trigger yorum_hiz_siniri_t
  before insert on public.yorumlar
  for each row execute function public.yorum_hiz_siniri();

-- Aynı metni 10 dakika içinde tekrar göndermeyi engelle (kazara çift tık).
create or replace function public.yorum_tekrar_engel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.yorumlar
    where slug = new.slug
      and metin = new.metin
      and created_at > now() - interval '10 minutes'
  ) then
    raise exception 'Bu yorum zaten gönderildi.';
  end if;
  return new;
end;
$$;

drop trigger if exists yorum_tekrar_engel_t before insert on public.yorumlar;
create trigger yorum_tekrar_engel_t
  before insert on public.yorumlar
  for each row execute function public.yorum_tekrar_engel();
