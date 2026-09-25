-- Variantes de Mix por playlist. Las filas de playlist_tracks son las identidades
-- de los extremos: su posición puede cambiar sin destruir una transición.

create table public.playlist_mixes (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  creator_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  visibility text not null default 'private' check (visibility in ('private', 'shared')),
  default_preset text not null default 'auto'
    check (default_preset in ('auto', 'fade', 'crescendo', 'fusion', 'none', 'custom')),
  default_duration_ms integer not null default 4000
    check (default_duration_ms between 0 and 30000),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (playlist_id, id)
);

create index playlist_mixes_playlist_idx on public.playlist_mixes (playlist_id, updated_at desc);
create index playlist_mixes_creator_idx on public.playlist_mixes (creator_id, updated_at desc);

alter table public.playlists
  add column mix_enabled boolean not null default false,
  add column published_mix_id uuid references public.playlist_mixes(id) on delete set null;

-- La policy del dueño ya permite actualizar playlists directamente. Este
-- trigger asegura que ni siquiera el dueño pueda publicar un mix de otra lista
-- o el borrador privado de un colaborador.
create function public.validate_playlist_published_mix()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if new.published_mix_id is null then
    new.mix_enabled := false;
    return new;
  end if;
  if not exists (
    select 1 from public.playlist_mixes m
    where m.id = new.published_mix_id and m.playlist_id = new.id
      and (m.creator_id = auth.uid() or m.visibility = 'shared')
  ) then
    raise exception 'El mix no se puede publicar en esta lista';
  end if;
  return new;
end;
$$;
create trigger playlist_published_mix_valid
  before insert or update of published_mix_id, mix_enabled on public.playlists
  for each row execute function public.validate_playlist_published_mix();

-- Un índice compuesto hace que cada extremo y cada mix deban pertenecer a la
-- misma playlist. ON DELETE CASCADE elimina aristas al borrar una canción.
alter table public.playlist_tracks add constraint playlist_tracks_playlist_id_id_unique
  unique (playlist_id, id);

create function public.valid_mix_envelope(curve jsonb, min_value numeric, max_value numeric)
returns boolean language plpgsql immutable
set search_path = public, pg_temp as $$
declare
  point jsonb;
  t numeric;
  previous_t numeric := -1;
  n integer;
begin
  if curve is null then return true; end if;
  if jsonb_typeof(curve) <> 'array' then return false; end if;
  n := jsonb_array_length(curve);
  if n < 2 or n > 16 then return false; end if;
  for point in select value from jsonb_array_elements(curve) loop
    if jsonb_typeof(point) <> 'object'
      or jsonb_typeof(point -> 't') <> 'number'
      or jsonb_typeof(point -> 'value') <> 'number'
      or point - 't' - 'value' <> '{}'::jsonb then
      return false;
    end if;
    t := (point ->> 't')::numeric;
    if t < 0 or t > 1 or t <= previous_t
      or (point ->> 'value')::numeric < min_value
      or (point ->> 'value')::numeric > max_value then
      return false;
    end if;
    previous_t := t;
  end loop;
  return (curve -> 0 ->> 't')::numeric = 0 and previous_t = 1;
end;
$$;

-- EQ y filtro usan curvas normalizadas en tiempo. Su versión permite cambiar
-- el formato más adelante sin interpretar datos viejos como parámetros nuevos.
create function public.valid_mix_eq(settings jsonb)
returns boolean language plpgsql immutable
set search_path = public, pg_temp as $$
declare
  deck text;
  band text;
begin
  if settings is null then return true; end if;
  if jsonb_typeof(settings) <> 'object'
    or jsonb_typeof(settings -> 'version') <> 'number'
    or (settings ->> 'version')::integer <> 1
    or jsonb_typeof(settings -> 'enabled') <> 'boolean'
    or not (settings ? 'out' and settings ? 'in')
    or settings - 'version' - 'enabled' - 'out' - 'in' <> '{}'::jsonb then
    return false;
  end if;
  for deck in select unnest(array['out', 'in']) loop
    if jsonb_typeof(settings -> deck) <> 'object'
      or (settings -> deck) - 'low' - 'mid' - 'high' <> '{}'::jsonb then
      return false;
    end if;
    for band in select unnest(array['low', 'mid', 'high']) loop
      if settings -> deck -> band is null
        or not public.valid_mix_envelope(settings -> deck -> band, -24, 24) then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

