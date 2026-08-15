-- ═══════════════════════════════════════════════════════════════════════════
-- La escucha: dónde está sonando la música de una cuenta.
--
-- Una cuenta abierta en varios dispositivos es, para la música, **una sola
-- escucha**: lo que suena en la computadora es lo que el teléfono tiene que
-- mostrar, y darle play en el teléfono es una decisión sobre esa escucha —no
-- una segunda cola paralela—. Es el mismo problema que el Jam pero puertas
-- adentro de la cuenta, y se resuelve con la misma maquinaria: **Postgres es
-- la autoridad**, los clientes piden por RPC dentro de un advisory lock, la
-- `revision` descarta lo viejo, y la posición se guarda como intención
--
--     posicion_ms + (now() - arrancado_en)      -- cuando suena
--
-- así ningún dispositivo escribe la posición periódicamente: solo los eventos
-- (play, pausa, salto, cambio de tema) tocan la fila.
--
-- La diferencia con el Jam es de forma, no de fondo. Acá no hay miembros ni
-- permisos ni código: hay **un dueño** —el dispositivo que reproduce— y
-- espejos que miran. La fila es una por usuario y vive para siempre: aunque
-- todos los aparatos se apaguen, el próximo que abra la app encuentra qué
-- estaba sonando y en qué segundo, que es exactamente lo que un reproductor
-- promete al volver.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tablas ─────────────────────────────────────────────────────────────────

create table if not exists public.escuchas (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  -- Quién es el dueño: un id opaco que cada instalación se inventa una vez.
  -- No es un id de sesión de auth a propósito: la misma cuenta en el mismo
  -- navegador tiene que seguir siendo «la computadora» aunque re-loguee.
  device_id     text not null,
  device_nombre text not null default '',
  -- La canción a la vista, entera y desnormalizada (la forma PlaylistTrack
  -- del cliente, en camelCase). Es lo único que un espejo necesita para
  -- dibujar la barra sin pedir nada más; null significa «nada sonando».
  track         jsonb,
  suena         boolean not null default false,
  posicion_ms   integer not null default 0,
  arrancado_en  timestamptz,
  -- Reloj lógico: sube en cada publicación. Los clientes descartan lo viejo,
  -- y además es la llave del traspaso — ver escucha_publicar.
  revision      bigint not null default 0,
  updated_at    timestamptz not null default now()
);

