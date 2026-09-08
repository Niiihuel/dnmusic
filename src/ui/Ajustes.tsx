import { createContext, useContext, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from 'react-native-reanimated'
import type { SFSymbol } from 'sf-symbols-typescript'
import { BORDE_REFERENTE, Glass, HAY_VIDRIO } from './Glass'
import { Menu } from './Menu'
import { ICON_COLOR, IconChevronDown, IconChevronRight } from './icons'

const DensidadAjustesContext = createContext(false)

// En escritorio usa la escala de Ajustes del Sistema; en teléfono conserva
// las medidas táctiles de iOS.
export function AjustesCompactos({ children }: { children: ReactNode }) {
  return <DensidadAjustesContext.Provider value>{children}</DensidadAjustesContext.Provider>
}

export function useAjustesCompactos() {
  return useContext(DensidadAjustesContext)
}

/**
 * Las piezas de una lista agrupada, con las medidas de Configuración de iOS.
 *
 * El patrón se llama *inset grouped list*: bloques redondeados de filas, cada
 * fila con su placa de ícono a la izquierda, el rótulo, el valor actual en gris
 * a la derecha y el chevron que anuncia otra pantalla —o el interruptor, si lo
 * que hay que decidir es sí o no—. Las líneas que separan filas arrancan
 * después de la placa, y el bloque puede llevar un título arriba y una
 * explicación abajo (el *footer*), que es donde iOS pone lo que una fila no
 * puede decir sola.
 *
 * Las medidas son las del sistema y no las de la app —rótulo de 17, fila de
 * 52, placa de 30 con radio 8, bloque con radio 22— porque este es el único
 * lugar donde la app se parece a los Ajustes del teléfono a propósito: quien
 * entra a configurar algo tiene ese patrón en el dedo y cualquier desvío se
 * lee como error.
 */

/**
 * El ícono de una fila, en su placa redondeada.
 *
 * Es el detalle que hace que la lista se lea como los Ajustes de un sistema y
 * no como texto suelto: cada fila abre con una placa del mismo tamaño, y el
 * ícono descansa adentro. La placa es `muted` sobre la tarjeta `card` —una
 * superficie apenas más clara—, que es separar por luminancia como pide
 * `docs/DESIGN.md`; iOS pinta cada placa de un color y acá el sistema es
 * acromático, así que todas son del mismo gris.
 */
export function IconoAjuste({ children }: { children: ReactNode }) {
  return (
    <View className="h-[30px] w-[30px] items-center justify-center rounded-[8px] bg-muted">
      {children}
    </View>
  )
}

/**
 * Un bloque de filas, con su título y su pie opcionales.
 *
 * El pie es lo que explica al bloque —«Al terminar la lista, sigue con
 * recomendaciones.»— y va **debajo**, en gris y chico, como en iOS: una fila
 * con subtítulo se vuelve de dos alturas y la lista pierde el ritmo; la
 * explicación al pie deja las filas parejas.
 */
export function GrupoAjustes({
  titulo,
  pie,
  children,
}: {
  /** Va arriba del bloque, en gris. Opcional: la raíz de Ajustes no los lleva. */
  titulo?: string
  /** Va debajo, en gris: lo que el bloque necesita explicar. */
  pie?: string
  children: ReactNode
}) {
  const compacto = useAjustesCompactos()
  return (
    <View>
      {titulo ? (
        <Text className={`${compacto ? 'px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[1.1px]' : 'px-4 pb-2 text-[13px]'} text-muted-foreground`}>{titulo}</Text>
      ) : null}
      <View className={`overflow-hidden bg-card ${compacto ? 'rounded-[16px]' : 'rounded-[22px]'}`}>{children}</View>
      {pie ? (
        <Text className={`${compacto ? 'px-3 pt-1.5 text-[12px] leading-[17px]' : 'px-4 pt-2 text-[13px] leading-[18px]'} text-muted-foreground`}>{pie}</Text>
      ) : null}
    </View>
  )
}

/** La marca numérica de una fila: cuántas cosas esperan detrás. Blanca, que es el acento. */
function Globito({ n }: { n: number }) {
  return (
    <View className="h-[22px] min-w-[22px] items-center justify-center rounded-full bg-primary px-1.5">
      <Text className="text-primary-foreground text-[13px] font-semibold">{n > 99 ? '99+' : n}</Text>
    </View>
  )
}

/**
 * Una fila que abre otra pantalla.
 *
 * `valor` es lo que hay guardado hoy; si está vacío se muestra `vacio` en gris,
 * que dice qué iría ahí. Un campo sin poner no puede verse igual que uno puesto.
 * `globito` es la cuenta de lo que espera detrás —las novedades sin leer—, como
 * el «1» rojo de «iPhone sin respaldo».
 */
export function FilaAjuste({
  rotulo,
  detalle,
  valor,
  vacio = 'Sin poner',
  icono,
  iconoPlano = false,
  globito,
  onPress,
  ultima = false,
  destructivo = false,
}: {
  rotulo: string
  /** Una segunda línea, solo cuando el rótulo no alcanza. Las filas de la raíz no la llevan. */
  detalle?: string
  valor?: string | null
  vacio?: string
  icono?: ReactNode
  /** Icono directo, como en la navegación lateral del editor. */
  iconoPlano?: boolean
  globito?: number
  onPress: () => void
  /** La última del bloque no lleva la línea de separación. */
  ultima?: boolean
  /**
   * Una acción que saca algo —«Quitar el fondo»—: sin flecha, porque no
   * abre nada, y con el rótulo en el tono de lo destructivo.
   */
  destructivo?: boolean
}) {
  const compacto = useAjustesCompactos()
  const puesto = !!valor?.trim()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${rotulo}${puesto ? `: ${valor}` : vacio ? `: ${vacio}` : ''}`}
      onPress={onPress}
      className={`flex-row items-center active:bg-muted ${compacto ? 'gap-2.5 pl-3' : 'gap-3 pl-4'}`}
    >
      {icono ? compacto || iconoPlano ? icono : <IconoAjuste>{icono}</IconoAjuste> : null}

      {/* La separación va adentro y no en el contenedor: así la línea arranca
          después del ícono, como en Ajustes, en vez de cortar el bloque entero. */}
      <View
        className={`${compacto ? 'min-h-[44px] gap-2.5 py-2 pr-3' : 'min-h-[52px] gap-3 py-2.5 pr-4'} min-w-0 flex-1 flex-row items-center ${
          ultima ? '' : 'border-b border-muted'
        }`}
      >
        <View className="min-w-0 shrink">
          <Text className={`${compacto ? 'text-[15px]' : 'text-[17px]'} ${destructivo ? 'text-destructive' : 'text-foreground'}`} numberOfLines={1}>
            {rotulo}
          </Text>
          {detalle ? (
            <Text className={`text-muted-foreground ${compacto ? 'text-[12px] leading-4' : 'text-[13px] leading-[18px]'}`}>{detalle}</Text>
          ) : null}
        </View>
        <Text
          className={`min-w-0 flex-1 text-right ${compacto ? 'text-[14px]' : 'text-[17px]'} ${
            puesto ? 'text-muted-foreground' : 'text-muted-foreground/60'
          }`}
          numberOfLines={1}
        >
          {puesto ? valor : vacio}
        </Text>
        {globito ? <Globito n={globito} /> : null}
        {destructivo ? null : <IconChevronRight size={15} color={ICON_COLOR.muted} />}
      </View>
    </Pressable>
  )
}

/**
 * La fila de la cuenta, arriba de todo: la cara grande, el nombre y qué hay
 * detrás. Es la primera fila de Configuración —«Nihuel Prieto · Cuenta de
 * Apple, iCloud y más»— y es más alta que las demás a propósito: es la única
 * que habla de una persona y no de una preferencia.
 */
export function FilaCuenta({
  avatar,
  nombre,
  detalle,
  onPress,
  ultima = false,
}: {
  avatar: ReactNode
  nombre: string
  detalle: string
  onPress: () => void
  ultima?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${nombre}. ${detalle}`}
      onPress={onPress}
      className="flex-row items-center gap-4 pl-4 active:bg-muted"
    >
      {avatar}
      <View
        className={`min-w-0 flex-1 flex-row items-center gap-3 py-3.5 pr-4 ${
          ultima ? '' : 'border-b border-muted'
        }`}
      >
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-foreground text-[19px] font-semibold" numberOfLines={1}>
            {nombre}
          </Text>
          <Text className="text-muted-foreground text-[13px]" numberOfLines={1}>
            {detalle}
          </Text>
        </View>
        <IconChevronRight size={15} color={ICON_COLOR.muted} />
      </View>
    </Pressable>
  )
}

