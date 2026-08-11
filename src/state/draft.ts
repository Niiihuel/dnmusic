import type { SongSnippet } from '../models/message'
import type { Contact } from '../services/contacts'
import { createStore, useStore } from './store'

/**
 * Borrador del mensaje que se está escribiendo.
 *
 * Vive fuera de las pantallas porque el composer y el selector de canción son
 * rutas distintas: expo-router solo puede pasar strings por la URL, y meter una
 * canción entera con su letra ahí sería impracticable. El borrador se limpia
 * explícitamente al enviar o al cancelar.
 */
type DraftState = {
  text: string
  song: SongSnippet | null
  recipient: Contact | null
  /** Evita que el composer herede el hilo activo al agregar un contacto. */
  chooseRecipient: boolean
}

const EMPTY: DraftState = {
  text: '',
  song: null,
  recipient: null,
  chooseRecipient: false,
}

const store = createStore<DraftState>({ ...EMPTY })

export function setDraft(patch: Partial<DraftState>) {
  store.set(patch)
}

export function resetDraft() {
  store.set({ ...EMPTY })
}

export function getDraft() {
  return store.get()
}

export const useDraft = () => useStore(store, (s) => s)
export const useDraftSong = () => useStore(store, (s) => s.song)
