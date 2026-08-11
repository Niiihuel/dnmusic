import { forwardRef, type ReactNode } from 'react'
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native'
import { ICON_COLOR, IconEye, IconEyeOff } from './icons'

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

type Props = Omit<TextInputProps, 'className'> & {
  label: string
  icon?: ReactNode
  /** Texto de ayuda bajo el campo. Lo pisa `error` cuando hay uno. */
  hint?: string
  error?: string | null
  /** Señal de "esto está bien", a la derecha del campo. */
  valid?: boolean
  /** Indicador propio a la derecha: un spinner, una tilde, lo que sea. */
  accessory?: ReactNode
}

export const Field = forwardRef<TextInput, Props>(function Field(
  { label, icon, hint, error, accessory, ...input },
  ref,
) {
  return (
    <View className="gap-2">
      <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.8px]">
        {label}
      </Text>
      <View
        className={`h-14 flex-row items-center gap-3 rounded-lg bg-muted px-4 ${
          error ? 'border border-destructive' : ''
        }`}
      >
        {icon}
        <TextInput
          ref={ref}
          placeholderTextColor={PLACEHOLDER_COLOR}
          accessibilityLabel={label}
          className="h-full flex-1 text-foreground text-[15px]"
          {...input}
        />
        {accessory}
      </View>
      <Text
        className={`text-[12px] leading-4 ${error ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {error ?? hint ?? ' '}
      </Text>
    </View>
  )
})

/**
 * Campo de contraseña con el ojo para mostrarla.
 *
 * El botón va como hermano del input y no envolviéndolo: anidado, en web sale
 * un `<button>` dentro de otro control y deja de ser alcanzable con el tabulador.
 */
export function PasswordField({
  visible,
  onToggleVisible,
  ...props
}: Props & { visible: boolean; onToggleVisible: () => void }) {
  return (
    <Field
      {...props}
      secureTextEntry={!visible}
      accessory={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          onPress={onToggleVisible}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-background"
        >
          {visible ? (
            <IconEyeOff size={18} color={ICON_COLOR.muted} />
          ) : (
            <IconEye size={18} color={ICON_COLOR.muted} />
          )}
        </Pressable>
      }
    />
  )
}
