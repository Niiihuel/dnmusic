-- ═══════════════════════════════════════════════════════════════════════════
-- Jam: escuchar juntos, cada uno desde su cuenta.
--
-- Una sesión temporal con una cola compartida. El que la crea es el host; el
-- resto entra con un código o un link. **Postgres es la autoridad**: los
-- clientes no escriben estado, piden cosas — cada función de acá valida quién
-- pide y qué permiso tiene, aplica dentro de una transacción serializada por
-- advisory lock, y sube `revision`. Un cliente con estado viejo no puede pisar
-- nada porque no hay ningún camino por el que un cliente escriba estado.
--
-- La reproducción se guarda como intención, no como sonido: `posicion_ms` y
-- `arrancado_en` (reloj del servidor). La posición real se deriva:
--
--     posicion_ms + (now() - arrancado_en)      -- cuando suena
--
-- así nadie tiene que escribir la posición periódicamente — solo en los
-- eventos (play, pausa, salto, cambio de tema). Es lo que permite que los
-- miembros que escuchan en su propio dispositivo se mantengan sincronizados
-- sin un solo tick del lado del servidor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tablas ─────────────────────────────────────────────────────────────────

create table if not exists public.jams (
  id         uuid primary key default gen_random_uuid(),
  -- Corto para dictarlo en voz alta; sin I/L/O/0/1, que se confunden escritos.
  code       text not null unique,
  host_id    uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'activo' check (status in ('activo', 'terminado')),

  -- Permisos como columnas y no jsonb: se chequean en SQL y agregar uno nuevo
  -- es una migración, que es exactamente el peso que un permiso debe tener.
  -- Los defaults son los de Spotify: todos controlan, el host restringe.
  invitados_agregan   boolean not null default true,
  invitados_controlan boolean not null default true,
  invitados_saltan    boolean not null default true,

  -- La intención de reproducción. La FK a jam_queue se agrega más abajo,
  -- porque las dos tablas se referencian mutuamente.
  item_actual  uuid,
  suena        boolean not null default false,
  posicion_ms  integer not null default 0,
  -- Se fija unos ms en el futuro al arrancar, para que todos lleguen juntos.
  arrancado_en timestamptz,

  -- Reloj lógico: sube en cada mutación. Los clientes descartan lo viejo.
  revision   bigint not null default 0,
  created_at timestamptz not null default now(),
  -- Vence solo si nadie lo toca: cada mutación lo corre seis horas. Es lo que
  -- hace inofensivo que el host desaparezca sin terminar — el Jam muere solo.
  expires_at timestamptz not null default now() + interval '6 hours'
);

-- Un host, un Jam activo. Sin esto, crear dos y abandonar uno dejaría a los
-- invitados adentro de un cascarón que nadie mira.
create unique index if not exists jams_host_activo_idx
  on public.jams(host_id) where status = 'activo';

