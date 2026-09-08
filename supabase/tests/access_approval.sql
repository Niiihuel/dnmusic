-- Run on an isolated/local database after 20260916000000. Always rolls fixtures back.
begin;
create function pg_temp.check_ok(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.denied(sql text) returns void language plpgsql as $$
begin
  begin execute sql; exception when insufficient_privilege then return; end;
  raise exception 'Unexpected access: %',sql;
end $$;
create function pg_temp.empty_or_denied(sql text) returns void language plpgsql as $$
declare n bigint;
begin
  begin execute 'select count(*) from ('||sql||') q' into n;
  exception when insufficient_privilege then return; end;
  if n<>0 then raise exception 'Rows leaked: %',sql; end if;
end $$;
create function pg_temp.as_user(id uuid,role_name text default 'authenticated') returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',id,'role',role_name,'user_metadata',jsonb_build_object('is_admin',true,'status','approved'))::text,true);
$$;

-- Existing auth accounts were grandfathered; backfill never selects an owner by username.
select pg_temp.check_ok(not exists(select 1 from auth.users u left join app_private.access_accounts a on a.user_id=u.id where a.status is distinct from 'approved'),'existing accounts backfilled');
select pg_temp.check_ok(not exists(select 1 from app_private.access_owner),'no automatic username bootstrap');
select pg_temp.denied($q$insert into auth.users(id,email,raw_user_meta_data) values('00000000-0000-4000-8000-00000000aa09','newemail@flora.local','{"provider":"google","is_admin":true}')$q$);

insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
 ('00000000-0000-4000-8000-00000000aa01','owner.access@example.test','{"provider":"google"}','{"name":"Owner","username":"nihuel"}'),
 ('00000000-0000-4000-8000-00000000aa02','approved.access@example.test','{"provider":"google"}','{"name":"Approved"}'),
 ('00000000-0000-4000-8000-00000000aa03','pending.access@example.test','{"provider":"google"}','{"name":"Pending","username":"nihuel","is_admin":true,"status":"approved","role":"service_role"}');
select pg_temp.check_ok((select status='pending' from app_private.access_accounts where user_id='00000000-0000-4000-8000-00000000aa03'),'Google defaults pending despite forged metadata');
update app_private.access_accounts set status='approved' where user_id in ('00000000-0000-4000-8000-00000000aa01','00000000-0000-4000-8000-00000000aa02');
select app_private.bootstrap_access_owner('00000000-0000-4000-8000-00000000aa01');
-- Stable UUID keeps owner access if profile name changes (or another user requests that name).
update public.profiles set username='owner_renamed' where user_id='00000000-0000-4000-8000-00000000aa01';
update public.profiles set username='nihuel_fake' where user_id='00000000-0000-4000-8000-00000000aa03';
update auth.users set raw_user_meta_data='{"username":"nihuel","name":"changed"}' where id='00000000-0000-4000-8000-00000000aa03';
select pg_temp.check_ok((select username='nihuel_fake' from public.profiles where user_id='00000000-0000-4000-8000-00000000aa03'),'auth metadata cannot rename profile');
insert into public.playlists(id,owner_id,name) values ('00000000-0000-4000-8000-00000000ab01','00000000-0000-4000-8000-00000000aa03','Must remain hidden');
insert into storage.objects(bucket_id,name,owner_id) values('songs','access-fixture.m4a','00000000-0000-4000-8000-00000000aa03');

insert into public.pairs(id) values('00000000-0000-4000-8000-00000000ab02');
insert into public.pair_members(pair_id,user_id) values
 ('00000000-0000-4000-8000-00000000ab02','00000000-0000-4000-8000-00000000aa03'),
 ('00000000-0000-4000-8000-00000000ab02','00000000-0000-4000-8000-00000000aa02');

-- Token hook overwrites a forged role and distinguishes pending/rejected/approved.
set local role supabase_auth_admin;
select pg_temp.check_ok(public.access_token_hook('{"user_id":"00000000-0000-4000-8000-00000000aa03","claims":{"role":"service_role","sub":"00000000-0000-4000-8000-00000000aa03"}}')->'claims'->>'role'='app_pending','pending token has no app-data role');
select pg_temp.check_ok(public.access_token_hook('{"user_id":"00000000-0000-4000-8000-00000000aa02","claims":{"role":"app_pending"}}')->'claims'->>'role'='authenticated','approved token');
select pg_temp.check_ok(public.before_user_created_google('{"user":{"app_metadata":{"provider":"email"},"user_metadata":{"provider":"google"}}}') ? 'error','hook rejects forged provider');
select pg_temp.check_ok(public.before_user_created_google('{"user":{"app_metadata":{"provider":"google"}}}')='{}','hook permits Google');
reset role;

set local role app_pending;
select pg_temp.as_user('00000000-0000-4000-8000-00000000aa03','app_pending');
select pg_temp.check_ok(public.access_status()='{"status":"pending","is_admin":false}','pending status shape');
select pg_temp.denied('select * from public.profiles');
select pg_temp.denied('select * from public.playlists');
select pg_temp.denied('select * from storage.objects');
select pg_temp.denied('select * from realtime.messages');
select pg_temp.denied('select public.get_my_profile()');
select pg_temp.denied('select public.access_requests()');
select pg_temp.denied($q$select public.decide_access('00000000-0000-4000-8000-00000000aa03',true)$q$);
select pg_temp.denied('select public.access_token_hook(''{}'')');
select pg_temp.denied($q$select app_private.bootstrap_access_owner('00000000-0000-4000-8000-00000000aa03')$q$);
reset role;

-- Even an old authenticated JWT cannot bypass live RLS, direct SECDEF calls,
-- Storage policy, REST pre_request, or service approval checks.
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-00000000aa03');
select pg_temp.empty_or_denied('select * from public.profiles');
select pg_temp.empty_or_denied('select * from public.playlists');
select pg_temp.empty_or_denied('select * from storage.objects');
select pg_temp.denied($q$insert into public.playlists(owner_id,name) values(auth.uid(),'forbidden')$q$);
select pg_temp.denied('select public.get_my_profile()');
select pg_temp.denied($q$select public.update_my_profile(p_bio=>'forbidden')$q$);
select pg_temp.denied('select public.mi_jam()');
select pg_temp.denied($q$select public.username_available('nihuel')$q$);
select pg_temp.denied('select app_private.get_my_profile()');
select pg_temp.denied($q$select public.access_user_approved('00000000-0000-4000-8000-00000000aa03')$q$);
select pg_temp.check_ok(not app_private.realtime_topic_allowed('escucha:00000000-0000-4000-8000-00000000aa03'),'stale JWT cannot authorize private channel');
select pg_temp.check_ok(not app_private.realtime_topic_allowed('inbox:00000000-0000-4000-8000-00000000aa03'),'pending inbox denied');
select pg_temp.check_ok(not app_private.realtime_topic_allowed('messages:00000000-0000-4000-8000-00000000ab02'),'pending member channel denied');
select set_config('realtime.topic','escucha:00000000-0000-4000-8000-00000000aa03',true);
select pg_temp.denied($q$insert into realtime.messages(topic,extension,private) values('escucha:00000000-0000-4000-8000-00000000aa03','broadcast',true)$q$);
select pg_temp.empty_or_denied('select * from realtime.messages');
select set_config('request.path','/rpc/get_my_profile',true);
select pg_temp.denied('select public.check_app_access()');
select set_config('request.path','/rpc/access_status',true);
select public.check_app_access();
select pg_temp.denied('select public.access_requests()');
select pg_temp.denied($q$select public.decide_access('00000000-0000-4000-8000-00000000aa03',true)$q$);

select pg_temp.as_user('00000000-0000-4000-8000-00000000aa01');
select pg_temp.check_ok(public.access_status()='{"status":"approved","is_admin":true}','owner pinned to UUID');
select pg_temp.check_ok(exists(select 1 from public.access_requests() where user_id='00000000-0000-4000-8000-00000000aa03' and status='pending' and email='pending.access@example.test'),'admin sees request fields');
select pg_temp.denied($q$select public.decide_access('00000000-0000-4000-8000-00000000aa01',false)$q$);
select pg_temp.check_ok(public.decide_access('00000000-0000-4000-8000-00000000aa03',false)->>'status'='rejected','reject');
select pg_temp.as_user('00000000-0000-4000-8000-00000000aa03');
select pg_temp.check_ok(public.access_status()->>'status'='rejected','recheck remains rejected');
select pg_temp.denied('select public.get_my_profile()');
select pg_temp.as_user('00000000-0000-4000-8000-00000000aa01');
select pg_temp.check_ok(public.decide_access('00000000-0000-4000-8000-00000000aa03',true)->>'status'='approved','reapprove rejected');
select pg_temp.as_user('00000000-0000-4000-8000-00000000aa03');
select pg_temp.check_ok((select user_id=auth.uid() from public.get_my_profile()),'approved wrapper preserves TABLE return');
select public.update_my_profile(p_bio=>'Allowed now');
select pg_temp.check_ok((select bio='Allowed now' from public.get_my_profile()),'approved definer write works');
select pg_temp.check_ok(not(public.access_status()->>'is_admin')::boolean,'approval never grants admin');
select pg_temp.check_ok(app_private.realtime_topic_allowed('escucha:00000000-0000-4000-8000-00000000aa03'),'own private channel approved');
insert into realtime.messages(topic,extension,private) values('escucha:00000000-0000-4000-8000-00000000aa03','broadcast',true);
select pg_temp.check_ok(exists(select 1 from realtime.messages where topic='escucha:00000000-0000-4000-8000-00000000aa03'),'approved Realtime RLS read/write');
select pg_temp.check_ok(not app_private.realtime_topic_allowed('escucha:00000000-0000-4000-8000-00000000aa02'),'other private channel blocked');
select pg_temp.denied('select public.access_requests()');
select pg_temp.check_ok(app_private.realtime_topic_allowed('inbox:00000000-0000-4000-8000-00000000aa03'),'own inbox approved');
select pg_temp.check_ok(not app_private.realtime_topic_allowed('inbox:00000000-0000-4000-8000-00000000aa02'),'other inbox denied');
select pg_temp.check_ok(app_private.realtime_topic_allowed('messages:00000000-0000-4000-8000-00000000ab02'),'member chat approved');
select pg_temp.check_ok(not app_private.realtime_topic_allowed('messages:00000000-0000-4000-8000-00000000ffff'),'unknown chat denied');
select pg_temp.check_ok(not app_private.realtime_topic_allowed('jam:------------------------------------'),'malformed channel denied without cast error');
select set_config('realtime.topic','messages:00000000-0000-4000-8000-00000000ab02',true);
insert into realtime.messages(topic,extension,private) values('messages:00000000-0000-4000-8000-00000000ab02','broadcast',true);
select pg_temp.check_ok(exists(select 1 from realtime.messages where topic='messages:00000000-0000-4000-8000-00000000ab02'),'member chat RLS permits join');
select pg_temp.as_user('00000000-0000-4000-8000-00000000aa01');
select pg_temp.check_ok(not app_private.realtime_topic_allowed('messages:00000000-0000-4000-8000-00000000ab02'),'admin does not bypass chat membership');
reset role;

set local role service_role;
select pg_temp.as_user(null,'service_role');
select pg_temp.check_ok(public.access_user_approved('00000000-0000-4000-8000-00000000aa03'),'service guard checks DB');
select pg_temp.check_ok(not public.access_user_approved('00000000-0000-4000-8000-00000000ffff'),'service unknown user denied');
reset role;
set local role anon;
select pg_temp.as_user(null,'anon');
select pg_temp.empty_or_denied('select * from public.profiles');
select pg_temp.denied('select public.access_status()');
select pg_temp.denied('select public.access_requests()');
select pg_temp.check_ok(public.auth_email_for_username('nihuel_fake') is null,'anonymous lookup never returns Google email');
reset role;

-- Audit every exposed definer, not just the examples exercised above.
select pg_temp.check_ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef and p.prorettype not in ('trigger'::regtype,'event_trigger'::regtype)
  and has_function_privilege('authenticated',p.oid,'execute')
  and p.proname not in ('auth_email_for_username','access_status','access_requests','decide_access','check_app_access')
  and p.prosrc not like '%app_private.require_approved()%'
),'all client definers guarded');
select pg_temp.check_ok(not exists(
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')
  and not exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polname='access_approved_only' and not p.polpermissive)
),'all app tables have restrictive RLS');
select pg_temp.check_ok((select not public from storage.buckets where id='songs'),'audio remains private');
select pg_temp.check_ok((select count(*)=5 and bool_and(public) from storage.buckets where id in ('artwork','covers','avatars','showcases','decoraciones')),'visual buckets remain explicitly public');
select pg_temp.check_ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private'
  and p.proname not in ('is_approved','realtime_topic_allowed')
  and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute') or has_function_privilege('app_pending',p.oid,'execute'))
),'private implementations/bootstrap/state helpers are not callable');
select 'ACCESS APPROVAL OK' as result;
rollback;
