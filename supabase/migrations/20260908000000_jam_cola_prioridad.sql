/*
 * La cola del Jam distingue lo que alguien pidió de lo que el Jam sugirió.
 *
 * Hasta acá `jam_agregar` ponía todo al final, y el host rellena la cola con
 * recomendaciones cuando quedan pocas (ver `rellenarJamSiFalta`). El resultado
 * era que «Agregar a la cola» —un pedido expreso de una persona— quedaba
 * **detrás** de lo que sugirió la máquina: encolabas tres canciones y sonaban
 * después de media hora de radio. Fuera del Jam esto ya estaba resuelto (la
 * cola manual va antes que las recomendadas, ver `enqueue`); adentro no había
 * forma de saberlo porque la fila no decía de dónde venía.
 *
 * `automatica` es eso: la puso el relleno, no una persona. Y `jam_agregar`
 * pasa a tener la regla de Spotify: lo pedido va **después de lo pedido y
 * antes de lo sugerido**; lo sugerido, al final. Con tres canciones encoladas
 * a mano suenan las tres, en el orden en que se pidieron, y después sigue la
 * radio.
 */

alter table public.jam_queue
  add column if not exists automatica boolean not null default false;

drop function if exists public.jam_agregar(uuid, jsonb);

create or replace function public.jam_agregar(
  p_jam_id uuid,
  p_cancion jsonb,
  p_automatica boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  v public.jams := public.jam_abrir(p_jam_id);
  pos_actual numeric;
  base numeric;
  pos_siguiente numeric;
  nueva numeric;
  v_nuevo uuid;
  en_silencio boolean;
begin
  perform public.jam_autorizado(v, me, 'agregar');
  if coalesce(p_cancion ->> 'audioPath', '') = ''
     or coalesce(p_cancion ->> 'videoId', '') = '' then
    raise exception 'Esa canción no se puede agregar';
  end if;
  if (select count(*) from public.jam_queue where jam_id = p_jam_id) >= 500 then
    raise exception 'La cola del Jam está llena';
  end if;

  select posicion into pos_actual
  from public.jam_queue where id = v.item_actual;

  /*
   * «Mudo en el final» es la huella exacta que deja `jam_saltar` sin
   * siguiente: sin sonar, en cero, sin arranque, y con la actual siendo la
   * última de la fila. Las cuatro juntas: un Jam recién creado en pausa
   * también está en cero y sin arranque, pero su actual no es la última.
   */
  en_silencio := not v.suena
    and v.posicion_ms = 0
    and v.arrancado_en is null
    and pos_actual is not null
    and not exists (
      select 1 from public.jam_queue
      where jam_id = p_jam_id and posicion > pos_actual
    );

  if p_automatica then
    -- Lo sugerido va al final, siempre: es el relleno, no un pedido.
    select coalesce(max(posicion), 0) + 1 into nueva
    from public.jam_queue where jam_id = p_jam_id;
  else
    /*
     * Lo pedido va después de lo último que se pidió (de lo que todavía no
     * sonó) y antes de lo primero que se sugirió. Sin pedidos por delante,
     * justo después de la actual; sin actual, después de lo que haya.
     */
    select max(posicion) into base
    from public.jam_queue
    where jam_id = p_jam_id
      and not automatica
      and (pos_actual is null or posicion > pos_actual);
    base := coalesce(base, pos_actual, (
      select coalesce(max(posicion), 0) from public.jam_queue
      where jam_id = p_jam_id and not automatica
    ), 0);
    select min(posicion) into pos_siguiente
    from public.jam_queue
    where jam_id = p_jam_id and posicion > base;
    nueva := case when pos_siguiente is null then base + 1
                  else (base + pos_siguiente) / 2 end;
  end if;

  insert into public.jam_queue
    (jam_id, posicion, added_by, automatica, video_id, title, artist, artist_id,
     artwork_url, artwork_path, audio_path, duration_ms, true_peak)
  select p_jam_id, nueva, me, p_automatica,
    p_cancion ->> 'videoId', coalesce(p_cancion ->> 'title', ''),
    coalesce(p_cancion ->> 'artist', ''), p_cancion ->> 'artistId',
    coalesce(p_cancion ->> 'artworkUrl', ''), p_cancion ->> 'artworkPath',
    p_cancion ->> 'audioPath',
    coalesce((p_cancion ->> 'durationMs')::integer, 0),
    (p_cancion ->> 'truePeak')::double precision
  returning id into v_nuevo;

  /*
   * Si la cola había terminado, lo agregado pasa a ser lo que sigue — y si
   * el Jam estaba mudo en el final (ver `jam_saltar`: sin sonar, en cero y
   * sin arranque), una persona que agrega lo despierta con lo suyo. El
   * relleno no despierta nada desde acá: lo hace el host cuando termina la
   * tanda, para no arrancar a mitad de una ráfaga.
   */
  if v.item_actual is null then
    update public.jams set item_actual = v_nuevo where id = p_jam_id;
  elsif en_silencio and not p_automatica then
    update public.jams
    set item_actual = v_nuevo, posicion_ms = 0, suena = true,
        arrancado_en = now() + interval '600 milliseconds'
    where id = p_jam_id;
  end if;

  update public.jams
  set revision = revision + 1, expires_at = now() + interval '6 hours'
  where id = p_jam_id;
end;
$$;

revoke all on function public.jam_agregar(uuid, jsonb, boolean) from public;
grant execute on function public.jam_agregar(uuid, jsonb, boolean) to authenticated;

/*
 * Tocar una canción de una lista con el Jam andando también respeta lo pedido.
 *
 * `jam_tocar_cola` metía la lista entera —hasta trescientas canciones— justo
 * después de la actual: la tocada sonaba ya, bien, pero el resto de la lista
 * quedaba **por delante** de lo que otros habían pedido. Ahora la tocada va
 * después de la actual y suena ya, como siempre; el resto de la lista entra
 * como contexto, `automatica`, después de lo pedido y antes de lo que el Jam
 * ya había sugerido. Es la regla de Spotify: la cola de la gente primero, la
 * lista que se puso después, la radio al final.
 */
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
  base numeric;
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

  -- La primera: justo después de la actual, y es la que pasa a sonar.
  for c in select * from jsonb_array_elements(p_canciones) loop
    if coalesce(c ->> 'audioPath', '') = '' or coalesce(c ->> 'videoId', '') = '' then
      continue;
    end if;
    if pos_actual is null then
      select coalesce(max(posicion), 0) + 1 into base from public.jam_queue where jam_id = p_jam_id;
    else
      select min(posicion) into pos_siguiente
      from public.jam_queue where jam_id = p_jam_id and posicion > pos_actual;
      base := case when pos_siguiente is null then pos_actual + 1
                   else (pos_actual + pos_siguiente) / 2 end;
    end if;
    insert into public.jam_queue
      (jam_id, posicion, added_by, automatica, video_id, title, artist, artist_id,
       artwork_url, artwork_path, audio_path, duration_ms, true_peak)
    values
      (p_jam_id, base, me, false,
       c ->> 'videoId', coalesce(c ->> 'title', ''),
       coalesce(c ->> 'artist', ''), c ->> 'artistId',
       coalesce(c ->> 'artworkUrl', ''), c ->> 'artworkPath',
       c ->> 'audioPath',
       coalesce((c ->> 'durationMs')::integer, 0),
       (c ->> 'truePeak')::double precision)
    returning id into v_primero;
    i := i + 1;
    exit;
  end loop;

  if v_primero is null then
    raise exception 'Esas canciones no se pueden poner';
  end if;

  /*
   * El resto de la lista: después de lo último que se pidió y antes de lo
   * primero que se sugirió, repartido parejo en ese hueco. Marcado como
   * automático porque es contexto, no un pedido — lo que alguien encole
   * después va a sonar antes que la lista, como afuera del Jam.
   */
  select max(posicion) into base
  from public.jam_queue
  where jam_id = p_jam_id and not automatica and posicion > base;
  base := coalesce(base, (
    select posicion from public.jam_queue where id = v_primero
  ));
  select min(posicion) into pos_siguiente
  from public.jam_queue where jam_id = p_jam_id and posicion > base;
  paso := case when pos_siguiente is null then 1
               else (pos_siguiente - base) / (cuantas + 1) end;

  for c in select * from jsonb_array_elements(p_canciones) offset i loop
    i := i + 1;
    if coalesce(c ->> 'audioPath', '') = '' or coalesce(c ->> 'videoId', '') = '' then
      continue;
    end if;
    insert into public.jam_queue
      (jam_id, posicion, added_by, automatica, video_id, title, artist, artist_id,
       artwork_url, artwork_path, audio_path, duration_ms, true_peak)
    values
      (p_jam_id, base + paso * i, me, true,
       c ->> 'videoId', coalesce(c ->> 'title', ''),
       coalesce(c ->> 'artist', ''), c ->> 'artistId',
       coalesce(c ->> 'artworkUrl', ''), c ->> 'artworkPath',
       c ->> 'audioPath',
       coalesce((c ->> 'durationMs')::integer, 0),
       (c ->> 'truePeak')::double precision)
    returning id into v_nuevo;
  end loop;

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
