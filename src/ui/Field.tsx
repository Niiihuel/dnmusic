import { forwardRef, type ReactNode } from 'react'
import { Text, TextInput, View, type TextInputProps } from 'react-native'

/**
 * Campo de formulario con etiqueta.
 *
 * Es el mismo campo del login, extraído para que los formularios que vienen
 * después no lo vuelvan a dibujar a mano: alto fijo de 56, ícono a la
 * izquierda, etiqueta en versalitas arriba y el mensaje de ayuda o de error
 * abajo, siempre ocupando lugar aunque esté vacío — si apareciera solo cuando
 * hay error, el formulario entero saltaría al escribir.
 */
export const PLACEHOLDER_COLOR = '#777777'

export type FieldProps = Omit<TextInputProps, 'className'> & {
  /**
   * La etiqueta en versalitas arriba del campo. Opcional: sin ella, el campo va
   * pelado —solo el placeholder guía— para las pantallas que quieren el mínimo,
   * como el login. Cuando falta, la accesibilidad cae al placeholder, así que
   * el campo nunca queda sin nombre para el lector de pantalla.
   */
  label?: string
  icon?: ReactNode
  /** Texto de ayuda bajo el campo. Lo pisa `error` cuando hay uno. */
  hint?: string
  error?: string | null
  /** Señal de "esto está bien", a la derecha del campo. */
  valid?: boolean
  /** Indicador propio a la derecha: un spinner, una tilde, lo que sea. */
  accessory?: ReactNode
}

export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, icon, hint, error, accessory, ...input },
  ref,
) {
  /* El pie solo existe si hay algo que decir. Con etiqueta arriba se mantiene
     siempre —reservar su renglón evita que el formulario salte al aparecer un
     error—; sin etiqueta (el modo mínimo del login) no hay a qué saltar, así
     que un renglón vacío sería aire de más. */
  const pie = error ?? hint ?? (label ? ' ' : null)

  return (
    <View className="gap-2">
      {label ? (
        <Text className="text-muted-foreground text-footnote font-semibold uppercase">
          {label}
        </Text>
      ) : null}
      <View
        className={`h-14 flex-row items-center gap-3 rounded-lg bg-muted px-4 ${
          error ? 'border border-destructive' : ''
        }`}
      >
        {icon}
        <TextInput
          ref={ref}
          placeholderTextColor={PLACEHOLDER_COLOR}
          accessibilityLabel={label ?? input.placeholder}
          className="h-full flex-1 text-foreground text-subheadline"
          {...input}
        />
        {accessory}
      </View>
      {pie !== null ? (
        <Text
          className={`text-caption1 ${error ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {pie}
        </Text>
      ) : null}
    </View>
  )
})
