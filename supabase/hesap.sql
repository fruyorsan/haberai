-- ============================================================================
-- HaberinAi — OKUYUCU HESABI (Supabase / PostgreSQL)
-- ----------------------------------------------------------------------------
-- Ne yapar:
--   * Kullanıcı adı + şifre ile kayıt ve giriş (E-POSTA YOK, doğrulama yok).
--   * Şifreler bcrypt ile (pgcrypto) saklanır; düz metin tutulmaz.
--   * Her girişte rastgele bir oturum anahtarı üretilir; yalnızca SHA-256 özeti
--     veritabanında durur. Yazma işlemleri (yorum, profil) bu anahtarla doğrulanır.
--   * Profil: görünen ad + ilgi alanları (kategori slug listesi) + bildirim
--     ilgi alanları. Bunlar hem akışı "sana özel" sıralar hem bildirim
--     etiketlerini kurar.
--
-- KURULUM (tek sefer, SQL Editor):
--   1) https://supabase.com → proje → soldan "SQL Editor"
--   2) Bu dosyanın TAMAMINI yapıştır → Run
--   Not: yorumlar.sql zaten çalıştırılmış olmalı (yorumlar tablosu).
--
-- GÜVENLİK:
--   uyeler tablosunda RLS açık ve HİÇ policy yok → anon anahtarıyla REST
--   üzerinden okunamaz/yazılamaz. Tüm erişim aşağıdaki SECURITY DEFINER
--   fonksiyonlardan geçer ve oturum anahtarı her çağrıda doğrulanır.
-- ============================================================================

-- Beğeni, yorum silme ve hesapsız yorum sahipliği için ayrıca
-- `supabase/yorum-etkilesim.sql` dosyasını da çalıştır.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tablolar --
create table if not exists public.uyeler (
  id            uuid primary key default gen_random_uuid(),
  kadi          text not null unique,
  ad            text not null,
  sifre         text not null,                                  -- bcrypt özeti
  ilgi          text[] not null default '{}',                   -- ilgi alanları (slug)
  bildirim_ilgi text[] not null default '{}',                   -- bildirim ilgi alanları
  oturum_hash   text,                                           -- sha256(token)
  olusturma     timestamptz not null default now(),
  guncelleme    timestamptz not null default now(),
  constraint uyeler_kadi_bicim check (kadi ~ '^[a-z0-9_.]{3,24}$')
);

-- Yönetici rozeti ve bildirim sıklığı (sonradan eklendi; mevcut hesaplar bozulmaz).
alter table public.uyeler add column if not exists rol text not null default 'uye';
alter table public.uyeler add column if not exists etiket text not null default '';
alter table public.uyeler add column if not exists bildirim_siklik text not null default 'aninda';

alter table public.uyeler drop constraint if exists uyeler_rol_bicim;
alter table public.uyeler
  add constraint uyeler_rol_bicim check (rol in ('uye', 'yonetici'));

alter table public.uyeler drop constraint if exists uyeler_siklik_bicim;
alter table public.uyeler
  add constraint uyeler_siklik_bicim check (bildirim_siklik in ('aninda', 'ozet', 'son'));

-- Yorumları hesaba bağla: dolu ise yorumu bir üye yazmıştır (görünen adı
-- profilden gelir). NULL ise hesapsız (eski) yorumdur. Tablo yeniden
-- oluşturulmaz; kolon eklenir.
alter table public.yorumlar
  add column if not exists uye_id uuid references public.uyeler(id) on delete set null;

-- Yorum yazıldığı andaki rozet (ör. "Yönetici"). Yorum listesinde gösterilir;
-- rozet sonradan değişse eski yorumlar yazıldığı andaki rozeti korur.
alter table public.yorumlar add column if not exists etiket text not null default '';

create index if not exists yorumlar_uye_idx on public.yorumlar (uye_id);

-- Güvenlik: uyeler tablosu dışarı tamamen kapalı (yalnızca fonksiyonlar erişir).
alter table public.uyeler enable row level security;

-- Hesapsız (anon) yorum eklerken uye_id YAZILAMAZ; yalnızca RPC ile atanır.
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
    and uye_id is null
    and created_at <= now() + interval '1 minute'
  );

