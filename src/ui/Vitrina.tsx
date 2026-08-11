import { useState } from 'react'
import { Image, Pressable, Text, View } from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import { artworkSource } from '../lib/artwork'
import type { SongSnippet } from '../models/message'
import type { Showcase } from '../services/showcases'
import type { Playlist } from '../services/playlists'
import { esVideo, ilustracionUrl } from '../services/showcases'
import { Cava } from './Cava'
import { Glass, HAY_VIDRIO } from './Glass'
import { PlaylistCover } from './PlaylistCover'
import {
  ICON_COLOR,
  IconChevronDown,
  IconChevronUp,
  IconClose,
  IconMusic,
  IconPause,
  IconPlay,
} from './icons'

/**
 * Una vitrina del perfil.
 *
 * Es la unidad de la que está hecho un perfil, tomada de Steam: bloques
 * autocontenidos que quien lo arma elige y ordena. Todos comparten la misma
 * superficie —vidrio en iOS, gris sólido en el resto— para que la grilla se lea
 * como una sola cosa y no como cuatro componentes distintos apilados.
 *
 * Lo que cambia entre tipos es qué hay adentro, nunca el marco.
 */
export function Vitrina({
  showcase,
  playlists,
  playing,
  onTogglePlay,
  onOpenPlaylist,
  onRemove,
  onSubir,
  onBajar,
}: {
  showcase: Showcase
  /** Para resolver la vitrina de lista, que guarda solo el id. */
  playlists: Playlist[] | null
  /** Esta vitrina es la que está sonando. */
  playing: boolean
  onTogglePlay: (id: string, song: SongSnippet) => void
  onOpenPlaylist: (playlistId: string) => void
  /** Solo en el perfil propio: sacarla. Sin esto no se dibuja la cruz. */
  onRemove?: (id: string) => void
  /**
   * Moverla en el orden. `null` en las puntas.
   *
   * Flechas y no arrastre: arrastrar dentro de una lista que además se
   * desplaza pelea con el gesto de scroll, y en un perfil con tres o cuatro
   * vitrinas no compensa. Además las flechas se pueden tocar con precisión y
   * las lee un lector de pantalla, cosa que un arrastre no.
   */
  onSubir?: (() => void) | null
  onBajar?: (() => void) | null
}) {
  return (
    <Glass radius={16} style={HAY_VIDRIO ? {} : { backgroundColor: 'rgb(24,24,24)' }}>
      <View className="relative p-4">
        {onRemove ? (
          <View className="absolute right-2 top-2 z-10 flex-row items-center">
            {onSubir !== undefined ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Subir en el perfil"
                accessibilityState={{ disabled: !onSubir }}
                disabled={!onSubir}
                onPress={() => onSubir?.()}
                hitSlop={6}
                className="h-8 w-8 items-center justify-center rounded-full active:opacity-60"
                style={{ opacity: onSubir ? 1 : 0.3 }}
              >
                <IconChevronUp size={15} color={ICON_COLOR.muted} />
              </Pressable>
            ) : null}
            {onBajar !== undefined ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Bajar en el perfil"
                accessibilityState={{ disabled: !onBajar }}
                disabled={!onBajar}
                onPress={() => onBajar?.()}
                hitSlop={6}
                className="h-8 w-8 items-center justify-center rounded-full active:opacity-60"
                style={{ opacity: onBajar ? 1 : 0.3 }}
              >
                <IconChevronDown size={15} color={ICON_COLOR.muted} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sacar del perfil"
              onPress={() => onRemove(showcase.id)}
              hitSlop={6}
              className="h-8 w-8 items-center justify-center rounded-full active:opacity-60"
            >
              <IconClose size={14} color={ICON_COLOR.muted} />
            </Pressable>
          </View>
        ) : null}

        {showcase.kind === 'texto' ? (
          <Text className="text-foreground text-[15px] leading-6">{showcase.texto}</Text>
        ) : showcase.kind === 'ilustracion' ? (
          <VitrinaIlustracion path={showcase.path} alto={showcase.alto} />
        ) : showcase.kind === 'lista' ? (
          <VitrinaLista
            playlistId={showcase.playlistId}
            playlists={playlists}
            onOpen={onOpenPlaylist}
          />
        ) : (
          <VitrinaCancion
            showcase={showcase}
            playing={playing}
            onTogglePlay={onTogglePlay}
          />
        )}
      </View>
    </Glass>
  )
}

/**
 * Una canción fijada, o un fragmento.
 *
 * La diferencia entre las dos no es de forma sino de qué suena: la canción
 * entera arranca de cero, el fragmento del recorte que elegiste. Por eso
 * comparten el dibujo y solo cambia el rótulo.
 */
