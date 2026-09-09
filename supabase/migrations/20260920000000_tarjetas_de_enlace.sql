-- Additive. Requires 20260916000000_access_approval.sql.
--
-- Link cards for shared URLs. The only new anonymous surface is
-- public.tarjeta_enlace, which returns at most five presentation fields and
-- reads exclusively from rows that are already shareable: a song someone chose
-- to publish, a playlist whose visibilidad is 'publica', a profile whose
-- visibility is 'publico', an active jam addressed by its own invitation code.
-- It never widens playlist, profile, jam or storage rules, never exposes a
-- UUID, an e-mail or an owner, and never returns track lists or membership.
begin;

-- A song has no table of its own: songs live inside playlists. Publishing one
-- copies the five fields the card needs, so the link shows exactly what the
-- sharer decided to show and no id can be guessed into a catalogue listing.
create table public.canciones_compartidas (
  video_id     text primary key check (video_id ~ '^([A-Za-z0-9_-]{6,32}|propia:[0-9a-f-]{36})$'),
  title        text not null check (length(btrim(title)) between 1 and 200),
  artist       text not null default '' check (length(artist) <= 200),
  artwork_path text check (length(artwork_path) <= 400),
  artwork_url  text not null default '' check (length(artwork_url) <= 800),
  duration_ms  integer not null default 0 check (duration_ms between 0 and 86400000),
  shared_by    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shared_at    timestamptz not null default now()
);
alter table public.canciones_compartidas enable row level security;
revoke all on public.canciones_compartidas from public,anon,authenticated,app_pending;

-- Publishing is an approved-account action and goes through the RPC only: the
-- table itself has no client grants, so no column outside this contract can be
-- written and no row can be read back in bulk.
create function public.publicar_cancion(
  p_video_id text, p_title text, p_artist text,
  p_artwork_path text, p_artwork_url text, p_duration_ms integer
) returns void
language plpgsql volatile security definer set search_path=pg_catalog as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode='42501';
  end if;
  insert into public.canciones_compartidas
    (video_id,title,artist,artwork_path,artwork_url,duration_ms,shared_by)
  values (
    btrim(coalesce(p_video_id,'')),
    left(btrim(coalesce(p_title,'')),200),
    left(btrim(coalesce(p_artist,'')),200),
    nullif(left(btrim(coalesce(p_artwork_path,'')),400),''),
    left(btrim(coalesce(p_artwork_url,'')),800),
    greatest(0,least(coalesce(p_duration_ms,0),86400000)),
    auth.uid()
  )
  -- Re-sharing refreshes the card without changing who published it first: the
  -- artwork copy in Storage may have appeared since, and a stale card is worse
  -- than a rewritten one.
  on conflict (video_id) do update set
    title        = excluded.title,
    artist       = excluded.artist,
    artwork_path = coalesce(excluded.artwork_path,public.canciones_compartidas.artwork_path),
    artwork_url  = case when excluded.artwork_url='' then public.canciones_compartidas.artwork_url else excluded.artwork_url end,
    duration_ms  = greatest(excluded.duration_ms,public.canciones_compartidas.duration_ms),
    shared_at    = now();
end;
$$;
revoke all on function public.publicar_cancion(text,text,text,text,text,integer) from public,anon,app_pending;
grant execute on function public.publicar_cancion(text,text,text,text,text,integer) to authenticated;

-- `tapa` is either an absolute https URL (a CDN cover) or a `bucket/path` pair
-- to be composed against the project's Storage origin by the caller. The
-- project URL is not hardcoded here because local, preview and production do
-- not share one.
create function public.tarjeta_enlace(p_tipo text, p_id text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
-- Named `ident` and not `id`: half the tables in play have a column called
-- `id`, and a plpgsql variable that shadows one turns every `where` into an
-- ambiguity error at runtime.
declare ident text := btrim(coalesce(p_id,'')); salida jsonb;
begin
  if ident = '' or length(ident) > 200 then return null; end if;

  if p_tipo = 'cancion' then
    select jsonb_build_object(
      'tipo','cancion','id',c.video_id,'titulo',c.title,'subtitulo',c.artist,
      'tapa',case when c.artwork_path is not null then 'artwork/'||c.artwork_path
                  when c.artwork_url like 'https://%' then c.artwork_url else null end,
      'duracion_ms',c.duration_ms)
    into salida from public.canciones_compartidas c where c.video_id = ident;

  elsif p_tipo = 'lista' then
    select jsonb_build_object(
      'tipo','lista','id',p.id::text,'titulo',p.name,
      'subtitulo',(select count(*) from public.playlist_tracks t where t.playlist_id = p.id)||' canciones',
      'tapa',coalesce(
        case when p.cover_path is not null then 'covers/'||p.cover_path end,
        (select case when t.artwork_path is not null then 'artwork/'||t.artwork_path
                     when t.artwork_url like 'https://%' then t.artwork_url end
           from public.playlist_tracks t where t.playlist_id = p.id
           order by t.position limit 1)))
    into salida from public.playlists p
    where p.visibilidad = 'publica' and ident ~ '^[0-9a-f-]{36}$' and p.id = ident::uuid;

  elsif p_tipo = 'perfil' then
    select jsonb_build_object(
      'tipo','perfil','id',pr.username,
      'titulo',coalesce(nullif(btrim(coalesce(pr.display_name,'')),''),'@'||pr.username),
      'subtitulo','@'||pr.username,
      'tapa',case when pr.avatar_path is not null then 'avatars/'||pr.avatar_path end)
    into salida from public.profiles pr
    where pr.visibility = 'publico' and pr.username = lower(ident);

  elsif p_tipo = 'jam' then
    -- The code is the invitation: knowing it already grants entry, so the card
    -- adds nothing that the link did not. Host name only, never membership.
    select jsonb_build_object(
      'tipo','jam','id',j.code,'titulo','Jam de @'||pr.username,
      'subtitulo','Escuchen la misma canción al mismo tiempo',
      'tapa',case when pr.avatar_path is not null then 'avatars/'||pr.avatar_path end)
    into salida from public.jams j join public.profiles pr on pr.user_id = j.host_id
    where j.status = 'activo' and j.code = upper(ident);
  end if;

  return salida;
end;
$$;
revoke all on function public.tarjeta_enlace(text,text) from public;
grant execute on function public.tarjeta_enlace(text,text) to anon,authenticated,app_pending,service_role;

-- The pre-request gate gains one exception, in the shape of the two it already
-- has. Everything else stays closed to anon: this call reads no account state
-- and takes no session.
create or replace function public.check_app_access() returns void
language plpgsql stable security definer set search_path=pg_catalog as $$
declare path text:=coalesce(current_setting('request.path',true),'');
begin
  if auth.role()='service_role' then return; end if;
  if path='/rpc/auth_email_for_username' then return; end if;
  if path='/rpc/tarjeta_enlace' then return; end if;
  if path='/rpc/access_status' and auth.uid() is not null then return; end if;
  perform app_private.require_approved();
end;
$$;
notify pgrst,'reload schema';

commit;
