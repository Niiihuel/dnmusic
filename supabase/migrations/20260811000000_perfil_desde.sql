/*
 * El perfil devuelve desde cuándo existe.
 *
 * `profiles.created_at` estaba desde el principio pero nunca salía de la base:
 * `get_my_profile` devuelve solo lo que la app pide, y hasta ahora no lo pedía.
 * El resumen del perfil lo necesita, y es el único número que dice algo de
 * verdad desde el primer día — todos los demás (minutos, artistas) necesitan un
 * historial de escuchas que todavía no llevamos.
 */
drop function if exists public.get_my_profile();
create function public.get_my_profile()
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_path text,
  bio text,
  banner_path text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.user_id, p.username, p.display_name, p.avatar_path, p.bio, p.banner_path, p.created_at
  from public.profiles p
  where p.user_id = auth.uid();
$$;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;

/*
 * El guardado también la devuelve.
 *
 * `saveMyProfile` pisa el perfil en memoria con lo que responde esta función.
 * Si acá faltara `created_at`, editar el nombre haría desaparecer el «miembro
 * desde» hasta el próximo arranque — el clásico campo que se pierde porque dos
 * funciones que devuelven lo mismo no devuelven lo mismo.
 */
drop function if exists public.update_my_profile(text, text, text, text, text);
create function public.update_my_profile(
  p_username text default null,
  p_display_name text default null,
  p_avatar_path text default null,
  p_bio text default null,
  p_banner_path text default null
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_path text,
  bio text,
  banner_path text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  next_username text;
begin
  if me is null then raise exception 'Sesión requerida'; end if;

  if p_username is not null then
    next_username := lower(btrim(p_username));
    if not public.is_valid_username(next_username) then
      raise exception 'usuario_invalido' using errcode = 'check_violation';
    end if;
  end if;

  update public.profiles p
  set username     = coalesce(next_username, p.username),
      display_name = case
                       when p_display_name is null then p.display_name
                       when btrim(p_display_name) = '' then null
                       else btrim(p_display_name)
                     end,
      avatar_path  = case
                       when p_avatar_path is null then p.avatar_path
                       when btrim(p_avatar_path) = '' then null
                       else btrim(p_avatar_path)
                     end,
      bio          = case
                       when p_bio is null then p.bio
                       when btrim(p_bio) = '' then null
                       else btrim(p_bio)
                     end,
      banner_path  = case
                       when p_banner_path is null then p.banner_path
                       when btrim(p_banner_path) = '' then null
                       else btrim(p_banner_path)
                     end,
      updated_at   = now()
  where p.user_id = me;

  return query
    select p.user_id, p.username, p.display_name, p.avatar_path, p.bio, p.banner_path, p.created_at
    from public.profiles p
    where p.user_id = me;
end;
$$;

revoke all on function public.update_my_profile(text, text, text, text, text) from public;
grant execute on function public.update_my_profile(text, text, text, text, text) to authenticated;
