import { useRouter } from 'expo-router'
import { volver } from '../src/lib/volver'
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { haySelectorDeSalida, SelectorDeSalida } from '../modules/audio-route'
import { artworkSource } from '../src/lib/artwork'
import {
  playNext,
  playPrevious,
  seekFraction,
  toggleView,
  togglePlayback,
  useNowPlayingView,
  usePlaybackOriginName,
  usePlaybackState,
} from '../src/state/playback'
import { crearJamActual, useCuantosJam, useJamActivo } from '../src/state/jam'
import { LyricsView } from '../src/ui/LyricsView'
import { BotonAleatorio, BotonRepetir } from '../src/ui/Transport'
import { SeekBar } from '../src/ui/SeekBar'
import { SongDisc } from '../src/ui/SongDisc'
import {
  ICON_COLOR,
  IconChevronDown,
  IconCola,
  IconDisc,
  IconLyrics,
  IconMusic,
  IconNext,
  IconPause,
  IconPlay,
  IconPrevious,
  IconUsers,
} from '../src/ui/icons'

/**
 * Lo que suena, a pantalla completa.
 *
 * Es la otra mitad del reproductor del teléfono: la tarjeta de abajo se queda
 * con lo mínimo —qué suena y pausa— y todo lo que no entraba ahí vive acá. No
 * hay nada nuevo inventado: la carátula, el disco girando, la letra y la barra
 * de posición son los mismos componentes del panel derecho del escritorio.
 *
 * Va como ruta modal y no como una capa dentro de la pantalla principal: la
 * animación de subida, el gesto para bajarla y el que la música siga sonando
 * detrás salen gratis del navegador, y no hay que sincronizar nada.
 */
