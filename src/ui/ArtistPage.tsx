import { useEffect, useState } from 'react'
import { Image, Pressable, Text, useWindowDimensions, View } from 'react-native'
import { artworkSource, artworkUrlAtSize } from '../lib/artwork'
import {
  fetchArtist,
  proxiedImage,
  type ArtistInfo,
  type ArtistSong,
  type HomeItem,
} from '../services/music'
import { togglePlayback, usePlaybackTrack, useWantPlay } from '../state/playback'
import { CollectionHeader, CollectionTitle, useCoverSize } from './CollectionHeader'
import { Menu, type MenuItem } from './Menu'
import { Skeleton, SkeletonList } from './Skeleton'
import { TrackRow } from './TrackRow'
import { ICON_COLOR, IconClose, IconMusic, IconPause, IconPlay, IconUser } from './icons'

/** Debajo de esto, el top de canciones va en una columna sola. */
const TWO_COLUMNS_AT = 720

/**
 * La página de un artista.
 *
 * Es la tercera pantalla del panel del medio, hermana de la lista propia y del
 * álbum: misma cabecera —imagen grande, tipo en versalitas, título enorme,
 * botón redondo— para que moverse entre las tres no se sienta como cambiar de
 * app. Lo único distinto es la forma de la imagen: los artistas son redondos en
 * todos lados, y acá también.
 *
 * Debajo va lo que uno viene a buscar, en el orden en que lo busca: lo más
 * escuchado primero, la discografía después.
 */
