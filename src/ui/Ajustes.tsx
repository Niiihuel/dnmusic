import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from 'react-native-reanimated'
import { Glass, HAY_VIDRIO } from './Glass'
import { ICON_COLOR, IconChevronRight } from './icons'

/**
 * Una lista agrupada, al modo de Ajustes de iOS.
 *
 * El patrón se llama *inset grouped list*: bloques redondeados de filas, cada
 * bloque con su título arriba en gris, y cada fila con su rótulo a la izquierda,
 * su valor actual a la derecha y un chevron que anuncia que abre otra pantalla.
 *
 * Lo que resuelve acá es un problema concreto del perfil: tenía la identidad y
 * **cuatro campos de formulario apilados** en la misma pantalla, así que mirar
 * el perfil y editarlo eran la misma cosa. Con esto, la pantalla muestra; cada
 * campo se edita en la suya. Y de paso la fila ya dice cuánto vale sin tener que
 * abrirla, que es la mitad de la gracia del patrón.
 *
 * No lleva bordes entre filas: `docs/DESIGN.md` pide separar por luminancia. La
 * separación la hace el propio bloque contra el fondo, y entre filas alcanza con
 * el hueco del contenido.
 */
export function GrupoAjustes({
  titulo,
  children,
}: {
  /** Va arriba del bloque, en versalitas. Opcional. */
  titulo?: string
  children: ReactNode
}) {
  return (
    <View className="gap-2">
      {titulo ? (
        <Text className="px-4 text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
          {titulo}
        </Text>
      ) : null}
      <View className="overflow-hidden rounded-2xl bg-card">{children}</View>
    </View>
  )
}

/**
 * Una fila que abre otra pantalla.
 *
 * `valor` es lo que hay guardado hoy; si está vacío se muestra `vacio` en gris,
 * que dice qué iría ahí. Un campo sin poner no puede verse igual que uno puesto.
 */
export function FilaAjuste({
  rotulo,
  valor,
  vacio = 'Sin poner',
  icono,
  onPress,
  ultima = false,
}: {
  rotulo: string
  valor?: string | null
  vacio?: string
  icono?: ReactNode
  onPress: () => void
  /** La última del bloque no lleva la línea de separación. */
  ultima?: boolean
}) {
  const puesto = !!valor?.trim()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${rotulo}: ${puesto ? valor : vacio}`}
      onPress={onPress}
      className="flex-row items-center gap-3 px-4 active:bg-muted"
    >
      {icono ? <View className="w-6 items-center">{icono}</View> : null}

      {/* La separación va adentro y no en el contenedor: así la línea arranca
          después del ícono, como en Ajustes, en vez de cortar el bloque entero. */}
      <View
        className={`min-w-0 flex-1 flex-row items-center gap-3 py-3.5 ${
          ultima ? '' : 'border-b border-muted'
        }`}
      >
        <Text className="shrink-0 text-foreground text-[15px]">{rotulo}</Text>
        <Text
          className={`min-w-0 flex-1 text-right text-[15px] ${
            puesto ? 'text-muted-foreground' : 'text-muted-foreground/60'
          }`}
          numberOfLines={1}
        >
          {puesto ? valor : vacio}
        </Text>
        <IconChevronRight size={16} color={ICON_COLOR.muted} />
      </View>
    </Pressable>
  )
}

/**
 * Una fila que enciende y apaga algo, sin abrir otra pantalla.
 *
 * Es la otra mitad del patrón de Ajustes: cuando lo que hay que decidir es
 * sí o no, empujar una pantalla para un solo interruptor es hacer trabajar de
 * más. Debajo del rótulo va una línea que explica **qué implica** — un
 * interruptor sin consecuencia escrita es una adivinanza.
 *
 * El estado se marca con el blanco, que en este sistema es el acento y el
 * encendido; apagado queda el gris de las superficies. Ver `docs/DESIGN.md`.
 */
export function FilaInterruptor({
  rotulo,
  detalle,
  activo,
  onCambiar,
  icono,
  ultima = false,
}: {
  rotulo: string
  detalle?: string
  activo: boolean
  onCambiar: (activo: boolean) => void
  icono?: ReactNode
  ultima?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={rotulo}
      accessibilityState={{ checked: activo }}
      onPress={() => onCambiar(!activo)}
      className="flex-row items-center gap-3 px-4 active:bg-muted"
    >
      {icono ? <View className="w-6 items-center">{icono}</View> : null}

      <View
        className={`min-w-0 flex-1 flex-row items-center gap-3 py-3.5 ${
          ultima ? '' : 'border-b border-muted'
        }`}
      >
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-foreground text-[15px]">{rotulo}</Text>
          {detalle ? (
            <Text className="text-muted-foreground text-[12px] leading-4">{detalle}</Text>
          ) : null}
        </View>

        <Interruptor activo={activo} />
      </View>
    </Pressable>
  )
}

/** Lo que viaja la perilla de un extremo al otro. */
const RECORRIDO = 20
const RESORTE = { damping: 20, stiffness: 300, mass: 0.6, overshootClamping: true }

/**
 * El interruptor, dibujado por nosotros y animado.
 *
 * No es el nativo por una razón concreta: el de iOS viene verde y el de Android
 * morado, y los dos meterían un color de marca en una paleta que es toda gris a
 * propósito. Acá encendido es blanco, que en este sistema **es** el acento.
 *
 * Con vidrio, la pista apagada es material en vez de gris sólido: es un control
 * chico apoyado sobre una tarjeta, justo el tamaño donde el material se lee como
 * un detalle y no como una superficie más. Encendida se vuelve blanca opaca —
 * ahí lo que tiene que leerse es el estado, no lo que hay detrás.
 *
 * La perilla se mueve con resorte y sin rebote: sobre veinte píxeles, pasarse de
 * largo para volver se ve como un error de cálculo. Es el mismo criterio que el
 * indicador de las pestañas.
 */
function Interruptor({ activo }: { activo: boolean }) {
  const p = useDerivedValue(() => withSpring(activo ? 1 : 0, RESORTE), [activo])

  const perilla = useAnimatedStyle(() => ({
    transform: [{ translateX: p.value * RECORRIDO }],
  }))
  /* La pista encendida aparece por encima de la apagada en vez de cambiarle el
     color: animar un color de fondo obliga a interpolarlo cuadro a cuadro, y
     encima taparía el vidrio de abajo con un color plano a mitad de camino. */
  const encendida = useAnimatedStyle(() => ({ opacity: p.value }))

  const cuerpo = (
    <View className="h-[30px] w-[50px] justify-center px-[3px]">
      {/* Todo por `style`: NativeWind no procesa `className` sobre componentes
          animados, y acá eso dejaba la pista encendida sin fondo y la perilla
          sin tamaño — el interruptor entero se veía como una píldora gris muerta,
          igual apagado que encendido. Ver la última sección de docs/DESIGN.md.
          #FFFFFF es el token `primary`. */}
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 999, backgroundColor: '#FFFFFF' },
          encendida,
        ]}
      />
      {/* #121212 es `primary-foreground` (sobre la pista blanca), #4D4D4D es `border`. */}
      <Animated.View
        style={[
          { width: 24, height: 24, borderRadius: 12, backgroundColor: activo ? '#121212' : '#4D4D4D' },
          perilla,
        ]}
      />
    </View>
  )

  if (!HAY_VIDRIO) {
    return <View className="rounded-full bg-muted">{cuerpo}</View>
  }
  return (
    <Glass radius={15} style={{ alignSelf: 'center' }}>
      {cuerpo}
    </Glass>
  )
}
