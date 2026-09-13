import { IconButton } from './IconButton'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSegments } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { setTab, type Tab } from '../state/shell'
import { usePendientesChats } from '../state/session'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Glass, HAY_VIDRIO } from './Glass'
import { ICON_COLOR, IconHome, IconInbox, IconMusic, IconSearch, IconUser } from './icons'
import { volver } from '../lib/volver'

/** Lado del botón de buscar mientras todavía no se midió la píldora. */
const LADO_BASE = 52

/**
 * El resorte del indicador.
 *
 * Sin rebote (`overshootClamping`): la cápsula se **acomoda** en la pestaña
 * nueva, no la pasa de largo para volver. Es lo que hace el sistema, y sobre un
 * recorrido de 80px un rebote se lee como un error de cálculo y no como vida.
 */
const RESORTE = { damping: 22, stiffness: 260, mass: 0.7, overshootClamping: true }

/** Las que viven en la píldora, en orden. Buscar va aparte, en su redondel. */
const EN_PILDORA: Tab[] = ['inicio', 'listas', 'chats', 'perfil']

/**
 * Ir a una pestaña. **Cambiar de pestaña también es navegar.**
 *
 * El perfil es una ruta apilada y las otras cuatro son estados de la pantalla
 * principal, así que además de mover el estado hay que desapilar: sin eso, la
 * pantalla de perfil se queda abierta encima con otra pestaña marcada debajo.
 *
 * Vive acá y no adentro de la píldora porque **la lupa está dibujada dos veces**:
 * la de la barra desplegada y la del redondel de la derecha cuando la cáscara se
 * pliega (ver `ui/Cascara`). La segunda solo hacía `setTab('buscar')` — movía la
 * pestaña y nada más—, así que tocándola desde el perfil se abría el campo de
 * búsqueda **sobre el perfil** y los resultados se dibujaban en la pantalla
 * principal, que estaba tapada debajo. Se veía como que buscar no hacía nada.
 *
 * Con las dos llamando acá no pueden volver a separarse.
 */
export function useIrATab() {
  const router = useRouter()
  const segmentos = useSegments()
  const enPerfil = segmentos[0] === 'profile'

  return useCallback(
    (tab: Tab) => {
      setTab(tab)
      /* Estando ya en el perfil, volver a tocarlo apilaba **otro** perfil
         encima: había que volver dos veces para salir de una pantalla a la que
         se entró una sola. */
      if (tab === 'perfil') {
        if (!enPerfil) router.push('/profile')
        return
      }
      if (enPerfil) volver(router, '/')
    },
    [enPerfil, router],
  )
}

const ETIQUETA: Record<Tab, string> = {
  inicio: 'Inicio',
  buscar: 'Buscar',
  listas: 'Listas',
  chats: 'Chats',
  perfil: 'Perfil',
}

const ICONO: Record<Tab, (props: { size?: number; color?: string }) => React.ReactElement> = {
  inicio: IconHome,
  buscar: IconSearch,
  listas: IconMusic,
  chats: IconInbox,
  perfil: IconUser,
}

/**
 * La barra de pestañas del teléfono.
 *
 * En pantalla chica los tres paneles del escritorio no entran, y hasta ahora lo
 * que pasaba era que el del medio mostraba la biblioteca y los otros dos
 * desaparecían sin reemplazo: la app abría en «Tus listas» y no había forma de
 * llegar a la portada. Acá cada panel pasa a ser una pestaña.
 *
 * Va **debajo del reproductor**, no encima: primero lo que suena, después a
 * dónde ir. Es el orden de Apple Music y de Spotify, y el que deja el pulgar
 * más cerca de lo que más se toca.
 *
 * **Buscar va aparte**, en su propio redondel a la derecha, y en la píldora
 * quedan cuatro. Es la forma de Apple Music, y no es un capricho de dibujo: las
 * otras cuatro son *lugares* —te llevan a una pantalla y te quedás—, mientras
 * que buscar es una *acción* que se hace desde cualquiera de ellas y se
 * abandona apenas encontraste. Separarlo dice eso sin escribirlo, y de paso
 * deja a las cuatro que quedan con lugar para respirar.
 *
 * El estado activo se marca con el color del ícono y del texto —blanco contra
 * gris, que es el acento que pide `docs/DESIGN.md`— y con una cápsula que se
 * desliza por detrás. La cápsula no es un borde ni un color de marca: es un
 * escalón de luminancia, que es exactamente como ese mismo documento pide
 * separar superficies. Lo que aporta es el movimiento — sin ella, cambiar de
 * sección solo cambia dos colores y la barra se siente muerta.
 */
