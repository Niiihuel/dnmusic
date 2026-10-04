import { useEffect, useRef, useState } from 'react'
import { Image, View } from 'react-native'
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { ES_WEB } from './Glass'
import { ICON_COLOR, IconMusic } from './icons'
import { artworkSource } from '../lib/artwork'
import { useMovimientoVisible } from './useMovimientoVisible'

const SPIN_MS = 6000
const SPIN_DOWN_DEG = 14
const SPIN_DOWN_MS = 650

/* CSS gira en el compositor sin escribir transform desde JS en cada cuadro. Los keyframes requieren una hoja global. */
function instalarGiroWeb() {
  if (!ES_WEB || typeof document === 'undefined' || document.getElementById('dn-player-disc-motion')) return
  const hoja = document.createElement('style')
  hoja.id = 'dn-player-disc-motion'
  hoja.textContent = `
@keyframes dn-disco-gira { to { transform: rotate(360deg) } }
[data-disco] {
  animation: dn-disco-gira ${SPIN_MS}ms linear infinite;
  animation-play-state: paused;
}
/* Sólo el disco activo conserva una capa del compositor. */
[data-disco="gira"] { animation-play-state: running; will-change: transform; }
@media (prefers-reduced-motion: reduce) { [data-disco] { animation: none; } }
`
  document.head.appendChild(hoja)
}

const LABEL_R = 0.3
const GROOVE_FROM = 0.335
const GROOVE_TO = 0.475
const GROOVES = 16

export function SongDisc({
  artworkUrl,
  artworkPath,
  title,
  playing = false,
  size = 220,
}: {
  artworkUrl?: string | null
  /* La copia almacenada tiene prioridad sobre el CDN; ver artworkSource. */
  artworkPath?: string | null
  title: string
  playing?: boolean
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  const angle = useSharedValue(0)

  const movimiento = useMovimientoVisible()

  /* La inercia sólo corresponde a una pausa tras reproducir, no al montar. */
  const giraba = useRef(false)

  useEffect(instalarGiroWeb, [])
  useEffect(() => {
    // En web gira por CSS y no hay nada que manejar acá.
    if (ES_WEB) return
    cancelAnimation(angle)
    if (!movimiento) { giraba.current = false; return }
    if (playing) {
      giraba.current = true
      // El destino se calcula una vez; al repetirse vuelve a correr el mismo
      // tramo, y como 360° es una vuelta entera el empalme no se ve.
      angle.value = withRepeat(
        withTiming(angle.value + 360, { duration: SPIN_MS, easing: Easing.linear }),
        -1,
        false,
      )
    } else if (giraba.current) {
      giraba.current = false
      angle.value = withTiming(angle.value + SPIN_DOWN_DEG, {
        duration: SPIN_DOWN_MS,
        easing: Easing.out(Easing.quad),
      })
    }
    return () => cancelAnimation(angle)
  }, [playing, movimiento, angle])

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }))

  /* CSS conserva el ángulo al pausar; la inercia queda en el camino nativo. */
  const giroWeb = ES_WEB ? { disco: playing && movimiento ? 'gira' : 'quieto' } : undefined

  const c = size / 2
  const labelR = size * LABEL_R
  // A 2x, para que no se vea blanda en pantallas densas.
  const art = artworkSource(artworkPath, artworkUrl, Math.round(labelR * 4))
  const grooves = Array.from(
    { length: GROOVES },
    (_, i) => size * (GROOVE_FROM + (GROOVE_TO - GROOVE_FROM) * (i / (GROOVES - 1))),
  )

  return (
    <Animated.View
      accessibilityLabel={`Disco de ${title}`}
      {...({ dataSet: giroWeb } as object)}
      style={[
        { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
        ES_WEB ? null : spin,
      ]}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>

          <RadialGradient id="vinilo" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#2E2E2E" />
            <Stop offset="0.72" stopColor="#1A1A1A" />
            <Stop offset="1" stopColor="#0D0D0D" />
          </RadialGradient>
        </Defs>

        <Circle cx={c} cy={c} r={size / 2} fill="url(#vinilo)" />

        <Circle cx={c} cy={c} r={size / 2 - 0.5} stroke="#FFFFFF" strokeOpacity={0.14} fill="none" />

        {grooves.map((r) => (
          <Circle
            key={r}
            cx={c}
            cy={c}
            r={r}
            stroke="#FFFFFF"
            strokeOpacity={0.07}
            strokeWidth={1}
            fill="none"
          />
        ))}
      </Svg>

      {art && !failed ? (
        <Image
          source={{ uri: art }}

          onError={() => setFailed(true)}
          style={{ width: labelR * 2, height: labelR * 2, borderRadius: labelR }}
          accessibilityLabel={`Carátula de ${title}`}
        />
      ) : (
        <View
          style={{
            width: labelR * 2,
            height: labelR * 2,
            borderRadius: labelR,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          className="bg-muted"
        >
          <IconMusic size={Math.round(size * 0.11)} color={ICON_COLOR.muted} />
        </View>
      )}

      <Svg width={size} height={size} style={{ position: 'absolute' }} pointerEvents="none">
        <Circle cx={c} cy={c} r={labelR} stroke="#FFFFFF" strokeOpacity={0.12} fill="none" />
      </Svg>
    </Animated.View>
  )
}