-- --------------------------------------------------------------- yardımcılar --
-- Oturum anahtarını doğrular. Geçerliyse üye satırını döndürür, değilse NULL.
create or replace function public.uye_dogrula(p_id uuid, p_token text)
returns public.uyeler
language sql
security definer
set search_path = public, extensions
as $$
  select u.* from public.uyeler u
  where u.id = p_id
    and p_token is not null
    and u.oturum_hash = encode(digest(p_token, 'sha256'), 'hex');
$$;

-- ------------------------------------------------------------------- kayıt --
create or replace function public.uye_kayit(p_kadi text, p_sifre text, p_ad text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_kadi text := lower(btrim(coalesce(p_kadi, '')));
  v_ad   text := nullif(btrim(coalesce(p_ad, '')), '');
  v_id   uuid;
  v_token text := encode(gen_random_bytes(24), 'hex');
begin
  if v_kadi !~ '^[a-z0-9_.]{3,24}$' then
    return jsonb_build_object('hata', 'Kullanıcı adı 3-24 karakter olmalı; yalnızca harf, rakam, nokta ve alt çizgi.');
  end if;
  if char_length(coalesce(p_sifre, '')) < 6 then
    return jsonb_build_object('hata', 'Şifre en az 6 karakter olmalı.');
  end if;
  if exists (select 1 from public.uyeler where kadi = v_kadi) then
    return jsonb_build_object('hata', 'Bu kullanıcı adı alınmış.');
  end if;

  insert into public.uyeler (kadi, ad, sifre, oturum_hash)
  values (
    v_kadi,
    coalesce(v_ad, v_kadi),
    crypt(p_sifre, gen_salt('bf', 8)),
    encode(digest(v_token, 'sha256'), 'hex')
  )
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id, 'kadi', v_kadi, 'ad', coalesce(v_ad, v_kadi), 'token', v_token
  );
end;
$$;

