-- ═══════════════════════════════════════════════════════════════════════════
-- Pruebas de las listas colaborativas, contra el stack local de Docker.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/listas_colaborativas.sql
--
-- Todo corre adentro de UNA transacción que termina en ROLLBACK: las personas
-- de prueba y sus listas no dejan rastro.
--
-- Lo que se prueba es lo que da miedo: que un tercero no vea nada, que un
-- colaborador pueda escribir canciones pero no renombrar ni borrar la lista, y
-- que una lista que no es colaborativa no acepte a nadie por link.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000c1', 'caraprueba@flora.local', '{"provider":"google"}'),
  ('00000000-0000-4000-8000-0000000000c2', 'ciroprueba@flora.local', '{"provider":"google"}'),
  ('00000000-0000-4000-8000-0000000000c3', 'cukoprueba@flora.local', '{"provider":"google"}');
-- Trusted SQL fixture setup: real Google signups remain pending until approved.
update app_private.access_accounts set status='approved' where user_id in (
 '00000000-0000-4000-8000-0000000000c1',
 '00000000-0000-4000-8000-0000000000c2',
 '00000000-0000-4000-8000-0000000000c3');

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

/*
 * A partir de acá, `authenticated`.
 *
 * No es un detalle del andamiaje: `postgres` es dueño de las tablas y RLS
 * **no se le aplica** (ninguna tiene `force row level security`). Sin esta
 * línea, todas las pruebas de «esto no se puede» pasan por el motivo
 * equivocado — corren como superusuario y no hay policy que las mire.
 *
 * Los inserts en `auth.users` de arriba quedaron antes a propósito: esos sí
 * necesitan el rol privilegiado.
 */
set local role authenticated;

do $$
declare
  cara constant uuid := '00000000-0000-4000-8000-0000000000c1'; -- dueña
  ciro constant uuid := '00000000-0000-4000-8000-0000000000c2'; -- colaborador
  cuko constant uuid := '00000000-0000-4000-8000-0000000000c3'; -- ajeno
  v_colab uuid;
  v_sola  uuid;
  v_track uuid;
  v_fila  record;
  v_n     integer;
