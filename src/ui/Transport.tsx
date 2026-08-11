import { Pressable } from 'react-native'
import { toggleRepetir, toggleShuffle, useRepetir, useShuffle } from '../state/playback'
import { ICON_COLOR, IconRepeat, IconRepeatOne, IconShuffle } from './icons'

/**
 * Aleatorio y repetir, los dos botones que rodean al play.
 *
 * Viven acá y no adentro de cada reproductor porque hay dos —la pantalla
 * completa del teléfono y la barra de escritorio— y son el mismo control sobre
 * el mismo estado. Duplicados, el día que uno cambie de forma el otro se queda a
 * medio camino, que es exactamente lo que pasó con la fila de canciones antes de
 * que existiera `TrackRow`.
 *
 * **Estaban en Ajustes y ahí no iban.** Ajustes es para lo que se decide una vez
 * —si al terminar la lista sigue sonando algo, cuándo se apaga sola— y esto se
 * decide *mientras escuchás*, mirando lo que suena. Ir a otra pantalla para
 * barajar la lista que tenés puesta es demasiados pasos para algo que en
 * cualquier reproductor es un toque, al lado del play. Ver el mismo criterio en
 * la cabecera de la lista, que también tiene el suyo.
 *
 * Se marcan por luminancia y no por color: encendido es el blanco de `primary`,
 * que en este sistema **es** el acento; apagado queda el gris de los controles
 * inactivos. Ver `docs/DESIGN.md`.
 */
export function BotonAleatorio({ size = 20, lado = 44 }: { size?: number; lado?: number }) {
  const activo = useShuffle()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={activo ? 'Reproducir en orden' : 'Reproducir al azar'}
      accessibilityState={{ selected: activo }}
      onPress={toggleShuffle}
      style={{ width: lado, height: lado }}
      className="items-center justify-center rounded-full active:opacity-60"
    >
      <IconShuffle size={size} color={activo ? ICON_COLOR.foreground : ICON_COLOR.muted} />
    </Pressable>
  )
}

/**
 * Repetir, que **rota entre tres**: apagado → la lista → esta sola.
 *
 * Es un botón y no un interruptor por eso mismo: dos posiciones no alcanzan para
 * tres estados. El orden es el de todos los reproductores desde el primer iPod,
 * y el tercero se distingue por el «1» del ícono y no solo por el color — con la
 * app en blanco y negro, «encendido» y «encendido de otra manera» serían el mismo
 * blanco.
 */
export function BotonRepetir({ size = 20, lado = 44 }: { size?: number; lado?: number }) {
  const repetir = useRepetir()
  const activo = repetir !== 'no'
  const Icono = repetir === 'una' ? IconRepeatOne : IconRepeat

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        repetir === 'no'
          ? 'Repetir: apagado'
          : repetir === 'lista'
            ? 'Repetir: la lista entera'
            : 'Repetir: esta canción'
      }
      accessibilityState={{ selected: activo }}
      onPress={toggleRepetir}
      style={{ width: lado, height: lado }}
      className="items-center justify-center rounded-full active:opacity-60"
    >
      <Icono size={size} color={activo ? ICON_COLOR.foreground : ICON_COLOR.muted} />
    </Pressable>
  )
}
