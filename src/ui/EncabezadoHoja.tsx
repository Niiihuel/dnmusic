import { estadoControlWeb } from './estadoControl'
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { BotonVolver } from './BotonVolver'
import { BotonVidrio, ES_WEB } from './Glass'
import { ICON_COLOR, IconCheck, IconChevronLeft, IconClose } from './icons'

/** Lo que mide la cabecera, para quien la pega arriba y necesita reservarlo. */
const ALTO_ENCABEZADO = 68
/** Lo que cuelga el velo por debajo de la cabecera. */
const VELO = 28

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
  velo = true,
}: {
  titulo: string
  sobre?: string
  /** El botón de la izquierda: casi siempre `BotonHoja` de cerrar o volver. */
  izquierda?: ReactNode
  /** El de la derecha: casi siempre `BotonConfirmar`. */
  derecha?: ReactNode
  /** Sólo para cabeceras pegadas dentro del scroll; fuera taparía el primer control. */
  velo?: boolean
}) {
  return (
    /*
     * La cabecera es opaca y **de ella cuelga un velo**: un degradado del
     * fondo a nada, por debajo, sobre lo que viene después. Pegada arriba de
     * un scroll (`stickyHeaderIndices={[0]}`), lo que pasa por debajo se apaga
     * contra el velo en vez de cortarse contra el borde — el encabezado
     * flotante de `docs/DESIGN.md`, y lo que hace cualquier hoja de Apple.
     * `zIndex` para que el velo quede sobre el contenido y no debajo.
     */
    <View className="bg-background" style={{ zIndex: 10, minHeight: ALTO_ENCABEZADO }}>
      <View className="flex-row items-center gap-3 px-4 py-3" style={{ minHeight: ALTO_ENCABEZADO }}>
        <View className="min-w-11 items-start">{izquierda}</View>
        <View className="min-w-0 flex-1 items-center gap-0.5">
          <Text accessibilityRole="header" className="text-foreground text-center text-body font-semibold" numberOfLines={2}>
            {titulo}
          </Text>
          {sobre ? <Text className="text-muted-foreground text-center text-footnote" numberOfLines={2}>{sobre}</Text> : null}
        </View>
        <View className="min-w-11 items-end">{derecha}</View>
      </View>
      {velo ? <LinearGradient
        pointerEvents="none"
        colors={['rgb(18,18,18)', 'rgba(18,18,18,0)']}
        style={{ position: 'absolute', left: 0, right: 0, top: '100%', height: VELO }}
      /> : null}
    </View>
  )
}

/**
 * El redondel de una hoja: cerrar, volver, o cualquier ícono.
 *
 * En iOS comparte el control circular de navegación y su material nativo.
 * En web conserva el fondo `muted`. La flecha retrocede dentro del flujo;
 * la cruz cierra la presentación.
 */
export function BotonHoja({
  tipo,
  label,
  onPress,
  children,
  disabled = false,
}: {
  tipo?: 'cerrar' | 'volver'
  label?: string
  onPress: () => void
  children?: ReactNode
  disabled?: boolean
}) {
  if (tipo === 'volver' && !children) {
    return <BotonVolver onPress={onPress} label={label} disabled={disabled} />
  }
  if (!ES_WEB) {
    return <BotonVidrio label={label ?? 'Cerrar'} onPress={onPress} disabled={disabled}
      radius={22} style={{ width: 44, height: 44 }}>
      {children ?? <IconClose size={18} color={ICON_COLOR.foreground} />}
    </BotonVidrio>
  }
  return (
    <Pressable
      {...estadoControlWeb('none')}
      accessibilityRole="button"
      accessibilityLabel={label ?? (tipo === 'volver' ? 'Volver' : 'Cerrar')}
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled }}
      hitSlop={6}
      className="h-11 w-11 items-center justify-center rounded-full bg-muted active:opacity-70"
      style={disabled ? { opacity: 0.4 } : undefined}
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
      {...estadoControlWeb('inverse')}
      accessibilityState={{ disabled: !puede, busy: ocupado }}
      disabled={!puede}
      onPress={onPress}
      hitSlop={6}
      className={`h-11 w-11 items-center justify-center rounded-full ${
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