-- -------------------------------------------------------------------- giriş --
create or replace function public.uye_giris(p_kadi text, p_sifre text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_kadi text := lower(btrim(coalesce(p_kadi, '')));
  v_uye  public.uyeler;
  v_token text := encode(gen_random_bytes(24), 'hex');
begin
  select * into v_uye from public.uyeler where kadi = v_kadi;
  if v_uye.id is null or v_uye.sifre <> crypt(coalesce(p_sifre, ''), v_uye.sifre) then
    return jsonb_build_object('hata', 'Kullanıcı adı veya şifre hatalı.');
  end if;

  update public.uyeler
     set oturum_hash = encode(digest(v_token, 'sha256'), 'hex'),
         guncelleme  = now()
   where id = v_uye.id;

  return jsonb_build_object(
    'id', v_uye.id, 'kadi', v_uye.kadi, 'ad', v_uye.ad, 'token', v_token,
    'ilgi', v_uye.ilgi, 'bildirim_ilgi', v_uye.bildirim_ilgi, 'avatar', v_uye.avatar,
    'rol', v_uye.rol, 'etiket', v_uye.etiket, 'bildirim_siklik', v_uye.bildirim_siklik
  );
end;
$$;

-- ------------------------------------------------------------------ çıkış ----
create or replace function public.uye_cikis(p_id uuid, p_token text)
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  update public.uyeler
     set oturum_hash = null, guncelleme = now()
   where id = p_id
     and oturum_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
  returning jsonb_build_object('ok', true);
$$;

-- --------------------------------------------------------- profil getir ----
create or replace function public.uye_bilgi(p_id uuid, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_uye public.uyeler;
begin
  v_uye := public.uye_dogrula(p_id, p_token);
  if v_uye.id is null then return jsonb_build_object('hata', 'Oturum geçersiz.'); end if;
  return jsonb_build_object(
    'id', v_uye.id, 'kadi', v_uye.kadi, 'ad', v_uye.ad,
    'ilgi', v_uye.ilgi, 'bildirim_ilgi', v_uye.bildirim_ilgi,
    'avatar', v_uye.avatar, 'olusturma', v_uye.olusturma,
    'rol', v_uye.rol, 'etiket', v_uye.etiket, 'bildirim_siklik', v_uye.bildirim_siklik
  );
end;
$$;

-- --------------------------------------------------------- profil güncelle --
create or replace function public.uye_guncelle(
  p_id uuid, p_token text, p_ad text,
  p_ilgi text[] default null, p_bildirim_ilgi text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_uye public.uyeler; v_ad text;
begin
  v_uye := public.uye_dogrula(p_id, p_token);
  if v_uye.id is null then return jsonb_build_object('hata', 'Oturum geçersiz.'); end if;

  v_ad := nullif(btrim(coalesce(p_ad, '')), '');
  if v_ad is not null and (char_length(v_ad) < 2 or char_length(v_ad) > 40) then
    return jsonb_build_object('hata', 'Görünen ad 2-40 karakter olmalı.');
  end if;

  update public.uyeler
     set ad            = coalesce(v_ad, ad),
         ilgi          = coalesce(p_ilgi, ilgi),
         bildirim_ilgi = coalesce(p_bildirim_ilgi, bildirim_ilgi),
         guncelleme    = now()
   where id = v_uye.id;

  return jsonb_build_object(
    'ok', true, 'id', v_uye.id,
    'ad', coalesce(v_ad, v_uye.ad),
    'ilgi', coalesce(p_ilgi, v_uye.ilgi),
    'bildirim_ilgi', coalesce(p_bildirim_ilgi, v_uye.bildirim_ilgi)
  );
end;
$$;

-- --------------------------------------------------- bildirim sıklığı ------
-- Okuyucu profilden seçer: aninda (her konu), ozet (günde 3 özet), son (yalnızca son dakika).
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
  if v_siklik not in ('aninda', 'ozet', 'son') then
    return jsonb_build_object('hata', 'Geçersiz bildirim sıklığı.');
  end if;
  update public.uyeler
     set bildirim_siklik = v_siklik, guncelleme = now()
   where id = v_uye.id;
  return jsonb_build_object('ok', true, 'bildirim_siklik', v_siklik);
end;
$$;

-- ------------------------------------------------------------- yönetici ----
-- Oturumun yönetici olup olmadığını döndürür (token doğrulanır).
create or replace function public.admin_mi(p_id uuid, p_token text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select coalesce((
    select u.rol = 'yonetici'
    from public.uyeler u
    where u.id = p_id
      and u.oturum_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
  ), false);
$$;

-- Kayıtlı okuyucuların listesi (yalnızca yönetici).
create or replace function public.admin_uyeler(p_id uuid, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.admin_mi(p_id, p_token) then
    return jsonb_build_object('hata', 'Bu bölüm yalnızca yöneticiye açık.');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', u.id, 'kadi', u.kadi, 'ad', u.ad,
      -- Yüklenen fotoğraflar base64 olabilir; listeyi şişirmemek için yalnızca
      -- hazır avatar yolları döner, diğerlerinde baş harf gösterilir.
      'avatar', case when u.avatar like '/avatar/%' then u.avatar else null end,
      'rol', u.rol, 'etiket', u.etiket, 'olusturma', u.olusturma,
      'yorum', (select count(*) from public.yorumlar y where y.uye_id = u.id)
    ) order by u.olusturma asc)
    from public.uyeler u
  ), '[]'::jsonb);
end;
$$;

-- Bir okuyucuya rozet yaz (yalnızca yönetici).
-- Rozet SADECE görünür; yetki VERMEZ. p_rol eski istemcilerle uyumluluk
-- için duruyor ama bilerek yok sayılıyor; rol asla değiştirilmez.
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
    'ok', true, 'id', v_hedef.id,
    'etiket', coalesce(v_etiket, ''),
    'rol', v_hedef.rol
  );
end;
$$;

