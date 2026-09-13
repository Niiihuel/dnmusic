import { createStore, useStore } from './store'
export type EstadoCopia = 'idle' | 'pending' | 'copied' | 'error'
const store = createStore<{ texto: string | null; estado: EstadoCopia }>({ texto: null, estado: 'idle' })
let sequence = 0
let reset: ReturnType<typeof setTimeout> | undefined
/** La secuencia evita que una copia lenta sobrescriba una más reciente. */
export function iniciarCopia(texto: string) {
  clearTimeout(reset)
  const id = ++sequence
  store.set({ texto, estado: 'pending' })
  return (ok: boolean) => {
    if (id !== sequence) return
    store.set({ estado: ok ? 'copied' : 'error' })
    reset = setTimeout(() => { store.set({ texto: null, estado: 'idle' }) }, 2000)
  }
}
export const useEstadoCopia = (texto?: string) => useStore(store, s => texto !== undefined && s.texto === texto ? s.estado : 'idle')
