/*
 * Decoraciones en imagen: marcos y efectos de perfil que son un archivo.
 *
 * Los marcos de siempre se dibujan en el cliente (`src/ui/Marco.tsx`) y no
 * necesitan nada de acá. Esto es para lo otro: decoraciones **en imagen
 * animada** (WebP, APNG, GIF) —propias o con licencia libre— que se suben
 * una vez a nuestro Storage y se ofrecen en la misma vidriera. Nunca un
 * enlace a un CDN ajeno: la lección de decoprofile (429 decoraciones
 * apuntando a un Drive que hoy da 404) fue que lo que no es nuestro se
 * muere solo.
 *
 * Dos tipos, y el perfil guarda uno de cada uno:
 * - `marco`: se dibuja alrededor de la foto (`profiles.marco`, que ya existe,
 *   guarda el id; si no es un marco dibujado, se busca acá).
 * - `efecto`: se dibuja encima del fondo del perfil, arriba, como los
 *   «profile effects» (`profiles.efecto`, nueva).
 *
 * El catálogo es de solo lectura para la app: escribe el servicio, con el
 * script `scripts/decoraciones/importar.mjs`, que sube el archivo al bucket y
 * registra la fila con su licencia y su autor. La atribución se muestra en
 * la vidriera, que es lo que CC BY pide.
 */

create table if not exists public.decoraciones (
  id        text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  tipo      text not null check (tipo in ('marco', 'efecto')),
  nombre    text not null,
  /* La familia de la vidriera: fiesta, naturaleza, cielo… la misma clave que
     los marcos dibujados, para que se mezclen en las mismas píldoras. */
  familia   text not null default 'insignias',
  /* La ruta en el bucket `decoraciones`. */
  archivo   text not null,
  /*
   * Cómo se apoya sobre la foto (solo `marco`): `escala` es el lado de la
   * imagen en veces el lado de la foto —1,2 es un marco entero al estilo
   * Discord, 0,5 una insignia— y `posicion` dónde va el centro de la imagen.
   */
  escala    numeric not null default 1.2 check (escala > 0 and escala <= 2),
  posicion  text not null default 'centro'
            check (posicion in ('centro', 'arriba', 'arriba-derecha', 'arriba-izquierda', 'abajo')),
  /* De dónde salió y con qué permiso, para mostrarlo. */
  autor     text not null default '',
  licencia  text not null default '',
  fuente    text not null default '',
  orden     integer not null default 0,
  creado_en timestamptz not null default now()
);

alter table public.decoraciones enable row level security;

drop policy if exists "las decoraciones se leen con sesión" on public.decoraciones;
create policy "las decoraciones se leen con sesión"
  on public.decoraciones for select
  to authenticated
  using (true);

/* Escribe solo el servicio: no hay policy de insert/update para authenticated.
   Los grants van explícitos: en el stack local los privilegios por defecto
   no alcanzan a service_role, y el script de importar fallaba con
   «permission denied». */
grant select on public.decoraciones to authenticated;
grant all on public.decoraciones to service_role;

/* El bucket, público para leer como `avatars` y `artwork`: una decoración
   aparece en cada avatar de cada fila. Escribe solo service_role. */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('decoraciones', 'decoraciones', true, 4194304,
        array['image/webp', 'image/png', 'image/apng', 'image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "las decoraciones son públicas" on storage.objects;
create policy "las decoraciones son públicas"
  on storage.objects for select
  using (bucket_id = 'decoraciones');

/* El efecto del perfil: el id de una decoración de tipo `efecto`, o nada.
   Un id que ya no exista se dibuja como ninguno — igual que el marco. */
alter table public.profiles add column if not exists efecto text;

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
  tema            jsonb,
  fuente          text,
  efecto          text
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p.user_id, p.username, p.display_name, p.avatar_path, p.bio,
         p.banner_path, p.created_at, p.visibility,
         p.avatar_encuadre, p.banner_encuadre, p.marco, p.tema, p.fuente, p.efecto
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
  tema            jsonb,
  fuente          text,
  efecto          text
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p.user_id, p.username, p.display_name, p.avatar_path, p.bio,
         p.banner_path, p.created_at,
         p.avatar_encuadre, p.banner_encuadre, p.marco, p.tema, p.fuente, p.efecto
  from public.profiles p
  where p.username = lower(btrim(p_username))
    and (p.user_id = auth.uid() or p.visibility = 'publico');
$$;

/* `p_efecto`: como `p_marco` — null no toca, vacío lo saca. */
drop function if exists public.update_my_profile(text, text, text, text, text, text, jsonb, jsonb, text, jsonb, text);
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
  p_tema            jsonb default null,
  p_fuente          text default null,
  p_efecto          text default null
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
  tema            jsonb,
  fuente          text,
  efecto          text
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
      fuente = case when p_fuente is null then p.fuente else nullif(btrim(p_fuente), '') end,
      efecto = case when p_efecto is null then p.efecto else nullif(btrim(p_efecto), '') end,
      updated_at   = now()
  where p.user_id = me;
  return query
    select p.user_id, p.username, p.display_name, p.avatar_path, p.bio, p.banner_path,
           p.created_at, p.visibility, p.avatar_encuadre, p.banner_encuadre, p.marco, p.tema,
           p.fuente, p.efecto
    from public.profiles p
    where p.user_id = me;
end;
$$;

revoke all on function public.get_my_profile() from public;
revoke all on function public.get_profile(text) from public;
revoke all on function public.update_my_profile(text, text, text, text, text, text, jsonb, jsonb, text, jsonb, text, text) from public;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.get_profile(text) to authenticated;
grant execute on function public.update_my_profile(text, text, text, text, text, text, jsonb, jsonb, text, jsonb, text, text) to authenticated;

notify pgrst, 'reload schema';
