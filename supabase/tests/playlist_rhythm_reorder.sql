-- Ejecutar después de 20261002000000_playlist_rhythm_reorder.sql.
-- La transacción revierte todas las filas de prueba.
begin;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000e1', 'order-owner@flora.local', '{"provider":"google"}'),
  ('00000000-0000-4000-8000-0000000000e2', 'order-editor@flora.local', '{"provider":"google"}'),
  ('00000000-0000-4000-8000-0000000000e3', 'order-listener@flora.local', '{"provider":"google"}');
update app_private.access_accounts set status = 'approved' where user_id in (
  '00000000-0000-4000-8000-0000000000e1',
  '00000000-0000-4000-8000-0000000000e2',
  '00000000-0000-4000-8000-0000000000e3'
);

create function pg_temp.como(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.debe_fallar(query text, fragment text) returns void
language plpgsql as $$
declare failed boolean := false;
begin
  begin execute query;
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
  owner_id constant uuid := '00000000-0000-4000-8000-0000000000e1';
  editor_id constant uuid := '00000000-0000-4000-8000-0000000000e2';
  listener_id constant uuid := '00000000-0000-4000-8000-0000000000e3';
  playlist_id uuid;
  other_playlist_id uuid;
  empty_playlist_id uuid;
  a uuid;
  b uuid;
  c uuid;
  foreign_track uuid;
  mix public.playlist_mixes;
  edge public.playlist_mix_edges;
  result uuid[];
begin
  perform pg_temp.como(owner_id);
  insert into public.playlists (name, colaborativa) values ('Orden', true)
    returning id into playlist_id;
  insert into public.playlists (name) values ('Aparte') returning id into other_playlist_id;
  insert into public.playlists (name) values ('Vacía') returning id into empty_playlist_id;
  a := public.add_playlist_track(playlist_id, 'order-a', 'A', '', null, '', null, 'a.m4a', 60000, null);
  b := public.add_playlist_track(playlist_id, 'order-b', 'B', '', null, '', null, 'b.m4a', 60000, null);
  c := public.add_playlist_track(playlist_id, 'order-c', 'C', '', null, '', null, 'c.m4a', 60000, null);
  foreign_track := public.add_playlist_track(other_playlist_id, 'order-d', 'D', '', null, '', null, 'd.m4a', 60000, null);
  mix := public.create_playlist_mix(playlist_id, 'Mix', 'fade', 4000);
  edge := public.save_playlist_mix_edge(mix.id, a, b, null,
    'fade', 4000, 56000, 0, 'linear', null, null, null, null);

  result := public.reorder_playlist_tracks(empty_playlist_id, '{}'::uuid[], '{}'::uuid[]);
  if result <> '{}'::uuid[] then raise exception 'La lista vacía falló'; end if;
  update public.playlists set updated_at = '2020-01-01' where id = playlist_id;
  result := public.reorder_playlist_tracks(playlist_id, array[a,b,c], array[a,b,c]);
  if result <> array[a,b,c] or
    (select updated_at from public.playlists where id = playlist_id) <> '2020-01-01'::timestamptz then
    raise exception 'Un no-op alteró la lista';
  end if;

  result := public.reorder_playlist_tracks(playlist_id, array[a,b,c], array[c,a,b]);
  if result <> array[c,a,b] or
    (select array_agg(t.id order by t.position, t.id) from public.playlist_tracks t
      where t.playlist_id = fixture.playlist_id)
      <> array[c,a,b] then
    raise exception 'No se aplicó el orden propuesto';
  end if;
  if (select count(*) from public.playlist_tracks where id = any(array[a,b,c])) <> 3 or
    (select count(*) from public.playlist_mix_edges where id = edge.id
      and from_playlist_track_id = a and to_playlist_track_id = b) <> 1 then
    raise exception 'El reordenamiento cambió IDs o rompió edges';
  end if;
  perform pg_temp.debe_fallar(
    format('select public.reorder_playlist_tracks(%L,%L::uuid[],%L::uuid[])',
      playlist_id, array[a,b,c], array[b,c,a]), 'playlist_order_conflict');
  perform pg_temp.debe_fallar(
    format('select public.reorder_playlist_tracks(%L,%L::uuid[],%L::uuid[])',
      playlist_id, array[c,a,b], array[c,c,b]), 'playlist_order_invalid');
  perform pg_temp.debe_fallar(
    format('select public.reorder_playlist_tracks(%L,%L::uuid[],%L::uuid[])',
      playlist_id, array[c,a,b], array[c,a]), 'playlist_order_invalid');
  perform pg_temp.debe_fallar(
    format('select public.reorder_playlist_tracks(%L,%L::uuid[],%L::uuid[])',
      playlist_id, array[c,a,b], array[c,a,foreign_track]), 'playlist_order_invalid');

  perform pg_temp.como(listener_id);
  perform pg_temp.debe_fallar(
    format('select public.reorder_playlist_tracks(%L,%L::uuid[],%L::uuid[])',
      playlist_id, array[c,a,b], array[a,b,c]), 'No podés editar');
  perform pg_temp.como(editor_id);
  perform public.join_playlist(playlist_id);
  result := public.reorder_playlist_tracks(playlist_id, array[c,a,b], array[b,c,a]);
  if result <> array[b,c,a] then raise exception 'El colaborador no pudo reordenar'; end if;
  perform pg_temp.como(owner_id);
  if (select array_agg(t.id order by t.position, t.id) from public.playlist_tracks t
      where t.playlist_id = fixture.playlist_id) <> array[b,c,a] then
    raise exception 'El orden del colaborador no quedó guardado';
  end if;
end;
$$;

rollback;
