import { useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createStore, useStore } from './store'

/** El perfil tonal compartido es opcional para cada oyente y dispositivo. */
const KEY = 'sonido-playlists:v1'
const store = createStore<{ loaded: boolean; disabled: Record<string, true> }>({ loaded: false, disabled: {} })
let loading: Promise<void> | null = null
let saving = Promise.resolve()

export function cargarPreferenciasSonidoPlaylist(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY)
      const value = raw ? JSON.parse(raw) as unknown : null
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const disabled = Object.fromEntries(Object.entries(value).filter(([key, flag]) => key.length > 0 && flag === true)) as Record<string, true>
        store.set({ disabled })
      }
    } catch {
      // Un ajuste local dañado no impide reproducir la playlist.
    } finally { store.set({ loaded: true }) }
  })()
  return loading
}

export function setPlaylistSoundPreference(playlistId: string, enabled: boolean): void {
  if (!playlistId) return
  const previous = store.get().disabled
  const disabled = { ...previous }
  if (enabled) delete disabled[playlistId]
  else disabled[playlistId] = true
  store.set({ disabled, loaded: true })
  saving = saving.then(() => AsyncStorage.setItem(KEY, JSON.stringify(disabled))).catch(() => {})
}

export function usePlaylistSoundPreference(playlistId: string | null): { loaded: boolean; enabled: boolean } {
  useEffect(() => { void cargarPreferenciasSonidoPlaylist() }, [])
  const loaded = useStore(store, state => state.loaded)
  const enabled = useStore(store, state => !playlistId || state.disabled[playlistId] !== true)
  return { loaded, enabled }
}
