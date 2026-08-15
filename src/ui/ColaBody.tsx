/* eslint-disable react-hooks/immutability -- Los `useSharedValue` de Reanimated
   se mutan desde los worklets de gesto: es su contrato, no estado de React.
   Mismo falso positivo que en ColaJam y Waveform. */
import { useCallback, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Gesture, GestureDetector, State } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { artworkSource } from '../lib/artwork'
import type { PlaylistTrack } from '../services/playlists'
import { useColaJam, useJamActivo, useMiembrosJam } from '../state/jam'
import { moverEncolada, playAt, quitarEncolada, usePlaybackState } from '../state/playback'
import { ES_WEB } from './Glass'
import { TrackRow } from './TrackRow'
import { Vacio } from './Vacio'
import { formatClock } from './SeekBar'
import { ICON_COLOR, IconClose, IconCola, IconManija } from './icons'

/** Alto fijo de una fila encolada: vuelve el arrastre pura aritmética (ver ColaJam). */
const FILA_H = 60
/** Lo que tarda una fila en correrse para hacer lugar. */
const CORRIDA_MS = 120

/**
 * La cola — «¿qué viene después?» — con la anatomía de una lista.
 *
 * Es un cuerpo sin cáscara a propósito, porque vive en dos lugares: en el
 * teléfono es la pantalla `/cola` (un sheet), y en escritorio es **una cara
 * del panel derecho**, al lado de la lista — como el Jam, y como lo hace
 * Spotify. Antes en la compu abría la pantalla entera y se veía como una
 * página rota: un drawer es un gesto de teléfono, no de escritorio.
 *
 * Muestra todo junto y en el orden real en que va a sonar: lo que suena, lo
 * encolado a mano (que va primero, porque alguien lo pidió expresamente) y lo
 * que sigue de la lista **respetando el aleatorio**. En un Jam es la cola
 * compartida y cada fila dice quién la puso.
 */
