import { estadoControlWeb } from './estadoControl'
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type View as RNView,
  type ViewStyle,
} from 'react-native'
import type { SFSymbol } from 'sf-symbols-typescript'
import { BORDE_REFERENTE, ES_WEB, Glass } from './Glass'
import { ICON_COLOR, IconCheck, IconChevronRight, IconMore } from './icons'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { TECLADO_FISICO } from '../lib/teclado'
import { useConTooltip } from './Tooltip'
import { HAY_MENU_NATIVO, MenuNativo } from './MenuNativo'
import { llevaCorte, repartirMenu } from './menuReparto'
export { HAY_MENU_NATIVO } from './MenuNativo'

export type MenuItem = {
  label: string
  /** Qué hace. Las que solo abren un submenú no llevan nada. */
  onPress?: () => void
  /** El ícono del menú de respaldo: web, Android. */
  icon?: ReactNode
  /**
   * El mismo ícono, en el idioma de iOS.
   *
   * El menú nativo no dibuja componentes nuestros: pide el nombre de un SF
   * Symbol y lo dibuja el sistema, alineado y con el peso de la tipografía que
   * tenga puesta el teléfono. Por eso los íconos van dos veces — es la misma
   * idea escrita en los dos idiomas, no una duplicación.
   */
  sfSymbol?: SFSymbol
  /** Se marca como la acción que borra: va al final y separada. */
  destructive?: boolean
  disabled?: boolean
  /** Selección nativa, con marca del sistema en los selectores. */
  selected?: boolean
  /**
   * Submenú: estas opciones cuelgan de la fila, como pide la HIG de menús.
   *
   * Existe porque un menú no puede crecer con los datos: con una fila por
   * lista, tener ocho listas eran ocho opciones «Agregar a…» empujando todo lo
   * demás fuera de la vista. La fila dice qué se puede hacer —una sola vez— y
   * el submenú dice dónde. Un solo nivel: un submenú dentro de otro es un
   * laberinto, no un menú.
   */
  items?: MenuItem[]
  /**
   * La segunda línea, en gris: el nombre del disco debajo de «Ir al álbum»,
   * el de la lista debajo de «Ver la lista».
   *
   * Es lo que hace el menú de Apple Music con las filas que llevan a algún
   * lado: la fila dice el verbo y el subtítulo dice el objeto, así no hay que
   * abrir para saber a dónde te lleva. En iOS lo dibuja el sistema —un menú
   * acepta un segundo `Text` como subtítulo—; en el nuestro va debajo.
   */
  subtitle?: string
  /**
   * Un corte antes de esta fila: acá empieza otro grupo.
   *
   * Los menús de iOS no separan ítem por ítem sino **por grupos** —lo que
   * hacés con la canción, a dónde te lleva, lo que la saca de acá— y el corte
   * es lo que hace legible un menú de diez filas. Quien arma el menú decide
   * dónde van; el grupo destructivo del final trae el suyo solo.
   */
  separadorAntes?: boolean
  /**
   * Acción rápida: va en la **fila de íconos de arriba**, no en la lista.
   *
   * Es la fila de tres botones con que abre el menú de Apple Music (agregar,
   * favorito, compartir): lo que se toca todo el tiempo y no necesita una
   * fila entera de texto para entenderse. Máximo cuatro; las de más caen a la
   * lista. En iOS es un `ControlGroup` adentro del menú y lo dibuja el
   * sistema; acá es una fila de celdas con el ícono arriba y el rótulo abajo.
   */
  rapida?: boolean
}

/* Ancho pensado para la etiqueta más larga que usamos hoy («Nueva lista con
 * esta canción»): más angosto, el texto saltaba de línea y se desbordaba de su
 * fila, que tiene alto fijo para poder ubicar el menú antes de dibujarlo. Un
 * poco más ancho que antes por los subtítulos: «Cigarettes After Sex» debajo
 * de «Ir al artista» tiene que entrar en una línea. */
