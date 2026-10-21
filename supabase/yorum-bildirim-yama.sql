-- ---------------------------------------------------------------------------
-- hb_push yaması
--
-- Sorun: PL/pgSQL'de EXECUTE içinde çıplak fonksiyon çağrısı geçersiz
--        ("42601 syntax error at or near net"). Başına "select" gerekir.
-- Ayrıca pg_net'in fonksiyonu eklentinin kayıtlı şemasında değil, gerçekten
-- bulunduğu şemada aranıyor ve hatalar public.bildirim_hata tablosuna yazılıyor.
--
-- Bu dosya yalnızca ilgili fonksiyonu yeniler; tek başına çalıştırılabilir.
-- ---------------------------------------------------------------------------

create table if not exists public.bildirim_hata (
  id      bigint generated always as identity primary key,
  etiket  text,
  hata    text,
  olusma  timestamptz not null default now()
);

alter table public.bildirim_hata enable row level security;

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
  v_basliklar jsonb;
  v_zamanli boolean;
begin
  begin
    select * into v_ayar from public.bildirim_ayar where id;

    if v_ayar.onesignal_anahtar = ''
       or coalesce(p_etiket, '') = ''
       or coalesce(p_deger, '') = ''
       or coalesce(v_ayar.onesignal_app_id, '') = '' then
      return;
    end if;

    -- http_post'un gerçekten bulunduğu şemayı bul (net / extensions / public).
    select n.nspname into v_sema
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'http_post'
      and n.nspname not in ('pg_catalog', 'information_schema')
    order by case n.nspname when 'net' then 1 when 'extensions' then 2 else 3 end
    limit 1;

    if v_sema is null then
      insert into public.bildirim_hata (etiket, hata)
      values (p_etiket, 'pg_net http_post bulunamadi');
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
      'filters', jsonb_build_array(
        jsonb_build_object('field', 'tag', 'key', p_etiket, 'relation', '=', 'value', p_deger)
      )
    );

    v_basliklar := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Key ' || v_ayar.onesignal_anahtar
    );

    -- Eski pg_net sürümlerinde timeout_milliseconds parametresi yok.
    select exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where p.proname = 'http_post'
        and n.nspname = v_sema
        and 'timeout_milliseconds' = any(coalesce(p.proargnames, '{}'::text[]))
    ) into v_zamanli;

    -- Dikkat: EXECUTE içinde başta "select" olmalı, yoksa 42601 hatası verir.
    if v_zamanli then
      execute format(
        'select %I.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb, timeout_milliseconds := 8000)',
        v_sema, 'https://api.onesignal.com/notifications', v_basliklar::text, v_govde::text
      );
    else
      execute format(
        'select %I.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb)',
        v_sema, 'https://api.onesignal.com/notifications', v_basliklar::text, v_govde::text
      );
    end if;
  exception when others then
    -- Bildirim yüzünden yorum/beğeni kaydı bozulmasın; ama sebebi görünsün.
    begin
      insert into public.bildirim_hata (etiket, hata)
      values (p_etiket, sqlstate || ' / ' || sqlerrm);
    exception when others then
      null;
    end;
  end;
end;
$$;

-- Gönderimi yalnızca sunucu içindeki trigger/RPC'ler yapabilir.
revoke all on function public.hb_push(text, text, text, text, text) from public;
revoke all on function public.hb_push(text, text, text, text, text) from anon, authenticated;
