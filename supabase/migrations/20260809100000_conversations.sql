-- ═══════════════════════════════════════════════════════════════════════════
-- Perfiles buscables y múltiples conversaciones directas.
--
-- `pairs` sigue siendo la conversación y `pair_members` sus participantes. La
-- diferencia es que una cuenta ahora puede pertenecer a varios pares, uno por
-- contacto, en vez de tomar solamente el primero.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique check (username = lower(username)),
  created_at timestamptz not null default now()
);

-- Las cuentas existentes se vuelven buscables sin configuración manual.
insert into public.profiles (user_id, username, created_at)
select
  id,
  lower(coalesce(nullif(raw_user_meta_data ->> 'username', ''), split_part(email, '@', 1))),
  created_at
from auth.users
where email is not null
on conflict (user_id) do update set username = excluded.username;

create or replace function public.sync_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  base_username text;
begin
  base_username := lower(coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    left(new.id::text, 8)
  ));

  if exists (
    select 1 from public.profiles
    where username = base_username and user_id <> new.id
  ) then
    base_username := base_username || '-' || left(new.id::text, 6);
  end if;

  insert into public.profiles (user_id, username)
  values (new.id, base_username)
  on conflict (user_id) do update set username = excluded.username;
  return new;
end;
$$;

drop trigger if exists auth_user_profile on auth.users;
create trigger auth_user_profile
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.sync_auth_profile();

alter table public.profiles enable row level security;

-- La tabla no se consulta directamente: estas funciones exponen solo los
-- campos necesarios y verifican que quien llama esté autenticado.
revoke all on public.profiles from anon, authenticated;

create or replace function public.search_contacts(
  p_query text default '',
  p_limit integer default 20
)
returns table (
  user_id uuid,
  username text,
  pair_id uuid
)
language sql
security definer
stable
set search_path = public, auth, pg_temp
as $$
  select
    profile.user_id,
    profile.username,
    (
      select mine.pair_id
      from public.pair_members mine
      join public.pair_members other on other.pair_id = mine.pair_id
      where mine.user_id = auth.uid()
        and other.user_id = profile.user_id
      limit 1
    ) as pair_id
  from public.profiles profile
  where auth.uid() is not null
    and profile.user_id <> auth.uid()
    and (
      btrim(p_query) = ''
      or profile.username ilike '%' || btrim(p_query) || '%'
    )
  order by
    case when profile.username ilike btrim(p_query) || '%' then 0 else 1 end,
    profile.username
  limit greatest(1, least(coalesce(p_limit, 20), 30));
$$;

create or replace function public.list_my_conversations()
returns table (
  pair_id uuid,
  contact_user_id uuid,
  username text,
  last_message_text text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
security definer
stable
set search_path = public, auth, pg_temp
as $$
  select
    mine.pair_id,
    other.user_id as contact_user_id,
    profile.username,
    latest.text as last_message_text,
    latest.created_at as last_message_at,
    (
      select count(*)
      from public.messages unread
      where unread.pair_id = mine.pair_id
        and unread.sender_id <> auth.uid()
        and unread.read_at is null
    ) as unread_count
  from public.pair_members mine
  join public.pair_members other
    on other.pair_id = mine.pair_id and other.user_id <> mine.user_id
  join public.profiles profile on profile.user_id = other.user_id
  left join lateral (
    select message.text, message.created_at
    from public.messages message
    where message.pair_id = mine.pair_id
    order by message.created_at desc
    limit 1
  ) latest on true
  where mine.user_id = auth.uid()
  order by latest.created_at desc nulls last, profile.username;
$$;

create or replace function public.ensure_direct_pair(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  me uuid := auth.uid();
  found_pair uuid;
begin
  if me is null then raise exception 'Sesión requerida'; end if;
  if p_other_user_id = me then raise exception 'No podés enviarte un mensaje'; end if;
  if not exists (select 1 from public.profiles where user_id = p_other_user_id) then
    raise exception 'Ese contacto no existe';
  end if;

  -- Serializa los dos posibles órdenes del mismo par y evita duplicados si
  -- ambos contactos inician la conversación al mismo tiempo.
  perform pg_advisory_xact_lock(
    hashtextextended(least(me::text, p_other_user_id::text) || ':' ||
                     greatest(me::text, p_other_user_id::text), 0)
  );

  select members.pair_id into found_pair
  from public.pair_members members
  group by members.pair_id
  having count(*) = 2
    and count(*) filter (where members.user_id in (me, p_other_user_id)) = 2
  limit 1;

  if found_pair is null then
    insert into public.pairs default values returning id into found_pair;
    insert into public.pair_members (pair_id, user_id)
    values (found_pair, me), (found_pair, p_other_user_id);
  end if;

  return found_pair;
end;
$$;

revoke all on function public.search_contacts(text, integer) from public;
revoke all on function public.list_my_conversations() from public;
revoke all on function public.ensure_direct_pair(uuid) from public;
grant execute on function public.search_contacts(text, integer) to authenticated;
grant execute on function public.list_my_conversations() to authenticated;
grant execute on function public.ensure_direct_pair(uuid) to authenticated;

-- Los cambios de membresía despiertan la bandeja del nuevo contacto.
do $$
begin
  alter publication supabase_realtime add table public.pair_members;
exception
  when duplicate_object then null;
end
$$;
alter table public.pair_members replica identity full;

-- Permite enviar una canción sin texto. El mensaje sigue necesitando al menos
-- uno de los dos contenidos.
alter table public.messages drop constraint if exists messages_text_check;
alter table public.messages add constraint messages_content_check check (
  length(text) between 1 and 2000
  or (length(text) = 0 and song is not null)
);