-- La cola completa, aparte y sin realtime. Es el estado de reproducción del
-- cliente tal cual (tracks, index, upNext, manual, origin): un espejo la pide
-- solo cuando la necesita —al entrar, o al tomar la escucha— y publicarla no
-- inunda el canal con cientos de canciones en cada evento. Es la misma
-- partición que jams/jam_queue, llevada al extremo: la fila liviana viaja por
-- el canal, la pesada se pide.
create table if not exists public.escucha_colas (
  user_id    uuid primary key references public.escuchas(user_id) on delete cascade,
  cola       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── Row Level Security ─────────────────────────────────────────────────────

alter table public.escuchas      enable row level security;
alter table public.escucha_colas enable row level security;

-- Solo lectura y solo lo propio. **No hay policy de escritura a propósito**:
-- el único camino es la función de abajo, que corre como dueño — el mismo
-- criterio que el Jam: «validar en el servidor» no es una promesa, es que no
-- existe otro camino.
drop policy if exists "own escucha" on public.escuchas;
create policy "own escucha" on public.escuchas
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "own escucha cola" on public.escucha_colas;
create policy "own escucha cola" on public.escucha_colas
  for select to authenticated
  using (user_id = auth.uid());

grant usage on schema public to authenticated;
grant select on public.escuchas      to authenticated;
grant select on public.escucha_colas to authenticated;

-- ── Publicar: la única escritura ───────────────────────────────────────────

-- El dispositivo que reproduce publica su verdad: qué suena, si suena, en qué
-- segundo, y —cuando cambió— la cola entera. La misma llamada sirve para
-- reclamar la escucha desde otro aparato: el **traspaso**.
--
-- La guardia es la `revision`. Si la fila es de otro dispositivo, el pedido
-- solo pasa si viene con la revisión al día: quien quiere tomar la escucha
-- tiene que haber visto su estado actual (lo tiene: los espejos viven
-- suscriptos). Un dueño destronado que publica tarde —su evento de takeover
-- todavía en viaje— trae una revisión vieja y rebota, en vez de pisarle la
-- música al que acaba de tomarla. El dueño vigente no pelea contra esto: con
-- su propio device_id la revisión no se mira.
--
-- `p_track` en null es «acá no suena nada»: la cola se cierra para todos los
-- aparatos. No se borra la fila — un DELETE por realtime no es filtrable ni
-- pasa por RLS, así que el vaciado viaja como un UPDATE más.
create or replace function public.escucha_publicar(
  p_device_id text,
  p_device_nombre text,
  p_revision bigint,
  p_track jsonb,
  p_suena boolean,
  p_posicion_ms integer,
  p_cola jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  v public.escuchas;
  v_revision bigint;
begin
  if me is null then
    raise exception 'Sesión requerida';
  end if;
  if coalesce(btrim(p_device_id), '') = '' then
    raise exception 'Falta el dispositivo';
  end if;
  if p_track is not null and (
    coalesce(p_track ->> 'audioPath', '') = ''
    or coalesce(p_track ->> 'videoId', '') = ''
  ) then
    raise exception 'Esa canción no se puede publicar';
  end if;
  if p_cola is not null then
    if jsonb_typeof(p_cola) <> 'object'
       or jsonb_typeof(p_cola -> 'tracks') <> 'array' then
      raise exception 'La cola llegó en un formato que no se entiende';
    end if;
    if jsonb_array_length(p_cola -> 'tracks') > 1000
       or pg_column_size(p_cola) > 4 * 1024 * 1024 then
      raise exception 'La cola es demasiado grande';
    end if;
  end if;

  -- Un lock por usuario: dos dispositivos publicando a la vez se aplican de a
  -- uno, igual que las mutaciones de un Jam.
  perform pg_advisory_xact_lock(hashtextextended('escucha:' || me::text, 0));

  select * into v from public.escuchas where user_id = me;
  if v.user_id is not null
     and v.device_id <> p_device_id
     and coalesce(p_revision, 0) < v.revision then
    raise exception 'La música quedó en otro dispositivo';
  end if;

  insert into public.escuchas as e
    (user_id, device_id, device_nombre, track, suena, posicion_ms, arrancado_en, revision)
  values (
    me, p_device_id, coalesce(p_device_nombre, ''), p_track,
    p_suena and p_track is not null,
    greatest(0, coalesce(p_posicion_ms, 0)),
    case when p_suena and p_track is not null then now() end,
    1
  )
  on conflict (user_id) do update set
    device_id     = excluded.device_id,
    device_nombre = excluded.device_nombre,
    track         = excluded.track,
    suena         = excluded.suena,
    posicion_ms   = excluded.posicion_ms,
    arrancado_en  = excluded.arrancado_en,
    revision      = e.revision + 1,
    updated_at    = now()
  returning revision into v_revision;

  if p_track is null then
    -- Sin canción no hay cola que retomar: se limpia para que el próximo
    -- arranque no reviva una fila que ya se cerró.
    delete from public.escucha_colas where user_id = me;
  elsif p_cola is not null then
    insert into public.escucha_colas (user_id, cola, updated_at)
    values (me, p_cola, now())
    on conflict (user_id) do update set cola = excluded.cola, updated_at = now();
  end if;

  return v_revision;
end;
$$;

-- ── El estado entero, para el arranque y el traspaso ───────────────────────

-- Todo lo que un dispositivo necesita para reconstruirse: la fila, la cola y
-- la hora del servidor —con esa última se mide el desfasaje de reloj, igual
-- que en jam_estado—. Devuelve null si la cuenta nunca publicó nada.
create or replace function public.escucha_estado()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select case when auth.uid() is null then null else (
    select jsonb_build_object(
      'escucha', to_jsonb(e),
      'cola', (select c.cola from public.escucha_colas c where c.user_id = e.user_id),
      'ahora', (extract(epoch from now()) * 1000)::bigint
    )
    from public.escuchas e
    where e.user_id = auth.uid()
  ) end;
$$;

-- ── Privilegios ────────────────────────────────────────────────────────────

revoke all on function public.escucha_publicar(text, text, bigint, jsonb, boolean, integer, jsonb) from public;
revoke all on function public.escucha_estado() from public;

grant execute on function public.escucha_publicar(text, text, bigint, jsonb, boolean, integer, jsonb) to authenticated;
grant execute on function public.escucha_estado() to authenticated;

-- ── Realtime ───────────────────────────────────────────────────────────────

-- Solo la fila liviana: cada UPDATE trae la fila entera (REPLICA IDENTITY
-- FULL) y los espejos la aplican directo del evento. La cola grande queda
-- afuera del canal a propósito — se pide por RPC cuando hace falta.
do $$
begin
  alter publication supabase_realtime add table public.escuchas;
exception
  when duplicate_object then null;
end
$$;

alter table public.escuchas replica identity full;
