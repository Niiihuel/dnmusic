import type { PlaylistTrack } from '../services/playlists'
import { listarMeGusta, marcarMeGusta, quitarMeGusta } from '../services/gustos'
import { avisar } from './aviso'
import { createStore, useStore } from './store'

/**
 * Los me gusta, del lado del cliente.
 *
 * La lista entera vive en memoria desde el arranque de la sesión. No es un
 * lujo: el corazón del reproductor tiene que saber **al dibujarse** si la
 * canción que suena está marcada, y preguntarle a la base en cada cambio de
 * tema sería un viaje por canción para un dato que cabe entero en un array —
 * son tus corazones, no un catálogo.
 *
 * El toggle es optimista, como los permisos del Jam: el corazón responde ya,
 * y si el servidor dice que no, se vuelve atrás con un aviso. Un botón de
 * gusto que espera un viaje de red se siente roto.
 */

type Estado = {
  /** Del más nuevo al más viejo, como los lista la vista. */
  canciones: PlaylistTrack[]
  /** Si ya se cargaron de la base al menos una vez en esta sesión. */
  cargado: boolean
}

const store = createStore<Estado>({ canciones: [], cargado: false })

/** Carga inicial. La llama el layout cuando hay sesión, junto a las demás. */
export async function cargarMeGusta(): Promise<void> {
  try {
    const canciones = await listarMeGusta()
    store.set({ canciones, cargado: true })
  } catch {
    // Sin la lista, los corazones arrancan apagados; el primer toggle sigue
    // funcionando igual — la verdad se corrige en la próxima carga.
  }
}

/** Al cerrar sesión: los gustos son de quien se fue. */
export function limpiarMeGusta() {
  store.set({ canciones: [], cargado: false })
}

function estaMarcada(canciones: PlaylistTrack[], videoId: string): boolean {
  return canciones.some((c) => c.videoId === videoId)
}

/**
 * Marca o desmarca, según cómo esté. Optimista con vuelta atrás.
 *
 * Trabaja por `videoId` y no por `id`: la misma canción puede llegar como fila
 * de lista, resultado de búsqueda o recomendada, y el corazón es de la
 * **canción**, no de la fila por la que entró.
 */
export function alternarMeGusta(track: PlaylistTrack) {
  const { canciones } = store.get()
  const quitaba = estaMarcada(canciones, track.videoId)
  store.set({
    canciones: quitaba
      ? canciones.filter((c) => c.videoId !== track.videoId)
      : [track, ...canciones],
  })
  void (quitaba ? quitarMeGusta(track.videoId) : marcarMeGusta(track)).catch(() => {
    // Se deshace tal cual: la verdad es la del servidor.
    const ahora = store.get().canciones
    store.set({
      canciones: quitaba
        ? [track, ...ahora.filter((c) => c.videoId !== track.videoId)]
        : ahora.filter((c) => c.videoId !== track.videoId),
    })
    avisar('No se pudo guardar el me gusta.', true)
  })
}

/**
 * Los artistas con corazones, para reforzar las anclas de las recomendaciones.
 *
 * Devuelve cuántos me gusta tiene cada artista **con id** — sin el id del
 * canal no hay catálogo que pedir, igual que en `artistas_mas_escuchados`.
 * Es una lectura del estado ya cargado: las recomendaciones corren cuando la
 * lista se terminó, y para ese entonces esto está en memoria hace rato.
 */
export function gustosPorArtista(): { artist_id: string; artist: string; cuantos: number }[] {
  const porArtista = new Map<string, { artist_id: string; artist: string; cuantos: number }>()
  for (const c of store.get().canciones) {
    if (!c.artistId) continue
    const previo = porArtista.get(c.artistId)
    if (previo) previo.cuantos += 1
    else porArtista.set(c.artistId, { artist_id: c.artistId, artist: c.artist, cuantos: 1 })
  }
  return [...porArtista.values()]
}

export const useMeGusta = () => useStore(store, (s) => s.canciones)
export const useMeGustaCargado = () => useStore(store, (s) => s.cargado)
export const useEsGustada = (videoId: string | undefined) =>
  useStore(store, (s) => (videoId ? estaMarcada(s.canciones, videoId) : false))
export const useCuantosMeGusta = () => useStore(store, (s) => s.canciones.length)