export function TabPildora({ active }: { active: Tab }) {
  const ir = useIrATab()
  /* El globito de Chats: solicitudes que esperan más mensajes sin leer. Sin
     esto, una solicitud solo se descubría entrando a la pestaña de casualidad. */
  const pendientes = usePendientesChats()
  /*
   * El redondel de buscar es tan alto como la píldora, y el alto de la píldora
   * lo decide su contenido —el cuerpo de la tipografía del sistema, que la
   * persona puede agrandar—. Se mide en vez de fijarse: con un número a ojo,
   * subir el tamaño de letra dejaba el círculo más bajo que la barra.
   */
  const [lado, setLado] = useState(LADO_BASE)

  /*
   * La cápsula que marca dónde estás, y que **se desliza** entre pestañas.
   *
   * La guía de barras de pestañas de Apple pide que el cambio de sección se
   * vea: en iOS 26 el indicador es una pieza de material que se mueve de una a
   * otra en vez de aparecer y desaparecer. Sin eso, tocar otra pestaña solo
   * cambia dos colores y la barra se siente muerta.
   *
   * Cada ítem informa dónde quedó y con eso se anima la posición y el ancho —el
   * ancho también, porque «Inicio» y «Perfil» no miden lo mismo—. Se mide en
   * vez de repartirse en cuartos: el ancho de cada una depende de la
   * tipografía, y con el cuerpo de letra grande dejarían de coincidir.
   */
  const [sitios, setSitios] = useState<Partial<Record<Tab, { x: number; w: number }>>>({})
  const x = useSharedValue(0)
  const w = useSharedValue(0)
  /* Invisible hasta que se midió: sin esto asomaría un cuadrado de ancho cero
     en la esquina izquierda durante el primer cuadro. */
  const opacidad = useSharedValue(0)
  /** El primer dibujado no se anima: la cápsula nace donde tiene que estar. */
  const colocada = useRef(false)

  useEffect(() => {
    const sitio = sitios[active]
    if (!sitio) return
    if (colocada.current) {
      x.value = withSpring(sitio.x, RESORTE)
      w.value = withSpring(sitio.w, RESORTE)
    } else {
      x.value = sitio.x
      w.value = sitio.w
      opacidad.value = 1
      colocada.current = true
    }
  }, [active, sitios, x, w, opacidad])

  /* Los estilos van por `style` y nunca por `className`: NativeWind no procesa
     clases en componentes animados y la cápsula se dibujaría sin fondo. Está
     documentado en `docs/DESIGN.md`. */
  const indicador = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    width: w.value,
    opacity: opacidad.value,
  }))

  return (
    /*
     * Dos piezas, no una: la píldora y el redondel.
     *
     * Con vidrio las dos flotan, despegadas del borde, porque el material
     * necesita lugar por debajo para que se vea lo que pasa. Sin vidrio se
     * quedan pegadas y sin fondo propio, apoyadas sobre el degradado que funde
     * el contenido —ponerles uno cortaría esa transición en seco—; ahí la
     * separación la hace el hueco entre las dos y nada más. La forma es la
     * misma en los dos casos: que buscar esté aparte no depende de que el
     * teléfono sepa dibujar vidrio.
     */
    /* El margen de abajo es el del teléfono y nada más: sumarle un mínimo
       propio empujaba los íconos hacia arriba y la barra ocupaba más alto del
       necesario. En un teléfono sin muesca hay un piso chico para que no queden
       pegados al borde. */
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: HAY_VIDRIO ? 12 : 0,
      }}
    >
      <Glass
        radius={lado / 2}
        style={[{ flex: 1 }, HAY_VIDRIO ? {} : { backgroundColor: 'transparent' }]}
      >
        <View
          className="flex-row px-1 py-1"
          onLayout={(e) => setLado(e.nativeEvent.layout.height)}
        >
          {/* Detrás de los ítems, no encima: es el piso sobre el que se
              apoyan. Un escalón de luminancia y nada de bordes, que es como
              `docs/DESIGN.md` pide separar superficies. */}
          <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  top: 4,
                  bottom: 4,
                  left: 0,
                  borderRadius: 18,
                  backgroundColor: 'rgba(255,255,255,0.13)', // sobre `card`
                },
                indicador,
              ]}
            />
          {EN_PILDORA.map((tab) => (
            <Item
              key={tab}
              tab={tab}
              label={ETIQUETA[tab]}
              active={active}
              onPress={ir}
              icon={ICONO[tab]}
              badge={tab === 'chats' ? pendientes : 0}
              onMedida={(sitio) => setSitios((s) => (
                s[tab]?.x === sitio.x && s[tab]?.w === sitio.w ? s : { ...s, [tab]: sitio }
              ))}
            />
          ))}
        </View>
      </Glass>

      {/*
       * Sin etiqueta, como en Apple Music: la lupa es de las poquísimas figuras
       * que no necesitan que le expliquen qué hace, y ponerle «Buscar» debajo
       * obligaría al redondel a crecer hasta dejar de ser uno. El nombre igual
       * está, en el rótulo de accesibilidad.
       */}
      <Glass
        radius={lado / 2}
        style={HAY_VIDRIO ? {} : { backgroundColor: 'transparent' }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: active === 'buscar' }}
          accessibilityLabel="Buscar"
          onPress={() => ir('buscar')}
          style={{ width: lado, height: lado }}
          className="items-center justify-center active:opacity-60"
        >
          <IconSearch
            size={21}
            color={active === 'buscar' ? ICON_COLOR.foreground : ICON_COLOR.muted}
          />
        </Pressable>
      </Glass>
    </View>
  )
}

