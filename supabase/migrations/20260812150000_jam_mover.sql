-- ═══════════════════════════════════════════════════════════════════════════
-- Reordenar la cola del Jam: mover un ítem a otro lugar de la fila.
--
-- Es el «cuando exista» que anticipa el comentario de `jam_queue.posicion`:
-- la columna es numeric justamente para que mover sea tocar UNA fila — la
-- posición nueva es el punto medio entre las dos vecinas, (a+b)/2 — y no
-- renumerar la cola entera dentro del lock.
--
-- El cliente dice el destino con un id, no con un número: «ponela después de
-- tal ítem» (`p_tras`), o al frente de la fila si `p_tras` es null. Un índice
-- numérico sería relativo a la cola QUE VIO el cliente, que puede estar vieja;
-- un id significa lo mismo en cualquier revisión, y si el ítem de referencia
-- ya no está, el pedido falla entero en vez de caer en un lugar al azar.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.jam_mover(
  p_jam_id uuid,
  p_item_id uuid,
  p_tras uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  v public.jams := public.jam_abrir(p_jam_id);
  v_ancla numeric;
  v_sig numeric;
  v_nueva numeric;
begin
  -- Reordenar es editar la fila: el mismo permiso que agregar. Quien puede
  -- sumar canciones puede acomodarlas; quitar sigue con su regla propia.
  perform public.jam_autorizado(v, me, 'agregar');

  if p_item_id = p_tras then
    raise exception 'Esa canción ya está ahí';
  end if;
  if not exists (
    select 1 from public.jam_queue where id = p_item_id and jam_id = p_jam_id
  ) then
    raise exception 'Esa canción no está en el Jam';
  end if;

  if p_tras is null then
    -- Al frente de la fila: antes que todo lo demás.
    select min(posicion) - 1 into v_nueva
    from public.jam_queue
    where jam_id = p_jam_id and id <> p_item_id;
    if v_nueva is null then
      return; -- Es el único ítem: no hay nada que mover.
    end if;
  else
    select posicion into v_ancla
    from public.jam_queue
    where id = p_tras and jam_id = p_jam_id;
    if v_ancla is null then
      -- La referencia se fue entre que el cliente miró y pidió: mejor no
      -- adivinar un destino; el refetch del cliente lo acomoda.
      raise exception 'Esa canción no está en el Jam';
    end if;
    select min(posicion) into v_sig
    from public.jam_queue
    where jam_id = p_jam_id and posicion > v_ancla and id <> p_item_id;
    v_nueva := case when v_sig is null then v_ancla + 1 else (v_ancla + v_sig) / 2 end;
  end if;

  update public.jam_queue set posicion = v_nueva where id = p_item_id;
  update public.jams
  set revision = revision + 1, expires_at = now() + interval '6 hours'
  where id = p_jam_id;
end;
$$;

revoke all on function public.jam_mover(uuid, uuid, uuid) from public;
grant execute on function public.jam_mover(uuid, uuid, uuid) to authenticated;