export function ColaBody({
  piso = 40,
  conTitulo = true,
}: {
  /** Aire al fondo del scroll; el panel pasa lo que tapa el reproductor. */
  piso?: number
  /** El título grande de la pantalla; el panel ya tiene el suyo y lo apaga. */
  conTitulo?: boolean
}) {
  const { tracks, index, manual, upNext, shuffle, wantPlay } = usePlaybackState()
  const enJam = useJamActivo()
  const colaJam = useColaJam()
  const miembros = useMiembrosJam()
  /* El arrastre de una encolada, con la física de ColaJam: la agarrada sigue
     al puntero, las demás se corren para mostrar dónde cae. */
  const activa = useSharedValue(-1)
  const desplazamiento = useSharedValue(0)
  const [arrastrando, setArrastrando] = useState(false)

  const actual = manual ?? (index >= 0 ? (tracks[index] ?? null) : null)

  /*
   * Lo que viene de la lista, en el orden en que va a sonar de verdad.
   *
   * Con el aleatorio puesto, «lo que sigue» no es la fila de abajo: es el
   * orden barajado. Mostrar otra cosa sería una cola decorativa. Se guarda el
   * índice real junto a cada canción porque saltar necesita el índice de
   * `tracks`, no la posición en esta pantalla.
   */
  const porVenir: { track: PlaylistTrack; indice: number }[] = (() => {
    if (!shuffle) {
      return tracks.slice(index + 1).map((track, i) => ({ track, indice: index + 1 + i }))
    }
    const validos = shuffle.filter((i) => i >= 0 && i < tracks.length)
    const donde = validos.indexOf(index)
    return validos.slice(donde + 1).flatMap((i) => {
      const track = tracks[i]
      return track ? [{ track, indice: i }] : []
    })
  })()

  /** En un Jam, quién puso cada canción; fuera de él, nada que decir. */
  function quienLaPuso(trackId: string): string | null {
    if (!enJam) return null
    const item = colaJam.find((i) => i.id === trackId)
    if (!item) return null
    const dueno = miembros.find((m) => m.userId === item.agregadoPor)
    return dueno ? (dueno.displayName?.trim() || dueno.username) : null
  }

  function artistaDe(track: PlaylistTrack): string {
    const puso = quienLaPuso(track.id)
    return puso ? `${track.artist} · la puso ${puso}` : track.artist
  }

  /*
   * La cola manual son dos cosas distintas y se muestran como tales: **lo que
   * encolaste** vos y **las recomendadas** que trajo el autoplay (id
   * `radio:`). Antes iban juntas bajo «lo que encolaste», y la pantalla te
   * atribuía canciones que puso la máquina. Los índices se conservan
   * absolutos: quitar y reordenar hablan con la cola real.
   */
  const tuyas = upNext
    .map((track, i) => ({ track, i }))
    .filter(({ track }) => !track.id.startsWith('radio:'))
  const recomendadas = upNext
    .map((track, i) => ({ track, i }))
    .filter(({ track }) => track.id.startsWith('radio:'))

  const cuantas = (actual ? 1 : 0) + upNext.length + porVenir.length
  const totalMs =
    (actual?.durationMs ?? 0) +
    upNext.reduce((suma, t) => suma + t.durationMs, 0) +
    porVenir.reduce((suma, p) => suma + p.track.durationMs, 0)

  if (cuantas === 0) {
    /* El vacío se dice con palabras y con el camino para llenarlo. */
    return (
      <View className="flex-1 justify-center" style={{ paddingBottom: piso }}>
        <Vacio
          icono={<IconCola size={22} color={ICON_COLOR.muted} />}
          titulo="No hay nada en cola"
          detalle="Poné una lista a sonar, o sumá canciones con «Agregar a la cola» desde cualquier lista o búsqueda."
        />
      </View>
    )
  }

  return (
    <ScrollView
      className="min-h-0 flex-1"
      /* Una fila en el aire congela el scroll: dos gestos verticales sobre el
         mismo puntero es uno de más. */
      scrollEnabled={!arrastrando}
      contentContainerClassName="pt-5"
      contentContainerStyle={{ paddingBottom: piso }}
    >
      {conTitulo ? (
        /* La cabecera de lista: rótulo, título grande y el resumen. */
        <View className="gap-1 px-5 pb-4 pt-2">
          <Text className="text-foreground text-2xl font-bold">Lo que viene</Text>
          <Text className="text-muted-foreground text-[13px]">
            {cuantas} {cuantas === 1 ? 'canción' : 'canciones'} · {formatClock(totalMs)}
          </Text>
        </View>
      ) : null}

      {actual ? (
        <>
          <Encabezado texto="Sonando" />
          <TrackRow
            index={1}
            title={actual.title}
            artist={artistaDe(actual)}
            artwork={artworkSource(actual.artworkPath, actual.artworkUrl, 96)}
            durationMs={actual.durationMs}
            sounding
            playing={wantPlay}
            onPlay={() => {
              if (!manual && index >= 0) playAt(index)
            }}
          />
        </>
      ) : null}

      {tuyas.length > 0 ? (
        <>
          <Encabezado texto="A continuación · lo que encolaste" />
          {tuyas.map(({ track, i }, orden) => (
            <EncoladaArrastrable
              key={`encolada-${i}-${track.id}`}
              i={i}
              total={tuyas.length}
              activa={activa}
              desplazamiento={desplazamiento}
              onArrastre={setArrastrando}
            >
              <TrackRow
                index={orden + 1}
                title={track.title}
                artist={artistaDe(track)}
                artwork={artworkSource(track.artworkPath, track.artworkUrl, 96)}
                durationMs={track.durationMs}
                sounding={false}
                playing={false}
                /* Lo encolado no se salta con un toque: suena cuando le toque.
                   Saltearlo sería adelantar la cola entera de todos modos. */
                onPlay={() => {}}
                trailing={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar ${track.title} de la cola`}
                    onPress={() => quitarEncolada(i)}
                    className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
                  >
                    <IconClose size={15} color={ICON_COLOR.muted} />
                  </Pressable>
                }
              />
            </EncoladaArrastrable>
          ))}
        </>
      ) : null}

      {recomendadas.length > 0 ? (
        <>
          {/* Sin manija de arrastrar: el orden de la radio lo trae el motor y
              se respeta tal cual — reordenar recomendaciones es curarlas, y
              para eso está quitarlas. La cruz sigue estando. */}
          <Encabezado texto="Recomendadas para vos · según lo que escuchás" />
          {recomendadas.map(({ track, i }, orden) => (
            <TrackRow
              key={`radio-${i}-${track.id}`}
              index={orden + 1}
              title={track.title}
              artist={artistaDe(track)}
              artwork={artworkSource(track.artworkPath, track.artworkUrl, 96)}
              durationMs={track.durationMs}
              sounding={false}
              playing={false}
              onPlay={() => {}}
              trailing={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar ${track.title} de la cola`}
                  onPress={() => quitarEncolada(i)}
                  className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
                >
                  <IconClose size={15} color={ICON_COLOR.muted} />
                </Pressable>
              }
            />
          ))}
        </>
      ) : null}

      {porVenir.length > 0 ? (
        <>
          <Encabezado texto={upNext.length > 0 ? 'Después · sigue la lista' : 'A continuación'} />
          {porVenir.map(({ track, indice }, i) => (
            <TrackRow
              key={`viene-${track.id}-${indice}`}
              index={i + 1}
              title={track.title}
              artist={artistaDe(track)}
              artwork={artworkSource(track.artworkPath, track.artworkUrl, 96)}
              durationMs={track.durationMs}
              sounding={false}
              playing={false}
              /* En un Jam esto es un intent de saltar ahí para todos; el
                 puente de playback ya sabe pedir permiso. */
              onPlay={() => playAt(indice)}
            />
          ))}
        </>
      ) : actual ? (
        <Vacio
          compacto
          icono={<IconCola size={20} color={ICON_COLOR.muted} />}
          titulo="No hay nada después"
          detalle="Sumá canciones con «Agregar a la cola» y van a aparecer acá."
        />
      ) : null}
    </ScrollView>
  )
}

