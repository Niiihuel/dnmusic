/*
 * Listas colaborativas.
 *
 * Hasta acá una lista tenía exactamente un dueño y todo el esquema lo daba por
 * hecho: las policies son `owner_id = auth.uid()`, `list_my_playlists` filtra
 * por dueño y `add_playlist_track` levanta «Esa lista no existe» si no sos vos.
 * Abrir la edición a más gente es tocar esas tres cosas, no agregar una columna.
 *
 * **Colaborativa es distinto de pública.** Pública es «cualquiera con cuenta la
 * lee» (ver `listas_publicas`); colaborativa es «esta gente en particular la
 * escribe». Son ortogonales y se combinan: una lista puede ser colaborativa y
 * seguir siendo privada para el resto del mundo, que es el caso normal.
 *
 * **Quien colabora puede sacar cualquier canción, no solo las suyas.** Es la
 * regla de Spotify y es la que hace que la lista sea de todos y no de uno con
 * invitados. `added_by` se guarda igual —para mostrar quién trajo qué— pero no
 * es un permiso: es una firma.
 *
 * El dueño mantiene lo que no se comparte: renombrar, cambiar la portada,
 * publicarla, sumar y sacar gente, y borrarla. Un colaborador que se va se saca
 * a sí mismo y la lista le desaparece de la biblioteca sin tocar el contenido.
 */

alter table public.playlists
  add column if not exists colaborativa boolean not null default false;

/*
 * Quiénes escriben esta lista, además del dueño.
 *
 * El dueño **no** tiene fila acá: su permiso sale de `playlists.owner_id`, que
 * no puede quedar desincronizado. Con una fila para él habría dos fuentes para
 * la misma verdad y un borrado a medias dejaría una lista sin nadie que la
 * pueda editar.
 */