export default function Playing() {
  const router = useRouter()
  const { tracks, index, manual, wantPlay, positionMs, durationMs } = usePlaybackState()
  const view = useNowPlayingView()
  const listName = usePlaybackOriginName()
  const enJam = useJamActivo()
  const cuantosJam = useCuantosJam()

  const track = manual ?? (index >= 0 ? (tracks[index] ?? null) : null)
  const artwork = track ? artworkSource(track.artworkPath, track.artworkUrl, 640) : null
  const progress = durationMs > 0 ? Math.max(0, Math.min(1, positionMs / durationMs)) : 0
  const last = !manual && index >= tracks.length - 1
  const first = !manual && index <= 0

  /*
   * Sin nada cargado no hay pantalla que mostrar.
   *
   * Pasa si la canción termina con esto abierto: en vez de dejar un hueco con
   * controles que no controlan nada, se cierra sola y volvés a donde estabas.
   */
  if (!track) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-canvas">
        <IconMusic size={26} color={ICON_COLOR.muted} />
        <Text className="text-muted-foreground text-[13px]">No hay nada sonando.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => volver(router, '/')}
          className="rounded-full bg-muted px-5 py-2.5 active:opacity-80"
        >
          <Text className="text-foreground text-[13px] font-semibold">Volver</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <View className="flex-1 bg-canvas">
      {/*
       * El fondo lo pone la tapa.
       *
       * Es el mismo recurso del visor de mensajes: la carátula estirada y
       * desenfocada detrás, con un velo encima. La app es acromática a
       * propósito, y este es el único lugar donde el color entra —el que trae
       * la canción, no uno nuestro—. Sobre negro plano el vinilo quedaba
       * flotando en la nada; así el disco se apoya en algo.
       *
       * El velo no es decoración: sin él, una tapa clara se come el título y
       * los controles.
       */}
      {artwork ? (
        <Image
          source={{ uri: artwork }}
          style={[
            StyleSheet.absoluteFill,
            // La escala evita que el desenfoque deje los bordes transparentes.
            { transform: [{ scale: 1.3 }], opacity: 0.55 },
            Platform.OS === 'web' ? ({ filter: 'blur(72px) saturate(1.4)' } as object) : null,
          ]}
          blurRadius={Platform.OS === 'web' ? 0 : 40}
        />
      ) : null}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.72)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.92)']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        <View className="flex-row items-center gap-3 px-4 py-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Bajar"
            onPress={() => volver(router, '/')}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
          >
            <IconChevronDown size={22} color={ICON_COLOR.foreground} />
          </Pressable>
          <View className="min-w-0 flex-1 items-center">
            <Text className="text-muted-foreground text-[11px] uppercase tracking-[1.2px]">
              {manual ? 'En la cola' : listName || 'Sonando'}
            </Text>
          </View>
          {/* La cola, arriba a la derecha — donde la pone Spotify. De paso hace
              de contrapeso de la flecha, que es lo que había acá antes. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver la cola"
            onPress={() => router.push('/cola')}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
          >
            <IconCola size={19} color={ICON_COLOR.foreground} />
          </Pressable>
        </View>

        {/* La pieza grande: la tapa, el disco girando o la letra. Es la misma
          decisión que ofrece el panel del escritorio, con los mismos botones. */}
        <View className="min-h-0 flex-1 items-center justify-center px-6">
          {view === 'lyrics' ? (
            <LyricsView track={track} translatable />
          ) : view === 'disc' ? (
            <SongDisc
              artworkUrl={track.artworkUrl}
              artworkPath={track.artworkPath}
              title={track.title}
              playing={wantPlay}
              size={300}
            />
          ) : artwork ? (
            <Image
              source={{ uri: artwork }}
              className="w-full rounded-2xl bg-card"
              style={{ aspectRatio: 1 }}
            />
          ) : (
            <View
              className="w-full items-center justify-center rounded-2xl bg-card"
              style={{ aspectRatio: 1 }}
            >
              <IconMusic size={40} color={ICON_COLOR.muted} />
            </View>
          )}
        </View>

        <View className="gap-5 px-6 pb-4 pt-6">
          <View className="gap-1">
            <Text className="text-foreground text-2xl font-bold" numberOfLines={2}>
              {track.title}
            </Text>
            <Text className="text-muted-foreground text-[15px]" numberOfLines={1}>
              {track.artist}
            </Text>
          </View>

          <SeekBar
            label={track.title}
            progress={progress}
            elapsedMs={positionMs}
            totalMs={durationMs}
            onSeek={seekFraction}
          />

          {/*
           * La fila de siempre: aleatorio, anterior, play, siguiente, repetir.
           *
           * Es el orden de cualquier reproductor —Spotify, Apple Music, el
           * Winamp— y no es capricho: los dos modos van a los extremos porque
           * cambian **cómo** suena la cola, y los tres del medio son lo que hacés
           * con la canción de ahora. Mezclarlos obligaría a leer los cinco íconos
           * cada vez para encontrar el play.
           *
           * El hueco baja de 8 a 5 para que entren los cinco sin apretarse contra
           * los bordes en un teléfono angosto.
           */}
          <View className="flex-row items-center justify-center gap-5">
            <BotonAleatorio size={22} lado={44} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Anterior"
              onPress={playPrevious}
              className="h-12 w-12 items-center justify-center rounded-full active:opacity-60"
            >
              <IconPrevious size={26} color={first ? ICON_COLOR.muted : ICON_COLOR.foreground} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={wantPlay ? 'Pausar' : 'Reproducir'}
              onPress={togglePlayback}
              className="h-16 w-16 items-center justify-center rounded-full bg-primary active:opacity-80"
            >
              {wantPlay ? (
                <IconPause size={24} color={ICON_COLOR.onPrimary} />
              ) : (
                <IconPlay size={24} color={ICON_COLOR.onPrimary} />
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Siguiente"
              onPress={playNext}
              disabled={last}
              className="h-12 w-12 items-center justify-center rounded-full active:opacity-60"
            >
              <IconNext size={26} color={last ? ICON_COLOR.muted : ICON_COLOR.foreground} />
            </Pressable>
            <BotonRepetir size={22} lado={44} />
          </View>

          <View className="flex-row items-center justify-center gap-3">
            <Vista
              label="Ver el disco girando"
              active={view === 'disc'}
              onPress={() => toggleView('disc')}
              icon={IconDisc}
              text="Disco"
            />
            <Vista
              label="Ver la letra"
              active={view === 'lyrics'}
              onPress={() => toggleView('lyrics')}
              icon={IconLyrics}
              text="Letra"
            />

            {/*
             * El Jam, junto a las vistas: es lo otro que se hace **con lo que
             * está sonando**. Sin Jam lo crea con la cola puesta; con uno
             * abierto muestra cuántos son y abre el sheet. Encendido en blanco
             * como todo estado activo — ver docs/DESIGN.md.
             */}
            <Vista
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
              text={enJam ? `Jam · ${cuantosJam}` : 'Jam'}
            />

            {/*
             * A dónde sale el sonido, al lado de las vistas.
             *
             * Redondel y no píldora: las otras dos dicen qué estás mirando y
             * llevan su nombre escrito, pero esto abre la hoja del sistema y no
             * tiene un estado propio que nombrar. `docs/DESIGN.md` pide círculo
             * para los controles de reproducción, y este lo es.
             *
             * Adentro no va un ícono nuestro sino la vista de Apple, que se
             * dibuja y se anima sola; ocupa el círculo entero para que el toque
             * sea todo el botón y no el glifo. Sin el módulo en el binario no se
             * dibuja nada — ni el redondel, que quedaría vacío.
             */}
            {haySelectorDeSalida ? (
              <View className="h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-muted">
                <SelectorDeSalida
                  color={ICON_COLOR.muted}
                  activeColor={ICON_COLOR.foreground}
                  style={{ width: 36, height: 36 }}
                />
              </View>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    </View>
  )
}

/** Píldora que enciende y apaga una de las vistas. Blanco es encendido. */
function Vista({
  label,
  active,
  onPress,
  icon: Icon,
  text,
}: {
  label: string
  active: boolean
  onPress: () => void
  icon: (props: { size?: number; color?: string }) => React.ReactElement
  text: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`flex-row items-center gap-2 rounded-full px-4 py-2 active:opacity-70 ${
        active ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <Icon size={15} color={active ? ICON_COLOR.onPrimary : ICON_COLOR.muted} />
      <Text
        className={`text-[13px] font-semibold ${
          active ? 'text-primary-foreground' : 'text-muted-foreground'
        }`}
      >
        {text}
      </Text>
    </Pressable>
  )
}
