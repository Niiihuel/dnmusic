import { Pressable, View } from 'react-native'
import {
  toggleRepetir,
  toggleShuffle,
  useModoReproduccion,
  useRepetir,
  type ModoReproduccion,
} from '../state/playback'
import { ICON_COLOR, IconRepeat, IconRepeatOne, IconShuffle, IconSparkles } from './icons'
import { useConTooltip } from './Tooltip'

export const NOMBRE_MODO_REPRODUCCION: Record<ModoReproduccion, string> = {
  orden: 'En orden',
  aleatorio: 'Aleatorio',
  recomendado: 'Aleatorio con recomendaciones',
}

const SIGUIENTE_MODO: Record<ModoReproduccion, ModoReproduccion> = {
  orden: 'aleatorio',
  aleatorio: 'recomendado',
  recomendado: 'orden',
}

/**
 * Un único control con los tres estados de la cola: orden, azar dentro de la
 * colección y Smart Shuffle con descubrimiento. La chispa diferencia el tercer
 * estado incluso sin color.
 */
export function BotonAleatorio({
  size = 20,
  lado = 44,
  disabled = false,
}: {
  size?: number
  lado?: number
  disabled?: boolean
}) {
  const modo = useModoReproduccion()
  const siguiente = SIGUIENTE_MODO[modo]
  const rotulo = `${NOMBRE_MODO_REPRODUCCION[modo]}. Cambiar a ${NOMBRE_MODO_REPRODUCCION[siguiente]}`
  const tip = useConTooltip(rotulo)
  const activo = modo !== 'orden'
  const color = disabled ? ICON_COLOR.muted : activo ? ICON_COLOR.foreground : ICON_COLOR.muted

  return (
    <Pressable
      {...tip.gestos}
      accessibilityRole="button"
      accessibilityLabel={`Modo de reproducción: ${rotulo}`}
      accessibilityState={{ selected: activo, disabled }}
      onPress={toggleShuffle}
      disabled={disabled}
      style={{ width: lado, height: lado, opacity: disabled ? 0.45 : 1 }}
      className="items-center justify-center rounded-full active:bg-muted"
    >
      <View className="items-center justify-center">
        <IconShuffle size={size} color={color} />
        {modo === 'recomendado' ? (
          <View className="absolute -right-2 -top-2">
            <IconSparkles size={Math.max(9, Math.round(size * 0.52))} color={ICON_COLOR.foreground} />
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

/** Repetir rota apagado → lista → una sola. */
export function BotonRepetir({ size = 20, lado = 44 }: { size?: number; lado?: number }) {
  const repetir = useRepetir()
  const activo = repetir !== 'no'
  const Icono = repetir === 'una' ? IconRepeatOne : IconRepeat
  const rotulo =
    repetir === 'no'
      ? 'Repetir: apagado'
      : repetir === 'lista'
        ? 'Repetir: la lista entera'
        : 'Repetir: esta canción'
  const tip = useConTooltip(rotulo)

  return (
    <Pressable
      {...tip.gestos}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityState={{ selected: activo }}
      onPress={toggleRepetir}
      style={{ width: lado, height: lado }}
      className="items-center justify-center rounded-full active:opacity-60"
    >
      <Icono size={size} color={activo ? ICON_COLOR.foreground : ICON_COLOR.muted} />
    </Pressable>
  )
}
