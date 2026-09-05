import { leerAjustes } from '../state/ajustes'
import { useCallback, useEffect } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import {
  cerrarTooltip,
  mostrarTooltipYa,
  pedirTooltip,
  retenerTooltip,
  soltarTooltip,
  useTooltip,
} from '../state/tooltip'
import { TECLADO_FISICO } from '../lib/teclado'

/**
 * El rótulo de un botón de solo ícono, al dejarle el cursor encima.
 *
 * **Solo donde hay mouse.** `TECLADO_FISICO` mira el puntero (`pointer: fine`)
 * y no el ancho de la ventana: una ventana angosta en una compu sigue teniendo
 * mouse, y una tablet ancha no. En pantallas de tocar esto no existe, y no es
 * una limitación sino lo correcto — un tooltip al tocar llega tarde, porque el
 * toque ya ejecutó el botón. Ahí el que explica es el menú.
 *
 * Lo que se muestra tiene que ser corto y decir **la acción**: «Pausar»,
 * «Silenciar», «Buscar en la lista». Nada de frases con el nombre de la canción
 * adentro ni instrucciones: para eso está el menú, que sí se puede leer con
 * calma.
 */

/**
 * Engancha un botón al tooltip. Devuelve lo que hay que ponerle encima.
 *
 * Se usa así, sobre un `View` que envuelva al botón (o sobre el botón mismo si
 * ya tiene ref propia):
 *
 * ```tsx
 * const tip = useConTooltip('Pausar')
 * <Pressable {...tip.gestos}>…</Pressable>
 * ```
 */
export function useConTooltip(texto?: string) {
  useEffect(
    () => () => {
      // Si el botón se va mientras su rótulo está puesto, el rótulo se va con él.
      cerrarTooltip()
    },
    [],
  )

  /*
   * El botón se mide **desde el propio evento**, no con una ref.
   *
   * `getBoundingClientRect` da el rectángulo exacto y al instante, mientras que
   * `measureInWindow` contesta un cuadro después — con el cursor moviéndose,
   * ese retraso alcanza para dibujar el rótulo donde el botón ya no está. Y de
   * paso no hace falta una ref por botón, que además el compilador de React no
   * deja leer durante el dibujado.
   *
   * Es legítimo usar DOM acá: esto solo corre con mouse, y eso solo pasa en web.
   */
  const medir = useCallback(
    (e: unknown, ya: boolean) => {
      if (!texto || !TECLADO_FISICO || (!ya && !leerAjustes().ayudasCursor)) return
      const nodo = (e as { currentTarget?: { getBoundingClientRect?: () => DOMRect } })
        ?.currentTarget
      const r = nodo?.getBoundingClientRect?.()
      if (!r) return
      const tip = { texto, x: r.left, y: r.top, w: r.width, h: r.height }
      if (ya) mostrarTooltipYa(tip)
      else pedirTooltip(tip)
    },
    [texto],
  )

  const gestos =
    texto && TECLADO_FISICO
      ? {
          onPointerEnter: (e: unknown) => medir(e, false),
          onPointerLeave: () => soltarTooltip(),
          // El foco del teclado lo muestra al toque, como pide la APG.
          onFocus: (e: unknown) => medir(e, true),
          onBlur: () => cerrarTooltip(),
          /* Apretar lo cierra: la persona ya decidió, el rótulo sobra. */
          onPointerDown: () => cerrarTooltip(),
        }
      : {}

  return { gestos }
}

/**
 * Aire entre el botón y el rótulo.
 *
 * Poco a propósito: el rótulo tiene que leerse **pegado a lo que nombra**. Con
 * más aire deja de pertenecerle al botón y se lee como un cartel suelto, sobre
 * todo en una fila de íconos donde el de al lado está a pocos píxeles.
 */
const SEPARACION = 6
/** Margen mínimo contra el borde de la ventana. */
const MARGEN = 8
/**
 * Alto aproximado, **solo** para decidir si entra arriba o va abajo.
 *
 * Para colocarlo no se usa: arriba se ancla por el borde de abajo (`bottom`),
 * que no necesita saber cuánto mide. Antes se restaba esta estimación al `top`,
 * y como estimaba de más el rótulo quedaba flotando más arriba de lo pedido —
 * el aire real terminaba siendo mayor que el que dice `SEPARACION`.
 */
const ALTO = 28
/** Ancho máximo: si no entra, el texto era demasiado largo para un tooltip. */
const ANCHO_MAX = 260

/**
 * El rótulo dibujado, montado una sola vez en la raíz (ver `app/_layout`).
 *
 * Va arriba del botón y centrado, que es lo esperable; si no hay lugar arriba
 * se pasa abajo, y si se saldría por un costado se corre para adentro. Es lo
 * mismo que hacen `flip` y `shift` de Floating UI: volteo cambia de lado,
 * corrimiento desliza sin cambiarlo.
 */
export function Tooltip() {
  const tip = useTooltip()

  /* Escape lo cierra sin mover el cursor: lo pide la APG y el criterio 1.4.13.
     Solo se escucha mientras hay algo puesto. */
  useEffect(() => {
    if (!tip || Platform.OS !== 'web' || typeof window === 'undefined') return
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrarTooltip()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [tip])

  if (!tip) return null

  return (
    /* La capa no atrapa nada; el rótulo sí, para poder pasarle el cursor por
       encima sin que se apague (criterio 1.4.13, «se puede señalar»). */
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Rotulo tip={tip} />
    </View>
  )
}

function Rotulo({ tip }: { tip: { texto: string; x: number; y: number; w: number; h: number } }) {
  const { width, height } = useVentana()
  const arriba = tip.y - SEPARACION - ALTO >= MARGEN || tip.y > height / 2
  /* Arriba se ancla por abajo y abajo por arriba: en los dos casos el borde
     que mira al botón queda exactamente a `SEPARACION`, sin estimar nada. */
  const vertical = arriba
    ? { bottom: height - tip.y + SEPARACION }
    : { top: tip.y + tip.h + SEPARACION }
  /* Centrado sobre el botón y metido para adentro si se saliera. El ancho real
     lo pone el texto; el centro se calcula sobre el máximo y se acota. */
  const centro = tip.x + tip.w / 2

  return (
    <View
      onPointerEnter={retenerTooltip}
      onPointerLeave={soltarTooltip}
      style={{
        position: 'absolute',
        ...vertical,
        left: Math.max(MARGEN, Math.min(centro - ANCHO_MAX / 2, width - ANCHO_MAX - MARGEN)),
        width: ANCHO_MAX,
        alignItems: centro < ANCHO_MAX / 2 + MARGEN ? 'flex-start' : 'center',
      }}
    >
      {/* Sin borde: se separa por luminancia y por la sombra, como pide
          docs/DESIGN.md. 12px/400 es el «Fino» de la escala tipográfica. */}
      <View
        className="rounded-lg bg-muted px-2.5 py-1.5"
        style={{ boxShadow: 'rgba(0,0,0,0.5) 0px 8px 24px', maxWidth: ANCHO_MAX }}
      >
        <Text className="text-foreground text-[12px]" numberOfLines={1}>
          {tip.texto}
        </Text>
      </View>
    </View>
  )
}

/** El tamaño de la ventana, sin arrastrar re-dibujos: solo se lee al abrir. */
function useVentana() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return { width: window.innerWidth, height: window.innerHeight }
  }
  return { width: 1024, height: 768 }
}
