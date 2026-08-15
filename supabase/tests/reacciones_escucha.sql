-- ═══════════════════════════════════════════════════════════════════════════
-- Pruebas de las reacciones a la escucha.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/reacciones_escucha.sql
--
-- Lo que importa acá es que la canción de la reacción la ponga **el servidor**:
-- si viniera del cliente, cualquiera podría inventarle a otro una reacción
-- sobre una canción que nunca escuchó. Y que un desconocido no pueda ni mirar
-- ni reaccionar.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'emi@flora.local'),
  ('00000000-0000-4000-8000-0000000000e2', 'eze@flora.local'),
  ('00000000-0000-4000-8000-0000000000e3', 'eva@flora.local');

update public.profiles set username = 'emiprueba'
  where user_id = '00000000-0000-4000-8000-0000000000e1';
update public.profiles set username = 'ezeprueba'
  where user_id = '00000000-0000-4000-8000-0000000000e2';
update public.profiles set username = 'evaprueba'
  where user_id = '00000000-0000-4000-8000-0000000000e3';

-- Emi y Eze son contactos. Eva no conoce a nadie.
insert into public.pairs (id) values ('00000000-0000-4000-8000-00000000ee01');
insert into public.pair_members (pair_id, user_id) values
  ('00000000-0000-4000-8000-00000000ee01', '00000000-0000-4000-8000-0000000000e1'),
  ('00000000-0000-4000-8000-00000000ee01', '00000000-0000-4000-8000-0000000000e2');

-- Emi está escuchando algo.
insert into public.escuchas (user_id, device_id, device_nombre, track, suena)
values (
  '00000000-0000-4000-8000-0000000000e1', 'aparato-1', 'Computadora',
  '{"videoId":"abc","title":"K.","artist":"Cigarettes After Sex"}'::jsonb,
  true
);

create function pg_temp.como(u uuid) returns void
language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text,
    true
  );
$$;

/*
 * Preparar el escenario, con el rol privilegiado.
 *
 * En esta base **ninguna tabla tiene grants directos** para `authenticated`:
 * todo pasa por RPCs, y escribir `escuchas` o `profiles` a mano es justamente
 * lo que la app no puede hacer. Para una prueba eso es andamiaje —montar la
 * situación, no ejercitarla— así que se baja el rol un instante y se vuelve.
 *
 * Todo lo que se **prueba** corre como `authenticated`; esto solo arma la
 * escena entre acto y acto.
 */
create function pg_temp.andamio(sentencia text) returns void
language plpgsql as $fn$
begin
  perform set_config('role', 'postgres', true);
  execute sentencia;
  perform set_config('role', 'authenticated', true);
end;
$fn$;

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

set local role authenticated;

do $$
declare
  emi constant uuid := '00000000-0000-4000-8000-0000000000e1'; -- escucha
  eze constant uuid := '00000000-0000-4000-8000-0000000000e2'; -- contacto
  eva constant uuid := '00000000-0000-4000-8000-0000000000e3'; -- ajena
  v_fila record;
  v_id   uuid;
  v_n    integer;
