-- ============================================================================
-- HaberinAi — yorum bildirimleri (beğeni + yanıt) ve yorum yanıtlama
-- ============================================================================
-- NE YAPAR
--   * Biri yorumunu BEĞENİRSE yorum sahibine anında push bildirimi gider.
--   * Bir yoruma YANIT yazılırsa, yanıtlanan yorumun sahibine push gider.
--   * `yorumlar.ust_id` kolonu eklenir: yanıtın hangi yoruma bağlı olduğunu tutar.
--   * `yorum_yanit_ekle_anon` (hesapsız) ve `uye_yanit_ekle` (üye) RPC'leri eklenir.
--   * Kimseye kendi beğenisi/yanıtı için bildirim gitmez; aynı beğeni 6 saatte,
--     aynı yanıt 1 saatte bir bildirilir (spam olmasın).
--
-- KURULUM (sırayla)
--   1) Bu dosyayı Supabase → SQL Editor'de bir kez çalıştır.
--   2) OneSignal REST anahtarını yaz (App ID zaten dolu gelir):
--        update public.bildirim_ayar
--           set onesignal_anahtar = '<REST API Key>'
--         where id;
--   3) pg_net uzantısı AÇIK olmalı: Dashboard → Database → Extensions → pg_net.
--      Kapalıysa HTTP isteği gönderilemez ve bildirimler sessizce atlanır
--      (yorumlar, beğeniler çalışmaya devam eder).
--   4) Cihazların hedeflenebilmesi için sitedeki `yorum_kimlik_u` /
--      `yorum_kimlik_c` etiketlerini yazan kod dağıtılmış olmalı
--      (site/public/hesap.js + site/src/components/Yorumlar.astro).
--
-- TEŞHİS
--   Son gönderim denemeleri:
--     select id, status_code, left(content, 200) as yanit, error_msg
--       from net._http_response order by id desc limit 5;
--   Gönderim kaydı (kim kime, ne zaman):
--     select yorum_id, tur, alici, begenen, olusma
--       from public.bildirim_kayit order by olusma desc limit 20;
--   Test gönderimi (kendi cihazına gider; etiketi bilmen gerekir):
--     select public.hb_push('yorum_kimlik_c', '<cihaz anahtarı>',
--                           'Test', 'Bildirim çalışıyor', 'https://haberinai.site');
--
-- GÜVENLİK
--   * OneSignal REST anahtarı YALNIZCA veritabanında durur; ne depoda ne
--     tarayıcıda. `bildirim_ayar` tablosunda RLS açık ve HİÇ politika yok →
--     anon/authenticated okuyamaz.
--   * Hedefleme OneSignal etiketiyle yapılır: cihaz yalnızca kendi anonim
--     kimliğini (`yorum_kimlik_c`, rastgele UUID) ya da kendi üye numarasını
--     (`yorum_kimlik_u`) taşır. Kimse başkasının etiket değerini öğrenemez.
--   * `hb_push` anon'a KAPALIDIR (yoksa herkes bildirim gönderebilirdi).
-- ============================================================================

-- --------------------------------------------------------------- pg_net ----
-- Veritabanından HTTP isteği çıkarmak için kullanılır (OneSignal REST).
do $$
begin
  begin
    execute 'create extension if not exists pg_net with schema net';
  exception when others then
    begin
      execute 'create extension if not exists pg_net';
    exception when others then
      raise notice 'pg_net açılamadı; bildirimler gönderilemez (Dashboard → Database → Extensions).';
    end;
  end;
  begin
    -- HTTP isteğini security definer fonksiyonlar (postgres) atar.
    execute 'grant usage on schema net to postgres';
  exception when others then
    null;
  end;
end $$;

-- ------------------------------------------------------- yanıt bağlantısı --
-- Yanıtlar bir üst yoruma bağlanır; üst yorum silinirse yanıtları da gider.
alter table public.yorumlar add column if not exists ust_id bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'yorumlar_ust_fk'
      and conrelid = 'public.yorumlar'::regclass
  ) then
    alter table public.yorumlar
      add constraint yorumlar_ust_fk foreign key (ust_id)
      references public.yorumlar (id) on delete cascade;
  end if;
end $$;

create index if not exists yorumlar_ust_idx on public.yorumlar (ust_id);

-- ------------------------------------------------------------- ayarlar -----
-- Tek satırlık ayar tablosu. Politika YOK: yalnızca security definer
-- fonksiyonlar (ve SQL Editor) erişir.
create table if not exists public.bildirim_ayar (
  id                boolean primary key default true,
  onesignal_app_id  text not null default 'fd1804a3-90d0-4c95-9bf0-c147f9a1d0c7',
  onesignal_anahtar text not null default '',
  site_url          text not null default 'https://haberinai.site',
  constraint bildirim_ayar_tek_satir check (id)
);