-- ---------------------------------------------- üye olarak yorum ekle ------
create or replace function public.uye_yorum_ekle(
  p_id uuid, p_token text, p_slug text, p_metin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_uye public.uyeler; v_metin text := btrim(coalesce(p_metin, '')); v_id bigint;
begin
  v_uye := public.uye_dogrula(p_id, p_token);
  if v_uye.id is null then return jsonb_build_object('hata', 'Oturum geçersiz.'); end if;
  if char_length(v_metin) < 2 then return jsonb_build_object('hata', 'Yorum çok kısa.'); end if;
  if char_length(v_metin) > 1200 then return jsonb_build_object('hata', 'Yorum çok uzun.'); end if;
  if char_length(coalesce(p_slug,'')) < 1 or char_length(p_slug) > 300 then
    return jsonb_build_object('hata', 'Geçersiz haber.');
  end if;

  insert into public.yorumlar (slug, ad, metin, uye_id, etiket)
  values (p_slug, left(v_uye.ad, 40), v_metin, v_uye.id, left(coalesce(v_uye.etiket, ''), 24))
  returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'ad', left(v_uye.ad, 40), 'metin', v_metin,
    'etiket', left(coalesce(v_uye.etiket, ''), 24)
  );
end;
$$;

-- ------------------------------------------------- üyenin yorumları -------
create or replace function public.uye_yorumlar(p_id uuid, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_uye public.uyeler;
begin
  v_uye := public.uye_dogrula(p_id, p_token);
  if v_uye.id is null then return jsonb_build_object('hata', 'Oturum geçersiz.');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('slug', y.slug, 'metin', y.metin, 'created_at', y.created_at)
                     order by y.created_at desc)
    from public.yorumlar y
    where y.uye_id = v_uye.id and y.gizli = false
  ), '[]'::jsonb);
end;
$$;

-- --------------------------------------------------------- yetkiler -------
grant execute on function public.uye_kayit(text, text, text)            to anon, authenticated;
grant execute on function public.uye_giris(text, text)                  to anon, authenticated;
grant execute on function public.uye_cikis(uuid, text)                  to anon, authenticated;
grant execute on function public.uye_bilgi(uuid, text)                  to anon, authenticated;
grant execute on function public.uye_guncelle(uuid, text, text, text[], text[]) to anon, authenticated;
grant execute on function public.uye_bildirim_siklik(uuid, text, text)   to anon, authenticated;
grant execute on function public.admin_mi(uuid, text)                   to anon, authenticated;
grant execute on function public.admin_uyeler(uuid, text)               to anon, authenticated;
grant execute on function public.admin_etiket(uuid, text, uuid, text, text) to anon, authenticated;
grant execute on function public.uye_yorum_ekle(uuid, text, text, text) to anon, authenticated;
grant execute on function public.uye_yorumlar(uuid, text)               to anon, authenticated;

-- ============================================================================
-- OKUMA LİSTESİ (haberi kaydet) — hesaba bağlı
-- ----------------------------------------------------------------------------
-- Okuyucu bir haberi kaydeder; liste hesabıyla taşınır (cihaz değişse de durur).
-- Tablo dışarı kapalıdır; erişim yalnızca oturum doğrulayan fonksiyonlardan.
-- ============================================================================
create table if not exists public.kayitlar (
  uye_id     uuid not null references public.uyeler(id) on delete cascade,
  slug       text not null,
  baslik     text not null default '',
  created_at timestamptz not null default now(),
  primary key (uye_id, slug)
);

alter table public.kayitlar enable row level security;