/**
 * Una fila que enciende y apaga algo, sin abrir otra pantalla.
 *
 * Es la otra mitad del patrón de Ajustes: cuando lo que hay que decidir es
 * sí o no, empujar una pantalla para un solo interruptor es hacer trabajar de
 * más. Lo que implica va al pie del bloque (`GrupoAjustes.pie`), no debajo del
 * rótulo: así las filas quedan parejas, como en el sistema.
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
  iconoPlano = false,
  ultima = false,
}: {
  rotulo: string
  /** Una segunda línea, solo cuando el rótulo no alcanza. Preferir `pie` del bloque. */
  detalle?: string
  activo: boolean
  onCambiar: (activo: boolean) => void
  icono?: ReactNode
  /** Icono directo, como en la navegación lateral del editor. */
  iconoPlano?: boolean
  ultima?: boolean
}) {
  const compacto = useAjustesCompactos()
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={rotulo}
      aria-checked={activo}
      onPress={() => onCambiar(!activo)}
      className={`flex-row items-center active:bg-muted ${compacto ? 'gap-2.5 pl-3' : 'gap-3 pl-4'}`}
    >
      {icono ? compacto || iconoPlano ? icono : <IconoAjuste>{icono}</IconoAjuste> : null}

      <View
        className={`${compacto ? 'min-h-[44px] gap-2.5 py-2 pr-3' : 'min-h-[52px] gap-3 py-2.5 pr-4'} min-w-0 flex-1 flex-row items-center ${
          ultima ? '' : 'border-b border-muted'
        }`}
      >
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className={`text-foreground ${compacto ? 'text-[15px]' : 'text-[17px]'}`}>{rotulo}</Text>
          {detalle ? (
            <Text className={`text-muted-foreground ${compacto ? 'text-[12px] leading-4' : 'text-[13px] leading-[18px]'}`}>{detalle}</Text>
          ) : null}
        </View>

        <Interruptor activo={activo} compacto={compacto} />
      </View>
    </Pressable>
  )
}

