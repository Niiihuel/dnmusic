import { useEffect, useState, type ReactNode } from 'react'
import { Platform, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated'
import type { Tab } from '../state/shell'
import { BotonVidrio, HAY_VIDRIO } from './Glass'
import { TabPildora, useIrATab } from './TabBar'
import { ICON_COLOR, IconHome, IconInbox, IconMusic, IconSearch, IconUser } from './icons'

/** Lado de los redondeles de los costados. */
const LADO = 52
/** Aire entre un redondel y la tarjeta del reproductor. */
const AIRE = 8
/**
 * Cuánto se achica la tarjeta del reproductor a cada lado.
 *
 * Desplegada, la tarjeta ocupaba **todo** el ancho de la fila mientras la
 * píldora de abajo termina antes —le deja el lugar al redondel de la lupa— así
 * que la de arriba se veía más larga y sin aire contra los bordes.
 *
 * Con la fila a 12px del borde, esto la deja a 22: la tarjeta es lo más ancho
 * que flota abajo y, pegada al borde, se leía como si la pantalla no terminara
 * — el vidrio necesita ver fondo a los costados para que se note que es una
 * pieza apoyada y no una franja del sistema.
 */
const RESPIRO_MEDIA = 10
/**
 * Cuánto más se achica **solo desplegada**.
 *
 * A 22 del borde la tarjeta seguía leyéndose cortada contra la curva de la
 * pantalla del teléfono — la captura no lo muestra porque la captura no tiene
 * bordes curvos. Va interpolado con el plegado: plegada este aire no existe,
 * porque ahí los costados los ocupan los redondeles y achicarla más dejaría a
 * la tarjeta flaca entre ellos.
 */
const RESPIRO_GRANDE = 12
/** Margen lateral de la franja. */
const COSTADO = 12
/**
 * Aire entre la tarjeta del reproductor y la píldora de pestañas.
 *
 * Va como **relleno de la fila de pestañas y no como margen**: el alto que se
 * mide ahí es el que la columna usa para saber cuánto correrse al plegarse, y
 * un margen queda fuera de esa medida — la fila del reproductor bajaría de
 * menos y dejaría este mismo hueco asomando contra el borde.
 */
const RESPIRO = Platform.OS === 'android' ? 0 : 6
/** El resorte del plegado: firme y sin rebote, como el indicador de pestañas. */
const RESORTE = { damping: 24, stiffness: 220, mass: 0.8, overshootClamping: true }

const ICONO: Record<Tab, (props: { size?: number; color?: string }) => React.ReactElement> = {
  inicio: IconHome,
  buscar: IconSearch,
  listas: IconMusic,
  chats: IconInbox,
  perfil: IconUser,
}

/**
 * La franja de abajo, en sus dos formas, sin remontar ni redimensionar vidrio.
 *
 * `GlassView` aplica el material **una sola vez**, en su primer
 * `layoutSubviews`, detrás de una bandera que no reintenta (ver `isMounted` en
 * `expo-glass-effect/ios/GlassView.swift`). De ahí salen tres reglas que hay que
 * respetar y que no son obvias:
 *
 * 1. **Nada se remonta.** Dibujar una forma u otra según el estado destruía las
 *    piezas en cada cambio; si el único intento caía en medio de la transición,
 *    quedaban transparentes para siempre.
 * 2. **Nada nace midiendo cero.** Ese primer dibujado tiene que agarrar a la
 *    pieza con su tamaño real. Un redondel adentro de un hueco de ancho cero, o
 *    una píldora adentro de una fila de alto cero, aplican el efecto sobre nada
 *    y ya no se recuperan — se ven como si el botón no tuviera fondo.
 *
 * Por eso acá **ninguna pieza de vidrio cambia de tamaño jamás**. Lo único que
 * se mueve son márgenes y desplazamientos:
 *
 * - Plegarse es correr la columna entera hacia abajo el alto de las pestañas,
 *   que se van por el borde. Un `translateY`, no un alto que se achica.
 * - Los redondeles entran desde afuera con un margen negativo que se cierra.
 *   Miden 52 desde el primer cuadro y no dejan de medirlo nunca.
 *
 * Y una tercera regla, hermana de las dos: **ninguna opacidad sobre el vidrio
 * ni sobre sus ancestros**. Una alfa distinta de 1 compone el subárbol aparte y
 * el material se queda sin fondo que muestrear.
 *
 * El reproductor vive siempre en el mismo lugar y con una sola instancia: cada
 * una trae su propio motor de audio, así que duplicarlo cortaría la música al
 * plegar.
 */
export function Cascara({
  active,
  colapsada,
  onExpandir,
  onAltoVisible,
  children,
}: {
  active: Tab
  colapsada: boolean
  /** Tocar el redondel de la pestaña despliega, no navega. */
  onExpandir: () => void
  /**
   * El alto que la franja ocupa **a la vista**, que no es el que mide.
   *
   * Plegada, las pestañas siguen dibujadas: se fueron por debajo del borde. El
   * contenedor mide lo mismo de siempre —achicarlo sería reacomodar al ancestro
   * del vidrio— pero las listas tienen que reservar menos, o dejarían al final
   * el hueco de algo que ya no se ve.
   */
  onAltoVisible: (alto: number) => void
  /** El reproductor. Va por acá para que exista una sola vez. */
  children: ReactNode
}) {
  const insets = useSafeAreaInsets()
  const ir = useIrATab()
  const [altoTabs, setAltoTabs] = useState(0)
  const [altoFila, setAltoFila] = useState(0)
  const androidRecto = Platform.OS === 'android'
  const abajo = insets.bottom > 0 ? insets.bottom - 6 : 8

  /** 0 desplegada, 1 plegada. Todo lo demás sale de interpolar esto. */
  const p = useDerivedValue(() => withSpring(!androidRecto && colapsada ? 1 : 0, RESORTE), [androidRecto, colapsada])

  const Icono = ICONO[active] ?? IconHome

  useEffect(() => {
    if (!altoFila) return
    onAltoVisible(altoFila + (!androidRecto && colapsada ? 0 : altoTabs) + abajo)
  }, [altoFila, altoTabs, androidRecto, colapsada, abajo, onAltoVisible])

  /* La columna entera baja el alto de las pestañas: se van por el borde y la
     fila del reproductor queda donde estaban ellas. */
  const columna = useAnimatedStyle(() => ({
    transform: [{ translateY: p.value * altoTabs }],
  }))
  /*
   * **Nada de opacidad sobre una pieza de vidrio, ni sobre sus ancestros.**
   *
   * Es la tercera cara de la misma regla, y la que faltaba. Una opacidad
   * distinta de 1 obliga a UIKit a componer ese subárbol en un buffer aparte, y
   * ahí `UIVisualEffectView` deja de tener el fondo real para muestrear: el
   * efecto se apaga. Se veía como la píldora de pestañas y la lupa sin fondo
   * mientras la tarjeta del reproductor —que no estaba adentro de ningún
   * `Animated.View` con opacidad— se dibujaba bien.
   *
   * Y no hace falta: esconderlas ya lo hace el desplazamiento. Las pestañas se
   * van por el borde de abajo y los redondeles se meten detrás del recorte de
   * su fila. Solo posición, nunca transparencia.
   */
  /*
   * El corrimiento incluye el margen lateral de la fila.
   *
   * `overflow: hidden` recorta contra el **borde**, no contra el contenido, así
   * que un redondel corrido solo su ancho más el aire quedaba con la franja del
   * padding asomando: se veían dos medialunas de vidrio en los costados con la
   * barra desplegada. Sumando `COSTADO` sale entero del borde y no asoma nada.
   */
  const izquierda = useAnimatedStyle(() => ({
    marginLeft: (1 - p.value) * -(LADO + AIRE + COSTADO + RESPIRO_MEDIA),
  }))
  const derecha = useAnimatedStyle(() => ({
    marginRight: (1 - p.value) * -(LADO + AIRE + COSTADO + RESPIRO_MEDIA),
  }))
  /*
   * Las pestañas viajan un poco más que la columna.
   *
   * La columna baja el alto de las pestañas, que es lo que deja a la fila del
   * reproductor donde estaban ellas. Pero las pestañas no son lo último de la
   * columna: abajo tienen el margen del teléfono, así que con ese corrimiento
   * les quedaba justo esa franja asomando contra el borde inferior. Este empujón
   * extra —el alto de ese margen— las termina de sacar de la pantalla.
   */
  const tabs = useAnimatedStyle(() => ({
    transform: [{ translateY: p.value * abajo }],
  }))
  /* El aire extra de la tarjeta, solo desplegada: se cierra al plegarse con
     el mismo resorte que mueve todo lo demás. Es un margen que se anima — el
     mismo mecanismo por el que entran y salen los redondeles.

     Va como `marginLeft`/`marginRight` sueltos y NO como `marginHorizontal`:
     en web, Reanimated aplica el primer cuadro a través del pipeline de RNW
     —que sí entiende el atajo— pero las actualizaciones por cuadro van
     directo al estilo del nodo, donde `marginHorizontal` no existe. El margen
     quedaba clavado en el valor inicial: plegada, la tarjeta conservaba el
     aire de desplegada y quedaban dos huecos contra los redondeles. */
  const media = useAnimatedStyle(() => {
    if (androidRecto) return { marginLeft: 0, marginRight: 0 }
    const margen = RESPIRO_MEDIA + (1 - p.value) * RESPIRO_GRANDE
    return { marginLeft: margen, marginRight: margen }
  })

  return (
    <Animated.View style={columna}>
      {/*
       * Primera fila: redondel, reproductor, redondel.
       *
       * Se recorta porque desplegada los redondeles quedan corridos hacia
       * afuera con margen negativo, y sin recorte asomarían contra los bordes.
       */}
      <View
        onLayout={(e) => {
          const alto = e.nativeEvent.layout.height
          if (alto > 0) setAltoFila(alto)
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          overflow: 'hidden',
          paddingHorizontal: androidRecto ? 0 : HAY_VIDRIO ? COSTADO : 8,
        }}
      >
        {androidRecto ? null : <Animated.View style={[{ marginRight: AIRE }, izquierda]}>
          <BotonVidrio
            label="Desplegar la barra"
            onPress={onExpandir}
            radius={LADO / 2}
            style={{ width: LADO, height: LADO }}
          >
            <Icono size={21} color={ICON_COLOR.foreground} />
          </BotonVidrio>
        </Animated.View>}

        <Animated.View style={[{ flex: 1, minWidth: 0 }, media]}>{children}</Animated.View>

        {androidRecto ? null : <Animated.View style={[{ marginLeft: AIRE }, derecha]}>
          {/*
           * La misma lupa que la de la barra desplegada, y por eso la misma
           * función: buscar desde el perfil tiene que **salir** del perfil, o el
           * campo se abre encima de una pantalla que no muestra resultados. Ver
           * `useIrATab`.
           */}
          <BotonVidrio
            label="Buscar"
            onPress={() => ir('buscar')}
            radius={LADO / 2}
            style={{ width: LADO, height: LADO }}
          >
            <IconSearch size={21} color={ICON_COLOR.muted} />
          </BotonVidrio>
        </Animated.View>}
      </View>

      {/*
       * Segunda fila: las pestañas, **a su alto natural, sin recortar y sin
       * envoltorio animado**.
       *
       * Nace midiendo lo suyo desde el primer cuadro —si naciera en cero, su
       * vidrio se aplicaría sobre nada— y lo único que la envuelve es un
       * `Animated.View` que la **desplaza**: ninguna opacidad, que es lo otro
       * que le apaga el material.
       */}
      <Animated.View
        style={[{ paddingTop: RESPIRO }, tabs]}
        onLayout={(e) => {
          const alto = e.nativeEvent.layout.height
          if (alto > 0) setAltoTabs(alto)
        }}
      >
        <TabPildora active={active} />
      </Animated.View>

      <View style={{ height: abajo, backgroundColor: Platform.OS === 'android' ? '#1C1B1F' : 'transparent' }} />
    </Animated.View>
  )
}
