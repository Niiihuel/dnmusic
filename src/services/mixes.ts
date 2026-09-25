import { getSupabase } from '../lib/supabase'

/** IDs persistidos; los nombres visibles se traducen en la UI. */
export type MixPreset = 'auto' | 'fade' | 'crescendo' | 'fusion' | 'none' | 'custom'
export type MixVisibility = 'private' | 'shared'
export type VolumeLaw = 'linear' | 'equal_power'
export type EnvelopePoint = { t: number; value: number }

export type TransitionEq = {
  version: 1
  enabled: boolean
  out: Record<'low' | 'mid' | 'high', EnvelopePoint[]>
  in: Record<'low' | 'mid' | 'high', EnvelopePoint[]>
}

export type TransitionFilter = {
  version: 1
  enabled: boolean
  out: { kind: 'lowpass' | 'highpass'; cutoff: EnvelopePoint[] } | null
  in: { kind: 'lowpass' | 'highpass'; cutoff: EnvelopePoint[] } | null
}

export type PlaylistMix = {
  id: string
  playlistId: string
  name: string
  creatorId: string
  visibility: MixVisibility
  defaultPreset: MixPreset
  defaultDurationMs: number
  revision: number
  /** Publicado como predeterminado para quien aún no eligió su propia versión. */
  published: boolean
  /** Interruptor de la playlist, independiente de conservar o borrar sus mixes. */
  enabled: boolean
  updatedAt: Date
}

export type MixEdge = {
  id: string
  mixId: string
  playlistId: string
  fromPlaylistTrackId: string
  toPlaylistTrackId: string
  preset: MixPreset
  durationMs: number
  fromCueMs: number | null
  toCueMs: number | null
  volumeLaw: VolumeLaw
  volumeOut: EnvelopePoint[] | null
  volumeIn: EnvelopePoint[] | null
  eqSettings: TransitionEq | null
  filterSettings: TransitionFilter | null
  revision: number
  updatedAt: Date
}

export type MixEdgeInput = Pick<MixEdge,
  'preset' | 'durationMs' | 'fromCueMs' | 'toCueMs' | 'volumeLaw' |
  'volumeOut' | 'volumeIn'
> & {
  eqSettings?: TransitionEq | null
  filterSettings?: TransitionFilter | null
}

export type PlaylistMixChoice =
  | { mode: 'default'; mixId: null }
  | { mode: 'off'; mixId: null }
  | { mode: 'selected'; mixId: string }

export type PlaylistMixPermissions = { canEdit: boolean; canPublish: boolean }

export type PlaylistSoundProfile = {
  playlistId: string
  authorId: string
  /** 31, 62, 125, 250, 500 Hz, 1, 2, 4, 8 y 16 kHz; cada una ±12 dB. */
  bandsDb: number[]
  preampDb: number
  published: boolean
  revision: number
  updatedAt: Date
}

const PRESETS: readonly MixPreset[] = ['auto', 'fade', 'crescendo', 'fusion', 'none', 'custom']

function assertPreset(value: MixPreset): void {
  if (!PRESETS.includes(value)) throw new Error('Preset de mix inválido.')
}

function assertDuration(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 30_000) {
    throw new Error('La transición debe durar entre 0 y 30 segundos.')
  }
}

function assertCue(value: number | null): void {
  if (value !== null && (!Number.isInteger(value) || value < 0)) {
    throw new Error('El punto de entrada o salida es inválido.')
  }
}

function assertEnvelope(points: EnvelopePoint[] | null, min: number, max: number): void {
  if (points === null) return
  if (!Array.isArray(points) || points.length < 2 || points.length > 16
    || points[0]?.t !== 0 || points[points.length - 1]?.t !== 1) {
    throw new Error('La curva debe empezar en 0 y terminar en 1.')
  }
  let previous = -1
  for (const point of points) {
    if (typeof point !== 'object' || point === null
      || !Number.isFinite(point.t) || point.t <= previous || point.t < 0 || point.t > 1
      || !Number.isFinite(point.value) || point.value < min || point.value > max) {
      throw new Error('La curva tiene puntos inválidos.')
    }
    previous = point.t
  }
}

