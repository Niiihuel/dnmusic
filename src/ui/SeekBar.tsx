import { useState } from 'react'
import { Text, View, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { HAY_VIDRIO } from './Glass'

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
  posicionMs,
}: {
  label: string
  progress: number
  elapsedMs: number
  totalMs: number
  onSeek: (fraction: number) => void
  /** Sin los tiempos a los costados, para cuando el ancho no da. */
  compact?: boolean
  /**
   * La posición cuadro a cuadro, si quien llama la tiene.
   *
   * Con esto el relleno y la perilla se mueven en el hilo de UI, a la
   * frecuencia de la pantalla. Sin esto se mueven con `progress`, que llega por
   * props: el store avisa diez veces por segundo —lo que sobra para un reloj de
   * segundos y no para una barra— y el avance se veía a escalones.
   *
   * El reloj sigue leyendo `elapsedMs`: son segundos, y refrescarlo por cuadro
   * sería renderizar sesenta veces para cambiar un dígito una vez.
   */
  posicionMs?: SharedValue<number>
}) {
  const [width, setWidth] = useState(0)
  const [dragAt, setDragAt] = useState<number | null>(null)

  const shown = dragAt ?? progress
  const commit = (fraction: number) => {
    setDragAt(null)
    onSeek(fraction)
  }

  /*
   * Cuánto está lleno, entre 0 y 1.
   *
   * Mientras se arrastra manda el dedo, y ahí `dragAt` —estado de React, que ya
   * cambia con cada evento del gesto— alcanza de sobra. El resto del tiempo,
   * si quien llama pasó la posición fina, se lee del hilo de UI.
   */
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
          {/* Con vidrio la pista es material, no un gris pintado: blanco
              translúcido que deja adivinar lo que pasa por detrás, con un
              canal apenas hundido. Es la pista del slider de iOS 26. El gris
              sólido queda de respaldo donde no hay vidrio. */}
          <View
            className={`overflow-hidden rounded-full ${HAY_VIDRIO ? '' : 'bg-border'}`}
            style={[
              { height: TRACK_H },
              HAY_VIDRIO
                ? ({
                    backgroundColor: 'rgba(255,255,255,0.16)',
                    /* El anillo del referente, a escala de una pista de 4px:
                       el filo frío de 1px más el canal apenas hundido. */
                    boxShadow:
                      'inset 0 0 0 1px rgba(94,100,112,0.45), inset 0 0.5px 1px rgba(0,0,0,0.35)',
                  } as ViewStyle)
                : null,
            ]}
          >
            {/* Todo por `style`: NativeWind no procesa clases en componentes
                animados (la trampa de docs/DESIGN.md). Con `className`, en la
                web el relleno quedaba invisible y la perilla era un cuadrado
                metido EN EL FLUJO — que encima corría de lugar los íconos que
                venían después en la fila. Blanco literal: token foreground. */}
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
                /* La perilla se despega de la pista con sombra, como la del
                   sistema — sobre una pista translúcida un círculo plano se
                   fundía con el relleno. */
                boxShadow: '0 1px 4px rgba(0,0,0,0.45)',
              },
              perilla,
            ]}
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
