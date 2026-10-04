import { IconButton } from './IconButton'
import { useEffect, useState, type ReactNode } from 'react'
import { useAppActiva } from '../lib/appActiva'
import { Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'
import type { PopoverOption } from './Popover'
import { TECLADO_FISICO } from '../lib/teclado'
import { Menu, type MenuItem } from './Menu'
import {
  ICON_COLOR,
  IconDisc,
  IconLanguages,
  IconLyrics,
  IconPause,
  IconPlay,
  IconWave,
} from './icons'
import { LYRIC_LANGS, type LyricLang } from '../services/music'

/* wave edita el recorte; disc y lyrics muestran las presentaciones del mensaje. */
export type SnippetView = 'wave' | 'lyrics' | 'disc'

type Props = {
  view: SnippetView
  onChangeView: (view: SnippetView) => void
  /** Sin letra sincronizada no hay a dónde cambiar: el selector se apaga. */
  hasLyrics: boolean
  playing: boolean
  onToggle: () => void
  /** Posición de reproducción en ms, en la escala de la canción completa. */
  positionMs: SharedValue<number>
  startMs: number
  snippetMs: number
  /** Salto dentro del recorte, desde la barra de progreso. */
  onSeek: (ms: number) => void
  choice: number
  choices: PopoverOption<number>[]
  onChangeChoice: (value: number) => void
  /** Idioma en que se muestra la letra; `off` es la original. */
  lang: LyricLang
  onChangeLang: (lang: LyricLang) => void
  translating: boolean
  accion?: ReactNode
  ocupado?: boolean
  onCambiarCancion?: () => void
}

const TRACK_H = 4
const THUMB = 12
const CLOCK_MS = 200

/** Reproducción, opciones nativas y confirmación. La onda ya permite buscar;
 * la barra de progreso adicional solo acompaña las vistas previas. */
export function PlayerBar({
  view,
  onChangeView,
  hasLyrics,
  playing,
  onToggle,
  positionMs,
  startMs,
  snippetMs,
  onSeek,
  choice,
  choices,
  onChangeChoice,
  lang,
  onChangeLang,
  translating,
  accion,
  ocupado = false,
  onCambiarCancion,
}: Props) {
  const [trackW, setTrackW] = useState(0)
  const [hover, setHover] = useState(false)

  const dragging = useSharedValue(false)
  const dragMs = useSharedValue(0)

  const commit = (ms: number) => onSeek(ms)

  const timeAt = (x: number) => {
    'worklet'
    if (!trackW) return startMs
    return startMs + Math.max(0, Math.min(1, x / trackW)) * snippetMs
  }

  /* El arrastre actualiza la vista en UI y confirma una única búsqueda al soltar. */
  const drag = Gesture.Pan()
    .onBegin((e) => {
      dragging.value = true
      dragMs.value = timeAt(e.x)
    })
    .onUpdate((e) => {
      dragMs.value = timeAt(e.x)
    })
    .onEnd(() => {
      runOnJS(commit)(dragMs.value)
    })
    .onFinalize(() => {
      dragging.value = false
    })

  const tap = Gesture.Tap().onEnd((e) => {
    runOnJS(commit)(timeAt(e.x))
  })

  const gesture = Gesture.Race(drag, tap)

  /* Reanimated detecta las dependencias leídas dentro del closure de useAnimatedStyle.
     scaleX mantiene precisión subpíxel sin provocar layout por cuadro. */
  const fillStyle = useAnimatedStyle(() => {
    const at = dragging.value ? dragMs.value : positionMs.value
    const r = snippetMs > 0 ? (at - startMs) / snippetMs : 0
    return { transform: [{ scaleX: Math.max(0, Math.min(1, r)) }] }
  })

  const thumbStyle = useAnimatedStyle(() => {
    const at = dragging.value ? dragMs.value : positionMs.value
    const r = snippetMs > 0 ? (at - startMs) / snippetMs : 0
    return {
      transform: [{ translateX: Math.max(0, Math.min(1, r)) * trackW - THUMB / 2 }],
      opacity: hover || dragging.value ? 1 : 0,
    }
  })

  const vistas: MenuItem[] = [
    { label: 'Onda', sfSymbol: 'waveform', icon: <IconWave size={18} color={ICON_COLOR.foreground} />, selected: view === 'wave', onPress: () => onChangeView('wave') },
    { label: 'Disco', sfSymbol: 'opticaldisc', icon: <IconDisc size={18} color={ICON_COLOR.foreground} />, selected: view === 'disc', onPress: () => onChangeView('disc') },
    { label: 'Letra', sfSymbol: 'text.quote', icon: <IconLyrics size={18} color={ICON_COLOR.foreground} />, disabled: !hasLyrics, selected: view === 'lyrics', onPress: () => onChangeView('lyrics') },
  ]
  const opciones: MenuItem[] = [
    { label: 'Vista', subtitle: vistas.find(v => v.selected)?.label, sfSymbol: 'eye', items: vistas },
    { label: 'Duración', subtitle: choices.find(c => c.value === choice)?.label, sfSymbol: 'clock', items: choices.map(c => ({ label: c.label, selected: choice === c.value, onPress: () => onChangeChoice(c.value) })) },
    ...(hasLyrics ? [{ label: translating ? 'Traduciendo…' : 'Traducción', sfSymbol: 'globe' as const,
      icon: <IconLanguages size={18} color={ICON_COLOR.foreground} />,
      items: LYRIC_LANGS.map(l => ({ label: l.label, selected: l.value === lang, onPress: () => onChangeLang(l.value) })) }] : []),
    ...(onCambiarCancion ? [{ label: 'Cambiar canción', sfSymbol: 'music.note' as const, onPress: onCambiarCancion, separadorAntes: true }] : []),
  ]

  const compacto = TECLADO_FISICO

  return (
    <View className={compacto ? 'gap-1.5' : 'gap-2'}>
      {view !== 'wave' ? <View className="flex-row items-center gap-3">
        <Elapsed positionMs={positionMs} startMs={startMs} snippetMs={snippetMs} />
        <GestureDetector gesture={gesture}>
          <View
            className={`${compacto ? 'min-h-9 py-1.5' : 'min-h-11 py-2'} flex-1 justify-center`}
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => setHover(false)}
          >
            <View
              onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
              style={{ height: TRACK_H, borderRadius: TRACK_H }}
              className="w-full overflow-hidden bg-muted"
            >
              {/* NativeWind no procesa clases sobre componentes animados. */}
              <Animated.View
                style={[
                  {
                    height: TRACK_H,
                    width: '100%',
                    borderRadius: TRACK_H,
                    backgroundColor: '#FFFFFF',
                    // Sin esto la barra crecería desde el centro hacia los dos
                    // lados en vez de llenarse de izquierda a derecha.
                    transformOrigin: 'left',
                  },
                  fillStyle,
                ]}
              />
            </View>

            {/* Fuera de la pista: adentro la recortaría su `overflow: hidden`. */}
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  top: '50%',
                  marginTop: -THUMB / 2,
                  width: THUMB,
                  height: THUMB,
                  borderRadius: THUMB,
                  backgroundColor: '#FFFFFF',
                },
                thumbStyle,
              ]}
            />
          </View>
        </GestureDetector>
        <Text className="text-muted-foreground w-10 text-right text-caption1 tabular-nums">
          {fmt(startMs + snippetMs)}
        </Text>
      </View> : null}

      <View className={`flex-row items-center ${compacto ? 'gap-2' : 'gap-3'}`}>
        <PlayButton playing={playing} onPress={onToggle} disabled={ocupado} />
        <View pointerEvents={ocupado ? 'none' : 'auto'}>
          <Menu label="Opciones del fragmento" tooltip="Vista, duración y traducción"
            items={opciones} triggerSymbol="slider.horizontal.3"
            trigger={<View className={`${compacto ? 'min-h-9 rounded-[10px] px-2.5' : 'min-h-11 rounded-full px-3'} flex-row items-center gap-2 bg-muted`}>
              <IconWave size={17} color={ICON_COLOR.foreground} /><Text className="text-foreground text-footnote tabular-nums">{fmt(snippetMs)}</Text>
            </View>} />
        </View>
        <View className="min-w-0 flex-1 items-end">{accion}</View>
      </View>
    </View>
  )
}

