import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'
import { Popover, type PopoverOption } from './Popover'
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

/**
 * Las vistas del editor.
 *
 * `wave` es la herramienta de recorte; `disc` y `lyrics` son presentaciones —
 * cómo se va a ver el mensaje del otro lado.
 */
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
}

const TRACK_H = 4
/** Perilla de la barra; aparece al pasar el cursor, como en Spotify. */
const THUMB = 12
/** Cada cuánto se refresca el tiempo transcurrido. */
const CLOCK_MS = 200
/** Debajo de este ancho el segmentado va sin texto y el play deja de centrarse. */
const COMPACT_PX = 520

/**
 * Barra de controles al pie, al modelo de Spotify.
 *
 * Todo lo que se toca mientras suena la canción vive acá abajo: el progreso del
 * recorte, el play, el largo del recorte y el cambio entre onda y letra. Antes
 * estaba en una fila en medio del contenido, y al pasar a la vista de letra —que
 * ocupa la pantalla entera— no había dónde ponerla.
 *
 * El play va centrado en términos absolutos y no por `justify-between`: con
 * flex, el botón se corría de lugar cuando el texto del recorte cambiaba de
 * "15 segundos" a "Canción completa".
 */
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
}: Props) {
  const [trackW, setTrackW] = useState(0)
  const [hover, setHover] = useState(false)
  const compact = useWindowDimensions().width < COMPACT_PX

  /** Arrastre de la barra: si está en curso, y a qué milisegundo apunta. */
  const dragging = useSharedValue(false)
  const dragMs = useSharedValue(0)

  const commit = (ms: number) => onSeek(ms)
  /** Milisegundo bajo un punto x de la barra. */
  const timeAt = (x: number) => {
    'worklet'
    if (!trackW) return startMs
    return startMs + Math.max(0, Math.min(1, x / trackW)) * snippetMs
  }

  /*
   * Igual que en la onda: mientras se arrastra, la barra se mueve sola en el
   * hilo de UI y al audio se le pide **un solo** salto, al soltar. Pedirlo por
   * cuadro encadena saltos que el audio no llega a completar, y eso suena a
   * estática.
   */
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

  /*
   * Cuánto de la barra va lleno, en el hilo de UI.
   *
   * Los shared values se leen **dentro de cada `useAnimatedStyle`**, no a
   * través de una función auxiliar. Reanimated arma la lista de dependencias
   * mirando el closure del propio worklet del estilo: si las lecturas viven en
   * el closure de otra función, no las ve, no se suscribe a nada y el estilo
   * solo se recalcula cuando React vuelve a renderizar.
   *
   * Eso es exactamente lo que pasaba: la barra se movía únicamente con el
   * re-render del reloj (cada 200 ms) o al pasar el cursor por encima. Medido:
   * 240 cuadros sin tocar el mouse daban un único valor y cero cambios.
   */

  /*
   * El relleno se escala, no se le cambia el ancho.
   *
   * `width` es layout y el navegador lo pinta en píxeles enteros. Con la
   * canción completa (3:19) sobre una barra de ~1000 px el relleno crece 0.084
   * px por cuadro, así que el borde se quedaba quieto ~12 cuadros y después
   * pegaba un salto de 1 px: se veía avanzar a tirones cada 200 ms.
   *
   * `scaleX` lo resuelve el compositor con precisión subpíxel, y de paso deja
   * de disparar layout en cada cuadro.
   */
  const fillStyle = useAnimatedStyle(() => {
    const at = dragging.value ? dragMs.value : positionMs.value
    const r = snippetMs > 0 ? (at - startMs) / snippetMs : 0
    return { transform: [{ scaleX: Math.max(0, Math.min(1, r)) }] }
  })

  /** Perilla al modo de Spotify: aparece al pasar el cursor o al arrastrar. */
  const thumbStyle = useAnimatedStyle(() => {
    const at = dragging.value ? dragMs.value : positionMs.value
    const r = snippetMs > 0 ? (at - startMs) / snippetMs : 0
    return {
      transform: [{ translateX: Math.max(0, Math.min(1, r)) * trackW - THUMB / 2 }],
      opacity: hover || dragging.value ? 1 : 0,
    }
  })

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <Elapsed positionMs={positionMs} startMs={startMs} snippetMs={snippetMs} />
        <GestureDetector gesture={gesture}>
          <View
            className="flex-1 justify-center py-2"
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => setHover(false)}
          >
            <View
              onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
              style={{ height: TRACK_H, borderRadius: TRACK_H }}
              className="w-full overflow-hidden bg-muted"
            >
              {/* El color va inline y no por className: NativeWind no procesa
                  clases sobre componentes animados, y el relleno se dibujaba
                  sin fondo — la barra parecía no avanzar nunca. */}
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
        <Text className="text-muted-foreground w-10 text-right text-[11px] tabular-nums">
          {fmt(startMs + snippetMs)}
        </Text>
      </View>

      <View className="h-12 flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2">
          <ViewToggle view={view} onChange={onChangeView} enabled={hasLyrics} compact={compact} />
          {hasLyrics && (
            <LangPicker
              lang={lang}
              onChange={onChangeLang}
              translating={translating}
              compact={compact}
            />
          )}
        </View>

        {/* En ancho, el play se centra en términos absolutos y no con flex: así
            no se corre de lugar cuando el recorte pasa de "15 segundos" a
            "Canción completa". En angosto no hay lugar para eso y los tres
            controles se reparten la fila. */}
        {compact ? (
          <PlayButton playing={playing} onPress={onToggle} />
        ) : (
          <View pointerEvents="box-none" className="absolute inset-x-0 items-center">
            <PlayButton playing={playing} onPress={onToggle} />
          </View>
        )}

        <Popover
          value={choice}
          options={choices}
          onChange={onChangeChoice}
          label={compact ? undefined : 'Recorte'}
        />
      </View>
    </View>
  )
}

