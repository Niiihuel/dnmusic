import { ActivityIndicator, View } from 'react-native'
import { PlayingBars } from './PlayingBars'
import { ICON_COLOR, IconPause, IconPlay } from './icons'

/**
 * Lo que pasa con una canción, dicho **sobre su tapa**.
 *
 * Es la única señal de estado que tiene una fila, y por eso vive en un solo
 * lugar: el buscador, la portada y las tablas de canciones la dibujaban por
 * separado y ya habían empezado a diferir —una mostraba el reloj de espera y
 * las otras seguían mostrando el play mientras el audio se resolvía—.
 *
 * **Esperar se dice acá y en ningún otro lado.** Antes, preparar una canción
 * ponía un cartel con un spinner arriba de todo, pegado al encabezado: lejos de
 * lo que tocaste, tapando la primera fila, y sin decir *cuál* de las canciones
 * estaba cargando. La espera es de una canción concreta, así que se muestra
 * encima de esa canción — que además es justo donde estabas mirando cuando la
 * tocaste.
 *
 * La capa existe siempre y se muestra por opacidad, nunca montándose y
 * desmontándose: si el nodo donde empezó la pulsación desaparece antes de
 * soltar, el navegador no emite el `click` y el toque se pierde.
 */
export function EstadoTapa({
  /** El audio se está resolviendo. La primera vez tarda unos segundos. */
  busy = false,
  /** Es la que está sonando —o cargada— en el reproductor. */
  sounding = false,
  /** Y está efectivamente sonando, no en pausa. */
  playing = false,
  /** El cursor está encima: en escritorio destapa el control. */
  hovered = false,
  size = 15,
}: {
  busy?: boolean
  sounding?: boolean
  playing?: boolean
  hovered?: boolean
  size?: number
}) {
  const visible = busy || sounding || hovered

  return (
    <View
      pointerEvents="none"
      className="absolute inset-0 items-center justify-center rounded"
      style={{
        opacity: visible ? 1 : 0,
        backgroundColor: visible ? 'rgba(10,10,10,0.66)' : 'transparent',
      }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={ICON_COLOR.foreground} />
      ) : sounding && !hovered ? (
        <PlayingBars playing={playing} size={13} />
      ) : sounding && playing ? (
        <IconPause size={size} color={ICON_COLOR.foreground} />
      ) : (
        <IconPlay size={size} color={ICON_COLOR.foreground} />
      )}
    </View>
  )
}