create table if not exists public.playlist_colaboradores (
  playlist_id  uuid not null references public.playlists(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  /* Quién lo sumó: el dueño al elegirlo, o la persona misma al entrar por link. */
  agregado_por uuid references auth.users(id) on delete set null,
  agregado_at  timestamptz not null default now(),
  primary key (playlist_id, user_id)
);

create index if not exists playlist_colab_persona_idx
  on public.playlist_colaboradores (user_id, agregado_at desc);

/*
 * Quién agregó cada canción.
 *
 * Nace en null para todo lo que ya está: esas filas las puso el dueño, pero
 * inventarle el dato a millones de filas viejas sería escribir una firma que
 * nadie puso. La pantalla lo resuelve mostrando la firma solo cuando existe.
 */
alter table public.playlist_tracks
  add column if not exists added_by uuid references auth.users(id) on delete set null;

/*
 * Los dos permisos, como funciones.
 *
 * Van `security definer` por una razón concreta y no por comodidad: las policies
 * de `playlists` necesitan mirar `playlist_colaboradores`, y si esa consulta
 * pasara por RLS, la policy de colaboradores volvería a mirar `playlists` y
 * Postgres cortaría con recursión infinita. Al correr como dueña de la función,
 * la lectura de adentro no vuelve a entrar por las policies.
 *
 * `stable` porque dentro de una misma consulta el permiso no cambia — así el
 * planner las llama una vez por fila y no una vez por referencia.
 */
create or replace function public.puede_editar_lista(p_playlist uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.playlists p
    where p.id = p_playlist and p.owner_id = auth.uid()
  ) or exists (
    select 1 from public.playlist_colaboradores c
    where c.playlist_id = p_playlist and c.user_id = auth.uid()
  );
$$;

/**
 * Ver es editar, o que sea pública. Se escribe aparte igual porque no siempre
 * van a coincidir: una lista con lectores invitados sería solo un caso más acá,
 * y tenerlas separadas evita tener que desarmar la de edición ese día.
 */
create or replace function public.puede_ver_lista(p_playlist uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select public.puede_editar_lista(p_playlist) or exists (
    select 1 from public.playlists p
    where p.id = p_playlist and p.visibilidad = 'publica'
  );
$$;

revoke all on function public.puede_editar_lista(uuid) from public;
revoke all on function public.puede_ver_lista(uuid) from public;
grant execute on function public.puede_editar_lista(uuid) to authenticated;
grant execute on function public.puede_ver_lista(uuid) to authenticated;

alter table public.playlist_colaboradores enable row level security;
grant select on public.playlist_colaboradores to authenticated;

/*
 * Sobre la tabla de colaboradores solo hay lectura, y solo de lo tuyo: sumar y
 * sacar gente pasa por las funciones de más abajo, que son las que saben quién
 * tiene derecho a hacerlo. Una policy de insert acá dejaría que cualquiera se
 * agregue a la lista de cualquiera con un solo `insert`.
 */
drop policy if exists "cada quien ve dónde colabora" on public.playlist_colaboradores;
create policy "cada quien ve dónde colabora"
  on public.playlist_colaboradores for select to authenticated
  using (user_id = auth.uid());

/*
 * Las policies se **suman** a las que ya están; Postgres las combina con OR. El
 * dueño conserva todo lo que podía y el colaborador gana lo justo: leer la
 * lista y escribir sus canciones.
 *
 * La de `playlists` es solo `select` a propósito. Un colaborador no renombra ni
 * borra la lista de otro — para eso tendría que ser un `for all`, y ahí un
 * invitado podría borrarle a alguien una lista de doscientos temas.
 */
drop policy if exists "las colaborativas las leen sus colaboradores" on public.playlists;
create policy "las colaborativas las leen sus colaboradores"
  on public.playlists for select to authenticated
  using (colaborativa and public.puede_editar_lista(id));

drop policy if exists "las canciones de una colaborativa se editan" on public.playlist_tracks;
create policy "las canciones de una colaborativa se editan"
  on public.playlist_tracks for all to authenticated
  using (public.puede_editar_lista(playlist_id))
  with check (public.puede_editar_lista(playlist_id));

/**
 * La biblioteca, ahora con las listas donde colaborás.
 *
 * Se recrea entera porque cambia el tipo de retorno —el mismo baile que cuando
 * se sumó `visibilidad`—. Las tres columnas nuevas son las que la fila necesita
 * para decir de qué se trata sin pedir nada más: si es colaborativa, si es tuya
 * (para saber si mostrar «Salir» o «Borrar») y cuánta gente hay.
 *
 * Un `union` y no un `or` en el `where`: la rama del dueño usa el índice por
 * `owner_id` y la del colaborador el de `playlist_colaboradores`. Con un `or`,
 * Postgres se queda sin índice para las dos y escanea la tabla entera.
 */
drop function if exists public.list_my_playlists();
create function public.list_my_playlists()
returns table (
  id           uuid,
  name         text,
  tracks       bigint,
  updated_at   timestamptz,
  covers       text[],
  cover_path   text,
  total_ms     bigint,
  visibilidad  text,
  colaborativa boolean,
  mia          boolean,
  colaboradores bigint
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  with mias as (
    select p.id from public.playlists p where p.owner_id = auth.uid()
    union
    select c.playlist_id from public.playlist_colaboradores c where c.user_id = auth.uid()
  )
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
    p.colaborativa,
    p.owner_id = auth.uid(),
    (select count(*) from public.playlist_colaboradores c where c.playlist_id = p.id)
  from public.playlists p
  join mias on mias.id = p.id
  order by p.updated_at desc;
$$;

revoke all on function public.list_my_playlists() from public;
grant execute on function public.list_my_playlists() to authenticated;

/**
 * Agregar una canción, ahora también si colaborás — y firmando quién fue.
 *
 * Se recrea con la misma firma que dejó `track_artist`: el cliente no cambia.
 * Lo único distinto adentro es de quién acepta la canción y que guarda
 * `added_by`.
 */
create or replace function public.add_playlist_track(
  p_playlist_id  uuid,
  p_video_id     text,
  p_title        text,
  p_artist       text,
  p_artist_id    text,
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
  if not public.puede_editar_lista(p_playlist_id) then
    raise exception 'Esa lista no existe';
  end if;

  select coalesce(max(position), 0) + 10 into next_pos
  from public.playlist_tracks where playlist_id = p_playlist_id;

  insert into public.playlist_tracks (
    playlist_id, position, video_id, title, artist, artist_id,
    artwork_url, artwork_path, audio_path, duration_ms, true_peak, added_by
  )
  values (
    p_playlist_id, next_pos, p_video_id, p_title, coalesce(p_artist, ''), p_artist_id,
    coalesce(p_artwork_url, ''), p_artwork_path, p_audio_path,
    coalesce(p_duration_ms, 0), p_true_peak, auth.uid()
  )
  on conflict (playlist_id, video_id) do nothing
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.add_playlist_track(uuid, text, text, text, text, text, text, text, integer, real) from public;
grant execute on function public.add_playlist_track(uuid, text, text, text, text, text, text, text, integer, real) to authenticated;

/**
 * Entrar por el link.
 *
 * Solo funciona sobre listas marcadas como colaborativas: un link de lista
 * común no suma a nadie. Es idempotente —volver a abrir el link no hace nada—
 * y devuelve el nombre para poder decir a qué entraste sin un segundo viaje.
 *
 * No hay aprobación del dueño: tener el link **es** la invitación, igual que en
 * el Jam. Si el link se fue de las manos, el dueño saca a quien sobre.
 */
create or replace function public.join_playlist(p_playlist uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nombre text;
  v_owner  uuid;
begin
  select p.name, p.owner_id into v_nombre, v_owner
  from public.playlists p
  where p.id = p_playlist and p.colaborativa;

  if v_nombre is null then
    raise exception 'Esa lista no acepta colaboradores';
  end if;

  if v_owner = auth.uid() then
    return v_nombre;
  end if;

  insert into public.playlist_colaboradores (playlist_id, user_id, agregado_por)
  values (p_playlist, auth.uid(), auth.uid())
  on conflict (playlist_id, user_id) do nothing;

  return v_nombre;
end;
$$;

/**
 * Sumar a alguien desde la lista de contactos. Solo el dueño.
 *
 * Que el dueño sea el único que suma gente a mano es lo que hace que el link
 * siga siendo la vía «abierta» y esta la controlada: si cualquier colaborador
 * pudiera sumar, la diferencia entre las dos se borra.
 */
create or replace function public.add_playlist_collaborator(p_playlist uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.playlists p
    where p.id = p_playlist and p.owner_id = auth.uid() and p.colaborativa
  ) then
    raise exception 'Esa lista no es tuya o no es colaborativa';
  end if;

  if p_user = auth.uid() then
    return;
  end if;

  insert into public.playlist_colaboradores (playlist_id, user_id, agregado_por)
  values (p_playlist, p_user, auth.uid())
  on conflict (playlist_id, user_id) do nothing;
end;
$$;

/**
 * Sacar a alguien, o irse.
 *
 * Una sola función para las dos cosas porque es la misma fila la que se borra:
 * el dueño saca a cualquiera, y cualquiera se saca a sí mismo. Lo que no se
 * puede es sacar a un tercero sin ser el dueño.
 */
create or replace function public.remove_playlist_collaborator(p_playlist uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user <> auth.uid() and not exists (
    select 1 from public.playlists p
    where p.id = p_playlist and p.owner_id = auth.uid()
  ) then
    raise exception 'No podés sacar a esa persona';
  end if;

  delete from public.playlist_colaboradores
  where playlist_id = p_playlist and user_id = p_user;
end;
$$;

/**
 * Quiénes colaboran, con el dueño primero.
 *
 * El dueño se agrega en la consulta y no en la tabla —ver el comentario de
 * `playlist_colaboradores`—, así la pantalla recibe la gente completa en una
 * sola fila por persona y no tiene que pegar dos consultas.
 */
create or replace function public.list_playlist_collaborators(p_playlist uuid)
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_path  text,
  es_dueño     boolean
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  /* El `order by` va afuera del `union`: adentro, Postgres solo deja ordenar
     por los nombres de salida de la primera rama, y ahí `true` no tiene
     ninguno. Envuelto, se ordena por columnas de verdad. */
  select * from (
    select prof.user_id, prof.username, prof.display_name, prof.avatar_path, true as es_dueño
    from public.playlists p
    join public.profiles prof on prof.user_id = p.owner_id
    where p.id = p_playlist and public.puede_ver_lista(p_playlist)
    union all
    select prof.user_id, prof.username, prof.display_name, prof.avatar_path, false
    from public.playlist_colaboradores c
    join public.profiles prof on prof.user_id = c.user_id
    where c.playlist_id = p_playlist and public.puede_ver_lista(p_playlist)
  ) gente
  order by gente.es_dueño desc, gente.username;
$$;

revoke all on function public.join_playlist(uuid) from public;
revoke all on function public.add_playlist_collaborator(uuid, uuid) from public;
revoke all on function public.remove_playlist_collaborator(uuid, uuid) from public;
revoke all on function public.list_playlist_collaborators(uuid) from public;
grant execute on function public.join_playlist(uuid) to authenticated;
grant execute on function public.add_playlist_collaborator(uuid, uuid) to authenticated;
grant execute on function public.remove_playlist_collaborator(uuid, uuid) to authenticated;
grant execute on function public.list_playlist_collaborators(uuid) to authenticated;

/**
 * La lista por link, ahora contestando también a los colaboradores.
 *
 * Antes solo abría lo público o lo tuyo; una lista colaborativa privada le
 * decía «no existe» a la gente que justamente la escribe. Se suma
 * `puede_ver_lista`, y viajan dos datos que la pantalla necesita para saber qué
 * dibujar: si es colaborativa y si quien mira puede editarla.
 */
drop function if exists public.get_public_playlist(uuid);
create function public.get_public_playlist(p_id uuid)
returns table (
  id           uuid,
  name         text,
  tracks       bigint,
  updated_at   timestamptz,
  covers       text[],
  cover_path   text,
  total_ms     bigint,
  visibilidad  text,
  owner_id     uuid,
  username     text,
  display_name text,
  avatar_path  text,
  mia          boolean,
  colaborativa boolean,
  puedo_editar boolean
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
    p.owner_id = auth.uid(),
    p.colaborativa,
    public.puede_editar_lista(p.id)
  from public.playlists p
  join public.profiles prof on prof.user_id = p.owner_id
  where p.id = p_id
    and (p.visibilidad = 'publica' or public.puede_ver_lista(p.id));
$$;

revoke all on function public.get_public_playlist(uuid) from public;
grant execute on function public.get_public_playlist(uuid) to authenticated;

/*
 * Lo que a propósito NO cambia acá:
 *
 * `list_liked_songs` y las funciones de recomendación siguen mirando solo tus
 * listas propias. Lo que sumó otra persona a una colaborativa está en tu
 * biblioteca, pero no lo elegiste vos, y dejarlo entrar a las recomendaciones
 * te devolvería un perfil de gustos que no es el tuyo.
 */
