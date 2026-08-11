-- ═══════════════════════════════════════════════════════════════════════════
-- Listas de reproducción.
--
-- Las canciones se guardan **desnormalizadas**, igual que el fragmento dentro
-- de un mensaje: título, artista, carátula y ruta del audio viajan con la fila.
-- No es redundancia por descuido — es lo que hace que una lista siga sonando
-- dentro de dos años aunque YouTube cambie el id, borre el video o rompa la
-- resolución. El `video_id` queda solo por si alguna vez hay que re-resolver.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.playlists (
  id         uuid primary key default gen_random_uuid(),
  /*
   * El dueño lo pone la base, no el cliente.
   *
   * Con `default auth.uid()` un insert que no lo mande igual queda bien
   * atribuido — y sin esto la policy lo rechaza, porque `with check` compara
   * contra una columna que nadie llenó.
   */
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists playlists_owner_idx on public.playlists (owner_id, updated_at desc);

create table if not exists public.playlist_tracks (
  id           uuid primary key default gen_random_uuid(),
  playlist_id  uuid not null references public.playlists(id) on delete cascade,
  /*
   * Orden dentro de la lista.
   *
   * Un entero y no un contador contiguo: reordenar moviendo una sola fila es
   * mucho más simple que renumerar todas. Se deja hueco entre posiciones.
   */
  position     integer not null,
  video_id     text not null,
  title        text not null,
  artist       text not null default '',
  artwork_url  text not null default '',
  artwork_path text,
  /** Ruta del audio en el bucket `songs`; se firma al reproducir. */
  audio_path   text not null,
  duration_ms  integer not null default 0,
  /** Pico real, para no distorsionar al reproducir. Ver `headroomGain`. */
  true_peak    real,
  added_at     timestamptz not null default now(),

  -- La misma canción dos veces en la misma lista es casi siempre un error de
  -- doble toque, no una intención.
  unique (playlist_id, video_id)
);

create index if not exists playlist_tracks_order_idx
  on public.playlist_tracks (playlist_id, position);

alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;

/*
 * Las policies filtran, pero el rol necesita además el permiso de tabla: sin
 * esto Postgres corta antes de evaluar la policy con "permission denied".
 * `anon` no recibe nada — sin sesión no hay listas que ver.
 */
grant select, insert, update, delete on public.playlists to authenticated;
grant select, insert, update, delete on public.playlist_tracks to authenticated;

/*
 * Cada quien ve y edita solo sus listas.
 *
 * Se arranca privado a propósito: abrirlas después a la otra persona es cambiar
 * una policy, mientras que cerrarlas una vez que ya se compartieron es un
 * problema. Ver la nota al pie.
 */
create policy "las listas son de su dueño"
  on public.playlists for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

/*
 * Las canciones heredan el permiso de su lista. La subconsulta va contra
 * `playlists`, que ya está filtrada por dueño, así que no hace falta repetir
 * la condición.
 */
create policy "las canciones siguen a su lista"
  on public.playlist_tracks for all to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.owner_id = auth.uid()
    )
  );

/*
 * `updated_at` se toca sola cuando cambia el contenido.
 *
 * Es lo que ordena la lista de listas: la que tocaste último va primero. Si
 * dependiera del cliente, agregar una canción desde otro lado no la movería.
 */
create or replace function public.touch_playlist()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.playlists
  set updated_at = now()
  where id = coalesce(new.playlist_id, old.playlist_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists playlist_tracks_touch on public.playlist_tracks;
create trigger playlist_tracks_touch
  after insert or update or delete on public.playlist_tracks
  for each row execute function public.touch_playlist();

/**
 * Las listas con su cantidad de canciones, para la pantalla de listado.
 *
 * Con una vista se evita que el cliente pida las canciones de cada lista solo
 * para contarlas.
 */
create or replace function public.list_my_playlists()
returns table (
  id         uuid,
  name       text,
  tracks     bigint,
  updated_at timestamptz,
  /** Carátulas de las primeras canciones, para el mosaico de la portada. */
  covers     text[]
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.name,
    (select count(*) from public.playlist_tracks t where t.playlist_id = p.id),
    p.updated_at,
    (
      select array_agg(c order by c_pos)
      from (
        select coalesce(t.artwork_path, t.artwork_url) as c, t.position as c_pos
        from public.playlist_tracks t
        where t.playlist_id = p.id
        order by t.position
        limit 4
      ) first_four
    )
  from public.playlists p
  where p.owner_id = auth.uid()
  order by p.updated_at desc;
$$;

/**
 * Agrega una canción al final de una lista.
 *
 * La posición la calcula la base y no el cliente: dos pestañas agregando a la
 * vez calcularían el mismo número y la lista quedaría con el orden roto.
 */
create or replace function public.add_playlist_track(
  p_playlist_id  uuid,
  p_video_id     text,
  p_title        text,
  p_artist       text,
  p_artwork_url  text,
  p_artwork_path text,
  p_audio_path   text,
  p_duration_ms  integer,
  p_true_peak    real
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_pos integer;
  new_id   uuid;
begin
  if not exists (
    select 1 from public.playlists where id = p_playlist_id and owner_id = auth.uid()
  ) then
    raise exception 'Esa lista no existe';
  end if;

  select coalesce(max(position), 0) + 10 into next_pos
  from public.playlist_tracks where playlist_id = p_playlist_id;

  insert into public.playlist_tracks (
    playlist_id, position, video_id, title, artist,
    artwork_url, artwork_path, audio_path, duration_ms, true_peak
  )
  values (
    p_playlist_id, next_pos, p_video_id, p_title, coalesce(p_artist, ''),
    coalesce(p_artwork_url, ''), p_artwork_path, p_audio_path,
    coalesce(p_duration_ms, 0), p_true_peak
  )
  on conflict (playlist_id, video_id) do nothing
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.list_my_playlists() from public;
revoke all on function public.add_playlist_track(uuid, text, text, text, text, text, text, integer, real) from public;
grant execute on function public.list_my_playlists() to authenticated;
grant execute on function public.add_playlist_track(uuid, text, text, text, text, text, text, integer, real) to authenticated;

-- Nota: si más adelante las listas tienen que verse entre las dos cuentas del
-- par, alcanza con sumar a las policies un `or public.is_pair_member(...)`
-- resuelto contra `pair_members`. No hace falta tocar el esquema.
