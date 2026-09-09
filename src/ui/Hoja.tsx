import { estadoControlWeb } from './estadoControl'
import { useEffect, type ReactNode } from 'react'
import { Modal as ModalSistema, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withTiming,
} from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useIsFocused } from 'expo-router/react-navigation'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { volver } from '../lib/volver'
import { ES_WEB } from './Glass'

/**
 * Hasta dónde crece el contenido adentro de una hoja, en una ventana ancha.
 *
 * En el teléfono la hoja mide la pantalla y este tope no hace nada. En
 * escritorio es además el ancho del modal: en 1280px una fila de ícono y texto
 * estirada de borde a borde se lee como dos cosas sueltas, y el subrayado de un
 * campo de texto se vuelve una línea de un metro.
 */
export const ANCHO_HOJA = 520

/** Debajo de esto la app es de pestañas y las hojas son hojas. El mismo corte
 *  que usa toda la app (`SHELL_PX` en `app/_layout.tsx` y `TrackRow`). */
const ESCRITORIO_PX = 780

/** Lo que tarda en subir y en volver a bajar. Los mismos de «Sonando». */
const SUBE_MS = 380
/** El modal aparece más rápido que la hoja: no viaja, solo se presenta. */
const MODAL_MS = 200
/** La franja de app que queda a la vista por encima de la hoja. */
const TOPE = 48

export type MedidaHoja = 'llena' | 'contenido'

/**
 * Si esta pantalla-hoja se está mostrando como modal de escritorio.
 *
 * Las pantallas lo usan para dos ajustes que no pueden adivinar solas:
 *
 *   · el relleno de abajo: en el teléfono reservan el alto del reproductor
 *     flotante (`usePiso`), pero adentro de un modal centrado el reproductor
 *     queda afuera y esa reserva es un hueco muerto de cien píxeles.
 *   · las alturas flexibles: `flex-1` dentro de un modal compacto —que mide su
 *     contenido— colapsa a cero, así que el que lo necesite elige otra cosa.
 */
export function useHojaModal(): boolean {
  const ancho = useWindowDimensions().width >= ESCRITORIO_PX
  return ES_WEB && ancho
}

/** El reproductor queda detrás de una hoja; sólo se reserva su propia área segura. */
export function usePisoHoja(extra = 20): number {
  const insets = useSafeAreaInsets()
  const modal = useHojaModal()
  return extra + (modal ? 0 : insets.bottom)
}

/**
 * La presentación de una pantalla-hoja, según dónde corra.
 *
 * En iOS estas rutas son `formSheet` y el sistema pone todo: la subida, el
 * grabber, el gesto de bajar y el oscurecido. Acá sólo se da una raíz
 * medible y opaca al contenido; la presentación sigue a cargo del sistema.
 *
 * En la **web angosta** —el teléfono— se imita esa hoja: sube desde abajo con
 * la app viva detrás y un velo que la oscurece.
 *
 * En **escritorio es un modal centrado**, no un drawer. Un drawer es un gesto
 * del pulgar: existe porque en un teléfono lo alcanzable es el borde de abajo.
 * Con un mouse eso no significa nada, y una sábana que cubre una ventana de
 * 1400px para mostrar dos opciones es todo costo y ningún gesto. El modal se
 * presenta en el medio, del ancho de una tarjeta, con el mismo velo detrás; se
 * cierra clickeando afuera, que es el idioma del escritorio.
 *
 * `medida` distingue las hojas que en iOS van `fitToContents` (elegir una
 * opción) de las que van llenas (una lista, un formulario con teclado): el
 * modal compacto mide su contenido, el lleno tiene altura propia.
 */
export function Hoja({
  children,
  medida = 'llena',
  anchoMaximo = ANCHO_HOJA,
  titulo,
  onCerrar,
}: {
  onCerrar?: () => void
  children: ReactNode
  medida?: MedidaHoja
  anchoMaximo?: number
  titulo?: string
}) {
  const ancho = useWindowDimensions().width >= ESCRITORIO_PX
  if (!ES_WEB) return <View collapsable={false}
    style={{ backgroundColor: '#121212', ...(medida === 'llena' ? { flex: 1 } : {}) }}>
    {children}
  </View>
  if (ancho)
    return (
      <Modal medida={medida} anchoMaximo={anchoMaximo} titulo={titulo} onCerrar={onCerrar}>
        {children}
      </Modal>
    )
  return <Sabana medida={medida} titulo={titulo} onCerrar={onCerrar}>{children}</Sabana>
}

/**
 * El modal de escritorio: velo + tarjeta centrada.
 *
 * Aparece con un fundido y un acercamiento corto (0.96 → 1): la escala es lo
 * que lo hace leerse como algo que **se presenta** y no como algo que ya estaba
 * y parpadeó. Escape y el click afuera lo cierran — los dos idiomas del
 * escritorio para «esto no era».
 */
