/*
 * El perfil deja de ser un formulario.
 *
 * Hasta acá `profiles` tenía lo justo para identificarte: usuario, nombre y
 * foto. Un perfil que se puede mirar necesita además algo que **contar**, y de
 * eso se ocupan las vitrinas.
 *
 * La forma viene de Steam: el perfil no es una plantilla fija sino una **lista
 * ordenada de bloques**, cada uno de un tipo, que quien lo arma elige y acomoda.
 * Lo que cambia es el contenido — allá son juegos y capturas, acá canciones,
 * fragmentos y listas.
 *
 * Y una decisión de fondo, que sale de `docs/DESIGN.md`: **no hay selector de
 * color**. Discord personaliza con banner, acento y degradados; nuestro sistema
 * es acromático a propósito y su propia primera regla dice que «la carátula
 * aporta todo el color». Así que el color del perfil no se elige: sale de la
 * música que mostrás. El banner es una tapa, y el acento sigue siendo el blanco.
 */

alter table public.profiles
  /* Una línea sobre vos. Corta a propósito: es un perfil, no una biografía. */
  add column if not exists bio text,
  /*
   * La tapa que baña el encabezado.
   *
   * Se guarda el camino a la imagen ya cacheada en Storage y no una URL de
   * YouTube: las de ellos vencen, y el perfil de alguien no puede quedarse sin
   * fondo porque expiró un enlace. Es el mismo criterio que las portadas de
   * lista.
   */
  add column if not exists banner_path text;

/* Idempotente: estas migraciones se corren enteras en cada `db reset`. */
alter table public.profiles drop constraint if exists profiles_bio_largo;
alter table public.profiles
  add constraint profiles_bio_largo check (bio is null or char_length(bio) <= 180);

/*
 * Las vitrinas de un perfil.
 *
 * `kind` decide qué se dibuja y `payload` qué lleva adentro. Va como JSON y no
 * como columnas porque **cada tipo guarda cosas distintas** —una canción fijada
 * necesita el video y el recorte del fragmento; una lista destacada, un id— y
 * una tabla con veinte columnas nulas sería peor que esto. El precio es que la
 * base no valida la forma de adentro; lo hace `src/services/perfil.ts`, que es
 * el único que escribe acá.
 *
 * `position` ordena, como en `playlist_tracks`.
 */
create table if not exists public.profile_showcases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('cancion', 'fragmento', 'lista', 'texto')),
  position integer not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profile_showcases_orden_idx
  on public.profile_showcases (owner_id, position);

alter table public.profile_showcases enable row level security;

grant select, insert, update, delete on public.profile_showcases to authenticated;

/*
 * **Se leen entre todos, se editan solo las propias.**
 *
 * Es la diferencia con las listas, que arrancaron privadas. Una vitrina existe
 * para que otro la mire: si solo la viera su dueño, sería una nota para uno
 * mismo. Entre dos personas alcanza con que cualquiera con sesión pueda leer.
 */
create policy "las vitrinas se miran"
  on public.profile_showcases for select to authenticated
  using (true);

create policy "cada quien acomoda las suyas"
  on public.profile_showcases for insert to authenticated
  with check (owner_id = auth.uid());

create policy "cada quien edita las suyas"
  on public.profile_showcases for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "cada quien saca las suyas"
  on public.profile_showcases for delete to authenticated
  using (owner_id = auth.uid());

/*
 * Las funciones del perfil pasan a devolver y aceptar los campos nuevos.
 *
 * `profiles` está revocada para `authenticated` —se consulta solo por estas
 * funciones, que devuelven lo justo— así que agregar columnas no alcanza: si no
 * se tocan estas, la app nunca las ve. Se recrean enteras en vez de parchearse
 * porque en Postgres cambiar el tipo devuelto obliga a soltarlas primero.
 */
drop function if exists public.get_my_profile();
create function public.get_my_profile()
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_path text,
  bio text,
  banner_path text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.user_id, p.username, p.display_name, p.avatar_path, p.bio, p.banner_path
  from public.profiles p
  where p.user_id = auth.uid();
$$;

drop function if exists public.update_my_profile(text, text, text);
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
  banner_path text
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

  /*
   * `null` es «no lo toques» y la cadena vacía es «vacialo». Es el mismo
   * contrato que ya tenían el nombre visible y la foto: sin esa distinción no
   * habría forma de borrar la bio sin inventar un valor centinela.
   */
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
    select p.user_id, p.username, p.display_name, p.avatar_path, p.bio, p.banner_path
    from public.profiles p
    where p.user_id = me;
end;
$$;

revoke all on function public.get_my_profile() from public;
revoke all on function public.update_my_profile(text, text, text, text, text) from public;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.update_my_profile(text, text, text, text, text) to authenticated;
