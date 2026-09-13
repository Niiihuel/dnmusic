import { IconButton } from './IconButton'
/* eslint-disable react-hooks/immutability -- Los `useSharedValue` de Reanimated
   existen para mutarse desde los worklets de gesto: es su contrato, no una
   mutación de estado de React. La regla no lo conoce y marca cada `x.value =`
   dentro de un gesto; el mismo falso positivo vive en Waveform.tsx. */
import { Fragment, useCallback } from 'react'
import { Image, Pressable, Text, View } from 'react-native'
import { Gesture, GestureDetector, State } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { artworkSource } from '../lib/artwork'
import { ES_WEB } from './Glass'
import type { JamMiembro } from '../services/jam'
import {
  moverCancionDelJam,
  quitarCancionDelJam,
  useColaJam,
  useJam,
  useMiembrosJam,
  useMiIdJam,
  useSoyHostJam,
} from '../state/jam'
import { playAt, togglePlayback, usePlaybackIndex, useWantPlay } from '../state/playback'
import {
  ICON_COLOR,
  IconClose,
  IconManija,
  IconMusic,
  IconPause,
  IconPlay,
} from './icons'

/**
 * Alto FIJO de cada fila: es lo que vuelve el arrastre pura aritmética.
 * Con alturas variables habría que medir cada fila para saber sobre cuál
 * está flotando el dedo; con una constante, es dividir por ella.
 */
const FILA_H = 60
/** Lo que tarda una fila en correrse para hacer lugar. */
const CORRIDA_MS = 120

/**
 * La fila de reproducción del Jam: lo que suena y lo que viene, reordenable.
 *
 * Muestra la canción actual con su botón de pausa y, debajo, **solo lo que
 * falta** — como Spotify. Lo ya escuchado no se lista: volver atrás sigue
 * existiendo por los controles del reproductor, pero una fila compartida es
 * para negociar el futuro, no para releer el pasado.
 *
 * El reorden es de manija, no de fila: agarrar las tres líneas arrastra, tocar
 * la fila salta ahí. Separarlos evita el clásico «quise scrollear y moví una
 * canción». La fila agarrada flota apenas más grande; las demás se corren de a
 * una para mostrar dónde va a caer — la física la hacen tres valores
 * compartidos y la aritmética de `FILA_H`, sin medir nada.
 *
 * Quién puede qué: reordenar es editar la fila, el mismo permiso que agregar
 * (`permisos.agregan`, el host siempre); quitar mantiene su regla propia — lo
 * tuyo o, si sos host, lo de cualquiera.
 */