const MENU_W = 272
/** Alto de una fila sin subtítulo, y con él. */
const ROW_H = 44
const ROW_SUB_H = 54
/** La fila de acciones rápidas: ícono arriba, rótulo abajo. */
const RAPIDAS_H = 66
/** El divisor de un grupo: 1px de línea + 4px de margen por lado. */
const DIVISOR_H = 9
/** Aire interno del panel, arriba y abajo de las filas. */
const PAD = 6
const GAP = 6
/** Aire mínimo contra cualquier borde de la pantalla. */
const MARGIN = 8
/** Radio del panel. El de los menús de iOS 26, que redondean más que antes. */
const RADIO = 20

/**
 * La curva de todo el menú: salida firme, sin rebote.
 *
 * Antes la apertura usaba un resorte con sobrepaso (`0.34, 1.56, 0.64, 1`) de
 * 420 ms, y encima cada fila entraba escalonada 22 ms detrás de la anterior:
 * con ocho opciones, la última terminaba de aparecer a casi medio segundo del
 * clic. Sobre un menú eso no se lee como carácter sino como lentitud, y el
 * rebote de una superficie con desenfoque se ve como un foco que no encuentra
 * el plano — el material no rebota.
 *
 * Un menú del sistema aparece **de una**: escala corta, sin sobrepaso, y el
 * contenido ya está ahí. Eso es lo que hacen estos números.
 */
const SECO = 'cubic-bezier(0.22, 1, 0.36, 1)'
const ABRE_MS = 180
const CIERRA_MS = 120

/*
 * La animación va en **CSS de verdad**, inyectado una sola vez.
 *
 * react-native-web deja pasar `animation-duration` o `animation-delay` como
 * estilos sueltos, pero no registra keyframes desde un estilo en línea: el
 * panel quedaba con `animation-name: none` y nada se movía. Los keyframes
 * viven en una hoja global y cada pieza elige el suyo con un atributo
 * `data-anim` — el mismo truco de cualquier librería CSS, sin pelearse con el
 * compilador de estilos de RNW.
 *
 * El blur que «aparecía después y se veía disparejo» era un problema de capas:
 * el Modal entraba con fade, y en CSS un ancestro con `opacity` en transición
 * **anula el `backdrop-filter`** de sus descendientes hasta llegar a 1 — el
 * menú se dibujaba sin vidrio y el blur caía de golpe al final. La regla que
 * sale de ahí: la opacidad de un ancestro del vidrio no se anima nunca. El
 * propio panel anima su desenfoque (0 → 18px) y su fondo; el material no
 * rebota aunque la forma sí — un blur con resorte se ve como un foco que no
 * encuentra el plano.
 */
if (ES_WEB && typeof document !== 'undefined') {
  const hoja = document.createElement('style')
  hoja.textContent = `
@keyframes dn-menu-sube { from { transform: scale(.96) translateY(4px) } }
@keyframes dn-menu-baja { from { transform: scale(.96) translateY(-4px) } }
@keyframes dn-menu-va-arriba { to { transform: scale(.97) translateY(2px) } }
@keyframes dn-menu-va-abajo { to { transform: scale(.97) translateY(-2px) } }
@keyframes dn-menu-material { from {
  backdrop-filter: blur(0px) saturate(100%);
  -webkit-backdrop-filter: blur(0px) saturate(100%);
  background-color: rgba(28,28,28,0);
} }
@keyframes dn-menu-material-va { to {
  backdrop-filter: blur(0px) saturate(100%);
  -webkit-backdrop-filter: blur(0px) saturate(100%);
  background-color: rgba(28,28,28,0);
} }
@keyframes dn-menu-contenido { from { opacity: 0 } }
@keyframes dn-menu-contenido-va { to { opacity: 0 } }

[data-anim="menu-abre-arriba"] {
  transform-origin: bottom right;
  animation: dn-menu-sube ${ABRE_MS}ms ${SECO} both, dn-menu-material ${ABRE_MS}ms ease-out both;
}
[data-anim="menu-abre-abajo"] {
  transform-origin: top right;
  animation: dn-menu-baja ${ABRE_MS}ms ${SECO} both, dn-menu-material ${ABRE_MS}ms ease-out both;
}
[data-anim="menu-cierra-arriba"] {
  transform-origin: bottom right;
  animation: dn-menu-va-arriba ${CIERRA_MS}ms ${SECO} both, dn-menu-material-va ${CIERRA_MS}ms ${SECO} both;
}
[data-anim="menu-cierra-abajo"] {
  transform-origin: top right;
  animation: dn-menu-va-abajo ${CIERRA_MS}ms ${SECO} both, dn-menu-material-va ${CIERRA_MS}ms ${SECO} both;
}
/*
 * El contenido entra **entero y de una**, no fila por fila.
 *
 * El escalonado era la mitad de lo que hacía lento al menú: cada opción
 * esperaba a la anterior y el panel terminaba de armarse mucho después de
 * haber llegado. Un fade corto del bloque alcanza para que el texto no
 * aparezca de golpe sobre un panel que todavía está escalando.
 */
[data-anim="contenido-abre"] { animation: dn-menu-contenido ${ABRE_MS}ms ease-out both; }
[data-anim="contenido-cierra"] { animation: dn-menu-contenido-va ${CIERRA_MS}ms ${SECO} both; }
`
  document.head.appendChild(hoja)
}