/**
 * Tiempo transcurrido.
 *
 * Antes acá iba el inicio del recorte, que es un número fijo: la barra avanzaba
 * y el reloj se quedaba clavado en 0:00.
 *
 * Es su propio componente porque el texto sí necesita pasar por React, y así el
 * que se vuelve a dibujar cinco veces por segundo es este `Text` y nada más — ni
 * la barra, ni el selector de recorte, ni las mil barras de la onda. La posición
 * se lee del shared value; no hay estado que sincronizar.
 */
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

  useEffect(() => {
    const id = setInterval(() => setMs(positionMs.value), CLOCK_MS)
    return () => clearInterval(id)
  }, [positionMs])

  const shown = Math.max(startMs, Math.min(startMs + snippetMs, Number.isFinite(ms) ? ms : startMs))

  return <Text className="text-muted-foreground w-10 text-[11px] tabular-nums">{fmt(shown)}</Text>
}

/**
 * Selector de idioma de la letra, al lado del botón de letra.
 *
 * En reposo dice "Traducir"; con una traducción puesta se achica al código del
 * idioma (ES, EN…) para no empujar al resto de la fila. Mientras traduce, el
 * ícono se reemplaza por el spinner: el pedido tarda lo suyo y sin señal parece
 * que el botón no hizo nada.
 */
function LangPicker({
  lang,
  onChange,
  translating,
  compact,
}: {
  lang: LyricLang
  onChange: (lang: LyricLang) => void
  translating: boolean
  compact: boolean
}) {
  const short = LYRIC_LANGS.find((l) => l.value === lang)?.short ?? ''
  const display = short || (compact ? '' : 'Traducir')

  return (
    <Popover
      value={lang}
      options={LYRIC_LANGS.map((l) => ({ value: l.value, label: l.label }))}
      onChange={onChange}
      display={display}
      accessibilityLabel="Traducir la letra"
      icon={
        translating ? (
          <ActivityIndicator size="small" color={ICON_COLOR.muted} />
        ) : (
          <IconLanguages size={14} color={lang === 'off' ? ICON_COLOR.muted : ICON_COLOR.foreground} />
        )
      }
    />
  )
}

function PlayButton({ playing, onPress }: { playing: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pausar' : 'Reproducir'}
      onPress={onPress}
      className="h-12 w-12 items-center justify-center rounded-full bg-primary active:opacity-80"
    >
      {playing ? (
        <IconPause size={18} color={ICON_COLOR.onPrimary} />
      ) : (
        <IconPlay size={18} color={ICON_COLOR.onPrimary} />
      )}
    </Pressable>
  )
}

/** Segmentado de dos posiciones: onda o letra. */
function ViewToggle({
  view,
  onChange,
  enabled,
  compact,
}: {
  view: SnippetView
  onChange: (view: SnippetView) => void
  enabled: boolean
  compact: boolean
}) {
  const segment = (value: SnippetView, label: string, Icon: typeof IconWave) => {
    const active = view === value
    // Sin letra sincronizada la pestaña de letra no lleva a ningún lado; las
    // otras dos siempre andan.
    const on = enabled || value !== 'lyrics'
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active, disabled: !on }}
        accessibilityLabel={label}
        disabled={!on}
        onPress={() => onChange(value)}
        className={`flex-row items-center gap-1.5 rounded-full py-2 ${
          compact ? 'px-3.5' : 'px-3'
        } ${active ? 'bg-primary' : ''} ${on ? 'active:opacity-70' : 'opacity-40'}`}
      >
        <Icon size={14} color={active ? ICON_COLOR.onPrimary : ICON_COLOR.muted} />
        {!compact && (
          <Text
            className={`text-[12px] font-medium ${
              active ? 'text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            {label}
          </Text>
        )}
      </Pressable>
    )
  }

  return (
    <View className="flex-row items-center rounded-full bg-muted p-1">
      {segment('wave', 'Onda', IconWave)}
      {segment('disc', 'Disco', IconDisc)}
      {segment('lyrics', 'Letra', IconLyrics)}
    </View>
  )
}

function fmt(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
