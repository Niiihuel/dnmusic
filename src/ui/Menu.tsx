import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ActionSheetIOS,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type View as RNView,
} from 'react-native'
import type { SFSymbol } from 'sf-symbols-typescript'
import { BORDE_REFERENTE, Glass } from './Glass'
import { ICON_COLOR, IconChevronRight, IconMore } from './icons'

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
}

/**
 * El menú del sistema, si el binario lo trae.
 *
 * `@expo/ui` viene con expo-router, así que en la práctica está siempre — pero
 * se carga dentro de un `try` igual: sus componentes resuelven la vista nativa
 * **al importarse**, y en un binario que no la tenga eso no sería un menú feo,
 * sería la app entera cayéndose al arrancar. Mismo criterio que
 * `remote-commands`.
 */
function cargarNativo() {
  if (Platform.OS !== 'ios') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ui = require('@expo/ui/swift-ui')
    return ui as {
      Host: React.ComponentType<{
        style?: object
        accessibilityLabel?: string
        children: ReactNode
      }>
      Menu: React.ComponentType<{ label: ReactNode; children: ReactNode }>
      Button: React.ComponentType<{
        label?: string
        systemImage?: SFSymbol
        role?: 'default' | 'cancel' | 'destructive'
        onPress?: () => void
      }>
      Image: React.ComponentType<{ systemName?: SFSymbol; size?: number; color?: string }>
      Label: React.ComponentType<{ title?: string; systemImage?: SFSymbol; color?: string }>
    }
  } catch {
    return null
  }
}

const nativo = cargarNativo()

/** Si el menú del sistema está disponible. Lo mira `Popover`. */
export const HAY_MENU_NATIVO = nativo !== null

/* Ancho pensado para la etiqueta más larga que usamos hoy («Nueva lista con
 * esta canción»): más angosto, el texto saltaba de línea y se desbordaba de su
 * fila, que tiene alto fijo para poder ubicar el menú antes de dibujarlo. */
const MENU_W = 288
const ROW_H = 42
/** Aire interno del panel, arriba y abajo de las filas. */
const PAD = 6
const GAP = 6
/** Aire mínimo contra cualquier borde de la pantalla. */
const MARGIN = 8

/**
 * Menú de acciones colgado de un botón de tres puntos.
 *
 * En iOS es **el menú del sistema** —`UIMenu`, el mismo de Apple Music— y en
 * todo lo demás uno nuestro, anclado a mano. Tres caminos, en este orden:
 *
 * 1. `UIMenu`, que es lo que se ve en el teléfono.
 * 2. El action sheet, si el binario no trae `@expo/ui`.
 * 3. El menú dibujado por nosotros, en web y Android.
 *
 * Los tres reciben la misma lista de `items`: quien lo usa no sabe cuál le
 * tocó, y por eso migrar de uno a otro no obligó a tocar ninguno de los nueve
 * lugares que lo usan.
 *
 * Es el hermano de `Popover`: comparten la forma de anclarse pero no la
 * semántica. `Popover` elige un valor entre varios y marca el elegido; esto
 * ejecuta una acción y se cierra. Mezclarlos habría dejado un componente con un
 * `value` que en la mitad de los usos no significa nada.
 *
 * Reemplaza a la cruz de cerrar: una cruz solo puede hacer una cosa, y sobre lo
 * que suena hay varias razonables.
 */
