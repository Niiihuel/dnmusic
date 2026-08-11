-- ═══════════════════════════════════════════════════════════════════════════
-- El canal del artista, junto a cada canción de lista.
--
-- Es lo que necesita el panel de la derecha para contar quién es el que está
-- sonando: la ficha del artista se pide por su id de canal, y hasta ahora ese
-- dato se perdía al guardar la canción — el buscador lo trae, pero la fila no
-- lo guardaba. Las canciones agregadas antes de esto quedan sin él; el panel
-- muestra lo que sabe y listo.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.playlist_tracks
  add column if not exists artist_id text;

/*
 * Se recrea con el parámetro nuevo en vez de agregarlo con default: un default
 * dejaría dos versiones de la función conviviendo, y las llamadas por nombre
 * de argumento elegirían cualquiera de las dos.
 */
drop function if exists public.add_playlist_track(uuid, text, text, text, text, text, text, integer, real);

create function public.add_playlist_track(
  p_playlist_id  uuid,
  p_video_id     text,
  p_title        text,
  p_artist       text,
  p_artist_id    text,
  p_artwork_url  text,
  p_artwork_path text,
  p_audio_path   text,
  p_duration_ms  integer,
  p_true_peak    real
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_pos integer;
  new_id   uuid;
begin
  if not exists (
    select 1 from public.playlists where id = p_playlist_id and owner_id = auth.uid()
  ) then
    raise exception 'Esa lista no existe';
  end if;

  select coalesce(max(position), 0) + 10 into next_pos
  from public.playlist_tracks where playlist_id = p_playlist_id;

  insert into public.playlist_tracks (
    playlist_id, position, video_id, title, artist, artist_id,
    artwork_url, artwork_path, audio_path, duration_ms, true_peak
  )
  values (
    p_playlist_id, next_pos, p_video_id, p_title, coalesce(p_artist, ''), p_artist_id,
    coalesce(p_artwork_url, ''), p_artwork_path, p_audio_path,
    coalesce(p_duration_ms, 0), p_true_peak
  )
  on conflict (playlist_id, video_id) do nothing
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.add_playlist_track(uuid, text, text, text, text, text, text, text, integer, real) from public;
grant execute on function public.add_playlist_track(uuid, text, text, text, text, text, text, text, integer, real) to authenticated;
