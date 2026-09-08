-- Approval is checked in live DB state, not mutable profile names or user_metadata.
-- Activate the two Auth hooks and private-only Realtime together with this migration.
-- See supabase/ACCESS_APPROVAL.md before deployment. No automatic owner selection.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='app_pending') then
    create role app_pending nologin noinherit;
  end if;
end $$;
grant app_pending to authenticator;
grant usage on schema public, auth to app_pending;
grant execute on function auth.uid(), auth.role(), auth.jwt() to app_pending;

create table app_private.access_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null
);
create table app_private.access_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid unique not null references auth.users(id) on delete restrict
);
alter table app_private.access_accounts enable row level security;
alter table app_private.access_owner enable row level security;
revoke all on all tables in schema app_private from public, anon, authenticated, app_pending, service_role;
insert into app_private.access_accounts(user_id,status,requested_at,decided_at)
select id,'approved',coalesce(created_at,now()),now() from auth.users;

create function app_private.is_approved() returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select coalesce(auth.role()='service_role',false) or exists (
    select 1 from app_private.access_accounts where user_id=auth.uid() and status='approved'
  );
$$;
create function app_private.is_admin() returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select exists(select 1 from app_private.access_owner o join app_private.access_accounts a using(user_id)
    where o.user_id=auth.uid() and a.status='approved');
$$;
create function app_private.require_approved() returns void
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
  if not app_private.is_approved() then raise exception 'access_not_approved' using errcode='42501'; end if;
end;
$$;
revoke all on function app_private.is_approved(),app_private.is_admin(),app_private.require_approved() from public;
grant usage on schema app_private to authenticated, anon, app_pending;
grant execute on function app_private.is_approved() to authenticated, anon, app_pending;

