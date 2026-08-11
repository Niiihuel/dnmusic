/*
 * Con qué seguir cuando se termina la lista.
 *
 * Son dos consultas de agregación sobre `plays`, y van como funciones por la
 * misma razón que `get_profile_stats`: agrupar y sumar no se puede expresar
 * desde PostgREST sin traerse las filas crudas al teléfono.
 *
 * No hay ningún modelo acá. La señal es tu propio historial —cuánto tiempo real
 * escuchaste a cada artista— y el catálogo lo pone YouTube Music, que la app ya
 * sabe consultar. Es cómo funcionaban las radios antes de que todo fuera un
 * modelo, y para dos personas con sus listas alcanza de sobra.
 */

/**
 * Tus artistas, ordenados por cuánto los escuchaste de verdad.
 *
 * Suma `ms`, que es tiempo efectivamente sonado y no cantidad de veces que
 * apretaste play: un tema que dejaste correr entero pesa más que veinte que
 * cortaste a los cinco segundos. Esa distinción es la que hace que la
 * recomendación se parezca a lo que te gusta y no a lo que probaste.
 *
 * Solo devuelve los que tienen `artist_id`: sin el id del canal no hay forma de
 * pedirle su catálogo a YouTube, así que un artista sin id no sirve para esto
 * por más que lo hayas escuchado mucho.
 */
create or replace function public.artistas_mas_escuchados(p_limite integer default 8)
returns table (artist_id text, artist text, ms bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.artist_id, min(p.artist), sum(p.ms)
  from public.plays p
  where p.owner_id = auth.uid()
    and p.artist_id is not null
    and p.artist_id <> ''
  group by p.artist_id
  order by sum(p.ms) desc
  limit greatest(1, least(p_limite, 50));
$$;

revoke all on function public.artistas_mas_escuchados(integer) from public;
grant execute on function public.artistas_mas_escuchados(integer) to authenticated;

/**
 * Lo que escuchaste últimamente, para no volver a ofrecértelo.
 *
 * Sin esto, la recomendación te devuelve los mismos tres temas del artista que
 * más escuchás —que son justo los que acabás de escuchar— y se siente rota.
 *
 * La ventana va en días y no en cantidad de canciones porque lo que molesta es
 * la repetición **cercana en el tiempo**: veinte temas atrás puede ser hoy a la
 * mañana o el mes pasado, y no son lo mismo.
 */
create or replace function public.escuchadas_recientes(p_dias integer default 7)
returns table (video_id text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct p.video_id
  from public.plays p
  where p.owner_id = auth.uid()
    and p.at > now() - (greatest(1, least(p_dias, 90)) || ' days')::interval;
$$;

revoke all on function public.escuchadas_recientes(integer) from public;
grant execute on function public.escuchadas_recientes(integer) to authenticated;