/** El `data-anim` del panel, según hacia dónde abre y si se está yendo. */
function animPanel(cerrando: boolean, above: boolean): Record<string, string> | undefined {
  if (!ES_WEB) return undefined
  if (cerrando) return { anim: above ? 'menu-cierra-arriba' : 'menu-cierra-abajo' }
  return { anim: above ? 'menu-abre-arriba' : 'menu-abre-abajo' }
}

/**
 * Las filas del panel, **sin barra de scroll en la compu**.
 *
 * El ScrollView de antes dibujaba su ranura contra el borde derecho aunque
 * nada desbordara — la línea gris de la captura que motivó este arreglo. En
 * web las filas van en un View común: si algún día un menú no entrara en la
 * ventana, la rueda sigue desplazando (`overflowY: auto`) pero la barra no se
 * dibuja nunca. En Android el ScrollView queda: ahí no hay ranura fantasma.
 */
function Filas({
  alto,
  cerrando,
  children,
}: {
  alto: number
  cerrando: boolean
  children: ReactNode
}) {
  if (ES_WEB) {
    return (
      <View
        {...({ dataSet: animContenido(cerrando) } as object)}
        style={
          {
            maxHeight: alto,
            paddingVertical: PAD,
            overflowY: 'auto',
            scrollbarWidth: 'none',
          } as unknown as ViewStyle
        }
      >
        {children}
      </View>
    )
  }
  return (
    <ScrollView bounces={false} contentContainerStyle={{ paddingVertical: PAD }}>
      {children}
    </ScrollView>
  )
}

/** El `data-anim` del bloque de filas: entra y se va como una sola pieza. */
function animContenido(cerrando: boolean): Record<string, string> | undefined {
  if (!ES_WEB) return undefined
  return { anim: cerrando ? 'contenido-cierra' : 'contenido-abre' }
}

export { repartirMenu, llevaCorte } from './menuReparto'

const altoFila = (item: MenuItem) => (item.subtitle ? ROW_SUB_H : ROW_H)

/**
 * Menú de acciones colgado de un botón de tres puntos.
 *
 * En iOS es **el menú del sistema** —`UIMenu`, el mismo de Apple Music— y en
 * todo lo demás uno nuestro, anclado a mano. Los dos reciben la misma lista
 * de `items`, incluidos submenús, acciones rápidas, subtítulos, cortes y
 * acciones destructivas.
 *
 * Es el hermano de `Popover`: comparten la forma de anclarse pero no la
 * semántica. `Popover` elige un valor entre varios y marca el elegido; esto
 * ejecuta una acción y se cierra. Mezclarlos habría dejado un componente con un
 * `value` que en la mitad de los usos no significa nada.
 *
 * Reemplaza a la cruz de cerrar: una cruz solo puede hacer una cosa, y sobre lo
 * que suena hay varias razonables.
 */
