import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useSharedValue } from 'react-native-reanimated'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { volver } from '../src/lib/volver'
import { saltar } from '../src/lib/seek'
import { useAppActiva } from '../src/lib/appActiva'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAudioPlayer } from 'expo-audio'
import { Waveform } from '../src/ui/Waveform'
import { SearchDropdown } from '../src/ui/SearchDropdown'
import { SearchField } from '../src/ui/SearchField'
import { addShowcase } from '../src/services/showcases'
import { leerRecorte, limpiarRecorte } from '../src/state/recorte'
import { pauseForSnippet, useVolume } from '../src/state/playback'
import { useAudioLease } from '../src/lib/useAudioLease'
import { avisar } from '../src/state/aviso'
import { getSupabase } from '../src/lib/supabase'
import { type PopoverOption } from '../src/ui/Popover'
import { CabeceraSocial, AccionSocial } from '../src/ui/Social'
import { Panel } from '../src/ui/Panel'
import { Hoja, useHojaModal } from '../src/ui/Hoja'
import {
  ICON_COLOR,
  IconMusic,
} from '../src/ui/icons'
import { Lyrics } from '../src/ui/Lyrics'
import { SongDisc } from '../src/ui/SongDisc'
import { PlayerBar, type SnippetView } from '../src/ui/PlayerBar'
import { setDraft, useDraft } from '../src/state/draft'
import type { SongSnippet } from '../src/models/message'
import {
  activeLyricIndex,
  fetchLyrics,
  fetchWaveform,
  headroomGain,
  resolveSong,
  searchTracks,
  translateLyrics,
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
/** Tamaño de la vista previa en ventanas amplias. */
const WIDE_PX = 900

type RecorteElegido = { startMs: number; choice: number; view: SnippetView; lang: LyricLang }
const RECORTE_INICIAL: RecorteElegido = { startMs: 0, choice: 15000, view: 'wave', lang: 'off' }

export default function SongPicker() {
  const router = useRouter()
  const draft = useDraft()
  const modal = useHojaModal()
  const { height } = useWindowDimensions()
  const [query, setQuery] = useState('')
  const [fijando, setFijando] = useState(false)
  const [recorteElegido, setRecorteElegido] = useState<RecorteElegido>(RECORTE_INICIAL)
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
  const [results, setResults] = useState<TrackResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  function cambiarBusqueda(value: string) {
    setQuery(value)
    setResults([])
    setSearching(value.trim().length > 0)
    setError(null)
  }
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
  function elegirTrack(next: TrackResult | null) {
    setTrack(next)
    setRecorteElegido(RECORTE_INICIAL)
  }


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
    if (!term) return

    const controller = new AbortController()

    const timer = setTimeout(() => {
      searchTracks(term, controller.signal)
        .then((found) => {
          if (controller.signal.aborted) return
          setResults(found)
          setError(found.length ? null : 'No encontré esa canción.')
          setSearching(false)
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted || (e as Error).name === 'AbortError') return
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
    <Hoja medida={modal ? "contenido" : "llena"} anchoMaximo={720} titulo={track ? 'Elegir fragmento' : 'Agregar canción'}>
    <SafeAreaView
      collapsable={false}
      className="min-h-0 bg-background"
      style={modal ? { height: Math.min(track ? 480 : 540, height - 96) } : { flex: 1 }}
      edges={Platform.OS === 'web' ? [] : ['bottom']}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="min-h-0 flex-1">
        <CabeceraSocial titulo={track ? 'Elegir fragmento' : 'Agregar canción'}
          ocupado={fijando}
          detalle={paraPerfil ? 'Para tu perfil' : recipientName ? `Para @${recipientName}` : 'Para acompañar tu mensaje'}
          onCerrar={() => { if (!fijando) volver(router, paraPerfil ? '/profile/editar/musica' : '/compose') }}
          />

        <View className="min-h-0 flex-1 flex-row">
          {track ? (
            <SnippetEditor
              key={track.videoId}
              track={track}
              onCambiarCancion={() => elegirTrack(null)}
              recorte={recorteElegido}
              setRecorte={setRecorteElegido}
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
              <View className="min-h-0 flex-1 items-center px-5 pb-5">
                <View className="min-h-0 w-full max-w-2xl flex-1">
                  <View className="pb-4">
                    <SearchField value={query} onChangeText={cambiarBusqueda} placeholder="Título, artista o álbum" loading={searching} autoFocus />
                  </View>
                  <SearchDropdown
                    visible={query.trim().length > 0}
                    loading={searching}
                    results={results}
                    error={error}
                    onSelect={elegirTrack}
                    /* Acá se elige qué recortar: la que está sonando también
                       cuenta. Sin esto, tocarla solo pausaba. */
                    alwaysSelect
                    embedded
                  />

                  {query.trim().length === 0 ? (
                    <View
                      className="flex-1 items-center justify-center gap-3"
                    >
                      <View className="h-12 w-12 items-center justify-center rounded-full bg-card">
                        <IconMusic size={21} color={ICON_COLOR.muted} />
                      </View>
                      <Text className="text-muted-foreground text-center text-subheadline">
                        Empezá escribiendo el nombre de una canción o artista.
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Panel>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </Hoja>
  )
}

// ───────────────────────────────────────────────────────────────────────────


function SnippetEditor({
  track,
  onDone,
  paraPerfil,
  ocupado,
  onCambiarCancion,
  recorte,
  setRecorte,
}: {
  recorte: RecorteElegido
  setRecorte: Dispatch<SetStateAction<RecorteElegido>>
  onCambiarCancion: () => void
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
  const { startMs, choice, view, lang } = recorte
  const setStartMs = (next: SetStateAction<number>) => setRecorte(prev => ({ ...prev, startMs: typeof next === 'function' ? next(prev.startMs) : next }))
  const setChoice = (next: number) => setRecorte(prev => ({ ...prev, choice: next }))
  const setView = (next: SnippetView) => setRecorte(prev => ({ ...prev, view: next }))
  const setLang = (next: LyricLang) => setRecorte(prev => ({ ...prev, lang: next }))
  const [stage, setStage] = useState<'resolving' | 'analyzing' | 'ready' | 'error'>('resolving')
  const [error, setError] = useState<string | null>(null)

  const [lyrics, setLyrics] = useState<LyricLine[] | null>(null)
  /** Traducciones ya pedidas, por idioma. Cambiar de ida y vuelta es gratis. */
  const [versions, setVersions] = useState<Partial<Record<LyricLang, LyricLine[]>>>({})
  const translating = lang !== 'off' && lyrics !== null && !versions[lang]

  const { width } = useWindowDimensions()
  const wide = width >= WIDE_PX
  // `0` en el selector significa la canción entera; recién acá se conoce su
  // largo real, así que la resolución se hace en este punto y no al elegir.
  const snippetMs = choice === 0 ? songMs : Math.min(choice, songMs || choice)

  const player = useAudioPlayer(audioUrl ? { uri: audioUrl } : null, { keepAudioSessionActive: true })
  const lease = useAudioLease(player)
  const intentoPlay = useRef(0)
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
  /* Y por el volumen del slider: el editor obedece la misma perilla que la
     cola y los fragmentos — pasar de escuchar música a recortar un fragmento
     no puede pegar un salto de volumen. */
  const volumenElegido = useVolume()
  useEffect(() => {
    // expo-audio expone el volumen como una propiedad mutable del reproductor.
    // eslint-disable-next-line react-hooks/immutability
    player.volume = headroomGain(truePeak) * volumenElegido
  }, [player, truePeak, volumenElegido])

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
  const positionSV = useSharedValue(startMs)
  const [lyricAtMs, setLyricAtMs] = useState(startMs)
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



  // SnippetEditor está identificado por videoId: al cambiar de canción,
  // el estado inicial limpia audio, letra y traducciones antes de los efectos.
  // La letra no necesita alineación: los tiempos del LRC y los del audio son
  // la misma escala, porque tenemos la canción completa.
  useEffect(() => {
    let alive = true
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
    translateLyrics(lyrics, lang, controller.signal)
      .then((done) => {
        if (!alive) return
        setVersions((v) => ({ ...v, [lang]: done }))
      })
      .catch((e: unknown) => {
        if (!alive || (e as Error).name === 'AbortError') return
        setRecorte(prev => ({ ...prev, lang: 'off' }))
      })
    return () => {
      alive = false
      controller.abort()
    }
  }, [lang, lyrics, versions, setRecorte])

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
      if (!lease.active) return
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
          positionSV.set(startMs)
        } else {
          seekAt.current = 0
          positionSV.set(raw)

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
  }, [playing, startMs, snippetMs, player, lyrics, positionSV, alaVista, lease])

  const toggle = async () => {
    if (!lease.active) return
    const intento = ++intentoPlay.current
    if (playing) {
      player.pause()
      setPlaying(false)
      return
    }
    try {
      seekAt.current = performance.now()
      await player.seekTo(startMs / 1000)
      if (!lease.active || intento !== intentoPlay.current) return
      positionSV.set(startMs)
      lastLineRef.current = -2
      pauseForSnippet()
      player.play()
      setPlaying(true)
    } catch (cause) {
      if (lease.active && intento === intentoPlay.current) {
        avisar(`No se pudo reproducir el fragmento: ${(cause as Error).message}`, true)
      }
    }
  }

  const onChangeChoice = (next: number) => {
    intentoPlay.current++
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
    positionSV.set(ms)
    setLyricAtMs(ms)
    lastLineRef.current = -2
  }

  /** Salto dentro del recorte, sin moverlo: es la barra de progreso del pie. */
  const onSeek = (raw: number) => {
    const ms = Math.max(startMs, Math.min(startMs + snippetMs, raw))
    seekAt.current = performance.now()
    saltar(player, ms / 1000)
    positionSV.set(ms)
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
    <ScrollView className="flex-1" contentContainerClassName="grow items-center justify-center gap-5 p-5">
      <SongDisc
        artworkUrl={track.artworkUrl}
        artworkPath={artworkPath}
        title={track.title}
        playing={playing}
        size={wide ? 220 : 184}
      />
      <View className="items-center gap-1">
        <Text className="text-foreground text-title3 font-semibold" numberOfLines={1}>
          {track.title}
        </Text>
        <Text className="text-muted-foreground text-subheadline" numberOfLines={1}>
          {track.artist}
        </Text>
      </View>
    </ScrollView>
  )

  const canvas = view === 'disc' ? (
    discCanvas
  ) : view === 'lyrics' && shownLyrics ? (
    <Lyrics lines={shownLyrics} atMs={lyricAtMs} size="lg" onPickLine={onChangeStart} />
  ) : (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 16 }}>
      <Waveform
        peaks={peaks ?? []}
        durationMs={songMs}
        windowMs={snippetMs}
        startMs={startMs}
        onChangeStart={onChangeStart}
        positionMs={positionSV}
        onScrub={onSeek}
        playing={playing}
        height={wide ? 72 : 64}
      />
      <Text className="text-muted-foreground text-center text-footnote tabular-nums">
        {fmt(startMs)} – {fmt(startMs + snippetMs)} de {fmt(songMs)}
      </Text>

      <Text className="text-muted-foreground text-center text-subheadline">
        Arrastrá el recorte hasta la parte que querés compartir.
      </Text>
    </ScrollView>
  )

  const editor = (
    <View className="flex-1">
      {/* En la vista de letra la ficha se va: la letra es el contenido y el
          tema ya está nombrado en el encabezado de la pantalla. */}
      {showTrackHeader && (
        <View className="mx-5 mt-3 flex-row items-center gap-3">
          <Image
            source={{ uri: artworkSource(artworkPath, track.artworkUrl, 128) ?? '' }}
            className="h-11 w-11 rounded-[10px] bg-background"
          />
          <View className="flex-1">
            <Text className="text-foreground text-subheadline font-medium" numberOfLines={1}>
              {track.title}
            </Text>
            <Text className="text-muted-foreground text-footnote" numberOfLines={1}>
              {track.artist}
            </Text>
          </View>
        </View>
      )}

      {stage === 'error' ? (
        <View className="gap-3 p-5">
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" className="text-destructive text-subheadline leading-6">{error}</Text>
          <AccionSocial label="Elegir otra canción" secundaria compacta expandida={false} onPress={onCambiarCancion} />
        </View>
      ) : stage !== 'ready' ? (
        <View accessibilityLiveRegion="polite" className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator color="#FFFFFF" />
          <Text className="text-muted-foreground text-subheadline">
            {stage === 'resolving' ? 'Trayendo la canción…' : 'Analizando el audio…'}
          </Text>
        </View>
      ) : (
        <>
          <View className="flex-1">{canvas}</View>

          <View className="bg-background px-5 pt-2" style={{ paddingBottom: wide ? 16 : 20 }}>
            <PlayerBar view={view} onChangeView={setView} hasLyrics={!!lyrics?.length}
              playing={playing} onToggle={toggle} positionMs={positionSV} startMs={startMs}
              snippetMs={snippetMs} onSeek={onSeek} choice={choice} choices={SNIPPET_OPTIONS}
              onChangeChoice={onChangeChoice} lang={lang} onChangeLang={setLang}
              translating={translating} ocupado={ocupado} onCambiarCancion={onCambiarCancion}
              accion={
              <AccionSocial
                label={paraPerfil ? 'Fijar fragmento' : 'Usar fragmento'}
                compacta
                expandida={false}
                style={{ alignSelf: 'flex-end' }}
                busy={ocupado}
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
              />
              } />
          </View>
        </>
      )}
    </View>
  )

  return <View className="min-h-0 flex-1">{editor}</View>
}

function fmt(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
