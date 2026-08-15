/*
 * Listas públicas.
 *
 * Hasta acá una lista era estrictamente privada: la policy de `playlists` es
 * `for all using (owner_id = auth.uid())`, así que nadie más podía leerla ni
 * enterarse de que existía. La vitrina de perfil que fija una lista guardaba
 * solo el id y la resolvía **contra la biblioteca de quien mira**, con lo cual
 * en el perfil de otro siempre decía «esta lista ya no existe». Esto arregla
 * eso de raíz y de paso abre lo que faltaba: mostrar, compartir y guardarse la
 * de otro.
 *
 * **Privada sigue siendo el default.** Nada se vuelve visible por actualizar:
 * la columna nace en 'privada' para todas las filas que ya existen, y hacerla
 * pública es un acto explícito. Abrir por omisión lo que la gente guardó
 * cuando era privado sería publicar cosas de otros sin preguntarles.
 *
 * **Pública quiere decir «cualquiera con una cuenta»,** no «cualquiera en
 * Internet»: `anon` no recibe ningún permiso acá. El link de una lista abre la
 * app y, sin sesión, pasa primero por entrar — el mismo camino que ya hace el
 * link de un Jam.
 */

alter table public.playlists
  add column if not exists visibilidad text not null default 'privada'
    check (visibilidad in ('privada', 'publica'));

/* El perfil pide «las públicas de esta persona», y es la única consulta que no
   pasa por el dueño. Sin índice es un scan de la tabla entera por visita. */
create index if not exists playlists_publicas_idx
  on public.playlists (owner_id, updated_at desc)
  where visibilidad = 'publica';

/*
 * Las policies se **suman** a la que ya está, no la reemplazan: Postgres las
 * combina con OR, así que el dueño sigue pudiendo todo sobre las suyas y el
 * resto gana solo lectura, y solo sobre las públicas.
 *
 * Hay una de `playlist_tracks` porque las canciones no se heredan: su policy
 * pregunta por el dueño de la lista padre, y sin esta un visitante veía el
 * nombre y la portada de una lista con cero canciones adentro.
 */
drop policy if exists "las públicas se leen con cuenta" on public.playlists;
create policy "las públicas se leen con cuenta"
  on public.playlists for select to authenticated
  using (visibilidad = 'publica');

drop policy if exists "las canciones de una pública se leen" on public.playlist_tracks;
create policy "las canciones de una pública se leen"
  on public.playlist_tracks for select to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.visibilidad = 'publica'
    )
  );

/**
 * La biblioteca propia, ahora diciendo cuáles están publicadas.
 *
 * Se recrea entera porque cambia el tipo de retorno y Postgres no deja
 * agregarle columnas a una función con `create or replace` — el mismo baile que
 * cuando se sumaron la portada y la duración.
 *
 * La necesita la biblioteca para dos cosas chicas y visibles: la marca en la
 * fila y que el menú diga «Hacer privada» en vez de «Hacer pública» cuando ya
 * lo está. Sin esto habría que pedir la lista entera solo para saberlo.
 */
drop function if exists public.list_my_playlists();
create function public.list_my_playlists()
returns table (
  id         uuid,
  name       text,
  tracks     bigint,
  updated_at timestamptz,
  covers     text[],
  cover_path text,
  total_ms   bigint,
  visibilidad text
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
    ),
    p.cover_path,
    (select coalesce(sum(t.duration_ms), 0) from public.playlist_tracks t where t.playlist_id = p.id),
    p.visibilidad
  from public.playlists p
  where p.owner_id = auth.uid()
  order by p.updated_at desc;
$$;

revoke all on function public.list_my_playlists() from public;
grant execute on function public.list_my_playlists() to authenticated;

/**
 * Las listas públicas de una persona, con lo mismo que muestra la biblioteca.
 *
 * Devuelve la forma exacta de `list_my_playlists` —conteo, mosaico de
 * carátulas, portada propia, duración— para que la pantalla dibuje las de otro
 * con el mismo componente que las tuyas. Que se vean igual no es cosmética: es
 * lo que hace que «guardarla» se sienta como llevártela tal cual.
 *
 * `visibilidad` viaja también, aunque acá siempre sea 'publica': el mismo tipo
 * de fila lo usa la biblioteca propia, donde sí varía.
 */