/* El reloj se refresca aparte para no redibujar la onda ni los controles con cada cambio de tiempo. */
function Elapsed({
  positionMs,
  startMs,
  snippetMs,
}: {
  positionMs: SharedValue<number>
  startMs: number
  snippetMs: number
}) {
  const [ms, setMs] = useState(startMs)

  /* El reloj se detiene en segundo plano, igual que los bucles visuales de posición. */
  const alaVista = useAppActiva()
  useEffect(() => {
    if (!alaVista) return
    const id = setInterval(() => setMs(positionMs.value), CLOCK_MS)
    return () => clearInterval(id)
  }, [positionMs, alaVista])

  const shown = Math.max(startMs, Math.min(startMs + snippetMs, Number.isFinite(ms) ? ms : startMs))

  return <Text className="text-muted-foreground w-10 text-caption1 tabular-nums">{fmt(shown)}</Text>
}

function PlayButton({ playing, onPress, disabled }: { playing: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <IconButton label={playing ? 'Pausar' : 'Reproducir'} symbol={playing ? 'pause.fill' : 'play.fill'} onPress={onPress} disabled={disabled} lado={44} size={18} variant="primary" icon={playing ? (
        <IconPause size={18} color={ICON_COLOR.onPrimary} />
      ) : (
        <IconPlay size={18} color={ICON_COLOR.onPrimary} />
      )} />
  )
}

function fmt(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
