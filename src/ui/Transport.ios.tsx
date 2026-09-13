import { toggleRepetir, toggleShuffle, useModoReproduccion, useRepetir } from '../state/playback'
import { IconButton } from './IconButton'
import { NOMBRE_MODO_REPRODUCCION } from './Transport.shared'
export { NOMBRE_MODO_REPRODUCCION } from './Transport.shared'

const siguiente = { orden: 'aleatorio', aleatorio: 'recomendado', recomendado: 'orden' } as const

export function BotonAleatorio({ size = 20, lado = 44, disabled = false }: { size?: number; lado?: number; disabled?: boolean }) {
  const modo = useModoReproduccion()
  return <IconButton label={`Modo de reproducción: ${NOMBRE_MODO_REPRODUCCION[modo]}. Cambiar a ${NOMBRE_MODO_REPRODUCCION[siguiente[modo]]}`}
    symbol={modo === 'recomendado' ? 'sparkles' : 'shuffle'} selected={modo !== 'orden'} muted={modo === 'orden'}
    onPress={toggleShuffle} disabled={disabled} size={size} lado={lado} />
}

export function BotonRepetir({ size = 20, lado = 44 }: { size?: number; lado?: number }) {
  const repetir = useRepetir()
  return <IconButton label={repetir === 'no' ? 'Repetir: apagado' : repetir === 'lista' ? 'Repetir: la lista entera' : 'Repetir: esta canción'}
    symbol={repetir === 'una' ? 'repeat.1' : 'repeat'} selected={repetir !== 'no'} muted={repetir === 'no'}
    onPress={toggleRepetir} size={size} lado={lado} />
}