type MenuProps = {
  items: MenuItem[]
  /** Desactiva el disparador completo sin ocultar sus opciones. */
  disabled?: boolean
  label?: string
  /**
   * El rótulo al pasar el cursor. Corto a propósito y **distinto** de `label`:
   * la etiqueta accesible dice «Opciones de <la canción>» —que es lo correcto
   * para escuchar— y un título de canción largo no entra en un rótulo.
   */
  tooltip?: string
  size?: number
  /** Reemplaza los tres puntos por otra cosa, manteniendo el comportamiento. */
  trigger?: ReactNode
  /** Los disparadores que son filas ocupan el ancho disponible también en iOS. */
  triggerFullWidth?: boolean
  /**
   * El disparador del menú nativo, cuando no son tres puntos.
   *
   * SwiftUI dibuja el símbolo y el texto. Los disparadores personalizados
   * también se admiten, mediante RNHostView.
   */
  triggerSymbol?: SFSymbol
  /**
   * Sin botón propio: el menú existe **solo** para abrirse desde el mango.
   *
   * Es lo que necesita el click derecho de una fila — la fila ya tiene sus tres
   * puntos, y lo que hace falta es una segunda puerta a la misma lista, no un
   * segundo botón. Sin disparador tampoco va el menú nativo de iOS: ese se
   * dibuja **anclado a su botón**, y acá no hay ninguno.
   */
  sinDisparador?: boolean
  /**
   * Abierto en un punto de la pantalla, desde afuera. Es el **click derecho**.
   *
   * Va como estado y no como un mango imperativo a propósito: dónde está el
   * menú es algo que se ve, así que es de quien dibuja. `null` es cerrado.
   */
  abiertoEn?: { x: number; y: number } | null
  /** Avisar que hay que soltar el punto de arriba. */
  onCerrarPunto?: () => void
}

