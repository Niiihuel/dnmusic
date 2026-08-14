import { Image, Pressable, Text, View } from 'react-native'
import type { SharedValue } from 'react-native-reanimated'
import { artworkSource } from '../lib/artwork'
import type { SongSnippet } from '../models/message'
import type { Showcase } from '../services/showcases'
import type { Playlist } from '../services/playlists'
import { Onda, ONDA_PENDIENTE, usePicos } from './Onda'
import { Glass, HAY_VIDRIO } from './Glass'
import { PlaylistCover } from './PlaylistCover'
import { formatClock } from './SeekBar'
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
  sonando,
  posicionMs,
  onTogglePlay,
  onSeek,
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
  /**
   * Esta vitrina es la cargada en el reproductor, suene o esté en pausa.
   *
   * Distinto de `playing`: al pausar, la onda tiene que seguir mostrando dónde
   * quedó. Si se vaciara, no habría forma de saberlo.
   */
  sonando?: boolean
  /** Posición del reproductor de fragmentos. Ver `Onda`. */
  posicionMs?: SharedValue<number>
  onTogglePlay: (id: string, song: SongSnippet) => void
  /** Mover la reproducción arrastrando la onda. Sin esto, la onda no se toca. */
  onSeek?: (id: string, song: SongSnippet, fraccion: number) => void
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
            sonando={sonando ?? playing}
            posicionMs={posicionMs}
            onTogglePlay={onTogglePlay}
            onSeek={onSeek}
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
  sonando,
  posicionMs,
  onTogglePlay,
  onSeek,
}: {
  showcase: Extract<Showcase, { kind: 'cancion' | 'fragmento' }>
  playing: boolean
  sonando: boolean
  posicionMs?: SharedValue<number>
  onTogglePlay: (id: string, song: SongSnippet) => void
  onSeek?: (id: string, song: SongSnippet, fraccion: number) => void
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

  /* La onda es la del tramo que suena: el recorte en un fragmento, el tema
     entero en una canción fijada. */
  const picos = usePicos(c.videoId, { desdeMs: song.startMs, durMs: song.durationMs })

  return (
    <View className="gap-3">
      <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
        {esFragmento ? 'Un fragmento' : 'En repeat'}
      </Text>

      <View className="flex-row items-center gap-3.5">
        {tapa ? (
          <Image source={{ uri: tapa }} className="h-[68px] w-[68px] rounded-xl bg-muted" />
        ) : (
          <View className="h-[68px] w-[68px] items-center justify-center rounded-xl bg-muted">
            <IconMusic size={22} color={ICON_COLOR.muted} />
          </View>
        )}

        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-foreground text-[17px] font-semibold" numberOfLines={1}>
            {c.title}
          </Text>
          <Text className="text-muted-foreground text-[13px]" numberOfLines={1}>
            {c.artist}
          </Text>
        </View>

        {/*
          El play es de vidrio y no un círculo blanco pintado.

          Sobre el fondo a sangre, un disco blanco opaco es la mancha más fuerte
          de la pantalla y se come la imagen que elegiste. El vidrio deja pasar
          lo que tiene detrás y sigue siendo lo más claro de la tarjeta, que es
          lo que un botón principal necesita. Sin vidrio queda el blanco de
          siempre, que es el respaldo correcto.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pausar' : `Escuchar ${c.title}`}
          onPress={() => onTogglePlay(showcase.id, song)}
          className="active:opacity-80"
        >
          {HAY_VIDRIO ? (
            <Glass radius={999} style={{ width: 48, height: 48 }}>
              <View className="h-full w-full items-center justify-center">
                {playing ? (
                  <IconPause size={17} color={ICON_COLOR.foreground} />
                ) : (
                  <IconPlay size={17} color={ICON_COLOR.foreground} />
                )}
              </View>
            </Glass>
          ) : (
            <View className="h-12 w-12 items-center justify-center rounded-full bg-primary">
              {playing ? (
                <IconPause size={17} color={ICON_COLOR.onPrimary} />
              ) : (
                <IconPlay size={17} color={ICON_COLOR.onPrimary} />
              )}
            </View>
          )}
        </Pressable>
      </View>

      {/*
        Mientras la onda no llegó, un riel y nada más.

        Antes acá se dibujaba la «cava»: unas barras gordas sacadas del
        identificador de la canción, que no tenían nada que ver con el audio.
        Duraban lo que tardaba el servicio en calcular la onda y después se
        cambiaban de golpe por la de verdad — dos dibujos distintos en el mismo
        lugar, que es exactamente lo que se ve como un error.

        El riel ocupa el mismo alto, así que nada salta cuando la onda entra, y
        no finge ser una forma que no conoce.
      */}
      {picos ? (
        <Onda
          picos={picos}
          posicionMs={posicionMs}
          desdeMs={song.startMs}
          duracionMs={song.durationMs}
          activa={sonando}
          onSeek={onSeek ? (f) => onSeek(showcase.id, song, f) : undefined}
          height={40}
          etiqueta={c.title}
        />
      ) : (
        <View className="justify-center" style={{ height: 40 }}>
          <View className="h-[3px] w-full rounded-full" style={{ backgroundColor: ONDA_PENDIENTE }} />
        </View>
      )}

      {/*
        De dónde sale el recorte, debajo de la onda.
        `1:04 – 1:19` es la mitad de la información de un fragmento y no estaba
        en ningún lado. Va acá y no arriba junto al rótulo porque arriba, en el
        editor, viven las flechas y la cruz de ordenar: se pisaban.
      */}
      <Text className="text-muted-foreground -mt-1 text-right text-[11px] tabular-nums">
        {esFragmento
          ? `${formatClock(song.startMs)} – ${formatClock(song.startMs + song.durationMs)}`
          : formatClock(song.durationMs)}
      </Text>
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