create function public.valid_mix_filter(settings jsonb)
returns boolean language plpgsql immutable
set search_path = public, pg_temp as $$
declare
  deck text;
  part jsonb;
begin
  if settings is null then return true; end if;
  if jsonb_typeof(settings) <> 'object'
    or jsonb_typeof(settings -> 'version') <> 'number'
    or (settings ->> 'version')::integer <> 1
    or jsonb_typeof(settings -> 'enabled') <> 'boolean'
    or not (settings ? 'out' and settings ? 'in')
    or settings - 'version' - 'enabled' - 'out' - 'in' <> '{}'::jsonb then
    return false;
  end if;
  for deck in select unnest(array['out', 'in']) loop
    part := settings -> deck;
    if part is null or part = 'null'::jsonb then continue; end if;
    if jsonb_typeof(part) <> 'object'
      or part ->> 'kind' not in ('lowpass', 'highpass')
      or part - 'kind' - 'cutoff' <> '{}'::jsonb
      or part -> 'cutoff' is null
      or not public.valid_mix_envelope(part -> 'cutoff', 20, 20000) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create table public.playlist_mix_edges (
  id uuid primary key default gen_random_uuid(),
  mix_id uuid not null,
  playlist_id uuid not null,
  from_playlist_track_id uuid not null,
  to_playlist_track_id uuid not null,
  preset text not null default 'auto'
    check (preset in ('auto', 'fade', 'crescendo', 'fusion', 'none', 'custom')),
  duration_ms integer not null default 4000 check (duration_ms between 0 and 30000),
  from_cue_ms integer check (from_cue_ms >= 0),
  to_cue_ms integer check (to_cue_ms >= 0),
  volume_law text not null default 'equal_power' check (volume_law in ('linear', 'equal_power')),
  volume_out jsonb check (public.valid_mix_envelope(volume_out, 0, 1)),
  volume_in jsonb check (public.valid_mix_envelope(volume_in, 0, 1)),
  eq_settings jsonb check (public.valid_mix_eq(eq_settings)),
  filter_settings jsonb check (public.valid_mix_filter(filter_settings)),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mix_id, from_playlist_track_id, to_playlist_track_id),
  check (from_playlist_track_id <> to_playlist_track_id),
  foreign key (playlist_id, mix_id) references public.playlist_mixes(playlist_id, id) on delete cascade,
  foreign key (playlist_id, from_playlist_track_id)
    references public.playlist_tracks(playlist_id, id) on delete cascade,
  foreign key (playlist_id, to_playlist_track_id)
    references public.playlist_tracks(playlist_id, id) on delete cascade
);
create index playlist_mix_edges_mix_idx on public.playlist_mix_edges (mix_id);

create table public.user_playlist_mix_choices (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  mode text not null check (mode in ('default', 'selected', 'off')),
  mix_id uuid,
  updated_at timestamptz not null default now(),
  primary key (user_id, playlist_id),
  check ((mode = 'selected') = (mix_id is not null)),
  foreign key (playlist_id, mix_id) references public.playlist_mixes(playlist_id, id) on delete cascade
);

create function public.valid_playlist_eq_bands(bands jsonb)
returns boolean language plpgsql immutable
set search_path = public, pg_temp as $$
declare
  v jsonb;
