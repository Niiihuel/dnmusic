import { useEffect, useState } from 'react'
import { Image, Pressable, Text, useWindowDimensions, View } from 'react-native'
import { artworkSource } from '../lib/artwork'
import { resolveSong, fetchAlbum, type AlbumInfo, type AlbumTrack } from '../services/music'
import {
  togglePlayback,
  toggleShuffle,
  usePlaybackTrack,
  useShuffle,
  useWantPlay,
} from '../state/playback'
import { CollectionHeader, CollectionTitle, useCoverSize } from './CollectionHeader'
import { useColorPortada } from '../lib/colorPortada'
import { useTecho } from '../state/shell'
import { addShowcase } from '../services/showcases'
import { getSupabase } from '../lib/supabase'
import { avisar } from '../state/aviso'
import { Menu, type MenuItem } from './Menu'
import { formatLength } from './SeekBar'
import { Skeleton, SkeletonList } from './Skeleton'
import { TrackColumnHeader, TrackRow } from './TrackRow'
import { BotonMeGusta } from './BotonMeGusta'
import { useMeGusta } from '../state/gustos'
import {
  ICON_COLOR,
  IconClose,
  IconMusic,
  IconPause,
  IconPlay,
  IconPlus,
  IconShuffle,
} from './icons'

/**
 * Un álbum o una lista de afuera, en el panel del medio.
 *
 * Se ve exactamente igual que una lista propia —misma tapa grande, mismo botón
 * redondo, misma tabla— porque para quien mira son lo mismo: canciones que se
 * pueden escuchar. Lo único que falta son las acciones de dueño: la tapa no se
 * cambia, el nombre no se edita y no hay nada que borrar, porque el álbum no es
 * nuestro. Por eso la tapa acá es una imagen y no un botón.
 */
