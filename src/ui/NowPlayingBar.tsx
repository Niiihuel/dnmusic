import { useState } from 'react'
import { useRouter } from 'expo-router'
import { Image, Pressable, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { artworkSource } from '../lib/artwork'
import { useTabsVisible } from '../state/shell'
import {
  canOpenPlaylist,
  openSoundingPlaylist,
  playNext,
  playPrevious,
  seekFraction,
  seekToMs,
  toggleShuffle,
  setVolume,
  stopPlayback,
  togglePlayback,
  toggleView,
  usePlaybackState,
} from '../state/playback'
import { crearJamActual, salirDelJam, useCuantosJam, useJamActivo } from '../state/jam'
import { Glass } from './Glass'
import { Menu, type MenuItem } from './Menu'
import { SeekBar, formatClock } from './SeekBar'
import { BotonAleatorio, BotonRepetir } from './Transport'
import {
  ICON_COLOR,
  IconClose,
  IconMusic,
  IconNext,
  IconPause,
  IconPlay,
  IconPrevious,
  IconRepeat,
  IconShuffle,
  IconDisc,
  IconLyrics,
  IconUsers,
  IconVolume,
  IconVolumeOff,
} from './icons'

/** Debajo de este ancho la barra se queda con lo esencial. */
const WIDE_PX = 720

/**
 * La barra de abajo: qué suena, y los controles.
 *
 * Es **solo la cara**. Quien toca el audio es `MotorAudio`, que se monta aparte
 * y una sola vez en `app/_layout.tsx`; acá no queda un solo hook del
 * reproductor.
 *
 * Esa separación no es orden por el orden: esta barra se dibuja en cuatro
 * formas según dónde estés, y el layout las tiene como cuatro ramas de un
 * ternario. Cambiar de rama la remonta —React no conserva un componente que
 * cambia de lugar en el árbol—, y mientras el reproductor viajaba adentro, cada
 * remonte lo liberaba y la canción arrancaba de cero. Ahora remontarse no
 * cuesta nada: lo único que se pierde es lo que se estaba dibujando.
 *
 * El estado vive en `state/playback`, que es de donde lee todo lo que muestra.
 */
export function NowPlayingBar({
  oculto = false,
  compacta = false,
}: {
  oculto?: boolean
  /** Dentro de la fila plegada: sin márgenes propios, ocupando lo que le den. */
  compacta?: boolean
}) {
  const {
    tracks,
    index,
    manual,
    wantPlay,
    positionMs,
    durationMs,
    volume,
    cargada,
    shuffle,
    view,
    error,
  } = usePlaybackState()
  const insets = useSafeAreaInsets()
  const conTabs = useTabsVisible()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const wide = width >= WIDE_PX
  const enJam = useJamActivo()
  const cuantosJam = useCuantosJam()

  // Lo encolado a mano manda sobre la lista mientras dure.
  const current = manual ?? (index >= 0 ? (tracks[index] ?? null) : null)
  const artwork = current ? artworkSource(current.artworkPath, current.artworkUrl, 96) : null
  /*
   * Suena de verdad: hay intención **y** hay audio cargado.
   *
   * Antes esto se sabía acá mismo, porque la barra tenía la URL firmada a mano.
   * Ahora la firma es cosa de `MotorAudio`, que avisa por `cargada`. Con
   * `wantPlay` solo, una firma que falla dejaría el botón mostrando «pausar»
   * sobre algo que nunca arrancó.
   */
  const playing = wantPlay && cargada

  /* Sin nada cargado no se dibuja, y oculto tampoco. Salir acá ya no tiene
     ninguna consecuencia sobre el audio: eso vive en `MotorAudio`, que sigue
     sonando mire lo que mire esta barra. */
  if (!current || oculto) return null

  const progress = durationMs > 0 ? Math.max(0, Math.min(1, positionMs / durationMs)) : 0
  const last = !manual && index >= tracks.length - 1

  /*
   * Reemplaza a la cruz que había acá.
   *
   * Una cruz solo puede cerrar, y sobre lo que suena hay varias cosas
   * razonables que querer: ver de dónde salió, saltearla, empezarla de nuevo.
   * Cerrar sigue estando, al final y separado del resto.
   */
  const menu: MenuItem[] = [
    /*
     * El Jam va primero: es la única entrada que cambia **quiénes** escuchan,
     * y con uno abierto dice cuántos son — que es lo que uno quiere saber sin
     * abrir nada.
     */
    {
      label: enJam
        ? `Jam · ${cuantosJam} ${cuantosJam === 1 ? 'persona' : 'personas'}`
        : 'Iniciar un Jam',
      onPress: () => {
        if (enJam) router.push('/jam')
        else
          void crearJamActual().then((ok) => {
            if (ok) router.push('/jam')
          })
      },
      icon: <IconUsers size={15} color={enJam ? ICON_COLOR.foreground : ICON_COLOR.muted} />,
      sfSymbol: 'person.2',
    },
    {
      label: 'Ver la lista',
      onPress: openSoundingPlaylist,
      disabled: !canOpenPlaylist(),
      icon: <IconMusic size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'music.note.list',
    },
    /*
     * El aleatorio, **solo en el teléfono**.
     *
     * En escritorio es un botón de verdad al lado del play —ver más abajo—, así
     * que acá sería el mismo control dos veces en la misma barra. En el teléfono
     * no hay dónde ponerlo: la tarjeta tiene lugar para la tapa, el título y
     * pausa/siguiente y nada más, y un cuarto ícono la vuelve una fila de
     * controles del ancho de la pantalla. Ahí el botón vive en la pantalla
     * completa de «Sonando», y esto queda como atajo para no tener que abrirla.
     */
    ...(wide
      ? []
      : [
          {
            label: shuffle ? 'Aleatorio: activado' : 'Aleatorio',
            onPress: toggleShuffle,
            icon: (
              <IconShuffle size={15} color={shuffle ? ICON_COLOR.foreground : ICON_COLOR.muted} />
            ),
            sfSymbol: 'shuffle' as const,
          },
        ]),
    {
      label: 'Volver a empezar',
      onPress: () => seekToMs(0),
      icon: <IconRepeat size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'arrow.counterclockwise',
    },
    {
      label: 'Siguiente canción',
      onPress: playNext,
      disabled: last,
      icon: <IconNext size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'forward.end',
    },
    /* En un Jam, «cerrar» es irse de él: cerrar solo el reproductor dejaría
       la membresía viva y la cola volvería sola con el próximo evento. */
    enJam
      ? {
          label: 'Salir del Jam',
          onPress: salirDelJam,
          destructive: true,
          icon: <IconClose size={15} color={ICON_COLOR.muted} />,
          sfSymbol: 'xmark',
        }
      : {
          label: 'Cerrar el reproductor',
          onPress: stopPlayback,
          destructive: true,
          icon: <IconClose size={15} color={ICON_COLOR.muted} />,
          sfSymbol: 'xmark',
        },
  ]

  /*
   * En el teléfono, el reproductor es una **tarjeta** y no una barra.
   *
   * Se decide por el ancho y no por si hay pestañas: en el composer o en el
   * editor de fragmento no hay barra de pestañas, y con la otra condición el
   * teléfono recibía ahí la barra de escritorio, apretada y con controles que
   * no entran.
   *
   * Flota justo encima de las pestañas, con lo mínimo: la tapa, qué suena y
   * pausa/siguiente. Es la forma de Apple Music y de Spotify, y la razón es de
   * espacio: en 390px una barra de borde a borde con posición, volumen y vistas
   * no entra sin encoger todo hasta lo intocable.
   *
   * Lo que no cabe acá —la barra de posición, la letra, el disco, la cola— es
   * lo que va en la pantalla completa de «Sonando», que se abre desde acá.
   */
  if (!wide) {
    /*
     * Plegada, los márgenes los pone la fila que la contiene: acá adentro
     * sumaría los suyos y la tarjeta quedaría más angosta que los redondeles de
     * los costados, desalineada con ellos.
     */
    return (
      <View
        className={compacta ? '' : `px-3 ${conTabs ? 'pb-2' : ''}`}
        style={compacta || conTabs ? undefined : { paddingBottom: 8 + insets.bottom }}
      >
        <Glass
          radius={compacta ? 26 : 18}
          style={{ boxShadow: '0 6px 20px rgba(0,0,0,0.45)' }}
        >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${current.title}, de ${current.artist}`}
          onPress={() => router.push('/playing')}
          className="flex-row items-center gap-3 px-2.5 py-2 active:opacity-90"
        >
          {artwork ? (
            <Image source={{ uri: artwork }} className="h-10 w-10 rounded-lg bg-muted" />
          ) : (
            <View className="h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <IconMusic size={16} color={ICON_COLOR.muted} />
            </View>
          )}

          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-foreground text-[13px] font-semibold" numberOfLines={1}>
              {current.title}
            </Text>
            <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
              {error ?? current.artist}
            </Text>
          </View>

          {/* «Anterior» solo cuando hay una cola de verdad detrás: puesta una
              canción suelta de la búsqueda no hay a dónde volver, y un botón
              que nunca hace nada es peor que no tenerlo. */}
          {tracks.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Anterior"
              onPress={playPrevious}
              className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
            >
              <IconPrevious size={19} color={ICON_COLOR.foreground} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pausar' : 'Reproducir'}
            onPress={togglePlayback}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
          >
            {playing ? (
              <IconPause size={19} color={ICON_COLOR.foreground} />
            ) : (
              <IconPlay size={19} color={ICON_COLOR.foreground} />
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Siguiente"
            onPress={playNext}
            disabled={last}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
          >
            <IconNext size={19} color={last ? ICON_COLOR.muted : ICON_COLOR.foreground} />
          </Pressable>

          {/*
           * La posición, como una línea fina al pie de la tarjeta.
           *
           * No se puede arrastrar a propósito: en una tarjeta de 56px de alto,
           * una barra agarrable competiría con el toque que abre la pantalla
           * completa, y ahí adentro está la barra de verdad. Acá es información,
           * no un control — por eso no lleva perilla.
           */}
          <View
            pointerEvents="none"
            className="absolute bottom-0 left-3 right-3 h-[2px] overflow-hidden rounded-full bg-muted"
          >
            <View
              className="h-full rounded-full bg-foreground"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </View>
        </Pressable>
        </Glass>
      </View>
    )
  }

  return (
    <View
      className="flex-row items-center gap-3 bg-canvas px-3 pt-2"
      style={{ paddingBottom: 8 + insets.bottom }}
    >
      {/* Lo que suena. En angosto se queda con esto y el botón de play. */}
      <View className="min-w-0 flex-1 flex-row items-center gap-3">
        {artwork ? (
          <Image source={{ uri: artwork }} className="h-12 w-12 rounded bg-card" />
        ) : (
          <View className="h-12 w-12 items-center justify-center rounded bg-card">
            <IconMusic size={18} color={ICON_COLOR.muted} />
          </View>
        )}
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-foreground text-[13px] font-semibold" numberOfLines={1}>
            {current.title}
          </Text>
          <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
            {error ?? current.artist}
          </Text>
        </View>
      </View>

      {/* Controles y posición, centrados como en cualquier reproductor. */}
      <View className={wide ? 'w-[38%] max-w-[560px] gap-1' : ''}>
        <View className="flex-row items-center justify-center gap-4">
          {/* Aleatorio y repetir rodean al play, como en cualquier reproductor.
              Ver `ui/Transport`, que es donde viven los dos. */}
          {wide ? <BotonAleatorio size={16} lado={36} /> : null}
          {wide ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Anterior"
              onPress={playPrevious}
              className="h-9 w-9 items-center justify-center rounded-full active:opacity-60"
            >
              <IconPrevious size={17} color={ICON_COLOR.muted} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pausar' : 'Reproducir'}
            onPress={togglePlayback}
            className="h-10 w-10 items-center justify-center rounded-full bg-primary active:opacity-80"
          >
            {playing ? (
              <IconPause size={16} color={ICON_COLOR.onPrimary} />
            ) : (
              <IconPlay size={16} color={ICON_COLOR.onPrimary} />
            )}
          </Pressable>
          {wide ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Siguiente"
              onPress={playNext}
              className="h-9 w-9 items-center justify-center rounded-full active:opacity-60"
            >
              <IconNext size={17} color={ICON_COLOR.muted} />
            </Pressable>
          ) : null}
          {wide ? <BotonRepetir size={16} lado={36} /> : null}
        </View>
        {wide ? (
          <SeekBar
            label={current.title}
            progress={progress}
            elapsedMs={positionMs}
            totalMs={durationMs}
            onSeek={seekFraction}
          />
        ) : null}
      </View>

      {/* Contrapeso del bloque de la izquierda, para que los controles queden
          centrados en la pantalla y no corridos por el largo del título. */}
      <View className="min-w-0 flex-1 flex-row items-center justify-end gap-1">
        {wide ? (
          <>
            <Toggle
              label="Ver el disco girando"
              active={view === 'disc'}
              onPress={() => toggleView('disc')}
              icon={IconDisc}
            />
            <Toggle
              label="Ver solo la letra"
              active={view === 'lyrics'}
              onPress={() => toggleView('lyrics')}
              icon={IconLyrics}
            />
            {/*
             * El Jam, a la vista y no solo adentro del menú: en escritorio hay
             * lugar, y una función que junta gente no puede vivir escondida
             * detrás de tres puntos. Encendido en blanco mientras hay uno
             * andando — el mismo lenguaje que las dos vistas de al lado.
             */}
            <Toggle
              label={enJam ? 'Ver el Jam' : 'Iniciar un Jam'}
              active={enJam}
              onPress={() => {
                if (enJam) router.push('/jam')
                else
                  void crearJamActual().then((ok) => {
                    if (ok) router.push('/jam')
                  })
              }}
              icon={IconUsers}
            />
            <Volume value={volume} onChange={setVolume} />
          </>
        ) : (
          <Text className="text-muted-foreground text-[11px] tabular-nums">
            {formatClock(positionMs)}
          </Text>
        )}
        <Menu items={menu} label={`Opciones de ${current.title}`} size={17} />
      </View>
    </View>
  )
}

/** Botón que enciende y apaga una vista del panel derecho. */
function Toggle({
  label,
  active,
  onPress,
  icon: Icon,
}: {
  label: string
  active: boolean
  onPress: () => void
  icon: (props: { size?: number; color?: string }) => React.ReactElement
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
    >
      {/* Encendido va en blanco, que es el acento del sistema; apagado en el
          gris de lo inactivo. Ver docs/DESIGN.md. */}
      <Icon size={16} color={active ? ICON_COLOR.foreground : ICON_COLOR.muted} />
    </Pressable>
  )
}

/**
 * La perilla de volumen.
 *
 * Reusa la misma barra que la posición: es el mismo gesto —arrastrar sobre una
 * línea— y tenerlas distintas sería inventar dos formas de hacer lo mismo. El
 * ícono corta el sonido y lo devuelve donde estaba, como en cualquier
 * reproductor.
 */
function Volume({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [before, setBefore] = useState(1)
  const muted = value === 0

  return (
    <View className="flex-row items-center gap-1.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Devolver el sonido' : 'Silenciar'}
        onPress={() => {
          if (muted) onChange(before || 1)
          else {
            setBefore(value)
            onChange(0)
          }
        }}
        className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
      >
        {muted ? (
          <IconVolumeOff size={16} color={ICON_COLOR.muted} />
        ) : (
          <IconVolume size={16} color={ICON_COLOR.muted} />
        )}
      </Pressable>
      <View style={{ width: 88 }}>
        <SeekBar
          label="volumen"
          progress={value}
          elapsedMs={0}
          totalMs={0}
          onSeek={onChange}
          compact
        />
      </View>
    </View>
  )
}