begin
  if bands is null or jsonb_typeof(bands) <> 'array' then return false; end if;
  if jsonb_array_length(bands) <> 10 then return false; end if;
  for v in select value from jsonb_array_elements(bands) loop
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric < -12
      or (v #>> '{}')::numeric > 12 then return false; end if;
  end loop;
  return true;
end;
$$;

create table public.playlist_sound_profiles (
  playlist_id uuid primary key references public.playlists(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  bands_db jsonb not null check (public.valid_playlist_eq_bands(bands_db)),
  preamp_db numeric(5,2) not null default 0 check (preamp_db between -24 and 6),
  published boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.playlist_mixes enable row level security;
alter table public.playlist_mix_edges enable row level security;
alter table public.user_playlist_mix_choices enable row level security;
alter table public.playlist_sound_profiles enable row level security;

grant select on public.playlist_mixes, public.playlist_mix_edges,
  public.user_playlist_mix_choices, public.playlist_sound_profiles to authenticated;

create policy "mix propio, compartido o publicado"
  on public.playlist_mixes for select to authenticated using (
    (creator_id = auth.uid() and public.puede_ver_lista(playlist_id))
    or (visibility = 'shared' and public.puede_editar_lista(playlist_id))
    or exists (
      select 1 from public.playlists p
      where p.id = playlist_mixes.playlist_id
        and p.published_mix_id = playlist_mixes.id
        and public.puede_ver_lista(playlist_mixes.playlist_id)
    )
  );

create policy "aristas de un mix visible"
  on public.playlist_mix_edges for select to authenticated using (
    exists (select 1 from public.playlist_mixes m where m.id = mix_id)
  );

create policy "elección personal de mix"
  on public.user_playlist_mix_choices for select to authenticated
  using (user_id = auth.uid());

create policy "sonido publicado o del dueño"
  on public.playlist_sound_profiles for select to authenticated using (
    (published and public.puede_ver_lista(playlist_id))
    or exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid())
  );

-- Las escrituras usan RPCs para comprobar permisos y CAS en una transacción.
-- SECURITY DEFINER obliga a repetir el permiso explícito en cada función.
create function public.create_playlist_mix(
  p_playlist uuid, p_name text, p_preset text default 'auto', p_duration_ms integer default 4000
) returns public.playlist_mixes language plpgsql security definer
set search_path = public, pg_temp as $$
declare result public.playlist_mixes;
begin
  if auth.uid() is null or not public.puede_editar_lista(p_playlist) then
    raise exception 'No podés editar esta lista';
  end if;
  insert into public.playlist_mixes (playlist_id, name, default_preset, default_duration_ms)
  values (p_playlist, btrim(p_name), p_preset, p_duration_ms) returning * into result;
  return result;
end;
$$;

create function public.duplicate_playlist_mix(p_mix uuid, p_name text)
returns public.playlist_mixes language plpgsql security definer
set search_path = public, pg_temp as $$
declare source public.playlist_mixes; result public.playlist_mixes;
begin
  select * into source from public.playlist_mixes where id = p_mix;
  if source.id is null or not public.puede_editar_lista(source.playlist_id)
    or not (source.creator_id = auth.uid() or source.visibility = 'shared'
      or exists (select 1 from public.playlists p
        where p.id = source.playlist_id and p.published_mix_id = source.id)) then
    raise exception 'Mix no disponible';
  end if;
  insert into public.playlist_mixes
    (playlist_id, name, default_preset, default_duration_ms)
  values (source.playlist_id, btrim(p_name), source.default_preset, source.default_duration_ms)
  returning * into result;
  insert into public.playlist_mix_edges
    (mix_id, playlist_id, from_playlist_track_id, to_playlist_track_id,
     preset, duration_ms, from_cue_ms, to_cue_ms, volume_law,
     volume_out, volume_in, eq_settings, filter_settings)
  select result.id, e.playlist_id, e.from_playlist_track_id, e.to_playlist_track_id,
    e.preset, e.duration_ms, e.from_cue_ms, e.to_cue_ms, e.volume_law,
    e.volume_out, e.volume_in, e.eq_settings, e.filter_settings
  from public.playlist_mix_edges e where e.mix_id = source.id;
  return result;
end;
$$;

create function public.update_playlist_mix(
  p_mix uuid, p_expected_revision integer, p_name text,
  p_visibility text, p_preset text, p_duration_ms integer
) returns public.playlist_mixes language plpgsql security definer
set search_path = public, pg_temp as $$
declare old_row public.playlist_mixes; result public.playlist_mixes; owner_id uuid;
begin
  select * into old_row from public.playlist_mixes where id = p_mix for update;
  if old_row.id is null or not public.puede_editar_lista(old_row.playlist_id) then
    raise exception 'Mix no disponible';
  end if;
  select p.owner_id into owner_id from public.playlists p where p.id = old_row.playlist_id;
  if old_row.creator_id <> auth.uid()
    and (owner_id <> auth.uid() or old_row.visibility = 'private') then
    raise exception 'No podés editar este mix';
  end if;
  if owner_id <> auth.uid() and exists (
    select 1 from public.playlists p where p.id = old_row.playlist_id and p.published_mix_id = p_mix
  ) then
    raise exception 'Solo el dueño puede editar el mix publicado';
  end if;
  if old_row.revision <> p_expected_revision then
    raise exception 'mix_revision_conflict';
  end if;
  update public.playlist_mixes set name = btrim(p_name), visibility = p_visibility,
    default_preset = p_preset, default_duration_ms = p_duration_ms,
    revision = revision + 1, updated_at = now()
  where id = p_mix returning * into result;
  return result;
end;
$$;

create function public.delete_playlist_mix(p_mix uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
declare old_row public.playlist_mixes; owner_id uuid; mix_playlist_id uuid;
begin
  select playlist_id into mix_playlist_id from public.playlist_mixes where id = p_mix;
  if mix_playlist_id is null then return false; end if;
  -- Publicar y borrar toman los candados en el mismo orden: lista, mix.
  select p.owner_id into owner_id from public.playlists p
    where p.id = mix_playlist_id for update;
  select * into old_row from public.playlist_mixes where id = p_mix for update;
  if old_row.id is null then return false; end if;
  if old_row.creator_id <> auth.uid()
    and (owner_id <> auth.uid() or old_row.visibility = 'private') then
    raise exception 'No podés borrar este mix';
  end if;
  if owner_id <> auth.uid() and exists (
    select 1 from public.playlists p where p.id = old_row.playlist_id and p.published_mix_id = p_mix
  ) then
    raise exception 'Solo el dueño puede borrar el mix publicado';
  end if;
  delete from public.playlist_mixes where id = p_mix;
  return true;
end;
$$;

create function public.publish_playlist_mix(p_playlist uuid, p_mix uuid, p_enabled boolean)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare owner_id uuid; target public.playlist_mixes;
begin
  select p.owner_id into owner_id from public.playlists p where p.id = p_playlist for update;
  if owner_id is null or owner_id <> auth.uid() then
    raise exception 'Solo el dueño puede publicar un mix';
  end if;
  if p_mix is not null then
    select * into target from public.playlist_mixes where id = p_mix for update;
    if target.id is null or target.playlist_id <> p_playlist
      or (target.creator_id <> auth.uid() and target.visibility <> 'shared') then
      raise exception 'Mix no disponible para publicar';
    end if;
  end if;
  if p_enabled and p_mix is null then
    raise exception 'Elegí un mix antes de activarlo';
  end if;
  update public.playlists set published_mix_id = p_mix, mix_enabled = p_enabled
  where id = p_playlist;
end;
$$;

create function public.save_playlist_mix_edge(
  p_mix uuid, p_from_track uuid, p_to_track uuid, p_expected_revision integer,
  p_preset text, p_duration_ms integer, p_from_cue_ms integer,
  p_to_cue_ms integer, p_volume_law text, p_volume_out jsonb,
  p_volume_in jsonb, p_eq_settings jsonb, p_filter_settings jsonb
) returns public.playlist_mix_edges language plpgsql security definer
set search_path = public, pg_temp as $$
declare m public.playlist_mixes; previous public.playlist_mix_edges;
  result public.playlist_mix_edges; owner_id uuid;
  from_duration integer; to_duration integer;
begin
  select * into m from public.playlist_mixes where id = p_mix for update;
  if m.id is null or not public.puede_editar_lista(m.playlist_id) then
    raise exception 'Mix no disponible';
  end if;
  select p.owner_id into owner_id from public.playlists p where p.id = m.playlist_id;
  if m.creator_id <> auth.uid()
    and (owner_id <> auth.uid() or m.visibility = 'private') then
    raise exception 'No podés editar este mix';
  end if;
  if owner_id <> auth.uid() and exists (
    select 1 from public.playlists p where p.id = m.playlist_id and p.published_mix_id = p_mix
  ) then
    raise exception 'Solo el dueño puede editar el mix publicado';
  end if;
  select duration_ms into from_duration from public.playlist_tracks
    where id = p_from_track and playlist_id = m.playlist_id;
  select duration_ms into to_duration from public.playlist_tracks
    where id = p_to_track and playlist_id = m.playlist_id;
  if from_duration is null or to_duration is null or p_from_track = p_to_track then
    raise exception 'Las canciones deben pertenecer a esta lista';
  end if;
  if (p_from_cue_ms is not null and from_duration > 0
      and p_from_cue_ms + p_duration_ms > from_duration)
    or (p_to_cue_ms is not null and to_duration > 0
      and p_to_cue_ms + p_duration_ms > to_duration) then
    raise exception 'La transición excede la canción';
  end if;
  select * into previous from public.playlist_mix_edges
    where mix_id = p_mix and from_playlist_track_id = p_from_track
      and to_playlist_track_id = p_to_track;
  if previous.id is null then
    if p_expected_revision is not null then raise exception 'mix_edge_revision_conflict'; end if;
    insert into public.playlist_mix_edges
      (mix_id, playlist_id, from_playlist_track_id, to_playlist_track_id,
       preset, duration_ms, from_cue_ms, to_cue_ms, volume_law,
       volume_out, volume_in, eq_settings, filter_settings)
    values (p_mix, m.playlist_id, p_from_track, p_to_track,
      p_preset, p_duration_ms, p_from_cue_ms, p_to_cue_ms, p_volume_law,
      p_volume_out, p_volume_in, p_eq_settings, p_filter_settings)
    returning * into result;
  else
    if previous.revision <> p_expected_revision then raise exception 'mix_edge_revision_conflict'; end if;
    update public.playlist_mix_edges set preset = p_preset,
      duration_ms = p_duration_ms, from_cue_ms = p_from_cue_ms,
      to_cue_ms = p_to_cue_ms, volume_law = p_volume_law,
      volume_out = p_volume_out, volume_in = p_volume_in,
      eq_settings = p_eq_settings, filter_settings = p_filter_settings,
      revision = revision + 1, updated_at = now()
    where id = previous.id returning * into result;
  end if;
  update public.playlist_mixes set revision = revision + 1, updated_at = now() where id = p_mix;
  return result;
end;
$$;

create function public.delete_playlist_mix_edge(
  p_mix uuid, p_from_track uuid, p_to_track uuid, p_expected_revision integer
) returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
declare m public.playlist_mixes; e public.playlist_mix_edges; owner_id uuid;
begin
  select * into m from public.playlist_mixes where id = p_mix for update;
  if m.id is null or not public.puede_editar_lista(m.playlist_id) then
    raise exception 'Mix no disponible';
  end if;
  select p.owner_id into owner_id from public.playlists p where p.id = m.playlist_id;
  if m.creator_id <> auth.uid()
    and (owner_id <> auth.uid() or m.visibility = 'private') then
    raise exception 'No podés editar este mix';
  end if;
  if owner_id <> auth.uid() and exists (
    select 1 from public.playlists p where p.id = m.playlist_id and p.published_mix_id = p_mix
  ) then
    raise exception 'Solo el dueño puede editar el mix publicado';
  end if;
  select * into e from public.playlist_mix_edges where mix_id = p_mix
    and from_playlist_track_id = p_from_track and to_playlist_track_id = p_to_track;
  if e.id is null then return false; end if;
  if e.revision <> p_expected_revision then raise exception 'mix_edge_revision_conflict'; end if;
  delete from public.playlist_mix_edges where id = e.id;
  update public.playlist_mixes set revision = revision + 1, updated_at = now() where id = p_mix;
  return true;
end;
$$;

create function public.set_playlist_mix_choice(p_playlist uuid, p_mode text, p_mix uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not public.puede_ver_lista(p_playlist) then
    raise exception 'Lista no disponible';
  end if;
  if p_mode not in ('default', 'selected', 'off')
    or (p_mode = 'selected') <> (p_mix is not null) then
    raise exception 'Elección de mix inválida';
  end if;
  if p_mix is not null and not exists (
    select 1 from public.playlist_mixes m where m.id = p_mix and m.playlist_id = p_playlist
      and (m.creator_id = auth.uid()
        or (m.visibility = 'shared' and public.puede_editar_lista(p_playlist))
        or exists (select 1 from public.playlists p
          where p.id = p_playlist and p.published_mix_id = p_mix))
  ) then
    raise exception 'Mix no disponible';
  end if;
  insert into public.user_playlist_mix_choices (user_id, playlist_id, mode, mix_id)
  values (auth.uid(), p_playlist, p_mode, p_mix)
  on conflict (user_id, playlist_id) do update set
    mode = excluded.mode, mix_id = excluded.mix_id, updated_at = now();
end;
$$;

create function public.save_playlist_sound_profile(
  p_playlist uuid, p_expected_revision integer, p_bands_db jsonb, p_preamp_db numeric
) returns public.playlist_sound_profiles language plpgsql security definer
set search_path = public, pg_temp as $$
declare result public.playlist_sound_profiles; owner_id uuid;
begin
  select p.owner_id into owner_id from public.playlists p where p.id = p_playlist for update;
  if owner_id is null or owner_id <> auth.uid() then
    raise exception 'Solo el dueño puede editar el sonido de la lista';
  end if;
  select * into result from public.playlist_sound_profiles where playlist_id = p_playlist;
  if result.playlist_id is null then
    if p_expected_revision is not null then raise exception 'sound_profile_revision_conflict'; end if;
    insert into public.playlist_sound_profiles (playlist_id, author_id, bands_db, preamp_db)
    values (p_playlist, auth.uid(), p_bands_db, p_preamp_db) returning * into result;
  else
    if result.revision <> p_expected_revision then raise exception 'sound_profile_revision_conflict'; end if;
    update public.playlist_sound_profiles set bands_db = p_bands_db, preamp_db = p_preamp_db,
      author_id = auth.uid(), revision = revision + 1, updated_at = now()
    where playlist_id = p_playlist returning * into result;
  end if;
  return result;
end;
$$;

create function public.publish_playlist_sound_profile(p_playlist uuid, p_published boolean)
returns public.playlist_sound_profiles language plpgsql security definer
set search_path = public, pg_temp as $$
declare result public.playlist_sound_profiles; owner_id uuid;
begin
  select p.owner_id into owner_id from public.playlists p where p.id = p_playlist for update;
  if owner_id is null or owner_id <> auth.uid() then
    raise exception 'Solo el dueño puede publicar el sonido de la lista';
  end if;
  update public.playlist_sound_profiles set published = p_published,
    revision = revision + 1, updated_at = now()
  where playlist_id = p_playlist returning * into result;
  if result.playlist_id is null then raise exception 'Esta lista no tiene un sonido guardado'; end if;
  return result;
end;
$$;

revoke all on function public.create_playlist_mix(uuid, text, text, integer),
  public.duplicate_playlist_mix(uuid, text),
  public.update_playlist_mix(uuid, integer, text, text, text, integer),
  public.delete_playlist_mix(uuid),
  public.publish_playlist_mix(uuid, uuid, boolean),
  public.save_playlist_mix_edge(uuid, uuid, uuid, integer, text, integer, integer, integer, text, jsonb, jsonb, jsonb, jsonb),
  public.delete_playlist_mix_edge(uuid, uuid, uuid, integer),
  public.set_playlist_mix_choice(uuid, text, uuid),
  public.save_playlist_sound_profile(uuid, integer, jsonb, numeric),
  public.publish_playlist_sound_profile(uuid, boolean)
from public;

grant execute on function public.create_playlist_mix(uuid, text, text, integer),
  public.duplicate_playlist_mix(uuid, text),
  public.update_playlist_mix(uuid, integer, text, text, text, integer),
  public.delete_playlist_mix(uuid),
  public.publish_playlist_mix(uuid, uuid, boolean),
  public.save_playlist_mix_edge(uuid, uuid, uuid, integer, text, integer, integer, integer, text, jsonb, jsonb, jsonb, jsonb),
  public.delete_playlist_mix_edge(uuid, uuid, uuid, integer),
  public.set_playlist_mix_choice(uuid, text, uuid),
  public.save_playlist_sound_profile(uuid, integer, jsonb, numeric),
  public.publish_playlist_sound_profile(uuid, boolean)
to authenticated;

-- Guardar una copia de una lista pública conserva su Mix publicado y el sonido
-- publicado como entidades nuevas. Los extremos se remapean por video_id, que
-- ya es único dentro de cada playlist; nunca se reutiliza un ID de fila ajeno.
create or replace function public.copy_playlist(p_source uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  source public.playlists;
  result_id uuid;
  source_mix public.playlist_mixes;
  result_mix_id uuid;
begin
  select * into source from public.playlists p
  where p.id = p_source
    and (p.visibilidad = 'publica' or p.owner_id = auth.uid());
  if source.id is null then raise exception 'Esa lista no está disponible'; end if;

  insert into public.playlists (owner_id, name, visibilidad)
  values (auth.uid(), source.name, 'privada') returning id into result_id;

  insert into public.playlist_tracks (
    playlist_id, video_id, title, artist, artist_id,
    artwork_url, artwork_path, audio_path, duration_ms, true_peak, position
  )
  select result_id, t.video_id, t.title, t.artist, t.artist_id,
    t.artwork_url, t.artwork_path, t.audio_path, t.duration_ms, t.true_peak,
    row_number() over (order by t.position)
  from public.playlist_tracks t where t.playlist_id = p_source;

  if source.published_mix_id is not null then
    select * into source_mix from public.playlist_mixes where id = source.published_mix_id;
    if source_mix.id is not null then
      insert into public.playlist_mixes
        (playlist_id, creator_id, name, default_preset, default_duration_ms)
      values (result_id, auth.uid(), source_mix.name,
        source_mix.default_preset, source_mix.default_duration_ms)
      returning id into result_mix_id;

      insert into public.playlist_mix_edges
        (mix_id, playlist_id, from_playlist_track_id, to_playlist_track_id,
         preset, duration_ms, from_cue_ms, to_cue_ms, volume_law,
         volume_out, volume_in, eq_settings, filter_settings)
      select result_mix_id, result_id, new_from.id, new_to.id,
        e.preset, e.duration_ms, e.from_cue_ms, e.to_cue_ms, e.volume_law,
        e.volume_out, e.volume_in, e.eq_settings, e.filter_settings
      from public.playlist_mix_edges e
      join public.playlist_tracks old_from on old_from.id = e.from_playlist_track_id
      join public.playlist_tracks old_to on old_to.id = e.to_playlist_track_id
      join public.playlist_tracks new_from
        on new_from.playlist_id = result_id and new_from.video_id = old_from.video_id
      join public.playlist_tracks new_to
        on new_to.playlist_id = result_id and new_to.video_id = old_to.video_id
      where e.mix_id = source_mix.id;

      update public.playlists set published_mix_id = result_mix_id,
        mix_enabled = source.mix_enabled where id = result_id;
    end if;
  end if;

  insert into public.playlist_sound_profiles
    (playlist_id, author_id, bands_db, preamp_db, published)
  select result_id, auth.uid(), s.bands_db, s.preamp_db, true
  from public.playlist_sound_profiles s
  where s.playlist_id = p_source and s.published;

  return result_id;
end;
$$;

revoke all on function public.copy_playlist(uuid) from public;
grant execute on function public.copy_playlist(uuid) to authenticated;
