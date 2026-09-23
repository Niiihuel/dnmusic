import { crearVigilanteAudio, abrirFuenteConReintento, esperarAperturaAudio, type PresupuestoRecuperacion } from '../lib/recuperacionAudio'
import { crearMedidorEscucha } from '../lib/escuchaEfectiva'
import { useAudioLease } from '../lib/useAudioLease'
import { registrarIncidenciaAudio } from '../state/diagnosticoAudio'
import { proximasCola } from '../lib/proximasCola'
import { usePrecargaCola } from './usePrecargaCola'
import { useEspectroAudio } from './useEspectroAudio'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Platform } from 'react-native'
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio'
import { artworkSource } from '../lib/artwork'
import { headroomGain, perceptualGain, resolveSong, signedUrl, type TrackResult } from '../services/music'
import { useLockScreen } from '../state/lockScreen'
import { anotarEscucha } from '../services/plays'
import type { PlaylistTrack } from '../services/playlists'
import {
  advance,
  getPlaybackState,
  reportRecuperada,
  completarCancion,
  pausaExterna,
  playbackOrigin,
  reanudacionExterna,
  reanudarTrasInterrupcion,
  registerEngine,
  registerRelleno,
  rellenarSiFalta,
  reportCargada,
  reportError,
  reportProgress,
  reportarPosicionFina,
  usePlaybackState,
  videoIdsRecorridos,
  type PlaybackOrigin,
} from '../state/playback'
import { proximasRecomendadas, type ArtistaEscuchado } from '../services/recomendaciones'
import { HAY_DESCARGAS, marcarAudioUsado, rutaLocal, useDescargasCargadas, useDescargasError } from '../state/descargas'
import {
  jamEsperaArranqueMs,
  jamPosicionObjetivoMs,
  jamSuena,
  rellenarJamSiFalta,
  useJamActivo,
  useJamRevision,
  useJamSilencioso,
  useJamSincronizo,
} from '../state/jam'
import { esEscuchaEspejo, reportarActividadEscucha, useEscuchaEspejo } from '../state/escucha'
import { saltar } from '../lib/seek'
import { useAppActiva } from '../lib/appActiva'
import { avisar } from '../state/aviso'
import { mensajeError } from '../lib/mensajeError'
import { guardarEcualizadorAhora, informarSoporteEcualizador, useEcualizador } from '../state/ecualizador'

/** Margen para dar por terminada una canción. */
const END_EPSILON_S = 0.35
/**
 * Cuántas URLs firmadas se guardan **además** de las que están en uso.
 *
 * Las de la canción actual y la siguiente no cuentan acá: esas no se tiran
 * nunca mientras lo sigan siendo. Ver `remember`.
 */
const CACHE_URLS = 3
/**
 * Cada cuánto se le avisa al store la posición.
 *
 * La barra fina se actualiza por cuadro mientras está visible; el store
 * recibe menos avisos. El final lo informa el reproductor.
 */
const AVISO_CADA_MS = 100
/*
 * La sincronía del Jam, en tres números.
 *
 * Debajo de 80ms no se toca nada: es menos que la latencia de un Bluetooth y
 * corregirlo sería perseguir ruido. Hasta 400ms se corrige **estirando el
 * tiempo** —velocidad 1.04 con corrección de tono, inaudible— porque un salto
 * en medio de la música es un artefacto que se oye y esto no. Más de 400ms es
 * un salto franco: seekTo con tolerancia cero, exacto al cuadro.
 *
 * La deriva se revisa cada 7 segundos con un `setInterval` — **jamás** con
 * `requestAnimationFrame`: un bucle por cuadro leyendo la posición es la forma
 * exacta del que hizo que iOS matara la app por CPU (ver el comentario largo
 * de abajo). Entre revisiones, cada evento del Jam dispara una corrección
 * puntual: los saltos y pausas de otro llegan al oído en el viaje del evento,
 * no en el próximo tick.
 */
const JAM_DERIVA_MIN_MS = 80
const JAM_SALTO_MS = 400
const JAM_REVISA_CADA_MS = 7000

/**
 * El motor de audio: **el que suena**. No dibuja nada.
 *
 * Vivía adentro de `NowPlayingBar`, y ahí estaba el problema. El reproductor de
 * expo-audio es un objeto que vive **dentro de `useAudioPlayer`**, así que se
 * libera cuando su componente se desmonta. La barra, en cambio, se dibuja en
 * cuatro formas distintas según dónde estés —buscando, en un chat, con
 * pestañas, o suelta— y `app/_layout.tsx` las tenía como cuatro ramas de un
 * ternario: cuatro posiciones distintas del árbol.
 *
 * React no conserva un componente que cambia de lugar. Cada vez que cambiabas
 * de rama —abrir el buscador, entrar a una conversación— desmontaba la barra de
 * una posición y montaba otra nueva en otra, el reproductor se liberaba y se
 * volvía a crear, y la canción **arrancaba de cero**. La propia barra
 * documentaba el peligro y lo evitaba para el caso del teclado, con `oculto` en
 * vez de desmontar; las cuatro ramas se le escaparon.
 *
 * Separarlos lo arregla de raíz: el motor se monta **una sola vez**, en un lugar
 * fijo del layout, y no se entera de que la barra cambia de forma. La barra pasó
 * a ser dibujo puro y puede remontarse todo lo que quiera.
 *
 * Los dos hablan por `state/playback`, que ya era el dueño del estado: el motor
 * escribe posición y duración, la barra las lee. No hay props entre ellos.
 */
