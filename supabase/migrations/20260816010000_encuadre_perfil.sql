/*
 * El encuadre de la foto y del fondo.
 *
 * Recortar una imagen se hace, casi siempre, **rehaciéndola**: se genera un
 * archivo nuevo con el pedazo elegido. Acá no, y la razón es concreta: eso
 * aplasta los GIF. El recortador del sistema en iOS —`allowsEditing: true` en
 * el selector— devuelve un JPG de un solo cuadro, así que una foto de perfil
 * animada se subía bien y llegaba quieta, sin que nada avisara.
 *
 * Así que el encuadre se guarda como **dato**, no como píxeles: la imagen se
 * sube tal cual —GIF, WebP animado, un clip— y lo que se anota es cómo mirarla.
 * La pantalla la dibuja adentro de su máscara con ese desplazamiento y esa
 * escala. Nada se re-codifica, así que nada pierde su animación, y cambiar el
 * encuadre después no vuelve a tocar el archivo.
 *
 * De paso resuelve el fondo, que nunca tuvo recorte de ninguna clase: la misma
 * columna, la misma forma, la misma pantalla.
 *
 * La forma es `{"x": …, "y": …, "escala": …}`:
 *
 *   escala  1 es «cubrir», que es como se dibuja hoy. Más grande, se acerca.
 *   x, y    corrimiento en fracciones del lado del recuadro, 0 es centrado.
 *
 * **El default es el comportamiento de hoy.** Con `null` —o sea, para todo lo
 * que ya existe— se dibuja cubriendo y centrado, exactamente como venía. Nadie
 * abre la app y encuentra su foto movida.
 *
 * Las tres funciones de perfil se recrean porque cambia su tipo de retorno, y
 * van **juntas en esta migración** a propósito: si una devolviera el encuadre y
 * otra no, la misma foto se vería encuadrada en una pantalla y centrada en la
 * otra, que es peor que no tener encuadre. Su lógica no se toca — quién puede
 * ver qué perfil sigue decidiéndose exactamente igual que antes.
 */

/**
 * Un encuadre válido, o nada.
 *
 * Se valida en la base y no solo en la pantalla porque estos números terminan
 * en un `transform` de la interfaz: una escala en cero haría desaparecer la
 * imagen y una negativa la daría vuelta. Los topes son los del gesto.
 */
create or replace function public.encuadre_valido(e jsonb)
returns boolean
language sql
immutable
as $$
  select e is null or (
    jsonb_typeof(e) = 'object'
    and jsonb_typeof(e -> 'x') = 'number'
    and jsonb_typeof(e -> 'y') = 'number'
    and jsonb_typeof(e -> 'escala') = 'number'
    and (e ->> 'escala')::numeric between 1 and 4
    and abs((e ->> 'x')::numeric) <= 2
    and abs((e ->> 'y')::numeric) <= 2
  );
$$;

alter table public.profiles
  add column if not exists avatar_encuadre jsonb,
  add column if not exists banner_encuadre jsonb;

alter table public.profiles
  drop constraint if exists profiles_encuadre_shape;
alter table public.profiles
  add constraint profiles_encuadre_shape
  check (public.encuadre_valido(avatar_encuadre) and public.encuadre_valido(banner_encuadre));

-- ── Las tres funciones, con las dos columnas nuevas y nada más ──────────────

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
  banner_encuadre jsonb
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p.user_id, p.username, p.display_name, p.avatar_path, p.bio,
         p.banner_path, p.created_at, p.visibility,
         p.avatar_encuadre, p.banner_encuadre
  from public.profiles p
  where p.user_id = auth.uid();
$$;

/* Mismo `where` que tenía: uno mismo, o el perfil público. No se le agrega ni
   se le saca ninguna condición — esto es una migración de columnas. */
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
  banner_encuadre jsonb
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p.user_id, p.username, p.display_name, p.avatar_path, p.bio,
         p.banner_path, p.created_at,
         p.avatar_encuadre, p.banner_encuadre
  from public.profiles p
  where p.username = lower(btrim(p_username))
    and (p.user_id = auth.uid() or p.visibility = 'publico');
$$;

/**
 * Guardar el perfil, ahora también el encuadre.
 *
 * Los dos parámetros nuevos siguen la convención de los que ya estaban: no
 * mandarlos es «no los toques». Para **borrar** un encuadre —volver al centrado
 * de fábrica— se manda cualquier **texto** en vez de un objeto.
 *
 * Que el centinela sea un texto y no `null` no es capricho: PostgREST traduce
 * el `null` de JSON a `NULL` de SQL, así que «borralo» y «no lo toques»
 * llegarían idénticos y no habría forma de volver al centrado. Un `jsonb` de
 * tipo string no puede confundirse con un encuadre, que siempre es un objeto.
 *
 * El resto del cuerpo es el que ya estaba, sin un cambio.
 */
drop function if exists public.update_my_profile(text, text, text, text, text, text);
create function public.update_my_profile(
  p_username        text default null,
  p_display_name    text default null,
  p_avatar_path     text default null,
  p_bio             text default null,
  p_banner_path     text default null,
  p_visibility      text default null,
  p_avatar_encuadre jsonb default null,
  p_banner_encuadre jsonb default null
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
  banner_encuadre jsonb
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
      /* Un objeto lo pisa, un texto lo borra, y no mandarlo lo deja como
         está. Uno nuevo reemplaza al anterior: no hay nada que fusionar. */
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
      updated_at   = now()
  where p.user_id = me;

  return query
    select p.user_id, p.username, p.display_name, p.avatar_path, p.bio, p.banner_path,
           p.created_at, p.visibility, p.avatar_encuadre, p.banner_encuadre
    from public.profiles p
    where p.user_id = me;
end;
$$;

revoke all on function public.encuadre_valido(jsonb) from public;
revoke all on function public.get_my_profile() from public;
revoke all on function public.get_profile(text) from public;
revoke all on function public.update_my_profile(text, text, text, text, text, text, jsonb, jsonb) from public;
grant execute on function public.encuadre_valido(jsonb) to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.get_profile(text) to authenticated;
grant execute on function public.update_my_profile(text, text, text, text, text, text, jsonb, jsonb) to authenticated;