/** Separador de sección, en el idioma de las etiquetas de la app. */
function Encabezado({ texto }: { texto: string }) {
  return (
    <Text className="text-muted-foreground px-5 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-[1.2px]">
      {texto}
    </Text>
  )
}

/**
 * Una fila encolada que se reordena arrastrando su manija.
 *
 * Es la física de `ColaJam`, palabra por palabra: la fila agarrada sigue al
 * puntero apenas agrandada, las demás se corren una posición para mostrar
 * dónde va a caer, y todo es aritmética sobre el alto fijo `FILA_H`. En web
 * el gesto arranca al primer píxel (con mouse no hay scroll que ceder); con
 * dedo espera los 130ms de siempre para no pelearse con el ScrollView.
 */
function EncoladaArrastrable({
  i,
  total,
  activa,
  desplazamiento,
  onArrastre,
  children,
}: {
  i: number
  total: number
  activa: SharedValue<number>
  desplazamiento: SharedValue<number>
  onArrastre: (activo: boolean) => void
  children: React.ReactNode
}) {
  const soltarAca = useCallback(() => {
    const destino = Math.max(
      0,
      Math.min(total - 1, Math.round((i * FILA_H + desplazamiento.value) / FILA_H)),
    )
    moverEncolada(i, destino)
    activa.value = -1
    desplazamiento.value = 0
    onArrastre(false)
  }, [i, total, activa, desplazamiento, onArrastre])
  const empezar = useCallback(() => onArrastre(true), [onArrastre])
  const cancelar = useCallback(() => onArrastre(false), [onArrastre])

  const arrastre = (ES_WEB ? Gesture.Pan() : Gesture.Pan().activateAfterLongPress(130))
    .onStart(() => {
      activa.value = i
      desplazamiento.value = 0
      runOnJS(empezar)()
    })
    .onUpdate((e) => {
      desplazamiento.value = e.translationY
    })
    .onEnd(() => {
      runOnJS(soltarAca)()
    })
    .onFinalize((e) => {
      if (e.state !== State.END) {
        activa.value = -1
        desplazamiento.value = 0
        runOnJS(cancelar)()
      }
    })

  const estilo = useAnimatedStyle(() => {
    if (activa.value === i) {
      return { transform: [{ translateY: desplazamiento.value }, { scale: 1.02 }], zIndex: 10 }
    }
    let corre = 0
    if (activa.value >= 0) {
      const destino = Math.round((activa.value * FILA_H + desplazamiento.value) / FILA_H)
      if (i > activa.value && i <= destino) corre = -FILA_H
      if (i < activa.value && i >= destino) corre = FILA_H
    }
    return {
      transform: [{ translateY: withTiming(corre, { duration: CORRIDA_MS }) }, { scale: 1 }],
      zIndex: 0,
    }
  })

  return (
    <Animated.View style={[{ height: FILA_H }, estilo]}>
      <View className="h-full flex-row items-center pr-3">
        <View className="min-w-0 flex-1">{children}</View>
        <GestureDetector gesture={arrastre}>
          <View
            accessibilityRole="adjustable"
            accessibilityLabel="Mover en la cola"
            className="h-10 w-10 items-center justify-center"
            style={ES_WEB ? ({ cursor: 'grab', touchAction: 'none' } as object) : null}
          >
            <IconManija size={18} color={ICON_COLOR.muted} />
          </View>
        </GestureDetector>
      </View>
    </Animated.View>
  )
}
