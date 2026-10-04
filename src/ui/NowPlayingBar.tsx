import { NativeMiniPlayer } from '../../modules/media-controls'
import { useDestinoEscucha } from './Dispositivos.shared'
import { EstadoDispositivo } from './EstadoDispositivo'
import { BotonSuperficie } from './BotonSuperficie'
import { IconButton } from './IconButton'
import { useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { ActivityIndicator, Image, Platform, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { artworkSource } from '../lib/artwork'
import { abrirArtista, abrirCara, hayQuienAbraCaras, useTabsVisible } from '../state/shell'
import {
  canOpenPlaylist,
  posicionSV,
  openSoundingPlaylist,
  playNext,
  playPrevious,
  seekFraction,
  seekToMs,
  toggleShuffle,
  setVolume,
  toggleMute,
  stopPlayback,
  togglePlayback,
  toggleView,
  useHaySiguiente,
  usePlaybackOriginName,
  usePlaybackState,
  useModoReproduccion,
} from '../state/playback'
import { crearJamActual, salirDelJam, useCuantosJam, useJamActivo } from '../state/jam'
import { abrirSelectorDispositivos } from '../state/escucha'
import { BORDE_REFERENTE, ES_WEB, Glass, HAY_VIDRIO } from './Glass'
import { useClicDerecho } from './useClicDerecho'
import { dejarCancionACompartir } from '../state/compartir'
import { Menu, type MenuItem } from './Menu'
import { SeekBar, formatClock } from './SeekBar'
import { NOMBRE_MODO_REPRODUCCION } from './Transport'
import { BotonVistaAudio, ControlesTransporte } from './ControlesTransporte'
import { VolumenAudio } from './VolumenAudio'
import { BotonMeGusta } from './BotonMeGusta'
import { EnlaceArtista } from './EnlaceArtista'
import { PlayerMarquee } from './PlayerMarquee'
import { BotonLateral } from './CabeceraLateral'
import {
  ICON_COLOR,
  IconClose,
  IconChevronUp,
  IconChevronDown,
  IconMusic,
  IconNext,
  IconDispositivo,
  IconPause,
  IconPlay,
  IconPrevious,
  IconRepeat,
  IconShare,
  IconShuffle,
  IconSparkles,
  IconCola,
  IconUsers,
} from './icons'

const WIDE_PX = 720
/* Debe coincidir con DETAIL_PX de app/index.tsx; la ruta del Jam usa el mismo umbral. */
export const PANEL_PX = 1120

/* La pantalla principal debe llevar primero la música al centro antes de abrir su panel. */
function ponerCara(cara: 'disc' | 'lyrics' | 'jam' | 'cola') {
  if (hayQuienAbraCaras()) abrirCara(cara)
  else toggleView(cara)
}

/* El motor se monta aparte para que cambiar de layout no reinicie el audio. */

function lineaEstado({
  estadoRemoto,
  error,
  artist,
  artistId,
}: {
  estadoRemoto: string | null
  error: string | null
  artist: string
  artistId?: string | null
}) {
  if (error) {
    return (
      <Text className="text-muted-foreground text-caption2" numberOfLines={1}>
        {error}
      </Text>
    )
  }
  if (estadoRemoto) {
    return (
      <View className="flex-row items-center gap-1">
        <IconDispositivo size={12} color={ICON_COLOR.foreground} />
        <Text className="text-foreground text-caption2" numberOfLines={1}>
          {estadoRemoto}
        </Text>
      </View>
    )
  }
  return <EnlaceArtista id={artistId} nombre={artist} size={11} />
}

export function NowPlayingBar({
  oculto = false,
  compacta = false,
}: {
  oculto?: boolean
  /* La fila contenedora aporta sus márgenes en el modo plegado. */
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
    view,
    error,
  } = usePlaybackState()
  const insets = useSafeAreaInsets()
  const conTabs = useTabsVisible()
  const router = useRouter()
  const { width, fontScale } = useWindowDimensions()
  const wide = width >= WIDE_PX

  const listName = usePlaybackOriginName()
  const modoReproduccion = useModoReproduccion()
  const enJam = useJamActivo()
  const cuantosJam = useCuantosJam()

  const destinoEscucha = useDestinoEscucha()
  const estadoRemoto = destinoEscucha.remoto ? destinoEscucha.resumen : null
  const [opcionesNativas, setOpcionesNativas] = useState<{ x: number; y: number } | null>(null)
  const miniNativo = useRef<View>(null)
  /* Sólo una acción explícita cambia el tamaño; scroll y volumen no alteran el layout. */
  const [compacto, setCompacto] = useState(false)

  const clicBarra = useClicDerecho()

  // Lo encolado a mano manda sobre la lista mientras dure.
  const current = manual ?? (index >= 0 ? (tracks[index] ?? null) : null)

  const last = !useHaySiguiente()
  const artwork = current ? artworkSource(current.artworkPath, current.artworkUrl, 96) : null

  const playing = wantPlay && cargada && !destinoEscucha.remoto

  const cargando = wantPlay && !cargada && !error && !destinoEscucha.remoto

  if (!current || oculto) return null

  const progress = durationMs > 0 ? Math.max(0, Math.min(1, positionMs / durationMs)) : 0
  const desktopStatus = error ? <PlayerMarquee text={error} kind="subtitle" />
    : estadoRemoto ? <View className="min-w-0 flex-row items-center gap-1">
      <IconDispositivo size={12} color={ICON_COLOR.foreground} />
      <View className="min-w-0 flex-1"><PlayerMarquee text={estadoRemoto} kind="subtitle" /></View>
    </View>
      : <PlayerMarquee text={current.artist} kind="subtitle"
        onPress={current.artistId ? () => { abrirArtista(current.artistId!, current.artist); router.dismissTo('/') } : undefined} />

  const menu: MenuItem[] = [

    {

      label: enJam ? `Jam · ${cuantosJam}` : 'Jam',
      rapida: true,
      selected: enJam || undefined,

      onPress: () => {
        const abrir = () => {
          if (width >= PANEL_PX) ponerCara('jam')
          else router.push('/jam')
        }
        if (enJam) {
          abrir()
          return
        }
        void crearJamActual().then((ok) => {
          if (ok) abrir()
        })
      },
      icon: <IconUsers size={15} color={enJam ? ICON_COLOR.foreground : ICON_COLOR.muted} />,
      sfSymbol: enJam ? 'person.2.fill' : 'person.2',
    },
    {
      label: 'Cola',
      rapida: true,

      onPress: () => {
        if (width >= PANEL_PX) ponerCara('cola')
        else router.push('/cola')
      },
      icon: <IconCola size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'list.bullet',
    },

    {
      label: 'Compartir',
      rapida: true,
      onPress: () => {
        dejarCancionACompartir(current)
        router.push('/compartir')
      },
      icon: <IconShare size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'square.and.arrow.up',
    },
    {
      label: 'Ver la lista',
      subtitle: listName || undefined,
      onPress: openSoundingPlaylist,
      disabled: !canOpenPlaylist(),
      icon: <IconMusic size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'music.note.list',
    },
    {
      // Spotify Connect: mover la música entre los aparatos de la cuenta. El
      // selector lo dibuja `SelectorDispositivos`, montado en el layout.
      label: 'Escuchar en…',
      subtitle: destinoEscucha.resumen,
      onPress: abrirSelectorDispositivos,
      icon: <IconDispositivo size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'laptopcomputer.and.iphone',
    },

    ...(wide
      ? []
      : [
          {
            label: `Modo · ${NOMBRE_MODO_REPRODUCCION[modoReproduccion]}`,
            subtitle: 'Tocá para cambiar',
            separadorAntes: true,
            selected: modoReproduccion !== 'orden',
            onPress: toggleShuffle,
            icon:
              modoReproduccion === 'recomendado' ? (
                <IconSparkles size={15} color={ICON_COLOR.foreground} />
              ) : (
                <IconShuffle
                  size={15}
                  color={modoReproduccion === 'aleatorio' ? ICON_COLOR.foreground : ICON_COLOR.muted}
                />
              ),
            sfSymbol: modoReproduccion === 'recomendado' ? 'sparkles' as const : 'shuffle' as const,
          },
        ]),
    {
      label: 'Volver a empezar',
      separadorAntes: wide,
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
          onPress: stopPlayback,
          destructive: true,
          icon: <IconClose size={15} color={ICON_COLOR.muted} />,
          sfSymbol: 'xmark',
        },
  ]

  if (!wide && NativeMiniPlayer) {
    return <View ref={miniNativo} collapsable={false} style={{ paddingHorizontal: compacta ? 0 : 12, paddingBottom: conTabs ? 8 : compacta ? 0 : 8 + insets.bottom }}>
      <NativeMiniPlayer title={current.title} subtitle={error || (destinoEscucha.remoto ? destinoEscucha.resumen : current.artist)} artwork={artwork}
        playing={playing} busy={cargando} canNext={!last} canPrevious
        deviceLabel={destinoEscucha.resumen} remote={destinoEscucha.remoto}
        style={{ width: '100%', height: Math.max(64, 44 + 20 * fontScale) }}
        onOpen={() => router.push('/playing')} onPlayPause={togglePlayback} onNext={playNext}
        onPrevious={playPrevious} onDevices={abrirSelectorDispositivos} onOptions={() => miniNativo.current?.measureInWindow((x, y, ancho) => setOpcionesNativas({ x: x + ancho / 2, y }))} />
      {opcionesNativas ? <Menu items={menu} sinDisparador abiertoEn={opcionesNativas} onCerrarPunto={() => setOpcionesNativas(null)} /> : null}
    </View>
  }
  if (!wide) {
    const androidRecto = Platform.OS === 'android'

    return (
      <View

        className={androidRecto || compacta ? '' : `px-[22px] ${conTabs ? 'pb-2' : ''}`}
        style={androidRecto ? { width: '100%', backgroundColor: '#1C1B1F' } : compacta || conTabs ? undefined : { paddingBottom: 8 + insets.bottom }}
      >
        <Glass
          radius={androidRecto ? 0 : compacta ? 26 : 18}
          style={androidRecto ? { backgroundColor: '#1C1B1F' } : { boxShadow: '0 6px 20px rgba(0,0,0,0.45)' }}
        >
        {/* Los controles y la acción de abrir son hermanos para evitar botones anidados en HTML. */}
        <View className="flex-row items-center gap-3 px-2.5 py-2">
          <BotonSuperficie
            accessibilityRole="button"
            accessibilityLabel={`${current.title}, de ${current.artist}`}
            onPress={() => router.push('/playing')}
            className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-90"
          >
            {artwork ? (
              <Image source={{ uri: artwork }} className="h-10 w-10 rounded-lg bg-muted" />
            ) : (
              <View className="h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <IconMusic size={16} color={ICON_COLOR.muted} />
              </View>
            )}

            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-foreground text-footnote font-semibold" numberOfLines={1}>
                {current.title}
              </Text>
              {lineaEstado({ estadoRemoto, error, artist: current.artist })}
            </View>
          </BotonSuperficie>

          <View className="flex-row items-center">

            {tracks.length > 1 ? (
              <IconButton label="Anterior" symbol="backward.end.fill" onPress={playPrevious} lado={40} size={19} icon={<IconPrevious size={19} color={ICON_COLOR.foreground} />} />
            ) : null}
            <IconButton label={destinoEscucha.remoto ? 'Traer música a este dispositivo' : cargando ? 'Pausar carga' : playing ? 'Pausar' : 'Reproducir'} symbol={playing ? 'pause.fill' : 'play.fill'} onPress={togglePlayback} lado={40} size={19} busy={cargando} icon={cargando ? (
                <ActivityIndicator size="small" color={ICON_COLOR.foreground} />
              ) : playing ? (
                <IconPause size={19} color={ICON_COLOR.foreground} />
              ) : (
                <IconPlay size={19} color={ICON_COLOR.foreground} />
              )} />
            <IconButton label="Siguiente" symbol="forward.end.fill" onPress={playNext} disabled={last} lado={40} size={19} icon={<IconNext size={19} color={last ? ICON_COLOR.muted : ICON_COLOR.foreground} />} />
          </View>

          {/* El mini reproductor informa progreso; la búsqueda táctil vive en la pantalla completa. */}
          <View
            pointerEvents="none"
            className={`absolute bottom-0 h-[2px] overflow-hidden bg-muted ${androidRecto ? 'left-0 right-0' : 'left-3 right-3 rounded-full'}`}
          >
            <View
              className="h-full rounded-full bg-foreground"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </View>
        </View>
        </Glass>
      </View>
    )
  }

  const barra = (
    <View
      className="flex-row items-center gap-3 bg-canvas px-3 pt-2"
      style={{ paddingBottom: 8 + insets.bottom }}
    >

      <View className="min-w-0 flex-1 flex-row items-center gap-3">
        {artwork ? (
          <Image source={{ uri: artwork }} className="h-12 w-12 rounded bg-card" />
        ) : (
          <View className="h-12 w-12 items-center justify-center rounded bg-card">
            <IconMusic size={18} color={ICON_COLOR.muted} />
          </View>
        )}
        <View className="min-w-0 flex-1 gap-0.5">
          {ES_WEB ? <PlayerMarquee text={current.title} kind="title" />
            : <Text className="text-foreground text-footnote font-semibold" numberOfLines={1}>{current.title}</Text>}
          {ES_WEB ? desktopStatus : lineaEstado({ estadoRemoto, error, artist: current.artist, artistId: current.artistId })}
        </View>

        <BotonMeGusta track={current} size={16} lado={36} />
      </View>

      <View className="w-[38%] max-w-[560px] gap-1">
        <ControlesTransporte reproduciendo={playing} cargando={cargando} remoto={destinoEscucha.remoto}
          onAnterior={playPrevious} onAlternar={togglePlayback} onSiguiente={playNext} sinSiguiente={last} />
        <SeekBar
          label={current.title}
          progress={progress}
          elapsedMs={positionMs}
          totalMs={durationMs}
          onSeek={seekFraction}
          posicionMs={posicionSV}
        />
      </View>

      <View className="min-w-0 flex-1 flex-row items-center justify-end gap-1">
        <EstadoDispositivo compacto />
        <BotonVistaAudio
          label="Ver el disco girando"
          active={view === 'disc'}
          onPress={() => ponerCara('disc')}
          vista="disc"
        />
        <BotonVistaAudio
          label="Ver solo la letra"
          active={view === 'lyrics'}
          onPress={() => ponerCara('lyrics')}
          vista="lyrics"
        />
        <BotonVistaAudio
          label="Jam"
          active={enJam || view === 'jam'}
          onPress={() => {
            if (width >= PANEL_PX) ponerCara('jam')
            else router.push('/jam')
          }}
          vista="jam"
        />
        <Volume value={volume} onChange={setVolume} />
        <Menu items={menu} label={`Opciones de ${current.title}`} size={17} />
      </View>
    </View>
  )

  if (!HAY_VIDRIO) return barra

  /* El modo compacto conserva transporte y volumen y cambia sólo por acción explícita. */
  const conSeek = width >= 980 && !compacto
  const conVistas = width >= 1200 && !compacto

  return (
    <View pointerEvents="box-none" className="items-center px-3" style={{ paddingBottom: 12 + insets.bottom }}>
      <AnchoPildora compacto={compacto}>
      <Glass
        radius={32}
        style={{
          width: '100%',

          boxShadow: `0 10px 28px rgba(0,0,0,0.5), ${BORDE_REFERENTE}`,
        }}
      >
        <View className="flex-row items-center gap-3 py-2 pl-3 pr-2" {...clicBarra.gestos}>

          <View className="min-w-0 flex-1 flex-row items-center gap-3">
            {artwork ? (
              <Image source={{ uri: artwork }} className="h-10 w-10 rounded-lg bg-muted" />
            ) : (
              <View className="h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <IconMusic size={16} color={ICON_COLOR.muted} />
              </View>
            )}
            <View className="min-w-0 flex-1 gap-0.5">
              {ES_WEB ? <PlayerMarquee text={current.title} kind="title" />
                : <Text className="text-foreground text-footnote font-semibold" numberOfLines={1}>{current.title}</Text>}
              {ES_WEB ? desktopStatus : lineaEstado({ estadoRemoto, error, artist: current.artist, artistId: current.artistId })}
            </View>

            {compacto ? null : <BotonMeGusta track={current} size={16} lado={36} />}
          </View>

          <ControlesTransporte reproduciendo={playing} cargando={cargando} remoto={destinoEscucha.remoto} conModos={!compacto}
            onAnterior={playPrevious} onAlternar={togglePlayback} onSiguiente={playNext} sinSiguiente={last} />

          {conSeek ? (
            <View className="min-w-0 flex-[1.4] px-2" style={{ maxWidth: 440 }}>
              <SeekBar
                label={current.title}
                progress={progress}
                elapsedMs={positionMs}
                totalMs={durationMs}
                onSeek={seekFraction}
                posicionMs={posicionSV}
              />
            </View>
          ) : compacto ? null : (
            <Text className="text-muted-foreground text-caption2 tabular-nums">
              {formatClock(positionMs)}
            </Text>
          )}

          <View className="flex-row items-center justify-end gap-1">
            <EstadoDispositivo compacto />

            {clicBarra.punto ? (
              <Menu
                items={menu}
                sinDisparador
                abiertoEn={clicBarra.punto}
                onCerrarPunto={clicBarra.cerrar}
              />
            ) : null}
            {conVistas ? (
              <>
                <BotonVistaAudio
                  label="Ver el disco girando"
                  active={view === 'disc'}
                  onPress={() => ponerCara('disc')}
                  vista="disc"
                />
                <BotonVistaAudio
                  label="Ver solo la letra"
                  active={view === 'lyrics'}
                  onPress={() => ponerCara('lyrics')}
                  vista="lyrics"
                />
                <BotonVistaAudio
                  label="Jam"
                  active={enJam || view === 'jam'}

                  onPress={() => {
                    if (width >= PANEL_PX) ponerCara('jam')
                    else router.push('/jam')
                  }}
                  vista="jam"
                />
              </>
            ) : null}
            {/* El volumen permanece visible: en escritorio no hay botones físicos para ajustarlo. */}
            <Volume value={volume} onChange={setVolume} angosto={compacto || !conVistas} />
            {ES_WEB ? <BotonLateral label={compacto ? 'Expandir reproductor' : 'Contraer reproductor'} onPress={() => setCompacto(v => !v)}
              icono={compacto ? <IconChevronUp size={17} color={ICON_COLOR.muted} /> : <IconChevronDown size={17} color={ICON_COLOR.muted} />} /> : null}
            <Menu items={menu} label={`Opciones de ${current.title}`} size={17} />
          </View>
        </View>
      </Glass>
      </AnchoPildora>
    </View>
  )
}

function AnchoPildora({ compacto, children }: { compacto: boolean; children: React.ReactNode }) {
  return <View {...(ES_WEB ? { dataSet: { dnPlayerFrame: '' } } : {})} style={{ width: '100%', maxWidth: compacto ? 640 : 1080, alignSelf: 'center' }}>{children}</View>
}

function Volume({
  value,
  onChange,
  angosto = false,
}: {
  value: number
  onChange: (v: number) => void
  angosto?: boolean
}) {
  return <VolumenAudio value={value} onChange={onChange} onToggleMute={toggleMute} compact angosto={angosto} />
}