export function MotorAudio() {
  const indiceLocalListo = useDescargasCargadas()
  const errorIndiceLocal = useDescargasError()
  const {
    tracks,
    index,
    manual,
    upNext,
    shuffle,
    repetir,
    origin,
    wantPlay,
    seleccionRevision,
    positionMs,
    volume,
  } = usePlaybackState()

  // Lo encolado a mano manda sobre la lista mientras dure.
  const current = manual ?? (index >= 0 ? (tracks[index] ?? null) : null)
  /*
   * La que va a sonar después, para tenerla lista antes de que haga falta.
   *
   * Es el mismo orden que usa `advance`: primero lo encolado a mano, después lo
   * que sigue en la lista. Si acá dijera otra cosa, precargaríamos una canción
   * que no va a sonar.
   */
  const proximas = useMemo(() => proximasCola({ tracks, index, manual, upNext, shuffle, repetir }, HAY_DESCARGAS ? 5 : 2),
    [tracks, index, manual, upNext, shuffle, repetir])
  /*
   * La carátula de la pantalla bloqueada, aparte y grande.
   *
   * La de arriba son 96px porque es la miniatura de la barra, y se estaba
   * mandando **esa misma** al sistema. iOS la usa como fondo a pantalla completa
   * —lo que hacen Apple Music y Spotify— así que le estábamos dando una imagen
   * de 96px para llenar un teléfono: se veía como un cuadradito borroso.
   *
   * Son dos consumidores con necesidades opuestas, así que son dos URLs. La
   * grande no cuesta nada de más en la app: la descarga el sistema operativo, no
   * nosotros.
   */
  const artworkBloqueo = current
    ? artworkSource(current.artworkPath, current.artworkUrl, 1000)
    : null
  /*
   * En el teléfono, la música tiene que seguir con la pantalla apagada, y para
   * que el sistema muestre los controles necesita la sesión en exclusiva. En
   * web no hace nada: `setAudioModeAsync` está vacío ahí.
   */
  useEffect(() => {
    void setAudioModeAsync({
      shouldPlayInBackground: true,
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
    }).catch((causa: unknown) => {
      /*
       * Que esto falle **se avisa**.
       *
       * Antes se tragaba en silencio con un comentario que decía «sin fondo,
       * pero la app funciona igual». El problema es que si esta llamada falla,
       * el síntoma que ve el usuario es exactamente «la música se corta cuando
       * salgo de la app» — sin ninguna pista de por qué, y con la causa
       * descartada de antemano en un catch vacío.
       *
       * No es fatal y por eso no rompe nada más: la app sigue andando y la
       * música suena mientras esté en pantalla. Pero es una promesa incumplida
       * y el usuario merece saberlo.
       */
      avisar(`La música no va a seguir con la pantalla apagada: ${mensajeError(causa)}`, true)
    })
  }, [])

  /*
   * La URL firmada se guarda **junto al id de su canción**.
   *
   * Así "todavía no está lista" es simplemente "la que tengo no es de la
   * canción actual", y no hace falta limpiarla desde un efecto. De paso una
   * firma que llega tarde nunca se usa para el tema equivocado.
   */
  const [fuenteEnUso, setFuenteEnUso] = useState<string | null>(null)
  const [urls, setUrls] = useState<{ trackId: string; url: string; hasta: number }[]>([])
  const urlOf = useCallback(
    (track: PlaylistTrack | null) => {
      const entrada = track ? urls.find(u => u.trackId === track.id) : undefined
      // Nunca expirar una fuente en uso. Al volver a seleccionarla, se refirma.
      const uri = entrada && (fuenteEnUso === entrada.url || entrada.hasta > Date.now()) ? entrada.url : null
      if (!uri || !track) return null
      // Una caché temporal puede haberse eliminado desde la última escucha.
      if ((uri.startsWith('file:') || uri.startsWith('app://dnmusic/_audio/')) && rutaLocal(track.audioPath, track.videoId) !== uri) return null
      return uri
    },
    [urls, fuenteEnUso],
  )

  /*
   * Las dos que el reproductor tiene en la mano: la que suena y la que sigue.
   *
   * Se anotan acá para que el descarte de abajo sepa cuáles no puede tirar. Va
   * en una ref y no en estado porque `remember` corre después de un `await` y
   * no tiene que volver a crearse por esto — si dependiera de ellas, cada
   * cambio de canción reharía los efectos que la usan.
   */
  const vivas = useRef<(string | undefined)[]>([])
  /* Se anota después de dibujar y no durante: `remember` siempre corre detrás
     de un `await signedUrl(...)`, así que para cuando lee esto ya está al día. */
  useEffect(() => {
    vivas.current = [current?.id, ...proximas.map(t => t.id)]
  }, [current?.id, proximas])

  /**
   * Guarda una URL firmada, tirando las viejas.
   *
   * **Nunca tira la de lo que está sonando.** Antes esto se quedaba con las
   * últimas tres y listo, y ahí estaba el problema: buscar una canción,
   * agregarla o renombrar la lista hace que se firmen y se precarguen otras, y
   * a la tercera la de la canción en curso se caía del borde. Su URL pasaba a
   * ser `null`, y `useAudioPlayer` —que se recrea cuando la fuente cambia—
   * destruía el reproductor y armaba uno nuevo: la música se cortaba y, cuando
   * se volvía a firmar, arrancaba de cero. Se veía como «la app me reinicia la
   * canción sola», y no tenía nada que ver con lo que uno estaba haciendo.
   *
   * El tope sigue existiendo —una URL firmada vence, y juntarlas todas sería
   * quedarse con basura por el resto de la sesión— pero se aplica solo a las
   * que ya no le importan a nadie.
   */
  const remember = useCallback((trackId: string, url: string) => {
    setUrls((prev) => {
      const hasta = /^https?:/.test(url) ? Date.now() + 50 * 60_000 : Infinity
      const todas = [{ trackId, url, hasta }, ...prev.filter((u) => u.trackId !== trackId)]
      /* Un Set y no `vivas.current.includes(…)` adentro del filtro: aquello
         recorría la cola entera por cada URL guardada, y las dos crecen juntas
         —una cola larga es justo cuando hay más URLs—. El Set se arma una vez
         por llamada y después cada consulta es constante. */
      const enLaCola = new Set(vivas.current)
      let otras = 0
      return todas.filter((u) => {
        if (enLaCola.has(u.trackId)) return true
        otras += 1
        return otras <= CACHE_URLS
      })
    })
  }, [])
  const olvidar = useCallback((trackId: string, uri: string) => {
    setUrls(prev => prev.filter(entry => entry.trackId !== trackId || entry.url !== uri))
  }, [])

  /*
   * El Jam, visto desde el motor.
   *
   * `silencioso` es «control remoto»: quien eligió escuchar en el dispositivo
   * del host. Su cola y sus controles dibujan el Jam, pero acá **no suena
   * nada** — la fuente queda en null y ni se firma. `sincronizo` es el caso
   * contrario: un invitado que reproduce localmente y tiene que mantenerse
   * pegado al reloj compartido. El host no es ninguno de los dos: él ES la
   * verdad, y corregirlo contra la derivada sería perseguirse la cola.
   */
  const enJam = useJamActivo()
  const silencioso = useJamSilencioso()
  const sincronizo = useJamSincronizo()
  const jamRev = useJamRevision()
  /*
   * El espejo de la escucha: la misma cuenta está sonando en OTRO aparato y
   * este solo dibuja. Es el mismo silencio que el control remoto del Jam —la
   * fuente queda en null y ni se firma—, con otra procedencia: acá el que
   * emite no es el host de un Jam, es tu propia computadora (o tu teléfono).
   */
  const espejo = useEscuchaEspejo()
  const mudo = silencioso || espejo
  // Si una recuperación encuentra otra fuente, volver a consultar el índice:
  // el archivo elegido pudo desaparecer desde que empezó la canción.
  const [reaperturaRevision, setReaperturaRevision] = useState(0)
  // Elegir disco al entrar a un tema; una descarga que termine durante ese
  // tema no cambia su fuente ni reinicia la reproducción.
  const idActual = current?.id
  const pathActual = current?.audioPath
  const videoActual = current?.videoId
  const fuenteLocal = useMemo(() => pathActual || videoActual ? rutaLocal(pathActual ?? '', videoActual) : null,
    // La revisión distingue volver a elegir la misma pista desde otra cola.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idActual, pathActual, videoActual, indiceLocalListo, seleccionRevision, reaperturaRevision])
  /*
   * Al seleccionar una pista se elige primero la copia local. Esa elección
   * queda fija hasta la próxima selección: una descarga que termine mientras
   * suena no recrea useAudioPlayer ni reinicia la canción. Una URL remota
   * guardada de una selección anterior no puede tapar un archivo descargado.
   */
  const url = mudo ? null : fuenteLocal ?? urlOf(current)
  useEffect(() => {
    if (!mudo && current && fuenteLocal) marcarAudioUsado(pathActual ?? '', current.videoId)
  }, [mudo, current, pathActual, fuenteLocal])
  const raf = useRef<number | null>(null)
  /** El último aviso al store, para no inundarlo. Ver `AVISO_CADA_MS`. */
  const ultimoAviso = useRef(0)

  /*
   * `keepAudioSessionActive`: que pausar o terminar **no desactive la sesión**.
   *
   * Por defecto expo-audio la desactiva cuando el reproductor pausa o termina,
   * y este reproductor además se recrea por canción — cada liberación del
   * viejo era una desactivación más. Con la sesión caída, iOS retira la ficha
   * de la pantalla bloqueada: la música seguía, pero el reproductor del
   * teléfono bloqueado desaparecía. Apple Music y Spotify mantienen la ficha
   * incluso en pausa, y esto es lo que lo hace posible.
   */
  const player = useAudioPlayer(url ? { uri: url } : null, {
    keepAudioSessionActive: true,
    preferredForwardBufferDuration: 30,
    updateInterval: 1000,
    crossOrigin: 'anonymous',
  })
  const ecualizador = useEcualizador()
  useEffect(() => {
    if (!ecualizador.cargado) return
    const aplicar = (player as typeof player & { setEqualizer?: (activo: boolean, ganancias: number[]) => void }).setEqualizer
    if (typeof aplicar !== 'function') {
      informarSoporteEcualizador('no-disponible')
      return
    }
    try {
      aplicar.call(player, ecualizador.activo, ecualizador.ganancias)
      informarSoporteEcualizador('disponible')
    } catch {
      informarSoporteEcualizador('error')
    }
  }, [player, ecualizador.cargado, ecualizador.activo, ecualizador.ganancias])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') void guardarEcualizadorAhora()
    })
    return () => { subscription.remove(); void guardarEcualizadorAhora() }
  }, [])
  const lease = useAudioLease(player)
  const playing = wantPlay && url !== null
  const bucle = !enJam && (repetir === 'una' || (repetir === 'lista' && tracks.length === 1 && upNext.length === 0 && !manual))
  useEffect(() => {
    // Repetir lo resuelve el reproductor, incluso con JS suspendido.
    // eslint-disable-next-line react-hooks/immutability
    player.loop = bucle
  }, [player, bucle])
  useEffect(() => {
    if (!playing || mudo) reportarActividadEscucha(false)
    return () => reportarActividadEscucha(false)
  }, [player, current?.id, playing, mudo])
  const appActiva = useAppActiva()
  useEspectroAudio(player, current?.videoId, playing && appActiva)

  /*
   * La ficha se publica recién con la URL cargada: es el momento en que el
   * reproductor de abajo es realmente el que suena, y publicarla antes deja al
   * sistema mostrando una canción que todavía no arrancó.
   */
  useLockScreen(
    player,
    current && url
      ? {
          title: current.title,
          artist: current.artist,
          collection: manual ? 'En la cola' : (origin?.name ?? ''),
          artworkUrl: artworkBloqueo,
        }
      : null,
    appActiva,
  )

  /*
   * De dónde saca la cola con qué seguir cuando se termina la lista.
   *
   * Se registra desde acá y no desde `state/playback` porque el servicio de
   * recomendaciones importa el de música, que importaría a playback: un ciclo.
   * Este componente ya conoce a los dos, así que es el lugar natural del puente.
   *
   * Le pasa lo que ya está esperando en la cola para que no le ofrezca lo mismo
   * dos veces.
   */
  useEffect(() => {
    /* Lo que no puede volver a ofrecer: la lista entera, lo que ya espera y lo
       que suena ahora — antes solo se vetaba lo encolado, y la tanda podía
       repetir la lista que acababa de sonar si esos temas no habían llegado al
       historial. Lo ya recorrido en esta cola (las salteadas incluidas) se
       suma recién en el momento del pedido, vía `videoIdsRecorridos`. */
    const enCola = [...tracks, ...upNext, ...(manual ? [manual] : [])].map((t) => t.videoId)
    /*
     * Los artistas de la cola, pesados por el largo de sus temas.
     *
     * Son el ancla de **respaldo** de las recomendaciones: si el historial no
     * tiene artistas con id —cuenta nueva, o escuchas anotadas sin id—, seguir
     * con algo parecido a la lista que está sonando es mejor que quedarse mudo.
     */
    const porArtista = new Map<string, ArtistaEscuchado>()
    for (const t of [...tracks, ...upNext]) {
      if (!t.artistId) continue
      const previo = porArtista.get(t.artistId)
      if (previo) previo.ms += t.durationMs
      else porArtista.set(t.artistId, { artist_id: t.artistId, artist: t.artist, ms: t.durationMs })
    }
    registerRelleno(() =>
      proximasRecomendadas([...enCola, ...videoIdsRecorridos()], [...porArtista.values()]),
    )
    return () => registerRelleno(null)
  }, [tracks, upNext, manual])

  /*
   * La próxima tanda se pide cuando la cola **se acorta**, no cuando se vacía.
   * Pedirla al final dejaba un silencio de varios segundos hasta la primera
   * recomendada —y saltear rápido dejaba los saltos muertos hasta que llegara
   * la tanda—; con la pantalla bloqueada ese silencio es fatal: sin audio
   * sonando, iOS suspende la app y la música no vuelve. La función revisa sola
   * que corresponda — modo Descubrimiento activo, sin repetir, quedan pocas de verdad.
   */
  useEffect(() => {
    if (!current || !playing) return
    rellenarSiFalta()
  }, [current, proximas, upNext.length, playing])

  /*
   * El relleno del Jam, aparte del común: lo maneja el host contra el
   * servidor (ver `rellenarJamSiFalta`), y su disparador es cada mutación del
   * Jam — el arranque de la última canción de la cola llega como un cambio de
   * `itemActual`, o sea una revisión nueva. La función revisa sola que
   * corresponda: ser host, modo Descubrimiento activo, última canción, sin tanda ya en
   * vuelo.
   */
  useEffect(() => {
    if (enJam) void rellenarJamSiFalta()
  }, [enJam, jamRev])

  /**
   * El salto que la cola pidió y el reproductor todavía no aplicó.
   *
   * `seekTo` tarda unos cuadros en reflejarse en `currentTime`, y en ese hueco
   * el reloj de abajo seguía reportando la posición **vieja**. Eso pisaba el
   * `positionMs: 0` que acababa de poner «anterior», así que el segundo toque
   * volvía a leer «va por el segundo 40» y reiniciaba otra vez: el botón nunca
   * llegaba a la canción de antes. El mismo hueco hacía parpadear la barra al
   * arrastrarla hacia atrás y, cerca del final, un reinicio podía leerse como
   * «terminó» y saltar de tema.
   *
   * Con el objetivo anotado, el reloj calla hasta que la posición aterriza
   * cerca — o hasta un tope de tiempo, para no enmudecer si el salto se pierde.
   */
  const saltoEnVuelo = useRef<{ objetivoS: number; pedidoEn: number } | null>(null)

  // Un salto no se puede expresar como estado: pedir dos veces el mismo segundo
  // tiene que saltar dos veces. La cola deja el pedido acá.
  useEffect(() => {
    registerEngine({
      seekTo: (ms) => {
        if (!lease.active) return
        saltoEnVuelo.current = { objetivoS: ms / 1000, pedidoEn: performance.now() }
        saltar(player, ms / 1000)
      },
    })
    return () => registerEngine(null)
  }, [player, lease])

  /*
   * Atenuación por canción.
   *
   * Las de lista no traen pico medido —medirlo exige decodificar el tema
   * entero, demasiado caro al agregarlo—, así que casi siempre cae en el margen
   * fijo de `headroomGain`. Alcanza para que no distorsione.
   */
  useEffect(() => {
    /*
     * Dos volúmenes multiplicados: el técnico, que evita que el códec
     * distorsione, y el que eligió quien escucha. Si el segundo pisara al
     * primero, subir la perilla al máximo traería de vuelta la distorsión.
     */
    // expo-audio expone el volumen como una propiedad mutable del reproductor.
    // La perilla pasa por `perceptualGain`: el slider es lineal en pantalla pero
    // el oído no lo es, así que la posición se curva antes de volverse gain.
    // eslint-disable-next-line react-hooks/immutability
    player.volume = headroomGain(current?.truePeak) * perceptualGain(volume)
  }, [player, current, volume])

  /*
   * Resolver una candidata de la radio, con el audio en blanco.
   *
   * Las tandas entran a la cola al instante y **sin audio** (ver
   * `proximasRecomendadas`): traer cada canción a Storage tarda segundos, y
   * hacerlo antes de encolar era lo que dejaba los saltos muertos esperando
   * la tanda. Acá se trae recién cuando hace falta: la que va a sonar, y la
   * que sigue mientras suena la actual — cada salto empuja la resolución de
   * la próxima, así la cola nunca se queda sin a dónde ir.
   *
   * El servicio comparte la resolución: la actual y la siguiente pueden
   * ser la misma canción por un cuadro al saltear rápido.
   */
  const resolver = useCallback(
    (track: PlaylistTrack) => {
      const pedido: TrackResult = { ...track, album: '', albumId: null }
      return resolveSong(pedido).then((song) => {
        completarCancion(track.videoId, {
          audioPath: song.path, artworkPath: song.artworkPath, durationMs: song.durationMs,
        })
        remember(track.id, rutaLocal(song.path, track.videoId) ?? song.url)
        return song
      })
    }, [remember],
  )

  // Firmar la URL de la canción actual. Se firma al reproducir y no antes: una
  // URL firmada vence, y una lista puede quedar abierta mucho rato.
  useEffect(() => {
    // De control remoto o de espejo no se firma nada: no hay reproductor que
    // alimentar.
    if (mudo || !wantPlay || (HAY_DESCARGAS && !indiceLocalListo && !errorIndiceLocal)) return
    // La fuente se eligió al seleccionar la pista. Si terminó una descarga
    // mientras sonaba en remoto, no reemplazarla hasta la próxima selección
    // o un fallo del player: eso recrearía el reproductor en mitad del tema.
    if (!current || fuenteLocal || urlOf(current)) return
    /*
     * Una candidata sin audio primero se resuelve. El error sí se muestra: es
     * la canción que la persona está esperando escuchar, y el servicio ya
     * devuelve el motivo en una frase para la app.
     */
    if (!current.audioPath) {
      let alive = true
      void resolver(current).catch((causa: unknown) => { if (alive) reportError(mensajeError(causa)) })
      return () => { alive = false }
    }
    // Sin descarga ni URL preparada, hay que pedir una firma para este tema.
    let alive = true
    const id = current.id
    const abort = new AbortController()
    abrirFuenteConReintento(() => signedUrl(current.audioPath), abort.signal)
      .then((next) => alive && remember(id, next))
      .catch((causa: unknown) => {
        if (!alive) return
        void registrarIncidenciaAudio({ tipo: 'agotado', motivo: mensajeError(causa), enSegundoPlano: AppState.currentState !== 'active' })
        reportError('No se pudo abrir la canción. Revisá la conexión y tocá reproducir para reintentar.')
      })
    return () => {
      alive = false
      abort.abort()
    }
  }, [current, fuenteLocal, urlOf, remember, mudo, wantPlay, resolver, indiceLocalListo, errorIndiceLocal])

  usePrecargaCola({ current, proximas, url, player, wantPlay, mudo, remember, olvidar })

  /**
   * Pasar a la siguiente, una sola vez por canción.
   *
   * El reproductor puede entregar varios estados de fin para el mismo item.
   * Esta traba impide que una notificación duplicada saltee una canción.
   */
  const ended = useRef(false)
  const finish = useCallback(() => {
    if (ended.current) return
    ended.current = true
    advance()
  }, [])

  /*
   * Cuánto se escuchó de la canción que está puesta.
   *
   * Se anota al **cambiar de tema**, no al terminarlo: así cuenta igual la que
   * saltaste a la mitad, que es escucha real, y no cuenta dos veces la que
   * dejaste sonar hasta el final —ahí el cambio también pasa por acá—.
   *
   * Va en una ref y no en estado porque nadie lo dibuja: es un dato que se
   * junta mientras suena y se despacha una vez.
   */
  /*
   * Se guarda **la canción entera**, no su id.
   *
   * Antes era `{ id, ms }` y al despachar se la buscaba con
   * `tracks.find(...) ?? manual`. Eso funcionaba solo para las de la lista: una
   * canción encolada a mano —y **todas las de la radio lo son**, llegan por
   * `upNext`— no está en `tracks`, así que la búsqueda fallaba y caía al
   * `?? manual`, que para cuando corre este efecto ya es la canción **nueva**.
   *
   * El resultado era que el tiempo de cada tema encolado se le anotaba al
   * siguiente: artista equivocado y canción equivocada. Con la radio eso se
   * vuelve grave, porque este historial es justo lo que elige las
   * recomendaciones — se habría envenenado solo, y cuanto más la usaras, peor.
   *
   * Guardando el objeto no hay nada que buscar y no puede confundirse.
   */
  const medidorEscucha = useMemo(() => crearMedidorEscucha(), [])
  const escuchado = useRef<{ track: PlaylistTrack | null; ms: number; origen: PlaybackOrigin | null }>({
    track: null,
    ms: 0,
    origen: null,
  })
  useEffect(() => {
    const previo = escuchado.current
    /* Al cambiar de canción se despacha lo de la anterior. En el primer
       dibujado no hay nada anterior que anotar. */
    if (previo.track && previo.track.id !== current?.id) {
      void anotarEscucha({
        videoId: previo.track.videoId,
        title: previo.track.title,
        artist: previo.track.artist,
        artistId: previo.track.artistId,
        artworkUrl: previo.track.artworkUrl,
        artworkPath: previo.track.artworkPath,
        /* La colección que sonaba **al despachar**: es la de la canción que
           se va, no la nueva, porque el origen cambia junto con la cola y
           esto corre antes de que la nueva empiece a contar. */
        origen: previo.origen,
        ms: previo.ms,
      })
    }
    if (previo.track?.id !== current?.id) {
      medidorEscucha.reiniciar()
      escuchado.current = { track: current, ms: 0, origen: playbackOrigin() }
    }
  }, [current, medidorEscucha])

  /*
   * Retomar donde habías dejado, al abrir la app.
   *
   * `restorePlayback` guarda y devuelve el segundo exacto en que cerraste, pero
   * ese número **se quedaba en el store**: nadie se lo pasaba nunca al
   * reproductor. Volvías a abrir, le dabas play y arrancaba en cero con el
   * contador diciendo otra cosa.
   *
   * Se salta una sola vez por canción cargada, y por eso la traba: el efecto
   * también corre cuando cambia la URL de un tema que ya venías escuchando —al
   * refirmarse, por ejemplo— y sin ella cada refirma te devolvería al segundo
   * viejo, que es peor que arrancar de cero.
   *
   * Solo el arranque: `advance` y `playAt` dejan la posición en cero al cambiar
   * de tema, así que en el uso normal esto no tiene nada que hacer.
   */
  const retomada = useRef<string | null>(null)
  const retomarMs = useRef<number | null>(null)
  useEffect(() => {
    /*
     * Un espejo no retoma nada: la posición que se ve es la del otro aparato,
     * corriendo por reloj. Se deja la memoria en blanco a propósito — al
     * traer la escucha acá (el traspaso), este mismo efecto vuelve a correr
     * con el espejo apagado y agarra el segundo exacto por el que iba.
     */
    if (espejo) {
      retomada.current = null
      retomarMs.current = null
      return
    }
    if (!current) return
    if (retomada.current === current.id) return
    retomada.current = current.id
    retomarMs.current = positionMs > 0 ? positionMs : null
  }, [current, positionMs, espejo])

  // Con la URL cargada, arranca. Es el paso que encadena una canción con la
  // siguiente sin que nadie toque nada.
  useEffect(() => {
    if (!url || !wantPlay) return
    const arrancar = () => {
      /*
       * Darle play a algo que ya terminó es empezarlo de nuevo, no quedarse
       * clavado en el final. Pero «terminó» se decide **solo con lo que sabe el
       * reproductor**, nunca con el largo que quedó guardado en la canción.
       *
       * Ese largo sale de lo que dijo YouTube al agregarla, y a veces viene
       * corto o en cero. Con él, retomar una canción pausada pasada la marca del
       * largo equivocado se leía como «ya terminó» y saltaba a cero: pausabas por
       * la mitad y volvía a empezar. `player.duration` es lo que el reproductor
       * midió del archivo que tiene abierto; mientras no lo sepa, no se toca la
       * posición, que es lo correcto — ante la duda, seguir donde estaba.
       */
      const estado = getPlaybackState()
      if (!lease.active || !estado.wantPlay || (estado.manual ?? estado.tracks[estado.index])?.id !== current?.id) return
      const total = Number.isFinite(player.duration) ? player.duration : 0
      if (total > 0 && player.currentTime >= total - END_EPSILON_S) saltar(player, 0)
      ended.current = false
      player.play()
    }
    /*
     * En un Jam, los cambios de tema traen un instante de arranque un pelo en
     * el futuro (ver `jam_tocar`): todos reciben el evento, cargan, y arrancan
     * **en el instante** — no cada uno cuando se enteró. Fuera del Jam la
     * espera es cero y esto es el arranque de siempre. `jamRev` está en las
     * dependencias como pulso: cada mutación del Jam puede traer un instante
     * nuevo que reprogramar.
     */
    const espera = jamEsperaArranqueMs()
    if (espera <= 0) {
      arrancar()
      return
    }
    const espero = setTimeout(arrancar, espera)
    return () => clearTimeout(espero)
  }, [url, wantPlay, player, lease, current?.id, jamRev])

  /*
   * Lo que pasa por fuera de la app: el final de la canción y quién la pausó.
   *
   * **El final.** Este aviso es el único que sirve con la pantalla bloqueada:
   * el reloj de más abajo corre sobre `requestAnimationFrame`, que el sistema
   * congela apenas la app deja de estar a la vista, y la canción terminaba sin
   * que nadie se enterara. El parche web también emite `didJustFinish` en
   * `ended`, para continuar en pestañas ocultas sin depender del reloj visual.
   *
   * **Quién pausó.** Los botones de la pantalla bloqueada, los auriculares y el
   * auto le hablan al reproductor por abajo, sin pasar por `state/playback`:
   * pausabas desde el auto y la app se quedaba diciendo «sonando», con el botón
   * equivocado y la barra corriendo sola. Se mira el **cambio** de estado y no
   * el estado, porque recién cargada una canción está en pausa por un instante
   * y leer eso como «alguien pausó» cortaría la cola en cada cambio de tema.
   * Solo en nativo: en web lo resuelve `lockScreen` con `mediaSession`.
   */
  const soundingBefore = useRef(false)
  const presupuesto = useRef<PresupuestoRecuperacion>({ intentos: 0 })
  useEffect(() => { presupuesto.current = { intentos: 0, posicionMs: getPlaybackState().positionMs } }, [current?.id, wantPlay, mudo])
  useEffect(() => {
    /*
     * Reproductor nuevo, memoria en blanco.
     *
     * La ref sobrevive a la recreación del reproductor —que pasa en cada cambio
     * de URL— y ahí había un agujero: saltando rápido entre canciones, la firma
     * de la nueva tarda y el reproductor recién creado reporta «paused» un rato
     * largo. Con el `true` heredado del tema anterior, el detector de abajo lo
     * leía como una pausa **tuya** y apagaba `wantPlay`: todo lo que pusieras
     * quedaba en pausa. Lo que detecta este bloque son pausas de afuera sobre
     * ESTE reproductor, así que arranca sin historia.
     */
    soundingBefore.current = false
    const mismaPista = () => {
      const actual = getPlaybackState()
      return lease.active && (actual.manual ?? actual.tracks[actual.index])?.id === current?.id
    }
    const sigue = () => mismaPista() && !mudo && !!url && getPlaybackState().wantPlay
    const vigilancia = crearVigilanteAudio({
      presupuesto: presupuesto.current,
      sigue,
      incidencia: evento => { void registrarIncidenciaAudio({ ...evento, enSegundoPlano: AppState.currentState !== 'active' }) },
      agotado: () => reportError('No se pudo continuar el audio. Revisá la conexión y tocá reproducir para reintentar. El detalle quedó en Configuración → Diagnóstico de audio.'),
      recargar: async (posicion, signal) => {
        const trackId = current?.id
        const audioPath = current?.audioPath
        if (!trackId) throw new Error('No se pudo recuperar la fuente de audio')
        const local = rutaLocal(audioPath ?? '', current?.videoId)
        let nueva: string
        if (local) nueva = local
        else {
          if (!audioPath) throw new Error('No se pudo recuperar la fuente de audio')
          nueva = await esperarAperturaAudio(() => signedUrl(audioPath), signal)
        }
        if (!sigue() || signal.aborted) return
        // Reabrir el mismo tema conservando su último segundo, sin avanzar la cola.
        const objetivoJam = enJam ? jamPosicionObjetivoMs() : null
        retomarMs.current = objetivoJam ?? posicion
        soundingBefore.current = false
        if (nueva === url) {
          player.replace({ uri: nueva })
          player.play()
        } else {
          remember(trackId, nueva)
          if (fuenteLocal && nueva !== fuenteLocal) setReaperturaRevision(revision => revision + 1)
        }
      },
    })
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (!mismaPista() || mudo || esEscuchaEspejo()) return
      reportarActividadEscucha(!mudo && status.playing && status.isLoaded && !status.isBuffering && !status.error)
      // El parche distingue una pausa explícita de un fallo que también deja
      // AVPlayer en paused. Cancela la red pendiente antes de cualquier retry.
      if ((status as typeof status & { didJustPause?: boolean }).didJustPause) {
        vigilancia.cancelar()
        soundingBefore.current = false
        if (!mudo && getPlaybackState().wantPlay) pausaExterna()
        return
      }
      setFuenteEnUso(url)
      const salto = saltoEnVuelo.current
      if (salto && (Math.abs(status.currentTime - salto.objetivoS) <= 0.75 || performance.now() - salto.pedidoEn >= 1200)) saltoEnVuelo.current = null
      const buscando = saltoEnVuelo.current !== null || retomarMs.current !== null
      escuchado.current.ms += medidorEscucha.medir(status.currentTime * 1000, performance.now(), status.playing && !status.isBuffering, buscando)
      // En background el progreso proviene sólo de eventos nativos de baja frecuencia.
      if (AppState.currentState !== 'active' && !status.error && !buscando && Number.isFinite(status.currentTime) && status.isLoaded) {
        reportProgress(status.currentTime * 1000, status.duration * 1000)
      }
      if (vigilancia.recibir(retomarMs.current !== null ? { ...status, currentTime: retomarMs.current / 1000 } : status)) { soundingBefore.current = false; reportCargada(false); return }
      reportCargada(status.isLoaded && !status.error)
      if (status.playing && status.isLoaded && !status.error) reportRecuperada()
      if (status.didJustFinish) {
        soundingBefore.current = false
        finish()
        return
      }

      /*
       * El salto para retomar, **cuando el audio está cargado de verdad**.
       *
       * Tener la URL firmada no alcanza: en ese momento AVPlayer todavía no
       * abrió el archivo, y un salto sobre un reproductor sin asset no hace
       * nada. Peor: `saltar` se traga el rechazo a propósito —tiene que
       * hacerlo, ver `lib/seek`— así que el intento fallaba en silencio y
       * volvías a arrancar en cero igual que antes.
       *
       * `isLoaded` es el primer momento en que el salto puede prender. Se
       * limpia al aplicarlo porque este aviso llega muchas veces por segundo, y
       * repetirlo te clavaría en el segundo guardado sin poder avanzar.
       */
      if (status.isLoaded && retomarMs.current != null) {
        const ms = retomarMs.current
        retomarMs.current = null
        saltar(player, ms / 1000)
      }
      /*
       * Solo iOS, y no «todo lo que no sea web», porque esto depende de que
       * `timeControlStatus` distinga **en pausa** de **esperando el buffer**:
       * sin esa diferencia, un bache de red se leería como una pausa. iOS manda
       * los tres estados de `AVPlayer`; Android solo dice «playing» o «paused»,
       * así que ahí habría que resolverlo de otra manera antes de prenderlo.
       */
      if (Platform.OS !== 'ios') return

      /*
       * Por los caminos «externos» y no por pause/resume directos: en un Jam,
       * una interrupción de audio —un reel, una llamada— pausaba por acá y el
       * intent viajaba al servidor, callando la música DE TODOS. La pausa
       * externa en Jam es local; al reanudarse, el aparato se reengancha en
       * el segundo por el que va el Jam. Fuera de un Jam son la pausa y el
       * play de siempre.
       */
      const nowPlaying = status.timeControlStatus === 'playing'
      const paused = status.timeControlStatus === 'paused'
      if (soundingBefore.current && paused) pausaExterna()
      else if (!soundingBefore.current && nowPlaying) reanudacionExterna()
      soundingBefore.current = nowPlaying
    })
    return () => { vigilancia.cancelar(); sub.remove() }
  }, [player, lease, finish, current?.id, current?.audioPath, current?.videoId, url, fuenteLocal, mudo, remember, enJam, wantPlay, medidorEscucha])

  useEffect(() => {
    if (!wantPlay) player.pause()
  }, [wantPlay, player])

  /*
   * Mantenerse pegado al reloj del Jam, sin que se oiga.
   *
   * Corre para todo el que reproduce audio dentro de un Jam. La escalera está
   * en las constantes de arriba; acá lo que importa es **quién corrige qué**:
   *
   * - Un invitado corrige todo: deriva chica estirando el tiempo, deriva
   *   grande saltando. Su reproductor persigue a la derivada del servidor.
   * - El host solo corrige saltos grandes — un seek que pidió otro—. Su
   *   reproductor ES la referencia: corregirlo contra la derivada, que lo
   *   sigue a él con la latencia de sus propios eventos, sería perseguirse
   *   la cola en círculos.
   *
   * La corrección puntual del arranque espera el instante programado más un
   * respiro, para medir contra una canción que ya está sonando y no contra el
   * silencio previo.
   */
  useEffect(() => {
    if (!enJam || silencioso || !current || !url) return
    let rateHasta: ReturnType<typeof setTimeout> | null = null

    const aVelocidadNormal = () => {
      try {
        player.setPlaybackRate(1)
      } catch {
        // La implementación web puede no tenerlo; sin corrección fina, el
        // próximo control salta si la deriva crece.
      }
    }

    const corregir = (deEvento: boolean) => {
      if (!jamSuena()) {
        aVelocidadNormal()
        return
      }
      const objetivo = jamPosicionObjetivoMs()
      const t = player.currentTime
      if (objetivo === null || !Number.isFinite(t)) return
      /*
       * Si el Jam suena y el reproductor quedó pausado por afuera —el botón
       * de los auriculares, la pantalla bloqueada— un invitado vuelve al
       * ritmo: su pausa física no pausó el Jam, y quedarse callado mientras
       * la barra avanza es el peor de los estados. El host no: su pausa
       * física ya viajó como intent por el detector de pausas externas.
       */
      if (sincronizo && wantPlay && !player.playing) player.play()

      const delta = objetivo - t * 1000
      if (Math.abs(delta) > JAM_SALTO_MS) {
        /*
         * Al host solo lo mueve **un evento**: el seek que pidió otro.
         *
         * La escalera de arriba lo dice — «su reproductor ES la referencia» —
         * pero la revisión periódica lo saltaba igual: la derivada corre sobre
         * el reloj estimado del servidor, y apenas su deriva pasaba los 400ms
         * esto le pegaba un salto al host **cada 7 segundos**. Un salto hacia
         * atrás vuelve a tocar el último medio segundo: se oía como si la
         * canción estuviera doble, con eco — sin que nadie hubiera tocado nada.
         */
        if (!sincronizo && !deEvento) return
        aVelocidadNormal()
        // Tolerancia cero: el salto cae en el milisegundo pedido, no en el
        // keyframe más cercano. Y el rechazo se traga como en `lib/seek`.
        player.seekTo(objetivo / 1000, 0, 0).catch(() => undefined)
        return
      }
      if (!sincronizo) return
      if (Math.abs(delta) < JAM_DERIVA_MIN_MS) {
        aVelocidadNormal()
        return
      }
      try {
        player.setPlaybackRate(delta > 0 ? 1.04 : 0.96, 'high')
        if (rateHasta) clearTimeout(rateHasta)
        // Lo que tarda en absorber la deriva al 4%, con un tope prudente.
        rateHasta = setTimeout(aVelocidadNormal, Math.min(3000, Math.abs(delta) / 0.04))
      } catch {
        // Sin velocidad variable no hay corrección fina; el umbral de salto
        // sigue cuidando que la deriva no se vaya de las manos.
      }
    }

    /* La puntual responde a un evento del Jam —puede traer el seek de otro—;
       la periódica solo persigue deriva, y al host no lo toca. */
    const puntual = setTimeout(() => corregir(true), jamEsperaArranqueMs() + 150)
    const periodica = setInterval(() => corregir(false), JAM_REVISA_CADA_MS)
    return () => {
      clearTimeout(puntual)
      clearInterval(periodica)
      if (rateHasta) clearTimeout(rateHasta)
      aVelocidadNormal()
    }
  }, [enJam, silencioso, sincronizo, current, url, wantPlay, player, jamRev])

  /*
   * Si la app está a la vista. **El reloj de abajo depende de esto.**
   *
   * Esta app pidió el modo de audio en segundo plano, así que cuando bloqueás la
   * pantalla iOS **no la suspende**: la deja corriendo para que siga sonando. Y
   * ahí estaba el problema — el bucle de posición asumía lo contrario. El
   * comentario de más arriba decía que «el sistema congela `requestAnimationFrame`
   * apenas la app deja de estar a la vista», y con audio de fondo eso no pasa:
   * seguía girando a sesenta cuadros por segundo, leyendo `currentTime` y
   * escribiendo en el store, con la pantalla apagada y nadie mirando.
   *
   * El resultado lo dictaminó el propio iOS, en `dnmusic.cpu_resource_fatal`:
   *
   *     Event:        cpu usage
   *     Action taken: Process killed
   *     CPU:          48 seconds cpu time over 50 seconds (97% cpu average),
   *                   exceeding limit of 80% cpu over 60 seconds
   *
   * Eso es lo que se veía como «dejo la música sonando y al rato la app se
   * cerró sola». No era un crash: el sistema la mataba por consumo.
   *
   * Con la pantalla apagada no hay ninguna barra que mover, y la posición que se
   * ve en la pantalla bloqueada no sale de acá — la publica el sistema desde
   * `MPNowPlayingInfoCenter`, que expo-audio mantiene del lado nativo. O sea que
   * el bucle no estaba sosteniendo nada, solo gastando batería hasta que lo
   * mataran.
   */
  const alaVista = useAppActiva()

  /*
   * Al volver, la posición se relee del reproductor de una sola vez.
   *
   * Mientras estuvo atrás el reloj no corrió, así que el store quedó con el
   * segundo en que bloqueaste la pantalla mientras la canción siguió sonando.
   * Sin esto, la barra aparecería atrasada hasta el siguiente cuadro.
   */
  useEffect(() => {
    if (!lease.active || mudo || esEscuchaEspejo() || !alaVista || !current || !url || retomarMs.current !== null || saltoEnVuelo.current !== null) return
    const t = player.currentTime
    if (Number.isFinite(t)) reportProgress(t * 1000, playerTotalS(player, current) * 1000)
    /* Si mientras estuvo atrás una interrupción pausó este aparato dentro de
       un Jam, volver al frente es el momento de reengancharse: el Jam siguió
       sin nosotros y hay que sumarse donde va, no donde quedamos. */
    reanudarTrasInterrupcion()
  }, [alaVista, current, player, lease, mudo, url])

  useEffect(() => {
    if (mudo || !playing || !current || !alaVista) {
      if (raf.current) cancelAnimationFrame(raf.current)
      raf.current = null
      return
    }

    const tick = () => {
      const estado = getPlaybackState()
      if (!lease.active || mudo || esEscuchaEspejo() || (estado.manual ?? estado.tracks[estado.index])?.id !== current.id) return
      const t = player.currentTime
      const total = playerTotalS(player, current)

      /* Con un salto en vuelo, `currentTime` todavía es la posición vieja: ni
         se reporta ni se mira el corte de final hasta que aterrice. Ver la
         declaración de `saltoEnVuelo`. */
      const salto = saltoEnVuelo.current
      if (salto) {
        const aterrizo = Number.isFinite(t) && Math.abs(t - salto.objetivoS) <= 0.75
        if (!aterrizo && performance.now() - salto.pedidoEn < 1200) {
          raf.current = requestAnimationFrame(tick)
          return
        }
        saltoEnVuelo.current = null
      }

      if (Number.isFinite(t)) {
        /*
         * Al store se avisa **diez veces por segundo, no sesenta**.
         *
         * Cada `reportProgress` es un `store.set`, y de ahí salen los dibujados
         * de la barra de abajo, de la letra sincronizada y de este mismo motor.
         * A sesenta cuadros eran sesenta rondas de render por segundo para mover
         * una barra de trescientos píxeles y un reloj que muestra **segundos**:
         * cincuenta de esas sesenta no cambiaban un solo píxel.
         *
         * Diez por segundo es más fino de lo que el ojo distingue en una barra
         * de progreso y de sobra para la letra, cuya sincronía se tolera en
         * decenas de milisegundos. Es el mismo criterio que ya usaba
         * `PlayerBar`, que lee su reloj cada 200ms de un shared value en vez de
         * suscribirse a esto.
         *
         * El bucle sólo anima la interfaz visible. El fin de la canción y
         * el historial usan eventos del reproductor también en segundo plano.
         */
        /* Al hilo de UI, en cambio, se le avisa **en cada cuadro**: de ahí sale
           el relleno de la barra, que no pasa por React. Ver `posicionSV`. */
        reportarPosicionFina(t * 1000)

        const ahoraMs = performance.now()
        if (ahoraMs - ultimoAviso.current >= AVISO_CADA_MS) {
          ultimoAviso.current = ahoraMs
          reportProgress(t * 1000, total * 1000)
        }

      }
      raf.current = requestAnimationFrame(tick)
    }

    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [playing, current, player, lease, alaVista, mudo])
  /* La barra dibuja el botón según esto: sin la URL firmada todavía no suena
     nada, por más que la intención de quien escucha sea reproducir. El control
     remoto de un Jam cuenta como cargado con solo tener canción: acá no se
     carga nada — el audio está sonando en el dispositivo del host. */
  useEffect(() => {
    if (!url || mudo) reportCargada(mudo && current !== null)
  }, [url, mudo, current])

  return null
}

/**
 * El largo de la canción en segundos, con lo mejor que se sepa.
 *
 * Prefiere lo que midió el reproductor sobre lo que vino guardado con la
 * canción: lo segundo sale de YouTube y a veces viene corto o en cero.
 */
function playerTotalS(
  player: { duration: number },
  track: { durationMs: number } | null,
): number {
  if (Number.isFinite(player.duration) && player.duration > 0) return player.duration
  return (track?.durationMs ?? 0) / 1000
}
