import { createStore, useStore } from './store'

const revisions = createStore({ playlistId: '', revision: 0 })

/** La ruta de Mix avisa un reordenamiento para redibujar la playlist abierta. */
export function avisarContenidoPlaylistCambiado(playlistId: string) {
  const current = revisions.get()
  revisions.set({ playlistId, revision: current.revision + 1 })
}

export function usePlaylistContentRevision(playlistId: string | null): number {
  return useStore(revisions, state => state.playlistId === playlistId ? state.revision : 0)
}
