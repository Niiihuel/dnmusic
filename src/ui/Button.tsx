import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { BotonVidrio, HAY_VIDRIO } from './Glass'
import { ICON_COLOR } from './icons'

/** Alto de las dos píldoras. Comparten medida para poder ir en la misma fila. */
const ALTO = 52

/**
 * Botón principal de los formularios.
 *
 * Es la píldora blanca del login. Deshabilitado no se atenúa con opacidad sino
 * que cambia de fondo: atenuar el blanco sobre negro lo deja gris sucio y se
 * lee como un error de color, no como un botón apagado.
 *
 * Mientras trabaja conserva el alto y muestra el spinner en lugar del texto, así
 * el formulario no se mueve al enviar.
 *
 * En iOS 26 la píldora es **vidrio teñido con el acento**, que es la forma que
 * Apple le da a la acción principal: sigue siendo lo más brillante de la
 * pantalla —lo que pide `docs/DESIGN.md`— pero deja pasar lo que tiene detrás en
 * vez de taparlo. Apagado vuelve al gris sólido: un vidrio sin tinte y sin
 * respuesta al toque no se lee como deshabilitado, se lee como roto.
 */
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  busy = false,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  busy?: boolean
}) {
  const active = !disabled && !busy

  if (HAY_VIDRIO && active) {
    return (
      <BotonVidrio
        onPress={onPress}
        label={label}
        radius={26}
        tint={ICON_COLOR.foreground}
        style={{ height: ALTO }}
      >
        {busy ? (
          <ActivityIndicator color={ICON_COLOR.onPrimary} />
        ) : (
          <Text className="text-primary-foreground text-[13px] font-semibold uppercase tracking-[1.4px]">
            {label}
          </Text>
        )}
      </BotonVidrio>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !active, busy }}
      disabled={!active}
      onPress={onPress}
      className={`h-[52px] items-center justify-center rounded-full ${
        active ? 'bg-primary active:opacity-80' : 'bg-muted'
      }`}
    >
      {busy ? (
        <ActivityIndicator color="#121212" />
      ) : (
        <Text
          className={`text-[13px] font-semibold uppercase tracking-[1.4px] ${
            active ? 'text-primary-foreground' : 'text-muted-foreground'
          }`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  )
}

/**
 * Botón secundario: mismo tamaño, solo contorno.
 *
 * Con vidrio se va el contorno. El material ya se separa del fondo por sí solo
 * —que es de lo que se trata—, y `docs/DESIGN.md` pide no dibujar líneas grises
 * cuando la separación ya está resuelta de otra forma. Va **sin tinte**: el
 * teñido es del principal, y dos prominentes en la misma fila no dejan ninguno.
 */
export function GhostButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  if (HAY_VIDRIO) {
    return (
      <BotonVidrio
        onPress={onPress}
        label={label}
        disabled={disabled}
        radius={26}
        style={{ height: ALTO }}
      >
        <Text className="text-foreground text-[13px] font-semibold uppercase tracking-[1.4px]">
          {label}
        </Text>
      </BotonVidrio>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`h-[52px] items-center justify-center rounded-full border border-border ${
        disabled ? 'opacity-40' : 'active:bg-muted'
      }`}
    >
      <Text className="text-foreground text-[13px] font-semibold uppercase tracking-[1.4px]">
        {label}
      </Text>
    </Pressable>
  )
}

/** Bloque de error de formulario, con el mismo aspecto en todas las pantallas. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <View className="rounded-lg bg-muted px-4 py-3">
      <Text className="text-destructive text-[13px] leading-5">{message}</Text>
    </View>
  )
}
