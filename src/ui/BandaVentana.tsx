import { useEffect, useState, useSyncExternalStore } from 'react'
import { Pressable, View } from 'react-native'
import { ES_WEB } from './Glass'
import { CapaControlesVentana } from './CapaControlesVentana'

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

type EstadoVentana = { maximizada: boolean; pantallaCompleta: boolean }
type PuenteVentana = {
  controlesPropios: boolean
  estado: () => Promise<EstadoVentana>
  accion: (accion: 'minimizar' | 'maximizar' | 'cerrar') => Promise<void>
  alCambiar: (fn: (estado: EstadoVentana) => void) => () => void
}
const ventanaLinux = ES_WEB
  ? (globalThis as { dnmusicEscritorio?: { ventana?: PuenteVentana } }).dnmusicEscritorio?.ventana
  : undefined
const CONTROLES_LINUX = ventanaLinux?.controlesPropios === true

/** API presence alone also matches ordinary Chromium tabs, where visible=false. */
export const HAY_BANDA_VENTANA = CONTROLES_LINUX || !!controles()?.visible
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
 * One compact title-bar row for every route, including login/settings.
 * Windows uses native overlay geometry and snap layouts. Linux reserves a
 * fixed row with controls on the right, independent of desktop preferences.
 */
export function BandaVentana() {
  const geometry = useSyncExternalStore(suscribirGeometria, leerGeometria, () => '')
  if (CONTROLES_LINUX) return <BandaLinux />
  if (!geometry) return null
  const [x, y, width, height] = JSON.parse(geometry) as number[]
  return <View accessible={false} className="dn-banda-ventana" style={{ height: Math.max(0, y + height), flexShrink: 0 }}>
    <View accessible={false} className="dn-arrastrar" style={{ position: 'absolute', left: x, top: y, width, height }} />
  </View>
}

/** Reserva compacta en todas las rutas; los botones siguen accesibles sobre modales. */
function BandaLinux() {
  const [estado, setEstado] = useState<EstadoVentana>({ maximizada: false, pantallaCompleta: false })
  useEffect(() => {
    let vivo = true, cambios = 0
    const salir = ventanaLinux!.alCambiar(siguiente => { cambios++; if (vivo) setEstado(siguiente) })
    void ventanaLinux!.estado().then(inicial => { if (vivo && cambios === 0) setEstado(inicial) }).catch(() => {})
    return () => { vivo = false; salir() }
  }, [])
  if (estado.pantallaCompleta) return null
  const ejecutar = (accion: 'minimizar' | 'maximizar' | 'cerrar') => {
    void ventanaLinux!.accion(accion).catch(() => {})
  }
  return <View className="dn-banda-ventana dn-linux-titlebar" style={{ height: 32, flexShrink: 0 }}>
    <View accessible={false} className="dn-arrastrar" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 138 }} />
    <CapaControlesVentana><View className="dn-no-arrastrar" style={{ position: 'fixed' as 'absolute', top: 0, right: 0, height: 32, flexDirection: 'row', zIndex: 2147483647 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Minimizar ventana" onPress={() => ejecutar('minimizar')}
        className="dn-window-button dn-no-arrastrar"><View pointerEvents="none" className="dn-window-icon dn-window-minimize" /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={estado.maximizada ? 'Restaurar ventana' : 'Maximizar ventana'} onPress={() => ejecutar('maximizar')}
        className="dn-window-button dn-no-arrastrar"><View pointerEvents="none" className={`dn-window-icon ${estado.maximizada ? 'dn-window-restore' : 'dn-window-maximize'}`} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar ventana" onPress={() => ejecutar('cerrar')}
        className="dn-window-button dn-window-close dn-no-arrastrar"><View pointerEvents="none" className="dn-window-icon dn-window-cross" /></Pressable>
    </View></CapaControlesVentana>
  </View>
}