create table if not exists public.jam_members (
  jam_id    uuid not null references public.jams(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  rol       text not null default 'invitado' check (rol in ('host', 'invitado')),
  -- Dónde escucha: 'propia' reproduce en su dispositivo, sincronizado;
  -- 'host' es control remoto — el audio sale solo del dispositivo del host.
  salida    text not null default 'propia' check (salida in ('propia', 'host')),
  joined_at timestamptz not null default now(),
  primary key (jam_id, user_id)
);

create index if not exists jam_members_user_idx on public.jam_members(user_id);

-- La cola. Cada ítem lleva la canción **entera**, no una referencia: el id de
-- una canción de lista es la fila de playlist_tracks, que es de su dueño y RLS
-- no deja leerla a nadie más. Lo que un invitado necesita para reproducir es
-- el audio_path — que se firma contra Storage con su propia sesión — y los
-- metadatos para dibujar. Desnormalizado, todo eso viaja con el ítem.
create table if not exists public.jam_queue (
  id           uuid primary key default gen_random_uuid(),
  jam_id       uuid not null references public.jams(id) on delete cascade,
  -- numeric a propósito: insertar entre dos ítems es (a+b)/2, así reordenar
  -- —cuando exista— toca una fila y no renumera la cola entera.
  posicion     numeric not null,
  added_by     uuid not null references auth.users(id),
  added_at     timestamptz not null default now(),
  video_id     text not null,
  title        text not null,
  artist       text not null default '',
  artist_id    text,
  artwork_url  text not null default '',
  artwork_path text,
  audio_path   text not null,
  duration_ms  integer not null default 0,
  true_peak    double precision
);

create index if not exists jam_queue_jam_idx on public.jam_queue(jam_id, posicion);

alter table public.jams
  drop constraint if exists jams_item_actual_fkey;
alter table public.jams
  add constraint jams_item_actual_fkey
  foreign key (item_actual) references public.jam_queue(id) on delete set null;

-- ── Pertenencia ────────────────────────────────────────────────────────────

-- SECURITY DEFINER por lo mismo que is_pair_member: una policy sobre
-- jam_members que consulta jam_members entra en recursión infinita de RLS.
create or replace function public.is_jam_member(j uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.jam_members
    where jam_id = j and user_id = auth.uid()
  );
$$;

-- ── Row Level Security ─────────────────────────────────────────────────────

alter table public.jams        enable row level security;
alter table public.jam_members enable row level security;
alter table public.jam_queue   enable row level security;

-- Solo lectura, y solo para miembros. **No hay policy de escritura a
-- propósito**: el único camino de escritura son las funciones de abajo, que
-- corren como dueño. Así "validar en el servidor" no es una promesa — es que
-- no existe otro camino.
drop policy if exists "members read jam" on public.jams;
create policy "members read jam" on public.jams
  for select to authenticated
  using (public.is_jam_member(id));

drop policy if exists "members read jam members" on public.jam_members;
create policy "members read jam members" on public.jam_members
  for select to authenticated
  using (public.is_jam_member(jam_id));

drop policy if exists "members read jam queue" on public.jam_queue;
create policy "members read jam queue" on public.jam_queue
  for select to authenticated
  using (public.is_jam_member(jam_id));

grant usage on schema public to authenticated;
grant select on public.jams        to authenticated;
grant select on public.jam_members to authenticated;
grant select on public.jam_queue   to authenticated;

-- ── Ayudantes internos ─────────────────────────────────────────────────────
-- Ninguno se expone al cliente: al final se les revoca execute. Corren solo
-- desde las funciones públicas, que son del mismo dueño.

-- Abre un Jam para mutarlo: toma el lock que serializa todas las escrituras
-- sobre ese Jam, y verifica que siga vivo. Es la primera línea de toda
-- mutación — de acá sale que dos pedidos simultáneos se apliquen de a uno.
create or replace function public.jam_abrir(j uuid)
returns public.jams
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.jams;
begin
  if auth.uid() is null then
    raise exception 'Sesión requerida';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(j::text, 0));
  select * into v from public.jams where id = j;
  if v.id is null then
    raise exception 'Ese Jam no existe';
  end if;
  if v.status <> 'activo' or v.expires_at <= now() then
    raise exception 'Ese Jam ya terminó';
  end if;
  return v;
end;
$$;

-- Qué puede hacer quien pide. El host puede todo; el resto, lo que las
-- columnas del Jam permitan. Es el único lugar donde se decide.
create or replace function public.jam_autorizado(v public.jams, me uuid, accion text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.jam_members where jam_id = v.id and user_id = me
  ) then
    raise exception 'No estás en ese Jam';
  end if;
  if v.host_id = me then
    return;
  end if;
  if accion = 'agregar'   and v.invitados_agregan   then return; end if;
  if accion = 'controlar' and v.invitados_controlan then return; end if;
  if accion = 'saltar'    and v.invitados_saltan    then return; end if;
  raise exception 'El host no permite eso';
end;
$$;

-- La posición real ahora, derivada de la intención. Es la misma cuenta que
-- hacen los clientes; el servidor la usa al pausar sin dato del host.
create or replace function public.jam_posicion(v public.jams)
returns integer
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select case
    when v.suena and v.arrancado_en is not null then
      v.posicion_ms + greatest(0,
        (extract(epoch from (now() - v.arrancado_en)) * 1000)::integer)
    else v.posicion_ms
  end;
$$;