function assertEq(settings: TransitionEq | null | undefined): void {
  if (settings == null) return
  if (settings.version !== 1 || typeof settings.enabled !== 'boolean') {
    throw new Error('El EQ de transición no tiene un formato conocido.')
  }
  for (const deck of [settings.out, settings.in]) {
    if (!deck) throw new Error('Faltan curvas del EQ de transición.')
    for (const band of ['low', 'mid', 'high'] as const) {
      if (!deck[band]) throw new Error('Falta una banda del EQ de transición.')
      assertEnvelope(deck[band], -24, 24)
    }
  }
}

function assertFilter(settings: TransitionFilter | null | undefined): void {
  if (settings == null) return
  if (settings.version !== 1 || typeof settings.enabled !== 'boolean') {
    throw new Error('El filtro de transición no tiene un formato conocido.')
  }
  for (const deck of [settings.out, settings.in]) {
    if (deck === null) continue
    if (!deck || !['lowpass', 'highpass'].includes(deck.kind)) {
      throw new Error('El tipo de filtro es inválido.')
    }
    if (!deck.cutoff) throw new Error('Falta la curva de frecuencia del filtro.')
    assertEnvelope(deck.cutoff, 20, 20_000)
  }
}

function assertEdgeInput(input: MixEdgeInput): void {
  assertPreset(input.preset)
  assertDuration(input.durationMs)
  assertCue(input.fromCueMs)
  assertCue(input.toCueMs)
  if (input.volumeLaw !== 'linear' && input.volumeLaw !== 'equal_power') {
    throw new Error('La ley de volumen es inválida.')
  }
  assertEnvelope(input.volumeOut, 0, 1)
  assertEnvelope(input.volumeIn, 0, 1)
  assertEq(input.eqSettings)
  assertFilter(input.filterSettings)
}

function asRow(data: unknown): Record<string, unknown> {
  if (Array.isArray(data)) {
    if (data.length !== 1) throw new Error('La base no confirmó una sola operación de mix.')
    return asRow(data[0])
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('La base devolvió un mix incompleto.')
  }
  const row = data as Record<string, unknown>
  if (typeof row.id !== 'string' && typeof row.playlist_id !== 'string') {
    throw new Error('La base no confirmó el cambio del mix.')
  }
  return row
}

function readDate(value: unknown): Date {
  const result = new Date(typeof value === 'string' ? value : 0)
  if (Number.isNaN(result.getTime())) throw new Error('Fecha inválida en un mix.')
  return result
}

function mixFromRow(row: Record<string, unknown>, publishedId: string | null, enabled: boolean): PlaylistMix {
  return {
    id: row.id as string,
    playlistId: row.playlist_id as string,
    name: row.name as string,
    creatorId: row.creator_id as string,
    visibility: row.visibility as MixVisibility,
    defaultPreset: row.default_preset as MixPreset,
    defaultDurationMs: row.default_duration_ms as number,
    revision: row.revision as number,
    published: row.id === publishedId,
    enabled,
    updatedAt: readDate(row.updated_at),
  }
}

function edgeFromRow(row: Record<string, unknown>): MixEdge {
  return {
    id: row.id as string,
    mixId: row.mix_id as string,
    playlistId: row.playlist_id as string,
    fromPlaylistTrackId: row.from_playlist_track_id as string,
    toPlaylistTrackId: row.to_playlist_track_id as string,
    preset: row.preset as MixPreset,
    durationMs: row.duration_ms as number,
    fromCueMs: (row.from_cue_ms as number | null) ?? null,
    toCueMs: (row.to_cue_ms as number | null) ?? null,
    volumeLaw: row.volume_law as VolumeLaw,
    volumeOut: (row.volume_out as EnvelopePoint[] | null) ?? null,
    volumeIn: (row.volume_in as EnvelopePoint[] | null) ?? null,
    eqSettings: (row.eq_settings as TransitionEq | null) ?? null,
    filterSettings: (row.filter_settings as TransitionFilter | null) ?? null,
    revision: row.revision as number,
    updatedAt: readDate(row.updated_at),
  }
}