export function ColaJam({
  onArrastre,
}: {
  /** Para que la pantalla congele su scroll mientras hay una fila en el aire. */
  onArrastre?: (activo: boolean) => void
}) {
  const jam = useJam()
  const cola = useColaJam()
  const miembros = useMiembrosJam()
  const soyHost = useSoyHostJam()
  const miId = useMiIdJam()
  const indice = usePlaybackIndex()
  const suena = useWantPlay()

  /** Índice (dentro de «próximas») de la fila agarrada; -1 sin arrastre. */
  const activa = useSharedValue(-1)
  const y = useSharedValue(0)

  const actual = indice >= 0 ? (cola[indice] ?? null) : null
  // Sin actual (la cola terminó), todo lo que hay es «lo que viene».
  const desde = indice >= 0 ? indice + 1 : 0
  const proximas = cola.slice(desde)
  const puedoMover = soyHost || (jam?.permisos.agregan ?? false)

  const soltar = useCallback(
    (itemId: string, a: number) => {
      moverCancionDelJam(itemId, desde + a)
      activa.value = -1
      y.value = 0
      onArrastre?.(false)
    },
    [desde, activa, y, onArrastre],
  )
  const empezo = useCallback(() => onArrastre?.(true), [onArrastre])
  const cancelo = useCallback(() => onArrastre?.(false), [onArrastre])

  return (
    <View className="gap-1">
      {actual ? (
        <View className="flex-row items-center gap-3" style={{ height: FILA_H }}>
          <Caratula path={actual.artworkPath} url={actual.artworkUrl} />
          <View className="min-w-0 flex-1">
            <Text className="text-foreground text-subheadline font-semibold" numberOfLines={1}>
              {actual.title}
            </Text>
            <Text className="text-muted-foreground text-caption1" numberOfLines={1}>
              {actual.artist}
            </Text>
          </View>
          {/* Pausar acá pasa por el puente del Jam: si el permiso no alcanza,
              el aviso lo dice con palabras — el botón no adivina. */}
          <IconButton label={suena ? 'Pausar' : 'Reproducir'} symbol={suena ? 'pause.fill' : 'play.fill'} onPress={togglePlayback} variant="primary" icon={suena ? <IconPause size={18} color={ICON_COLOR.onPrimary} /> : <IconPlay size={18} color={ICON_COLOR.onPrimary} />} />
        </View>
      ) : null}

      {proximas.length === 0 ? (
        <View className="items-center gap-2 rounded-2xl bg-card px-6 py-7">
          <IconMusic size={18} color={ICON_COLOR.muted} />
          <Text className="text-muted-foreground text-center text-caption1">
            No viene nada después. Agregá desde el buscador o una lista.
          </Text>
        </View>
      ) : (
        proximas.map((item, i) => (
          <Fragment key={item.id}>
            {/* El corte entre lo pedido y lo sugerido, una sola vez: es lo que
                dice que lo tuyo va a sonar antes que la radio del Jam. */}
            {item.automatica && !proximas[i - 1]?.automatica ? (
              <Text className="pb-1 pt-3 text-muted-foreground text-footnote font-semibold uppercase">
                {i === 0 ? 'Después · sigue el Jam' : 'Después · sigue el Jam'}
              </Text>
            ) : null}
          <FilaProxima
            item={item}
            i={i}
            total={proximas.length}
            indiceReal={desde + i}
            miembros={miembros}
            puedoMover={puedoMover}
            puedoQuitar={soyHost || item.agregadoPor === miId}
            activa={activa}
            y={y}
            onEmpezar={empezo}
            onSoltar={soltar}
            onCancelar={cancelo}
          />
          </Fragment>
        ))
      )}
    </View>
  )
}

function Caratula({ path, url }: { path: string | null; url: string }) {
  const fuente = artworkSource(path, url, 96)
  if (!fuente) {
    return (
      <View className="h-11 w-11 items-center justify-center rounded-lg bg-card">
        <IconMusic size={16} color={ICON_COLOR.muted} />
      </View>
    )
  }
  return <Image source={{ uri: fuente }} className="h-11 w-11 rounded-lg bg-card" />
}

