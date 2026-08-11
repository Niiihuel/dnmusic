-- ═══════════════════════════════════════════════════════════════════════════
-- Esquema de Dany.
--
-- Traducción de firebase/firestore.rules a Postgres + RLS. La app es privada
-- para exactamente 2 personas (un "par"): solo los miembros del par leen y
-- escriben sus mensajes, y nadie más entra.
--
-- Se corre entero en el SQL Editor de Supabase. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tablas ─────────────────────────────────────────────────────────────────

create table if not exists public.pairs (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- Membresía como tabla puente en vez de un array de uids (como hacía
-- Firestore): es indexable y no obliga a leer el documento del par entero para
-- decidir cada permiso.
create table if not exists public.pair_members (
  pair_id uuid not null references public.pairs(id) on delete cascade,
  user_id uuid not null references auth.users(id)   on delete cascade,
  primary key (pair_id, user_id)
);

create index if not exists pair_members_user_idx on public.pair_members(user_id);

create table if not exists public.messages (
  id             uuid primary key default gen_random_uuid(),
  pair_id        uuid not null references public.pairs(id) on delete cascade,
  sender_id      uuid not null references auth.users(id),
  flower_type    text not null check (flower_type in ('tulipan', 'orquidea')),
  flower_variant text not null check (flower_variant in (
                   'tulipanRosa', 'tulipanAmarillo', 'tulipanBlanco',
                   'orquideaBlanca', 'orquideaMorada', 'orquideaRosa')),
  text           text not null check (length(text) between 1 and 2000),
  song           jsonb,
  created_at     timestamptz not null default now(),
  opened_at      timestamptz,
  read_at        timestamptz
);

-- El jardín se lee siempre por par y en orden cronológico.
create index if not exists messages_pair_created_idx
  on public.messages(pair_id, created_at);

-- ── Helper de pertenencia ──────────────────────────────────────────────────

-- SECURITY DEFINER a propósito: sin esto, una policy sobre pair_members que
-- consulta pair_members entra en recursión infinita de RLS. Al correr como
-- dueño, la función salta RLS y la recursión desaparece.
-- search_path fijo para que no la puedan secuestrar desde el cliente.
create or replace function public.is_pair_member(p uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.pair_members
    where pair_id = p and user_id = auth.uid()
  );
$$;

-- ── Inmutabilidad de los mensajes ──────────────────────────────────────────

-- Equivalente del `affectedKeys().hasOnly(['openedAt','readAt'])` de Firestore.
-- Una policy de UPDATE no puede comparar contra la fila vieja, así que la parte
-- fina va en un trigger. También fuerza los timestamps al reloj del servidor,
-- como hacía la regla `request.resource.data.openedAt == request.time`.
create or replace function public.enforce_message_immutability()
returns trigger
language plpgsql
as $$
begin
  if new.id             is distinct from old.id
  or new.pair_id        is distinct from old.pair_id
  or new.sender_id      is distinct from old.sender_id
  or new.flower_type    is distinct from old.flower_type
  or new.flower_variant is distinct from old.flower_variant
  or new.text           is distinct from old.text
  or new.song           is distinct from old.song
  or new.created_at     is distinct from old.created_at then
    raise exception 'Solo se pueden modificar opened_at y read_at';
  end if;

  -- Una flor se abre y se lee una sola vez; y la hora la pone el servidor.
  if new.opened_at is distinct from old.opened_at then
    if old.opened_at is not null then
      raise exception 'opened_at ya estaba fijado';
    end if;
    new.opened_at := now();
  end if;

  if new.read_at is distinct from old.read_at then
    if old.read_at is not null then
      raise exception 'read_at ya estaba fijado';
    end if;
    new.read_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists messages_immutable on public.messages;
create trigger messages_immutable
  before update on public.messages
  for each row execute function public.enforce_message_immutability();

-- ── Row Level Security ─────────────────────────────────────────────────────

alter table public.pairs        enable row level security;
alter table public.pair_members enable row level security;
alter table public.messages     enable row level security;

-- pairs: los miembros lo leen. Lo crea el administrador desde el dashboard.
drop policy if exists "members read their pair" on public.pairs;
create policy "members read their pair" on public.pairs
  for select to authenticated
  using (public.is_pair_member(id));

-- pair_members: cada miembro ve la membresía de su propio par (así descubre
-- también el uid de la otra persona).
drop policy if exists "members read membership" on public.pair_members;
create policy "members read membership" on public.pair_members
  for select to authenticated
  using (public.is_pair_member(pair_id));

-- messages: ambos miembros leen todo el jardín.
drop policy if exists "members read messages" on public.messages;
create policy "members read messages" on public.messages
  for select to authenticated
  using (public.is_pair_member(pair_id));

-- Solo se puede crear un mensaje del cual soy el remitente.
drop policy if exists "members send own messages" on public.messages;
create policy "members send own messages" on public.messages
  for insert to authenticated
  with check (public.is_pair_member(pair_id) and sender_id = auth.uid());

-- Solo el receptor puede marcar abierta/leída, nunca el remitente. Qué columnas
-- puede tocar lo impone el trigger de arriba.
drop policy if exists "receiver marks opened" on public.messages;
create policy "receiver marks opened" on public.messages
  for update to authenticated
  using      (public.is_pair_member(pair_id) and sender_id <> auth.uid())
  with check (public.is_pair_member(pair_id) and sender_id <> auth.uid());

-- Sin policy de DELETE: RLS deniega por defecto, así que nadie borra flores.

-- ── Privilegios ────────────────────────────────────────────────────────────

-- Supabase ya concede esto por default en el schema public, pero explicitarlo
-- hace que el script funcione tal cual en cualquier Postgres. Sin GRANT, RLS ni
-- siquiera llega a evaluarse: el permiso se deniega antes.
-- No se concede DELETE: las flores no se borran.
grant usage on schema public to authenticated;
grant select                 on public.pairs        to authenticated;
grant select                 on public.pair_members to authenticated;
grant select, insert, update on public.messages     to authenticated;

-- ── Realtime ───────────────────────────────────────────────────────────────

-- Sin esto el canal de postgres_changes no emite nada y el jardín no se
-- actualiza solo. Envuelto porque agregar dos veces la misma tabla tira.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end
$$;

-- REPLICA IDENTITY FULL para que los eventos de UPDATE incluyan todas las
-- columnas y no solo la primary key (necesario para ver opened_at/read_at).
alter table public.messages replica identity full;

-- ═══════════════════════════════════════════════════════════════════════════
-- Puesta en marcha (una sola vez, después de crear los 2 usuarios en
-- Authentication → Users):
--
--   insert into public.pairs (id) values (gen_random_uuid()) returning id;
--
--   insert into public.pair_members (pair_id, user_id) values
--     ('<PAIR_ID>', '<TU_USER_ID>'),
--     ('<PAIR_ID>', '<SU_USER_ID>');
-- ═══════════════════════════════════════════════════════════════════════════
