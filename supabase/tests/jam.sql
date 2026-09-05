-- ═══════════════════════════════════════════════════════════════════════════
-- Pruebas del Jam, contra el stack local de Docker.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/jam.sql
--
-- Todo corre adentro de UNA transacción que termina en ROLLBACK: los usuarios
-- de prueba, el Jam y su cola no dejan rastro. Si algo está mal, un
-- `raise exception 'FALLO: …'` corta la corrida con el porqué.
--
-- La identidad se simula como lo hace el propio Supabase: `auth.uid()` lee el
-- claim `sub` de `request.jwt.claims`, así que fijar ese GUC ES ser esa
-- persona para todas las funciones y policies.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- Dos personas de prueba. El trigger de auth les crea el perfil solo.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'anaprueba@flora.local'),
  ('00000000-0000-4000-8000-0000000000b2', 'betoprueba@flora.local');

-- Actuar como alguien: el mismo claim que pondría el JWT real.
create function pg_temp.como(u uuid) returns void
language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text,
    true
  );
$$;

-- Espera que algo falle Y con el mensaje esperado: un error distinto del
-- esperado es un bug igual que ningún error.
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
  ana constant uuid := '00000000-0000-4000-8000-0000000000a1';
  beto constant uuid := '00000000-0000-4000-8000-0000000000b2';
  estado jsonb;
  v_jam uuid;
  v_code text;
  v_rev bigint;
  v_item1 uuid;
  v_item2 uuid;
begin
  -- ── Crear ────────────────────────────────────────────────────────────────
  perform pg_temp.como(ana);
  estado := public.crear_jam(
    '[{"videoId":"v1","title":"Uno","artist":"A","audioPath":"v1.m4a","durationMs":1000},
      {"videoId":"v2","title":"Dos","artist":"A","audioPath":"v2.m4a","durationMs":2000}]'::jsonb,
    0, true, 5000
  );
  v_jam  := (estado -> 'jam' ->> 'id')::uuid;
  v_code := estado -> 'jam' ->> 'code';

  if length(v_code) <> 6 then
    raise exception 'FALLO: el código mide % y no 6', length(v_code);
  end if;
  if jsonb_array_length(estado -> 'cola') <> 2 then
    raise exception 'FALLO: la cola nació con % ítems', jsonb_array_length(estado -> 'cola');
  end if;
  if (estado -> 'jam' ->> 'suena')::boolean is not true then
    raise exception 'FALLO: el Jam nació en pausa con p_suena=true';
  end if;
  select id into v_item1 from public.jam_queue where jam_id = v_jam and video_id = 'v1';
  select id into v_item2 from public.jam_queue where jam_id = v_jam and video_id = 'v2';
  if (estado -> 'jam' ->> 'item_actual')::uuid <> v_item1 then
    raise exception 'FALLO: item_actual no apunta a la primera canción';
  end if;

  -- Una canción sin audioPath no entra, y no rompe a las demás.
  perform public.jam_agregar(v_jam, '{"videoId":"v3","title":"Rota"}'::jsonb);
  raise exception 'FALLO: se agregó una canción sin audio';
exception when others then
  if sqlerrm not like '%no se puede agregar%' then raise; end if;
end;
$$;

-- La transacción sigue viva: lo de arriba terminó en la excepción esperada,
-- así que el estado se rearma desde cero para el resto de las pruebas.
do $$
declare
  ana constant uuid := '00000000-0000-4000-8000-0000000000a1';
  beto constant uuid := '00000000-0000-4000-8000-0000000000b2';
  estado jsonb;
  v_jam uuid;
  v_code text;
  v_rev bigint;
  v_item1 uuid;
  v_item2 uuid;
  vista jsonb;
