import { ActivityIndicator, Text, View } from 'react-native'
import { PlayingBars } from './PlayingBars'
import { usePlaybackCargada } from '../state/playback'
import { filaCargando } from './estadoFilaReproduccion'
import { useProgresoResolucion } from '../state/resolucion'
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
/**
 * Lo que se muestra mientras una canción se **prepara por primera vez**: el
 * porcentaje si el servidor lo está contando (`state/resolucion`), y la rueda
 * de siempre mientras todavía no llegó ningún número (o contra un server viejo
 * que no lo manda). Un número que sube dice «está pasando algo»; una rueda a
 * secas no dice si carga o si el server se cayó.
 */
export function IndicadorPreparando({ color = ICON_COLOR.foreground }: { color?: string }) {
  const pct = useProgresoResolucion()
  if (pct == null) return <ActivityIndicator size="small" color={color} />
  return (
    <Text style={{ color, fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
      {Math.round(pct * 100)}%
    </Text>
  )
}

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
  /* La que suena pero cuyo audio el motor todavía no tiene también está
     cargando: spinner, no barras sobre silencio. Ver `TrackRow`. */
  const cargada = usePlaybackCargada()
  const cargando = filaCargando(sounding, playing, cargada, busy)
  const visible = cargando || sounding || hovered

  return (
    <View
      pointerEvents="none"
      className="absolute inset-0 items-center justify-center rounded"
      style={{
        opacity: visible ? 1 : 0,
        backgroundColor: visible ? 'rgba(10,10,10,0.66)' : 'transparent',
      }}
    >
      {cargando ? (
        <IndicadorPreparando />
      ) : sounding && playing && !hovered ? (
        <PlayingBars playing={playing} size={13} />
      ) : sounding && playing ? (
        <IconPause size={size} color={ICON_COLOR.foreground} />
      ) : (
        <IconPlay size={size} color={ICON_COLOR.foreground} />
      )}
    </View>
  )
}