function soundFromRow(row: Record<string, unknown>): PlaylistSoundProfile {
  return {
    playlistId: row.playlist_id as string,
    authorId: row.author_id as string,
    bandsDb: row.bands_db as number[],
    preampDb: Number(row.preamp_db),
    published: row.published === true,
    revision: row.revision as number,
    updatedAt: readDate(row.updated_at),
  }
}

async function playlistMixState(playlistId: string): Promise<{ publishedId: string | null; enabled: boolean }> {
  const { data, error } = await getSupabase().from('playlists')
    .select('published_mix_id, mix_enabled').eq('id', playlistId).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Lista no disponible.')
  return {
    publishedId: (data.published_mix_id as string | null) ?? null,
    enabled: data.mix_enabled === true,
  }
}

/** Permisos derivados de la base, para no confiar en parámetros del enlace. */
export async function getPlaylistMixPermissions(
  playlistId: string, userId: string | null,
): Promise<PlaylistMixPermissions> {
  const [playlist, edit] = await Promise.all([
    getSupabase().from('playlists').select('owner_id').eq('id', playlistId).maybeSingle(),
    getSupabase().rpc('puede_editar_lista', { p_playlist: playlistId }),
  ])
  if (playlist.error) throw playlist.error
  if (edit.error) throw edit.error
  if (!playlist.data) throw new Error('Lista no disponible.')
  return {
    canEdit: edit.data === true,
    canPublish: !!userId && playlist.data.owner_id === userId,
  }
}

/** Solo devuelve variantes visibles para esta cuenta; RLS protege los borradores privados. */
export async function listPlaylistMixes(playlistId: string): Promise<PlaylistMix[]> {
  const [state, query] = await Promise.all([
    playlistMixState(playlistId),
    getSupabase().from('playlist_mixes').select('*')
      .eq('playlist_id', playlistId).order('updated_at', { ascending: false }),
  ])
  if (query.error) throw query.error
  return (query.data ?? []).map(row => mixFromRow(row, state.publishedId, state.enabled))
}

