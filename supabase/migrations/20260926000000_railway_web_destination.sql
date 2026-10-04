-- Durante el corte se aceptan ambos orígenes. Los builds viejos siguen en
-- Vercel y los nuevos comparten web + API en Railway.
begin;
create or replace function app_private.update_destination(p_platform text,p_url text) returns boolean
language sql immutable set search_path=pg_catalog as $$
  select coalesce(length(p_url)<=2048 and p_url !~ '[[:space:]]' and case
    when p_platform='web' then p_url ~ '^https://(dnmusic-app\.vercel\.app|dnmusic-production-c3f4\.up\.railway\.app)/(\?[A-Za-z0-9_=&.%~-]*)?$'
    when p_platform='ios' then p_url ~ '^https://(apps\.apple\.com/([a-z]{2}/)?app/([a-zA-Z0-9-]+/)?id[0-9]+|testflight\.apple\.com/join/[A-Za-z0-9]+)$'
    when p_platform in ('windows','linux','macos','android') then
      (p_platform='android' and p_url='https://play.google.com/store/apps/details?id=com.nihuel.dnmusic') or
      p_url ~ '^https://github\.com/Niiihuel/dnmusic-releases/releases/(latest|tag/v?[0-9]+\.[0-9]+\.[0-9]+|download/v?[0-9]+\.[0-9]+\.[0-9]+/[A-Za-z0-9_.-]+)$'
    else false end,false);
$$;
revoke all on function app_private.update_destination(text,text) from public,anon,authenticated,app_pending,service_role;
commit;