create function app_private.bootstrap_access_owner(p_user_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare actual uuid;
begin
  lock table app_private.access_owner in exclusive mode;
  select user_id into actual from app_private.access_owner;
  if actual is not null and actual<>p_user_id then raise exception 'access_owner_already_set'; end if;
  if not exists(select 1 from app_private.access_accounts where user_id=p_user_id and status='approved') then
    raise exception 'bootstrap_requires_existing_approved_uuid';
  end if;
  insert into app_private.access_owner(user_id) values(p_user_id) on conflict(singleton) do nothing;
end;
$$;
revoke all on function app_private.bootstrap_access_owner(uuid) from public,anon,authenticated,app_pending,service_role;
grant execute on function app_private.bootstrap_access_owner(uuid) to postgres;

-- Server-controlled app_metadata, never raw_user_meta_data, decides the signup provider.
create function app_private.enforce_google_signup() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if coalesce(new.raw_app_meta_data->>'provider','')<>'google' or coalesce(new.is_anonymous,false) then
    raise exception 'google_signup_required' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger access_google_only before insert on auth.users
for each row execute function app_private.enforce_google_signup();
create function app_private.record_access_request() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  insert into app_private.access_accounts(user_id) values(new.id);
  return new;
end;
$$;
create trigger access_record_request after insert on auth.users
for each row execute function app_private.record_access_request();
revoke all on function app_private.enforce_google_signup(),app_private.record_access_request() from public;

-- Google names/emails can contain spaces, accents or collide. Profile updates must
-- never rename an established account from mutable auth metadata.
create or replace function public.sync_auth_profile() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare requested text; attempt integer:=0;
begin
  if tg_op='UPDATE' then return new; end if;
  loop
    requested := 'u_' || left(md5(new.id::text || ':' || attempt::text),18);
    begin
      insert into public.profiles(user_id,username,display_name)
      values(new.id,requested,left(nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name','')),''),120));
      exit;
    exception when unique_violation then
      if exists(select 1 from public.profiles where user_id=new.id) then return new; end if;
      attempt:=attempt+1;
      if attempt>10 then raise; end if;
    end;
  end loop;
  return new;
end;
$$;
revoke all on function public.sync_auth_profile() from public,anon,authenticated,app_pending;

-- Defense independent of Auth-hook activation and JWT freshness. Existing grants
-- and permissive policies remain; every row must also pass this restrictive gate.
do $$ declare t record; begin
  for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where (n.nspname='public' and c.relkind in ('r','p'))
       or (n.nspname='storage' and c.relname in ('objects','buckets'))
       or (n.nspname='realtime' and c.relname='messages')
  loop
    if t.nspname='public' then execute format('alter table %I.%I enable row level security',t.nspname,t.relname); end if;
    execute format('create policy access_approved_only on %I.%I as restrictive for all to public using ((select app_private.is_approved())) with check ((select app_private.is_approved()))',t.nspname,t.relname);
  end loop;
end $$;
revoke all on all tables in schema public from public,app_pending;
revoke all on storage.objects,storage.buckets,realtime.messages from public,app_pending;
-- Visual buckets intentionally remain public; their files are public presentation.
-- songs is already private. This gate protects authenticated Storage operations
-- without changing existing public image URLs or old mobile clients.

-- Preserve function OIDs/signatures (including policy dependencies): copy each
-- client-callable definer implementation into an unexposed schema, replace the
-- public body with a guarded forwarding wrapper, then remove private EXECUTE.
-- All current scalar, named composite and SETOF/TABLE signatures are supported.
do $$
declare f record; def text; args text; body text; volatility text;
begin
  for f in select p.*,pg_get_function_arguments(p.oid) as arguments,pg_get_function_identity_arguments(p.oid) as identity_args,
      pg_get_function_result(p.oid) as result,has_function_privilege('authenticated',p.oid,'execute') as allow_authenticated
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and p.prokind='f'
      and p.prorettype not in ('trigger'::regtype,'event_trigger'::regtype)
      and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute'))
      and p.proname<>'auth_email_for_username'
  loop
    if f.provariadic<>0 or (not f.proretset and f.proargmodes is not null) then
      raise exception 'Unsupported access wrapper signature: %(%)',f.proname,f.identity_args;
    end if;
    def:=pg_get_functiondef(f.oid);
    execute regexp_replace(def,'^CREATE OR REPLACE FUNCTION public\.','CREATE OR REPLACE FUNCTION app_private.');
    execute format('revoke all on function app_private.%I(%s) from public,anon,authenticated,app_pending',f.proname,f.identity_args);
    select string_agg('$'||i::text,', ' order by i) into args from generate_series(1,f.pronargs) i;
    args:=coalesce(args,'');
    if f.proretset then body:=format('return query select * from app_private.%I(%s);',f.proname,args);
    elsif f.prorettype='void'::regtype then body:=format('perform app_private.%I(%s); return;',f.proname,args);
    else body:=format('return app_private.%I(%s);',f.proname,args); end if;
    volatility:=case f.provolatile when 'v' then 'volatile' else 'stable' end;
    execute format('create or replace function public.%I(%s) returns %s language plpgsql %s security definer set search_path=pg_catalog as %L',
      f.proname,f.arguments,f.result,volatility,'begin perform app_private.require_approved(); '||body||' end;');
    execute format('revoke all on function public.%I(%s) from anon,app_pending,public',f.proname,f.identity_args);
    if f.allow_authenticated then
      execute format('grant execute on function public.%I(%s) to authenticated',f.proname,f.identity_args);
    end if;
  end loop;
end $$;

-- Legacy password login stays available for existing synthetic-email accounts,
-- but this anonymous endpoint must never expose a new Google account's email.
create or replace function public.auth_email_for_username(p_username text) returns text
language sql stable security definer set search_path=pg_catalog as $$
  select u.email from auth.users u join public.profiles p on p.user_id=u.id
  join app_private.access_accounts a on a.user_id=u.id and a.status='approved'
  where p.username=lower(btrim(coalesce(p_username,''))) and u.email like '%@flora.local'
    and coalesce(u.raw_app_meta_data->>'provider','email')='email' limit 1;
$$;
revoke all on function public.auth_email_for_username(text) from public,app_pending;
grant execute on function public.auth_email_for_username(text) to anon,authenticated;

create function public.access_status() returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
  select jsonb_build_object('status',coalesce((select status from app_private.access_accounts where user_id=auth.uid()),'pending'),
    'is_admin',app_private.is_admin());
$$;
create function public.access_requests() returns table(user_id uuid,email text,display_name text,username text,avatar_url text,status text,requested_at timestamptz,decided_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
  if not app_private.is_admin() then raise exception 'access_admin_required' using errcode='42501'; end if;
  return query select a.user_id,u.email::text,p.display_name,p.username,u.raw_user_meta_data->>'avatar_url',a.status,a.requested_at,a.decided_at
    from app_private.access_accounts a join auth.users u on u.id=a.user_id left join public.profiles p on p.user_id=a.user_id
    order by (a.status='pending') desc,a.requested_at,a.user_id;
end;
$$;
create function public.decide_access(p_user_id uuid,p_approve boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
  if not app_private.is_admin() then raise exception 'access_admin_required' using errcode='42501'; end if;
  if p_approve is null then raise exception 'access_decision_required' using errcode='22004'; end if;
  if exists(select 1 from app_private.access_owner where user_id=p_user_id) then
    raise exception 'access_owner_protected' using errcode='42501';
  end if;
  update app_private.access_accounts set status=case when p_approve then 'approved' else 'rejected' end,decided_at=now(),decided_by=auth.uid()
    where user_id=p_user_id returning jsonb_build_object('user_id',user_id,'status',status,'decided_at',decided_at) into result;
  if result is null then raise exception 'access_request_not_found' using errcode='P0002'; end if;
  return result;
end;
$$;
revoke all on function public.access_status(),public.access_requests(),public.decide_access(uuid,boolean) from public,anon;
grant execute on function public.access_status() to authenticated,app_pending;
grant execute on function public.access_requests(),public.decide_access(uuid,boolean) to authenticated;

-- Server uses validated auth.getUser(token).id, not a client-supplied UUID.
create function public.access_user_approved(p_user_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select exists(select 1 from app_private.access_accounts where user_id=p_user_id and status='approved');
$$;
revoke all on function public.access_user_approved(uuid) from public,anon,authenticated,app_pending;
grant execute on function public.access_user_approved(uuid) to service_role;

create function public.check_app_access() returns void
language plpgsql stable security definer set search_path=pg_catalog as $$
declare path text:=coalesce(current_setting('request.path',true),'');
begin
  if auth.role()='service_role' then return; end if;
  if path='/rpc/auth_email_for_username' then return; end if;
  if path='/rpc/access_status' and auth.uid() is not null then return; end if;
  perform app_private.require_approved();
end;
$$;
revoke all on function public.check_app_access() from public;
grant execute on function public.check_app_access() to anon,authenticated,app_pending,service_role;
alter role authenticator set pgrst.db_pre_request='public.check_app_access';
notify pgrst,'reload config';
notify pgrst,'reload schema';

create function public.before_user_created_google(event jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
  if coalesce(event->'user'->'app_metadata'->>'provider','')<>'google' or coalesce((event->'user'->>'is_anonymous')::boolean,false) then
    return '{"error":{"http_code":403,"message":"google_signup_required"}}'::jsonb;
  end if;
  return '{}'::jsonb;
end;
$$;
create function public.access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare claims jsonb:=event->'claims'; state text;
begin
  select status into state from app_private.access_accounts where user_id=(event->>'user_id')::uuid;
  claims:=jsonb_set(claims,'{role}',to_jsonb(case when state='approved' then 'authenticated'::text else 'app_pending'::text end));
  claims:=jsonb_set(claims,'{app_access_status}',to_jsonb(coalesce(state,'pending')));
  return jsonb_set(event,'{claims}',claims);
end;
$$;
revoke all on function public.before_user_created_google(jsonb),public.access_token_hook(jsonb) from public,anon,authenticated,app_pending,service_role;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.before_user_created_google(jsonb),public.access_token_hook(jsonb) to supabase_auth_admin;

-- Private channel authorization. Public channels MUST also be disabled in
-- Realtime settings and clients must set config.private=true (deployment step).
create function app_private.realtime_topic_allowed(topic text) returns boolean
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
  if not app_private.is_approved() then return false; end if;
  if topic in ('escucha:'||auth.uid()::text,'inbox:'||auth.uid()::text) then return true; end if;
  if topic ~ '^messages:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return public.is_pair_member(substring(topic from 10)::uuid);
  end if;
  if topic ~ '^jam:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return public.is_jam_member(substring(topic from 5)::uuid);
  end if;
  return false;
end;
$$;
revoke all on function app_private.realtime_topic_allowed(text) from public;
grant execute on function app_private.realtime_topic_allowed(text) to authenticated;
create policy access_private_channel_read on realtime.messages for select to authenticated
  using ((select app_private.realtime_topic_allowed(realtime.topic())));
create policy access_private_channel_send on realtime.messages for insert to authenticated
  with check ((select app_private.realtime_topic_allowed(realtime.topic())));

-- Future functions do not accidentally inherit public EXECUTE. New app tables
-- and RPCs require explicit grants + access gate (covered by the SQL audit test).
alter default privileges in schema public revoke execute on functions from public;