export async function getPlaylistMix(mixId: string): Promise<PlaylistMix | null> {
  const { data, error } = await getSupabase().from('playlist_mixes')
    .select('*').eq('id', mixId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const state = await playlistMixState(data.playlist_id as string)
  return mixFromRow(data, state.publishedId, state.enabled)
}

export async function createPlaylistMix(
  playlistId: string,
  name: string,
  options: { preset?: MixPreset; durationMs?: number } = {},
): Promise<PlaylistMix> {
  const clean = name.trim()
  if (!clean || clean.length > 60) throw new Error('El nombre debe tener entre 1 y 60 caracteres.')
  const preset = options.preset ?? 'auto'
  const durationMs = options.durationMs ?? 4000
  assertPreset(preset)
  assertDuration(durationMs)
  const { data, error } = await getSupabase().rpc('create_playlist_mix', {
    p_playlist: playlistId, p_name: clean, p_preset: preset, p_duration_ms: durationMs,
  })
  if (error) throw error
  const state = await playlistMixState(playlistId)
  return mixFromRow(asRow(data), state.publishedId, state.enabled)
}

export async function duplicatePlaylistMix(mixId: string, name: string): Promise<PlaylistMix> {
  const clean = name.trim()
  if (!clean || clean.length > 60) throw new Error('El nombre debe tener entre 1 y 60 caracteres.')
  const { data, error } = await getSupabase().rpc('duplicate_playlist_mix', {
    p_mix: mixId, p_name: clean,
  })
  if (error) throw error
  const row = asRow(data)
  const state = await playlistMixState(row.playlist_id as string)
  return mixFromRow(row, state.publishedId, state.enabled)
}

/** El `revision` recibido en pantalla evita pisar cambios de otra sesión. */
export async function updatePlaylistMix(
  mix: PlaylistMix,
  patch: Partial<Pick<PlaylistMix, 'name' | 'visibility' | 'defaultPreset' | 'defaultDurationMs'>>,
): Promise<PlaylistMix> {
  const name = (patch.name ?? mix.name).trim()
  const visibility = patch.visibility ?? mix.visibility
  const preset = patch.defaultPreset ?? mix.defaultPreset
  const durationMs = patch.defaultDurationMs ?? mix.defaultDurationMs
  if (!name || name.length > 60) throw new Error('El nombre debe tener entre 1 y 60 caracteres.')
  if (visibility !== 'private' && visibility !== 'shared') throw new Error('Visibilidad de mix inválida.')
  assertPreset(preset)
  assertDuration(durationMs)
  const { data, error } = await getSupabase().rpc('update_playlist_mix', {
    p_mix: mix.id,
    p_expected_revision: mix.revision,
    p_name: name,
    p_visibility: visibility,
    p_preset: preset,
    p_duration_ms: durationMs,
  })
  if (error) throw error
  const row = asRow(data)
  const state = await playlistMixState(row.playlist_id as string)
  return mixFromRow(row, state.publishedId, state.enabled)
}

export async function renamePlaylistMix(mix: PlaylistMix, name: string): Promise<PlaylistMix> {
  return updatePlaylistMix(mix, { name })
}

export async function deletePlaylistMix(mixId: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('delete_playlist_mix', { p_mix: mixId })
  if (error) throw error
  return data === true
}

/** `null` quita el publicado; `enabled=false` conserva todas las variantes. */
export async function publishPlaylistMix(
  playlistId: string, mixId: string | null, enabled = mixId !== null,
): Promise<void> {
  const { error } = await getSupabase().rpc('publish_playlist_mix', {
    p_playlist: playlistId, p_mix: mixId, p_enabled: enabled,
  })
  if (error) throw error
}

export async function setPlaylistMixEnabled(playlistId: string, enabled: boolean): Promise<void> {
  const state = await playlistMixState(playlistId)
  await publishPlaylistMix(playlistId, state.publishedId, enabled)
}

export async function listMixEdges(mixId: string): Promise<MixEdge[]> {
  const { data, error } = await getSupabase().from('playlist_mix_edges')
    .select('*').eq('mix_id', mixId)
  if (error) throw error
  return (data ?? []).map(edgeFromRow)
}

export async function getMixEdge(
  mixId: string, fromPlaylistTrackId: string, toPlaylistTrackId: string,
): Promise<MixEdge | null> {
  const { data, error } = await getSupabase().from('playlist_mix_edges').select('*')
    .eq('mix_id', mixId)
    .eq('from_playlist_track_id', fromPlaylistTrackId)
    .eq('to_playlist_track_id', toPlaylistTrackId)
    .maybeSingle()
  if (error) throw error
  return data ? edgeFromRow(data) : null
}

/** `expectedRevision=null` crea; con número edita solo la revisión vista. */
export async function saveMixEdge(
  mixId: string,
  fromPlaylistTrackId: string,
  toPlaylistTrackId: string,
  input: MixEdgeInput,
  expectedRevision: number | null = null,
): Promise<MixEdge> {
  if (fromPlaylistTrackId === toPlaylistTrackId) throw new Error('Elegí dos canciones diferentes.')
  assertEdgeInput(input)
  const { data, error } = await getSupabase().rpc('save_playlist_mix_edge', {
    p_mix: mixId,
    p_from_track: fromPlaylistTrackId,
    p_to_track: toPlaylistTrackId,
    p_expected_revision: expectedRevision,
    p_preset: input.preset,
    p_duration_ms: input.durationMs,
    p_from_cue_ms: input.fromCueMs,
    p_to_cue_ms: input.toCueMs,
    p_volume_law: input.volumeLaw,
    p_volume_out: input.volumeOut,
    p_volume_in: input.volumeIn,
    p_eq_settings: input.eqSettings ?? null,
    p_filter_settings: input.filterSettings ?? null,
  })
  if (error) throw error
  return edgeFromRow(asRow(data))
}

export async function deleteMixEdge(edge: MixEdge): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('delete_playlist_mix_edge', {
    p_mix: edge.mixId,
    p_from_track: edge.fromPlaylistTrackId,
    p_to_track: edge.toPlaylistTrackId,
    p_expected_revision: edge.revision,
  })
  if (error) throw error
  return data === true
}

