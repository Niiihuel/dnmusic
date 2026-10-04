-- psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--   -v ON_ERROR_STOP=1 -f supabase/tests/playlist_mixes.sql
-- Ejecutar después de la migración; los datos de prueba se revierten.
begin;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000d1', 'mix-owner@flora.local', '{"provider":"google"}'),
  ('00000000-0000-4000-8000-0000000000d2', 'mix-editor@flora.local', '{"provider":"google"}'),
  ('00000000-0000-4000-8000-0000000000d3', 'mix-listener@flora.local', '{"provider":"google"}');
update app_private.access_accounts set status = 'approved' where user_id in (
  '00000000-0000-4000-8000-0000000000d1',
  '00000000-0000-4000-8000-0000000000d2',
  '00000000-0000-4000-8000-0000000000d3'
);

create function pg_temp.como(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.debe_fallar(query text, fragment text) returns void
language plpgsql as $$
declare failed boolean := false;
begin
  begin
    execute query;
  exception when others then
    if position(fragment in sqlerrm) = 0 then
      raise exception 'Error inesperado: %, se esperaba %', sqlerrm, fragment;
    end if;
    failed := true;
  end;
  if not failed then raise exception 'Debía fallar: %', query; end if;
end;
$$;

set local role authenticated;

do $$
<<fixture>>
declare
  owner_id constant uuid := '00000000-0000-4000-8000-0000000000d1';
  editor_id constant uuid := '00000000-0000-4000-8000-0000000000d2';
  listener_id constant uuid := '00000000-0000-4000-8000-0000000000d3';
  playlist_id uuid;
  other_playlist_id uuid;
  copied_playlist_id uuid;
  a uuid;
  b uuid;
  foreign_track uuid;
  own_mix public.playlist_mixes;
  editor_mix public.playlist_mixes;
  copied_mix public.playlist_mixes;
  edge public.playlist_mix_edges;
  profile public.playlist_sound_profiles;
  v_count integer;
begin
  perform pg_temp.como(owner_id);
  insert into public.playlists (name, colaborativa) values ('Mix test', true)
    returning id into playlist_id;
  insert into public.playlists (name) values ('Otra lista')
    returning id into other_playlist_id;
  a := public.add_playlist_track(playlist_id, 'mix-a', 'A', '', null, '', null, 'a.m4a', 60000, null);
  b := public.add_playlist_track(playlist_id, 'mix-b', 'B', '', null, '', null, 'b.m4a', 60000, null);
  foreign_track := public.add_playlist_track(other_playlist_id, 'mix-c', 'C', '', null, '', null, 'c.m4a', 60000, null);

  own_mix := public.create_playlist_mix(playlist_id, 'Auto', 'auto', 4000);
  if own_mix.creator_id <> owner_id or own_mix.revision <> 1 then
    raise exception 'El mix nuevo no conserva autor y revisión';
  end if;
  perform pg_temp.debe_fallar(
    format('insert into public.playlist_mixes (playlist_id, name) values (%L, %L)', playlist_id, 'sin RPC'),
    'permission denied'
  );

  edge := public.save_playlist_mix_edge(own_mix.id, a, b, null,
    'fade', 4000, 56000, 0, 'equal_power',
    '[{"t":0,"value":1},{"t":1,"value":0}]',
    '[{"t":0,"value":0},{"t":1,"value":1}]', null, null);
  if edge.revision <> 1 or edge.from_playlist_track_id <> a then
    raise exception 'La transición no guardó los IDs de fila';
  end if;
  perform pg_temp.debe_fallar(
    format('select public.save_playlist_mix_edge(%L,%L,%L,1,%L,4000,56000,0,%L,null,null,null,null)',
      own_mix.id, a, foreign_track, 'fade', 'linear'),
    'Las canciones deben pertenecer'
  );
  perform pg_temp.debe_fallar(
    format('select public.save_playlist_mix_edge(%L,%L,%L,0,%L,4000,56000,0,%L,null,null,null,null)',
      own_mix.id, a, b, 'fade', 'linear'),
    'mix_edge_revision_conflict'
  );
  perform pg_temp.debe_fallar(
    format('select public.save_playlist_mix_edge(%L,%L,%L,1,%L,4000,56000,0,%L,%L,null,null,null)',
      own_mix.id, a, b, 'fade', 'linear',
      '[{"t":0,"value":1},{"t":0.5,"value":2},{"t":1,"value":0}]'),
    'violates check constraint'
  );
  perform pg_temp.debe_fallar(
    format('select public.save_playlist_mix_edge(%L,%L,%L,1,%L,4000,59000,0,%L,null,null,null,null)',
      own_mix.id, a, b, 'fade', 'linear'),
    'La transición excede la canción'
  );

  -- Un colaborador puede crear su propia variante, pero sigue siendo privada.
  perform pg_temp.como(editor_id);
  perform public.join_playlist(playlist_id);
  editor_mix := public.create_playlist_mix(playlist_id, 'Mi versión', 'fusion', 8000);
  if exists (select 1 from public.playlist_mixes where id = own_mix.id) then
    raise exception 'Un colaborador pudo leer el borrador privado del dueño';
  end if;
  perform pg_temp.como(owner_id);
  if exists (select 1 from public.playlist_mixes where id = editor_mix.id) then
    raise exception 'El dueño pudo leer el borrador privado del colaborador';
  end if;
  perform pg_temp.debe_fallar(
    format('select public.publish_playlist_mix(%L,%L,true)', playlist_id, editor_mix.id),
    'Mix no disponible para publicar'
  );
  perform pg_temp.como(editor_id);
  perform pg_temp.debe_fallar(
    format('select public.save_playlist_mix_edge(%L,%L,%L,null,%L,4000,null,null,%L,null,null,null,null)',
      own_mix.id, a, b, 'fade', 'linear'),
    'No podés editar este mix'
  );
  editor_mix := public.update_playlist_mix(editor_mix.id, 1, 'Mi versión', 'shared', 'fusion', 8000);
  if editor_mix.revision <> 2 then raise exception 'No se incrementó la revisión del mix'; end if;
  if public.valid_mix_filter('{}'::jsonb)
    or public.valid_mix_eq('{"version":1,"enabled":true}'::jsonb) then
    raise exception 'Un parámetro de DSP incompleto pasó la validación';
  end if;
  perform pg_temp.debe_fallar(
    format('select public.update_playlist_mix(%L,1,%L,%L,%L,8000)',
      editor_mix.id, 'Viejita', 'shared', 'fusion'),
    'mix_revision_conflict'
  );

  -- El dueño publica en una operación; un colaborador no puede hacerlo.
  perform pg_temp.debe_fallar(
    format('select public.publish_playlist_mix(%L,%L,true)', playlist_id, editor_mix.id),
    'Solo el dueño'
  );
  perform pg_temp.como(owner_id);
  if not exists (select 1 from public.playlist_mixes where id = editor_mix.id) then
    raise exception 'El dueño no puede ver una variante compartida';
  end if;
  copied_mix := public.duplicate_playlist_mix(own_mix.id, 'Copia');
  select count(*) into v_count from public.playlist_mix_edges where mix_id = copied_mix.id;
  if v_count <> 1 then raise exception 'Duplicar no copió la transición'; end if;
  if copied_mix.creator_id <> owner_id then raise exception 'Duplicar conservó al creador viejo'; end if;

  perform public.publish_playlist_mix(playlist_id, editor_mix.id, true);
  if (select published_mix_id from public.playlists where id = playlist_id) <> editor_mix.id
    or (select mix_enabled from public.playlists where id = playlist_id) is not true then
    raise exception 'La publicación no quedó activa';
  end if;
  perform public.publish_playlist_mix(playlist_id, editor_mix.id, false);
  if (select published_mix_id from public.playlists where id = playlist_id) <> editor_mix.id then
    raise exception 'Apagar Mix borró el publicado';
  end if;
  perform public.publish_playlist_mix(playlist_id, editor_mix.id, true);
  update public.playlists set visibilidad = 'publica' where id = playlist_id;

  profile := public.save_playlist_sound_profile(playlist_id, null,
    '[0,0,0,0,0,0,0,0,0,0]', -3);
  if profile.revision <> 1 or profile.published then
    raise exception 'El sonido no nació como borrador';
  end if;
  profile := public.publish_playlist_sound_profile(playlist_id, true);
  if profile.revision <> 2 then raise exception 'Publicar sonido no avanzó la revisión'; end if;
  perform pg_temp.debe_fallar(
    format('select public.save_playlist_sound_profile(%L,1,%L,0)',
      playlist_id, '[0,0,0,0,0,0,0,0,0,0]'),
    'sound_profile_revision_conflict'
  );

  -- Cualquier oyente de la playlist pública solo ve el mix publicado.
  perform pg_temp.como(listener_id);
  select count(*) into v_count from public.playlist_mixes
    where playlist_mixes.playlist_id = fixture.playlist_id;
  if v_count <> 1 then raise exception 'Oyente ve % mixes (esperado: 1)', v_count; end if;
  if exists (select 1 from public.playlist_mixes where id = own_mix.id) then
    raise exception 'Oyente leyó borrador privado';
  end if;
  if not exists (select 1 from public.playlist_sound_profiles
    where playlist_sound_profiles.playlist_id = fixture.playlist_id) then
    raise exception 'Oyente no ve el sonido publicado';
  end if;
  perform public.set_playlist_mix_choice(playlist_id, 'selected', editor_mix.id);
  if (select mode from public.user_playlist_mix_choices
    where user_id = listener_id and user_playlist_mix_choices.playlist_id = fixture.playlist_id) <> 'selected' then
    raise exception 'No quedó guardada la elección personal';
  end if;
  perform public.set_playlist_mix_choice(playlist_id, 'off', null);
  perform pg_temp.debe_fallar(
    format('select public.set_playlist_mix_choice(%L,%L,%L)',
      playlist_id, 'selected', own_mix.id),
    'Mix no disponible'
  );
  perform pg_temp.debe_fallar(
    format('select public.create_playlist_mix(%L,%L)', playlist_id, 'intruso'),
    'No podés editar'
  );
  perform pg_temp.debe_fallar(
    format('select public.publish_playlist_mix(%L,%L,true)', playlist_id, own_mix.id),
    'Solo el dueño'
  );

  -- Editar el publicado pertenece al dueño; la variante propia no se pierde.
  perform pg_temp.como(editor_id);
  perform pg_temp.debe_fallar(
    format('select public.update_playlist_mix(%L,2,%L,%L,%L,8000)',
      editor_mix.id, 'Cambio sin publicar', 'shared', 'fusion'),
    'Solo el dueño puede editar el mix publicado'
  );
  perform pg_temp.como(owner_id);
  perform public.publish_playlist_mix(playlist_id, own_mix.id, true);
  perform pg_temp.como(listener_id);
  copied_playlist_id := public.copy_playlist(playlist_id);
  if (select published_mix_id from public.playlists where id = copied_playlist_id) is null
    or (select mix_enabled from public.playlists where id = copied_playlist_id) is not true then
    raise exception 'Copiar la lista perdió el Mix publicado';
  end if;
  if (select count(*) from public.playlist_mix_edges e
      join public.playlist_mixes m on m.id = e.mix_id
      where m.playlist_id = copied_playlist_id) <> 1 then
    raise exception 'Copiar la lista perdió una transición';
  end if;
  if exists (select 1 from public.playlist_mix_edges e
      join public.playlist_mixes m on m.id = e.mix_id
      where m.playlist_id = copied_playlist_id
        and (e.from_playlist_track_id = a or e.to_playlist_track_id = b)) then
    raise exception 'La copia conservó IDs de canciones de la lista original';
  end if;
  if not exists (select 1 from public.playlist_sound_profiles
      where playlist_sound_profiles.playlist_id = copied_playlist_id and published) then
    raise exception 'Copiar la lista perdió el sonido publicado';
  end if;

  perform pg_temp.como(owner_id);
  perform public.publish_playlist_mix(playlist_id, editor_mix.id, true);
  delete from public.playlist_tracks where id = b;
  if exists (select 1 from public.playlist_mix_edges where to_playlist_track_id = b) then
    raise exception 'Al borrar una canción quedaron transiciones huérfanas';
  end if;
  if not public.delete_playlist_mix(editor_mix.id) then
    raise exception 'El dueño no pudo borrar el publicado';
  end if;
  if (select published_mix_id from public.playlists where id = playlist_id) is not null
    or (select mix_enabled from public.playlists where id = playlist_id) is not false then
    raise exception 'Borrar el publicado dejó Mix activo sin versión';
  end if;
end;
$$;

reset role;
select 'PLAYLIST MIXES OK' as resultado;
rollback;
