-- Only for the disposable postgres container created by message-actions-db.test.mjs.
create role authenticated;
create role anon;
create role app_pending;
create role service_role;
create schema auth;
create schema app_private;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create function app_private.is_approved() returns boolean language sql stable as $$ select coalesce(current_setting('test.approved',true),'yes') <> 'no' $$;
grant usage on schema auth,app_private to authenticated;
create table public.pair_members(pair_id uuid, user_id uuid);
insert into public.pair_members values
 ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000002');
create function public.is_pair_member(p_pair_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.pair_members where pair_id=p_pair_id and user_id=auth.uid());
$$;
create table public.messages (
 id uuid primary key, pair_id uuid not null, sender_id uuid not null, text text not null,
 song jsonb, created_at timestamptz not null default now(), opened_at timestamptz, read_at timestamptz,
 constraint messages_content_check check(length(text) between 1 and 2000 or (length(text)=0 and song is not null))
);
alter table public.messages enable row level security;
create policy "members read messages" on public.messages for select using(public.is_pair_member(pair_id));
create policy "members send own messages" on public.messages for insert with check(public.is_pair_member(pair_id) and sender_id=auth.uid());
create policy "receiver marks opened" on public.messages for update using(public.is_pair_member(pair_id) and sender_id<>auth.uid()) with check(public.is_pair_member(pair_id) and sender_id<>auth.uid());
create policy access_approved_only on public.messages as restrictive for all to public using(app_private.is_approved()) with check(app_private.is_approved());
grant select,insert,update on public.messages to authenticated;
create function public.enforce_message_immutability() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger messages_immutable before update on public.messages for each row execute function public.enforce_message_immutability();
insert into public.messages(id,pair_id,sender_id,text,song,created_at) values
 ('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','Original','{"path":"private/audio","lyrics":[{"text":"Secret lyric"}],"kind":"snippet"}','2026-09-01'),
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','Solo texto',null,'2026-09-01');
create function public.assert_true(v boolean, label text) returns void language plpgsql as $$ begin if v is distinct from true then raise exception 'Assertion failed: %',label; end if; end $$;
create function public.expect_error(query text, expected text) returns void language plpgsql as $$
begin
  begin execute query; exception when others then
    if sqlstate=expected then return; end if;
    raise exception 'Expected %, got %: %',expected,sqlstate,sqlerrm;
  end;
  raise exception 'Expected error %, query succeeded: %',expected,query;
end;
$$;
