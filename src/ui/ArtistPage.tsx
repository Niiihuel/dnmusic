import { superficieInteractivaWeb, artworkInteractivoWeb } from './estadoControl'
import { BotonSuperficie } from './BotonSuperficie'
import { IconButton } from './IconButton'
import { useEffect, useState } from 'react'
import { Image, Platform, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
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
import { useColorPortada } from '../lib/colorPortada'
import { useTecho } from '../state/shell'
import { addShowcase } from '../services/showcases'
import { getSupabase } from '../lib/supabase'
import { avisar } from '../state/aviso'
import { MantenerApretado, Menu, type MenuItem } from './Menu'
import { Skeleton, SkeletonList } from './Skeleton'
import { TrackRow } from './TrackRow'
import { ICON_COLOR, IconClose, IconMusic, IconPause, IconPlay, IconUser } from './icons'

/** Debajo de esto, el top de canciones va en una columna sola. */
const TWO_COLUMNS_AT = 720

/**
 * A partir de esta proporción, la foto del artista **es un banner**.
 *
 * YouTube Music no tiene un avatar cuadrado del artista: lo que da es la
 * portada del canal, que suele venir a 2880×1200 (2,4:1). Con menos que esto,
 * la foto es lo bastante cuadrada como para que el redondel del referente
 * funcione.
 */
const BANNER_DESDE = 1.4
/** Hasta acá crece el banner: más alto y el nombre se va de la primera pantalla. */
const BANNER_MAX = 280

/**
 * La página de un artista.
 *
 * Es la tercera pantalla del panel del medio, hermana de la lista propia y del
 * álbum: misma cabecera —imagen grande, tipo en versalitas, título enorme,
 * botón redondo— para que moverse entre las tres no se sienta como cambiar de
 * app.
 *
 * **La foto es la excepción, y por lo que da la fuente.** El redondel de la
 * lista y del álbum sale de una imagen cuadrada; lo que YouTube Music entrega
 * de un artista es la portada del canal, apaisada 2,4:1. Meterla en un círculo
 * recorta el cuadrado del centro, y cuando esa portada es un primer plano el
 * resultado es una cara ampliada y cortada al ras — la queja textual fue «tiene
 * mucho zoom». Así que una foto apaisada se muestra apaisada, de borde a borde
 * y con el nombre encima, que además es como la muestra YouTube Music. La que
 * viene cuadrada sigue redonda, en la cabecera compartida de siempre.
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
  const [width, setWidth] = useState(0)
  const foto = useCoverSize()
  const fresh = loaded?.id === artistId

  const sounding = usePlaybackTrack()
  const soundingPlay = useWantPlay()
  const techo = useTecho()
  /* El tinte de la cabecera sale de la foto; se lee antes de los returns de
     carga para no romper el orden de hooks. Ver `useColorPortada`. */
  const fotoUri = loaded?.info
    ? artworkSource(loaded.info.photoPath, loaded.info.photoUrl, 1024)
    : null
  const tint = useColorPortada(fotoUri)

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
        <Text className="text-muted-foreground text-center text-footnote leading-5">
          No pude traer este artista. Puede que YouTube no lo esté publicando.
        </Text>
      </View>
    )
  }

  /* Se pide grande —no 320— porque de borde a borde en un panel de escritorio
     eso se veía blando. La copia de Storage ya viene con la proporción real
     (ver `atStoreSize` en el servicio), así que no hay nada que corregir acá. */
  const photo = artworkSource(artist.photoPath, artist.photoUrl, 1024)
  const apaisada = (artist.photoAspect ?? 1) >= BANNER_DESDE
  const top = artist.topSongs
  const ids = new Set(top.map((s) => s.videoId))
  const mine = sounding !== null && ids.has(sounding.videoId)

  /**
   * Fijar este artista en el perfil, con todo desnormalizado: la vitrina no
   * vuelve a preguntar por él. Mismo camino que «Fijar en mi perfil» de una
   * lista (`PlaylistView.fijarLista`).
   */
  async function fijarArtista() {
    const { data } = await getSupabase().auth.getUser()
    const me = data.user?.id
    if (!me || !artist) return
    try {
      await addShowcase(
        me,
        'artista',
        { artistId, nombre: artist.name, fotoUrl: artist.photoUrl },
        'mitad',
      )
      avisar(`${artist.name} quedó en tu perfil`)
    } catch {
      avisar('No se pudo fijar el artista', true)
    }
  }

  const menu: MenuItem[] = [
    {
      label: 'Fijar en mi perfil',
      onPress: () => void fijarArtista(),
      icon: <IconUser size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'pin',
    },
    ...(onBack
      ? [
          {
            label: 'Cerrar el artista',
            onPress: onBack,
            icon: <IconClose size={15} color={ICON_COLOR.muted} />,
            sfSymbol: 'xmark' as const,
          },
        ]
      : []),
  ]

  /*
   * En dos columnas cuando hay lugar, como en la referencia: cinco canciones
   * apiladas dejan medio panel vacío al lado. Se mide el ancho real y no el de
   * la ventana porque el panel del medio se puede agrandar y achicar.
   */
  const columns = width >= TWO_COLUMNS_AT ? 2 : 1
  const perColumn = Math.ceil(top.length / columns)

  const meta = artist.subscribers ? `${artist.subscribers} de oyentes` : undefined
  const acciones = (
    <>
      <IconButton label={
          mine && soundingPlay ? 'Pausar' : `Reproducir lo más escuchado de ${artist.name}`
        } symbol={mine && soundingPlay ? 'pause.fill' : 'play.fill'} onPress={() => {
          if (mine) togglePlayback()
          else if (top[0]) onPlaySong(top[0])
        }} disabled={top.length === 0} lado={56} size={20} variant="primary" icon={mine && soundingPlay ? (
          <IconPause size={20} color={top.length === 0 ? ICON_COLOR.muted : ICON_COLOR.onPrimary} />
        ) : (
          <IconPlay size={20} color={top.length === 0 ? ICON_COLOR.muted : ICON_COLOR.onPrimary} />
        )} />

      {menu.length ? <Menu items={menu} label={`Opciones de ${artist.name}`} size={17} /> : null}
    </>
  )

  return (
    <View className="pb-6" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {photo && apaisada ? (
        <Banner
          photo={photo}
          bleedTop={techo}
          aspect={artist.photoAspect ?? 16 / 9}
          nombre={artist.name}
          meta={meta}
          acciones={acciones}
        />
      ) : (
      <CollectionHeader
        kind="Artista"
        tint={tint}
        bleedTop={techo}
        title={<CollectionTitle>{artist.name}</CollectionTitle>}
        meta={meta}
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
        actions={acciones}
      />
      )}

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
                      inset={false}
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

      <Releases title="Álbumes" items={artist.albums} width={width} onOpen={onOpenAlbum} />
      <Releases title="Simples" items={artist.singles} width={width} onOpen={onOpenAlbum} />
    </View>
  )
}

