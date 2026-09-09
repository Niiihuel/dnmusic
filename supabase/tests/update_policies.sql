-- Execute AFTER the new migration, inside a transaction that the runner rolls back.
-- Uses the existing pinned owner and one approved account, without editing either.
create function pg_temp.update_check(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.update_denied(sql text,code text default '42501') returns void language plpgsql as $$
begin
  begin execute sql;
  exception when others then if sqlstate=code then return; end if; raise; end;
  raise exception 'Unexpected access/success: %',sql;
end $$;
create function pg_temp.update_as(id uuid,role_name text) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub',id,'role',role_name,
    'user_metadata',jsonb_build_object('username','nihuel','is_admin',true))::text,true);
$$;
select set_config('test.update_owner',(select user_id::text from app_private.access_owner),true);
select set_config('test.update_nonadmin',(select user_id::text from app_private.access_accounts
  where status='approved' and user_id not in(select user_id from app_private.access_owner) limit 1),true);
select pg_temp.update_check(nullif(current_setting('test.update_owner'),'') is not null,'requires pinned owner');
select pg_temp.update_check(nullif(current_setting('test.update_nonadmin'),'') is not null,'requires approved non-owner');
select pg_temp.update_check((select count(*)=0 from app_private.update_policies),'migration never seeds policies');
select pg_temp.update_check((select relrowsecurity from pg_class where oid='app_private.update_policies'::regclass),'RLS enabled');

set local role anon;
select pg_temp.update_as(null,'anon');
select set_config('request.path','/rpc/update_policy',true);
select public.check_update_policy_access();
select pg_temp.update_check(public.update_policy('ios') is null,'public empty policy');
select pg_temp.update_denied('select * from app_private.update_policies');
select pg_temp.update_denied('select public.admin_update_policies()');
select pg_temp.update_denied($q$select public.admin_save_update_policy('windows','1.12.0','0.0.0','https://github.com/Niiihuel/dnmusic-releases/releases/latest',true,0)$q$);
select set_config('request.path','/rpc/get_my_profile',true);
select pg_temp.update_denied('select public.check_update_policy_access()');
select set_config('request.path','/rpc/update_policy/anything',true);
select pg_temp.update_denied('select public.check_update_policy_access()');
select set_config('request.path','/rpc/auth_email_for_username',true);
select public.check_update_policy_access();
reset role;

set local role app_pending;
select pg_temp.update_as('00000000-0000-4000-8000-00000000bb19','app_pending');
select set_config('request.path','/rpc/update_policy',true);
select public.check_update_policy_access();
select pg_temp.update_check(public.update_policy('android') is null,'pending can check version');
select pg_temp.update_denied('select * from app_private.update_policies');
select pg_temp.update_denied('select public.admin_update_policies()');
select pg_temp.update_denied($q$select public.admin_save_update_policy('windows','1.12.0','0.0.0','https://github.com/Niiihuel/dnmusic-releases/releases/latest',true,0)$q$);
select set_config('request.path','/rpc/access_status',true);
select public.check_update_policy_access();
reset role;

set local role authenticated;
select pg_temp.update_as(current_setting('test.update_nonadmin')::uuid,'authenticated');
select pg_temp.update_denied('select public.admin_update_policies()');
select pg_temp.update_denied($q$select public.admin_save_update_policy('windows','1.12.0','0.0.0','https://github.com/Niiihuel/dnmusic-releases/releases/latest',true,0)$q$);
select pg_temp.update_denied('select * from app_private.update_policies');
select pg_temp.update_denied('delete from app_private.update_policies');
-- Nonexistent/rejected account and forged @nihuel metadata do not confer privileges.
select pg_temp.update_as('00000000-0000-4000-8000-00000000bb19','authenticated');
select pg_temp.update_denied('select public.admin_update_policies()');
select set_config('request.path','/rpc/admin_save_update_policy',true);
select pg_temp.update_denied('select public.check_update_policy_access()');

