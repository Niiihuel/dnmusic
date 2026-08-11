import type { PropsWithChildren, ReactNode } from 'react'
import { Pressable, View, type ViewStyle } from 'react-native'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'

/**
 * Si el sistema puede dibujar el material de verdad.
 *
 * Se resuelve una vez: es una propiedad del dispositivo —iOS 26 en adelante—,
 * no algo que cambie mientras la app corre. En web y en Android el propio
 * módulo devuelve `false` y `GlassView` cae a un `View` común, así que acá no
 * hace falta preguntar por la plataforma.
 */
export const HAY_VIDRIO = isLiquidGlassAvailable()

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
  children,
}: PropsWithChildren<{
  radius?: number
  style?: ViewStyle | ViewStyle[]
  /** Un tinte propio. Sin esto, el vidrio toma lo que tenga detrás. */
  tint?: string
}>) {
  const forma: ViewStyle = { borderRadius: radius, overflow: 'hidden' }

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
