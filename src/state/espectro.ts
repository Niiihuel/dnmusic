import { createStore, useStore } from './store'
const store = createStore<{ videoId: string | null; bandas: number[] | null }>({
  videoId: null,
  bandas: null,
})
export function publicarEspectro(videoId: string | null, bandas: number[] | null) {
  store.set({ videoId, bandas })
}
export const useEspectro = () => useStore(store, (s) => s)