-- Salir de cualquier Jam activo en el que se esté. Se llama antes de crear o
-- unirse a otro: una persona está en un solo Jam a la vez, y ese invariante
-- vive acá y no repartido por los clientes.
create or replace function public.jam_salir_interna(me uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m record;
begin
  for m in
    select jm.jam_id, jm.rol
    from public.jam_members jm
    join public.jams j on j.id = jm.jam_id
    where jm.user_id = me and j.status = 'activo'
  loop
    perform pg_advisory_xact_lock(hashtextextended(m.jam_id::text, 0));
    if m.rol = 'host' then
      -- El host que se va termina el Jam, como en Spotify: sin quien lo
      -- emite, dejarlo abierto sería una sala con la música colgada.
      update public.jams
      set status = 'terminado', suena = false, arrancado_en = null,
          revision = revision + 1
      where id = m.jam_id;
    else
      delete from public.jam_members
      where jam_id = m.jam_id and user_id = me;
      update public.jams set revision = revision + 1 where id = m.jam_id;
    end if;
  end loop;
end;
$$;

-- Vuelca las canciones de un jsonb a la cola. Las inválidas se saltean en vez
-- de tirar: una cola con 49 canciones sanas no se pierde por una rota.
create or replace function public.jam_volcar_cola(j uuid, me uuid, canciones jsonb, desde numeric)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.jam_queue
    (jam_id, posicion, added_by, video_id, title, artist, artist_id,
     artwork_url, artwork_path, audio_path, duration_ms, true_peak)
  select
    j, desde + t.ord, me,
    t.c ->> 'videoId',
    coalesce(t.c ->> 'title', ''),
    coalesce(t.c ->> 'artist', ''),
    t.c ->> 'artistId',
    coalesce(t.c ->> 'artworkUrl', ''),
    t.c ->> 'artworkPath',
    t.c ->> 'audioPath',
    coalesce((t.c ->> 'durationMs')::integer, 0),
    (t.c ->> 'truePeak')::double precision
  from jsonb_array_elements(canciones) with ordinality as t(c, ord)
  where coalesce(t.c ->> 'audioPath', '') <> ''
    and coalesce(t.c ->> 'videoId', '') <> '';
$$;

-- ── El estado entero, para el arranque y el resync ─────────────────────────

-- Todo lo que un cliente necesita para reconstruirse: el Jam, la gente, la
-- cola y la hora del servidor — con esa última se mide el desfasaje de reloj.
-- Reconectar es llamar esto y reemplazar el estado local completo; nunca se
-- reproducen comandos viejos.
create or replace function public.jam_estado(p_jam_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  v public.jams;
begin
  if me is null then
    raise exception 'Sesión requerida';
  end if;
  select * into v from public.jams where id = p_jam_id;
  if v.id is null then
    raise exception 'Ese Jam no existe';
  end if;
  if not exists (
    select 1 from public.jam_members where jam_id = p_jam_id and user_id = me
  ) then
    raise exception 'No estás en ese Jam';
  end if;

  return jsonb_build_object(
    'jam', to_jsonb(v),
    'miembros', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'rol', m.rol,
        'salida', m.salida,
        'joined_at', m.joined_at,
        'username', p.username,
        'display_name', p.display_name,
        'avatar_path', p.avatar_path
      ) order by m.joined_at)
      from public.jam_members m
      left join public.profiles p on p.user_id = m.user_id
      where m.jam_id = p_jam_id
    ), '[]'::jsonb),
    'cola', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.posicion)
      from public.jam_queue q
      where q.jam_id = p_jam_id
    ), '[]'::jsonb),
    'ahora', (extract(epoch from now()) * 1000)::bigint
  );
end;
$$;

-- ── Crear, entrar, salir ───────────────────────────────────────────────────

