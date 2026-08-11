import { useSyncExternalStore } from 'react'

/**
 * Store externo mínimo.
 *
 * Mismo criterio que zuno: sin Redux ni Zustand. El estado vive fuera de React
 * y los componentes se suscriben con useSyncExternalStore, así una hoja que
 * solo mira una porción no arrastra re-renders de sus hermanos.
 */
export type Store<T> = {
  get: () => T
  set: (partial: Partial<T> | ((prev: T) => Partial<T>)) => void
  subscribe: (listener: () => void) => () => void
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<() => void>()

  return {
    get: () => state,
    set: (partial) => {
      const patch = typeof partial === 'function' ? partial(state) : partial
      const next = { ...state, ...patch }
      // Salida temprana si nada cambió: evita despertar a todos los suscriptores
      // por un set idempotente (pasa seguido con los callbacks de onSnapshot).
      const changed = (Object.keys(patch) as (keyof T)[]).some(
        (key) => !Object.is(state[key], next[key]),
      )
      if (!changed) return
      state = next
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function useStore<T extends object, S>(store: Store<T>, selector: (state: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(store.get()),
  )
}
