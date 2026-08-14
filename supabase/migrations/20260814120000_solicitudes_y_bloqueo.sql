-- ═══════════════════════════════════════════════════════════════════════════
-- Solicitudes de contacto y bloqueo.
--
-- Hasta acá agregar a alguien era unilateral: cualquiera creaba el par y ya
-- podía escribirte. Ahora escribirle a una cuenta nueva pide una solicitud que
-- la otra persona acepta o rechaza, y cualquiera puede bloquear a otra cuenta.
--
-- Qué hace el bloqueo, en una línea por efecto:
--   · dejan de verse mutuamente en la búsqueda de contactos,
--   · ningún mensaje pasa en ninguna de las dos direcciones,
--   · las solicitudes pendientes entre ambos se descartan,
--   · quien bloquea deja de ver la conversación; el otro la ve pero no puede
--     escribir. Nada se borra: desbloquear devuelve todo como estaba.
--
-- Las conversaciones que ya existían siguen andando sin pedir nada: la
-- solicitud es para empezar, no un trámite retroactivo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tablas ──────────────────────────────────────────────────────────────────

create table if not exists public.contact_requests (
  from_user  uuid not null references auth.users(id) on delete cascade,
  to_user    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user),
  check (from_user <> to_user)
);

create index if not exists contact_requests_to_idx on public.contact_requests(to_user);

create table if not exists public.blocks (
  blocker    uuid not null references auth.users(id) on delete cascade,
  blocked    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

create index if not exists blocks_blocked_idx on public.blocks(blocked);

alter table public.contact_requests enable row level security;
alter table public.blocks           enable row level security;

-- Solicitudes: cada quien ve las suyas — las que mandó y las que le llegaron.
-- El SELECT directo existe sobre todo para realtime: sin policy de lectura el
-- canal de postgres_changes no emite nada. Escribir, solo por las funciones.
drop policy if exists "involucrados leen solicitudes" on public.contact_requests;
create policy "involucrados leen solicitudes" on public.contact_requests
  for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());

-- Supabase concede todo por default sobre las tablas nuevas; acá se deja solo
-- lo que corresponde. Sin policy de escritura RLS igual negaría, pero que el
-- privilegio lo diga primero.
revoke all on public.contact_requests from anon, authenticated;
grant select on public.contact_requests to authenticated;

-- Bloqueos: nadie los lee directo — que te bloquearon no se muestra, se nota.
revoke all on public.blocks from anon, authenticated;

-- ── Ayudas internas ─────────────────────────────────────────────────────────

-- Hay bloqueo entre dos cuentas, sin importar quién bloqueó a quién.
create or replace function public.hay_bloqueo(a uuid, b uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.blocks
    where (blocker = a and blocked = b)
       or (blocker = b and blocked = a)
  );
$$;

revoke all on function public.hay_bloqueo(uuid, uuid) from public, anon, authenticated;

-- El par entre dos cuentas, si ya existe.
create or replace function public.par_entre(a uuid, b uuid)
returns uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select members.pair_id
  from public.pair_members members
  group by members.pair_id
  having count(*) = 2
     and count(*) filter (where members.user_id in (a, b)) = 2
  limit 1;
$$;

revoke all on function public.par_entre(uuid, uuid) from public, anon, authenticated;

-- Crea el par entre dos cuentas si no está. Es la única puerta de creación:
-- se llega acá aceptando una solicitud (o cuando dos solicitudes se cruzan).
-- El advisory lock serializa los dos órdenes posibles del mismo par, igual
-- que hacía ensure_direct_pair.
create or replace function public.crear_par_entre(a uuid, b uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  found_pair uuid;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(least(a::text, b::text) || ':' || greatest(a::text, b::text), 0)
  );

  found_pair := public.par_entre(a, b);
  if found_pair is null then
    insert into public.pairs default values returning id into found_pair;
    insert into public.pair_members (pair_id, user_id) values (found_pair, a), (found_pair, b);
  end if;
  return found_pair;
end;
$$;

revoke all on function public.crear_par_entre(uuid, uuid) from public, anon, authenticated;

-- ── Solicitudes ─────────────────────────────────────────────────────────────

