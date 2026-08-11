-- ═══════════════════════════════════════════════════════════════════════════
-- Registro abierto y perfil editable.
--
-- Hasta acá las cuentas se creaban a mano en el panel de Supabase y el nombre
-- de usuario salía del email. Ahora cualquiera puede registrarse eligiendo su
-- usuario, y después cambiarlo junto con su nombre visible y su foto.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists avatar_path  text,
  add column if not exists updated_at   timestamptz not null default now();

/*
 * Forma del nombre de usuario.
 *
 * Se valida en la base y no solo en el cliente: es lo que aparece en las
 * búsquedas de contactos y lo que identifica a la cuenta, así que no puede
 * depender de que el formulario se haya portado bien. Minúsculas para que
 * `@Dany` y `@dany` no sean dos personas distintas.
 */
create or replace function public.is_valid_username(p_username text)
returns boolean
language sql
immutable
as $$
  select p_username ~ '^[a-z0-9_]{3,20}$';
$$;

-- Las cuentas viejas pueden no cumplir la forma nueva; se normalizan antes de
-- exigirla, o la restricción no podría crearse.
update public.profiles
set username = regexp_replace(lower(username), '[^a-z0-9_]', '_', 'g')
where not public.is_valid_username(username);

update public.profiles
set username = rpad(username, 3, '0')
where length(username) < 3;

alter table public.profiles drop constraint if exists profiles_username_shape;
alter table public.profiles add constraint profiles_username_shape
  check (public.is_valid_username(username));

-- ── Alta de cuenta ─────────────────────────────────────────────────────────

/*
 * El usuario elegido se respeta o el alta falla.
 *
 * Antes, si el nombre estaba tomado el trigger le pegaba un sufijo con parte
 * del uuid y seguía adelante: la persona se registraba como `dany` y terminaba
 * siendo `dany-a1b2c3` sin enterarse. Ahora choca contra el índice único, el
 * alta se deshace entera y el formulario puede decir qué pasó.
 */
create or replace function public.sync_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  requested text;
begin
  requested := lower(coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    left(new.id::text, 8)
  ));

  insert into public.profiles (user_id, username)
  values (new.id, requested)
  on conflict (user_id) do update
    set username = excluded.username,
        updated_at = now();
  return new;
end;
$$;

/*
 * Consulta de disponibilidad, abierta a quien todavía no tiene cuenta.
 *
 * Es un oráculo: confirma si un usuario existe. Se acepta a conciencia, porque
 * el formulario de alta ya filtra lo mismo cuando falla, y sin esta consulta la
 * única forma de saber que el nombre está tomado sería mandar el alta y que
 * reviente. Devuelve un booleano y nada más: no dice de quién es.
 */
