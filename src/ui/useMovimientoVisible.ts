import { useSyncExternalStore } from 'react'
import { AccessibilityInfo, AppState, Platform } from 'react-native'

const oyentes = new Set<() => void>()
const quieto = () => false
const sinSuscripcion = () => () => {}
let movimiento = false
let desmontar: (() => void) | undefined

// Un único conjunto de listeners para tarjetas, discos y portadas. El audio
// continúa en segundo plano; los bucles que sólo dibujan se detienen.
function suscribir(oyente: () => void) {
  oyentes.add(oyente)
  if (oyentes.size === 1) {
    let vivo = true, reducido = true, cambioPreferencia = false
    let activo = AppState.currentState === 'active'
    const web = Platform.OS === 'web'
    const doc = web && typeof document !== 'undefined' ? document : undefined
    const media = web && typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)') : undefined
    const avisar = () => {
      const siguiente = activo && !reducido && !doc?.hidden && !media?.matches
      if (movimiento !== siguiente) { movimiento = siguiente; oyentes.forEach(fn => fn()) }
    }
    const preferencia = AccessibilityInfo.addEventListener('reduceMotionChanged', valor => {
      cambioPreferencia = true; reducido = valor; avisar()
    })
    const app = AppState.addEventListener('change', estado => { activo = estado === 'active'; avisar() })
    doc?.addEventListener('visibilitychange', avisar)
    media?.addEventListener('change', avisar)
    void AccessibilityInfo.isReduceMotionEnabled().then(valor => {
      if (vivo && !cambioPreferencia) { reducido = valor; avisar() }
    }).catch(() => {})
    desmontar = () => {
      vivo = false; movimiento = false
      preferencia.remove(); app.remove()
      doc?.removeEventListener('visibilitychange', avisar)
      media?.removeEventListener('change', avisar)
    }
  }
  return () => {
    oyentes.delete(oyente)
    if (!oyentes.size) { desmontar?.(); desmontar = undefined }
  }
}
const snapshot = () => movimiento

/** Se permite animar sólo con pantalla visible y Reducir movimiento desactivado. */
export function useMovimientoVisible(observar = true): boolean {
  return useSyncExternalStore(observar ? suscribir : sinSuscripcion, observar ? snapshot : quieto, quieto)
}