-- La cola que venías escuchando pasa a ser la del Jam, apuntando a la canción
-- que sonaba y en el segundo en que iba. Es la decisión de producto: un Jam se
-- arranca desde lo que suena, no desde una pantalla en blanco.
create or replace function public.crear_jam(
  p_canciones jsonb,
  p_indice integer default 0,
  p_suena boolean default false,
  p_posicion_ms integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  v_jam uuid;
  v_code text;
  v_item uuid;
  alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if me is null then
    raise exception 'Sesión requerida';
  end if;
  if p_canciones is null or jsonb_typeof(p_canciones) <> 'array'
     or jsonb_array_length(p_canciones) = 0 then
    raise exception 'No hay nada sonando para compartir';
  end if;
  if jsonb_array_length(p_canciones) > 500 then
    raise exception 'Demasiadas canciones para un Jam';
  end if;

  perform public.jam_salir_interna(me);

  -- random() alcanza: el código vive horas, es de un espacio de 31^6 y lo
  -- peor que filtra es una lista de canciones a alguien con cuenta.
  for intento in 1..20 loop
    select string_agg(substr(alfabeto, 1 + floor(random() * 31)::int, 1), '')
    into v_code
    from generate_series(1, 6);
    begin
      insert into public.jams (code, host_id, suena, posicion_ms, arrancado_en, revision)
      values (
        v_code, me, p_suena, greatest(0, p_posicion_ms),
        case when p_suena then now() end,
        1
      )
      returning id into v_jam;
      exit;
    exception when unique_violation then
      if intento = 20 then
        raise exception 'No se pudo generar un código';
      end if;
    end;
  end loop;

  insert into public.jam_members (jam_id, user_id, rol, salida)
  values (v_jam, me, 'host', 'propia');

  perform public.jam_volcar_cola(v_jam, me, p_canciones, 0);

  select id into v_item
  from public.jam_queue
  where jam_id = v_jam
  order by posicion
  offset greatest(0, p_indice)
  limit 1;

  update public.jams set item_actual = v_item where id = v_jam;

  return public.jam_estado(v_jam);
end;
$$;

create or replace function public.unirse_jam(p_code text, p_salida text default 'propia')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  v_jam uuid;
  v public.jams;
begin
  if me is null then
    raise exception 'Sesión requerida';
  end if;
  if p_salida not in ('propia', 'host') then
    raise exception 'Salida inválida';
  end if;

  select id into v_jam
  from public.jams
  where code = upper(btrim(coalesce(p_code, '')))
    and status = 'activo' and expires_at > now();
  if v_jam is null then
    raise exception 'Ese Jam ya no existe';
  end if;

  v := public.jam_abrir(v_jam);

  if exists (
    select 1 from public.jam_members where jam_id = v_jam and user_id = me
  ) then
    -- Ya estaba: solo actualiza dónde escucha. Pasa al reabrir el link.
    update public.jam_members set salida = p_salida
    where jam_id = v_jam and user_id = me;
  else
    if (select count(*) from public.jam_members where jam_id = v_jam) >= 32 then
      raise exception 'Ese Jam está lleno';
    end if;
    perform public.jam_salir_interna(me);
    insert into public.jam_members (jam_id, user_id, rol, salida)
    values (v_jam, me, 'invitado', p_salida);
  end if;

  update public.jams
  set revision = revision + 1, expires_at = now() + interval '6 hours'
  where id = v_jam;

  return public.jam_estado(v_jam);
end;
$$;

create or replace function public.salir_jam(p_jam_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sesión requerida';
  end if;
  -- La interna ya distingue: host que se va = Jam terminado.
  perform public.jam_salir_interna(me);
end;
$$;

create or replace function public.terminar_jam(p_jam_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.jams := public.jam_abrir(p_jam_id);
begin
  if v.host_id <> auth.uid() then
    raise exception 'Solo el host puede terminar el Jam';
  end if;
  update public.jams
  set status = 'terminado', suena = false, arrancado_en = null,
      revision = revision + 1
  where id = p_jam_id;
end;
$$;

create or replace function public.jam_expulsar(p_jam_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.jams := public.jam_abrir(p_jam_id);
begin
  if v.host_id <> auth.uid() then
    raise exception 'Solo el host puede sacar a alguien';
  end if;
  if p_user_id = v.host_id then
    raise exception 'El host no se puede sacar a sí mismo';
  end if;
  delete from public.jam_members
  where jam_id = p_jam_id and user_id = p_user_id;
  update public.jams
  set revision = revision + 1, expires_at = now() + interval '6 hours'
  where id = p_jam_id;
end;
$$;

create or replace function public.jam_salida(p_jam_id uuid, p_salida text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.jams := public.jam_abrir(p_jam_id);
begin
  if p_salida not in ('propia', 'host') then
    raise exception 'Salida inválida';
  end if;
  update public.jam_members set salida = p_salida
  where jam_id = p_jam_id and user_id = auth.uid();
  if not found then
    raise exception 'No estás en ese Jam';
  end if;
end;
$$;

-- ── La cola ────────────────────────────────────────────────────────────────

create or replace function public.jam_agregar(p_jam_id uuid, p_cancion jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  v public.jams := public.jam_abrir(p_jam_id);
  v_desde numeric;
begin
  perform public.jam_autorizado(v, me, 'agregar');
  if coalesce(p_cancion ->> 'audioPath', '') = ''
     or coalesce(p_cancion ->> 'videoId', '') = '' then
    raise exception 'Esa canción no se puede agregar';
  end if;
  if (select count(*) from public.jam_queue where jam_id = p_jam_id) >= 500 then
    raise exception 'La cola del Jam está llena';
  end if;

  select coalesce(max(posicion), 0) into v_desde
  from public.jam_queue where jam_id = p_jam_id;

  perform public.jam_volcar_cola(
    p_jam_id, me, jsonb_build_array(p_cancion), v_desde);

  -- Si la cola había terminado, lo agregado pasa a ser lo que sigue.
  if v.item_actual is null then
    update public.jams
    set item_actual = (
      select id from public.jam_queue
      where jam_id = p_jam_id order by posicion desc limit 1
    )
    where id = p_jam_id;
  end if;

  update public.jams
  set revision = revision + 1, expires_at = now() + interval '6 hours'
  where id = p_jam_id;
end;
$$;

create or replace function public.jam_quitar(p_jam_id uuid, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  v public.jams := public.jam_abrir(p_jam_id);
  v_dueno uuid;
begin
  if v.item_actual = p_item_id then
    raise exception 'Esa es la que está sonando';
  end if;
  select added_by into v_dueno
  from public.jam_queue where id = p_item_id and jam_id = p_jam_id;
  if v_dueno is null then
    raise exception 'Esa canción no está en el Jam';
  end if;
  -- El host quita cualquiera; un invitado, solo lo que agregó él. No es un
  -- permiso configurable: quitar lo ajeno es pelearse, no escuchar juntos.
  if v.host_id <> me and v_dueno <> me then
    raise exception 'Solo podés quitar lo que agregaste vos';
  end if;

  delete from public.jam_queue where id = p_item_id;
  update public.jams
  set revision = revision + 1, expires_at = now() + interval '6 hours'
  where id = p_jam_id;
end;
$$;

-- ── El transporte ──────────────────────────────────────────────────────────

-- `p_ms` viene solo del host, que es el único que oye el audio real y sabe la
-- posición verdadera; los invitados mandan null y se usa la derivada.

create or replace function public.jam_play(p_jam_id uuid, p_ms integer default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.jams := public.jam_abrir(p_jam_id);
begin
  perform public.jam_autorizado(v, auth.uid(), 'controlar');
  update public.jams
  set suena = true,
      posicion_ms = greatest(0, coalesce(p_ms, posicion_ms)),
      -- `now()` a secas, sin corrimiento al futuro: quien apretó play ya está
      -- sonando de forma optimista, y correr el instante lo dejaría adelantado
      -- respecto de la verdad para siempre. El corrimiento es solo para los
      -- cambios de tema (ver jam_tocar), donde nadie arrancó todavía.
      arrancado_en = now(),
      revision = revision + 1,
      expires_at = now() + interval '6 hours'
  where id = p_jam_id;
end;
$$;

create or replace function public.jam_pause(p_jam_id uuid, p_ms integer default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.jams := public.jam_abrir(p_jam_id);
begin
  perform public.jam_autorizado(v, auth.uid(), 'controlar');
  update public.jams
  set posicion_ms = greatest(0, coalesce(p_ms, public.jam_posicion(v))),
      suena = false,
      arrancado_en = null,
      revision = revision + 1,
      expires_at = now() + interval '6 hours'
  where id = p_jam_id;
end;
$$;

create or replace function public.jam_seek(p_jam_id uuid, p_ms integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.jams := public.jam_abrir(p_jam_id);
begin
  perform public.jam_autorizado(v, auth.uid(), 'controlar');
  update public.jams
  set posicion_ms = greatest(0, p_ms),
      arrancado_en = case when suena then now() end,
      revision = revision + 1,
      expires_at = now() + interval '6 hours'
  where id = p_jam_id;
end;
$$;

-- Saltar a un ítem concreto. Lo usa tocar una fila, y el host para publicar
-- el cambio de tema cuando una canción termina sola.
create or replace function public.jam_tocar(p_jam_id uuid, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.jams := public.jam_abrir(p_jam_id);
begin
  perform public.jam_autorizado(v, auth.uid(), 'saltar');
  if not exists (
    select 1 from public.jam_queue where id = p_item_id and jam_id = p_jam_id
  ) then
    raise exception 'Esa canción no está en el Jam';
  end if;
  update public.jams
  set item_actual = p_item_id,
      posicion_ms = 0,
      suena = true,
      arrancado_en = now() + interval '600 milliseconds',
      revision = revision + 1,
      expires_at = now() + interval '6 hours'
  where id = p_jam_id;
end;
$$;

-- «La que sigue» se resuelve ACÁ, dentro del lock: si dos personas saltan a la
-- vez, la segunda parte del resultado de la primera y no del estado que vio.
create or replace function public.jam_saltar(p_jam_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.jams := public.jam_abrir(p_jam_id);
  v_next uuid;
begin
  perform public.jam_autorizado(v, auth.uid(), 'saltar');

  select q.id into v_next
  from public.jam_queue q
  where q.jam_id = p_jam_id
    and (v.item_actual is null or q.posicion > (
      select posicion from public.jam_queue where id = v.item_actual
    ))
  order by q.posicion
  limit 1;

  if v_next is null then
    -- Se acabó la cola: el Jam queda en silencio, no en un loop que nadie
    -- pidió. Agregar una canción lo despierta (ver jam_agregar).
    update public.jams
    set suena = false, arrancado_en = null, posicion_ms = 0,
        revision = revision + 1, expires_at = now() + interval '6 hours'
    where id = p_jam_id;
  else
    update public.jams
    set item_actual = v_next, posicion_ms = 0, suena = true,
        arrancado_en = now() + interval '600 milliseconds',
        revision = revision + 1, expires_at = now() + interval '6 hours'
    where id = p_jam_id;
  end if;
end;
$$;

create or replace function public.jam_anterior(p_jam_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.jams := public.jam_abrir(p_jam_id);
  v_prev uuid;
begin
  perform public.jam_autorizado(v, auth.uid(), 'saltar');

  select q.id into v_prev
  from public.jam_queue q
  where q.jam_id = p_jam_id
    and v.item_actual is not null
    and q.posicion < (
      select posicion from public.jam_queue where id = v.item_actual
    )
  order by q.posicion desc
  limit 1;

  if v_prev is null then
    -- Sin anterior, «anterior» reinicia la actual — como cualquier reproductor.
    update public.jams
    set posicion_ms = 0,
        arrancado_en = case when suena then now() + interval '600 milliseconds' end,
        revision = revision + 1, expires_at = now() + interval '6 hours'
    where id = p_jam_id;
  else
    update public.jams
    set item_actual = v_prev, posicion_ms = 0, suena = true,
        arrancado_en = now() + interval '600 milliseconds',
        revision = revision + 1, expires_at = now() + interval '6 hours'
    where id = p_jam_id;
  end if;
end;
$$;

create or replace function public.jam_permisos(
  p_jam_id uuid,
  p_agregan boolean default null,
  p_controlan boolean default null,
  p_saltan boolean default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.jams := public.jam_abrir(p_jam_id);
begin
  if v.host_id <> auth.uid() then
    raise exception 'Solo el host cambia los permisos';
  end if;
  update public.jams
  set invitados_agregan   = coalesce(p_agregan, invitados_agregan),
      invitados_controlan = coalesce(p_controlan, invitados_controlan),
      invitados_saltan    = coalesce(p_saltan, invitados_saltan),
      revision = revision + 1,
      expires_at = now() + interval '6 hours'
  where id = p_jam_id;
end;
$$;

-- ── Mirar antes de entrar ──────────────────────────────────────────────────

-- Lo que ve la pantalla de «te invitaron»: quién lo emite y cuántos están.
-- Devuelve null si no existe o venció — la pantalla lo dice con palabras.
create or replace function public.ver_jam(p_code text)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select case when auth.uid() is null then null else (
    select jsonb_build_object(
      'id', j.id,
      'code', j.code,
      'host_username', p.username,
      'host_display_name', p.display_name,
      'host_avatar_path', p.avatar_path,
      'cuantos', (select count(*) from public.jam_members m where m.jam_id = j.id)
    )
    from public.jams j
    left join public.profiles p on p.user_id = j.host_id
    where j.code = upper(btrim(coalesce(p_code, '')))
      and j.status = 'activo' and j.expires_at > now()
  ) end;
$$;

-- El Jam activo en el que estoy, si hay. Para volver a engancharse al abrir
-- la app: la membresía vive en la base, no en la memoria de un proceso.
create or replace function public.mi_jam()
returns uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select jm.jam_id
  from public.jam_members jm
  join public.jams j on j.id = jm.jam_id
  where jm.user_id = auth.uid()
    and j.status = 'activo' and j.expires_at > now()
  limit 1;
$$;

-- ── Privilegios ────────────────────────────────────────────────────────────

-- Los internos no se llaman desde afuera.
revoke all on function public.jam_abrir(uuid) from public, authenticated;
revoke all on function public.jam_autorizado(public.jams, uuid, text) from public, authenticated;
revoke all on function public.jam_posicion(public.jams) from public, authenticated;
revoke all on function public.jam_salir_interna(uuid) from public, authenticated;
revoke all on function public.jam_volcar_cola(uuid, uuid, jsonb, numeric) from public, authenticated;

revoke all on function public.crear_jam(jsonb, integer, boolean, integer) from public;
revoke all on function public.unirse_jam(text, text) from public;
revoke all on function public.salir_jam(uuid) from public;
revoke all on function public.terminar_jam(uuid) from public;
revoke all on function public.jam_expulsar(uuid, uuid) from public;
revoke all on function public.jam_salida(uuid, text) from public;
revoke all on function public.jam_agregar(uuid, jsonb) from public;
revoke all on function public.jam_quitar(uuid, uuid) from public;
revoke all on function public.jam_play(uuid, integer) from public;
revoke all on function public.jam_pause(uuid, integer) from public;
revoke all on function public.jam_seek(uuid, integer) from public;
revoke all on function public.jam_tocar(uuid, uuid) from public;
revoke all on function public.jam_saltar(uuid) from public;
revoke all on function public.jam_anterior(uuid) from public;
revoke all on function public.jam_permisos(uuid, boolean, boolean, boolean) from public;
revoke all on function public.jam_estado(uuid) from public;
revoke all on function public.ver_jam(text) from public;
revoke all on function public.mi_jam() from public;

grant execute on function public.crear_jam(jsonb, integer, boolean, integer) to authenticated;
grant execute on function public.unirse_jam(text, text) to authenticated;
grant execute on function public.salir_jam(uuid) to authenticated;
grant execute on function public.terminar_jam(uuid) to authenticated;
grant execute on function public.jam_expulsar(uuid, uuid) to authenticated;
grant execute on function public.jam_salida(uuid, text) to authenticated;
grant execute on function public.jam_agregar(uuid, jsonb) to authenticated;
grant execute on function public.jam_quitar(uuid, uuid) to authenticated;
grant execute on function public.jam_play(uuid, integer) to authenticated;
grant execute on function public.jam_pause(uuid, integer) to authenticated;
grant execute on function public.jam_seek(uuid, integer) to authenticated;
grant execute on function public.jam_tocar(uuid, uuid) to authenticated;
grant execute on function public.jam_saltar(uuid) to authenticated;
grant execute on function public.jam_anterior(uuid) to authenticated;
grant execute on function public.jam_permisos(uuid, boolean, boolean, boolean) to authenticated;
grant execute on function public.jam_estado(uuid) to authenticated;
grant execute on function public.ver_jam(text) to authenticated;
grant execute on function public.mi_jam() to authenticated;

-- ── Realtime ───────────────────────────────────────────────────────────────

-- Igual que messages: sin publicación no hay eventos, y REPLICA IDENTITY FULL
-- para que un UPDATE traiga la fila entera — es lo que permite aplicar el
-- estado del Jam directamente del evento, sin un viaje extra a la base.
do $$
begin
  alter publication supabase_realtime add table public.jams;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.jam_members;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.jam_queue;
exception
  when duplicate_object then null;
end
$$;

alter table public.jams        replica identity full;
alter table public.jam_members replica identity full;
alter table public.jam_queue   replica identity full;
