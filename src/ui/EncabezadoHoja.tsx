import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { ICON_COLOR, IconCheck, IconChevronLeft, IconClose } from './icons'

/**
 * La cabecera de una hoja: cerrar a la izquierda, el título en el medio y la
 * acción a la derecha.
 *
 * Es la anatomía de cualquier hoja de Apple Music —«Nueva playlist», «Agregar
 * a “Mi lista”», «Agregar a playlist»— y la razón de que sea una sola pieza es
 * que antes cada hoja de esta app arrancaba distinto: una con un título
 * centrado y sin cerrar, otra con una flecha, otra con el título a la
 * izquierda. Con el mismo encabezado, las hojas se leen como hojas de la misma
 * app y el pulgar sabe dónde está cerrar sin mirar.
 *
 * `sobre` es la línea chica que va **encima** del título —«9 canciones a “Mi
 * lista”»—: es el resumen vivo de lo que se está haciendo en la hoja, y va
 * arriba y no abajo porque cambia mientras elegís y el título no.
 */
export function EncabezadoHoja({
  titulo,
  sobre,
  izquierda,
  derecha,
}: {
  titulo: string
  sobre?: string
  /** El botón de la izquierda: casi siempre `BotonHoja` de cerrar o volver. */
  izquierda?: ReactNode
  /** El de la derecha: casi siempre `BotonConfirmar`. */
  derecha?: ReactNode
}) {
  return (
    <View className="h-16 flex-row items-center px-3">
      <View className="w-11 items-start">{izquierda}</View>
      <View className="min-w-0 flex-1 items-center gap-0.5">
        {sobre ? (
          <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
            {sobre}
          </Text>
        ) : null}
        <Text className="text-foreground text-[16px] font-semibold" numberOfLines={1}>
          {titulo}
        </Text>
      </View>
      <View className="w-11 items-end">{derecha}</View>
    </View>
  )
}

/**
 * El redondel de una hoja: cerrar, volver, o cualquier ícono.
 *
 * Es `muted` y no vidrio a propósito: adentro de una hoja no hay nada que
 * pase por detrás que valga difuminar, y `docs/DESIGN.md` reserva el material
 * para lo que flota sobre contenido.
 */
export function BotonHoja({
  tipo,
  label,
  onPress,
  children,
}: {
  tipo?: 'cerrar' | 'volver'
  label?: string
  onPress: () => void
  children?: ReactNode
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? (tipo === 'volver' ? 'Volver' : 'Cerrar')}
      onPress={onPress}
      hitSlop={6}
      className="h-9 w-9 items-center justify-center rounded-full bg-muted active:opacity-70"
    >
      {children ??
        (tipo === 'volver' ? (
          <IconChevronLeft size={18} color={ICON_COLOR.foreground} />
        ) : (
          <IconClose size={16} color={ICON_COLOR.foreground} />
        ))}
    </Pressable>
  )
}

/**
 * La marca de confirmar: el redondel de la derecha.
 *
 * Apagada es gris —no hay nada que confirmar todavía—; con algo elegido se
 * vuelve el blanco del acento, que en este sistema es **la** acción principal
 * (`docs/DESIGN.md`). Mientras guarda, la marca se cambia por la rueda en el
 * mismo redondel, así el botón no salta de tamaño ni se mueve el título.
 */
export function BotonConfirmar({
  label,
  activo,
  ocupado = false,
  onPress,
}: {
  label: string
  activo: boolean
  ocupado?: boolean
  onPress: () => void
}) {
  const puede = activo && !ocupado
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !puede }}
      disabled={!puede}
      onPress={onPress}
      hitSlop={6}
      className={`h-9 w-9 items-center justify-center rounded-full ${
        puede ? 'bg-primary active:opacity-80' : 'bg-muted'
      }`}
    >
      {ocupado ? (
        <ActivityIndicator size="small" color={ICON_COLOR.muted} />
      ) : (
        <IconCheck size={17} color={puede ? ICON_COLOR.onPrimary : ICON_COLOR.muted} />
      )}
    </Pressable>
  )
}