export function ArtistPage({
  artistId,
  onPlaySong,
  onOpenAlbum,
  onBack,
  menuForSong,
  pendingId,
}: {
  artistId: string
  onPlaySong: (song: ArtistSong) => void
  onOpenAlbum: (item: HomeItem) => void
  onBack?: () => void
  /** Las opciones de los tres puntos de una canción; las arma la pantalla. */
  menuForSong: (song: ArtistSong) => MenuItem[]
  /** Canción que se está resolviendo, para mostrarla ocupada. */
  pendingId: string | null
}) {
  const [loaded, setLoaded] = useState<{ id: string; info: ArtistInfo | null } | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [width, setWidth] = useState(0)
  const foto = useCoverSize()
  const fresh = loaded?.id === artistId

  const sounding = usePlaybackTrack()
  const soundingPlay = useWantPlay()

  useEffect(() => {
    if (fresh) return
    const controller = new AbortController()
    const id = artistId
    fetchArtist(id, controller.signal).then((info) => setLoaded({ id, info }))
    return () => controller.abort()
  }, [artistId, fresh])

  if (!fresh) {
    return (
      <View className="gap-5 px-6 pb-6 pt-6">
        <Skeleton width={152} height={152} radius={76} />
        <Skeleton width="45%" height={34} />
        <SkeletonList rows={5} />
      </View>
    )
  }

  const artist = loaded.info
  if (!artist) {
    return (
      <View className="items-center gap-3 px-8 py-10">
        <IconUser size={22} color={ICON_COLOR.muted} />
        <Text className="text-muted-foreground text-center text-[13px] leading-5">
          No pude traer este artista. Puede que YouTube no lo esté publicando.
        </Text>
      </View>
    )
  }

  const photo = artworkSource(artist.photoPath, artist.photoUrl, 320)
  const top = artist.topSongs
  const ids = new Set(top.map((s) => s.videoId))
  const mine = sounding !== null && ids.has(sounding.videoId)

  const menu: MenuItem[] = onBack
    ? [
        {
          label: 'Cerrar el artista',
          onPress: onBack,
          icon: <IconClose size={15} color={ICON_COLOR.muted} />,
          sfSymbol: 'xmark',
        },
      ]
    : []

  /*
   * En dos columnas cuando hay lugar, como en la referencia: cinco canciones
   * apiladas dejan medio panel vacío al lado. Se mide el ancho real y no el de
   * la ventana porque el panel del medio se puede agrandar y achicar.
   */
  const columns = width >= TWO_COLUMNS_AT ? 2 : 1
  const perColumn = Math.ceil(top.length / columns)

  return (
    <View className="pb-6" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <CollectionHeader
        kind="Artista"
        title={<CollectionTitle>{artist.name}</CollectionTitle>}
        meta={artist.subscribers ? `${artist.subscribers} de oyentes` : undefined}
        image={
          photo ? (
            <Image
              source={{ uri: photo }}
              className="bg-card"
              style={{ width: foto, height: foto, borderRadius: foto / 2 }}
            />
          ) : (
            <View
              className="items-center justify-center rounded-full bg-card"
              style={{ width: foto, height: foto }}
            >
              <IconUser size={30} color={ICON_COLOR.muted} />
            </View>
          )
        }
        actions={
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                mine && soundingPlay ? 'Pausar' : `Reproducir lo más escuchado de ${artist.name}`
              }
              onPress={() => {
                if (mine) togglePlayback()
                else if (top[0]) onPlaySong(top[0])
              }}
              disabled={top.length === 0}
              className={`h-14 w-14 items-center justify-center rounded-full ${
                top.length === 0 ? 'bg-muted' : 'bg-primary active:opacity-80'
              }`}
            >
              {mine && soundingPlay ? (
                <IconPause
                  size={20}
                  color={top.length === 0 ? ICON_COLOR.muted : ICON_COLOR.onPrimary}
                />
              ) : (
                <IconPlay
                  size={20}
                  color={top.length === 0 ? ICON_COLOR.muted : ICON_COLOR.onPrimary}
                />
              )}
            </Pressable>

            {menu.length ? (
              <Menu items={menu} label={`Opciones de ${artist.name}`} size={17} />
            ) : null}
          </>
        }
      />

      {top.length ? (
        <View className="gap-2 pb-2">
          <SectionTitle>Top canciones</SectionTitle>
          <View className="flex-row gap-2 px-6">
            {Array.from({ length: columns }, (_, c) => (
              <View key={c} className="min-w-0 flex-1 gap-1">
                {top.slice(c * perColumn, (c + 1) * perColumn).map((song, i) => {
                  const esta = sounding?.videoId === song.videoId
                  return (
                    <TrackRow
                      key={song.videoId}
                      index={c * perColumn + i}
                      title={song.title}
                      /* El artista es siempre el mismo y repetirlo cinco veces
                         no dice nada; el disco y el año, sí. */
                      artist={[song.album, song.year].filter(Boolean).join(' · ')}
                      artwork={proxiedImage(artworkUrlAtSize(song.artworkUrl, 96))}
                      durationMs={song.durationMs}
                      sounding={esta}
                      playing={esta && soundingPlay}
                      busy={pendingId === song.videoId}
                      hovered={hovered === song.videoId}
                      inset={false}
                      onHover={(on) => setHovered(on ? song.videoId : null)}
                      onPlay={() => (esta ? togglePlayback() : onPlaySong(song))}
                      /* La misma lista por los dos caminos: el botón y el
                         mantener apretado. */
                      menu={menuForSong(song)}
                      /* Siempre: la fila decide si se ve. Ver `TrackRow`. */
                      trailing={
                        <Menu
                          items={menuForSong(song)}
                          label={`Opciones de ${song.title}`}
                          size={14}
                        />
                      }
                    />
                  )
                })}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <Releases title="Álbumes" items={artist.albums} onOpen={onOpenAlbum} />
      <Releases title="Simples" items={artist.singles} onOpen={onOpenAlbum} />
    </View>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text className="text-foreground px-6 text-[18px] font-bold">{children}</Text>
}

/**
 * Una grilla de tapas con su año debajo.
 *
 * Se ajusta sola en vez de desplazarse de costado como los carruseles de la
 * portada: la discografía de alguien es finita y verla entera de un vistazo es
 * justamente lo que uno quiere al entrar.
 */
function Releases({
  title,
  items,
  onOpen,
}: {
  title: string
  items: HomeItem[]
  onOpen: (item: HomeItem) => void
}) {
  /*
   * El lado de la tapa sale del ancho, no de un número fijo.
   *
   * Con 170px fijos, en un teléfono entraban dos por fila con las sobras
   * repartidas de cualquier manera; en una ventana ancha quedaban chiquitas al
   * lado de todo lo demás. Se elige cuántas entran y se reparte lo que hay.
   */
  const { width } = useWindowDimensions()
  const PAD = 24
  const GAP = 16
  const columnas = width < 640 ? 2 : width < 1100 ? 3 : 4
  const lado = Math.floor((Math.min(width, 1200) - PAD * 2 - GAP * (columnas - 1)) / columnas)

  if (!items.length) return null
  return (
    <View className="gap-3 pt-4">
      <SectionTitle>{title}</SectionTitle>
      <View className="flex-row flex-wrap gap-4 px-6">
        {items.map((item) => (
          <Tile key={item.id} item={item} lado={lado} onPress={() => onOpen(item)} />
        ))}
      </View>
    </View>
  )
}

function Tile({ item, lado, onPress }: { item: HomeItem; lado: number; onPress: () => void }) {
  const [over, setOver] = useState(false)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={onPress}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
      style={{ width: lado }}
      className="gap-2"
    >
      <View className="overflow-hidden rounded-lg bg-card" style={{ width: lado, height: lado }}>
        {item.artworkUrl ? (
          <Image
            source={{ uri: proxiedImage(artworkUrlAtSize(item.artworkUrl, 400)) }}
            style={{ width: lado, height: lado, opacity: over ? 0.75 : 1 }}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <IconMusic size={26} color={ICON_COLOR.muted} />
          </View>
        )}
      </View>
      <View className="gap-0.5">
        <Text className="text-foreground text-[13px] font-semibold" numberOfLines={2}>
          {item.title}
        </Text>
        {item.year ? <Text className="text-muted-foreground text-[12px]">{item.year}</Text> : null}
      </View>
    </Pressable>
  )
}