create or replace function public.username_available(p_username text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select public.is_valid_username(lower(btrim(coalesce(p_username, ''))))
     and not exists (
       select 1 from public.profiles
       where username = lower(btrim(p_username))
     );
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- ── Perfil propio ──────────────────────────────────────────────────────────

create or replace function public.get_my_profile()
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_path  text
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p.user_id, p.username, p.display_name, p.avatar_path
  from public.profiles p
  where p.user_id = auth.uid();
$$;

/*
 * Actualiza solo lo que se manda: un null significa "dejalo como está" y no
 * "borralo". Para vaciar el nombre visible o la foto se manda cadena vacía,
 * que se guarda como null.
 */
create or replace function public.update_my_profile(
  p_username     text default null,
  p_display_name text default null,
  p_avatar_path  text default null
)
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_path  text
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
      updated_at   = now()
  where p.user_id = me;

  return query
    select p.user_id, p.username, p.display_name, p.avatar_path
    from public.profiles p
    where p.user_id = me;
end;
$$;

revoke all on function public.get_my_profile() from public;
revoke all on function public.update_my_profile(text, text, text) from public;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.update_my_profile(text, text, text) to authenticated;

-- ── Fotos de perfil ────────────────────────────────────────────────────────

/*
 * Bucket público, a diferencia de `songs`.
 *
 * Una foto de perfil se muestra en cada fila de la lista de conversaciones y en
 * cada mensaje; con bucket privado habría que firmar una URL por cada una y
 * volver a firmarlas al vencer. El contenido es de baja sensibilidad y la ruta
 * lleva el uuid de la cuenta más un nombre aleatorio, así que no se puede
 * adivinar. Escribir sigue restringido a la carpeta propia.
 */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars son públicos" on storage.objects;
create policy "avatars son públicos"
  on storage.objects for select
  using (bucket_id = 'avatars');

/*
 * Cada cuenta escribe únicamente dentro de la carpeta que lleva su uuid. Sin
 * esto, cualquiera con sesión podría pisar la foto de la otra persona.
 */
drop policy if exists "cada cuenta escribe su avatar" on storage.objects;
create policy "cada cuenta escribe su avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "cada cuenta reemplaza su avatar" on storage.objects;
create policy "cada cuenta reemplaza su avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "cada cuenta borra su avatar" on storage.objects;
create policy "cada cuenta borra su avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── La foto viaja con los contactos ────────────────────────────────────────
--
-- Las funciones que ya devolvían contactos suman el nombre visible y la foto,
-- para que la lista y el encabezado no tengan que pedirlos aparte.
--
-- Se sueltan antes de recrearlas: `create or replace` no puede cambiar el tipo
-- de retorno, y acá cambia porque las filas ganan columnas.

drop function if exists public.search_contacts(text, integer);
drop function if exists public.list_my_conversations();

create or replace function public.search_contacts(
  p_query text default '',
  p_limit integer default 20
)
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_path  text,
  pair_id      uuid
)
language sql
security definer
stable
set search_path = public, auth, pg_temp
as $$
  select
    profile.user_id,
    profile.username,
    profile.display_name,
    profile.avatar_path,
    (
      select mine.pair_id
      from public.pair_members mine
      join public.pair_members other on other.pair_id = mine.pair_id
      where mine.user_id = auth.uid()
        and other.user_id = profile.user_id
      limit 1
    ) as pair_id
  from public.profiles profile
  where auth.uid() is not null
    and profile.user_id <> auth.uid()
    and (
      btrim(p_query) = ''
      or profile.username ilike '%' || btrim(p_query) || '%'
      or coalesce(profile.display_name, '') ilike '%' || btrim(p_query) || '%'
    )
  order by
    case when profile.username ilike btrim(p_query) || '%' then 0 else 1 end,
    profile.username
  limit greatest(1, least(coalesce(p_limit, 20), 30));
$$;

create or replace function public.list_my_conversations()
returns table (
  pair_id           uuid,
  contact_user_id   uuid,
  username          text,
  display_name      text,
  avatar_path       text,
  last_message_text text,
  last_message_at   timestamptz,
  unread_count      bigint
)
language sql
security definer
stable
set search_path = public, auth, pg_temp
as $$
  select
    mine.pair_id,
    other.user_id as contact_user_id,
    profile.username,
    profile.display_name,
    profile.avatar_path,
    latest.text as last_message_text,
    latest.created_at as last_message_at,
    (
      select count(*)
      from public.messages unread
      where unread.pair_id = mine.pair_id
        and unread.sender_id <> auth.uid()
        and unread.read_at is null
    ) as unread_count
  from public.pair_members mine
  join public.pair_members other
    on other.pair_id = mine.pair_id and other.user_id <> mine.user_id
  join public.profiles profile on profile.user_id = other.user_id
  left join lateral (
    select message.text, message.created_at
    from public.messages message
    where message.pair_id = mine.pair_id
    order by message.created_at desc
    limit 1
  ) latest on true
  where mine.user_id = auth.uid()
  order by latest.created_at desc nulls last, profile.username;
$$;

revoke all on function public.search_contacts(text, integer) from public;
revoke all on function public.list_my_conversations() from public;
grant execute on function public.search_contacts(text, integer) to authenticated;
grant execute on function public.list_my_conversations() to authenticated;
