-- ═══════════════════════════════════════════════════════════════════════════
-- Pruebas de la escucha entre dispositivos, contra el stack local de Docker.
--
--   docker exec -i supabase_db_dany psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/escucha.sql
--
-- Mismo esquema que las del Jam: todo adentro de UNA transacción que termina
-- en ROLLBACK, la identidad se simula fijando el claim `sub`, y un
-- `raise exception 'FALLO: …'` corta la corrida con el porqué.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'carlaprueba@flora.local'),
  ('00000000-0000-4000-8000-0000000000d2', 'dinoprueba@flora.local');

create function pg_temp.como(u uuid) returns void
language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text,
    true
  );
$$;

create function pg_temp.debe_fallar(que text, fragmento text) returns void
language plpgsql as $$
declare
  paso boolean := false;
begin
  begin
    execute que;
    paso := true;
  exception when others then
    if position(fragmento in sqlerrm) = 0 then
      raise exception 'FALLO: «%» tiró "%" y se esperaba "%"', que, sqlerrm, fragmento;
    end if;
  end;
  if paso then
    raise exception 'FALLO: «%» tenía que fallar y no falló', que;
  end if;
end;
$$;

do $$
declare
  carla constant uuid := '00000000-0000-4000-8000-0000000000c1';
  dino  constant uuid := '00000000-0000-4000-8000-0000000000d2';
  cancion constant jsonb :=
    '{"id":"t1","videoId":"v1","title":"Uno","artist":"A","audioPath":"v1.m4a","durationMs":90000}';
  otra constant jsonb :=
    '{"id":"t2","videoId":"v2","title":"Dos","artist":"A","audioPath":"v2.m4a","durationMs":80000}';
  estado jsonb;
  rev bigint;
begin
  -- ── Publicar crea la fila y devuelve la revisión ─────────────────────────
  perform pg_temp.como(carla);
  rev := public.escucha_publicar(
    'compu', 'Computadora', 0, cancion, true, 5000,
    jsonb_build_object('tracks', jsonb_build_array(cancion, otra),
                       'index', 0, 'upNext', '[]'::jsonb,
                       'manual', null, 'origin', null));
  if rev <> 1 then
    raise exception 'FALLO: la primera publicación tenía que ser revisión 1, fue %', rev;
  end if;

  estado := public.escucha_estado();
  if estado -> 'escucha' ->> 'device_id' <> 'compu'
     or (estado -> 'escucha' ->> 'suena')::boolean is not true
     or estado -> 'cola' -> 'tracks' is null then
    raise exception 'FALLO: el estado no devolvió lo publicado: %', estado;
  end if;

  -- El mismo dispositivo publica de nuevo sin cola y sin mirar revisiones:
  -- su reproductor ES la verdad.
  rev := public.escucha_publicar('compu', 'Computadora', 0, cancion, false, 12000, null);
  if rev <> 2 then
    raise exception 'FALLO: la segunda publicación tenía que ser revisión 2, fue %', rev;
  end if;
  -- La cola sobrevive a un evento sin cola.
  if public.escucha_estado() -> 'cola' -> 'tracks' is null then
    raise exception 'FALLO: un evento sin cola no puede borrar la cola guardada';
  end if;

  -- ── El reclamo exige la revisión al día ──────────────────────────────────
  perform pg_temp.debe_fallar(
    $q$select public.escucha_publicar('telefono', 'iPhone', 0,
      '{"id":"t1","videoId":"v1","title":"Uno","audioPath":"v1.m4a"}'::jsonb,
      true, 0, null)$q$,
    'otro dispositivo');

  rev := public.escucha_publicar('telefono', 'iPhone', 2, cancion, true, 12000, null);
  if rev <> 3 then
    raise exception 'FALLO: el traspaso tenía que subir a revisión 3, fue %', rev;
  end if;

  -- El dueño destronado que publica tarde, con su revisión vieja, rebota.
  perform pg_temp.debe_fallar(
    $q$select public.escucha_publicar('compu', 'Computadora', 2,
      '{"id":"t1","videoId":"v1","title":"Uno","audioPath":"v1.m4a"}'::jsonb,
      true, 99000, null)$q$,
    'otro dispositivo');

  -- ── Cerrar: track null limpia la escucha y su cola ───────────────────────
  rev := public.escucha_publicar('telefono', 'iPhone', 3, null, true, 0, null);
  estado := public.escucha_estado();
  if estado -> 'escucha' -> 'track' is distinct from 'null'::jsonb
     or (estado -> 'escucha' ->> 'suena')::boolean is not false then
    raise exception 'FALLO: cerrar no dejó la fila vacía: %', estado;
  end if;
  if estado -> 'cola' is distinct from 'null'::jsonb then
    raise exception 'FALLO: cerrar no borró la cola: %', estado -> 'cola';
  end if;

  -- ── Lo ajeno no se ve ────────────────────────────────────────────────────
  perform pg_temp.como(dino);
  if public.escucha_estado() is not null then
    raise exception 'FALLO: dino vio la escucha de carla';
  end if;
  set local role authenticated;
  if exists (select 1 from public.escuchas) then
    raise exception 'FALLO: RLS dejó leer la fila de otra cuenta';
  end if;
  reset role;

  -- ── Sin sesión no hay nada ───────────────────────────────────────────────
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.debe_fallar(
    $q$select public.escucha_publicar('x', 'X', 0, null, false, 0, null)$q$,
    'Sesión requerida');

  raise notice 'ESCUCHA: todas las pruebas pasaron.';
end;
$$;

rollback;
