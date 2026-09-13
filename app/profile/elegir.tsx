import { IconButton } from '../../src/ui/IconButton'
import { AccionSocial, CabeceraSocial } from '../../src/ui/Social'
import { fotoDelArtista } from '../../src/lib/fotoArtista'
import { useEffect, useState, type ReactNode } from 'react'
import { Image, Pressable, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { artworkRemoto, artworkSource, artworkUrlAtSize } from '../../src/lib/artwork'
import { mensajeError } from '../../src/lib/mensajeError'
import {
  proxiedImage,
  resolveSong,
  searchMusic,
  type ArtistResult,
  type TrackResult,
} from '../../src/services/music'
import type { PlaylistTrack } from '../../src/services/playlists'
import { ultimasEscuchas, type EscuchaReciente } from '../../src/services/plays'
import type { ShowcaseContenido } from '../../src/services/showcases'
import { avisar } from '../../src/state/aviso'
import { playQueue, togglePlayback, usePlaybackTrack, useWantPlay } from '../../src/state/playback'
import { useKeyboardH } from '../../src/state/shell'
import { actualizarBorrador, useBorrador } from '../../src/state/vitrinaBorrador'
import { EstadoTapa } from '../../src/ui/CoverState'
import { Hoja, useHojaModal, usePisoHoja } from '../../src/ui/Hoja'
import { Panel } from '../../src/ui/Panel'
import { SearchField } from '../../src/ui/SearchField'
import { SkeletonList } from '../../src/ui/Skeleton'
import { ICON_COLOR, IconMusic, IconUser, IconVolume } from '../../src/ui/icons'

const DEBOUNCE_MS = 250
const MAX_W = 620

/** Qué se elige. `letra` pide con qué firmar el verso: canción, artista o álbum. */
type Que = 'cancion' | 'artista' | 'album' | 'letra'

const TITULO: Record<Que, string> = {
  cancion: 'Buscar una canción',
  artista: 'Buscar un artista',
  album: 'Buscar un álbum',
  letra: 'De qué canción es',
}

/**
 * Las pestañas de la búsqueda de un verso. Un verso se firma casi siempre con
 * la canción, pero también vale el artista solo —queda «— Artista»— o el
 * álbum; por eso acá, y solo acá, la búsqueda se parte como en Airbuds.
 */
type Pestana = 'todo' | 'canciones' | 'artistas' | 'albumes'

const PESTANAS: { id: Pestana; rotulo: string }[] = [
  { id: 'todo', rotulo: 'Todo' },
  { id: 'canciones', rotulo: 'Canciones' },
  { id: 'artistas', rotulo: 'Artistas' },
  { id: 'albumes', rotulo: 'Álbumes' },
]

/** Cuántas filas muestra cada sección en «Todo» antes del «Ver más». */
const MUESTRA = 3

/** Un álbum sacado de los resultados: las canciones traen el suyo. */
type AlbumHallado = { albumId: string; titulo: string; artista: string; tapaUrl: string }

/** Una escucha reciente, tal como la guarda `plays`. */
type Reciente = EscuchaReciente

/**
 * Elegir la música de una vitrina: una canción, un artista o un álbum.
 *
 * Es el buscador de Airbuds para el Space: el campo arriba, y mientras está
 * vacío **lo último que escuchaste** —que es de donde casi siempre sale lo
 * que uno quiere fijar—. Los álbumes no tienen búsqueda propia: se sacan de
 * las canciones que aparecen, sin repetir.
 *
 * Elegir escribe en el borrador y vuelve al editor. Una canción se resuelve
 * antes —la vitrina necesita el camino del audio para sonar sola desde el
 * perfil—; para firmar un verso no hace falta: alcanza con el título, y
 * hasta con el artista o el álbum solos, que por eso tienen pestaña propia.
 */
export default function ElegirMusica() {
  const router = useRouter()
  const { que: pedido, desde } = useLocalSearchParams<{ que?: string; desde?: string }>()
  const que: Que =
    pedido === 'artista' ? 'artista' : pedido === 'album' ? 'album' : pedido === 'letra' ? 'letra' : 'cancion'
  const piso = usePisoHoja(24)
  const teclado = useKeyboardH()
  /* Ventana en escritorio, como el editor: ver `useHojaModal`. */
  const modal = useHojaModal()
  const borrador = useBorrador()

  const [termino, setTermino] = useState('')
  const [hallado, setHallado] = useState<{
    termino: string
    tracks: TrackResult[]
    artists: ArtistResult[]
  } | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* La canción que se está resolviendo: para elegirla o para escucharla. */
  const [ocupada, setOcupada] = useState<string | null>(null)
  const [recientes, setRecientes] = useState<Reciente[] | null>(null)
  /* Solo para `letra`: qué parte de los resultados se mira. */
  const [pestana, setPestana] = useState<Pestana>('todo')

  const sonando = usePlaybackTrack()
  const suena = useWantPlay()

  useEffect(() => {
    let vivo = true
    ultimasEscuchas()
      .then((r) => vivo && setRecientes(r))
      .catch(() => vivo && setRecientes([]))
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => {
    const t = termino.trim()
    if (!t) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setCargando(true)
      searchMusic(t, controller.signal)
        .then(({ tracks, artists }) => {
          setHallado({ termino: t, tracks, artists })
          setError(tracks.length || artists.length ? null : 'No encontré nada con eso.')
          setCargando(false)
        })
        .catch((causa: unknown) => {
          if ((causa as Error).name === 'AbortError') return
          setError('No se pudo buscar.')
          setCargando(false)
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [termino])

  const buscando = termino.trim().length > 0
  const resultados = hallado?.termino === termino.trim() ? hallado : null

  /* Borrar el término devuelve a «Todo»: la pestaña era de esa búsqueda. */
  function escribir(t: string) {
    setTermino(t)
    if (!t.trim()) setPestana('todo')
  }

  function terminar(contenido: ShowcaseContenido) {
    actualizarBorrador({ contenido })
    /* Desde el editor, volver es llegar a él; desde la hoja de «+» —que ya se
       fue— el editor todavía no existe y se abre en el lugar de esta. */
    if (desde === 'editor' && router.canGoBack()) router.back()
    else router.replace('/profile/vitrina')
  }

  async function elegirCancion(track: TrackResult) {
    if (ocupada) return
    if (que === 'letra') {
      terminar({
        kind: 'letra',
        letra: {
          texto: versoEscrito(),
          title: track.title,
          artist: track.artist,
          artworkUrl: track.artworkUrl,
        },
      })
      return
    }
    setOcupada(track.videoId)
    try {
      const song = await resolveSong(track)
      terminar({
        kind: 'cancion',
        cancion: {
          videoId: track.videoId,
          title: track.title,
          artist: track.artist,
          artworkUrl: track.artworkUrl,
          artworkPath: song.artworkPath ?? null,
          audioPath: song.path,
          durationMs: song.durationMs || track.durationMs,
        },
      })
    } catch (e) {
      avisar(`No se pudo preparar: ${mensajeError(e)}`, true)
    } finally {
      setOcupada(null)
    }
  }

  /** Escuchar antes de decidir: suena en el reproductor de siempre. */
  async function escuchar(track: TrackResult) {
    if (sonando?.videoId === track.videoId) {
      togglePlayback()
      return
    }
    setOcupada(track.videoId)
    try {
      const song = await resolveSong(track)
      const pista: PlaylistTrack = {
        id: track.videoId,
        videoId: track.videoId,
        title: track.title,
        artist: track.artist,
        artistId: track.artistId,
        artworkUrl: track.artworkUrl,
        artworkPath: song.artworkPath ?? null,
        audioPath: song.path,
        durationMs: song.durationMs || track.durationMs,
        truePeak: undefined,
      }
      playQueue([pista], 0, null)
    } catch (e) {
      avisar(`No se pudo reproducir: ${mensajeError(e)}`, true)
    } finally {
      setOcupada(null)
    }
  }

  /** El verso tal como está escrito: elegir la firma no lo pisa. */
  function versoEscrito() {
    return borrador?.contenido?.kind === 'letra' ? borrador.contenido.letra.texto : ''
  }

  async function elegirArtista(a: { id: string; name: string; photoUrl: string }) {
    if (que === 'letra') {
      /* Firmado solo con el artista: sin título, la vitrina muestra «— Artista». */
      terminar({
        kind: 'letra',
        letra: { texto: versoEscrito(), title: '', artist: a.name, artworkUrl: a.photoUrl },
      })
      return
    }
    if (ocupada) return
    setOcupada(a.id)
    try {
      const fotoUrl = a.photoUrl || (await fotoDelArtista(a.id))
      terminar({ kind: 'artista', artista: { artistId: a.id, nombre: a.name, fotoUrl } })
    } finally {
      setOcupada(null)
    }
  }

  function elegirAlbum(a: AlbumHallado) {
    if (que === 'letra') {
      terminar({
        kind: 'letra',
        letra: { texto: versoEscrito(), title: a.titulo, artist: a.artista, artworkUrl: a.tapaUrl },
      })
      return
    }
    terminar({ kind: 'album', album: a })
  }

  /* Los álbumes salen de las canciones halladas, uno por id. */
  const albumes: AlbumHallado[] = []
  if (resultados && (que === 'album' || que === 'letra')) {
    const vistos = new Set<string>()
    for (const t of resultados.tracks) {
      if (!t.albumId || vistos.has(t.albumId)) continue
      vistos.add(t.albumId)
      albumes.push({ albumId: t.albumId, titulo: t.album || t.title, artista: t.artist, tapaUrl: t.artworkUrl })
    }
  }

  /* Recientes por artista: uno por nombre, sin foto (el historial no la guarda). */
  const artistasRecientes: Reciente[] = []
  if (recientes && que === 'artista') {
    const vistos = new Set<string>()
    for (const r of recientes) {
      const clave = r.artistId ?? r.artist
      if (!clave || vistos.has(clave)) continue
      vistos.add(clave)
      artistasRecientes.push(r)
    }
  }

  const deCanciones = que === 'cancion' || que === 'letra'

  /* Las filas de los resultados, una vez: en «Todo» se dibujan recortadas y en cada pestaña enteras. */
  const filaCancion = (t: TrackResult) => (
    <FilaCancion
      key={t.videoId}
      track={t}
      tapa={t.artworkUrl ? proxiedImage(artworkUrlAtSize(t.artworkUrl, 96)) : null}
      ocupada={ocupada === t.videoId}
      sonando={sonando?.videoId === t.videoId}
      suena={suena}
      onElegir={() => void elegirCancion(t)}
      onEscuchar={deCanciones && que !== 'letra' ? () => void escuchar(t) : undefined}
    />
  )
  const filaArtista = (a: ArtistResult) => (
    <FilaArtista
      key={a.id}
      nombre={a.name}
      detalle={a.subtitle}
      fotoUrl={a.photoUrl ? proxiedImage(artworkUrlAtSize(a.photoUrl, 96)) : null}
      onPress={() => elegirArtista(a)}
    />
  )
  const filaAlbum = (a: AlbumHallado) => <FilaAlbum key={a.albumId} album={a} onPress={() => elegirAlbum(a)} />

  return (
    <Hoja titulo={TITULO[que]}>
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="min-h-0 flex-1">
        <CabeceraSocial titulo={TITULO[que]} onCerrar={() => (router.canGoBack() ? router.back() : router.replace('/profile/vitrina'))} />

        <Panel className="flex-1">
          <View className="min-h-0 flex-1 items-center">
            <View className="min-h-0 w-full flex-1" style={{ maxWidth: MAX_W }}>
              <View className="px-4 pb-3 pt-2">
                <SearchField
                  value={termino}
                  onChangeText={escribir}
                  placeholder={
                    que === 'artista'
                      ? 'Buscar un artista'
                      : que === 'album'
                        ? 'Buscar un álbum'
                        : que === 'letra'
                          ? 'Canción, artista o álbum'
                          : 'Buscar una canción'
                  }
                  loading={cargando}
                  autoFocus
                />
              </View>

              {/*
               * Las pestañas van fuera de la lista, para que queden a mano
               * mientras se desplaza. Solo aparecen con algo escrito: las
               * recientes son canciones y no hay qué partir.
               */}
              {que === 'letra' && buscando ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  className="shrink-0 grow-0"
                  contentContainerClassName="flex-row gap-2 px-4 pb-3"
                >
                  {PESTANAS.map((p) => (
                    <Chip key={p.id} rotulo={p.rotulo} activa={pestana === p.id} onPress={() => setPestana(p.id)} />
                  ))}
                </ScrollView>
              ) : null}

              <ScrollView
                className="min-h-0 flex-1"
                contentContainerClassName="px-2"
                contentContainerStyle={{ paddingBottom: (modal ? 24 : piso) + teclado }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                {!buscando ? (
                  <>
                    <Text className="px-2 pb-2 pt-2 text-muted-foreground text-footnote font-semibold uppercase">
                      Recientemente escuchadas
                    </Text>
                    {recientes === null ? (
                      <SkeletonList rows={5} />
                    ) : que === 'artista' ? (
                      artistasRecientes.length ? (
                        artistasRecientes.map((r) => (
                          <FilaArtista
                            key={r.artistId ?? r.artist}
                            nombre={r.artist}
                            fotoUrl={r.artistId ? artworkRemoto(`artist-${r.artistId}.jpg`) : null}
                            onPress={() =>
                              r.artistId
                                ? elegirArtista({ id: r.artistId, name: r.artist, photoUrl: '' })
                                : setTermino(r.artist)
                            }
                          />
                        ))
                      ) : (
                        <Vacio texto="Todavía no escuchaste nada. Buscá arriba." />
                      )
                    ) : que === 'album' ? (
                      <Vacio texto="Los álbumes salen de la búsqueda: escribí una canción o un artista." />
                    ) : recientes.length ? (
                      recientes.map((r) => (
                        <FilaCancion
                          key={r.videoId}
                          track={recienteComoResultado(r)}
                          tapa={artworkSource(r.artworkPath, r.artworkUrl, 96) ?? artworkRemoto(`${r.videoId}.jpg`)}
                          ocupada={ocupada === r.videoId}
                          sonando={sonando?.videoId === r.videoId}
                          suena={suena}
                          onElegir={() => void elegirCancion(recienteComoResultado(r))}
                          onEscuchar={que === 'letra' ? undefined : () => void escuchar(recienteComoResultado(r))}
                        />
                      ))
                    ) : (
                      <Vacio texto="Todavía no escuchaste nada. Buscá arriba." />
                    )}
                  </>
                ) : cargando && !resultados ? (
                  <SkeletonList rows={6} />
                ) : error && !resultados ? (
                  <Vacio texto={error} />
                ) : resultados ? (
                  <>
                    {que === 'artista' ? (
                      resultados.artists.length ? (
                        resultados.artists.map(filaArtista)
                      ) : (
                        <Vacio texto="Ningún artista con ese nombre." />
                      )
                    ) : que === 'album' ? (
                      albumes.length ? albumes.map(filaAlbum) : <Vacio texto="Ningún álbum con eso." />
                    ) : que === 'letra' ? (
                      pestana === 'canciones' ? (
                        resultados.tracks.length ? (
                          resultados.tracks.map(filaCancion)
                        ) : (
                          <Vacio texto="Ninguna canción con eso." />
                        )
                      ) : pestana === 'artistas' ? (
                        resultados.artists.length ? (
                          resultados.artists.map(filaArtista)
                        ) : (
                          <Vacio texto="Ningún artista con ese nombre." />
                        )
                      ) : pestana === 'albumes' ? (
                        albumes.length ? albumes.map(filaAlbum) : <Vacio texto="Ningún álbum con eso." />
                      ) : !resultados.tracks.length && !resultados.artists.length ? (
                        <Vacio texto="No encontré nada con eso." />
                      ) : (
                        /* «Todo»: una muestra de cada sección, y el «Ver más» abre la pestaña entera. */
                        <>
                          {resultados.tracks.length ? (
                            <Seccion
                              rotulo="Canciones"
                              verMas={resultados.tracks.length > MUESTRA ? () => setPestana('canciones') : null}
                            >
                              {resultados.tracks.slice(0, MUESTRA).map(filaCancion)}
                            </Seccion>
                          ) : null}
                          {resultados.artists.length ? (
                            <Seccion
                              rotulo="Artistas"
                              verMas={resultados.artists.length > MUESTRA ? () => setPestana('artistas') : null}
                            >
                              {resultados.artists.slice(0, MUESTRA).map(filaArtista)}
                            </Seccion>
                          ) : null}
                          {albumes.length ? (
                            <Seccion
                              rotulo="Álbumes"
                              verMas={albumes.length > MUESTRA ? () => setPestana('albumes') : null}
                            >
                              {albumes.slice(0, MUESTRA).map(filaAlbum)}
                            </Seccion>
                          ) : null}
                        </>
                      )
                    ) : resultados.tracks.length ? (
                      resultados.tracks.map(filaCancion)
                    ) : (
                      <Vacio texto="Ninguna canción con eso." />
                    )}
                  </>
                ) : null}
              </ScrollView>
            </View>
          </View>
        </Panel>
      </View>
    </SafeAreaView>
    </Hoja>
  )
}

/** Una escucha reciente en la forma de un resultado: es lo que `resolveSong` entiende. */
function recienteComoResultado(r: Reciente): TrackResult {
  return {
    videoId: r.videoId,
    title: r.title,
    artist: r.artist,
    artistId: r.artistId,
    album: '',
    albumId: null,
    artworkUrl: r.artworkUrl ?? '',
    durationMs: 0,
    artworkPath: r.artworkPath,
  }
}

function Vacio({ texto }: { texto: string }) {
  return (
    <View className="px-6 py-10">
      <Text className="text-muted-foreground text-center text-footnote leading-5">{texto}</Text>
    </View>
  )
}

/**
 * Una pestaña como píldora. La elegida es la única blanca —el acento va al
 * estado activo— y las demás se separan del panel por luminancia, sin borde.
 */
function Chip({ rotulo, activa, onPress }: { rotulo: string; activa: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityState={{ selected: activa }}
      onPress={onPress}
      className={`rounded-full px-4 py-2 active:opacity-70 ${activa ? 'bg-primary' : 'bg-muted'}`}
    >
      <Text className={`text-footnote font-semibold ${activa ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
        {rotulo}
      </Text>
    </Pressable>
  )
}

/**
 * Una sección de «Todo»: el rótulo en versalitas —el mismo de las recientes—
 * y, si la muestra no alcanza, un «Ver más» que abre la pestaña entera.
 */
function Seccion({
  rotulo,
  verMas,
  children,
}: {
  rotulo: string
  verMas: (() => void) | null
  children: ReactNode
}) {
  return (
    <View className="pb-2">
      <View className="flex-row items-center justify-between px-2 pb-2 pt-2">
        <Text className="text-muted-foreground text-footnote font-semibold uppercase">{rotulo}</Text>
        {verMas ? (
          <AccionSocial label={`Ver más ${rotulo.toLowerCase()}`} secundaria expandida={false} onPress={verMas} />
        ) : null}
      </View>
      {children}
    </View>
  )
}

/** Una tapa que puede no existir: si la URL falla, el hueco de siempre. */
function Tapa({ uri, size, redonda = false }: { uri: string | null; size: number; redonda?: boolean }) {
  const [rota, setRota] = useState(false)
  if (uri && !rota) {
    return (
      <Image
        source={{ uri }}
        onError={() => setRota(true)}
        style={{ width: size, height: size, borderRadius: redonda ? size / 2 : 6 }}
        className="bg-muted"
      />
    )
  }
  return (
    <View
      className="items-center justify-center bg-muted"
      style={{ width: size, height: size, borderRadius: redonda ? size / 2 : 6 }}
    >
      {redonda ? (
        <IconUser size={Math.round(size * 0.4)} color={ICON_COLOR.muted} />
      ) : (
        <IconMusic size={Math.round(size * 0.4)} color={ICON_COLOR.muted} />
      )}
    </View>
  )
}

/**
 * Una canción para elegir, con el parlante al final para escucharla antes.
 *
 * La fila es un View y no un Pressable: adentro va otro botón, y un Pressable
 * dentro de otro es en web un `<button>` dentro de otro.
 */
function FilaCancion({
  track,
  tapa,
  ocupada,
  sonando,
  suena,
  onElegir,
  onEscuchar,
}: {
  track: TrackResult
  tapa: string | null
  ocupada: boolean
  sonando: boolean
  suena: boolean
  onElegir: () => void
  onEscuchar?: () => void
}) {
  return (
    <View className="flex-row items-center gap-1 rounded-lg pr-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Elegir ${track.title}`}
        onPress={onElegir}
        disabled={ocupada}
        className="min-w-0 flex-1 flex-row items-center gap-3 rounded-lg p-2 active:bg-muted"
      >
        <View className="h-11 w-11 overflow-hidden rounded bg-muted">
          <Tapa uri={tapa} size={44} />
          <EstadoTapa busy={ocupada} sounding={sonando} playing={suena} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-foreground text-subheadline" numberOfLines={1}>
            {track.title}
          </Text>
          <Text className="text-muted-foreground text-caption1" numberOfLines={1}>
            {track.artist}
          </Text>
        </View>
      </Pressable>
      {onEscuchar ? (
        <IconButton label={sonando && suena ? `Pausar ${track.title}` : `Escuchar ${track.title}`} symbol={sonando && suena ? 'pause.fill' : 'play.fill'} onPress={onEscuchar} busy={ocupada} icon={<IconVolume size={16} color={sonando ? ICON_COLOR.foreground : ICON_COLOR.muted} />} />
      ) : null}
    </View>
  )
}

function FilaArtista({
  nombre,
  detalle,
  fotoUrl,
  onPress,
}: {
  nombre: string
  detalle?: string
  fotoUrl: string | null
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Elegir ${nombre}`}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-lg p-2 active:bg-muted"
    >
      <Tapa uri={fotoUrl} size={44} redonda />
      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-subheadline" numberOfLines={1}>
          {nombre}
        </Text>
        {detalle ? (
          <Text className="text-muted-foreground text-caption1" numberOfLines={1}>
            {detalle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

function FilaAlbum({ album, onPress }: { album: AlbumHallado; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Elegir ${album.titulo}`}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-lg p-2 active:bg-muted"
    >
      <Tapa uri={album.tapaUrl ? proxiedImage(artworkUrlAtSize(album.tapaUrl, 96)) : null} size={44} />
      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-subheadline" numberOfLines={1}>
          {album.titulo}
        </Text>
        <Text className="text-muted-foreground text-caption1" numberOfLines={1}>
          {album.artista}
        </Text>
      </View>
    </Pressable>
  )
}
