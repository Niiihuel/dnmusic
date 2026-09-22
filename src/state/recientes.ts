import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ArtistResult, TrackResult } from '../services/music'
import { createStore, useStore } from './store'

export type RecienteBusqueda =
  | { tipo: 'consulta'; id: string; termino: string }
  | { tipo: 'cancion'; id: string; track: TrackResult }
  | { tipo: 'artista'; id: string; artist: ArtistResult }

const CLAVE = 'dnmusic.recientes.v2'
const ANTERIOR = 'dnmusic.recientes.v1'
const TOPE = 15
const store = createStore<{ items: RecienteBusqueda[] | null }>({ items: null })
let lectura: Promise<void> | null = null
let escritura = Promise.resolve()
let revision = 0

/** Sólo metadata de catálogo, nunca URLs de audio firmadas ni tokens. */
function cancion(t: TrackResult): RecienteBusqueda {
  return { tipo: 'cancion', id: `cancion:${t.videoId}`, track: {
    videoId: t.videoId, title: t.title, artist: t.artist, artistId: t.artistId ?? null,
    artworkUrl: t.artworkUrl ?? '', album: t.album ?? '', albumId: t.albumId ?? null,
    durationMs: Number.isFinite(t.durationMs) ? t.durationMs : 0,
    ...(t.audioPath ? { audioPath: t.audioPath, artworkPath: t.artworkPath ?? null } : {}),
  } }
}
function artista(a: ArtistResult): RecienteBusqueda {
  return { tipo: 'artista', id: `artista:${a.id}`, artist: { id: a.id, name: a.name, photoUrl: a.photoUrl ?? '', subtitle: 'Artista' } }
}
function consulta(termino: string): RecienteBusqueda {
  return { tipo: 'consulta', id: `consulta:${termino.toLocaleLowerCase('es')}`, termino }
}
function leer(crudo: string | null): RecienteBusqueda[] {
  if (!crudo) return []
  const data: unknown = JSON.parse(crudo)
  if (!Array.isArray(data)) return []
  return data.flatMap((r): RecienteBusqueda[] => {
    if (typeof r === 'string' && r.trim()) return [consulta(r.trim())]
    if (!r || typeof r !== 'object') return []
    if (r.tipo === 'consulta' && typeof r.termino === 'string' && r.termino.trim()) return [consulta(r.termino.trim())]
    if (r.tipo === 'cancion' && typeof r.track?.videoId === 'string' && typeof r.track?.title === 'string' && typeof r.track?.artist === 'string' && typeof r.track?.artworkUrl === 'string') return [cancion(r.track)]
    if (r.tipo === 'artista' && typeof r.artist?.id === 'string' && typeof r.artist?.name === 'string' && typeof r.artist?.photoUrl === 'string') return [artista(r.artist)]
    return []
  }).filter((r, i, all) => all.findIndex(a => a.id === r.id) === i).slice(0, TOPE)
}

export function cargarRecientes(): Promise<void> {
  if (store.get().items !== null) return Promise.resolve()
  if (lectura) return lectura
  const version = revision
  lectura = (async () => {
    let items: RecienteBusqueda[] = []
    try { items = leer(await AsyncStorage.getItem(CLAVE) ?? await AsyncStorage.getItem(ANTERIOR)) } catch { /* Historial corrupto no impide buscar. */ }
    if (revision === version) store.set({ items })
  })().finally(() => { lectura = null })
  return lectura
}
function guardar(items: RecienteBusqueda[]) {
  revision++
  store.set({ items })
  // Serializar evita que un guardado lento restaure lo que se acaba de borrar.
  escritura = escritura.then(() => AsyncStorage.setItem(CLAVE, JSON.stringify(items))).catch(() => {})
}
async function recordar(item: RecienteBusqueda) {
  const version = revision
  await cargarRecientes()
  if (revision !== version && store.get().items?.length === 0) return
  guardar([item, ...(store.get().items ?? []).filter(r => r.id !== item.id)].slice(0, TOPE))
}
export function recordarBusqueda(termino: string) { if (termino.trim()) void recordar(consulta(termino.trim())) }
export function recordarCancion(track: TrackResult) { void recordar(cancion(track)) }
export function recordarArtista(artist: ArtistResult) { void recordar(artista(artist)) }
export function olvidarBusqueda(id: string) { guardar((store.get().items ?? []).filter(r => r.id !== id)) }
export function limpiarRecientes() { guardar([]) }
export const useRecientes = () => useStore(store, s => s.items)