export function Menu({
  items,
  disabled = false,
  label = 'Más opciones',
  tooltip = 'Opciones',
  size = 15,
  trigger,
  triggerFullWidth = false,
  triggerSymbol,
  sinDisparador = false,
  abiertoEn = null,
  onCerrarPunto,
}: MenuProps) {
  const [open, setOpen] = useState(false)
  /*
   * Si el menú se abrió con el click derecho.
   *
   * Cambia **de qué lado se alinea**: los tres puntos suelen estar contra el
   * borde derecho de una fila, así que el panel cuelga hacia la izquierda; un
   * menú del cursor, en cambio, nace donde está la punta de la flecha y se
   * abre hacia la derecha, como en cualquier escritorio.
   */
  const [desdeCursor, setDesdeCursor] = useState(false)
  /*
   * El panel saliendo, para animar la ida antes de desmontar. Solo web: el
   * menú se despide con el mismo material con el que llegó — desaparecer de
   * golpe era la mitad de lo que lo hacía sentir pegado.
   */
  const [cerrando, setCerrando] = useState(false)
  /*
   * La entrada del panel en **Android**, con Animated: ahí no hay CSS. En web
   * la animación vive en los estilos (`vidrioAnimado`, `filaAnimada`): correr
   * también esta opacidad anularía el backdrop-filter — ver `vidrioAnimado`.
   */
  const [entrada] = useState(() => new Animated.Value(ES_WEB ? 1 : 0))
  const [entradaSub] = useState(() => new Animated.Value(ES_WEB ? 1 : 0))
  useEffect(() => {
    if ((!open && !abiertoEn) || ES_WEB) return
    entrada.setValue(0)
    Animated.timing(entrada, {
      toValue: 1,
      duration: 200,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start()
  }, [open, abiertoEn, entrada])
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 })
  /*
   * Abierto y desde dónde, **derivado**: si vino un punto de afuera manda ese,
   * y si no, el disparador propio. Sin efectos de por medio — un efecto que
   * copiara la prop a un estado encadenaría un dibujado de más y podría quedar
   * un cuadro atrasado justo cuando el menú tiene que aparecer.
   */
  const porPunto = abiertoEn != null
  const abierto = open || porPunto
  const ancla = abiertoEn ? { x: abiertoEn.x, y: abiertoEn.y, w: 0, h: 0 } : anchor
  const enCursor = porPunto || desdeCursor
  /** Índice de la fila cuyo submenú está abierto; null sin ninguno. */
  const [sub, setSub] = useState<number | null>(null)
  /* El submenú entra con la misma curva, desde su fila. Android; web va por CSS. */
  useEffect(() => {
    if (sub == null || ES_WEB) return
    entradaSub.setValue(0)
    Animated.timing(entradaSub, {
      toValue: 1,
      duration: 200,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start()
  }, [sub, entradaSub])
  const ref = useRef<RNView>(null)
  const tip = useConTooltip(tooltip)

  const window = useWindowDimensions()

  const { rapidas, lista } = repartirMenu(items)
  /*
   * El alto ideal cuenta TODO lo que se dibuja: la fila de acciones rápidas,
   * las filas —más altas las que llevan subtítulo—, el respiro, y los cortes
   * entre grupos. Sin contarlos, el contenido medía unos píxeles más que el
   * panel y la última fila quedaba recortada — antes lo disimulaba la barra de
   * scroll (que aparecía por esos mismos píxeles), y sin barra se veía a
   * «Salir del Jam» comido por el borde.
   */
  const cortes = lista.filter((_, i) => llevaCorte(lista, i)).length
  const idealH =
    (rapidas.length ? RAPIDAS_H + DIVISOR_H : 0) +
    lista.reduce((suma, item) => suma + altoFila(item), 0) +
    cortes * DIVISOR_H +
    PAD * 2

  if (HAY_MENU_NATIVO && !sinDisparador) {
    return (
      <MenuNativo items={items} label={label} size={size} symbol={triggerSymbol} fullWidth={triggerFullWidth} disabled={disabled}>
        {trigger}
      </MenuNativo>
    )
  }

  const openMenu = () => {
    ref.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h })
      setSub(null)
      setDesdeCursor(false)
      setOpen(true)
    })
  }

  /*
   * Dónde cae el menú.
   *
   * Se mide cuánto lugar hay de cada lado del disparador y se elige el que
   * alcanza; si no alcanza ninguno —un menú de muchas listas en una ventana
   * baja— gana el más grande y el contenido se desplaza adentro. Antes se
   * abría hacia arriba salvo que no entrara por ocho píxeles, y con menús
   * largos el borde superior se iba de la pantalla: quedaban opciones
   * inalcanzables, sin ninguna señal de que estaban ahí.
   */
  const roomAbove = ancla.y - GAP - MARGIN
  const roomBelow = window.height - (ancla.y + ancla.h) - GAP - MARGIN
  const above = roomAbove >= idealH || roomAbove > roomBelow
  const menuH = Math.min(idealH, Math.max(above ? roomAbove : roomBelow, ROW_H * 2))
  const top = above ? ancla.y - menuH - GAP : ancla.y + ancla.h + GAP

  /*
   * Alineado a la derecha del disparador —los tres puntos suelen estar contra
   * un borde— pero sin salirse por ninguno de los dos lados. El clamp importa
   * cuando el menú cuelga de algo pegado a la izquierda, como una fila de la
   * biblioteca.
   */
  const left = Math.min(
    Math.max(MARGIN, enCursor ? ancla.x : ancla.x + ancla.w - MENU_W),
    Math.max(MARGIN, window.width - MENU_W - MARGIN),
  )

  /*
   * El submenú, **al costado** — como en la HIG y no apilado adentro.
   *
   * A la altura de su fila y del lado donde haya lugar: primero la izquierda,
   * porque los tres puntos suelen vivir contra el borde derecho y el menú ya
   * está pegado ahí. Acotado a la ventana igual que el principal.
   */
  const subItems = sub != null ? (lista[sub]?.items ?? []).filter((s) => !s.disabled) : []
  const subMaxH = Math.min(
    subItems.reduce((suma, item) => suma + altoFila(item), 0) + PAD * 2,
    window.height - 2 * MARGIN,
  )
  const subLeft =
    left - MENU_W - GAP >= MARGIN
      ? left - MENU_W - GAP
      : Math.min(left + MENU_W + GAP, window.width - MENU_W - MARGIN)
  /* La altura de la fila que lo abrió: lo que hay arriba de ella en el panel. */
  const arribaDeSub =
    (rapidas.length ? RAPIDAS_H + DIVISOR_H : 0) +
    lista.slice(0, sub ?? 0).reduce((suma, item, i) => suma + altoFila(item) + (llevaCorte(lista, i) ? DIVISOR_H : 0), 0)
  const subTop = Math.min(
    Math.max(MARGIN, top + PAD + arribaDeSub),
    Math.max(MARGIN, window.height - subMaxH - MARGIN),
  )

  const cerrar = () => {
    /* Si lo abrió un punto —click derecho o pulsación larga— quien lo guarda
       tiene que soltarlo, o el menú volvería a nacer abierto en el mismo
       lugar. Va **después** de la despedida y no antes: soltarlo primero lo
       desmonta en el acto y se pierde la animación de salida. */
    const soltar = () => onCerrarPunto?.()
    /*
     * En web el desmontaje espera a la despedida: `cerrando` pone a todo el
     * panel los keyframes de salida y recién al terminar se cierra el Modal.
     * La acción elegida ya corrió — el menú se va mientras la app responde.
     */
    if (ES_WEB) {
      if (cerrando) return
      setCerrando(true)
      setTimeout(() => {
        setOpen(false)
        setSub(null)
        setCerrando(false)
        soltar()
      }, CIERRA_MS)
      return
    }
    setOpen(false)
    setSub(null)
    soltar()
  }

  /** Ejecuta una fila y cierra. La que tiene submenú lo abre en vez de correr. */
  const elegir = (item: MenuItem, i: number) => {
    /* La fila con submenú no ejecuta nada: lo abre o lo cierra.
       Es lo que la hace funcionar igual con dedo y con cursor. */
    if (item.items?.length) {
      setSub((actual) => (actual === i ? null : i))
      return
    }
    cerrar()
    item.onPress?.()
  }

  return (
    <>
      {sinDisparador ? null : (
      <Pressable
        ref={ref}
        {...tip.gestos}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={openMenu}
        style={triggerFullWidth ? { width: '100%' } : undefined}
        /* El tamaño fijo es **de los tres puntos**. Con un `trigger` propio el
           disparador mide lo que mida él: clavado en 36px, un chip más ancho
           se desbordaba y el botón siguiente se dibujaba encima. */
        className={`items-center justify-center rounded-full ${
          trigger ? 'active:opacity-80' : 'h-9 w-9 active:bg-muted'
        }`}
      >
        {trigger ?? <IconMore size={size} color={ICON_COLOR.muted} />}
      </Pressable>
      )}

      {/* Sin fade en web: ese fundido es una opacidad animada sobre TODO el
          modal, y con un ancestro fundiéndose el backdrop-filter del vidrio
          no dibuja nada — el blur caía de golpe al final, disparejo. La
          entrada la hace el panel solo (ver `vidrioAnimado`). */}
      <Modal
        visible={abierto}
        transparent
        animationType={ES_WEB ? 'none' : 'fade'}
        onRequestClose={cerrar}
      >
        {/* El fondo que cierra va como hermano del menú: envolviéndolo, cada
            opción quedaría dentro de un Pressable y en web eso genera un
            <button> dentro de otro <button>. */}
        <View className="flex-1">
          <Pressable
            accessibilityRole="button"
            {...estadoControlWeb('none')}
            accessibilityLabel="Cerrar el menú"
            onPress={cerrar}
            className="absolute inset-0"
          />
          {/*
           * El panel es **vidrio**, como los menús de iOS 26: flota sobre el
           * contenido, que se lee difuminado a través suyo, con el filo del
           * referente y una sombra pesada que lo despega. Las filas no van
           * separadas por líneas —los menús del sistema no dividen ítem por
           * ítem— sino que cada una se enciende bajo el cursor; las hairlines
           * quedan entre grupos, que es donde la HIG pone el corte.
           */}
          <Animated.View
            style={{
              position: 'absolute',
              top,
              left,
              width: MENU_W,
              /* En web este envoltorio queda quieto: cualquier opacidad o
                 escala acá arriba le apagaría el vidrio al panel. La entrada
                 y la salida viven en el Glass (ver `vidrioAnimado`). */
              ...(ES_WEB
                ? null
                : {
                    opacity: entrada,
                    transformOrigin: above ? 'bottom' : 'top',
                    transform: [
                      {
                        translateY: entrada.interpolate({
                          inputRange: [0, 1],
                          outputRange: [above ? 6 : -6, 0],
                        }),
                      },
                      {
                        scale: entrada.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.95, 1],
                        }),
                      },
                    ],
                  }),
            }}
          >
          <Glass
            radius={RADIO}
            dataSet={animPanel(cerrando, above)}
            style={{
              maxHeight: menuH,
              boxShadow: `0 12px 32px rgba(0,0,0,0.55), ${BORDE_REFERENTE}`,
            }}
          >
            <Filas alto={menuH} cerrando={cerrando}>
            {rapidas.length ? (
              <>
                <FilaRapidas items={rapidas} onElegir={(item) => elegir(item, -1)} />
                <Divisor />
              </>
            ) : null}
            {lista.map((item, i) => (
              <Fragment key={`${i}:${item.label}`}>
              {llevaCorte(lista, i) ? <Divisor /> : null}
              <Fila item={item} abierto={sub === i} onPress={() => elegir(item, i)} />
              </Fragment>
            ))}
            </Filas>
          </Glass>
          </Animated.View>

          {sub != null && subItems.length ? (
            /* El submenú es otra pieza del mismo material, al costado — como
               en macOS, y entra con la misma curva desde su fila. */
            <Animated.View
              style={{
                position: 'absolute',
                top: subTop,
                left: subLeft,
                width: MENU_W,
                /* Quieto en web, igual que el panel principal: el vidrio se
                   anima solo (ver `vidrioAnimado`). */
                ...(ES_WEB
                  ? null
                  : {
                      opacity: entradaSub,
                      transform: [
                        {
                          translateX: entradaSub.interpolate({
                            inputRange: [0, 1],
                            outputRange: [subLeft < left ? 6 : -6, 0],
                          }),
                        },
                        {
                          scale: entradaSub.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.95, 1],
                          }),
                        },
                      ],
                    }),
              }}
            >
            <Glass
              radius={RADIO}
              dataSet={animPanel(cerrando, false)}
              style={{
                maxHeight: subMaxH,
                boxShadow: `0 12px 32px rgba(0,0,0,0.55), ${BORDE_REFERENTE}`,
              }}
            >
              <Filas alto={subMaxH} cerrando={cerrando}>
                {subItems.map((item, i) => (
                  <Fragment key={`${i}:${item.label}`}>
                    {llevaCorte(subItems, i) ? <Divisor /> : null}
                    <Fila
                      item={item}
                      abierto={false}
                      onPress={() => {
                        cerrar()
                        item.onPress?.()
                      }}
                    />
                  </Fragment>
                ))}
              </Filas>
            </Glass>
            </Animated.View>
          ) : null}
        </View>
      </Modal>
    </>
  )
}