/**
 * La cabecera cuando la foto es apaisada: la portada del canal, de borde a
 * borde, con el nombre apoyado encima.
 *
 * Es la forma que ya tiene la ficha del panel derecho (`ArtistCard`) llevada a
 * la pantalla grande, y la misma que usa YouTube Music. La alternativa era
 * recortarle un cuadrado al banner para meterlo en el redondel del álbum, que
 * es de donde salía el zoom.
 *
 * **La imagen se disuelve contra el panel** en vez de cortarse contra una
 * línea: el degradado termina exactamente en `background`, así que no hay
 * borde, que es la regla de `docs/DESIGN.md` — separar por luminancia, nunca
 * por línea. Y de paso ese mismo velo es lo que vuelve legible el nombre
 * encima, sin importar qué foto haya puesto el artista.
 *
 * El alto sale del ancho real del panel y de la proporción de la foto, topado:
 * un 2,4:1 en una ventana de 1400px serían 580px de banner antes de la primera
 * canción. Con el tope, `cover` recorta arriba y abajo — que es exactamente
 * para lo que está pensada una portada de canal.
 */
function Banner({
  photo,
  bleedTop = 0,
  aspect,
  nombre,
  meta,
  acciones,
}: {
  photo: string
  bleedTop?: number
  aspect: number
  nombre: string
  meta?: string
  acciones: React.ReactNode
}) {
  const [ancho, setAncho] = useState(0)
  // Mientras no se midió, un alto razonable: sin esto el banner nace en 0 y
  // salta a su medida en el primer cuadro, que se lee como un parpadeo.
  const alto = ancho ? Math.min(BANNER_MAX, Math.round(ancho / aspect)) : 220

  return (
    <View>
      <View
        onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
        style={{ height: alto + bleedTop, marginTop: -bleedTop }}
        className="justify-end overflow-hidden bg-card"
      >
        <Image
          source={{ uri: photo }}
          resizeMode="cover"
          accessibilityLabel={`Foto de ${nombre}`}
          style={StyleSheet.absoluteFill}
        />
        {/* Del aire al fondo del panel. Los colores van literales porque
            LinearGradient no lee variables CSS: #121212 es `background`. */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(18,18,18,0)', 'rgba(18,18,18,0.72)', '#121212']}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View className="gap-1 px-6 pb-4">
          <Text className="text-muted-foreground text-footnote uppercase">
            Artista
          </Text>
          <CollectionTitle>{nombre}</CollectionTitle>
          {meta ? (
            <Text className="text-muted-foreground text-footnote" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
      </View>
      <View className="flex-row items-center gap-3 px-6 pb-5 pt-4">{acciones}</View>
    </View>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text className="text-foreground px-6 text-title3 font-bold">{children}</Text>
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
  width,
  onOpen,
}: {
  title: string
  items: HomeItem[]
  width: number
  onOpen: (item: HomeItem) => void
}) {
  /*
   * El panel central cambia de ancho independientemente de la ventana. Con el
   * ancho de la ventana, las tapas terminaban demasiado grandes y solo cabían
   * dos en un panel donde entran tres. Cuando hay uno o dos lanzamientos en
   * escritorio, se usan tarjetas horizontales para ocupar la fila sin agrandar
   * las portadas hasta media pantalla.
   */
  const PAD = 24
  const GAP = 16
  // Hasta el primer onLayout se usa el ancho de un teléfono para evitar
  // tamaños negativos y un primer cuadro vacío.
  const disponible = Math.max(0, (width || 390) - PAD * 2)
  const horizontal = disponible >= 640 && items.length <= 2
  const columnas = horizontal ? items.length : disponible < 640 ? 2 : disponible < 1000 ? 3 : 4
  const lado = columnas > 0 ? Math.max(1, Math.floor((disponible - GAP * (columnas - 1)) / columnas)) : 0

  if (!items.length) return null
  return (
    <View className="gap-3 pt-4">
      <SectionTitle>{title}</SectionTitle>
      <View className="flex-row flex-wrap gap-4 px-6">
        {items.map((item) => (
          <Tile key={item.id} item={item} lado={lado} horizontal={horizontal} onPress={() => onOpen(item)} />
        ))}
      </View>
    </View>
  )
}

function Tile({ item, lado, horizontal, onPress }: { item: HomeItem; lado: number; horizontal: boolean; onPress: () => void }) {
  const [over, setOver] = useState(false)
  const tapa = horizontal ? Math.min(152, Math.floor(lado * 0.43)) : lado
  return (
    <MantenerApretado items={[{ label: 'Ir al álbum', sfSymbol: 'square.stack', onPress }]}
      preview={{ title: item.title, subtitle: item.subtitle ?? 'Álbum', detail: item.year ? String(item.year) : undefined,
        artwork: item.artworkUrl ? proxiedImage(item.artworkUrl) : undefined }} onPreviewPress={onPress}>
    <BotonSuperficie
      {...superficieInteractivaWeb('card')}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={onPress}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
      style={{ width: lado }}
      className={horizontal ? 'flex-row items-center gap-4 rounded-lg bg-card p-3' : 'gap-2'}
    >
      <View className="overflow-hidden rounded-lg bg-card" style={{ width: tapa, height: tapa }}>
        {item.artworkUrl ? (
          <Image {...artworkInteractivoWeb()}
            source={{ uri: proxiedImage(artworkUrlAtSize(item.artworkUrl, 400)) }}
            style={{ width: tapa, height: tapa, opacity: Platform.OS === 'web' ? 1 : over ? 0.75 : 1 }}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <IconMusic size={26} color={ICON_COLOR.muted} />
          </View>
        )}
      </View>
      <View className={horizontal ? 'min-w-0 flex-1 gap-0.5' : 'gap-0.5'}>
        <Text className="text-foreground text-footnote font-semibold" numberOfLines={2}>
          {item.title}
        </Text>
        {item.year ? <Text className="text-muted-foreground text-caption1">{item.year}</Text> : null}
      </View>
    </BotonSuperficie>
    </MantenerApretado>
  )
}
