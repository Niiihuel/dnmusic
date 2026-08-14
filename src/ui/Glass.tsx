import type { PropsWithChildren, ReactNode } from 'react'
import { Platform, Pressable, View, type ViewStyle } from 'react-native'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'

/**
 * En web el vidrio no lo dibuja el módulo nativo sino CSS: `backdrop-filter`
 * difumina lo que pasa por detrás igual que el material de iOS. No es idéntico
 * —no refracta— pero es la misma idea: una lente, no un color.
 */
export const ES_WEB = Platform.OS === 'web'

/**
 * Si el sistema puede dibujar el material de verdad.
 *
 * Se resuelve una vez: es una propiedad del dispositivo —iOS 26 en adelante, o
 * un navegador—, no algo que cambie mientras la app corre. Android y los iPhone
 * anteriores caen al gris de siempre.
 *
 * Que web cuente como vidrio no es solo estética: abre las mismas decisiones de
 * layout que en iOS (el contenido corre hasta el borde, nada opaco entre el
 * contenido y el material — ver `docs/DESIGN.md`, sección Vidrio).
 */
export const HAY_VIDRIO = isLiquidGlassAvailable() || ES_WEB

/**
 * La receta CSS del vidrio, una sola vez.
 *
 * Tres capas en una: el desenfoque con saturación (la lente), un fondo apenas
 * gris para que el texto encima se lea sobre cualquier contenido, y un filo de
 * luz arriba —el brillo especular del material de Apple— que lo separa sin
 * dibujar un borde gris, que es lo que `docs/DESIGN.md` prohíbe.
 *
 * Con `tint` el vidrio se tiñe casi opaco: es la acción principal (la píldora
 * blanca), que tiene que seguir siendo lo más brillante de la pantalla pero
 * dejando adivinar lo que pasa por detrás.
 *
 * `backdropFilter` no está en los tipos de ViewStyle pero react-native-web lo
 * pasa tal cual al CSS, igual que `boxShadow`. El prefijo -webkit- va escrito
 * porque Safari todavía lo pide.
 */
function vidrioCss(tint?: string): ViewStyle {
  return {
    backdropFilter: 'blur(18px) saturate(160%)',
    WebkitBackdropFilter: 'blur(18px) saturate(160%)',
    backgroundColor: tint ? conAlfa(tint, 0.85) : 'rgba(28,28,28,0.52)',
    /* Solo la línea de luz de arriba: el brillo especular del material. El
       anillo del referente va únicamente en la píldora del reproductor —ver
       `BORDE_REFERENTE` abajo—, no en cada botón. */
    boxShadow: tint
      ? '0 8px 24px rgba(0,0,0,0.35)'
      : 'inset 0 1px 0 rgba(255,255,255,0.09), inset 0 0 0 0.5px rgba(255,255,255,0.05)',
  } as ViewStyle
}

/**
 * El filo del referente (Jakubantalik/Libraries, `.mock-icon-btn`): un anillo
 * interior de 1px apenas azulado más un resplandor interno grande y muy tenue
 * (50px al 2–3%) que le da volumen a la pieza. Es **para la tarjeta del
 * reproductor**, que es la pieza grande que necesita leerse como un objeto;
 * repartido en cada botón chico se vuelve un borde gris de los que DESIGN.md
 * prohíbe. Quien lo use lo suma a su `boxShadow` por `style`.
 */
export const BORDE_REFERENTE = [
  'inset 0 0 0 1px rgba(94,100,112,0.42)',
  'inset 0 0 50px 0 rgba(255,255,255,0.03)',
  'inset 0 1px 0 rgba(255,255,255,0.10)',
].join(', ')

/**
 * `#RRGGBB` → `rgba(...)`, en JS y no con `color-mix`: el normalizador de
 * colores de react-native-web no entiende funciones CSS modernas y descarta el
 * valor entero — el tinte del botón primario desaparecía y el «Entrar» del
 * login quedaba como un vidrio gris con el rótulo oscuro invisible encima.
 */