create or replace function public.uye_kaydet(
  p_id uuid, p_token text, p_slug text, p_baslik text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v public.uyeler;
begin
  v := public.uye_dogrula(p_id, p_token);
  if v.id is null then return jsonb_build_object('hata', 'Oturum geçersiz.'); end if;
  if char_length(coalesce(p_slug, '')) < 1 or char_length(p_slug) > 300 then
    return jsonb_build_object('hata', 'Geçersiz haber.');
  end if;

  insert into public.kayitlar (uye_id, slug, baslik)
  values (v.id, p_slug, left(coalesce(p_baslik, ''), 200))
  on conflict (uye_id, slug) do update set baslik = excluded.baslik;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.uye_kayit_sil(p_id uuid, p_token text, p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v public.uyeler;
begin
  v := public.uye_dogrula(p_id, p_token);
  if v.id is null then return jsonb_build_object('hata', 'Oturum geçersiz.'); end if;
  delete from public.kayitlar where uye_id = v.id and slug = p_slug;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.uye_kayitlar(p_id uuid, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v public.uyeler;
begin
  v := public.uye_dogrula(p_id, p_token);
  if v.id is null then return jsonb_build_object('hata', 'Oturum geçersiz.'); end if;
  return coalesce((
    select jsonb_agg(
             jsonb_build_object('slug', k.slug, 'baslik', k.baslik, 'created_at', k.created_at)
             order by k.created_at desc
           )
    from public.kayitlar k
    where k.uye_id = v.id
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.uye_kaydet(uuid, text, text, text) to anon, authenticated;
grant execute on function public.uye_kayit_sil(uuid, text, text)    to anon, authenticated;
grant execute on function public.uye_kayitlar(uuid, text)          to anon, authenticated;

-- ============================================================================
-- PROFİL FOTOĞRAFI — hazır (emoji) ya da okuyucunun kendi yüklediği görsel
-- ----------------------------------------------------------------------------
-- İki tür değer kabul edilir:
--   * hazır avatar: sitenin kendi çizimi ("/avatar/kedi.svg")
--   * kendi fotoğrafı: tarayıcıda 128 px'e küçültülmüş data URL
--     ("data:image/jpeg;base64,...") ya da https:// ile başlayan görsel adresi
-- Geriye dönük uyumluluk için eski emoji avatarlar da geçerlidir.
--
-- Yorumlarda gösterebilmek için avatarlar ayrı ve HERKESE AÇIK bir tabloda
-- tutulur (avatarlar). Orada yalnızca üye numarası + görsel vardır; ad,
-- kullanıcı adı, şifre gibi bilgiler yine kapalıdır.
-- ============================================================================
alter table public.uyeler add column if not exists avatar text;

create table if not exists public.avatarlar (
  uye_id     uuid primary key references public.uyeler(id) on delete cascade,
  avatar     text not null,
  guncelleme timestamptz not null default now()
);

alter table public.avatarlar enable row level security;

-- Yalnızca okuma açıktır (yorum listesinde avatar göstermek için).
drop policy if exists "avatar oku" on public.avatarlar;
create policy "avatar oku"
  on public.avatarlar
  for select
  to anon, authenticated
  using (true);

create or replace function public.uye_avatar(p_id uuid, p_token text, p_avatar text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v public.uyeler; v_avatar text;
begin
  v := public.uye_dogrula(p_id, p_token);
  if v.id is null then return jsonb_build_object('hata', 'Oturum geçersiz.'); end if;

  v_avatar := nullif(btrim(coalesce(p_avatar, '')), '');

  -- Boş gönderim: fotoğrafı kaldır (baş harfe döner).
  if v_avatar is null then
    update public.uyeler set avatar = null where id = v.id;
    delete from public.avatarlar where uye_id = v.id;
    return jsonb_build_object('ok', true, 'avatar', null);
  end if;

  if v_avatar like 'data:image/%' then
    if char_length(v_avatar) > 60000 then
      return jsonb_build_object('hata', 'Fotoğraf çok büyük. Daha küçük bir görsel dene.');
    end if;
    if v_avatar !~ '^data:image/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$' then
      return jsonb_build_object('hata', 'Fotoğraf biçimi desteklenmiyor.');
    end if;
  elsif v_avatar like 'https://%' then
    if char_length(v_avatar) > 500 then
      return jsonb_build_object('hata', 'Görsel bağlantısı çok uzun.');
    end if;
  elsif v_avatar ~ '^/avatar/[a-z0-9-]{1,32}\.(svg|webp)$' then
    -- sitenin kendi çizimi / AI ile üretilmiş hazır avatar (ör. /avatar/kedi.webp)
    null;
  elsif v_avatar ~ '^[^<>"&[:cntrl:]]{1,8}$' then
    -- eski emoji avatarlar (geriye dönük uyumluluk)
    null;
  else
    return jsonb_build_object('hata', 'Geçersiz profil fotoğrafı.');
  end if;

  update public.uyeler set avatar = v_avatar where id = v.id;

  insert into public.avatarlar (uye_id, avatar, guncelleme)
  values (v.id, v_avatar, now())
  on conflict (uye_id) do update set avatar = excluded.avatar, guncelleme = now();

  return jsonb_build_object('ok', true, 'avatar', v_avatar);
end;
$$;

-- ============================================================================
-- BEĞENİLER — hesaba bağlı (Shorts'ta kalp)
-- ----------------------------------------------------------------------------
-- Cihazda kalıcı olmasının yanında hesaba da yazılır; başka cihazda giriş
-- yapınca beğendiklerin yerinde durur.
-- ============================================================================
create table if not exists public.begeniler (
  uye_id     uuid not null references public.uyeler(id) on delete cascade,
  slug       text not null,
  created_at timestamptz not null default now(),
  primary key (uye_id, slug)
);

alter table public.begeniler enable row level security;

create or replace function public.uye_begen(p_id uuid, p_token text, p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v public.uyeler;
begin
  v := public.uye_dogrula(p_id, p_token);
  if v.id is null then return jsonb_build_object('hata', 'Oturum geçersiz.'); end if;
  if char_length(coalesce(p_slug, '')) < 1 or char_length(p_slug) > 300 then
    return jsonb_build_object('hata', 'Geçersiz haber.');
  end if;
  insert into public.begeniler (uye_id, slug) values (v.id, p_slug)
  on conflict (uye_id, slug) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.uye_begen_sil(p_id uuid, p_token text, p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v public.uyeler;
begin
  v := public.uye_dogrula(p_id, p_token);
  if v.id is null then return jsonb_build_object('hata', 'Oturum geçersiz.'); end if;
  delete from public.begeniler where uye_id = v.id and slug = p_slug;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.uye_begeniler(p_id uuid, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v public.uyeler;
begin
  v := public.uye_dogrula(p_id, p_token);
  if v.id is null then return jsonb_build_object('hata', 'Oturum geçersiz.'); end if;
  return coalesce((
    select jsonb_agg(b.slug order by b.created_at desc)
    from public.begeniler b
    where b.uye_id = v.id
  ), '[]'::jsonb);
end;
$$;

-- ============================================================================
-- HESABI SİL — okuyucunun kendi hesabını kapatma hakkı
-- ----------------------------------------------------------------------------
-- Silinen hesabın avatarı, okuma listesi ve beğenileri de silinir (cascade).
-- Yorumlar SİLİNMEZ; yalnızca hesap bağı kopar (uye_id null) ve yorum takma
-- adıyla görünmeye devam eder. Böylece hem hesap kapanır hem sohbet bozulmaz.
-- ============================================================================
create or replace function public.uye_sil(p_id uuid, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v public.uyeler;
begin
  v := public.uye_dogrula(p_id, p_token);
  if v.id is null then return jsonb_build_object('hata', 'Oturum geçersiz.'); end if;
  delete from public.uyeler where id = v.id;
  return jsonb_build_object('ok', true);
end;
$$;

grant select on public.avatarlar to anon, authenticated;
grant execute on function public.uye_avatar(uuid, text, text)     to anon, authenticated;
grant execute on function public.uye_begen(uuid, text, text)     to anon, authenticated;
grant execute on function public.uye_begen_sil(uuid, text, text) to anon, authenticated;
grant execute on function public.uye_begeniler(uuid, text)       to anon, authenticated;
grant execute on function public.uye_sil(uuid, text)             to anon, authenticated;

-- ============================================================================
-- HERKESE AÇIK KULLANICI PROFİLİ VE YORUMLARI
-- ----------------------------------------------------------------------------
-- Yorumlarda okuyucunun adına/avatarına tıklandığında herkese açık profilini,
-- paylaştığı yorumları ve beğendiği haber/videoları (Shorts) görüntüler.
-- Şifre, oturum hash ve kişisel bildirim ayarları dışarıya ASLA sızmaz.
-- ============================================================================
create or replace function public.kullanici_profil(
  p_kadi text default null,
  p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uye public.uyeler;
  v_kadi text := lower(btrim(coalesce(p_kadi, '')));
  v_yorum_sayisi int := 0;
  v_begeniler jsonb := '[]'::jsonb;
begin
  if p_id is not null then
    select * into v_uye from public.uyeler where id = p_id;
  elsif v_kadi <> '' then
    select * into v_uye from public.uyeler where kadi = v_kadi or lower(ad) = v_kadi limit 1;
  end if;

  if v_uye.id is not null then
    select count(*)::int into v_yorum_sayisi
    from public.yorumlar y
    where y.uye_id = v_uye.id and y.gizli = false;

    select coalesce(jsonb_agg(b.slug order by b.created_at desc), '[]'::jsonb)
    into v_begeniler
    from public.begeniler b
    where b.uye_id = v_uye.id;

    return jsonb_build_object(
      'id', v_uye.id,
      'kadi', v_uye.kadi,
      'ad', v_uye.ad,
      'avatar', v_uye.avatar,
      'rol', v_uye.rol,
      'etiket', coalesce(v_uye.etiket, ''),
      'olusturma', v_uye.olusturma,
      'yorum_sayisi', v_yorum_sayisi,
      'begeni_sayisi', coalesce(jsonb_array_length(v_begeniler), 0),
      'begeniler', v_begeniler
    );
  end if;

  -- Hesapsız okur: takma adla yazılmış açık yorumlar
  select count(*)::int into v_yorum_sayisi
  from public.yorumlar y
  where y.ad = coalesce(p_kadi, 'Okur') and y.gizli = false;

  return jsonb_build_object(
    'id', null,
    'kadi', null,
    'ad', coalesce(p_kadi, 'Okur'),
    'avatar', null,
    'rol', 'okur',
    'etiket', '',
    'olusturma', null,
    'yorum_sayisi', v_yorum_sayisi,
    'begeni_sayisi', 0,
    'begeniler', '[]'::jsonb
  );
end;
$$;

create or replace function public.kullanici_yorumlar(
  p_kadi text default null,
  p_id uuid default null,
  p_limit int default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uye_id uuid := p_id;
  v_kadi text := btrim(coalesce(p_kadi, ''));
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if v_uye_id is null and v_kadi <> '' then
    select id into v_uye_id from public.uyeler where kadi = lower(v_kadi) or lower(ad) = lower(v_kadi) limit 1;
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', y.id,
        'slug', y.slug,
        'metin', y.metin,
        'created_at', y.created_at,
        'etiket', coalesce(y.etiket, ''),
        'ad', y.ad,
        'begeni', (
          select count(*)::int
          from public.yorum_begeniler b
          where b.yorum_id = y.id
        )
      )
      order by y.created_at desc
    )
    from (
      select y.*
      from public.yorumlar y
      where y.gizli = false
        and (
          (v_uye_id is not null and y.uye_id = v_uye_id)
          or (v_uye_id is null and v_kadi <> '' and y.ad = v_kadi)
        )
      order by y.created_at desc
      limit v_limit
    ) y
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.kullanici_profil(text, uuid) to anon, authenticated;
grant execute on function public.kullanici_yorumlar(text, uuid, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- İLK YÖNETİCİ: Hiç yönetici yoksa en eski hesap otomatik yönetici olur.
-- (Site sahibinin hesabı genellikle ilk açılan hesaptır. Farklı biri
--  yönetici olduysa aşağıdaki update'i kendi kullanıcı adınla çalıştırabilirsin.)
-- ---------------------------------------------------------------------------
update public.uyeler
   set rol = 'yonetici',
       etiket = case when etiket = '' then 'Yönetici' else etiket end
 where id = (select id from public.uyeler order by olusturma asc limit 1)
   and not exists (select 1 from public.uyeler where rol = 'yonetici');

-- Yönetici yanlış hesaba atandıysa: aşağıdaki satırın başındaki --'leri silip
-- kendi kullanıcı adını yaz, sonra yalnızca bu satırı çalıştır.
-- update public.uyeler set rol = 'yonetici', etiket = 'Yönetici' where kadi = 'kullanici_adin';

-- PostgREST şema önbelleğini tazele: yeni fonksiyonlar hemen görünsün.
notify pgrst, 'reload schema';
