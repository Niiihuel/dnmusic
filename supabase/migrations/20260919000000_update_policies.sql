-- Additive. Requires 20260916000000_access_approval.sql and its pinned owner.
-- No seed policies, no automatic enforcement, no account/profile mutations.
begin;
create function app_private.update_version(p_value text) returns integer[]
language plpgsql immutable set search_path=pg_catalog as $$
begin
  if p_value is null or p_value !~ '^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$' then
    raise exception 'invalid_stable_update_version' using errcode='22023';
  end if;
  return string_to_array(p_value,'.')::integer[];
end;
$$;
create function app_private.update_destination(p_platform text,p_url text) returns boolean
language sql immutable set search_path=pg_catalog as $$
  select coalesce(length(p_url)<=2048 and p_url !~ '[[:space:]]' and case
    when p_platform='web' then p_url ~ '^https://dnmusic-app\.vercel\.app/(\?[A-Za-z0-9_=&.%~-]*)?$'
    when p_platform='ios' then p_url ~ '^https://(apps\.apple\.com/([a-z]{2}/)?app/([a-zA-Z0-9-]+/)?id[0-9]+|testflight\.apple\.com/join/[A-Za-z0-9]+)$'
    when p_platform in ('windows','linux','macos','android') then
      (p_platform='android' and p_url='https://play.google.com/store/apps/details?id=com.nihuel.dnmusic') or
      p_url ~ '^https://github\.com/Niiihuel/dnmusic-releases/releases/(latest|tag/v?[0-9]+\.[0-9]+\.[0-9]+|download/v?[0-9]+\.[0-9]+\.[0-9]+/[A-Za-z0-9_.-]+)$'
    else false end,false);
$$;
revoke all on function app_private.update_version(text),app_private.update_destination(text,text) from public,anon,authenticated,app_pending,service_role;

create table app_private.update_policies (
  platform text primary key check (platform in ('windows','linux','macos','ios','android','web')),
  latest_version text not null,
  minimum_version text not null,
  update_url text not null,
  enabled boolean not null default false,
  revision integer not null check (revision>0),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  check (app_private.update_version(minimum_version)<=app_private.update_version(latest_version)),
  check (app_private.update_destination(platform,update_url))
);
alter table app_private.update_policies enable row level security;
revoke all on app_private.update_policies from public,anon,authenticated,app_pending,service_role;

-- The public contract excludes the administrator's UUID and other account data.
create function public.update_policy(p_platform text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
  if p_platform is null or p_platform not in ('windows','linux','macos','ios','android','web') then
    raise exception 'invalid_update_platform' using errcode='22023';
  end if;
  return (select jsonb_build_object('platform',platform,'latest_version',latest_version,
    'minimum_version',minimum_version,'update_url',update_url,'enabled',enabled,'revision',revision)
    from app_private.update_policies where platform=p_platform);
end;
$$;
create function public.admin_update_policies() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
  if not app_private.is_admin() then raise exception 'update_admin_required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(public.update_policy(platform) order by platform)
    from app_private.update_policies),'[]'::jsonb);
end;
$$;
create function public.admin_save_update_policy(
  p_platform text, p_latest_version text, p_minimum_version text,
  p_update_url text, p_enabled boolean, p_expected_revision integer
) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if not app_private.is_admin() then raise exception 'update_admin_required' using errcode='42501'; end if;
  if p_expected_revision is null or p_expected_revision<0 then
    raise exception 'invalid_expected_revision' using errcode='22023';
  end if;
  -- Compare-and-swap also serializes two first publications for the same platform.
  if p_expected_revision=0 then
    insert into app_private.update_policies(platform,latest_version,minimum_version,update_url,enabled,revision,updated_by)
    values(p_platform,p_latest_version,p_minimum_version,p_update_url,p_enabled,1,auth.uid())
    on conflict(platform) do nothing;
  else
    update app_private.update_policies set latest_version=p_latest_version, minimum_version=p_minimum_version,
      update_url=p_update_url, enabled=p_enabled, revision=revision+1, updated_at=now(),updated_by=auth.uid()
    where platform=p_platform and revision=p_expected_revision;
  end if;
  if not found then raise exception 'update_policy_conflict_reload' using errcode='40001'; end if;
  return public.update_policy(p_platform);
end;
$$;
revoke all on function public.update_policy(text),public.admin_update_policies(),public.admin_save_update_policy(text,text,text,text,boolean,integer) from public,anon,authenticated,app_pending,service_role;
grant execute on function public.update_policy(text) to anon,authenticated,app_pending;
grant execute on function public.admin_update_policies(),public.admin_save_update_policy(text,text,text,text,boolean,integer) to authenticated;

-- Preserve the existing access guard; only this read-only RPC is public before login.
create function public.check_update_policy_access() returns void
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
  if current_setting('request.path',true)='/rpc/update_policy' then return; end if;
  perform public.check_app_access();
end;
$$;
revoke all on function public.check_update_policy_access() from public;
grant execute on function public.check_update_policy_access() to anon,authenticated,app_pending,service_role;
alter role authenticator set pgrst.db_pre_request='public.check_update_policy_access';
notify pgrst,'reload config';
notify pgrst,'reload schema';
commit;
