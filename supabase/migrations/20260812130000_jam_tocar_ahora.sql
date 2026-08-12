-- ═══════════════════════════════════════════════════════════════════════════
-- Tocar una canción YA, dentro de un Jam.
--
-- Es lo que pasa cuando alguien toca una canción en una lista o en la
-- búsqueda con un Jam andando: en Spotify eso **cambia lo que suena para
-- todos**, no pregunta ni encola. Encolar queda como la opción explícita del
-- menú («Agregar a la cola»), que ya existe como jam_agregar.
--
-- La canción se inserta **entre la que suena y la que venía después** — la
-- posición numeric fraccionaria existe exactamente para esto: (a+b)/2 toca
-- una fila y no renumera nada—. Así, cuando termine, la cola sigue por donde
-- iba a seguir; la intercalada no borra el futuro de nadie.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.jam_tocar_ahora(p_jam_id uuid, p_cancion jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  v public.jams := public.jam_abrir(p_jam_id);
  pos_actual numeric;
  pos_siguiente numeric;
  v_nuevo uuid;
begin
  -- Cambiar lo que suena es «saltar», el mismo permiso que siguiente/anterior.
  perform public.jam_autorizado(v, me, 'saltar');
  if coalesce(p_cancion ->> 'audioPath', '') = ''
     or coalesce(p_cancion ->> 'videoId', '') = '' then
    raise exception 'Esa canción no se puede agregar';
  end if;
  if (select count(*) from public.jam_queue where jam_id = p_jam_id) >= 500 then
    raise exception 'La cola del Jam está llena';
  end if;

  select posicion into pos_actual
  from public.jam_queue where id = v.item_actual;

  if pos_actual is null then
    -- Cola vacía o sin actual: va al final, que también es «lo que sigue».
    select coalesce(max(posicion), 0) + 1 into pos_actual
    from public.jam_queue where jam_id = p_jam_id;
    insert into public.jam_queue
      (jam_id, posicion, added_by, video_id, title, artist, artist_id,
       artwork_url, artwork_path, audio_path, duration_ms, true_peak)
    select p_jam_id, pos_actual, me,
      p_cancion ->> 'videoId', coalesce(p_cancion ->> 'title', ''),
      coalesce(p_cancion ->> 'artist', ''), p_cancion ->> 'artistId',
      coalesce(p_cancion ->> 'artworkUrl', ''), p_cancion ->> 'artworkPath',
      p_cancion ->> 'audioPath',
      coalesce((p_cancion ->> 'durationMs')::integer, 0),
      (p_cancion ->> 'truePeak')::double precision
    returning id into v_nuevo;
  else
    select min(posicion) into pos_siguiente
    from public.jam_queue
    where jam_id = p_jam_id and posicion > pos_actual;

    insert into public.jam_queue
      (jam_id, posicion, added_by, video_id, title, artist, artist_id,
       artwork_url, artwork_path, audio_path, duration_ms, true_peak)
    select p_jam_id,
      -- Entre la actual y la siguiente; sin siguiente, después de la actual.
      case when pos_siguiente is null then pos_actual + 1
           else (pos_actual + pos_siguiente) / 2 end,
      me,
      p_cancion ->> 'videoId', coalesce(p_cancion ->> 'title', ''),
      coalesce(p_cancion ->> 'artist', ''), p_cancion ->> 'artistId',
      coalesce(p_cancion ->> 'artworkUrl', ''), p_cancion ->> 'artworkPath',
      p_cancion ->> 'audioPath',
      coalesce((p_cancion ->> 'durationMs')::integer, 0),
      (p_cancion ->> 'truePeak')::double precision
    returning id into v_nuevo;
  end if;

  update public.jams
  set item_actual = v_nuevo,
      posicion_ms = 0,
      suena = true,
      arrancado_en = now() + interval '600 milliseconds',
      revision = revision + 1,
      expires_at = now() + interval '6 hours'
  where id = p_jam_id;
end;
$$;

revoke all on function public.jam_tocar_ahora(uuid, jsonb) from public;
grant execute on function public.jam_tocar_ahora(uuid, jsonb) to authenticated;