function Modal({
  children,
  medida,
  anchoMaximo,
  titulo,
  onCerrar,
}: {
  onCerrar?: () => void
  children: ReactNode
  medida: MedidaHoja
  anchoMaximo: number
  titulo?: string
}) {
  const router = useRouter()
  const enfocado = useIsFocused()
  const { height } = useWindowDimensions()
  const reducirMovimiento = useReducedMotion()
  const entrada = useSharedValue(reducirMovimiento ? 1 : 0)

  useEffect(() => {
    entrada.value = withTiming(1, { duration: reducirMovimiento ? 0 : MODAL_MS, easing: Easing.out(Easing.cubic) })
  }, [entrada, reducirMovimiento])

  // Navegar primero permite que usePreventRemove conserve visible el borrador.
  const cerrar = onCerrar ?? (() => volver(router, '/'))

  // ModalSistema administra foco, Escape y el orden de las hojas apiladas.
  const velo = useAnimatedStyle(() => ({ opacity: entrada.value * 0.45 }))
  const tarjeta = useAnimatedStyle(() => ({
    opacity: entrada.value,
    transform: [{ scale: 0.96 + entrada.value * 0.04 }],
  }))

  /* La altura del modal lleno: casi toda la ventana, sin llegar a los bordes.
     Fija y no `maxHeight` porque adentro casi todo es `flex-1`, y un flex
     dentro de un padre de altura automática colapsa a cero. */
  const alto = Math.min(Math.round(height * 0.82), 720)

  return (
    <ModalSistema visible={enfocado} transparent animationType="none" onRequestClose={cerrar} accessibilityLabel={titulo}>
    <View style={{ flex: 1 }}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, velo]}
      />
      <Pressable
        accessibilityRole="button"
        {...estadoControlWeb('none')}
        accessibilityLabel="Cerrar"
        onPress={cerrar}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
      >
        <Animated.View
          style={[
            {
              width: anchoMaximo,
              maxWidth: '92%' as const,
              borderRadius: 28,
              overflow: 'hidden',
              backgroundColor: '#18181b',
              boxShadow: '0 24px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
              ...(medida === 'llena' ? { height: alto } : { maxHeight: alto }),
            },
            tarjeta,
          ]}
        >
          {children}
        </Animated.View>
      </View>
    </View>
    </ModalSistema>
  )
}

/**
 * La hoja del teléfono en web: la misma receta que la pantalla de «Sonando».
 *
 * La ruta se declara transparente (ver `app/_layout.tsx`) y la animación la
 * hace la pantalla: sube desde el borde de abajo con la app viva detrás, un
 * velo la oscurece a medida que sube, y tocar la franja descubierta la guarda
 * por donde vino. Apiladas, cada una trae su propio velo — lo de atrás se
 * oscurece un paso más por nivel, como los sheets de UIKit.
 *
 * **Con `medida="contenido"` mide lo que trae adentro**, como el
 * `fitToContents` de iOS: una hoja de tres opciones no tiene por qué taparlo
 * todo, y la franja de app que queda a la vista es lo que la hace leerse como
 * una hoja y no como otra pantalla. La llena sigue midiendo hasta el tope.
 */
function Sabana({ children, medida, titulo, onCerrar }: { children: ReactNode; medida: MedidaHoja; titulo?: string; onCerrar?: () => void }) {
  const router = useRouter()
  const enfocado = useIsFocused()
  const { height } = useWindowDimensions()
  /*
   * El tope respeta el safe area: en un iPhone con la web instalada como app,
   * los 48px fijos quedaban abajo del notch y la hoja se pisaba con la hora
   * del sistema. En un navegador de escritorio el inset es cero.
   */
  const insets = useSafeAreaInsets()
  const tope = Math.max(TOPE, insets.top + 12)
  const recorrido = Math.max(1, height - tope)
  const reducirMovimiento = useReducedMotion()
  const y = useSharedValue(reducirMovimiento ? 0 : recorrido)

  useEffect(() => {
    y.value = withTiming(0, { duration: reducirMovimiento ? 0 : SUBE_MS, easing: Easing.out(Easing.cubic) })
  }, [y, reducirMovimiento])

  // Navegar primero permite que usePreventRemove conserve visible el borrador.
  const cerrar = onCerrar ?? (() => volver(router, '/'))

  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }))
  const velo = useAnimatedStyle(() => ({
    opacity: (1 - y.value / recorrido) * 0.45,
  }))

  return (
    <ModalSistema visible={enfocado} transparent animationType="none" onRequestClose={cerrar} accessibilityLabel={titulo}>
    <View style={{ flex: 1 }}>
      {/* El velo va aparte del panel: se queda quieto y solo cambia de
          intensidad — un velo que viaja con la hoja oscurecería de a saltos. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, velo]}
      />
      {/* Toda la franja descubierta cierra, no solo la de arriba: es el
          comportamiento del sheet del sistema. El panel se dibuja después,
          así que los toques sobre la hoja no llegan acá. */}
      <Pressable
        accessibilityRole="button"
        {...estadoControlWeb('none')}
        accessibilityLabel="Cerrar"
        onPress={cerrar}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            /* Llena: de un tope fijo hasta abajo. A medida: crece desde abajo
               con su contenido y no pasa del mismo tope. */
            ...(medida === 'llena' ? { top: tope } : { maxHeight: height - tope }),
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            overflow: 'hidden',
            backgroundColor: '#18181b',
            boxShadow: '0 -12px 40px rgba(0,0,0,0.5)',
          },
          panel,
        ]}
      >
        {children}
      </Animated.View>
    </View>
    </ModalSistema>
  )
}
