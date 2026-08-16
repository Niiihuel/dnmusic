/*
 * Más piezas para el perfil: tres tipos de vitrina y el marco del avatar.
 *
 * Los tipos nuevos —artista, álbum, un verso de una letra— siguen la regla de
 * siempre: el contenido va **desnormalizado** en el payload (nombre, foto,
 * tapa, texto), así la vitrina sigue diciendo lo suyo aunque YouTube cambie un
 * id o la fuente desaparezca. La base solo garantiza tipo y dueño; la forma
 * del payload la valida el único módulo que escribe (`services/showcases`).
 *
 * El **marco** es una decoración dibujada alrededor de la foto de perfil — la
 * idea de las decoraciones de Discord y de los marcos de Steam, pero dibujada
 * por la app (SVG + animación) en vez de un asset subido: no hay archivo que
 * hospedar, pesa cero, y respeta la paleta acromática del sistema de diseño.
 * En la base es solo **un nombre**: qué se dibuja con ese nombre vive en el
 * cliente (`src/ui/Marco.tsx`), y un nombre que el cliente no conozca se dibuja
 * como ninguno — un perfil editado por una versión más nueva no rompe a la
 * vieja.
 */

alter table public.profile_showcases drop constraint if exists profile_showcases_kind_check;
alter table public.profile_showcases
  add constraint profile_showcases_kind_check
  check (kind in (
    'cancion', 'fragmento', 'lista', 'texto', 'imagen', 'ilustracion',
    'artista', 'album', 'letra'
  ));

/* Un nombre corto y nada más. Sin check de valores: la lista de marcos crece
   en el cliente y un constraint acá obligaría a una migración por marco. */
alter table public.profiles
  add column if not exists marco text
    check (marco is null or length(marco) between 1 and 40);

/*
 * Las tres funciones de perfil, recreadas con `marco`.
 *
 * El mismo baile que con el encuadre, y por lo mismo: cambia el tipo de
 * retorno y las tres tienen que contar lo mismo. La lógica no se toca.
 */

drop function if exists public.get_my_profile();
create function public.get_my_profile()
returns table (
  user_id         uuid,
  username        text,
  display_name    text,
  avatar_path     text,
  bio             text,
  banner_path     text,
  created_at      timestamptz,
  visibility      text,
  avatar_encuadre jsonb,
  banner_encuadre jsonb,
  marco           text
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p.user_id, p.username, p.display_name, p.avatar_path, p.bio,
         p.banner_path, p.created_at, p.visibility,
         p.avatar_encuadre, p.banner_encuadre, p.marco
  from public.profiles p
  where p.user_id = auth.uid();
$$;

drop function if exists public.get_profile(text);
create function public.get_profile(p_username text)
returns table (
  user_id         uuid,
  username        text,
  display_name    text,
  avatar_path     text,
  bio             text,
  banner_path     text,
  created_at      timestamptz,
  avatar_encuadre jsonb,
  banner_encuadre jsonb,
  marco           text
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p.user_id, p.username, p.display_name, p.avatar_path, p.bio,
         p.banner_path, p.created_at,
         p.avatar_encuadre, p.banner_encuadre, p.marco
  from public.profiles p
  where p.username = lower(btrim(p_username))
    and (p.user_id = auth.uid() or p.visibility = 'publico');
$$;

/* `p_marco`: null no toca, la cadena vacía borra — la convención de los textos
   de esta función desde el primer día. */
drop function if exists public.update_my_profile(text, text, text, text, text, text, jsonb, jsonb);
create function public.update_my_profile(
  p_username        text default null,
  p_display_name    text default null,
  p_avatar_path     text default null,
  p_bio             text default null,
  p_banner_path     text default null,
  p_visibility      text default null,
  p_avatar_encuadre jsonb default null,
  p_banner_encuadre jsonb default null,
  p_marco           text default null
)
returns table (
  user_id         uuid,
  username        text,
  display_name    text,
  avatar_path     text,
  bio             text,
  banner_path     text,
  created_at      timestamptz,
  visibility      text,
  avatar_encuadre jsonb,
  banner_encuadre jsonb,
  marco           text
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

  if p_visibility is not null and p_visibility not in ('publico', 'privado') then
    raise exception 'visibilidad_invalida' using errcode = 'check_violation';
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
      visibility   = coalesce(p_visibility, p.visibility),
      avatar_encuadre = case
                          when p_avatar_encuadre is null then p.avatar_encuadre
                          when jsonb_typeof(p_avatar_encuadre) <> 'object' then null
                          else p_avatar_encuadre
                        end,
      banner_encuadre = case
                          when p_banner_encuadre is null then p.banner_encuadre
                          when jsonb_typeof(p_banner_encuadre) <> 'object' then null
                          else p_banner_encuadre
                        end,
      marco        = case
                       when p_marco is null then p.marco
                       when btrim(p_marco) = '' then null
                       else btrim(p_marco)
                     end,
      updated_at   = now()
  where p.user_id = me;

  return query
    select p.user_id, p.username, p.display_name, p.avatar_path, p.bio, p.banner_path,
           p.created_at, p.visibility, p.avatar_encuadre, p.banner_encuadre, p.marco
    from public.profiles p
    where p.user_id = me;
end;
$$;

revoke all on function public.get_my_profile() from public;
revoke all on function public.get_profile(text) from public;
revoke all on function public.update_my_profile(text, text, text, text, text, text, jsonb, jsonb, text) from public;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.get_profile(text) to authenticated;
grant execute on function public.update_my_profile(text, text, text, text, text, text, jsonb, jsonb, text) to authenticated;