begin
  -- ── Ver qué escucha un contacto ──────────────────────────────────────────
  perform pg_temp.como(eze);
  select * into v_fila from public.escucha_de_contacto(emi);
  if v_fila.track is null then
    raise exception 'FALLO: un contacto no puede ver qué escucha el otro';
  end if;
  if v_fila.track ->> 'title' <> 'K.' or v_fila.suena is not true then
    raise exception 'FALLO: la escucha llegó mal: % / %', v_fila.track, v_fila.suena;
  end if;

  -- Una desconocida no ve nada. Cero filas, no un error: no se distingue
  -- «no sos contacto» de «no está escuchando nada».
  perform pg_temp.como(eva);
  if exists (select 1 from public.escucha_de_contacto(emi)) then
    raise exception 'FALLO: una desconocida ve la escucha ajena';
  end if;

  -- Y la fila cruda sigue siendo privada para todos menos su dueño.
  if exists (select 1 from public.escuchas where user_id = emi) then
    raise exception 'FALLO: RLS deja leer la fila de escucha ajena';
  end if;

  -- ── Reaccionar ───────────────────────────────────────────────────────────
  perform pg_temp.debe_fallar(
    format('select public.reaccionar_escucha(%L, %L)', emi, '🔥'),
    'tus contactos'
  );

  perform pg_temp.como(eze);
  v_id := public.reaccionar_escucha(emi, '🔥');
  if v_id is null then
    raise exception 'FALLO: un contacto no pudo reaccionar';
  end if;

  -- **La canción la puso el servidor**, leída de la escucha en ese momento.
  select * into v_fila from public.reacciones_escucha where id = v_id;
  if v_fila.track ->> 'videoId' <> 'abc' then
    raise exception 'FALLO: la reacción no congeló la canción que sonaba: %', v_fila.track;
  end if;
  if v_fila.emoji <> '🔥' then
    raise exception 'FALLO: el emoji llegó como «%»', v_fila.emoji;
  end if;

  -- Nadie reacciona a un silencio.
  perform pg_temp.andamio(format('update public.escuchas set track = null where user_id = %L', emi));
  perform pg_temp.debe_fallar(
    format('select public.reaccionar_escucha(%L, %L)', emi, '💜'),
    'no está sonando nada'
  );
  perform pg_temp.andamio(format(
    'update public.escuchas set track = %L::jsonb where user_id = %L',
    '{"videoId":"abc","title":"K.","artist":"Cigarettes After Sex"}', emi));

  -- La reacción **se queda con la canción vieja** aunque la escucha cambie:
  -- es lo que hace que siga significando algo dentro de un mes.
  perform pg_temp.andamio(format(
    'update public.escuchas set track = %L::jsonb where user_id = %L',
    '{"videoId":"otra","title":"Cry","artist":"Cigarettes After Sex"}', emi));
  select * into v_fila from public.reacciones_escucha where id = v_id;
  if v_fila.track ->> 'videoId' <> 'abc' then
    raise exception 'FALLO: la reacción cambió de canción cuando cambió la escucha';
  end if;

  -- ── Verlas en el perfil ──────────────────────────────────────────────────
  -- El que la recibió las ve, firmadas.
  perform pg_temp.como(emi);
  select * into v_fila from public.reacciones_de(emi, 12);
  if v_fila.emoji <> '🔥' or v_fila.username <> 'ezeprueba' then
    raise exception 'FALLO: la reacción en el perfil llegó como % de %',
      v_fila.emoji, v_fila.username;
  end if;

  -- El contacto que la mandó también.
  perform pg_temp.como(eze);
  if (select count(*) from public.reacciones_de(emi, 12)) <> 1 then
    raise exception 'FALLO: el contacto no ve las reacciones del perfil';
  end if;

  -- Una desconocida no, mientras el perfil sea privado (el default).
  perform pg_temp.como(eva);
  if exists (select 1 from public.reacciones_de(emi, 12)) then
    raise exception 'FALLO: una desconocida ve las reacciones de un perfil privado';
  end if;

  -- Con el perfil público, sí: es lo mismo que hacen las vitrinas.
  perform pg_temp.andamio(format(
    'update public.profiles set visibility = ''publico'' where user_id = %L', emi));
  perform pg_temp.como(eva);
  if (select count(*) from public.reacciones_de(emi, 12)) <> 1 then
    raise exception 'FALLO: con el perfil público las reacciones siguen ocultas';
  end if;

  -- ── Bloqueo: como si no existiera ────────────────────────────────────────
  perform pg_temp.andamio(format(
    'insert into public.blocks (blocker, blocked) values (%L, %L)', emi, eze));

  perform pg_temp.como(eze);
  if exists (select 1 from public.escucha_de_contacto(emi)) then
    raise exception 'FALLO: un bloqueado sigue viendo la escucha';
  end if;
  perform pg_temp.debe_fallar(
    format('select public.reaccionar_escucha(%L, %L)', emi, '👀'),
    'tus contactos'
  );
  select count(*) into v_n from public.reacciones_de(emi, 12);
  if v_n <> 0 then
    raise exception 'FALLO: un bloqueado ve % reacciones del perfil', v_n;
  end if;
end;
$$;

reset role;

select 'REACCIONES OK: todas las pruebas pasaron' as resultado;

rollback;
