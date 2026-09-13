import { useSyncExternalStore } from 'react'
import { View } from 'react-native'
import { ES_WEB } from './Glass'

type RectanguloTitulo = { x: number; y: number; width: number; height: number }
type ControlesDeVentana = {
  visible: boolean
  getTitlebarAreaRect: () => RectanguloTitulo
  addEventListener: (type: 'geometrychange', listener: () => void) => void
  removeEventListener: (type: 'geometrychange', listener: () => void) => void
}

function controles(): ControlesDeVentana | undefined {
  if (!ES_WEB || typeof navigator === 'undefined') return undefined
  return (navigator as { windowControlsOverlay?: ControlesDeVentana }).windowControlsOverlay
}

/** API presence alone also matches ordinary Chromium tabs, where visible=false. */
export const HAY_BANDA_VENTANA = !!controles()?.visible
export const ARRASTRE_VENTANA = HAY_BANDA_VENTANA ? 'dn-arrastrar' : ''
export const SIN_ARRASTRE = HAY_BANDA_VENTANA ? 'dn-no-arrastrar' : ''

function leerGeometria(): string {
  const overlay = controles()
  if (!overlay?.visible) return ''
  const rect = overlay.getTitlebarAreaRect()
  // A scalar snapshot stays referentially stable until geometry actually changes.
  return JSON.stringify([rect.x, rect.y, rect.width, rect.height])
}

function suscribirGeometria(onChange: () => void): () => void {
  const overlay = controles()
  if (!overlay) return () => {}
  overlay.addEventListener('geometrychange', onChange)
  return () => overlay.removeEventListener('geometrychange', onChange)
}

/**
 * One compact native title-bar row for every route, including login/settings.
 * Its height comes from Electron, not a guessed left/right button placement.
 * Only the free titlebar rectangle is draggable; native controls keep their
 * own hit testing, Windows snap layouts and Linux window menus.
 */
export function BandaVentana() {
  const geometry = useSyncExternalStore(suscribirGeometria, leerGeometria, () => '')
  if (!geometry) return null
  const [x, y, width, height] = JSON.parse(geometry) as number[]
  return <View accessible={false} className="dn-banda-ventana" style={{ height: Math.max(0, y + height), flexShrink: 0 }}>
    <View accessible={false} className="dn-arrastrar" style={{ position: 'absolute', left: x, top: y, width, height }} />
  </View>
}