create or replace function public.list_public_playlists(p_owner uuid)
returns table (
  id         uuid,
  name       text,
  tracks     bigint,
  updated_at timestamptz,
  covers     text[],
  cover_path text,
  total_ms   bigint,
  visibilidad text
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
    ),
    p.cover_path,
    (select coalesce(sum(t.duration_ms), 0) from public.playlist_tracks t where t.playlist_id = p.id),
    p.visibilidad
  from public.playlists p
  where p.owner_id = p_owner and p.visibilidad = 'publica'
  order by p.updated_at desc;
$$;

/**
 * Una lista pública sola, con quién es su dueño.
 *
 * El dueño viaja con la lista y no en un segundo viaje porque la pantalla lo
 * necesita para el encabezado —«de @juansi», con su foto— y pedirlo aparte
 * dibujaría la lista primero y el autor medio segundo después.
 *
 * Devuelve cero filas si no existe o si no es pública. Que las dos cosas se
 * vean igual es a propósito: no hay forma de averiguar por prueba y error si
 * un id existe.
 */
create or replace function public.get_public_playlist(p_id uuid)
returns table (
  id          uuid,
  name        text,
  tracks      bigint,
  updated_at  timestamptz,
  covers      text[],
  cover_path  text,
  total_ms    bigint,
  visibilidad text,
  owner_id    uuid,
  username    text,
  display_name text,
  avatar_path text,
  mia         boolean
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
    ),
    p.cover_path,
    (select coalesce(sum(t.duration_ms), 0) from public.playlist_tracks t where t.playlist_id = p.id),
    p.visibilidad,
    p.owner_id,
    prof.username,
    prof.display_name,
    prof.avatar_path,
    p.owner_id = auth.uid()
  from public.playlists p
  join public.profiles prof on prof.user_id = p.owner_id
  where p.id = p_id
    and (p.visibilidad = 'publica' or p.owner_id = auth.uid());
$$;

/**
 * Guardarse la lista de otro: una copia, no un seguimiento.
 *
 * Copia **el contenido de este momento** a una lista nueva tuya. Desde ahí son
 * dos listas distintas: podés renombrarla y sacarle temas, y si la otra persona
 * suma o borra, la tuya no se mueve. La alternativa —seguirla, atada a la
 * original— hace que tu biblioteca cambie sola y que una lista tuya pueda
 * desaparecer porque alguien la hizo privada.
 *
 * `security definer` porque tiene que leer una lista que no es tuya; el `where`
 * de adentro es el que decide qué se puede copiar —pública, o tuya— y por eso
 * el chequeo va en la consulta y no en un `if` aparte: no hay camino que
 * escriba sin haber pasado por él.
 *
 * La copia nace **privada**, siempre. Guardarte la lista de alguien no publica
 * nada en tu perfil sin que lo pidas.
 */
create or replace function public.copy_playlist(p_source uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nombre text;
  v_nueva  uuid;
begin
  select p.name into v_nombre
  from public.playlists p
  where p.id = p_source
    and (p.visibilidad = 'publica' or p.owner_id = auth.uid());

  if v_nombre is null then
    raise exception 'Esa lista no está disponible';
  end if;

  insert into public.playlists (owner_id, name, visibilidad)
  values (auth.uid(), v_nombre, 'privada')
  returning id into v_nueva;

  /* El orden se conserva tal cual: una lista es su orden, y renumerar desde
     cero acá daría lo mismo solo mientras las posiciones no tengan huecos. */
  insert into public.playlist_tracks (
    playlist_id, video_id, title, artist, artist_id,
    artwork_url, artwork_path, audio_path, duration_ms, true_peak, position
  )
  select
    v_nueva, t.video_id, t.title, t.artist, t.artist_id,
    t.artwork_url, t.artwork_path, t.audio_path, t.duration_ms, t.true_peak,
    row_number() over (order by t.position)
  from public.playlist_tracks t
  where t.playlist_id = p_source;

  return v_nueva;
end;
$$;

revoke all on function public.list_public_playlists(uuid) from public;
revoke all on function public.get_public_playlist(uuid) from public;
revoke all on function public.copy_playlist(uuid) from public;
grant execute on function public.list_public_playlists(uuid) to authenticated;
grant execute on function public.get_public_playlist(uuid) to authenticated;
grant execute on function public.copy_playlist(uuid) to authenticated;
