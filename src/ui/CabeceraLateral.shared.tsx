import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { TECLADO_FISICO } from '../lib/teclado'
import { useConTooltip } from './Tooltip'
import { ARRASTRE_VENTANA, SIN_ARRASTRE } from './BandaVentana'

/**
 * Cabecera compacta de navegación e inspección. Puede arrastrar la ventana,
 * además de la barra global de BandaVentana; sus botones siguen recibiendo clic.
 * La reserva del overlay pertenece a la raíz y también protege otras rutas.
 */
export function CabeceraLateral({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return <View className={`flex-row items-center gap-1 px-2 pb-1 pt-1 ${ARRASTRE_VENTANA}`}>
    <Text className="min-w-0 flex-1 px-1 text-foreground text-footnote font-semibold" numberOfLines={1}>{titulo}</Text>
    {children}
  </View>
}

/** Sin una superficie extra: foco, tooltip y área táctil comparten el control. */
export function BotonLateral({ label, onPress, icono, disabled = false }: {
  label: string; onPress: () => void; icono: ReactNode; disabled?: boolean
}) {
  const tip = useConTooltip(disabled ? undefined : label)
  const lado = TECLADO_FISICO ? 32 : 44
  return <Pressable {...tip.gestos} accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={{ width: lado, height: lado, flexShrink: 0, opacity: disabled ? 0.4 : 1 }}
    /* Se sale de la zona de arrastre del encabezado: adentro no recibiría el click. */
    className={`items-center justify-center rounded-md active:bg-muted ${SIN_ARRASTRE}`}>
    {icono}
  </Pressable>
}
