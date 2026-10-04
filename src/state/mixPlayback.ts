import { createStore, useStore } from './store'
import {
  getPlaylistMixChoice,
  getPlaylistSoundProfile,
  listMixEdges,
  listPlaylistMixes,
  type MixEdge,
  type PlaylistMix,
  type PlaylistSoundProfile,
} from '../services/mixes'

export type ActivePlaylistMix = {
  playlistId: string
  mix: PlaylistMix | null
  edges: MixEdge[]
  soundProfile: PlaylistSoundProfile | null
}

const revisions = createStore({ playlistId: '', revision: 0 })

/** La pantalla de edición avisa al motor sin reiniciar la canción que suena. */
export function avisarMixPlaylistCambiado(playlistId: string) {
  const current = revisions.get()
  revisions.set({ playlistId, revision: current.revision + 1 })
}

export function useMixPlaylistRevision(playlistId: string | null): number {
  return useStore(revisions, state => state.playlistId === playlistId ? state.revision : 0)
}

/** Una selección personal tiene prioridad sobre el mix publicado por el dueño. */
export async function loadActivePlaylistMix(playlistId: string): Promise<ActivePlaylistMix> {
  const [mixes, choice, soundProfile] = await Promise.all([
    listPlaylistMixes(playlistId),
    getPlaylistMixChoice(playlistId),
    getPlaylistSoundProfile(playlistId),
  ])
  const mix = choice.mode === 'off'
    ? null
    : choice.mode === 'selected'
      ? mixes.find(item => item.id === choice.mixId) ?? null
      : mixes.find(item => item.published && item.enabled) ?? null
  return {
    playlistId,
    mix,
    edges: mix ? await listMixEdges(mix.id) : [],
    soundProfile: soundProfile?.published ? soundProfile : null,
  }
}