function conAlfa(hex: string, alfa: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`
}

/**
 * Una superficie flotante: vidrio donde se pueda, gris sólido donde no.
 *
 * El Liquid Glass necesita **algo por debajo que valga la pena difuminar**. Por
 * eso se usa solo en lo que flota sobre el contenido —la tarjeta del
 * reproductor, las pestañas, los redondeles del encabezado— y no en los
 * paneles, que son el fondo: ahí no hay nada atrás y el material se vería como
 * un gris más, con el costo de un efecto caro.
 *
 * Sin vidrio el respaldo no es un blur imitado sino nuestro gris de siempre:
 * un desenfoque falso sobre negro casi no se nota y no vale lo que cuesta.
 */
export function Glass({
  radius = 24,
  style,
  tint,
  dataSet,
  children,
}: PropsWithChildren<{
  radius?: number
  style?: ViewStyle | ViewStyle[]
  /** Un tinte propio. Sin esto, el vidrio toma lo que tenga detrás. */
  tint?: string
  /**
   * Atributos `data-*` para la web, donde react-native-web los vuelca al DOM.
   * Es la manija que usa el menú para engancharle animaciones CSS al vidrio
   * mismo — la animación tiene que vivir en esta capa, no en un envoltorio
   * (un ancestro con opacidad animada apaga el backdrop-filter). En nativo no
   * hay DOM y se ignora.
   */
  dataSet?: Record<string, string>
}>) {
  const forma: ViewStyle = { borderRadius: radius, overflow: 'hidden' }

  if (ES_WEB) {
    return (
      <View {...({ dataSet } as object)} style={[forma, vidrioCss(tint), style]}>
        {children}
      </View>
    )
  }

  if (!HAY_VIDRIO) {
    return <View style={[forma, { backgroundColor: 'rgb(24,24,24)' }, style]}>{children}</View>
  }

  return (
    <GlassView
      glassEffectStyle="regular"
      // La app es oscura siempre; dejarlo en automático haría que el material
      // cambie con el tema del sistema y quede claro sobre nuestro fondo negro.
      colorScheme="dark"
      tintColor={tint}
      style={[forma, style]}
    >
      {children}
    </GlassView>
  )
}

/**
 * Un botón de vidrio, con el respaldo gris donde no lo haya.
 *
 * Apple pone el material en **la capa que flota sobre el contenido**: barras,
 * controles al pie, botones sueltos encima de algo que se desplaza. Es la misma
 * regla que ya sigue `Glass` y por la que los paneles no lo llevan — sin nada
 * detrás no hay qué difuminar.
 *
 * De ahí salen dos límites que este componente respeta y conviene no saltear:
 *
 * - **Nada de vidrio sobre vidrio.** Los ítems de las pestañas y los controles
 *   de la tarjeta del reproductor ya están *adentro* de una pieza de material;
 *   darles la suya propia apila dos capas y las dos se ensucian. Ahí el botón
 *   se queda transparente, que es lo correcto.
 * - **Un solo prominente por pantalla.** `tint` pinta el vidrio con el acento y
 *   lo convierte en la acción principal; repartido pierde exactamente lo que lo
 *   hace principal, igual que el blanco en `docs/DESIGN.md`.
 */
export function BotonVidrio({
  onPress,
  disabled = false,
  label,
  radius = 999,
  tint,
  style,
  children,
}: {
  onPress: () => void
  disabled?: boolean
  label: string
  radius?: number
  /** El acento: lo vuelve la acción principal. Uno por pantalla. */
  tint?: string
  style?: ViewStyle
  children: ReactNode
}) {
  return (
    <Glass
      radius={radius}
      tint={tint}
      style={[{ overflow: 'hidden' }, style ?? {}, disabled ? { opacity: 0.4 } : {}]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        /* El toque ocupa la pieza entera: el vidrio es la forma del botón, no
           una decoración detrás de él. */
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        {children}
      </Pressable>
    </Glass>
  )
}