function Item({
  tab,
  label,
  active,
  onPress,
  icon: Icon,
  badge = 0,
  onMedida,
}: {
  tab: Tab
  label: string
  active: Tab
  onPress: (tab: Tab) => void
  icon: (props: { size?: number; color?: string }) => React.ReactElement
  /** Cuánto espera adentro: con más de cero, el globito sobre el ícono. */
  badge?: number
  /** Dónde quedó dentro de la píldora, para que el indicador sepa a dónde ir. */
  onMedida?: (sitio: { x: number; w: number }) => void
}) {
  const on = active === tab
  const color = on ? ICON_COLOR.foreground : ICON_COLOR.muted

  return (
    <Pressable
      onLayout={(e) => onMedida?.({ x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width })}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={badge > 0 ? `${label}, ${badge} sin ver` : label}
      onPress={() => onPress(tab)}
      className="flex-1 items-center gap-0.5 rounded-lg py-1 active:opacity-60"
    >
      <View>
        <Icon size={21} color={color} />
        {/* El mismo globito que la fila de una conversación sin leer: blanco
            —el acento— con el número oscuro adentro. Sobre la esquina del
            ícono, como en toda barra de pestañas del sistema. */}
        {badge > 0 ? (
          <View className="absolute -right-3 -top-1.5 min-w-4 items-center justify-center rounded-full bg-primary px-1 py-px">
            {/* 9 y no `caption2`: el número es chico porque el globito es
                chico, y los dos son medidas de esta pieza, no un estilo de
                texto. Es lo mismo que hace UIKit — ver la carve-out de
                «nada de tamaños sueltos» en docs/DESIGN.md. */}
            <Text className="text-primary-foreground text-[9px] font-semibold">
              {Math.min(badge, 99)}
            </Text>
          </View>
        ) : null}
      </View>
      {/* Los 10 del rótulo de la barra de pestañas de iOS, que está **debajo**
          de la escala de texto a propósito: UIKit tampoco lo saca de ahí. */}
      <Text
        className={`text-[10px] ${on ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
      >
        {label}
      </Text>
    </Pressable>
  )
}

/**
 * La cáscara adentro de una conversación: la casa y lo que suena.
 *
 * Un chat abierto ya tiene su propia barra —el campo de escribir— y con las
 * pestañas debajo del reproductor quedaban **tres franjas apiladas** comiéndose
 * un tercio de la pantalla justo donde uno quiere leer. Las pestañas son lo que
 * sobra: adentro de una conversación no se salta a «Listas» ni a «Perfil», y
 * para volver a los chats ya está la flecha de la cabecera.
 *
 * Queda la casa, que es la salida grande —igual que mientras buscás— y el
 * reproductor, que es lo único de la cáscara que seguís usando ahí adentro.
 */
export function FilaChat({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets()
  const ir = useIrATab()

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: HAY_VIDRIO ? 12 : 8,
        paddingBottom: insets.bottom > 0 ? insets.bottom - 6 : 8,
      }}
    >
      <IconButton label="Volver al inicio" symbol="house" onPress={() => ir('inicio')} variant="glass" lado={52} icon={<IconHome size={21} color={ICON_COLOR.foreground} />} />
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  )
}
