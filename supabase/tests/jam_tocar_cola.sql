-- ═══════════════════════════════════════════════════════════════════════════
-- Pruebas de jam_tocar_cola: poner una playlist entera dentro de un Jam.
--
--   docker exec -i supabase_db_dany psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/jam_tocar_cola.sql
--
-- Mismo esquema que supabase/tests/jam.sql: una transacción, identidad por el
-- claim `sub`, y ROLLBACK al final para no dejar rastro.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000c1', 'colaana@flora.local', '{"provider":"google"}'),
  ('00000000-0000-4000-8000-0000000000c2', 'colabeto@flora.local', '{"provider":"google"}');
-- Trusted SQL fixture setup: real Google signups remain pending until approved.
update app_private.access_accounts set status='approved' where user_id in (
 '00000000-0000-4000-8000-0000000000c1',
 '00000000-0000-4000-8000-0000000000c2');

create function pg_temp.como(u uuid) returns void
language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text,
    true
  );
$$;

do $$
declare
  ana constant uuid := '00000000-0000-4000-8000-0000000000c1';
  beto constant uuid := '00000000-0000-4000-8000-0000000000c2';
  estado jsonb;
  v_jam uuid;
  v_code text;
  v_rev bigint;
  v_actual uuid;
  orden text[];
begin
  -- Ana crea el Jam con dos canciones; suena la primera.
  perform pg_temp.como(ana);
  estado := public.crear_jam(
    '[{"videoId":"v1","title":"Uno","artist":"A","audioPath":"v1.m4a","durationMs":1000},
      {"videoId":"v2","title":"Dos","artist":"A","audioPath":"v2.m4a","durationMs":2000}]'::jsonb,
    0, true, 5000
  );
  v_jam  := (estado -> 'jam' ->> 'id')::uuid;
  v_code := estado -> 'jam' ->> 'code';
  v_rev  := (estado -> 'jam' ->> 'revision')::bigint;

  -- Beto entra y pone una playlist de tres: el Jam salta a la primera del
  -- bloque, y v2 —lo que venía después— queda al final, no borrado.
  perform pg_temp.como(beto);
  perform public.unirse_jam(v_code, 'propia');
  perform public.jam_tocar_cola(v_jam,
    '[{"videoId":"p1","title":"P1","artist":"B","audioPath":"p1.m4a","durationMs":1000},
      {"videoId":"p2","title":"P2","artist":"B","audioPath":"p2.m4a","durationMs":1000},
      {"videoId":"p3","title":"P3","artist":"B","audioPath":"p3.m4a","durationMs":1000}]'::jsonb);

  select array_agg(video_id order by posicion) into orden
  from public.jam_queue where jam_id = v_jam;
  if orden <> array['v1','p1','p2','p3','v2'] then
    raise exception 'FALLO: el orden quedó % y se esperaba v1,p1,p2,p3,v2', orden;
  end if;

  select item_actual into v_actual from public.jams where id = v_jam;
  if v_actual <> (select id from public.jam_queue where jam_id = v_jam and video_id = 'p1') then
    raise exception 'FALLO: item_actual no apunta a la primera de la lista puesta';
  end if;
  if (select suena from public.jams where id = v_jam) is not true then
    raise exception 'FALLO: poner la lista tenía que dejar el Jam sonando';
  end if;
  if (select revision from public.jams where id = v_jam) <= v_rev then
    raise exception 'FALLO: la revision no subió al poner la lista';
  end if;

  -- Una fila inválida en el medio se saltea sin voltear al resto.
  perform public.jam_tocar_cola(v_jam,
    '[{"videoId":"rota","title":"Rota"},
      {"videoId":"p4","title":"P4","artist":"B","audioPath":"p4.m4a","durationMs":1000}]'::jsonb);
  if exists (select 1 from public.jam_queue where jam_id = v_jam and video_id = 'rota') then
    raise exception 'FALLO: entró una canción sin audio';
  end if;
  select item_actual into v_actual from public.jams where id = v_jam;
  if v_actual <> (select id from public.jam_queue where jam_id = v_jam and video_id = 'p4') then
    raise exception 'FALLO: item_actual no apunta a p4 tras saltear la rota';
  end if;

  -- Sin permiso de saltar, poner una lista es cambiar de canción: no se puede.
  perform pg_temp.como(ana);
  perform public.jam_permisos(v_jam, null, null, false);
  perform pg_temp.como(beto);
  begin
    perform public.jam_tocar_cola(v_jam,
      '[{"videoId":"p5","title":"P5","artist":"B","audioPath":"p5.m4a","durationMs":1000}]'::jsonb);
    raise exception 'FALLO: beto pudo poner una lista sin permiso de saltar';
  exception when others then
    if sqlerrm not like '%no permite%' then raise; end if;
  end;

  -- Vacía no es una lista. Como host: el permiso se revisa antes que el
  -- contenido, y esta prueba es del contenido.
  perform pg_temp.como(ana);
  begin
    perform public.jam_tocar_cola(v_jam, '[]'::jsonb);
    raise exception 'FALLO: una lista vacía tenía que fallar';
  exception when others then
    if sqlerrm not like '%No hay canciones%' then raise; end if;
  end;

  raise notice 'jam_tocar_cola: todas las pruebas pasaron';
end;
$$;

rollback;
