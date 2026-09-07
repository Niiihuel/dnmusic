-- Autores de una reacción: misma visibilidad que la pieza y sin exponer
-- cuentas bloqueadas. La tabla profiles continúa sin lectura directa.
create or replace function public.autores_reaccion_vitrina(
  p_showcase uuid, p_emoji text, p_offset integer default 0
)
returns table (user_id uuid, username text, display_name text, avatar_path text)
language sql security definer stable set search_path = public, pg_temp
as $$
  select p.user_id, p.username, p.display_name, p.avatar_path
  from public.reacciones_vitrina r
  join public.profiles p on p.user_id = r.de
  where auth.uid() is not null
    and r.showcase_id = p_showcase and r.emoji = p_emoji
    and public.vitrina_visible(p_showcase)
    and not public.hay_bloqueo(auth.uid(), r.de)
  order by r.created_at desc, r.id
  limit 50 offset greatest(0, coalesce(p_offset, 0));
$$;
revoke all on function public.autores_reaccion_vitrina(uuid, text, integer) from public;
grant execute on function public.autores_reaccion_vitrina(uuid, text, integer) to authenticated;
