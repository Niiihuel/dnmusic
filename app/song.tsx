import { useEffect, useMemo, useRef, useState } from 'react'
import { useSharedValue } from 'react-native-reanimated'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { volver } from '../src/lib/volver'
import { saltar } from '../src/lib/seek'
import { useAppActiva } from '../src/lib/appActiva'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAudioPlayer } from 'expo-audio'
import { Waveform } from '../src/ui/Waveform'
import { SearchDropdown } from '../src/ui/SearchDropdown'
import { SearchField } from '../src/ui/SearchField'
import { BuscadorFlotante } from '../src/ui/FloatingSearch'
import { addShowcase } from '../src/services/showcases'
import { leerRecorte, limpiarRecorte } from '../src/state/recorte'
import { avisar } from '../src/state/aviso'
import { getSupabase } from '../src/lib/supabase'
import { useKeyboardH, usePiso } from '../src/state/shell'
import { type PopoverOption } from '../src/ui/Popover'
import { Panel } from '../src/ui/Panel'
import { ArtistCard, TrackDetailsCard } from '../src/ui/ArtistCard'
import { FadingScroll } from '../src/ui/FadingScroll'
import { ResizableRegion } from '../src/ui/ResizableRegion'
import { AnimatedSidebarTitle, CollapsedSidebar } from '../src/ui/SidebarMotion'
import {
  ICON_COLOR,
  IconBack,
  IconClose,
  IconCollapseRight,
  IconMusic,
  IconUser,
} from '../src/ui/icons'
import { Lyrics } from '../src/ui/Lyrics'
import { SongDisc } from '../src/ui/SongDisc'
import { PlayerBar, type SnippetView } from '../src/ui/PlayerBar'
import { setDraft, useDraft } from '../src/state/draft'
import type { SongSnippet } from '../src/models/message'
import {
  activeLyricIndex,
  fetchArtist,
  fetchLyrics,
  fetchWaveform,
  headroomGain,
  resolveSong,
  searchTracks,
  translateLyrics,
  type ArtistInfo,
  type LyricLang,
  type LyricLine,
  type TrackResult,
} from '../src/services/music'
import { artworkSource, artworkUrlAtSize } from '../src/lib/artwork'

/**
 * Largos de recorte disponibles.
 *
 * `0` significa la canción completa: se resuelve a la duración real del tema,
 * que recién se conoce después de analizarlo.
 */
const SNIPPET_OPTIONS: PopoverOption<number>[] = [
  { value: 15_000, label: '15 segundos' },
  { value: 30_000, label: '30 segundos' },
  { value: 60_000, label: '1 minuto' },
  { value: 0, label: 'Canción completa' },
]
/** Espera tras la última tecla antes de pegarle al servicio de música. */
const DEBOUNCE_MS = 350
/** Mínimo entre dos saltos al mismo punto. Ver el loop de reproducción. */
const SEEK_RETRY_MS = 600
/** A partir de acá entra el panel del artista al costado. */
const WIDE_PX = 900
/** Alto del buscador flotante más su respiro. */
const ALTO_BUSCADOR = 68