begin
  -- ── Dos listas de Cara: una colaborativa y una común ─────────────────────
  perform pg_temp.como(cara);
  insert into public.playlists (name, colaborativa) values ('La de todos', true)
    returning id into v_colab;
  insert into public.playlists (name) values ('La mía sola')
    returning id into v_sola;

  perform public.add_playlist_track(
    v_colab, 'v1', 'Uno', 'A', null, '', null, 'v1.m4a', 1000, null
  );

  -- ── Entrar por link ──────────────────────────────────────────────────────
  perform pg_temp.como(ciro);

  -- Una lista que no es colaborativa no suma a nadie, aunque tengas el id.
  perform pg_temp.debe_fallar(
    format('select public.join_playlist(%L)', v_sola),
    'no acepta colaboradores'
  );

  if public.join_playlist(v_colab) <> 'La de todos' then
    raise exception 'FALLO: join_playlist no devolvió el nombre';
  end if;

  -- Idempotente: volver a abrir el link no duplica ni rompe.
  perform public.join_playlist(v_colab);
  select count(*) into v_n from public.playlist_colaboradores
    where playlist_id = v_colab and user_id = ciro;
  if v_n <> 1 then
    raise exception 'FALLO: entrar dos veces dejó % filas', v_n;
  end if;

  -- ── Lo que puede el colaborador ──────────────────────────────────────────
  -- Ve la lista aunque sea privada.
  if not exists (select 1 from public.playlists where id = v_colab) then
    raise exception 'FALLO: el colaborador no ve la lista donde colabora';
  end if;

  -- Ve las canciones que ya estaban, y suma las suyas firmadas.
  if (select count(*) from public.playlist_tracks where playlist_id = v_colab) <> 1 then
    raise exception 'FALLO: el colaborador no ve las canciones de la lista';
  end if;

  v_track := public.add_playlist_track(
    v_colab, 'v2', 'Dos', 'B', null, '', null, 'v2.m4a', 2000, null
  );
  if v_track is null then
    raise exception 'FALLO: el colaborador no pudo agregar una canción';
  end if;
  if (select added_by from public.playlist_tracks where id = v_track) <> ciro then
    raise exception 'FALLO: added_by no quedó firmado por quien agregó';
  end if;

  -- Saca cualquier canción, no solo la suya: es la regla que elegimos.
  delete from public.playlist_tracks where playlist_id = v_colab and video_id = 'v1';
  if exists (select 1 from public.playlist_tracks where playlist_id = v_colab and video_id = 'v1') then
    raise exception 'FALLO: el colaborador no pudo sacar una canción ajena';
  end if;

  -- Pero la lista no es suya: no la renombra ni la borra.
  update public.playlists set name = 'Se la robo' where id = v_colab;
  if (select name from public.playlists where id = v_colab) <> 'La de todos' then
    raise exception 'FALLO: un colaborador pudo renombrar la lista';
  end if;

  delete from public.playlists where id = v_colab;
  if not exists (select 1 from public.playlists where id = v_colab) then
    raise exception 'FALLO: un colaborador pudo borrar la lista';
  end if;

  -- Y no suma gente: eso es del dueño.
  perform pg_temp.debe_fallar(
    format('select public.add_playlist_collaborator(%L, %L)', v_colab, cuko),
    'no es tuya'
  );

  -- La lista le aparece en la biblioteca, marcada como ajena.
  select * into v_fila from public.list_my_playlists() where id = v_colab;
  if v_fila is null then
    raise exception 'FALLO: la colaborativa no aparece en la biblioteca del colaborador';
  end if;
  if v_fila.mia is not false or v_fila.colaborativa is not true then
    raise exception 'FALLO: la fila del colaborador dice mia=% colaborativa=%',
      v_fila.mia, v_fila.colaborativa;
  end if;

  -- ── Lo que ve un tercero: nada ───────────────────────────────────────────
  perform pg_temp.como(cuko);
  if exists (select 1 from public.playlists where id = v_colab) then
    raise exception 'FALLO: RLS deja ver una lista colaborativa ajena';
  end if;
  if exists (select 1 from public.playlist_tracks where playlist_id = v_colab) then
    raise exception 'FALLO: RLS deja ver las canciones de una colaborativa ajena';
  end if;
  if exists (select 1 from public.list_my_playlists() where id = v_colab) then
    raise exception 'FALLO: la colaborativa ajena aparece en la biblioteca de un tercero';
  end if;
  perform pg_temp.debe_fallar(
    format('select public.add_playlist_track(%L, %L, %L, %L, null, %L, null, %L, 0, null)',
           v_colab, 'v9', 'Nueve', 'C', '', 'v9.m4a'),
    'no existe'
  );

  -- ── Lo que puede la dueña ────────────────────────────────────────────────
  perform pg_temp.como(cara);

  select * into v_fila from public.list_my_playlists() where id = v_colab;
  if v_fila.mia is not true or v_fila.colaboradores <> 1 then
    raise exception 'FALLO: la dueña ve mia=% con % colaboradores',
      v_fila.mia, v_fila.colaboradores;
  end if;

  if (select count(*) from public.list_playlist_collaborators(v_colab)) <> 2 then
    raise exception 'FALLO: la gente de la lista no son dos (dueña + colaborador)';
  end if;

  perform public.add_playlist_collaborator(v_colab, cuko);
  if (select count(*) from public.list_playlist_collaborators(v_colab)) <> 3 then
    raise exception 'FALLO: la dueña no pudo sumar a alguien a mano';
  end if;

  -- Y saca a quien quiera.
  perform public.remove_playlist_collaborator(v_colab, cuko);
  if exists (
    select 1 from public.playlist_colaboradores where playlist_id = v_colab and user_id = cuko
  ) then
    raise exception 'FALLO: la dueña no pudo sacar a un colaborador';
  end if;

  -- ── Irse solo ────────────────────────────────────────────────────────────
  perform pg_temp.como(ciro);
  perform public.remove_playlist_collaborator(v_colab, ciro);
  if exists (select 1 from public.list_my_playlists() where id = v_colab) then
    raise exception 'FALLO: la lista sigue en la biblioteca de quien se fue';
  end if;

  -- Lo que agregó se queda: irse no es deshacer.
  perform pg_temp.como(cara);
  if not exists (
    select 1 from public.playlist_tracks where playlist_id = v_colab and video_id = 'v2'
  ) then
    raise exception 'FALLO: irse borró las canciones que había agregado';
  end if;

  -- ── Sacar a un tercero sin ser dueño ─────────────────────────────────────
  perform public.add_playlist_collaborator(v_colab, ciro);
  perform public.add_playlist_collaborator(v_colab, cuko);
  perform pg_temp.como(ciro);
  perform pg_temp.debe_fallar(
    format('select public.remove_playlist_collaborator(%L, %L)', v_colab, cuko),
    'No podés sacar'
  );
end;
$$;

reset role;

select 'LISTAS COLABORATIVAS OK: todas las pruebas pasaron' as resultado;

rollback;