/**
 * Una fila que elige **un valor entre varios** con un menú, sin otra pantalla.
 *
 * Es la fila con menú de iOS —el valor actual a la derecha y el chevron
 * doble— y en el iPhone el menú es el del sistema. Para tres a ocho opciones
 * es el control correcto: una pantalla entera para elegir minutos es una
 * pantalla de más, y una fila de chips adentro del bloque rompe el ritmo de
 * la lista.
 */
export function FilaOpciones<T extends string | number>({
  rotulo,
  valor,
  opciones,
  onElegir,
  icono,
  ultima = false,
}: {
  rotulo: string
  /** La opción elegida, o `null` si ninguna. */
  valor: T | null
  opciones: { value: T; label: string; sfSymbol?: SFSymbol; destructive?: boolean; separadorAntes?: boolean }[]
  onElegir: (value: T) => void
  icono?: ReactNode
  ultima?: boolean
}) {
  const compacto = useAjustesCompactos()
  const elegida = opciones.find((o) => o.value === valor)
  return (
    <Menu
      label={rotulo}
      triggerFullWidth
      items={opciones.map((o) => ({
        label: o.label,
        onPress: () => onElegir(o.value),
        selected: o.value === valor,
        sfSymbol: o.sfSymbol,
        destructive: o.destructive,
        separadorAntes: o.separadorAntes,
      }))}
      trigger={
        <View className={`w-full flex-row items-center ${compacto ? 'gap-2.5 pl-3' : 'gap-3 pl-4'}`}>
          {icono ? compacto ? icono : <IconoAjuste>{icono}</IconoAjuste> : null}
          <View
            className={`${compacto ? 'min-h-[44px] gap-2.5 py-2 pr-3' : 'min-h-[52px] gap-3 py-2.5 pr-4'} min-w-0 flex-1 flex-row items-center ${
              ultima ? '' : 'border-b border-muted'
            }`}
          >
            <Text className={`shrink-0 text-foreground ${compacto ? 'text-[15px]' : 'text-[17px]'}`}>{rotulo}</Text>
            <Text
              className={`min-w-0 flex-1 text-right text-muted-foreground ${compacto ? 'text-[14px]' : 'text-[17px]'}`}
              numberOfLines={1}
            >
              {elegida?.label ?? '—'}
            </Text>
            <IconChevronDown size={15} color={ICON_COLOR.muted} />
          </View>
        </View>
      }
    />
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
function Interruptor({ activo, compacto = false }: { activo: boolean; compacto?: boolean }) {
  const recorrido = compacto ? 18 : RECORRIDO
  const p = useDerivedValue(() => withSpring(activo ? 1 : 0, RESORTE), [activo])

  const perilla = useAnimatedStyle(() => ({
    transform: [{ translateX: p.value * recorrido }],
  }))
  /* La pista encendida aparece por encima de la apagada en vez de cambiarle el
     color: animar un color de fondo obliga a interpolarlo cuadro a cuadro, y
     encima taparía el vidrio de abajo con un color plano a mitad de camino. */
  const encendida = useAnimatedStyle(() => ({ opacity: p.value }))

  const cuerpo = (
    <View className={`${compacto ? 'h-[26px] w-[44px]' : 'h-[31px] w-[51px]'} justify-center px-[3px]`}>
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
          compacto
            ? { width: 20, height: 20, borderRadius: 10, backgroundColor: activo ? '#121212' : '#4D4D4D' }
            : { width: 25, height: 25, borderRadius: 13, backgroundColor: activo ? '#121212' : '#4D4D4D' },
          perilla,
        ]}
      />
    </View>
  )

  if (!HAY_VIDRIO) {
    return <View className="rounded-full bg-muted">{cuerpo}</View>
  }
  return (
    /* Con el filo del referente: el interruptor es un **input**, y en la
       librería de referencia los inputs llevan el anillo y el resplandor que
       los leen como una pieza hundida — a diferencia de los botones, que van
       lisos. */
    <Glass radius={compacto ? 13 : 16} style={{ alignSelf: 'center', boxShadow: BORDE_REFERENTE }}>
      {cuerpo}
    </Glass>
  )
}
