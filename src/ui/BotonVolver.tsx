import type { ReactNode } from 'react'
import { Platform, Pressable } from 'react-native'
import { BotonVidrio } from './Glass'
import { estadoControlWeb } from './estadoControl'
import { ICON_COLOR, IconChevronLeft } from './icons'

/**
 * Volver en una pantalla apilada.
 *
 * En iOS conserva la forma circular y el material del control estándar; en el
 * resto queda integrado en el encabezado. El área interactiva es siempre de
 * 44 puntos y usa el chevron de navegación, no una flecha de herramienta.
 */
export function BotonVolver({
  onPress,
  label = 'Volver',
  disabled = false,
  icono,
}: {
  onPress: () => void
  label?: string
  disabled?: boolean
  icono?: ReactNode
}) {
  const contenido = icono ?? <IconChevronLeft size={21} color={ICON_COLOR.foreground} />

  if (Platform.OS === 'ios') {
    return (
      <BotonVidrio
        label={label}
        onPress={onPress}
        disabled={disabled}
        radius={22}
        style={{ width: 44, height: 44 }}
      >
        {contenido}
      </BotonVidrio>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      {...estadoControlWeb('normal')}
      style={{ width: 44, height: 44, borderRadius: 22, opacity: disabled ? 0.4 : 1 }}
      className="items-center justify-center active:bg-muted"
    >
      {contenido}
    </Pressable>
  )
}
