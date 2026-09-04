/*
 * El mosaico se estiliza: tema y fondo por vitrina, tema del perfil, y dos
 * piezas de composición.
 *
 * Es la idea del «Space» de Airbuds: cada pieza del perfil se puede vestir —un
 * tema de color, una imagen detrás— y el perfil entero tiene un tema propio
 * que las piezas heredan salvo que digan otra cosa. Hasta acá todas las
 * vitrinas eran del mismo vidrio, y un perfil se distinguía de otro solo por
 * lo que fijaba, nunca por cómo lo mostraba.
 *
 * **`estilo` va en su propia columna y no adentro de `payload`.** El payload
 * es *qué* muestra la vitrina —la canción, el artista, el texto— y el estilo
 * es *cómo*: son dos cosas que cambian por caminos distintos (elegir otra
 * canción no toca el tema; cambiar el tema no toca la canción) y mezclarlas en
 * un JSON obligaría a reescribir el uno para tocar el otro. Su forma la valida
 * el cliente (`services/showcases`), como la del payload.
 *
 * Los dos tipos nuevos no son música: `encabezado` es un título que separa una
 * zona del mosaico de otra («Canciones fav», «Mis artistas») y `espaciador` es
 * aire a propósito. Sin ellos, todo perfil era una sola grilla sin capítulos.
 *
 * Sobre el color: `docs/DESIGN.md` mantiene a la **interfaz** acromática, y
 * eso no cambia — los botones, las hojas y las barras de este editor siguen en
 * grises. Lo que se colorea es el perfil de cada quien, que es contenido suyo
 * como lo son su foto y su fondo: es la misma regla por la que una tapa aporta
 * su color y por la que el fondo puede ser cualquier imagen.
 */

alter table public.profile_showcases
  add column if not exists estilo jsonb not null default '{}'::jsonb;

alter table public.profile_showcases drop constraint if exists profile_showcases_kind_check;
alter table public.profile_showcases
  add constraint profile_showcases_kind_check
  check (kind in (
    'cancion', 'fragmento', 'lista', 'texto', 'imagen', 'ilustracion',
    'artista', 'album', 'letra', 'encabezado', 'espaciador'
  ));

/*
 * El tema del perfil entero. JSON y no un nombre: un tema puede ser un preset
 * (`{"id":"negro"}`) o un color elegido a mano (`{"id":"color","color":"#…"}`),
 * y el cliente es quien sabe qué dibuja cada uno. Uno que no conozca se dibuja
 * como ninguno, así un perfil editado por una versión más nueva no rompe a la
 * vieja — el mismo criterio que el marco.
 */
alter table public.profiles
  add column if not exists tema jsonb;

/*
 * Las tres funciones del perfil, recreadas con `tema`.
 *
 * El mismo baile que con el encuadre y el marco, y por lo mismo: cambia el
 * tipo de retorno y las tres tienen que contar lo mismo. La lógica no se toca.
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
  marco           text,
  tema            jsonb
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p.user_id, p.username, p.display_name, p.avatar_path, p.bio,
         p.banner_path, p.created_at, p.visibility,
         p.avatar_encuadre, p.banner_encuadre, p.marco, p.tema
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
  marco           text,
  tema            jsonb
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p.user_id, p.username, p.display_name, p.avatar_path, p.bio,
         p.banner_path, p.created_at,
         p.avatar_encuadre, p.banner_encuadre, p.marco, p.tema
  from public.profiles p
  where p.username = lower(btrim(p_username))
    and (p.user_id = auth.uid() or p.visibility = 'publico');
$$;

/* `p_tema`: null no toca; cualquier cosa que no sea un objeto borra — la
   convención de los encuadres, que son los otros JSON de esta función. */
drop function if exists public.update_my_profile(text, text, text, text, text, text, jsonb, jsonb, text);
create function public.update_my_profile(
  p_username        text default null,
  p_display_name    text default null,
  p_avatar_path     text default null,
  p_bio             text default null,
  p_banner_path     text default null,
  p_visibility      text default null,
  p_avatar_encuadre jsonb default null,
  p_banner_encuadre jsonb default null,
  p_marco           text default null,
  p_tema            jsonb default null
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
  marco           text,
  tema            jsonb
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
      tema         = case
                       when p_tema is null then p.tema
                       when jsonb_typeof(p_tema) <> 'object' then null
                       else p_tema
                     end,
      updated_at   = now()
  where p.user_id = me;

  return query
    select p.user_id, p.username, p.display_name, p.avatar_path, p.bio, p.banner_path,
           p.created_at, p.visibility, p.avatar_encuadre, p.banner_encuadre, p.marco, p.tema
    from public.profiles p
    where p.user_id = me;
end;
$$;

revoke all on function public.get_my_profile() from public;
revoke all on function public.get_profile(text) from public;
revoke all on function public.update_my_profile(text, text, text, text, text, text, jsonb, jsonb, text, jsonb) from public;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.get_profile(text) to authenticated;
grant execute on function public.update_my_profile(text, text, text, text, text, text, jsonb, jsonb, text, jsonb) to authenticated;