-- Devuelve cómo quedó la cosa: 'enviada', 'aceptada' (se cruzaron las
-- solicitudes y ya son contactos) o 'contactos' (ya lo eran).
create or replace function public.enviar_solicitud(p_to uuid)
returns text
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Sesión requerida'; end if;
  if p_to = me then raise exception 'No podés agregarte a vos mismo'; end if;
  if not exists (select 1 from public.profiles where user_id = p_to) then
    raise exception 'Esa cuenta no existe';
  end if;

  if public.par_entre(me, p_to) is not null then
    return 'contactos';
  end if;

  if exists (select 1 from public.blocks where blocker = me and blocked = p_to) then
    raise exception 'Bloqueaste a esta cuenta. Desbloqueala desde Ajustes para escribirle.';
  end if;

  -- Si el otro te bloqueó, la solicitud se responde igual que si hubiera
  -- salido: decir «no se pudo» sería contarle a alguien que lo bloquearon.
  if exists (select 1 from public.blocks where blocker = p_to and blocked = me) then
    return 'enviada';
  end if;

  -- Dos solicitudes cruzadas son un acuerdo: se vuelven contactos sin más.
  if exists (
    select 1 from public.contact_requests
    where from_user = p_to and to_user = me
  ) then
    perform public.crear_par_entre(me, p_to);
    delete from public.contact_requests
    where (from_user = me and to_user = p_to)
       or (from_user = p_to and to_user = me);
    return 'aceptada';
  end if;

  insert into public.contact_requests (from_user, to_user)
  values (me, p_to)
  on conflict do nothing;
  return 'enviada';
end;
$$;

-- Acepta o rechaza. Devuelve el pair_id al aceptar, null al rechazar.
create or replace function public.responder_solicitud(p_from uuid, p_aceptar boolean)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  me uuid := auth.uid();
  borradas integer;
begin
  if me is null then raise exception 'Sesión requerida'; end if;

  delete from public.contact_requests
  where from_user = p_from and to_user = me;
  get diagnostics borradas = row_count;
  if borradas = 0 then
    raise exception 'Esa solicitud ya no está';
  end if;

  if not p_aceptar then
    return null;
  end if;
  return public.crear_par_entre(me, p_from);
end;
$$;

-- Las que te llegaron, con la identidad de quien las mandó.
create or replace function public.listar_solicitudes()
returns table (
  from_user    uuid,
  username     text,
  display_name text,
  avatar_path  text,
  created_at   timestamptz
)
language sql
security definer
stable
set search_path = public, auth, pg_temp
as $$
  select r.from_user, p.username, p.display_name, p.avatar_path, r.created_at
  from public.contact_requests r
  join public.profiles p on p.user_id = r.from_user
  where r.to_user = auth.uid()
  order by r.created_at desc;
$$;

-- ── Bloqueo ─────────────────────────────────────────────────────────────────

create or replace function public.bloquear_usuario(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Sesión requerida'; end if;
  if p_user = me then raise exception 'No podés bloquearte a vos mismo'; end if;

  insert into public.blocks (blocker, blocked)
  values (me, p_user)
  on conflict do nothing;

  -- Lo pendiente entre ambos se descarta: un bloqueo no deja trámites vivos.
  delete from public.contact_requests
  where (from_user = me and to_user = p_user)
     or (from_user = p_user and to_user = me);
end;
$$;

create or replace function public.desbloquear_usuario(p_user uuid)
returns void
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  delete from public.blocks
  where blocker = auth.uid() and blocked = p_user;
$$;

create or replace function public.listar_bloqueados()
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_path  text,
  created_at   timestamptz
)
language sql
security definer
stable
set search_path = public, auth, pg_temp
as $$
  select b.blocked, p.username, p.display_name, p.avatar_path, b.created_at
  from public.blocks b
  join public.profiles p on p.user_id = b.blocked
  where b.blocker = auth.uid()
  order by b.created_at desc;
$$;

revoke all on function public.enviar_solicitud(uuid) from public;
revoke all on function public.responder_solicitud(uuid, boolean) from public;
revoke all on function public.listar_solicitudes() from public;
revoke all on function public.bloquear_usuario(uuid) from public;
revoke all on function public.desbloquear_usuario(uuid) from public;
revoke all on function public.listar_bloqueados() from public;
grant execute on function public.enviar_solicitud(uuid) to authenticated;
grant execute on function public.responder_solicitud(uuid, boolean) to authenticated;
grant execute on function public.listar_solicitudes() to authenticated;
grant execute on function public.bloquear_usuario(uuid) to authenticated;
grant execute on function public.desbloquear_usuario(uuid) to authenticated;
grant execute on function public.listar_bloqueados() to authenticated;