function VitrinaCancion({
  showcase,
  playing,
  onTogglePlay,
}: {
  showcase: Extract<Showcase, { kind: 'cancion' | 'fragmento' }>
  playing: boolean
  onTogglePlay: (id: string, song: SongSnippet) => void
}) {
  const c = showcase.cancion
  const tapa = artworkSource(c.artworkPath ?? undefined, c.artworkUrl, 320)
  const esFragmento = showcase.kind === 'fragmento'

  /* Lo que entiende el reproductor de fragmentos, que ya existe y es el mismo
     que suena en el chat. Una canción entera es un recorte que empieza en cero
     y dura todo. */
  const song: SongSnippet = {
    videoId: c.videoId,
    title: c.title,
    artist: c.artist,
    artworkUrl: c.artworkUrl,
    artworkPath: c.artworkPath ?? undefined,
    path: c.audioPath,
    startMs: c.startMs ?? 0,
    durationMs:
      esFragmento && c.startMs !== undefined && c.endMs !== undefined
        ? c.endMs - c.startMs
        : c.durationMs,
  }

  return (
    <View className="gap-3">
      <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
        {esFragmento ? 'Un fragmento' : 'En repeat'}
      </Text>

      <View className="flex-row items-center gap-3">
        {tapa ? (
          <Image source={{ uri: tapa }} className="h-16 w-16 rounded-lg bg-muted" />
        ) : (
          <View className="h-16 w-16 items-center justify-center rounded-lg bg-muted">
            <IconMusic size={20} color={ICON_COLOR.muted} />
          </View>
        )}

        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-foreground text-[16px] font-semibold" numberOfLines={1}>
            {c.title}
          </Text>
          <Text className="text-muted-foreground text-[13px]" numberOfLines={1}>
            {c.artist}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pausar' : `Escuchar ${c.title}`}
          onPress={() => onTogglePlay(showcase.id, song)}
          className="h-11 w-11 items-center justify-center rounded-full bg-primary active:opacity-80"
        >
          {playing ? (
            <IconPause size={16} color={ICON_COLOR.onPrimary} />
          ) : (
            <IconPlay size={16} color={ICON_COLOR.onPrimary} />
          )}
        </Pressable>
      </View>

      {/* La cava: quieta cuando no suena, latiendo cuando sí. */}
      <Cava seed={c.videoId} playing={playing} height={40} />
    </View>
  )
}

function VitrinaLista({
  playlistId,
  playlists,
  onOpen,
}: {
  playlistId: string
  playlists: Playlist[] | null
  onOpen: (playlistId: string) => void
}) {
  const lista = playlists?.find((p) => p.id === playlistId) ?? null

  /* Mientras la biblioteca no llegó no se dice nada; si llegó y la lista no
     está, se borró después de fijarla y el perfil lo dice en vez de mostrar un
     hueco mudo. */
  if (!playlists) return null
  if (!lista) {
    return (
      <Text className="text-muted-foreground text-[13px]">
        Esta lista ya no existe.
      </Text>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${lista.name}`}
      onPress={() => onOpen(lista.id)}
      className="gap-3 active:opacity-70"
    >
      <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
        Su lista
      </Text>
      <View className="flex-row items-center gap-3">
        <PlaylistCover covers={lista.covers} coverPath={lista.coverPath} size={64} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-foreground text-[16px] font-semibold" numberOfLines={1}>
            {lista.name}
          </Text>
          <Text className="text-muted-foreground text-[13px]">
            {lista.tracks} {lista.tracks === 1 ? 'canción' : 'canciones'}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

/**
 * Una ilustración: la pieza grande del perfil.
 *
 * Es la vitrina de Steam que ocupa el centro. No lleva rótulo ni marco interno
 * —la imagen habla sola— y por eso se dibuja al ras del borde de la tarjeta.
 *
 * La proporción viene guardada, así que el hueco se reserva **antes** de que la
 * imagen llegue: sin eso, el perfil entero pega un salto cuando termina de
 * cargar y lo que estabas mirando se te va de la pantalla.
 */
function VitrinaIlustracion({ path, alto }: { path: string; alto: number }) {
  const [ancho, setAncho] = useState(0)
  const uri = ilustracionUrl(path)
  const clip = esVideo(path)

  /*
   * El clip **se repite solo y va mudo**.
   *
   * Una vitrina es una imagen que se mueve, no un video que uno mira: no lleva
   * controles ni sonido. Y sobre todo mudo, porque esto vive en un perfil de una
   * app de música — que un clip pise la canción que está sonando es lo último
   * que uno quiere al entrar a mirar a alguien.
   *
   * El reproductor se crea igual aunque la vitrina sea una imagen: los hooks no
   * se pueden llamar condicionalmente, y sin fuente no hace nada.
   */
  const player = useVideoPlayer(clip ? uri : null, (p) => {
    p.loop = true
    p.muted = true
    p.play()
  })

  return (
    <View
      onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
      className="overflow-hidden rounded-lg bg-muted"
      style={{ height: ancho ? ancho * alto : undefined, aspectRatio: ancho ? undefined : 1 / alto }}
    >
      {clip ? (
        <VideoView
          player={player}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          nativeControls={false}
        />
      ) : (
        /* Un GIF lo anima el propio `Image` en iOS y en web; no hace falta
           nada más. */
        <Image source={{ uri }} className="h-full w-full" resizeMode="cover" />
      )}
    </View>
  )
}
