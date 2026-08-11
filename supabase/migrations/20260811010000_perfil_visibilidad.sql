/*
 * Quién puede ver tu perfil.
 *
 * Hasta acá las vitrinas se leían con `using (true)`: cualquiera con sesión.
 * Funcionaba porque nadie las leía todavía, pero es una decisión que conviene
 * tomar antes de que haya una pantalla que las muestre — **abrir después es
 * cambiar una policy; cerrar cuando ya se compartió es un problema**. Es el
 * mismo criterio con el que arrancaron privadas las listas.
 *
 * Por eso el valor por defecto es `privado`, incluso para las cuentas que ya
 * existen: nadie eligió mostrar nada, así que nadie muestra nada hasta decirlo.
 */
alter table public.profiles
  add column if not exists visibility text not null default 'privado';

alter table public.profiles drop constraint if exists profiles_visibility_check;
alter table public.profiles
  add constraint profiles_visibility_check check (visibility in ('publico', 'privado'));

/*
 * Las vitrinas siguen la visibilidad de su perfil.
 *
 * Sin esto la opción sería decorativa: el perfil diría «privado» y las vitrinas
 * seguirían saliendo por la API para cualquiera que las pidiera. La policy es el
 * único lugar donde eso se puede garantizar de verdad — la app puede olvidarse
 * de preguntar, la base no.
 *
 * Las propias se ven siempre, aunque esté en privado: el dueño tiene que poder
 * mirar su propio perfil.
 */
drop policy if exists "las vitrinas se miran" on public.profile_showcases;
create policy "las vitrinas se miran si el perfil es público"
  on public.profile_showcases for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.user_id = owner_id and p.visibility = 'publico'
    )
  );

/*
 * El perfil de otra persona.
 *
 * `profiles` está revocada para `authenticated`, así que esto va por función
 * como todo lo demás: devuelve **solo lo público** —ni el correo ni nada de
 * auth— y solo si esa cuenta eligió mostrarse. Si está en privado no devuelve
 * ninguna fila, que para quien pregunta es indistinguible de un usuario que no
 * existe. Es a propósito: «existe pero no te deja ver» ya es información.
 *
 * El propio perfil se devuelve siempre, para que la misma pantalla sirva para
 * mirarse a uno mismo.
 */
create or replace function public.get_profile(p_username text)
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
  where p.username = lower(btrim(p_username))
    and (p.user_id = auth.uid() or p.visibility = 'publico');
$$;

revoke all on function public.get_profile(text) from public;
grant execute on function public.get_profile(text) to authenticated;

/*
 * Las funciones propias devuelven además la visibilidad, para poder dibujarla
 * en los ajustes y para poder cambiarla.
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
  created_at timestamptz,
  visibility text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.user_id, p.username, p.display_name, p.avatar_path, p.bio, p.banner_path,
         p.created_at, p.visibility
  from public.profiles p
  where p.user_id = auth.uid();
$$;

drop function if exists public.update_my_profile(text, text, text, text, text);
create function public.update_my_profile(
  p_username text default null,
  p_display_name text default null,
  p_avatar_path text default null,
  p_bio text default null,
  p_banner_path text default null,
  p_visibility text default null
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_path text,
  bio text,
  banner_path text,
  created_at timestamptz,
  visibility text
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
      updated_at   = now()
  where p.user_id = me;

  return query
    select p.user_id, p.username, p.display_name, p.avatar_path, p.bio, p.banner_path,
           p.created_at, p.visibility
    from public.profiles p
    where p.user_id = me;
end;
$$;

revoke all on function public.update_my_profile(text, text, text, text, text, text) from public;
grant execute on function public.update_my_profile(text, text, text, text, text, text) to authenticated;