export function Menu({
  items,
  label = 'Más opciones',
  size = 15,
  trigger,
  triggerSymbol,
  triggerText,
}: {
  items: MenuItem[]
  label?: string
  size?: number
  /** Reemplaza los tres puntos por otra cosa, manteniendo el comportamiento. */
  trigger?: ReactNode
  /**
   * El disparador del menú nativo, cuando no son tres puntos.
   *
   * Va como símbolo y texto sueltos y no como componente porque **lo dibuja
   * SwiftUI**: adentro del menú del sistema no entra una vista nuestra. Es la
   * misma razón por la que los íconos de las opciones son SF Symbols.
   */
  triggerSymbol?: SFSymbol
  triggerText?: string
}) {
  const [open, setOpen] = useState(false)
  /*
   * La entrada del panel, con la curva del referente.
   *
   * Es el `cubic-bezier(0.22, 1, 0.36, 1)` a 200ms de la librería de
   * referencia: el menú **nace desde su ancla** —se desliza apenas, escala de
   * 0.95 a 1 y aparece— en vez de estar de golpe. Solo web y Android: en iOS
   * el menú lo dibuja el sistema con su propia animación.
   */
  const [entrada] = useState(() => new Animated.Value(0))
  const [entradaSub] = useState(() => new Animated.Value(0))
  useEffect(() => {
    if (!open) return
    entrada.setValue(0)
    Animated.timing(entrada, {
      toValue: 1,
      duration: 200,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start()
  }, [open, entrada])
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 })
  /** Índice de la fila cuyo submenú está abierto; null sin ninguno. */
  const [sub, setSub] = useState<number | null>(null)
  /* El submenú entra con la misma curva, desde su fila. */
  useEffect(() => {
    if (sub == null) return
    entradaSub.setValue(0)
    Animated.timing(entradaSub, {
      toValue: 1,
      duration: 200,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start()
  }, [sub, entradaSub])
  const ref = useRef<RNView>(null)
  const window = useWindowDimensions()

  const usable = items.filter((item) => !item.disabled)
  /* El respiro de arriba y abajo del panel, como los menús de macOS. */
  const idealH = usable.length * ROW_H + PAD * 2

  /*
   * En iOS, el menú del sistema.
   *
   * Es `UIMenu`: el panel anclado al botón, con vidrio y con el ícono de cada
   * opción a la derecha. Antes acá había un action sheet, que es **otra cosa**
   * —sube desde abajo, tapa media pantalla y pide un «Cancelar»— y se usa para
   * decisiones que interrumpen. Estas no interrumpen nada: son las opciones de
   * una fila, y el lugar donde uno las busca es al lado de la fila.
   *
   * El disparador se dibuja del lado nativo, así que un `trigger` nuestro no
   * puede entrar acá adentro: en ese caso manda el menú de abajo. Hoy no lo usa
   * nadie, pero la prop existe.
   *
   * Las deshabilitadas ni se ofrecen, como antes: una opción que no responde es
   * peor que una ausente.
   */
  if (nativo && !trigger) {
    const { Host, Menu: MenuNativo, Button, Image, Label } = nativo
    return (
      <Host
        style={triggerText ? { height: 36, minWidth: 92 } : { width: 36, height: 36 }}
        accessibilityLabel={label}
      >
        <MenuNativo
          label={
            triggerText ? (
              <Label
                title={triggerText}
                systemImage={triggerSymbol ?? 'ellipsis'}
                color={ICON_COLOR.foreground}
              />
            ) : (
              <Image systemName={triggerSymbol ?? 'ellipsis'} size={size} color={ICON_COLOR.muted} />
            )
          }
        >
          {usable.map((item) =>
            item.items?.length ? (
              /*
               * Un `Menu` adentro del `Menu`: SwiftUI lo dibuja como submenú,
               * con el chevron y el panel al costado — exactamente el patrón
               * de la HIG, puesto por el sistema.
               */
              <MenuNativo
                key={item.label}
                label={
                  <Label
                    title={item.label}
                    systemImage={item.sfSymbol}
                    color={ICON_COLOR.foreground}
                  />
                }
              >
                {item.items
                  .filter((sub) => !sub.disabled)
                  .map((sub) => (
                    <Button
                      key={sub.label}
                      label={sub.label}
                      systemImage={sub.sfSymbol}
                      role={sub.destructive ? 'destructive' : 'default'}
                      onPress={sub.onPress}
                    />
                  ))}
              </MenuNativo>
            ) : (
              <Button
                key={item.label}
                label={item.label}
                systemImage={item.sfSymbol}
                /* Rojo y al final, puesto por el sistema. */
                role={item.destructive ? 'destructive' : 'default'}
                onPress={item.onPress}
              />
            ),
          )}
        </MenuNativo>
      </Host>
    )
  }

  /*
   * El respaldo de iOS, para cuando el menú de arriba no se puede dibujar.
   *
   * Todo el cálculo de más abajo —cuánto lugar hay de cada lado, hacia dónde
   * desplegar, cómo no salirse por los bordes— existe para una ventana de
   * escritorio. En un teléfono ese menú compite con media pantalla y termina
   * saliéndose, así que antes que eso va el action sheet: no es la forma que
   * queremos, pero se ubica solo y se cierra como cualquier app del sistema.
   */
  const openMenu = () => {
    if (Platform.OS === 'ios') {
      /* Un submenú acá es **otra hoja**: el action sheet no tiene paneles al
         costado, así que elegir la fila con submenú abre una segunda hoja con
         sus opciones. Dos toques, igual que en el menú de verdad. */
      const mostrar = (opciones: MenuItem[]) => {
        const destructivas = opciones
          .map((item, i) => (item.destructive ? i : -1))
          .filter((i) => i >= 0)
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: [...opciones.map((item) => item.label), 'Cancelar'],
            cancelButtonIndex: opciones.length,
            destructiveButtonIndex: destructivas.length ? destructivas : undefined,
            userInterfaceStyle: 'dark',
          },
          (i) => {
            const item = opciones[i]
            if (!item) return
            if (item.items?.length) mostrar(item.items.filter((s) => !s.disabled))
            else item.onPress?.()
          },
        )
      }
      mostrar(usable)
      return
    }
    ref.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h })
      setSub(null)
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
  const roomAbove = anchor.y - GAP - MARGIN
  const roomBelow = window.height - (anchor.y + anchor.h) - GAP - MARGIN
  const above = roomAbove >= idealH || roomAbove > roomBelow
  const menuH = Math.min(idealH, Math.max(above ? roomAbove : roomBelow, ROW_H * 2))
  const top = above ? anchor.y - menuH - GAP : anchor.y + anchor.h + GAP

  /*
   * Alineado a la derecha del disparador —los tres puntos suelen estar contra
   * un borde— pero sin salirse por ninguno de los dos lados. El clamp importa
   * cuando el menú cuelga de algo pegado a la izquierda, como una fila de la
   * biblioteca.
   */
  const left = Math.min(
    Math.max(MARGIN, anchor.x + anchor.w - MENU_W),
    Math.max(MARGIN, window.width - MENU_W - MARGIN),
  )

  /*
   * El submenú, **al costado** — como en la HIG y no apilado adentro.
   *
   * A la altura de su fila y del lado donde haya lugar: primero la izquierda,
   * porque los tres puntos suelen vivir contra el borde derecho y el menú ya
   * está pegado ahí. Acotado a la ventana igual que el principal.
   */
  const subItems = sub != null ? (usable[sub]?.items ?? []).filter((s) => !s.disabled) : []
  const subMaxH = Math.min(subItems.length * ROW_H + PAD * 2, window.height - 2 * MARGIN)
  const subLeft =
    left - MENU_W - GAP >= MARGIN
      ? left - MENU_W - GAP
      : Math.min(left + MENU_W + GAP, window.width - MENU_W - MARGIN)
  const subTop = Math.min(
    Math.max(MARGIN, top + (sub ?? 0) * ROW_H),
    Math.max(MARGIN, window.height - subMaxH - MARGIN),
  )

  const cerrar = () => {
    setOpen(false)
    setSub(null)
  }

  return (
    <>
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={openMenu}
        /* El tamaño fijo es **de los tres puntos**. Con un `trigger` propio el
           disparador mide lo que mida él: clavado en 36px, un chip más ancho
           se desbordaba y el botón siguiente se dibujaba encima. */
        className={`items-center justify-center rounded-full ${
          trigger ? 'active:opacity-80' : 'h-9 w-9 active:bg-muted'
        }`}
      >
        {trigger ?? <IconMore size={size} color={ICON_COLOR.muted} />}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={cerrar}>
        {/* El fondo que cierra va como hermano del menú: envolviéndolo, cada
            opción quedaría dentro de un Pressable y en web eso genera un
            <button> dentro de otro <button>. */}
        <View className="flex-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar el menú"
            onPress={cerrar}
            className="absolute inset-0"
          />
          {/*
           * El panel es **vidrio**, como los menús de macOS 26: flota sobre el
           * contenido, que se lee difuminado a través suyo, con el filo del
           * referente y una sombra pesada que lo despega. Las filas ya no van
           * separadas por líneas —los menús del sistema no dividen ítem por
           * ítem— sino que cada una se enciende bajo el cursor; la única
           * hairline queda antes del grupo destructivo, que es donde la HIG
           * pone el corte.
           */}
          <Animated.View
            style={{
              position: 'absolute',
              top,
              left,
              width: MENU_W,
              opacity: entrada,
              transformOrigin: above ? 'bottom' : 'top',
              transform: [
                {
                  translateY: entrada.interpolate({
                    inputRange: [0, 1],
                    outputRange: [above ? 6 : -6, 0],
                  }),
                },
                { scale: entrada.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
              ],
            }}
          >
          <Glass
            radius={13}
            style={{
              maxHeight: menuH,
              boxShadow: `0 12px 32px rgba(0,0,0,0.55), ${BORDE_REFERENTE}`,
            }}
          >
            {/* Con más opciones de las que entran, se desplazan adentro en vez
                de desbordarse fuera de la pantalla. */}
            <ScrollView bounces={false} contentContainerStyle={{ paddingVertical: PAD }}>
            {usable.map((item, i) => (
              <Fragment key={item.label}>
              {/* El corte antes del grupo destructivo, como los menús del
                  sistema: un divisor propio e inset, no un borde pegado a la
                  fila — así no corta el panel de lado a lado. */}
              {i > 0 && item.destructive && !usable[i - 1]?.destructive ? (
                <View className="mx-3 my-1 h-px bg-white/10" />
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={item.items?.length ? { expanded: sub === i } : undefined}
                onPress={() => {
                  /* La fila con submenú no ejecuta nada: lo abre o lo cierra.
                     Es lo que la hace funcionar igual con dedo y con cursor. */
                  if (item.items?.length) {
                    setSub((actual) => (actual === i ? null : i))
                    return
                  }
                  cerrar()
                  item.onPress?.()
                }}
                style={{ height: ROW_H }}
                className={`mx-1.5 flex-row items-center gap-3 rounded-lg px-3 hover:bg-white/10 active:bg-white/15 ${
                  sub === i ? 'bg-white/10' : ''
                }`}
              >
                {item.icon}
                <Text
                  numberOfLines={1}
                  className={`flex-1 text-[14px] ${
                    item.destructive ? 'text-muted-foreground' : 'text-foreground'
                  }`}
                >
                  {item.label}
                </Text>
                {/* El chevron anuncia el submenú, como pide la HIG. */}
                {item.items?.length ? (
                  <IconChevronRight size={14} color={ICON_COLOR.muted} />
                ) : null}
              </Pressable>
              </Fragment>
            ))}
            </ScrollView>
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
                opacity: entradaSub,
                transform: [
                  {
                    translateX: entradaSub.interpolate({
                      inputRange: [0, 1],
                      outputRange: [subLeft < left ? 6 : -6, 0],
                    }),
                  },
                  {
                    scale: entradaSub.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }),
                  },
                ],
              }}
            >
            <Glass
              radius={13}
              style={{
                maxHeight: subMaxH,
                boxShadow: `0 12px 32px rgba(0,0,0,0.55), ${BORDE_REFERENTE}`,
              }}
            >
              <ScrollView bounces={false} contentContainerStyle={{ paddingVertical: PAD }}>
                {subItems.map((item) => (
                  <Pressable
                    key={item.label}
                    accessibilityRole="button"
                    onPress={() => {
                      cerrar()
                      item.onPress?.()
                    }}
                    style={{ height: ROW_H }}
                    className="mx-1.5 flex-row items-center gap-3 rounded-lg px-3 hover:bg-white/10 active:bg-white/15"
                  >
                    {item.icon}
                    <Text
                      numberOfLines={1}
                      className={`flex-1 text-[14px] ${
                        item.destructive ? 'text-muted-foreground' : 'text-foreground'
                      }`}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Glass>
            </Animated.View>
          ) : null}
        </View>
      </Modal>
    </>
  )
}

/**
 * Mantener apretado sobre algo para ver sus opciones. **Hoy no hace nada.**
 *
 * El gesto nativo existe —`ContextMenu` de `@expo/ui`— pero exige envolver cada
 * disparador en un `<Host>` de SwiftUI. Sin él, React Native aborta al montar:
 *
 *   A SwiftUI view "UIBaseView<ContextMenuProps, ContextMenu>" is being mounted
 *   inside a standard UIView. Double check that in JSX you have wrapped your
 *   component with `<Host>` from '@expo/ui/swift-ui'.
 *
 * Y ahí está el problema: el disparador es **una fila de una lista**, así que
 * sería un contenedor de SwiftUI por cada fila, dentro de un `FlatList` que las
 * recicla. Es exactamente el costo que había que evitar, y por eso esto queda
 * como envoltorio inerte en vez de con el `Host` puesto: prefiero el gesto
 * ausente antes que una lista que se arrastra o que revienta al desplazar.
 *
 * Los tres puntos siguen dando todas las opciones, que es lo que hacía falta.
 */
export function MantenerApretado({ children }: { items: MenuItem[]; children: ReactNode }) {
  return <>{children}</>
}