function FilaProxima({
  item,
  i,
  total,
  indiceReal,
  miembros,
  puedoMover,
  puedoQuitar,
  activa,
  y,
  onEmpezar,
  onSoltar,
  onCancelar,
}: {
  item: {
    id: string
    title: string
    artist: string
    artworkUrl: string
    artworkPath: string | null
    agregadoPor: string
    automatica: boolean
  }
  i: number
  total: number
  indiceReal: number
  miembros: JamMiembro[]
  puedoMover: boolean
  puedoQuitar: boolean
  activa: SharedValue<number>
  y: SharedValue<number>
  onEmpezar: () => void
  onSoltar: (itemId: string, a: number) => void
  onCancelar: () => void
}) {
  const dueno = miembros.find((m) => m.userId === item.agregadoPor)

  const soltarAca = useCallback(() => {
    const destino = Math.max(0, Math.min(total - 1, Math.round((i * FILA_H + y.value) / FILA_H)))
    onSoltar(item.id, destino)
  }, [i, total, item.id, y, onSoltar])

  /*
   * La manija activa tras un toque sostenido corto, no al primer píxel: la
   * fila vive dentro de un ScrollView y los dos quieren el gesto vertical.
   * Los 130ms se los ceden al scroll — pasado eso, el arrastre gana y la
   * pantalla congela el suyo (ver `onArrastre`).
   *
   * **Solo con dedo.** Con mouse no existe ese conflicto —la rueda scrollea,
   * el puntero no— y la espera rompía el gesto entero: mover el mouse antes
   * de los 130ms cancela el long press, y con un mouse uno arrastra en el
   * momento. En web el arrastre arranca al primer píxel, como en cualquier
   * lista de escritorio.
   */
  const arrastre = (ES_WEB ? Gesture.Pan() : Gesture.Pan().activateAfterLongPress(130))
    .onStart(() => {
      activa.value = i
      y.value = 0
      runOnJS(onEmpezar)()
    })
    .onUpdate((e) => {
      y.value = e.translationY
    })
    .onEnd(() => {
      runOnJS(soltarAca)()
    })
    .onFinalize((e) => {
      // Cancelado sin soltar (ganó el scroll, se cortó el toque): vuelve todo
      // a su lugar. El final feliz ya limpió en `onSoltar`.
      if (e.state !== State.END) {
        activa.value = -1
        y.value = 0
        runOnJS(onCancelar)()
      }
    })

  /*
   * Tres papeles posibles, mismas claves siempre (mezclar formas de estilo
   * dentro de un worklet confunde al diff de Reanimated): la fila agarrada
   * sigue al dedo por encima de las demás; con un arrastre ajeno en el aire,
   * cada fila se corre una posición para abrirle lugar donde caería; y sin
   * arrastre, todas vuelven a cero.
   */
  const estilo = useAnimatedStyle(() => {
    if (activa.value === i) {
      return { transform: [{ translateY: y.value }, { scale: 1.02 }], zIndex: 10 }
    }
    let corre = 0
    if (activa.value >= 0) {
      const destino = Math.round((activa.value * FILA_H + y.value) / FILA_H)
      if (i > activa.value && i <= destino) corre = -FILA_H
      if (i < activa.value && i >= destino) corre = FILA_H
    }
    return { transform: [{ translateY: withTiming(corre, { duration: CORRIDA_MS }) }, { scale: 1 }], zIndex: 0 }
  })

  return (
    <Animated.View style={[{ height: FILA_H }, estilo]}>
      <View className="h-full flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Saltar a ${item.title}`}
          onPress={() => playAt(indiceReal)}
          className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-70"
        >
          <Caratula path={item.artworkPath} url={item.artworkUrl} />
          <View className="min-w-0 flex-1">
            <Text className="text-foreground text-subheadline font-semibold" numberOfLines={1}>
              {item.title}
            </Text>
            <Text className="text-muted-foreground text-caption1" numberOfLines={1}>
              {item.artist}
              {item.automatica
                ? ' · sigue el Jam'
                : dueno
                  ? ` · la puso ${dueno.displayName?.trim() || dueno.username}`
                  : ''}
            </Text>
          </View>
        </Pressable>
        {puedoQuitar ? (
          <IconButton label={`Quitar ${item.title}`} symbol="xmark" onPress={() => quitarCancionDelJam(item.id)} icon={<IconClose size={14} color={ICON_COLOR.muted} />} />
        ) : null}
        {puedoMover ? (
          <GestureDetector gesture={arrastre}>
            <View
              accessibilityRole="adjustable"
              accessibilityLabel={`Mover ${item.title}`}
              className="h-10 w-10 items-center justify-center"
              /* El cursor anuncia el gesto en escritorio; `touchAction` evita
                 que el navegador se quede con el puntero a mitad de arrastre. */
              style={ES_WEB ? ({ cursor: 'grab', touchAction: 'none' } as object) : null}
            >
              <IconManija size={18} color={ICON_COLOR.muted} />
            </View>
          </GestureDetector>
        ) : null}
      </View>
    </Animated.View>
  )
}