export async function getPlaylistMixChoice(playlistId: string): Promise<PlaylistMixChoice> {
  const { data, error } = await getSupabase().from('user_playlist_mix_choices')
    .select('mode, mix_id').eq('playlist_id', playlistId).maybeSingle()
  if (error) throw error
  if (data?.mode === 'selected' && typeof data.mix_id === 'string') {
    return { mode: 'selected', mixId: data.mix_id }
  }
  if (data?.mode === 'off') return { mode: 'off', mixId: null }
  return { mode: 'default', mixId: null }
}

export async function setPlaylistMixChoice(playlistId: string, choice: PlaylistMixChoice): Promise<void> {
  const { error } = await getSupabase().rpc('set_playlist_mix_choice', {
    p_playlist: playlistId, p_mode: choice.mode, p_mix: choice.mixId,
  })
  if (error) throw error
}

/** Resuelve la decisión personal y la publicación de la lista al entrar a reproducir. */
export async function getSelectedPlaylistMix(playlistId: string): Promise<PlaylistMix | null> {
  const [choice, mixes] = await Promise.all([
    getPlaylistMixChoice(playlistId), listPlaylistMixes(playlistId),
  ])
  if (choice.mode === 'off') return null
  if (choice.mode === 'selected') return mixes.find(mix => mix.id === choice.mixId) ?? null
  return mixes.find(mix => mix.published && mix.enabled) ?? null
}

export async function getPlaylistSoundProfile(playlistId: string): Promise<PlaylistSoundProfile | null> {
  const { data, error } = await getSupabase().from('playlist_sound_profiles')
    .select('*').eq('playlist_id', playlistId).maybeSingle()
  if (error) throw error
  return data ? soundFromRow(data) : null
}

export async function savePlaylistSoundProfile(
  playlistId: string,
  input: { bandsDb: number[]; preampDb: number },
  expectedRevision: number | null = null,
): Promise<PlaylistSoundProfile> {
  if (input.bandsDb.length !== 10 || input.bandsDb.some(v => !Number.isFinite(v) || v < -12 || v > 12)
    || !Number.isFinite(input.preampDb) || input.preampDb < -24 || input.preampDb > 6) {
    throw new Error('El sonido de la playlist tiene valores fuera de rango.')
  }
  const { data, error } = await getSupabase().rpc('save_playlist_sound_profile', {
    p_playlist: playlistId,
    p_expected_revision: expectedRevision,
    p_bands_db: input.bandsDb,
    p_preamp_db: input.preampDb,
  })
  if (error) throw error
  return soundFromRow(asRow(data))
}

export async function publishPlaylistSoundProfile(
  playlistId: string, published: boolean,
): Promise<PlaylistSoundProfile> {
  const { data, error } = await getSupabase().rpc('publish_playlist_sound_profile', {
    p_playlist: playlistId, p_published: published,
  })
  if (error) throw error
  return soundFromRow(asRow(data))
}