begin
  perform pg_temp.como(ana);
  estado := public.crear_jam(
    '[{"videoId":"v1","title":"Uno","artist":"A","audioPath":"v1.m4a","durationMs":1000},
      {"videoId":"v2","title":"Dos","artist":"A","audioPath":"v2.m4a","durationMs":2000}]'::jsonb,
    0, false, 0
  );
  v_jam  := (estado -> 'jam' ->> 'id')::uuid;
  v_code := estado -> 'jam' ->> 'code';
  v_rev  := (estado -> 'jam' ->> 'revision')::bigint;
  select id into v_item1 from public.jam_queue where jam_id = v_jam and video_id = 'v1';
  select id into v_item2 from public.jam_queue where jam_id = v_jam and video_id = 'v2';

  -- ── Mirar y entrar ───────────────────────────────────────────────────────
  perform pg_temp.como(beto);
  vista := public.ver_jam(lower(v_code) || ' ');  -- se normaliza solo
  if vista is null or (vista ->> 'id')::uuid <> v_jam then
    raise exception 'FALLO: ver_jam no encontró el Jam por su código';
  end if;

  perform pg_temp.debe_fallar(
    format('select public.unirse_jam(%L, %L)', 'ZZZZZZ', 'propia'),
    'ya no existe');

  estado := public.unirse_jam(v_code, 'host');
  if jsonb_array_length(estado -> 'miembros') <> 2 then
    raise exception 'FALLO: al unirse hay % miembros', jsonb_array_length(estado -> 'miembros');
  end if;
  if (estado -> 'jam' ->> 'revision')::bigint <= v_rev then
    raise exception 'FALLO: unirse no subió la revision';
  end if;
  v_rev := (estado -> 'jam' ->> 'revision')::bigint;

  -- ── Permisos ─────────────────────────────────────────────────────────────
  -- Beto no es host: los permisos no son suyos.
  perform pg_temp.debe_fallar(
    format('select public.jam_permisos(%L, p_agregan => false)', v_jam),
    'Solo el host');

  -- Con el default puede agregar…
  perform public.jam_agregar(v_jam,
    '{"videoId":"v9","title":"De Beto","artist":"B","audioPath":"v9.m4a","durationMs":900}'::jsonb);
  if (select count(*) from public.jam_queue where jam_id = v_jam) <> 3 then
    raise exception 'FALLO: agregar no dejó 3 en la cola';
  end if;

  -- …hasta que Ana lo apaga.
  perform pg_temp.como(ana);
  perform public.jam_permisos(v_jam, p_agregan => false);
  perform pg_temp.como(beto);
  perform pg_temp.debe_fallar(
    format('select public.jam_agregar(%L, %L::jsonb)', v_jam,
      '{"videoId":"v8","title":"Otra","audioPath":"v8.m4a"}'),
    'El host no permite');

  -- ── Transporte ───────────────────────────────────────────────────────────
  perform public.jam_play(v_jam);
  if not (select suena from public.jams where id = v_jam) then
    raise exception 'FALLO: jam_play no prendió suena';
  end if;
  if (select arrancado_en from public.jams where id = v_jam) is null then
    raise exception 'FALLO: jam_play no fijó arrancado_en';
  end if;

  perform public.jam_saltar(v_jam);
  if (select item_actual from public.jams where id = v_jam) <> v_item2 then
    raise exception 'FALLO: saltar no fue a la segunda';
  end if;

  perform public.jam_seek(v_jam, 30000);
  if (select posicion_ms from public.jams where id = v_jam) <> 30000 then
    raise exception 'FALLO: seek no movió la posición';
  end if;

  perform public.jam_pause(v_jam);
  if (select suena from public.jams where id = v_jam) then
    raise exception 'FALLO: pause no apagó suena';
  end if;
  -- La posición al pausar sale de la derivada del servidor: nunca retrocede.
  if (select posicion_ms from public.jams where id = v_jam) < 30000 then
    raise exception 'FALLO: pausar retrocedió la posición';
  end if;

  -- La revision subió con cada mutación, sin saltos para atrás.
  if (select revision from public.jams where id = v_jam) <= v_rev then
    raise exception 'FALLO: el transporte no subió la revision';
  end if;

  -- ── La cola ajena ────────────────────────────────────────────────────────
  -- Beto no puede quitar lo que puso Ana…
  perform pg_temp.debe_fallar(
    format('select public.jam_quitar(%L, %L)', v_jam, v_item1),
    'agregaste vos');
  -- …ni nadie lo que está sonando.
  perform pg_temp.como(ana);
  perform pg_temp.debe_fallar(
    format('select public.jam_quitar(%L, %L)', v_jam, v_item2),
    'sonando');
  -- El host sí quita lo de cualquiera.
  perform public.jam_quitar(v_jam, v_item1);
  if (select count(*) from public.jam_queue where jam_id = v_jam) <> 2 then
    raise exception 'FALLO: el host no pudo quitar una ajena';
  end if;

  -- ── Tocar ya ─────────────────────────────────────────────────────────────
  -- Beto toca una canción con el Jam andando: se intercala después de la que
  -- suena y salta ahí. Anda aunque «agregar» esté apagado, porque cambiar lo
  -- que suena es el permiso de saltar — el más grande de los dos.
  perform pg_temp.como(beto);
  perform public.jam_tocar_ahora(v_jam,
    '{"videoId":"v7","title":"Ya","artist":"B","audioPath":"v7.m4a","durationMs":700}'::jsonb);
  if (select q.video_id from public.jam_queue q
      where q.id = (select item_actual from public.jams where id = v_jam)) <> 'v7' then
    raise exception 'FALLO: tocar_ahora no saltó a la canción nueva';
  end if;
  if not (select suena from public.jams where id = v_jam) then
    raise exception 'FALLO: tocar_ahora no arrancó la reproducción';
  end if;
  -- Y quedó ENTRE la actual y lo que venía: el futuro de nadie se borró.
  if (select array_agg(q.video_id order by q.posicion)
      from public.jam_queue q where q.jam_id = v_jam) <> array['v2','v7','v9'] then
    raise exception 'FALLO: tocar_ahora desordenó la cola';
  end if;

  -- ── Mover ────────────────────────────────────────────────────────────────
  -- Reordenar es editar la fila: pide el permiso de agregar, que sigue
  -- apagado — así que Beto no puede.
  select id into v_item1 from public.jam_queue where jam_id = v_jam and video_id = 'v9';
  select id into v_item2 from public.jam_queue where jam_id = v_jam and video_id = 'v2';
  perform pg_temp.debe_fallar(
    format('select public.jam_mover(%L, %L, %L)', v_jam, v_item1, v_item2),
    'El host no permite');

  -- El host sí: v9 pasa a estar después de v2, entre medio de lo que había.
  perform pg_temp.como(ana);
  perform public.jam_mover(v_jam, v_item1, v_item2);
  if (select array_agg(q.video_id order by q.posicion)
      from public.jam_queue q where q.jam_id = v_jam) <> array['v2','v9','v7'] then
    raise exception 'FALLO: mover no dejó v9 después de v2';
  end if;

  -- Sin ancla es «al frente de la fila».
  perform public.jam_mover(v_jam, v_item1, null);
  if (select array_agg(q.video_id order by q.posicion)
      from public.jam_queue q where q.jam_id = v_jam) <> array['v9','v2','v7'] then
    raise exception 'FALLO: mover sin ancla no fue al frente';
  end if;

  -- Referencias rotas: moverse tras sí misma, o tras algo que ya no está.
  perform pg_temp.debe_fallar(
    format('select public.jam_mover(%L, %L, %L)', v_jam, v_item1, v_item1),
    'ya está ahí');
  perform pg_temp.debe_fallar(
    format('select public.jam_mover(%L, %L, %L)', v_jam, gen_random_uuid(), v_item1),
    'no está en el Jam');
  perform pg_temp.como(beto);

  -- ── Echar y terminar ─────────────────────────────────────────────────────
  perform pg_temp.como(beto);
  perform pg_temp.debe_fallar(
    format('select public.terminar_jam(%L)', v_jam),
    'Solo el host');
  perform pg_temp.debe_fallar(
    format('select public.jam_expulsar(%L, %L)', v_jam,
      '00000000-0000-4000-8000-0000000000a1'),
    'Solo el host');

  perform pg_temp.como(ana);
  perform public.jam_expulsar(v_jam, beto);
  if exists (select 1 from public.jam_members where jam_id = v_jam and user_id = beto) then
    raise exception 'FALLO: expulsar no sacó a Beto';
  end if;

  -- Expulsado, el estado le queda vedado.
  perform pg_temp.como(beto);
  perform pg_temp.debe_fallar(
    format('select public.jam_estado(%L)', v_jam),
    'No estás');

  perform pg_temp.como(ana);
  if public.mi_jam() <> v_jam then
    raise exception 'FALLO: mi_jam no encuentra el Jam del host';
  end if;
  perform pg_temp.como(beto);
  if public.mi_jam() is not null then
    raise exception 'FALLO: mi_jam le inventa un Jam a Beto';
  end if;

  perform pg_temp.como(ana);
  perform public.terminar_jam(v_jam);
  if (select status from public.jams where id = v_jam) <> 'terminado' then
    raise exception 'FALLO: terminar no terminó';
  end if;

  -- Un Jam terminado no acepta ni entradas ni comandos.
  perform pg_temp.como(beto);
  perform pg_temp.debe_fallar(
    format('select public.unirse_jam(%L, %L)', v_code, 'propia'),
    'ya no existe');
  perform pg_temp.como(ana);
  perform pg_temp.debe_fallar(
    format('select public.jam_play(%L)', v_jam),
    'ya terminó');
