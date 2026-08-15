-- ═══════════════════════════════════════════════════════════════════════════
-- Poner una PLAYLIST dentro de un Jam.
--
-- `jam_tocar_ahora` intercala UNA canción, y eso está bien para un resultado
-- de búsqueda — pero tocar una fila de una playlist con un Jam andando dejaba
-- la fila de reproducción con esa canción sola y un «No viene nada después»:
-- la playlist no seguía. Poner una lista significa que la lista SUENA: desde
-- la canción elegida, en su orden, para todos.
--
-- El bloque entero se intercala **entre la que suena y lo que venía después**,
-- con las posiciones fraccionarias repartidas parejo en ese hueco: es la misma
-- idea de (a+b)/2 de jam_tocar_ahora, generalizada a N filas sin renumerar
-- nada. Lo que otros habían encolado no se borra — sigue viniendo, después de
-- la lista. Borrarlo sería pisarle la fila a los demás; empujarlo es lo mismo
-- que hace una intercalada de una sola canción, a mayor escala.
--
-- El permiso es «saltar», como jam_tocar_ahora: cambiar lo que suena es
-- cambiar lo que suena, venga de a una o de a cuarenta.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.jam_tocar_cola(p_jam_id uuid, p_canciones jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  v public.jams := public.jam_abrir(p_jam_id);
  cuantas integer := jsonb_array_length(p_canciones);
  existentes integer;
  pos_actual numeric;
  pos_siguiente numeric;
  paso numeric;
  i integer := 0;
  c jsonb;
  v_nuevo uuid;
  v_primero uuid := null;
begin
  perform public.jam_autorizado(v, me, 'saltar');
  if cuantas is null or cuantas < 1 then
    raise exception 'No hay canciones para poner';
  end if;
  select count(*) into existentes from public.jam_queue where jam_id = p_jam_id;
  if existentes + cuantas > 500 then
    raise exception 'La cola del Jam está llena';
  end if;

  select posicion into pos_actual
  from public.jam_queue where id = v.item_actual;

  if pos_actual is null then
    -- Cola vacía o sin actual: el bloque va al final, que también es «ahora».
    select coalesce(max(posicion), 0) into pos_actual
    from public.jam_queue where jam_id = p_jam_id;
    pos_siguiente := null;
  else
    select min(posicion) into pos_siguiente
    from public.jam_queue
    where jam_id = p_jam_id and posicion > pos_actual;
  end if;

  -- El paso entre filas: parejo dentro del hueco si hay siguiente, de a uno
  -- si el bloque va al final. numeric aguanta la división sin renumerar nada.
  paso := case when pos_siguiente is null then 1
               else (pos_siguiente - pos_actual) / (cuantas + 1) end;

  for c in select * from jsonb_array_elements(p_canciones) loop
    i := i + 1;
    -- Una fila inválida no voltea la lista entera: se saltea. El hueco de
    -- posición que deja es inofensivo — las posiciones no son índices.
    if coalesce(c ->> 'audioPath', '') = '' or coalesce(c ->> 'videoId', '') = '' then
      continue;
    end if;
    insert into public.jam_queue
      (jam_id, posicion, added_by, video_id, title, artist, artist_id,
       artwork_url, artwork_path, audio_path, duration_ms, true_peak)
    values
      (p_jam_id, pos_actual + paso * i, me,
       c ->> 'videoId', coalesce(c ->> 'title', ''),
       coalesce(c ->> 'artist', ''), c ->> 'artistId',
       coalesce(c ->> 'artworkUrl', ''), c ->> 'artworkPath',
       c ->> 'audioPath',
       coalesce((c ->> 'durationMs')::integer, 0),
       (c ->> 'truePeak')::double precision)
    returning id into v_nuevo;
    if v_primero is null then
      v_primero := v_nuevo;
    end if;
  end loop;

  if v_primero is null then
    raise exception 'Esas canciones no se pueden poner';
  end if;

  -- El salto es el de jam_tocar_ahora: arranca un pelo en el futuro para que
  -- todos los dispositivos carguen y entren en el mismo instante.
  update public.jams
  set item_actual = v_primero,
      posicion_ms = 0,
      suena = true,
      arrancado_en = now() + interval '600 milliseconds',
      revision = revision + 1,
      expires_at = now() + interval '6 hours'
  where id = p_jam_id;
end;
$$;

revoke all on function public.jam_tocar_cola(uuid, jsonb) from public;
grant execute on function public.jam_tocar_cola(uuid, jsonb) to authenticated;