select pg_temp.update_as(current_setting('test.update_owner')::uuid,'authenticated');
select public.check_update_policy_access();
select pg_temp.update_check(public.admin_update_policies()='[]'::jsonb,'owner sees empty list');
select pg_temp.update_check(public.admin_save_update_policy('windows','1.12.0','0.0.0','https://github.com/Niiihuel/dnmusic-releases/releases/latest',true,0)->>'revision'='1','owner can publish optional');
select pg_temp.update_check(public.admin_save_update_policy('windows','1.13.0','1.12.0','https://github.com/Niiihuel/dnmusic-releases/releases/tag/v1.13.0',true,1)->>'minimum_version'='1.12.0','owner decides minimum in rolled-back fixture');
select pg_temp.update_check(jsonb_array_length(public.admin_update_policies())=1,'list confirms persisted policy');
select pg_temp.update_denied($q$select public.admin_save_update_policy('windows','1.13.0','0.0.0','https://github.com/Niiihuel/dnmusic-releases/releases/latest',true,0)$q$,'40001');
select pg_temp.update_denied($q$select public.admin_save_update_policy('windows','1.13.0','0.0.0','https://github.com/Niiihuel/dnmusic-releases/releases/latest',true,1)$q$,'40001');
select pg_temp.update_denied($q$select public.admin_save_update_policy('windows','1.13.0','1.14.0','https://github.com/Niiihuel/dnmusic-releases/releases/latest',true,2)$q$,'23514');
select pg_temp.update_denied($q$select public.admin_save_update_policy('windows','1.13.0-beta','0.0.0','https://github.com/Niiihuel/dnmusic-releases/releases/latest',true,2)$q$,'22023');
select pg_temp.update_denied($q$select public.admin_save_update_policy('windows','01.13.0','0.0.0','https://github.com/Niiihuel/dnmusic-releases/releases/latest',true,2)$q$,'22023');
select pg_temp.update_denied($q$select public.admin_save_update_policy('windows','1.13.0','0.0.0','https://evil.test/setup.exe',true,2)$q$,'23514');
select pg_temp.update_denied($q$select public.admin_save_update_policy('windows','1.13.0','0.0.0','javascript:alert(1)',true,2)$q$,'23514');
select pg_temp.update_denied($q$select public.admin_save_update_policy('windows','1.13.0','0.0.0','https://github.com@evil.test/Niiihuel/dnmusic-releases/releases/latest',true,2)$q$,'23514');
select pg_temp.update_denied($q$select public.admin_save_update_policy('other','1.13.0','0.0.0','https://github.com/Niiihuel/dnmusic-releases/releases/latest',true,0)$q$,'23514');
select pg_temp.update_check(public.update_policy('windows')->>'revision'='2','failures never change policy');
select pg_temp.update_check(public.admin_save_update_policy('ios','1.12.0','0.0.0','https://testflight.apple.com/join/Test123',false,0)->>'enabled'='false','valid iOS destination');
select pg_temp.update_check(public.admin_save_update_policy('android','1.12.0','0.0.0','https://play.google.com/store/apps/details?id=com.nihuel.dnmusic',false,0)->>'enabled'='false','valid Android destination');
select pg_temp.update_check(public.admin_save_update_policy('web','1.12.0','0.0.0','https://dnmusic-app.vercel.app/',false,0)->>'enabled'='false','valid web destination');
select pg_temp.update_check(public.admin_save_update_policy('windows','1.13.0','0.0.0','https://github.com/Niiihuel/dnmusic-releases/releases/latest',false,2)->>'enabled'='false','owner can revoke mandatory policy');
select pg_temp.update_denied('update app_private.update_policies set enabled=true');
reset role;

set local role anon;
select pg_temp.update_as(null,'anon');
select pg_temp.update_check(public.update_policy('windows')->>'revision'='3','public contract delivers latest change');
select pg_temp.update_check(not(public.update_policy('windows') ? 'updated_by'),'owner UUID stays private');
reset role;
set local role service_role;
select pg_temp.update_as(null,'service_role');
select pg_temp.update_denied('select public.admin_update_policies()');
select pg_temp.update_denied('select * from app_private.update_policies');
reset role;
select 'update_policies: permissions and validation passed; runner must ROLLBACK' as result;
