-- Reordenar filas existentes conserva sus IDs y, por lo tanto, las referencias
-- de playlist_mix_edges. La versión esperada es el orden completo, no un timestamp:
-- otros clientes pueden agregar, borrar o mover canciones mientras se analiza.
create or replace function public.reorder_playlist_tracks(
  p_playlist uuid,
  p_expected_order uuid[],
  p_new_order uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_order uuid[];
  expected_set uuid[];
  proposed_set uuid[];
begin
  if p_playlist is null or p_expected_order is null or p_new_order is null then
    raise exception 'playlist_order_invalid';
  end if;
  if not public.puede_editar_lista(p_playlist) then
    raise exception 'No podés editar esta lista';
  end if;

  -- Se toman primero las canciones en orden fijo: borrar/editar una canción
  -- toma su lock antes de que el trigger toque la playlist. Invertir ese orden
  -- aquí podría bloquearse mutuamente con un borrado concurrente.
  perform 1 from public.playlist_tracks t
    where t.playlist_id = p_playlist order by t.id for update;
  -- El trigger de playlist_tracks también escribe esta fila. El candado hace
  -- que dos reordenamientos se comparen uno detrás de otro y serializa el
  -- cambio de contenido con el check de orden.
  perform 1 from public.playlists p where p.id = p_playlist for update;
  if not found or not public.puede_editar_lista(p_playlist) then
    raise exception 'No podés editar esta lista';
  end if;

  select coalesce(array_agg(t.id order by t.position, t.id), '{}'::uuid[])
    into current_order
  from public.playlist_tracks t where t.playlist_id = p_playlist;
  if p_expected_order is distinct from current_order then
    raise exception 'playlist_order_conflict';
  end if;

  if cardinality(p_new_order) <> cardinality(current_order)
    or cardinality(p_new_order) > 214748364 then
    raise exception 'playlist_order_invalid';
  end if;
  select coalesce(array_agg(id order by id nulls first), '{}'::uuid[])
    into expected_set from unnest(current_order) as expected(id);
  select coalesce(array_agg(id order by id nulls first), '{}'::uuid[])
    into proposed_set from unnest(p_new_order) as proposed(id);
  if proposed_set is distinct from expected_set then
    raise exception 'playlist_order_invalid';
  end if;

  if p_new_order = current_order then return current_order; end if;
  update public.playlist_tracks t
    set position = (proposed.ordinality * 10)::integer
  from unnest(p_new_order) with ordinality as proposed(id, ordinality)
  where t.playlist_id = p_playlist and t.id = proposed.id
    and t.position is distinct from (proposed.ordinality * 10)::integer;

  return p_new_order;
end;
$$;

revoke all on function public.reorder_playlist_tracks(uuid, uuid[], uuid[]) from public;
grant execute on function public.reorder_playlist_tracks(uuid, uuid[], uuid[]) to authenticated;
