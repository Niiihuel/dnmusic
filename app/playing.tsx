import { PlayerHeader } from '../src/ui/PlayerHeader'
import { useDestinoEscucha } from '../src/ui/Dispositivos.shared'
import { EstadoDispositivo } from '../src/ui/EstadoDispositivo'
import { IconButton } from '../src/ui/IconButton'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { volver } from '../src/lib/volver'
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { abrirArtista, usePiso } from '../src/state/shell'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { haySelectorDeSalida, SelectorDeSalida, hayVolumenDelSistema, VolumenDelSistema } from '../modules/audio-route'
import { artworkSource } from '../src/lib/artwork'
import { resultadoDePista } from '../src/lib/pistas'
import { fijarPistaEnPerfil } from '../src/lib/fijarEnPerfil'
import {
  canOpenPlaylist,
  openSoundingPlaylist,
  playNext,
  playPrevious,
  posicionSV,
  seekFraction,
  seekToMs,
  setVolume,
  toggleMute,
  stopPlayback,
  toggleView,
  togglePlayback,
  useHaySiguiente,
  useNowPlayingView,
  usePlaybackOriginName,
  usePlaybackState,
  useVolume,
} from '../src/state/playback'
import { crearJamActual, salirDelJam, useCuantosJam, useJamActivo } from '../src/state/jam'
import { abrirSelectorDispositivos } from '../src/state/escucha'
import { dejarCancionPendiente } from '../src/state/listas'
import { LyricsView } from '../src/ui/LyricsView'
import { Vacio } from '../src/ui/Vacio'
import { dejarCancionACompartir } from '../src/state/compartir'
import { BotonVistaAudio, ControlesTransporte } from '../src/ui/ControlesTransporte'
import { VolumenAudio } from '../src/ui/VolumenAudio'
import { BotonMeGusta } from '../src/ui/BotonMeGusta'
import { Menu, type MenuItem } from '../src/ui/Menu'
import { ES_WEB } from '../src/ui/Glass'
import { SeekBar } from '../src/ui/SeekBar'
import { PlayerArtwork } from '../src/ui/PlayerArtwork'
import { PlayerBackdrop } from '../src/ui/PlayerBackdrop'
import { SongDisc } from '../src/ui/SongDisc'
import {
  ICON_COLOR,
  IconChevronDown,
  IconDispositivo,
  IconMore,
  IconMusic,
  IconPlus,
  IconRepeat,
  IconShare,
  IconUser,
  IconUsers,
  IconClose,
} from '../src/ui/icons'

const COLUMNA = 520
const ES_IOS = Platform.OS === 'ios'

const SUBE_MS = 380
const BAJA_MS = 300

const ARRASTRE_CIERRA = 120
const VELOCIDAD_CIERRA = 800

const CONTROLES_MS = 4500
const CONTROLES_FADE_MS = 240

export default function Playing() {
  return <SafeAreaProvider><PlayingContent /></SafeAreaProvider>
}