export default function SongPicker() {
  const router = useRouter()
  const draft = useDraft()
  const { width } = useWindowDimensions()
  const compactHeader = width < 600
  const [query, setQuery] = useState('')
  const [fijando, setFijando] = useState(false)
  /*
   * Para qué se entró a recortar.
   *
   * Desde un mensaje el recorte termina en el borrador; desde el editor del
   * perfil, en una vitrina. La pantalla es la misma porque el trabajo es el
   * mismo — lo que cambia es dónde termina.
   */
  const { destino } = useLocalSearchParams<{ destino?: string }>()
  const paraPerfil = destino === 'perfil'

  /**
   * Fija el recorte en el perfil.
   *
   * Se guarda el mismo objeto que viaja en un mensaje —`SongSnippet`— traducido
   * a lo que espera una vitrina. Que sean la misma forma no es casualidad: un
   * fragmento es un fragmento, lo mandes o lo cuelgues.
   */
  async function fijarFragmento(song: SongSnippet) {
    const { data } = await getSupabase().auth.getUser()
    const me = data.user?.id
    if (!me) {
      /* Sin sesión no hay dónde fijar. Antes esto salía en silencio y el botón
         parecía roto: si pasa, que al menos lo diga. */
      avisar('No se pudo fijar: no hay sesión.', true)
      return
    }
    setFijando(true)
    try {
      await addShowcase(me, 'fragmento', {
        videoId: song.videoId,
        title: song.title,
        artist: song.artist,
        artworkUrl: song.artworkUrl,
        artworkPath: song.artworkPath ?? null,
        audioPath: song.path,
        durationMs: song.durationMs,
        startMs: song.startMs,
        endMs: song.startMs + song.durationMs,
      })
      avisar('Fragmento fijado en tu perfil')
      /*
       * Vuelve **al perfil**, no a la pantalla anterior.
       *
       * `back()` dejaba la pila donde estaba: fijabas el fragmento y te quedabas
       * en el recorte, o —viniendo del «+»— en el buscador de música. El trabajo
       * terminó, y donde termina es en el perfil, viendo lo que acabás de
       * colgar. `dismissTo` desapila todo lo del medio de una vez.
       */
      router.dismissTo('/profile')
    } catch (e) {
      /* Sin esto el rechazo quedaba sin atrapar: el botón dejaba de girar y no
         pasaba nada, que se lee como «no funciona» sin ninguna pista de por qué. */
      avisar(`No se pudo fijar: ${(e as Error).message}`, true)
    } finally {
      setFijando(false)
    }
  }
  /* Lo que tapan el campo y el teclado, para centrar el cartel en el resto. */
  const insets = useSafeAreaInsets()
  /** En el teléfono el contenido va de borde a borde. Ver `Panel`. */
  const suelto = width < 780
  const piso = usePiso(ALTO_BUSCADOR) + insets.bottom
  const teclado = useKeyboardH()
  const [results, setResults] = useState<TrackResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /*
   * La canción, que puede venir ya elegida.
   *
   * Entrando desde un mensaje se busca acá; entrando desde el buscador del
   * perfil ya se eligió cuál, y esta pantalla arranca directamente en el
   * recorte. El inicializador solo **mira** la entrega; borrarla es cosa del
   * efecto de abajo, porque React puede invocar un inicializador más de una vez
   * y la segunda encontraría la canción ya consumida.
   */
  const [track, setTrack] = useState<TrackResult | null>(() => leerRecorte())

  /*
   * A esta pantalla se entra a buscar… salvo que ya te hayan traído la canción,
   * en cuyo caso el campo no tiene nada que hacer abierto.
   *
   * Va **después** de `track` y no arriba de todo, que es donde estaba: el
   * inicializador lo lee, y `const` no existe hasta su propia línea. Leerlo
   * antes tiraba `Cannot access 'track' before initialization` y se llevaba
   * puesta la pantalla entera al montarse.
   */
  const [buscando, setBuscando] = useState(() => !leerRecorte())

  /* Recibida: se limpia para que la próxima entrada por la puerta normal —desde
     un mensaje— abra en el buscador y no en la canción de la vez pasada. */
  useEffect(() => {
    limpiarRecorte()
  }, [])

  /**
   * Búsqueda mientras se escribe.
   *
   * El AbortController es lo que evita el clásico bug de las respuestas fuera de
   * orden: si la petición de "kend" vuelve después de la de "kendrick", sin
   * cancelar pisaría los resultados buenos con los viejos.
   */
  useEffect(() => {
    const term = query.trim()
    if (!term) {
      setResults([])
      setSearching(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    setSearching(true)
    setError(null)

    const timer = setTimeout(() => {
      searchTracks(term, controller.signal)
        .then((found) => {
          setResults(found)
          setError(found.length ? null : 'No encontré esa canción.')
          setSearching(false)
        })
        .catch((e: unknown) => {
          if ((e as Error).name === 'AbortError') return
          setError('No se pudo buscar. ¿Hay conexión?')
          setSearching(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const recipientName = draft.recipient?.username

  return (
    /* Sin el borde de abajo: ese margen lo pone el buscador, que es lo único
       que se apoya ahí. Reservándolo acá se contaba dos veces y el campo
       quedaba más alto que el de música. */
    /*
     * En el teléfono el fondo es **el mismo del contenido**.
     *
     * `canvas` es negro puro y es el fondo de la ventana en escritorio, donde
     * los paneles flotan encima separados por un hueco. En el teléfono no hay
     * paneles que separar: usarlo dejaba dos franjas más oscuras —arriba la
     * cabecera, abajo el buscador— contra el gris del contenido, una costura
     * visible donde no hay ninguna separación real. Es la misma decisión que ya
     * tomaban la pantalla principal, el perfil y el composer; esta se había
     * quedado afuera.
     *
     * Sin el borde de abajo: ese margen lo pone el buscador, que es lo único
     * que se apoya ahí. Reservándolo acá se contaba dos veces.
     */
    <SafeAreaView
      className={`flex-1 ${suelto ? 'bg-background' : 'bg-canvas'}`}
      edges={['top']}
    >
      {/* Sin margen ni hueco en el teléfono: con un solo panel a la vista, el
          marco alrededor no separa nada — ver `Panel`. */}
      <View className={`min-h-0 flex-1 ${suelto ? '' : 'gap-2 p-2'}`}>
        <View className="flex-row items-center gap-3 px-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={track ? 'Volver a buscar' : 'Volver al mensaje'}
            onPress={() => (track ? setTrack(null) : volver(router, paraPerfil ? '/profile/editar/musica' : '/compose'))}
            className={`h-11 flex-row items-center justify-center gap-1.5 rounded-full bg-background active:opacity-70 ${
              compactHeader ? 'w-11' : 'px-4'
            }`}
          >
            <IconBack size={15} color={ICON_COLOR.muted} />
            {compactHeader ? null : (
              <Text className="text-muted-foreground text-[13px] font-medium">
                {track ? 'Volver a buscar' : 'Volver al mensaje'}
              </Text>
            )}
          </Pressable>

          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-foreground text-lg font-bold" numberOfLines={1}>
              {track ? 'Elegí el fragmento' : 'Agregar canción'}
            </Text>
            <Text className="text-muted-foreground text-xs" numberOfLines={1}>
              {recipientName ? `Para @${recipientName}` : 'Parte del nuevo mensaje'}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            onPress={() => volver(router, paraPerfil ? '/profile/editar/musica' : '/compose')}
            className="h-11 w-11 items-center justify-center rounded-full bg-background active:opacity-80"
          >
            <IconClose size={17} color={ICON_COLOR.muted} />
          </Pressable>
        </View>

        <View className="min-h-0 flex-1 flex-row gap-2">
          {track ? (
            <SnippetEditor
              track={track}
              paraPerfil={paraPerfil}
              ocupado={fijando}
              onDone={(song) => {
                if (paraPerfil) {
                  void fijarFragmento(song)
                  return
                }
                setDraft({ song })
                volver(router, paraPerfil ? '/profile/editar/musica' : '/compose')
              }}
            />
          ) : (
            <Panel className="flex-1">
              <View className={`flex-1 items-center ${suelto ? 'px-4 pt-4' : 'p-5'}`}>
                <View className="min-h-0 w-full max-w-2xl flex-1">
                  {/* Para quién es ya lo dice la cabecera («Para @dany»), y
                      que después volvés al mensaje es lo que hace el botón de
                      atrás: repetirlo era una tarjeta de puro texto antes del
                      único campo que importa acá. */}
                  {/* En escritorio el campo va arriba de la columna: la mirada
                      arranca ahí, y flotando al pie era lo último que se
                      encontraba. En el teléfono sigue abajo, cerca del pulgar
                      (el BuscadorFlotante del final). */}
                  {suelto ? null : (
                    <View className="pb-4">
                      <SearchField
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Título, artista o álbum"
                        loading={searching}
                        autoFocus
                      />
                    </View>
                  )}
                  <SearchDropdown
                    visible={query.trim().length > 0}
                    loading={searching}
                    results={results}
                    error={error}
                    onSelect={setTrack}
                    /* Acá se elige qué recortar: la que está sonando también
                       cuenta. Sin esto, tocarla solo pausaba. */
                    alwaysSelect
                    embedded
                  />

                  {query.trim().length === 0 ? (
                    /*
                     * Se centra en **lo que se ve**, no en el contenedor.
                     *
                     * El contenedor llega hasta el borde de abajo, pero el
                     * teclado y el campo tapan la mitad: centrado a secas, el
                     * cartel caía justo detrás del buscador y se leían los dos
                     * textos encimados. Descontando lo tapado queda centrado en
                     * el hueco que realmente mirás. Es lo mismo que hace el
                     * cartel de «ninguna búsqueda reciente» — ver
                     * `SearchRecents`.
                     */
                    <View
                      className="flex-1 items-center justify-center gap-3"
                      style={{ paddingBottom: piso + teclado }}
                    >
                      <View className="h-12 w-12 items-center justify-center rounded-full bg-card">
                        <IconMusic size={21} color={ICON_COLOR.muted} />
                      </View>
                      <Text className="text-muted-foreground text-center text-sm">
                        Empezá escribiendo el nombre de una canción o artista.
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Panel>
          )}
        </View>
      </View>

      {/*
       * El buscador va **acá afuera**, hermano de todo lo demás.
       *
       * Adentro del panel se posicionaba contra el borde de *ese* contenedor, y
       * entre el margen de la pantalla, el del panel y el interno se le sumaban
       * unos setenta píxeles: el campo quedaba flotando lejos del teclado en vez
       * de apoyado sobre él. Los otros buscadores de la app los dibuja el layout
       * a nivel de pantalla, y por eso sí quedan pegados. Este ahora también.
       */}
      {/* Solo en el teléfono: en escritorio el campo vive arriba de la columna. */}
      {track || !suelto ? null : (
        <BuscadorFlotante
          value={query}
          onChangeText={setQuery}
          placeholder="Título, artista o álbum"
          loading={searching}
          activo={buscando}
          onActivoChange={setBuscando}
          /* Esta pantalla existe para buscar: el campo no se va nunca. */
          siempre
        />
      )}
    </SafeAreaView>
  )
}

// ───────────────────────────────────────────────────────────────────────────


function SnippetEditor({
  track,
  onDone,
  paraPerfil,
  ocupado,
}: {
  track: TrackResult
  /** Qué hacer con el recorte. Lo decide quien abrió la pantalla. */
  onDone: (song: SongSnippet) => void
  /** Cambia el rótulo del botón: fijar en el perfil, o mandarlo. */
  paraPerfil: boolean
  ocupado: boolean
}) {
  const alaVista = useAppActiva()
  /* El botón es uno solo; esto es lo que hace. */
  const entregar = onDone
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [peaks, setPeaks] = useState<number[] | null>(null)
  /** Pico real del tema; sale del análisis y define cuánto hay que atenuar. */
  /*
   * El pico real ya no se mide.
   *
   * Salía de decodificar el tema entero en el cliente, que es justo lo que se
   * dejó de hacer: ahora la onda la calcula el servicio. Sin pico, `headroomGain`
   * usa su margen fijo, que es conservador — antes que un número aproximado que
   * puede distorsionar, ninguno.
   */
  const truePeak: number | undefined = undefined
  /** Nuestra copia de la carátula, que deja el pedido a Google fuera del render. */
  const [artworkPath, setArtworkPath] = useState<string | null>(null)
  const [songMs, setSongMs] = useState(track.durationMs || 0)
  const [startMs, setStartMs] = useState(0)
  const [choice, setChoice] = useState(15_000)
  const [stage, setStage] = useState<'resolving' | 'analyzing' | 'ready' | 'error'>('resolving')
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<SnippetView>('wave')

  const [lyrics, setLyrics] = useState<LyricLine[] | null>(null)
  const [lang, setLang] = useState<LyricLang>('off')
  /** Traducciones ya pedidas, por idioma. Cambiar de ida y vuelta es gratis. */
  const [versions, setVersions] = useState<Partial<Record<LyricLang, LyricLine[]>>>({})
  const [translating, setTranslating] = useState(false)
  const [artist, setArtist] = useState<ArtistInfo | null>(null)
  const [artistLoading, setArtistLoading] = useState(false)

  const { width } = useWindowDimensions()
  const wide = width >= WIDE_PX
  /** Estado de la columna lateral, igual que las del panel principal. */
  const [sideWidth, setSideWidth] = useState(340)
  const [sideCollapsed, setSideCollapsed] = useState(false)

  // `0` en el selector significa la canción entera; recién acá se conoce su
  // largo real, así que la resolución se hace en este punto y no al elegir.
  const snippetMs = choice === 0 ? songMs : Math.min(choice, songMs || choice)

  const player = useAudioPlayer(audioUrl ? { uri: audioUrl } : null)
  const [playing, setPlaying] = useState(false)
  const raf = useRef<number | null>(null)

  /*
   * Bajar el volumen lo justo para no distorsionar.
   *
   * Lo que devuelve el códec se pasa de fondo de escala (medido: entre +0.97 y
   * +2.82 dBFS en los temas de prueba) y la salida de audio recorta todo lo que
   * pase de ahí. Ese recorte es el ruido que se oía sobre los pasajes fuertes.
   *
   * Va en su propio efecto y no junto al `play()` porque el player se vuelve a
   * crear cuando cambia la URL, y un volumen puesto una sola vez se perdería.
   */
  useEffect(() => {
    // expo-audio expone el volumen como una propiedad mutable del reproductor.
    // eslint-disable-next-line react-hooks/immutability
    player.volume = headroomGain(truePeak)
  }, [player, truePeak])

  /*
   * La posición viaja por shared value, no por estado de React.
   *
   * Con estado, cada cuadro re-renderizaba el editor entero —incluidas las
   * ~1200 barras de la onda— y el cursor se movía a saltos. Ahora el cursor lo
   * anima Reanimated en el hilo de UI.
   *
   * La letra sí necesita un valor en React, pero solo cambia cuando cambia de
   * línea: se actualiza ahí y no en cada cuadro.
   */
  const positionSV = useSharedValue(0)
  const [lyricAtMs, setLyricAtMs] = useState(0)
  const lastLineRef = useRef(-2)
  /** Cuándo se pidió el último salto, para no encimar saltos (ver el loop). */
  const seekAt = useRef(0)

  /*
   * Resolver y analizar.
   *
   * `resolveSong` deja el tema completo en Storage (la primera vez tarda unos
   * segundos; después es inmediato) y devuelve una URL firmada. Recién con el
   * audio en mano se calcula la onda de la canción entera.
   */
  useEffect(() => {
    let alive = true
    const controller = new AbortController()
    setStage('resolving')
    setError(null)
    setPeaks(null)
    setStartMs(0)
    ;(async () => {
      try {
        const song = await resolveSong(track, controller.signal)
        if (!alive) return
        setAudioUrl(song.url)
        setArtworkPath(song.artworkPath)
        setSongMs(song.durationMs || track.durationMs)
        setStage('analyzing')

        // Una barra cada ~500ms: es la resolución que hace legible la onda al
        // ampliarla. Con 160 barras para un tema entero cada barra tapa dos
        // segundos y la forma se vuelve un bloque plano.
        const buckets = Math.min(600, Math.max(120, Math.round((song.durationMs || 0) / 500)))
        // Por videoId y no por la URL firmada: la onda la calcula el servicio,
        // que ya tiene el archivo, y así no viaja el audio dos veces.
        const wave = await fetchWaveform(track.videoId, buckets, controller.signal)
        if (!alive) return
        setPeaks(wave.peaks)
        if (wave.durationMs) setSongMs(wave.durationMs)
        setStage('ready')
      } catch (e) {
        if (!alive || (e as Error).name === 'AbortError') return
        setError((e as Error).message)
        setStage('error')
      }
    })()
    return () => {
      alive = false
      controller.abort()
    }
  }, [track])

  // Ficha del artista para el panel lateral.
  useEffect(() => {
    if (!track.artistId) {
      setArtist(null)
      return
    }
    let alive = true
    const controller = new AbortController()
    setArtistLoading(true)
    fetchArtist(track.artistId, controller.signal)
      .then((a) => {
        if (!alive) return
        setArtist(a)
        setArtistLoading(false)
      })
      .catch(() => alive && setArtistLoading(false))
    return () => {
      alive = false
      controller.abort()
    }
  }, [track.artistId])

  // La letra no necesita alineación: los tiempos del LRC y los del audio son
  // la misma escala, porque tenemos la canción completa.
  useEffect(() => {
    let alive = true
    setLyrics(null)
    setVersions({})
    fetchLyrics(track.artist, track.title, track.durationMs)
      .then((l) => alive && setLyrics(l))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [track])

  /*
   * Traducción a pedido.
   *
   * Solo se pide una vez por idioma: lo que vuelve queda en `versions` y volver
   * a un idioma ya visto es instantáneo. Si falla, se vuelve al original en vez
   * de dejar la letra a medias — traducir es una ayuda, no puede romper la
   * pantalla.
   */
  useEffect(() => {
    if (lang === 'off' || !lyrics || versions[lang]) return
    let alive = true
    const controller = new AbortController()
    setTranslating(true)
    translateLyrics(lyrics, lang, controller.signal)
      .then((done) => {
        if (!alive) return
        setVersions((v) => ({ ...v, [lang]: done }))
        setTranslating(false)
      })
      .catch((e: unknown) => {
        if (!alive || (e as Error).name === 'AbortError') return
        setTranslating(false)
        setLang('off')
      })
    return () => {
      alive = false
      controller.abort()
    }
  }, [lang, lyrics, versions])

  /** La letra tal como se muestra: la original, o la traducción si hay una. */
  const shownLyrics = (lang === 'off' ? lyrics : versions[lang]) ?? lyrics

  useEffect(() => {
    /* Con la app atrás nadie mira la onda ni la letra. Ver `useAppActiva`. */
    if (!playing || !alaVista) {
      if (raf.current) cancelAnimationFrame(raf.current)
      raf.current = null
      return
    }
    const tick = () => {
      const raw = player.currentTime * 1000
      // Antes de que el audio esté listo la posición puede no ser un número, y
      // `NaN !== NaN` daba por bueno el salto una y otra vez.
      if (Number.isFinite(raw)) {
        const outside = raw >= startMs + snippetMs || raw < startMs - 250

        if (outside) {
          /*
           * Loop dentro de la ventana elegida, pidiendo el salto UNA vez.
           *
           * En web `seekTo` es una asignación a `currentTime` que resuelve al
           * instante, pero el salto en sí tarda: hasta que termina, la posición
           * sigue leyendo el valor viejo. Repitiéndolo por cuadro se le pedían
           * sesenta saltos por segundo al mismo archivo, cada uno cancelando el
           * anterior y vaciando el búfer — y eso sonaba a estática.
           *
           * El reintento por tiempo es la red de seguridad para el caso en que
           * un salto se pierda y la posición nunca vuelva a la ventana.
           */
          const now = performance.now()
          if (now - seekAt.current > SEEK_RETRY_MS) {
            seekAt.current = now
            saltar(player, startMs / 1000)
          }
          positionSV.value = startMs
        } else {
          seekAt.current = 0
          positionSV.value = raw

          if (lyrics) {
            const line = activeLyricIndex(lyrics, raw)
            if (line !== lastLineRef.current) {
              lastLineRef.current = line
              setLyricAtMs(raw)
            }
          }
        }
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [playing, startMs, snippetMs, player, lyrics, positionSV, alaVista])

  const toggle = async () => {
    if (playing) {
      player.pause()
      setPlaying(false)
      return
    }
    seekAt.current = performance.now()
    await player.seekTo(startMs / 1000)
    positionSV.value = startMs
    lastLineRef.current = -2
    player.play()
    setPlaying(true)
  }

  const onChangeChoice = (next: number) => {
    setChoice(next)
    const nextMs = next === 0 ? songMs : Math.min(next, songMs || next)
    // Si el recorte se agranda y ya no entra, correrlo hacia atrás.
    setStartMs((s) => Math.max(0, Math.min(s, Math.max(0, songMs - nextMs))))
    if (playing) {
      player.pause()
      setPlaying(false)
    }
  }

  /*
   * Mueve el recorte. La onda ya entrega un valor válido, pero la letra manda el
   * tiempo crudo de la línea tocada: el acotado va acá para que valga en los dos
   * casos y una línea del final no deje el recorte colgando fuera de la canción.
   */
  const onChangeStart = (raw: number) => {
    const ms = Math.round(Math.max(0, Math.min(Math.max(0, songMs - snippetMs), raw)))
    setStartMs(ms)
    if (playing) {
      // El loop no debe encimar su propio salto mientras este está en curso.
      seekAt.current = performance.now()
      saltar(player, ms / 1000)
    }
    positionSV.value = ms
    setLyricAtMs(ms)
    lastLineRef.current = -2
  }

  /** Salto dentro del recorte, sin moverlo: es la barra de progreso del pie. */
  const onSeek = (raw: number) => {
    const ms = Math.max(startMs, Math.min(startMs + snippetMs, raw))
    seekAt.current = performance.now()
    saltar(player, ms / 1000)
    positionSV.value = ms
    setLyricAtMs(ms)
    lastLineRef.current = -2
  }

  /*
   * Líneas que caen dentro del recorte, en el idioma elegido.
   *
   * Sale de `shownLyrics` y no del original: si se eligió traducir, se manda la
   * traducción. Es una decisión de quien escribe —"quiero que la leas en
   * español"— y no una preferencia que el otro tenga que volver a elegir.
   */
  const snippetLyrics = useMemo(() => {
    if (!shownLyrics) return []
    return shownLyrics.filter((l) => l.atMs >= startMs - 1200 && l.atMs < startMs + snippetMs)
  }, [shownLyrics, startMs, snippetMs])

  /*
   * Dos vistas sobre el mismo recorte, como el reproductor de Spotify: la onda
   * para elegirlo con la mano, y la letra a pantalla completa para elegirlo por
   * lo que dice. Los controles no se duplican — viven en la barra de abajo, que
   * es la misma en las dos.
   */
  /** Sin letra no hay vista de letra, aunque el selector diga que sí. */
  /*
   * La ficha de arriba solo acompaña a la onda.
   *
   * La onda no dice de qué tema es, así que necesita el encabezado. El disco y
   * la letra ya muestran título y artista: repetirlos arriba es decir dos veces
   * lo mismo y le come altura justo a la vista que más la necesita.
   */
  const showTrackHeader = view === 'wave'

  /*
   * Vista previa de cómo va a verse el mensaje, no otra herramienta: acá el
   * disco no se toca, se mira. El recorte se sigue eligiendo desde la onda.
   */
  const discCanvas = (
    <View className="flex-1 items-center justify-center gap-6 p-6">
      <SongDisc
        artworkUrl={track.artworkUrl}
        artworkPath={artworkPath}
        title={track.title}
        playing={playing}
        size={wide ? 260 : 200}
      />
      <View className="items-center gap-1">
        <Text className="text-foreground text-lg font-semibold" numberOfLines={1}>
          {track.title}
        </Text>
        <Text className="text-muted-foreground text-sm" numberOfLines={1}>
          {track.artist}
        </Text>
      </View>
    </View>
  )

  const canvas = view === 'disc' ? (
    discCanvas
  ) : view === 'lyrics' && shownLyrics ? (
    <Lyrics lines={shownLyrics} atMs={lyricAtMs} size="lg" onPickLine={onChangeStart} />
  ) : (
    <ScrollView contentContainerClassName="grow justify-center gap-6 p-4">
      <Waveform
        peaks={peaks ?? []}
        durationMs={songMs}
        windowMs={snippetMs}
        startMs={startMs}
        onChangeStart={onChangeStart}
        positionMs={positionSV}
        onScrub={onSeek}
        playing={playing}
        height={96}
      />
      <Text className="text-muted-foreground text-center text-[11px] tabular-nums">
        {fmt(startMs)} – {fmt(startMs + snippetMs)} de {fmt(songMs)}
      </Text>

      {shownLyrics ? (
        <Lyrics lines={shownLyrics} atMs={lyricAtMs} visible={wide ? 7 : 5} />
      ) : (
        <Text className="text-muted-foreground text-center text-xs">
          No hay letra sincronizada para esta canción.
        </Text>
      )}
    </ScrollView>
  )

  const editor = (
    <View className="flex-1">
      {/* En la vista de letra la ficha se va: la letra es el contenido y el
          tema ya está nombrado en el encabezado de la pantalla. */}
      {showTrackHeader && (
        <View className="m-4 mb-0 flex-row items-center gap-3 rounded-lg bg-muted p-3">
          <Image
            source={{ uri: artworkSource(artworkPath, track.artworkUrl, 128) ?? '' }}
            className="h-14 w-14 rounded-md bg-background"
          />
          <View className="flex-1">
            <Text className="text-foreground text-base font-medium" numberOfLines={1}>
              {track.title}
            </Text>
            <Text className="text-muted-foreground text-[13px]" numberOfLines={1}>
              {track.artist}
            </Text>
          </View>
        </View>
      )}

      {stage === 'error' ? (
        <Text className="text-destructive p-4 text-sm leading-5">{error}</Text>
      ) : stage !== 'ready' ? (
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator color="#FFFFFF" />
          <Text className="text-muted-foreground text-xs">
            {stage === 'resolving' ? 'Trayendo la canción…' : 'Analizando el audio…'}
          </Text>
        </View>
      ) : (
        <>
          <View className="flex-1">{canvas}</View>

          {/* Pie fijo: los controles no se van con el scroll de la letra. */}
          {/* Separado por superficie y no por línea: el editor va sobre
              `background` y el pie un escalón más arriba, en `card`.
              docs/DESIGN.md prohíbe los bordes para separar superficies. */}
          <View className="gap-4 bg-card p-4">
            <PlayerBar
              view={view}
              onChangeView={setView}
              hasLyrics={!!lyrics}
              playing={playing}
              onToggle={toggle}
              positionMs={positionSV}
              startMs={startMs}
              snippetMs={snippetMs}
              onSeek={onSeek}
              choice={choice}
              choices={SNIPPET_OPTIONS}
              onChangeChoice={onChangeChoice}
              lang={lang}
              onChangeLang={setLang}
              translating={translating}
            />

            {/* Alineado a la derecha y del ancho de su texto.
                A todo lo ancho competía en peso con la barra de reproducción:
                una franja blanca de borde a borde es lo más llamativo de la
                pantalla, y confirmar el recorte es el último paso, no el
                principal. */}
            {/*
             * Fijando, el botón va **centrado**; mandando, contra la derecha.
             *
             * A la derecha y del ancho de su texto es lo correcto para «usar
             * este fragmento»: es el último paso de una secuencia y sigue el
             * recorrido de lectura. Fijar en el perfil no es el final de una
             * secuencia sino la única acción de la pantalla, y arrinconada
             * abajo a la derecha se lee como algo secundario.
             */}
            <View
              className={`flex-row items-center gap-2 ${
                paraPerfil ? 'justify-center' : 'justify-end'
              }`}
            >
              {/*
               * Un solo botón, y cuál depende de para qué entraste.
               *
               * Antes estaban los dos —mandar y fijar en el perfil— uno al lado
               * del otro. A esta pantalla se llega desde «adjuntar una canción a
               * un mensaje»: ofrecer ahí que lo cuelgues en tu perfil mezcla dos
               * intenciones que no tienen nada que ver, y obliga a leer dos
               * botones para hacer lo único que viniste a hacer.
               *
               * Ahora el destino viene en la ruta. Desde el editor del perfil se
               * entra con `?destino=perfil` y el botón fija; desde un mensaje,
               * manda. La pantalla es la misma porque el trabajo —recortar— es
               * el mismo; lo que cambia es dónde termina el recorte.
               */}
              <Pressable
                accessibilityRole="button"
                disabled={ocupado}
                onPress={() =>
                  entregar({
                    videoId: track.videoId,
                    title: track.title,
                    artist: track.artist,
                    artworkUrl: artworkUrlAtSize(track.artworkUrl, 640),
                    // Viaja con el mensaje: quien lo abra dentro de un año la
                    // ve aunque Google ya no sirva esa URL.
                    ...(artworkPath ? { artworkPath } : {}),
                    path: `${track.videoId}.webm`,
                    startMs,
                    durationMs: snippetMs,
                    // Viaja con el mensaje: quien lo escuche después no tiene
                    // que decodificar el tema entero para saber cuánto atenuar.
                    truePeak,
                    lyrics: snippetLyrics.length ? snippetLyrics : undefined,
                    // El idioma viaja para poder decir "traducida al español"
                    // al mostrarla, y para no volver a traducir lo ya traducido.
                    ...(lang !== 'off' && snippetLyrics.length ? { lyricsLang: lang } : {}),
                    // La vista en la que se estaba es cómo se va a abrir del
                    // otro lado. La onda es herramienta de recorte, no una
                    // presentación: ahí el mensaje se abre con el disco.
                    style: view === 'lyrics' && snippetLyrics.length ? 'lyrics' : 'disc',
                  })
                }
                className="h-11 items-center justify-center rounded-full bg-primary px-7 active:opacity-80"
              >
                <Text className="text-primary-foreground text-[13px] font-semibold uppercase tracking-[1.4px]">
                  {ocupado
                    ? 'Guardando…'
                    : paraPerfil
                      ? 'Fijar en mi perfil'
                      : 'Usar este fragmento'}
                </Text>
              </Pressable>
            </View>
          </View>
        </>
      )}
    </View>
  )

  if (!wide) {
    return (
      <View className="min-h-0 flex-1 gap-2">
        <Panel className="flex-1">{editor}</Panel>
      </View>
    )
  }

  /*
   * Mismo esqueleto que el panel principal: el contenido a la izquierda y una
   * columna lateral que se puede colapsar y redimensionar arrastrando su borde.
   * Antes era un `Panel` de ancho fijo, que se veía parecido pero no se
   * comportaba igual — y esta pantalla es parte de la app, no una ventana
   * aparte.
   */
  const sidebar = (
    <FadingScroll>
      <ArtistCard artist={artist} loading={artistLoading} />
      <TrackDetailsCard track={track} />
    </FadingScroll>
  )

  return (
    <View className="min-h-0 flex-1 flex-row gap-2">
      <Panel className="flex-1">{editor}</Panel>

      <ResizableRegion
        width={sideWidth}
        collapsed={sideCollapsed}
        minWidth={280}
        maxWidth={480}
        resizeEdge="left"
        onWidthChange={setSideWidth}
      >
        {({ hovered }) =>
          sideCollapsed ? (
            <CollapsedSidebar
              side="right"
              hovered={hovered}
              label="Expandir la ficha del artista"
              onExpand={() => setSideCollapsed(false)}
            />
          ) : (
            <Panel className="flex-1">
              {/* Encabezado con el mismo gesto que las columnas del panel
                  principal: el ícono de colapsar entra al pasar el cursor y
                  corre el título, en vez de estar siempre ocupando lugar. */}
              <View className="flex-row items-center px-4 pt-4">
                <AnimatedSidebarTitle
                  visible={hovered}
                  label="Colapsar la ficha del artista"
                  icon={<IconCollapseRight size={17} color={ICON_COLOR.muted} />}
                  onPress={() => setSideCollapsed(true)}
                >
                  {/* "Detalle", igual que la columna del panel principal. Decía
                      "Sobre la canción" y chocaba con el "Sobre el artista" que
                      la ficha de abajo lleva encima de la foto. */}
                  <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.8px]">
                    Detalle
                  </Text>
                </AnimatedSidebarTitle>
              </View>
              {sidebar}
            </Panel>
          )
        }
      </ResizableRegion>
    </View>
  )
}

function fmt(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
