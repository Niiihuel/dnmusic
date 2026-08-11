import { useState } from 'react'
import { Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'

/** Alto de la zona sensible: la barra es fina, pero agarrarla no debe serlo. */
const HIT_H = 16
const TRACK_H = 4
const THUMB = 11

/** `m:ss`, como cualquier reproductor. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** `1 h 12 min` / `47 min`, como la duración total de una lista o un álbum. */
export function formatLength(ms: number): string {
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} min`
}

/**
 * Barra de posición con su tiempo a los costados.
 *
 * Se puede arrastrar además de tocar. Mientras se arrastra, la perilla sigue al
 * dedo y al audio se le pide **un solo** salto, al soltar: pedirlo por cuadro
 * encadena saltos que el audio no llega a completar, y eso suena a estática —
 * el mismo motivo por el que la barra del editor funciona así.
 *
 * El arrastre solo se activa pasados unos píxeles horizontales para que mover
 * el dedo en vertical siga desplazando lo que haya debajo y no mueva la canción.
 *
 * La usan el fragmento de una flor y la barra de abajo. Son la misma barra: la
 * escala cambia —una ventana de un tema, o el tema entero— pero eso ya viene
 * resuelto en la fracción que recibe.
 */
export function SeekBar({
  label,
  progress,
  elapsedMs,
  totalMs,
  onSeek,
  compact = false,
}: {
  label: string
  progress: number
  elapsedMs: number
  totalMs: number
  onSeek: (fraction: number) => void
  /** Sin los tiempos a los costados, para cuando el ancho no da. */
  compact?: boolean
}) {
  const [width, setWidth] = useState(0)
  const [dragAt, setDragAt] = useState<number | null>(null)

  const shown = dragAt ?? progress
  const commit = (fraction: number) => {
    setDragAt(null)
    onSeek(fraction)
  }
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
    .onStart((e) => runOnJS(setDragAt)(at(e.x)))
    .onUpdate((e) => runOnJS(setDragAt)(at(e.x)))
    .onEnd((e) => runOnJS(commit)(at(e.x)))
    // Si el gesto se cancela (por ejemplo, gana el scroll) la perilla vuelve a
    // donde está el audio en vez de quedarse colgada donde se soltó.
    .onFinalize(() => runOnJS(setDragAt)(null))

  const tap = Gesture.Tap().onEnd((e) => runOnJS(commit)(at(e.x)))

  return (
    <View className="flex-row items-center gap-2">
      {compact ? null : (
        <Text className="text-muted-foreground w-8 text-[10px] tabular-nums">
          {formatClock(dragAt !== null ? dragAt * totalMs : elapsedMs)}
        </Text>
      )}

      <GestureDetector gesture={Gesture.Race(pan, tap)}>
        <View
          accessibilityRole="adjustable"
          accessibilityLabel={`Posición de ${label}`}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(shown * 100) }}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          className="flex-1 justify-center"
          style={{ height: HIT_H }}
        >
          {/*
            Relleno y perilla se mueven con transform, no con `width`/`left`.
            Esos son layout y el navegador los pinta redondeando a píxeles
            enteros: en un fragmento largo el avance por cuadro es menor a un
            píxel y la barra se ve saltar cada varios cuadros en vez de fluir.
          */}
          <View className="overflow-hidden rounded-full bg-border" style={{ height: TRACK_H }}>
            <View
              className="h-full w-full rounded-full bg-foreground"
              style={{ transformOrigin: 'left', transform: [{ scaleX: shown }] }}
            />
          </View>
          <View
            pointerEvents="none"
            className="absolute left-0 rounded-full bg-foreground"
            style={{
              width: THUMB,
              height: THUMB,
              transform: [{ translateX: shown * width - THUMB / 2 }],
            }}
          />
        </View>
      </GestureDetector>

      {compact ? null : (
        <Text className="text-muted-foreground w-8 text-right text-[10px] tabular-nums">
          {formatClock(totalMs)}
        </Text>
      )}
    </View>
  )
}