/**
 * El corte entre grupos: un divisor propio e inset, no un borde pegado a la
 * fila — así no corta el panel de lado a lado. Mide `DIVISOR_H` en total.
 */
function Divisor() {
  return <View className="mx-3 my-1 h-px bg-white/10" />
}

/**
 * Una fila del menú: ícono a la izquierda, rótulo, subtítulo si lo trae, y a
 * la derecha el chevron del submenú o la marca del elegido.
 *
 * El ícono va **a la izquierda**, como en los menús de iOS 26 (antes iban a la
 * derecha): con subtítulos, el texto necesita arrancar siempre en la misma
 * columna para que las dos líneas se lean como una fila y no como dos.
 */
function Fila({ item, abierto, onPress }: { item: MenuItem; abierto: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={
        item.items?.length ? { expanded: abierto } : item.selected !== undefined ? { selected: item.selected } : undefined
      }
      onPress={onPress}
      style={{ height: altoFila(item) }}
      className={`mx-1.5 flex-row items-center gap-3 rounded-xl px-3 active:bg-white/15 ${
        abierto ? 'bg-white/10' : ''
      }`}
    >
      {item.icon ? <View className="w-5 items-center">{item.icon}</View> : null}
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={1}
          className={`text-subheadline ${item.destructive ? 'text-muted-foreground' : 'text-foreground'}`}
        >
          {item.label}
        </Text>
        {item.subtitle ? (
          <Text numberOfLines={1} className="text-muted-foreground text-caption1">
            {item.subtitle}
          </Text>
        ) : null}
      </View>
      {/* El chevron anuncia el submenú, como pide la HIG; la marca, el elegido. */}
      {item.items?.length ? (
        <IconChevronRight size={14} color={ICON_COLOR.muted} />
      ) : item.selected ? (
        <IconCheck size={14} color={ICON_COLOR.foreground} />
      ) : null}
    </Pressable>
  )
}