end;
$$;

-- ── La cola: lo pedido antes que lo sugerido ────────────────────────────────
-- Ana crea el Jam con dos canciones y el relleno agrega dos sugeridas; Beto
-- pide una: tiene que sonar después de lo que ya se había pedido y ANTES de
-- las sugeridas, y las sugeridas siguen yendo al final.
do $$
declare
  ana constant uuid := '00000000-0000-4000-8000-0000000000a1';
  beto constant uuid := '00000000-0000-4000-8000-0000000000b2';
  estado jsonb;
  v_jam uuid;
  v_code text;
  orden text[];
begin
  perform pg_temp.como(ana);
  estado := public.crear_jam(
    '[{"videoId":"v1","title":"Uno","audioPath":"v1.m4a","durationMs":1000},
      {"videoId":"v2","title":"Dos","audioPath":"v2.m4a","durationMs":1000}]'::jsonb,
    0, true, 0
  );
  v_jam  := (estado -> 'jam' ->> 'id')::uuid;
  v_code := estado -> 'jam' ->> 'code';

  -- El relleno del host: dos sugeridas al final.
  perform public.jam_agregar(v_jam, '{"videoId":"a1","title":"Radio 1","audioPath":"a1.m4a"}'::jsonb, true);
  perform public.jam_agregar(v_jam, '{"videoId":"a2","title":"Radio 2","audioPath":"a2.m4a"}'::jsonb, true);

  -- Beto pide una y después otra: van entre lo pedido y lo sugerido, en orden.
  perform pg_temp.como(beto);
  perform public.unirse_jam(v_code, 'propia');
  perform public.jam_agregar(v_jam, '{"videoId":"p1","title":"Pedida 1","audioPath":"p1.m4a"}'::jsonb);
  perform public.jam_agregar(v_jam, '{"videoId":"p2","title":"Pedida 2","audioPath":"p2.m4a"}'::jsonb);

  select array_agg(video_id order by posicion) into orden
  from public.jam_queue where jam_id = v_jam;
  if orden <> array['v1', 'v2', 'p1', 'p2', 'a1', 'a2'] then
    raise exception 'FALLO: lo pedido no fue antes que lo sugerido: %', orden;
  end if;

  -- Una sugerida más sigue yendo al final, detrás de lo pedido.
  perform pg_temp.como(ana);
  perform public.jam_agregar(v_jam, '{"videoId":"a3","title":"Radio 3","audioPath":"a3.m4a"}'::jsonb, true);
  select array_agg(video_id order by posicion) into orden
  from public.jam_queue where jam_id = v_jam;
  if orden[7] <> 'a3' then
    raise exception 'FALLO: la sugerida no fue al final: %', orden;
  end if;

  -- Lo marcado como automático llega como tal al estado.
  estado := public.jam_estado(v_jam);
  if (select count(*) from jsonb_array_elements(estado -> 'cola') c
      where (c ->> 'automatica')::boolean) <> 3 then
    raise exception 'FALLO: jam_estado no cuenta las sugeridas';
  end if;

  -- El Jam mudo en el final se despierta con lo que pide una persona.
  perform public.jam_tocar(v_jam, (select id from public.jam_queue where jam_id = v_jam and video_id = 'a3'));
  perform public.jam_saltar(v_jam);
  if (select suena from public.jams where id = v_jam) then
    raise exception 'FALLO: saltar en la última no dejó el Jam mudo';
  end if;
  perform pg_temp.como(beto);
  perform public.jam_agregar(v_jam, '{"videoId":"p3","title":"Pedida 3","audioPath":"p3.m4a"}'::jsonb);
  if not (select suena from public.jams where id = v_jam)
     or (select video_id from public.jam_queue where id = (select item_actual from public.jams where id = v_jam)) <> 'p3' then
    raise exception 'FALLO: pedir una canción con el Jam mudo no lo despertó con ella';
  end if;

  -- Poner una lista con el Jam andando: la tocada suena ya, y el resto de la
  -- lista va detrás de lo pedido y antes de lo sugerido.
  perform public.jam_tocar_cola(v_jam,
    '[{"videoId":"L1","title":"Lista 1","audioPath":"L1.m4a"},
      {"videoId":"L2","title":"Lista 2","audioPath":"L2.m4a"},
      {"videoId":"L3","title":"Lista 3","audioPath":"L3.m4a"}]'::jsonb);
  if (select video_id from public.jam_queue where id = (select item_actual from public.jams where id = v_jam)) <> 'L1' then
    raise exception 'FALLO: poner una lista no hizo sonar la primera';
  end if;
  perform public.jam_agregar(v_jam, '{"videoId":"p4","title":"Pedida 4","audioPath":"p4.m4a"}'::jsonb);
  select array_agg(video_id order by posicion) into orden
  from public.jam_queue q where jam_id = v_jam
    and posicion > (select posicion from public.jam_queue where id = (select item_actual from public.jams where id = v_jam));
  -- Después de L1 (la que suena): lo pedido antes (p4), la lista después (L2, L3), y nada sugerido quedaba.
  if orden[1] <> 'p4' or orden[2] <> 'L2' or orden[3] <> 'L3' then
    raise exception 'FALLO: la lista no quedó detrás de lo pedido: %', orden;
  end if;

  -- Beto se va antes de que Ana cierre: la membresía sobrevive al Jam
  -- terminado, y la prueba de RLS de abajo espera que no vea ninguno.
  perform public.salir_jam(v_jam);
  perform pg_temp.como(ana);
  perform public.terminar_jam(v_jam);
end;
$$;

-- ── RLS: quien no es miembro no ve una fila ─────────────────────────────────
-- Directo contra las tablas, como haría un cliente con supabase-js. Ana arma
-- un Jam nuevo; Beto, afuera, tiene que ver exactamente nada.
do $$
declare
  ana constant uuid := '00000000-0000-4000-8000-0000000000a1';
  estado jsonb;
begin
  perform pg_temp.como(ana);
  estado := public.crear_jam(
    '[{"videoId":"v1","title":"Uno","audioPath":"v1.m4a","durationMs":1000}]'::jsonb,
    0, false, 0);
end;
$$;

set local role authenticated;
select pg_temp.como('00000000-0000-4000-8000-0000000000b2');

do $$
begin
  if exists (select 1 from public.jams) then
    raise exception 'FALLO: RLS deja ver un Jam ajeno';
  end if;
  if exists (select 1 from public.jam_queue) then
    raise exception 'FALLO: RLS deja ver una cola ajena';
  end if;
  if exists (select 1 from public.jam_members) then
    raise exception 'FALLO: RLS deja ver miembros ajenos';
  end if;
end;
$$;

reset role;

select 'JAM OK: todas las pruebas pasaron' as resultado;

rollback;