alter table public.bildirim_ayar enable row level security;

insert into public.bildirim_ayar (id) values (true) on conflict (id) do nothing;

-- ----------------------------------------------------- gönderim kaydı -----
-- Aynı beğeninin tekrar tekrar bildirilmemesi (ve teşhis) için tutulur.
create table if not exists public.bildirim_kayit (
  id       bigint generated always as identity primary key,
  yorum_id bigint,
  alici    text not null,
  tur      text not null,             -- begeni | yanit
  begenen  text,                      -- bildirimi tetikleyen kimlik
  olusma   timestamptz not null default now()
);

create index if not exists bildirim_kayit_bakis_idx
  on public.bildirim_kayit (yorum_id, tur, olusma desc);

alter table public.bildirim_kayit enable row level security;

-- 30 günden eski kayıtlar birikmesin.
delete from public.bildirim_kayit where olusma < now() - interval '30 days';

-- ------------------------------------------------------- yardımcılar -------
/** Haber adresini üretir: <site_url>/haber/<slug>/ */
create or replace function public.hb_yorum_url(p_slug text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rtrim((select site_url from public.bildirim_ayar where id), '/')
         || '/haber/' || coalesce(p_slug, '') || '/';
$$;

/**
 * Tek bir kullanıcıya (OneSignal etiketiyle) push gönderir.
 *
 * HİÇBİR DURUMDA hata fırlatmaz: bildirim gönderilemezse yorum/beğeni yine de
 * kaydedilmeli. Sessizce döner.
 */
create or replace function public.hb_push(
  p_etiket text,   -- yorum_kimlik_u | yorum_kimlik_c
  p_deger  text,   -- etiketin değeri (üye uuid'si ya da cihaz anahtarı)
  p_baslik text,
  p_metin  text,
  p_url    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ayar  public.bildirim_ayar;
  v_sema  text;
  v_govde jsonb;
begin
  begin
    select * into v_ayar from public.bildirim_ayar where id;

    if v_ayar.onesignal_anahtar = ''
       or coalesce(p_etiket, '') = ''
       or coalesce(p_deger, '') = ''
       or coalesce(v_ayar.onesignal_app_id, '') = '' then
      return;
    end if;

    -- pg_net hangi şemaya kurulduysa onu kullan (net ya da extensions).
    select n.nspname into v_sema
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_net';
    if v_sema is null then
      return;
    end if;

    v_govde := jsonb_build_object(
      'app_id', v_ayar.onesignal_app_id,
      'target_channel', 'push',
      'headings', jsonb_build_object('tr', left(p_baslik, 60), 'en', left(p_baslik, 60)),
      'contents', jsonb_build_object('tr', left(p_metin, 140), 'en', left(p_metin, 140)),
      'url', p_url,
      'chrome_web_icon', rtrim(v_ayar.site_url, '/') || '/ikon-192.png',
      'chrome_web_badge', rtrim(v_ayar.site_url, '/') || '/ikon-192.png',
      -- Hedef: yalnızca bu etiketi taşıyan cihazlar (tek kişi).
      'filters', jsonb_build_array(
        jsonb_build_object('field', 'tag', 'key', p_etiket, 'relation', '=', 'value', p_deger)
      )
    );

    execute format(
      '%I.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb, timeout_milliseconds := 8000)',
      v_sema,
      'https://api.onesignal.com/notifications',
      jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Key ' || v_ayar.onesignal_anahtar
      )::text,
      v_govde::text
    );
  exception when others then
    -- Bildirim yüzünden yorum/beğeni kaydı bozulmasın.
    null;
  end;
end;
$$;

-- Gönderimi yalnızca sunucu içindeki trigger/RPC'ler yapabilir.
revoke all on function public.hb_push(text, text, text, text, text) from public;
revoke all on function public.hb_push(text, text, text, text, text) from anon, authenticated;
grant execute on function public.hb_push(text, text, text, text, text) to service_role;

/**
 * Yorum sahibinin bildirim kimliğini üretir.
 *   üye yorumu    → 'u:<üye uuid>'   (etiket: yorum_kimlik_u)
 *   hesapsız yorum → 'c:<cihaz>'     (etiket: yorum_kimlik_c)
 * Sahip bilinmiyorsa null.
 */
create or replace function public.hb_yorum_sahibi(p_yorum bigint)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_yorum public.yorumlar;
  v_cihaz text;
begin
  select * into v_yorum from public.yorumlar where id = p_yorum;
  if v_yorum.id is null then
    return null;
  end if;
  if v_yorum.uye_id is not null then
    return 'u:' || v_yorum.uye_id::text;
  end if;
  select s.cihaz into v_cihaz
  from public.yorum_sahiplik s
  where s.yorum_id = p_yorum;
  if coalesce(v_cihaz, '') = '' then
    return null;
  end if;
  return 'c:' || v_cihaz;
end;
$$;

revoke all on function public.hb_yorum_sahibi(bigint) from public;
grant execute on function public.hb_yorum_sahibi(bigint) to service_role;

-- --------------------------------------------------- beğeni → bildirim -----
/**
 * Yorum beğenildiğinde sahibine bildirim gönderir.
 *
 * `yorum_begeniler` tablosuna EKLEME olduğunda çalışır; beğeni geri alınınca
 * (silme) bir şey yapmaz. Beğenen kendi yorumunu beğendiyse atlanır.
 */
create or replace function public.yorum_begeni_bildir()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alici  text;
  v_etiket text;
  v_deger  text;
  v_yorum  public.yorumlar;
begin
  begin
    v_alici := public.hb_yorum_sahibi(new.yorum_id);
    -- Sahip bilinmiyor ya da kendi yorumunu kendisi beğendi.
    if v_alici is null or v_alici = new.kimlik then
      return new;
    end if;

    -- Aynı kişi 6 saat içinde aynı yorumu tekrar tekrar beğenip bırakabilir;
    -- her seferinde bildirim gitmesin.
    if exists (
      select 1 from public.bildirim_kayit k
      where k.yorum_id = new.yorum_id
        and k.tur = 'begeni'
        and k.alici = v_alici
        and k.begenen = new.kimlik
        and k.olusma > now() - interval '6 hours'
    ) then
      return new;
    end if;

    insert into public.bildirim_kayit (yorum_id, alici, tur, begenen)
    values (new.yorum_id, v_alici, 'begeni', new.kimlik);

    select * into v_yorum from public.yorumlar where id = new.yorum_id;
    v_etiket := case when left(v_alici, 2) = 'u:' then 'yorum_kimlik_u' else 'yorum_kimlik_c' end;
    v_deger  := substr(v_alici, 3);

    perform public.hb_push(
      v_etiket,
      v_deger,
      'Yorumun beğenildi 👍',
      left(coalesce(nullif(btrim(v_yorum.metin), ''), 'Yorumun'), 90),
      public.hb_yorum_url(v_yorum.slug)
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists yorum_begeni_bildir_t on public.yorum_begeniler;
create trigger yorum_begeni_bildir_t
  after insert on public.yorum_begeniler
  for each row execute function public.yorum_begeni_bildir();

-- ---------------------------------------------------- yanıt → bildirim -----
/**
 * Yoruma yanıt yazıldığında yanıtlanan yorumun sahibine bildirim gönderir.
 *
 * Yanıtı yazan kimlik, RPC tarafında `set_config('hb.kimlik', …)` ile
 * işaretlenir; böylece kişi kendi yorumuna yanıt yazdığında bildirim gitmez.
 */
create or replace function public.yorum_yanit_bildir()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gonderen text := coalesce(current_setting('hb.kimlik', true), '');
  v_alici    text;
  v_etiket   text;
  v_deger    text;
  v_ust      public.yorumlar;
begin
  begin
    if new.ust_id is null then
      return new;
    end if;

    select * into v_ust from public.yorumlar where id = new.ust_id;
    if v_ust.id is null then
      return new;
    end if;

    v_alici := public.hb_yorum_sahibi(v_ust.id);
    if v_alici is null or v_alici = v_gonderen then
      return new;
    end if;

    -- Aynı yoruma 1 saat içinde aynı kişiden tek bildirim.
    if v_gonderen <> '' and exists (
      select 1 from public.bildirim_kayit k
      where k.yorum_id = v_ust.id
        and k.tur = 'yanit'
        and k.alici = v_alici
        and k.begenen = v_gonderen
        and k.olusma > now() - interval '1 hour'
    ) then
      return new;
    end if;

    insert into public.bildirim_kayit (yorum_id, alici, tur, begenen)
    values (v_ust.id, v_alici, 'yanit', nullif(v_gonderen, ''));

    v_etiket := case when left(v_alici, 2) = 'u:' then 'yorum_kimlik_u' else 'yorum_kimlik_c' end;
    v_deger  := substr(v_alici, 3);

    perform public.hb_push(
      v_etiket,
      v_deger,
      'Yorumuna yanıt geldi 💬',
      left(coalesce(new.ad, 'Bir okur') || ': ' || coalesce(new.metin, ''), 140),
      public.hb_yorum_url(new.slug)
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists yorum_yanit_bildir_t on public.yorumlar;
create trigger yorum_yanit_bildir_t
  after insert on public.yorumlar
  for each row execute function public.yorum_yanit_bildir();

-- --------------------------------------------------- hesapsız yanıt --------
/**
 * Hesabı olmayan okur bir yoruma yanıt yazar.
 * Haber (slug) üst yorumdan alınır; sahiplik yine cihaza yazılır ki okur
 * kendi yanıtını silebilsin.
 */
create or replace function public.yorum_yanit_ekle_anon(
  p_yorum bigint,
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
  v_ust public.yorumlar;
  v_ad text := left(coalesce(nullif(btrim(p_ad), ''), 'Okur'), 40);
  v_metin text := btrim(coalesce(p_metin, ''));
  v_cihaz text := btrim(coalesce(p_cihaz, ''));
  v_id bigint;
  v_tarih timestamptz;
begin
  select * into v_ust from public.yorumlar where id = p_yorum and gizli = false;
  if v_ust.id is null then
    return jsonb_build_object('hata', 'Yanıtlanacak yorum bulunamadı.');
  end if;
  if char_length(v_metin) < 2 then
    return jsonb_build_object('hata', 'Yanıt çok kısa.');
  end if;
  if char_length(v_metin) > 1200 then
    return jsonb_build_object('hata', 'Yanıt çok uzun.');
  end if;
  if char_length(v_cihaz) < 8 or char_length(v_cihaz) > 80 then
    return jsonb_build_object('hata', 'Cihaz anahtarı geçersiz; sayfayı yenileyip tekrar dene.');
  end if;

  -- Yanıtı yazan kimlik: kendi yorumuna yanıt yazarsa bildirim gitmesin.
  perform pg_catalog.set_config('hb.kimlik', 'c:' || v_cihaz, true);

  insert into public.yorumlar (slug, ad, metin, ust_id)
  values (v_ust.slug, v_ad, v_metin, v_ust.id)
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
    'benim', true,
    'ust_id', v_ust.id
  );
end;
$$;

-- ------------------------------------------------------ üye yanıtı --------
/** Üye (hesaplı okur) bir yoruma yanıt yazar. Ad ve rozet profilden gelir. */
create or replace function public.uye_yanit_ekle(
  p_id uuid,
  p_token text,
  p_yorum bigint,
  p_metin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uye public.uyeler;
  v_ust public.yorumlar;
  v_metin text := btrim(coalesce(p_metin, ''));
  v_id bigint;
  v_tarih timestamptz;
begin
  v_uye := public.uye_dogrula(p_id, p_token);
  if v_uye.id is null then
    return jsonb_build_object('hata', 'Oturum geçersiz.');
  end if;
  if char_length(v_metin) < 2 then
    return jsonb_build_object('hata', 'Yanıt çok kısa.');
  end if;
  if char_length(v_metin) > 1200 then
    return jsonb_build_object('hata', 'Yanıt çok uzun.');
  end if;

  select * into v_ust from public.yorumlar where id = p_yorum and gizli = false;
  if v_ust.id is null then
    return jsonb_build_object('hata', 'Yanıtlanacak yorum bulunamadı.');
  end if;

  perform pg_catalog.set_config('hb.kimlik', 'u:' || v_uye.id::text, true);

  insert into public.yorumlar (slug, ad, metin, uye_id, etiket, ust_id)
  values (
    v_ust.slug,
    left(v_uye.ad, 40),
    v_metin,
    v_uye.id,
    left(coalesce(v_uye.etiket, ''), 24),
    v_ust.id
  )
  returning id, created_at into v_id, v_tarih;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'ad', left(v_uye.ad, 40),
    'metin', v_metin,
    'created_at', v_tarih,
    'etiket', left(coalesce(v_uye.etiket, ''), 24),
    'begeni', 0,
    'begendim', false,
    'benim', true,
    'ust_id', v_ust.id
  );
end;
$$;

-- --------------------------------------------------------------- yetki -----
grant execute on function public.yorum_yanit_ekle_anon(bigint, text, text, text) to anon, authenticated;
grant execute on function public.uye_yanit_ekle(uuid, text, bigint, text)         to anon, authenticated;

-- PostgREST şema önbelleğini tazele (yeni RPC'ler hemen görünsün).
notify pgrst, 'reload schema';
