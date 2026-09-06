/*
 * La placa de nombre: la decoración detrás del nombre, como las «nameplates»
 * de Discord. Es la tercera pieza de la tienda, con el marco y el efecto:
 * un id dibujado en el cliente (`ui/Placas`), o nada. Un id desconocido se
 * dibuja como ninguno, igual que el marco.
 */
alter table public.profiles add column if not exists placa text
  check (placa is null or length(placa) between 1 and 200);

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
  efecto          text,
  placa           text
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p.user_id, p.username, p.display_name, p.avatar_path, p.bio,
         p.banner_path, p.created_at, p.visibility,
         p.avatar_encuadre, p.banner_encuadre, p.marco, p.tema, p.fuente, p.efecto, p.placa
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
  efecto          text,
  placa           text
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p.user_id, p.username, p.display_name, p.avatar_path, p.bio,
         p.banner_path, p.created_at,
         p.avatar_encuadre, p.banner_encuadre, p.marco, p.tema, p.fuente, p.efecto, p.placa
  from public.profiles p
  where p.username = lower(btrim(p_username))
    and (p.user_id = auth.uid() or p.visibility = 'publico');
$$;

/* `p_efecto`: como `p_marco` — null no toca, vacío lo saca. */
drop function if exists public.update_my_profile(text, text, text, text, text, text, jsonb, jsonb, text, jsonb, text, text);
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
  p_efecto          text default null,
  p_placa           text default null
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
  efecto          text,
  placa           text
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
      placa  = case when p_placa is null then p.placa else nullif(btrim(p_placa), '') end,
      updated_at   = now()
  where p.user_id = me;
  return query
    select p.user_id, p.username, p.display_name, p.avatar_path, p.bio, p.banner_path,
           p.created_at, p.visibility, p.avatar_encuadre, p.banner_encuadre, p.marco, p.tema,
           p.fuente, p.efecto, p.placa
    from public.profiles p
    where p.user_id = me;
end;
$$;

revoke all on function public.get_my_profile() from public;
revoke all on function public.get_profile(text) from public;
revoke all on function public.update_my_profile(text, text, text, text, text, text, jsonb, jsonb, text, jsonb, text, text, text) from public;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.get_profile(text) to authenticated;
grant execute on function public.update_my_profile(text, text, text, text, text, text, jsonb, jsonb, text, jsonb, text, text, text) to authenticated;

notify pgrst, 'reload schema';
