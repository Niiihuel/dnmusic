import { formatClock } from './tiempos'
import { useState } from 'react'
import { Platform, Text, View, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { HAY_VIDRIO } from './Glass'

const HIT_H = 16
const TRACK_H = 4
const THUMB = 11

export { formatClock, formatLength } from './tiempos'

/* El seek se confirma al soltar para no encadenar saltos de audio. envivo emite durante el gesto para ajustar volumen. */
export function SeekBar({
  label,
  progress,
  elapsedMs,
  totalMs,
  onSeek,
  compact = false,
  envivo = false,
  posicionMs,
}: {
  label: string
  progress: number
  elapsedMs: number
  totalMs: number
  onSeek: (fraction: number) => void
  compact?: boolean
  /* Emite durante el arrastre en controles de volumen; la posición confirma al soltar. */
  envivo?: boolean
  /* El shared value actualiza relleno y perilla en UI; el reloj sigue el estado de menor frecuencia. */
  posicionMs?: SharedValue<number>
}) {
  const [width, setWidth] = useState(0)
  const [dragAt, setDragAt] = useState<number | null>(null)

  const shown = dragAt ?? progress
  const commit = (fraction: number) => {
    setDragAt(null)
    onSeek(fraction)
  }

  const arrastrar = (fraction: number) => {
    setDragAt(fraction)
    if (envivo) onSeek(fraction)
  }

  /* Durante el gesto manda la posición local; el resto del tiempo puede seguir la posición fina de UI. */
  const avance = () => {
    'worklet'
    if (dragAt !== null) return dragAt
    if (!posicionMs || totalMs <= 0) return progress
    return Math.max(0, Math.min(1, posicionMs.value / totalMs))
  }

  const relleno = useAnimatedStyle(() => ({ transform: [{ scaleX: avance() }] }))
  const perilla = useAnimatedStyle(() => ({
    transform: [{ translateX: avance() * width - THUMB / 2 }],
  }))
  // Marcada como worklet: los callbacks de gesto corren en el hilo de UI y
  // desde ahí no se puede llamar una función común.
  const at = (x: number) => {
    'worklet'
    return width > 0 ? Math.max(0, Math.min(1, x / width)) : 0
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-4, 4])
    // `onStart` y no `onBegin`: begin dispara al apoyar el dedo, incluso cuando
    // el movimiento va a terminar siendo un scroll vertical, y la perilla
    // pegaba un salto para volver enseguida.
    .onStart((e) => runOnJS(arrastrar)(at(e.x)))
    .onUpdate((e) => runOnJS(arrastrar)(at(e.x)))
    .onEnd((e) => runOnJS(commit)(at(e.x)))
    // Si el gesto se cancela (por ejemplo, gana el scroll) la perilla vuelve a
    // donde está el audio en vez de quedarse colgada donde se soltó.
    .onFinalize(() => runOnJS(setDragAt)(null))

  const tap = Gesture.Tap().onEnd((e) => runOnJS(commit)(at(e.x)))

  return (
    <View className="flex-row items-center gap-2">
      {compact ? null : (
        <Text className="text-muted-foreground w-8 text-caption2 tabular-nums">
          {formatClock(dragAt !== null ? dragAt * totalMs : elapsedMs)}
        </Text>
      )}

      <GestureDetector gesture={Gesture.Race(pan, tap)}>
        <View
          {...(Platform.OS === 'web' ? {
            tabIndex: 0, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(shown * 100),
            onKeyDown: (e: { key: string; preventDefault: () => void }) => {
              const next = e.key === 'Home' ? 0 : e.key === 'End' ? 1
                : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? shown + 0.05
                : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? shown - 0.05 : null
              if (next === null) return
              e.preventDefault(); commit(Math.max(0, Math.min(1, next)))
            },
          } as object : {})}
          accessibilityRole="adjustable"
          accessibilityLabel={`Posición de ${label}`}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(shown * 100) }}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          className="flex-1 justify-center"
          style={{ height: HIT_H }}
        >
          {/* Los transforms conservan precisión subpíxel sin modificar el layout. */}
          <View
            className={`overflow-hidden rounded-full ${HAY_VIDRIO ? '' : 'bg-border'}`}
            style={[
              { height: TRACK_H },
              HAY_VIDRIO
                ? ({
                    backgroundColor: 'rgba(255,255,255,0.16)',
                    boxShadow:
                      'inset 0 0 0 1px rgba(94,100,112,0.45), inset 0 0.5px 1px rgba(0,0,0,0.35)',
                  } as ViewStyle)
                : null,
            ]}
          >
            {/* NativeWind no procesa clases sobre componentes animados. */}
            <Animated.View
              style={[
                {
                  height: '100%',
                  width: '100%',
                  borderRadius: 999,
                  backgroundColor: '#FFFFFF',
                  transformOrigin: 'left',
                },
                relleno,
              ]}
            />
          </View>
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                width: THUMB,
                height: THUMB,
                borderRadius: THUMB / 2,
                backgroundColor: '#FFFFFF',
                boxShadow: '0 1px 4px rgba(0,0,0,0.45)',
              },
              perilla,
            ]}
          />
        </View>
      </GestureDetector>

      {compact ? null : (
        <Text className="text-muted-foreground w-8 text-right text-caption2 tabular-nums">
          {formatClock(totalMs)}
        </Text>
      )}
    </View>
  )
}