/**
 * La fila de acciones rápidas: celdas parejas con el ícono arriba y el rótulo
 * abajo, como la que abre el menú de Apple Music.
 *
 * El ícono llega del tamaño de una fila común (15) y acá se agranda un poco:
 * son SVG y escalan sin perder el trazo. El rótulo va en dos líneas como
 * mucho — «Agregar a Favoritos» ya se parte así en el referente.
 */
function FilaRapidas({ items, onElegir }: { items: MenuItem[]; onElegir: (item: MenuItem) => void }) {
  return (
    <View className="mx-1.5 flex-row" style={{ height: RAPIDAS_H }}>
      {items.map((item, index) => (
        <Pressable
          key={`${index}:${item.label}`}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          accessibilityState={item.selected !== undefined ? { selected: item.selected } : undefined}
          onPress={() => onElegir(item)}
          className="flex-1 items-center justify-center gap-1.5 rounded-xl px-1 active:bg-white/15"
        >
          <View className="h-6 items-center justify-center" style={{ transform: [{ scale: 1.35 }] }}>
            {item.icon}
          </View>
          <Text
            numberOfLines={2}
            className={`text-center text-caption2 leading-[13px] ${
              item.selected ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

/** Pulsación larga nativa en iOS; menú anclado propio en las otras plataformas. */
export function MantenerApretado({ items, children }: { items: MenuItem[]; children: ReactNode }) {
  const [punto, setPunto] = useState<{ x: number; y: number } | null>(null)

  const gesto = useMemo(
    () =>
      Gesture.LongPress()
        .enabled(!HAY_MENU_NATIVO && !TECLADO_FISICO && items.length > 0)
        .minDuration(500)
        .maxDistance(10)
        .shouldCancelWhenOutside(true)
        /* El panel se abre en coordenadas de ventana, que es lo que espera
           `abiertoEn`: `absoluteX/Y` ya vienen así, sin medir nada. */
        .runOnJS(true)
        .onStart((e) => {
          setPunto({ x: e.absoluteX, y: e.absoluteY })
        }),
    [items],
  )

  if (HAY_MENU_NATIVO && items.length) {
    return <MenuNativo items={items} longPress fullWidth>{children}</MenuNativo>
  }

  return (
    <GestureDetector gesture={gesto}>
      <View>
        {children}
        {punto ? (
          <Menu
            items={items}
            sinDisparador
            abiertoEn={punto}
            onCerrarPunto={() => setPunto(null)}
          />
        ) : null}
      </View>
    </GestureDetector>
  )
}
