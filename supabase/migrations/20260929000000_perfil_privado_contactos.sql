-- Un perfil privado se comparte con contactos aceptados, no con solicitudes
-- pendientes ni con quienes lo encuentran en la búsqueda. El bloqueo prevalece.
create or replace function public.perfil_puede_ver(p_owner uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p
    where p.user_id = p_owner
      and (
        p.user_id = auth.uid()
        or (
          not public.hay_bloqueo(auth.uid(), p.user_id)
          and (p.visibility = 'publico' or public.son_contactos(auth.uid(), p.user_id))
        )
      )
  );
$$;
revoke all on function public.perfil_puede_ver(uuid) from public, anon;
grant execute on function public.perfil_puede_ver(uuid) to authenticated;

-- Los RPC públicos existentes son wrappers de aprobación desde 20260916.
-- Solo se cambia su implementación privada: así no se pierde esa protección.
create or replace function app_private.get_profile(p_username text)
returns table (
  user_id uuid, username text, display_name text, avatar_path text,
  bio text, banner_path text, created_at timestamptz,
  avatar_encuadre jsonb, banner_encuadre jsonb, marco text, tema jsonb,
  fuente text, efecto text, placa text, marco_perfil text
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.user_id, p.username, p.display_name, p.avatar_path, p.bio,
         p.banner_path, p.created_at, p.avatar_encuadre, p.banner_encuadre,
         p.marco, p.tema, p.fuente, p.efecto, p.placa, p.marco_perfil
  from public.profiles p
  where p.username = lower(btrim(p_username))
    and public.perfil_puede_ver(p.user_id);
$$;
revoke all on function app_private.get_profile(text) from public, anon, authenticated, app_pending;

create or replace function app_private.get_profile_stats(p_user_id uuid)
returns table (minutos integer, canciones integer, artista_top text, minutos_artista_top integer)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with mias as (
    select * from public.plays
    where owner_id = p_user_id and public.perfil_puede_ver(p_user_id)
  ),
  top as (
    select artist, sum(ms) as ms from mias where artist <> ''
    group by artist order by sum(ms) desc limit 1
  )
  select (select coalesce(sum(ms), 0) / 60000 from mias)::integer,
         (select count(distinct video_id) from mias)::integer,
         (select artist from top),
         (select ms / 60000 from top)::integer;
$$;
revoke all on function app_private.get_profile_stats(uuid) from public, anon, authenticated, app_pending;

drop policy if exists "las vitrinas se miran si el perfil es público" on public.profile_showcases;
create policy "las vitrinas se miran si puedo ver el perfil"
  on public.profile_showcases for select to authenticated
  using (public.perfil_puede_ver(owner_id));

create or replace function app_private.vitrina_visible(p_showcase uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profile_showcases s
    where s.id = p_showcase and public.perfil_puede_ver(s.owner_id)
  );
$$;
revoke all on function app_private.vitrina_visible(uuid) from public, anon, authenticated, app_pending;

create or replace function app_private.reacciones_de_vitrinas(p_owner uuid)
returns table (showcase_id uuid, emoji text, cuenta bigint, mia boolean)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select r.showcase_id, r.emoji, count(*)::bigint, bool_or(r.de = auth.uid())
  from public.reacciones_vitrina r
  join public.profile_showcases s on s.id = r.showcase_id
  where s.owner_id = p_owner and public.perfil_puede_ver(p_owner)
  group by r.showcase_id, r.emoji;
$$;
revoke all on function app_private.reacciones_de_vitrinas(uuid) from public, anon, authenticated, app_pending;