-- ── La búsqueda entiende de solicitudes y no muestra bloqueados ─────────────
--
-- Gana la columna `solicitud` ('enviada' | 'recibida' | null) para que la UI
-- diga en qué está cada cuenta. Cambia el tipo de retorno, así que se suelta.

drop function if exists public.search_contacts(text, integer);

create or replace function public.search_contacts(
  p_query text default '',
  p_limit integer default 20
)
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_path  text,
  pair_id      uuid,
  solicitud    text
)
language sql
security definer
stable
set search_path = public, auth, pg_temp
as $$
  select
    profile.user_id,
    profile.username,
    profile.display_name,
    profile.avatar_path,
    (
      select mine.pair_id
      from public.pair_members mine
      join public.pair_members other on other.pair_id = mine.pair_id
      where mine.user_id = auth.uid()
        and other.user_id = profile.user_id
      limit 1
    ) as pair_id,
    case
      when exists (
        select 1 from public.contact_requests r
        where r.from_user = auth.uid() and r.to_user = profile.user_id
      ) then 'enviada'
      when exists (
        select 1 from public.contact_requests r
        where r.from_user = profile.user_id and r.to_user = auth.uid()
      ) then 'recibida'
    end as solicitud
  from public.profiles profile
  where auth.uid() is not null
    and profile.user_id <> auth.uid()
    -- Bloqueado en cualquier dirección: como si la cuenta no existiera.
    and not public.hay_bloqueo(auth.uid(), profile.user_id)
    and (
      btrim(p_query) = ''
      or profile.username ilike '%' || btrim(p_query) || '%'
      or coalesce(profile.display_name, '') ilike '%' || btrim(p_query) || '%'
    )
  order by
    case when profile.username ilike btrim(p_query) || '%' then 0 else 1 end,
    profile.username
  limit greatest(1, least(coalesce(p_limit, 20), 30));
$$;

revoke all on function public.search_contacts(text, integer) from public;
grant execute on function public.search_contacts(text, integer) to authenticated;

-- ── La bandeja no lista a quien bloqueaste ──────────────────────────────────
--
-- Solo para quien bloquea: para el otro la conversación sigue a la vista, y
-- recién al escribir se entera de que no pasa. Mismo tipo de retorno, así que
-- alcanza con reemplazarla.

create or replace function public.list_my_conversations()
returns table (
  pair_id           uuid,
  contact_user_id   uuid,
  username          text,
  display_name      text,
  avatar_path       text,
  last_message_text text,
  last_message_at   timestamptz,
  unread_count      bigint
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
    profile.display_name,
    profile.avatar_path,
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
    and not exists (
      select 1 from public.blocks b
      where b.blocker = auth.uid() and b.blocked = other.user_id
    )
  order by latest.created_at desc nulls last, profile.username;
$$;

-- ── ensure_direct_pair ya no crea pares ─────────────────────────────────────
--
-- Queda como lo que siempre debió ser: «dame la conversación que ya tenemos».
-- Empezar una nueva pasa por la solicitud. Se conserva la firma para que el
-- cliente viejo falle con un mensaje claro en vez de con un par fantasma.

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

  found_pair := public.par_entre(me, p_other_user_id);
  if found_pair is null then
    raise exception 'Todavía no son contactos. Mandale una solicitud primero.';
  end if;
  return found_pair;
end;
$$;

-- ── Ningún mensaje cruza un bloqueo ─────────────────────────────────────────
--
-- Un trigger y no la policy de INSERT: la policy rechaza con un «row-level
-- security» crudo, y esto tiene que llegarle a la persona como una frase.

create or replace function public.frenar_mensaje_bloqueado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.pair_members pm
    where pm.pair_id = new.pair_id
      and pm.user_id <> new.sender_id
      and public.hay_bloqueo(new.sender_id, pm.user_id)
  ) then
    raise exception 'Esta cuenta no está disponible.';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_bloqueo on public.messages;
create trigger messages_bloqueo
  before insert on public.messages
  for each row execute function public.frenar_mensaje_bloqueado();

-- ── Realtime ────────────────────────────────────────────────────────────────

-- Una solicitud nueva (o respondida) despierta la bandeja de los dos lados.
do $$
begin
  alter publication supabase_realtime add table public.contact_requests;
exception
  when duplicate_object then null;
end
$$;
-- FULL para que los DELETE (aceptar, rechazar) digan de qué fila eran.
alter table public.contact_requests replica identity full;