function PlayingContent() {
  const destinoEscucha = useDestinoEscucha()
  const router = useRouter()
  const { tracks, index, manual, wantPlay, cargada, error, positionMs, durationMs } = usePlaybackState()
  const sonando = wantPlay && cargada && !destinoEscucha.remoto
  const cargando = wantPlay && !cargada && !error && !destinoEscucha.remoto
  const view = useNowPlayingView()
  const listName = usePlaybackOriginName()
  const enJam = useJamActivo()
  const cuantosJam = useCuantosJam()

  const last = !useHaySiguiente()

  const { height: alturaVentana, width: anchoVentana } = useWindowDimensions()
  /* Web y Android respetan el safe area superior; UIKit presenta la pantalla de iOS. */
  const insets = useSafeAreaInsets()
  const tope = !ES_IOS && insets.top > 0 ? insets.top + 6 : 0
  const desde = Math.max(0, alturaVentana - usePiso() - tope)

  /* 0 es abierta; `desde` coincide con el mini reproductor. */
  const y = useSharedValue(ES_IOS ? 0 : desde)

  const cerrar = () => {
    if (ES_IOS) {
      volver(router, '/')
      return
    }
    /* Navegar al terminar evita desmontar a mitad de la animación; el callback llega desde UI. */
    y.value = withTiming(desde, { duration: BAJA_MS, easing: Easing.in(Easing.cubic) }, (fin) => {
      if (fin) runOnJS(volver)(router, '/')
    })
  }

  /* `failOffsetX` cede el gesto horizontal a la barra de posición. */
  const arrastre = Gesture.Pan()
    .enabled(!ES_IOS)
    .activeOffsetY(15)
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      y.value = Math.max(0, e.translationY)
    })
    .onEnd((e) => {

      if (e.translationY > ARRASTRE_CIERRA || e.velocityY > VELOCIDAD_CIERRA) {
        runOnJS(cerrar)()
        return
      }

      y.value = withSpring(0, { damping: 22, stiffness: 260 })
    })

  const crece = useAnimatedStyle(() => {
    /* Una ventana aún sin medir no debe producir un rango de interpolación [0,0,0]. */
    const p = desde > 0 ? y.value / desde : 0
    return {
      transform: [{ translateY: y.value }],

      opacity: interpolate(p, [0, 0.55, 1], [1, 0.85, 0], 'clamp'),
    }
  })

  const velo = useAnimatedStyle(() => {
    const p = desde > 0 ? y.value / desde : 0
    return { opacity: (1 - p) * 0.45 }
  })

  /* El gesto y la entrada comparten `.value`, la API imperativa de Reanimated. */
  useEffect(() => {
    if (ES_IOS) return
    // eslint-disable-next-line react-hooks/immutability
    y.value = withTiming(0, { duration: SUBE_MS, easing: Easing.out(Easing.cubic) })
  }, [y])

  const track = manual ?? (index >= 0 ? (tracks[index] ?? null) : null)
  const artwork = track ? artworkSource(track.artworkPath, track.artworkUrl, 640) : null
  const progress = durationMs > 0 ? Math.max(0, Math.min(1, positionMs / durationMs)) : 0
  const conLetra = view === 'lyrics'

  /* Cada interacción rearma el temporizador para no ocultar controles durante un arrastre. */
  const [escondidos, setEscondidos] = useState(false)

  const visibles = ES_IOS || !conLetra || !escondidos
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const apagarTimer = () => {
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = null
  }
  const rearmar = useCallback(() => {
    apagarTimer()
    if (ES_IOS || !conLetra || !wantPlay) return
    temporizador.current = setTimeout(() => setEscondidos(true), CONTROLES_MS)
  }, [conLetra, wantPlay])
  useEffect(() => {
    if (!conLetra) return
    rearmar()
    return apagarTimer
  }, [conLetra, wantPlay, rearmar])
  const tocado = () => {
    if (escondidos) setEscondidos(false)
    rearmar()
  }
  const alternarControles = () => {
    if (visibles) {
      apagarTimer()
      setEscondidos(true)
    } else tocado()
  }

  const verLetra = () => {
    setEscondidos(false)
    toggleView('lyrics')
  }
  const fundido = useAnimatedStyle(() => ({
    opacity: withTiming(visibles ? 1 : 0, { duration: CONTROLES_FADE_MS }),
    transform: [{ translateY: withTiming(visibles ? 0 : 12, { duration: CONTROLES_FADE_MS }) }],
  }))

  if (!track) {
    return (
      <SafeAreaView className="flex-1 justify-center bg-canvas">
        <Vacio
          icono={<IconMusic size={24} color={ICON_COLOR.muted} />}
          titulo="No hay nada sonando"
          detalle="Poné una canción y esta pantalla se vuelve su tapa gigante."
          accion={{ rotulo: 'Volver', onPress: () => volver(router, '/') }}
        />
      </SafeAreaView>
    )
  }

  const jamLabel = enJam
    ? `Jam · ${cuantosJam}`
    : 'Jam'
  const menu: MenuItem[] = [
    {
      label: 'Agregar a una lista',
      rapida: true,
      onPress: () => {
        dejarCancionPendiente(resultadoDePista(track))
        router.push('/lista/elegir')
      },
      icon: <IconPlus size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'plus',
    },
    {

      label: jamLabel,
      rapida: true,
      selected: enJam || undefined,
      onPress: () => {
        if (enJam) {
          router.push('/jam')
          return
        }
        void crearJamActual().then((ok) => {
          if (ok) router.push('/jam')
        })
      },
      icon: <IconUsers size={15} color={enJam ? ICON_COLOR.foreground : ICON_COLOR.muted} />,
      sfSymbol: enJam ? 'person.2.fill' : 'person.2',
    },

    {
      label: 'Compartir',
      rapida: true,
      onPress: () => {
        dejarCancionACompartir(track)
        router.push('/compartir')
      },
      icon: <IconShare size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'square.and.arrow.up',
    },
    ...(ES_IOS ? [{
      label: view === 'disc' ? 'Ver la portada' : 'Ver el disco girando',
      onPress: () => toggleView('disc'),
      sfSymbol: 'opticaldisc' as const,
    }] : []),
    {
      label: 'Ir al artista',
      subtitle: track.artist,
      disabled: !track.artistId,
      onPress: () => {
        if (!track.artistId) return
        abrirArtista(track.artistId, track.artist)
        cerrar()
      },
      icon: <IconUser size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'music.microphone',
    },
    {
      label: 'Ver la lista',
      subtitle: manual ? undefined : listName || undefined,
      disabled: !canOpenPlaylist(),
      onPress: () => {
        openSoundingPlaylist()
        cerrar()
      },
      icon: <IconMusic size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'music.note.list',
    },
    {
      label: 'Fijar en mi perfil',
      onPress: () => void fijarPistaEnPerfil(track),
      icon: <IconUser size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'pin',
    },
    {
      label: 'Escuchar en…',
      separadorAntes: true,
      onPress: abrirSelectorDispositivos,
      icon: <IconDispositivo size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'laptopcomputer.and.iphone',
    },
    {
      label: 'Volver a empezar',
      onPress: () => seekToMs(0),
      icon: <IconRepeat size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'arrow.counterclockwise',
    },
    /* Salir del Jam elimina la membresía; detener sólo el audio permitiría que el próximo evento lo reinicie. */
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
          onPress: () => {
            stopPlayback()
            cerrar()
          },
          destructive: true,
          icon: <IconClose size={15} color={ICON_COLOR.muted} />,
          sfSymbol: 'xmark',
        },
  ]

  const botonMenu = (
    <Menu
      items={menu}
      label={`Opciones de ${track.title}`}
      trigger={
        <View className="h-10 w-10 items-center justify-center rounded-full bg-white/10">
          <IconMore size={17} color={ICON_COLOR.foreground} />
        </View>
      }
    />
  )

  const controles = (
    <View
      style={{ gap: ES_IOS ? 10 : 20, paddingHorizontal: 24, paddingBottom: 8, paddingTop: 8, flexShrink: 0 }}
      /* Puntero en web y toque nativo rearman el mismo temporizador. */
      onTouchStart={tocado}
      {...({ onPointerDown: tocado } as object)}
    >
      <SeekBar
        label={track.title}
        progress={progress}
        elapsedMs={positionMs}
        totalMs={durationMs}
        onSeek={seekFraction}
        posicionMs={posicionSV}
      />

      <ControlesTransporte grande reproduciendo={sonando} cargando={cargando} remoto={destinoEscucha.remoto}
        onAnterior={playPrevious} onAlternar={togglePlayback} onSiguiente={playNext} sinSiguiente={last} />
      {error ? <Text accessibilityRole="alert" numberOfLines={2} style={{ color: '#B3B3B3', fontSize: 12, textAlign: 'center' }}>{error}</Text> : null}

      {/* iOS usa MPVolumeView para compartir el volumen de los botones físicos y AirPlay. */}
      {!ES_IOS ? <Volumen /> : null}
      {ES_IOS && hayVolumenDelSistema ? <VolumenDelSistema style={{ width: '100%', height: 44 }} /> : null}

      <View className="flex-row items-center justify-evenly pt-1">
        <BotonVistaAudio
          label="Ver la letra"
          active={conLetra}
          onPress={verLetra}
          vista="lyrics"
        />
        {!ES_IOS ? <BotonVistaAudio
          label="Ver el disco girando"
          active={view === 'disc'}
          onPress={() => toggleView('disc')}
          vista="disc"
        /> : null}
        {/* El módulo nativo aporta el control AirPlay y su área táctil; sin módulo no se muestra. */}
        {haySelectorDeSalida ? (
          <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-full">
            <SelectorDeSalida
              color={ICON_COLOR.muted}
              activeColor={ICON_COLOR.foreground}
              style={{ width: 44, height: 44 }}
            />
          </View>
        ) : null}
        <BotonVistaAudio
          label="Ver la cola"
          active={false}
          onPress={() => router.push('/cola')}
          vista="cola"
        />
      </View>
    </View>
  )

  if (ES_IOS) {
    // La ruta nativa presenta la pantalla entera. El contenido respeta un solo
    // safe area; las letras y los controles tienen regiones que no se solapan.
    const compacto = alturaVentana - insets.top - insets.bottom < 650
    const artworkSize = Math.max(120, Math.min(anchoVentana - 64, 360, alturaVentana - insets.top - insets.bottom - 390))
    return (
      <View style={{ flex: 1, backgroundColor: '#101010' }}>
        <PlayerBackdrop uri={artwork} />
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, width: '100%', maxWidth: COLUMNA, alignSelf: 'center' }}>
          <PlayerHeader title={manual ? 'En la cola' : listName || 'Sonando'} onClose={cerrar} right={<EstadoDispositivo compacto />} />
          {conLetra ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingTop: compacto ? 4 : 12, paddingBottom: 12 }}>
                {artwork ? <Image source={{ uri: artwork }} style={{ width: 48, height: 48, borderRadius: 8 }} /> : null}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '600' }}>{track.title}</Text>
                  <Text numberOfLines={1} style={{ color: '#B3B3B3', fontSize: 14, marginTop: 3 }}>{track.artist}</Text>
                </View>
                <BotonMeGusta track={track} size={20} lado={44} />
                {botonMenu}
              </View>
              <View style={{ flex: 1, minHeight: 0 }}>
                <LyricsView track={track} translatable size="xl" translationPlacement="footer" onPickLine={seekToMs} />
              </View>
            </>
          ) : (
            <>
              <View style={{ flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
                {view === 'disc' ? <SongDisc artworkUrl={track.artworkUrl} artworkPath={track.artworkPath} title={track.title} playing={sonando} size={artworkSize} />
                  : artwork ? <View style={{ width: artworkSize }}><PlayerArtwork uri={artwork} playing={sonando} /></View>
                    : <IconMusic size={64} color={ICON_COLOR.muted} />}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '700' }}>{track.title}</Text>
                  <Text numberOfLines={1} style={{ color: '#B3B3B3', fontSize: 17, marginTop: 3 }}>{track.artist}</Text>
                </View>
                <BotonMeGusta track={track} size={22} lado={44} />
                {botonMenu}
              </View>
            </>
          )}
          {controles}
        </SafeAreaView>
      </View>
    )
  }

  return (
    /* El fondo opaco debe animarse con la hoja: la escena permanece transparente durante la expansión. */
    <GestureDetector gesture={arrastre}>
      <View style={{ flex: 1 }}>
      {tope > 0 ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, velo]}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Bajar"
            onPress={cerrar}
            style={StyleSheet.absoluteFill}
          />
        </>
      ) : null}
      <Animated.View
        style={[
          {
            flex: 1,
            marginTop: tope,
            borderTopLeftRadius: tope ? 24 : 0,
            borderTopRightRadius: tope ? 24 : 0,
            overflow: 'hidden',
            backgroundColor: '#000000',
          },
          crece,
        ]}
      >
      {/* El velo mantiene el contraste sobre tapas claras, con mayor opacidad detrás de la letra. */}
      {artwork ? (
        <Image
          source={{ uri: artwork }}
          style={[
            StyleSheet.absoluteFill,
            // La escala evita que el desenfoque deje los bordes transparentes.
            { transform: [{ scale: 1.3 }], opacity: conLetra ? 0.4 : 0.55 },
            Platform.OS === 'web' ? ({ filter: 'blur(72px) saturate(1.4)' } as object) : null,
          ]}
          blurRadius={Platform.OS === 'web' ? 0 : 40}
        />
      ) : null}
      <LinearGradient
        pointerEvents="none"
        colors={
          conLetra
            ? ['rgba(0,0,0,0.78)', 'rgba(0,0,0,0.62)', 'rgba(0,0,0,0.92)']
            : ['rgba(0,0,0,0.72)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.92)']
        }
        style={StyleSheet.absoluteFill}
      />

      <View style={{ alignItems: 'center', paddingTop: 6 }}><EstadoDispositivo /></View>

      <SafeAreaView
        className="flex-1 self-center"
        style={{ width: '100%', maxWidth: COLUMNA }}
        /* El safe area superior ya está incluido en `tope`; sumarlo aquí duplicaría el margen. */
        edges={['bottom']}
      >

        <View
          pointerEvents="none"
          className="mt-2 h-[5px] w-9 self-center rounded-full bg-white/25"
        />

        {conLetra ? (
          <>

            <View className="flex-row items-center gap-3 px-5 pb-3 pt-4">
              {ES_WEB ? (

                <IconButton label="Bajar" symbol="chevron.down" onPress={cerrar} size={22} icon={<IconChevronDown size={22} color={ICON_COLOR.foreground} />} />
              ) : null}
              {artwork ? (
                <Image
                  source={{ uri: artwork }}
                  className="rounded-lg bg-card"
                  style={{ width: 52, height: 52 }}
                />
              ) : (
                <View
                  className="items-center justify-center rounded-lg bg-card"
                  style={{ width: 52, height: 52 }}
                >
                  <IconMusic size={18} color={ICON_COLOR.muted} />
                </View>
              )}
              <View className="min-w-0 flex-1">
                <Text className="text-foreground text-subheadline font-semibold" numberOfLines={1}>
                  {track.title}
                </Text>
                <Text className="text-muted-foreground text-footnote" numberOfLines={1}>
                  {track.artist}
                </Text>
              </View>
              <BotonMeGusta track={track} size={20} lado={40} />
              {botonMenu}
            </View>

            <View className="min-h-0 flex-1">
              <LyricsView track={track} translatable size="xl" onTap={alternarControles} />
              <Animated.View
                pointerEvents={visibles ? 'box-none' : 'none'}
                style={[
                  { position: 'absolute', left: 0, right: 0, bottom: 0 },
                  fundido,
                ]}
              >

                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)', 'rgba(0,0,0,0.92)']}
                  locations={[0, 0.35, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <View className="pt-10">{controles}</View>
              </Animated.View>
            </View>
          </>
        ) : (
          <>
            <View className="flex-row items-center px-4 py-1">
              <IconButton label="Bajar" symbol="chevron.down" onPress={cerrar} size={22} icon={<IconChevronDown size={22} color={ICON_COLOR.foreground} />} />
              <View className="min-w-0 flex-1 items-center">
                <Text className="text-muted-foreground text-footnote uppercase">
                  {manual ? 'En la cola' : listName || 'Sonando'}
                </Text>
              </View>
              <View className="w-10" />
            </View>

            <View className="min-h-0 flex-1 items-center justify-center px-6">
              {view === 'disc' ? (
                <SongDisc
                  artworkUrl={track.artworkUrl}
                  artworkPath={track.artworkPath}
                  title={track.title}
                  playing={sonando}
                  size={300}
                />
              ) : artwork ? (
                <PlayerArtwork uri={artwork} playing={sonando} />
              ) : (
                <View
                  className="w-full items-center justify-center rounded-2xl bg-card"
                  style={{ aspectRatio: 1 }}
                >
                  <IconMusic size={40} color={ICON_COLOR.muted} />
                </View>
              )}
            </View>

            <View className="flex-row items-center gap-2 px-6 pt-5">
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-foreground text-title3 font-bold" numberOfLines={1}>
                  {track.title}
                </Text>
                <Text className="text-muted-foreground text-subheadline" numberOfLines={1}>
                  {track.artist}
                </Text>
              </View>
              <BotonMeGusta track={track} size={22} lado={40} />
              {botonMenu}
            </View>

            {controles}
          </>
        )}
      </SafeAreaView>
      </Animated.View>
      </View>
    </GestureDetector>
  )
}

function Volumen() {
  const volumen = useVolume()
  return <VolumenAudio value={volumen} onChange={setVolume} onToggleMute={toggleMute} />
}