export function AlbumPanel({
  albumId,
  kind,
  onPlay,
  onAdd,
  onPlayAll,
  onBack,
  menuFor,
  pendingId,
}: {
  albumId: string
  /** Álbum o lista: cambian de dónde se piden, no cómo se ven. */
  kind: 'album' | 'playlist'
  /** Con la lista entera y la posición: tocar una fila pone el disco desde ahí. */
  onPlay: (track: AlbumTrack, artworkUrl: string, tracks: AlbumTrack[], at: number) => void
  onAdd: (track: AlbumTrack, artworkUrl: string) => void
  onPlayAll?: (tracks: AlbumTrack[], artworkUrl: string) => void
  onBack?: () => void
  /**
   * Las opciones de los tres puntos de una canción.
   *
   * Las mismas que en el buscador, en una lista tuya y en la página de un
   * artista: una canción ofrece lo mismo en toda la app, esté guardada o no.
   * Las arma la pantalla porque dependen de qué listas tenés.
   */
  menuFor?: (track: AlbumTrack, artworkUrl: string) => MenuItem[]
  /** Canción que se está resolviendo, para mostrarla ocupada. */
  pendingId: string | null
}) {
  const [loaded, setLoaded] = useState<{ id: string; info: AlbumInfo | null } | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const cover = useCoverSize()
  /** En el teléfono la fila deja de ser una tabla. Ver `TrackRow`. */
  const suelto = useWindowDimensions().width < 780
  const fresh = loaded?.id === albumId

  /*
   * Acá no hay cola propia como en una lista: cada canción se manda suelta a la
   * barra. Así que «cuál suena» no es un índice sino la que está cargada, y se
   * la reconoce por su id de video.
   */
  const sounding = usePlaybackTrack()
  const soundingPlay = useWantPlay()
  /* El aleatorio es global —una sola cola suena a la vez—, como en una lista
     propia: se lee del store por su selector y no viaja como prop. */
  const aleatorio = useShuffle()
  const techo = useTecho()
  /* El color de la cabecera sale de la tapa; se lee antes de los returns de
     carga para no romper el orden de hooks. Ver `useColorPortada`. */
  const tapaUri = loaded?.info
    ? artworkSource(loaded.info.artworkPath, loaded.info.artworkUrl, 640)
    : null
  const tint = useColorPortada(tapaUri)

  useEffect(() => {
    if (fresh) return
    const controller = new AbortController()
    const id = albumId
    fetchAlbum(id, controller.signal, kind).then((info) => setLoaded({ id, info }))
    return () => controller.abort()
  }, [albumId, kind, fresh])

  if (!fresh) {
    return (
      <View className="gap-4 px-6 pb-5 pt-6">
        <Skeleton width="100%" height={220} radius={12} />
        <SkeletonList rows={5} />
      </View>
    )
  }

  const album = loaded.info
  if (!album) {
    return (
      <View className="items-center gap-3 px-8 py-10">
        <IconMusic size={22} color={ICON_COLOR.muted} />
        <Text className="text-muted-foreground text-center text-[13px] leading-5">
          No pude traer {kind === 'album' ? 'este álbum' : 'esta lista'}. Puede que YouTube no lo
          esté publicando.
        </Text>
      </View>
    )
  }

  const tapa = artworkSource(album.artworkPath, album.artworkUrl, 640)
  const total = album.tracks.length
  const totalMs = album.tracks.reduce((sum, t) => sum + t.durationMs, 0)
  const ids = new Set(album.tracks.map((t) => t.videoId))
  /* Algo de este álbum está en la barra: el botón grande pasa a ser pausa, como
     en una lista propia, en vez de arrancar de cero lo que ya está sonando. */
  const mine = sounding !== null && ids.has(sounding.videoId)

  /** Fijar el álbum en el perfil. Solo álbumes: una lista ajena de YouTube no
   *  es una pieza que el perfil sepa contar. */
  async function fijarAlbum() {
    const { data } = await getSupabase().auth.getUser()
    const me = data.user?.id
    if (!me || !album) return
    try {
      await addShowcase(
        me,
        'album',
        {
          albumId,
          titulo: album.title,
          artista: album.artist,
          tapaUrl: album.artworkUrl,
        },
        'mitad',
      )
      avisar(`«${album.title}» quedó en tu perfil`)
    } catch {
      avisar('No se pudo fijar el álbum', true)
    }
  }

  const menu: MenuItem[] = [
    ...(kind === 'album'
      ? [
          {
            label: 'Fijar en mi perfil',
            onPress: () => void fijarAlbum(),
            icon: <IconMusic size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'pin' as const,
          },
        ]
      : []),
    ...(onBack
      ? [
          {
            label: kind === 'album' ? 'Cerrar el álbum' : 'Cerrar la lista',
            onPress: onBack,
            icon: <IconClose size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'xmark' as const,
          },
        ]
      : []),
  ]

  return (
    <View className="pb-6">
      <CollectionHeader
        kind={kind === 'album' ? 'Álbum' : 'Lista'}
        tint={tint}
        bleedTop={techo}
        title={<CollectionTitle>{album.title}</CollectionTitle>}
        meta={[
          album.artist,
          album.subtitle,
          `${total} ${total === 1 ? 'canción' : 'canciones'}`,
          totalMs > 0 ? formatLength(totalMs) : '',
        ]
          .filter(Boolean)
          .join(' · ')}
        image={
          tapa ? (
            <Image
              source={{ uri: tapa }}
              className="rounded-lg bg-card"
              style={{ width: cover, height: cover }}
            />
          ) : (
            <View
              className="items-center justify-center rounded-lg bg-card"
              style={{ width: cover, height: cover }}
            >
              <IconMusic size={26} color={ICON_COLOR.muted} />
            </View>
          )
        }
        actions={
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={mine && soundingPlay ? 'Pausar' : `Reproducir ${album.title}`}
              onPress={() => {
                if (mine) togglePlayback()
                else if (onPlayAll && total > 0) onPlayAll(album.tracks, album.artworkUrl)
              }}
              disabled={total === 0 || (!mine && !onPlayAll)}
              className={`h-14 w-14 items-center justify-center rounded-full ${
                total === 0 ? 'bg-muted' : 'bg-primary active:opacity-80'
              }`}
            >
              {mine && soundingPlay ? (
                <IconPause
                  size={20}
                  color={total === 0 ? ICON_COLOR.muted : ICON_COLOR.onPrimary}
                />
              ) : (
                <IconPlay size={20} color={total === 0 ? ICON_COLOR.muted : ICON_COLOR.onPrimary} />
              )}
            </Pressable>

            {/* Lineal o aleatorio, al lado de reproducir: la misma decisión y
                el mismo lenguaje que en una lista propia — encendido es el
                blanco de acento, apagado el gris (docs/DESIGN.md). */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={aleatorio ? 'Reproducir en orden' : 'Reproducir al azar'}
              accessibilityState={{ selected: aleatorio }}
              onPress={toggleShuffle}
              disabled={total === 0}
              className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
            >
              <IconShuffle
                size={19}
                color={
                  total === 0
                    ? ICON_COLOR.muted
                    : aleatorio
                      ? ICON_COLOR.foreground
                      : ICON_COLOR.muted
                }
              />
            </Pressable>

            {menu.length ? (
              <Menu items={menu} label={`Opciones de ${album.title}`} size={17} />
            ) : null}
          </>
        }
      />

      {total > 0 ? <TrackColumnHeader trailing={72} /> : null}

      <View className="gap-1">
        {album.tracks.map((track, i) => {
          const esta = sounding?.videoId === track.videoId
          return (
            <TrackRow
              key={track.videoId}
              index={i}
              title={track.title}
              artist={track.artist}
              artwork={tapa}
              durationMs={track.durationMs}
              gusto={<GustoAlbum track={track} album={album} />}
              sounding={esta}
              playing={esta && soundingPlay}
              busy={pendingId === track.videoId}
              hovered={hovered === track.videoId}
              onHover={(on) => setHovered(on ? track.videoId : null)}
              /* Ya suena esta canción: tocarla pausa o sigue, en vez de
                 volver a resolverla y arrancarla de cero. */
              onPlay={() =>
                esta ? togglePlayback() : onPlay(track, album.artworkUrl, album.tracks, i)
              }
              /*
               * En escritorio los dos huecos existen siempre y solo se llenan
               * bajo el cursor: si aparecieran de la nada, la fila entera se
               * correría al pasar por encima.
               *
               * En el teléfono queda solo el menú, y siempre visible. El «+»
               * ahí sobra: adentro del menú ya están «Agregar a…» y «Nueva
               * lista con esta canción», y su hueco de 36px es ancho que le
               * falta al título.
               */
              /* La misma lista por los dos caminos: el botón y el gesto. */
              menu={menuFor ? menuFor(track, album.artworkUrl) : undefined}
              trailing={
                <>
                  <View className={suelto ? '' : 'w-9 items-center'}>
                    {menuFor ? (
                      <Menu
                        items={menuFor(track, album.artworkUrl)}
                        label={`Opciones de ${track.title}`}
                        size={14}
                      />
                    ) : null}
                  </View>
                  {suelto ? null : (
                    <View className="w-9 items-center">
                      {hovered === track.videoId ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Agregar ${track.title}`}
                          onPress={() => onAdd(track, album.artworkUrl)}
                          className="h-7 w-7 items-center justify-center active:opacity-60"
                        >
                          <IconPlus size={15} color={ICON_COLOR.foreground} />
                        </Pressable>
                      ) : null}
                    </View>
                  )}
                </>
              }
            />
          )
        })}
      </View>
    </View>
  )
}


/** Resuelve y guarda sin tocar la cola ni la intención de reproducción. */
function GustoAlbum({ track, album }: { track: AlbumTrack; album: AlbumInfo }) {
  const guardada = useMeGusta().find(t => t.videoId === track.videoId)
  const base = {
    ...track, id: `gusta:${track.videoId}`, artistId: null,
    artworkUrl: album.artworkUrl, artworkPath: album.artworkPath,
    audioPath: '', truePeak: undefined,
  }
  return <BotonMeGusta track={guardada ?? base} size={18} lado={44}
    resolver={async () => {
      const audio = await resolveSong({ ...track, artistId: null, album: album.title, albumId: null, artworkUrl: album.artworkUrl })
      return { ...base, audioPath: audio.path, artworkPath: audio.artworkPath ?? album.artworkPath, durationMs: audio.durationMs || track.durationMs }
    }} />
}
