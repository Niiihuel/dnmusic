import { ClientType, Innertube, Platform, UniversalCache, YTNodes } from 'youtubei.js'
import { runInNewContext } from 'node:vm'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { mintSessionToken, mintVideoToken, tokensSinRespaldo } from './potoken.js'
import { UA_NAVEGADOR, fetchYt } from './salida.js'

const run = promisify(execFile)

/**
 * Deja el mp4 como un mp4 común.
 *
 * Lo que sirve YouTube es **fragmentado** (`moof`/`mdat` en cadena, el formato
 * de DASH) y además conserva la duración en la cabecera. Los navegadores lo
 * resuelven bien; AVFoundation suma las dos y en el iPhone una canción de 5:20
 * aparecía como 10:39, con la barra de posición y el salto a un punto igual de
 * corridos.
 *
 * `-c copy` no recodifica: mueve las cajas de lugar, no toca una muestra de
 * audio. `+faststart` deja la cabecera al principio para que empiece a sonar
 * sin bajar el archivo entero.
 *
 * Si ffmpeg no está o falla, se devuelve lo descargado tal cual: mejor una
 * duración equivocada que ninguna canción.
 */
async function remux(bytes: Buffer): Promise<Buffer> {
  let dir: string | null = null
  try {
    dir = await mkdtemp(join(tmpdir(), 'dnmusic-'))
    const entrada = join(dir, 'in.m4a')
    const salida = join(dir, 'out.m4a')
    await writeFile(entrada, bytes)
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', entrada, '-c', 'copy', '-movflags', '+faststart', salida])
    return await readFile(salida)
  } catch {
    return bytes
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Resolución de audio de YouTube Music.
 *
 * Los pasos de acá abajo son un equilibrio frágil y verificado empíricamente;
 * cada uno está donde está por una razón concreta. Si esto se rompe en el
 * futuro (va a pasar), los comentarios explican qué esperaba cada pieza.
 */

// youtubei.js v17 dejó de traer evaluador de JS por seguridad, y sin uno no se
// pueden descifrar las URLs. node:vm alcanza y mantiene el código aislado del
// scope del proceso.
let platformLoaded = false
function ensurePlatform() {
  if (platformLoaded) return
  Platform.load({
    ...Platform.shim,
    eval: (data: { output: string; exported: string[] }, env: Record<string, unknown>) => {
      // El script emitido usa `return` de nivel superior: se evalúa como cuerpo
      // de función, no como script suelto.
      const names = Object.keys(env)
      const factory = runInNewContext(
        `(function(${names.join(',')}) {\n${data.output}\n})`,
        Object.create(null),
        { timeout: 10_000 },
      )
      return factory(...names.map((n) => env[n]))
    },
  } as never)
  platformLoaded = true
}

let clientPromise: Promise<Innertube> | null = null

/**
 * Cliente MUSIC, y no WEB, a propósito.
 *
 * Al cliente WEB, YouTube ya solo le da `server_abr_streaming_url` (SABR): los
 * formatos vienen sin `url` ni `signature_cipher`, y reproducir exige hablar el
 * protocolo UMP. Al cliente MUSIC todavía le entrega URLs firmadas directas, que
 * es muchísimo menos superficie que mantener.
 */
/**
 * Cookie de una sesión de YouTube, opcional (`YT_COOKIE` en el entorno).
 *
 * Es la salida contra el anti-bot de datacenter: a la IP de Railway, YouTube
 * le responde `LOGIN_REQUIRED — Sign in to confirm you're not a bot` a
 * **todos** los clientes, con o sin PO token — la IP entera está marcada, y
 * ningún truco de cliente lo destraba. Con una sesión iniciada, el pedido vale
 * por la cuenta y no por la IP, que es exactamente lo que pide el cartel.
 *
 * Cómo conseguirla: entrar a music.youtube.com con una cuenta **de descarte**
 * (no la personal: YouTube puede marcarla), DevTools → Network → cualquier
 * pedido a music.youtube.com → copiar la cabecera `cookie` entera y pegarla en
 * la variable `YT_COOKIE` del servicio en Railway.
 */
const YT_COOKIE = process.env.YT_COOKIE

/**
 * Cuánto vive una sesión de Innertube antes de rehacerse.
 *
 * La sesión lleva un PO token **congelado al crearla**, y el integrity token
 * del que sale vence a las ~12 horas. El cache de acá era para siempre, y esa
 * diferencia era EL bug de producción: el servidor local se reinicia a cada
 * rato y nunca lo ve, pero en Railway el proceso vive días — a las doce horas
 * el token moría, YouTube respondía `LOGIN_REQUIRED` a todo, y cada /resolve
 * fallaba con «Sin formatos de audio» hasta el siguiente redeploy. Seis horas
 * deja margen de sobra.
 */
const CLIENT_TTL_MS = 6 * 60 * 60_000
let clientExpiraEn = 0
let clientNacioEn = 0

/**
 * No rehacer la sesión más seguido que esto.
 *
 * Cada sesión nueva corre el challenge de BotGuard, y una ráfaga de sesiones
 * desde la misma IP es exactamente la firma de un bot: reintentar sin freno
 * ante una tanda de fallos terminaba de quemar la IP en vez de destrabarla.
 */
const RESET_MIN_MS = 10 * 60_000

function puedeResetear(): boolean {
  return Date.now() - clientNacioEn > RESET_MIN_MS
}

/** Tira la sesión para que la próxima llamada arme una nueva. */
function resetClient() {
  clientPromise = null
  clientExpiraEn = 0
}

/**
 * Le pone a la sesión la versión de YouTube Music que corre **hoy**.
 *
 * youtubei.js trae la versión del cliente en una constante compilada, y la de
 * la copia instalada dice `1.20250219.01.00` — febrero de 2025. La que sirve
 * `music.youtube.com` hoy es de esta semana: **año y medio de diferencia**.
 * Un cliente que se anuncia con una versión de hace dieciocho meses no es lo
 * que rompe nada desde una IP limpia, pero es exactamente la clase de dato que
 * decide un caso dudoso desde una IP de datacenter.
 *
 * Sirve además para algo que ya estaba escrito y no hacía nada: más abajo,
 * `resolveAudio` reescribe el `cver` de la URL de media con
 * `session.context.client.clientVersion` para que la firma y el pedido de
 * bytes digan lo mismo. Mientras esa versión salía de la misma constante que
 * la firmó, la reescritura era una copia sobre sí misma. Con esto pasa a
 * corregir de verdad, que es lo que hace zuno.
 *
 * `originalUrl` y `graftUrl` van en el mismo viaje: es de dónde dice venir el
 * cliente, y el de verdad viene de music.youtube.com.
 *
 * No tira si falla. Una versión vieja resuelve; quedarse sin sesión, no.
 */
async function refrescarVersionDeMusica(yt: Innertube): Promise<void> {
  try {
    const res = await fetchYt('https://music.youtube.com/', {
      headers: { Accept: 'text/html', 'User-Agent': UA_NAVEGADOR },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()

    const version = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1]
    if (!version) throw new Error('la portada no traía la versión del cliente')
    const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1]

    const cliente = yt.session.context.client
    cliente.clientVersion = version
    cliente.originalUrl = 'https://music.youtube.com/'
    if (cliente.mainAppWebInfo) cliente.mainAppWebInfo.graftUrl = 'https://music.youtube.com/'
    if (apiKey) yt.session.api_key = apiKey

    console.log(`[resolve] YouTube Music ${version}`)
  } catch (e) {
    console.warn(`[resolve] sigue la versión compilada de YouTube Music: ${(e as Error).message}`)
  }
}

async function getClient(): Promise<Innertube> {
  if (clientPromise && Date.now() < clientExpiraEn) return clientPromise
  ensurePlatform()
  clientExpiraEn = Date.now() + CLIENT_TTL_MS
  clientNacioEn = Date.now()

  clientPromise = (async () => {
    /* Todo InnerTube sale por `fetchYt`: con un proxy configurado, la sesión
       entera —de la creación al último /player— ve la misma IP de salida. */
    const bootstrap = await Innertube.create({
      retrieve_player: false,
      cookie: YT_COOKIE,
      fetch: fetchYt,
      user_agent: UA_NAVEGADOR,
      retrieve_innertube_config: false,
    })
    const visitorData = bootstrap.session.context.client.visitorData
    if (!visitorData) throw new Error('No se obtuvo visitorData')

    const yt = await Innertube.create({
      client_type: ClientType.MUSIC,
      po_token: await mintSessionToken(visitorData),
      visitor_data: visitorData,
      cookie: YT_COOKIE,
      retrieve_player: true,
      /*
       * El contexto lo arma Google, no nosotros.
       *
       * Con `true`, youtubei.js lo inventa de sus constantes compiladas:
       * Windows 10, Chrome 125, y `remoteHost`, `deviceExperimentId`,
       * `rolloutToken` y `appInstallData` **vacíos**. Es un cliente que
       * ninguna instalación de YouTube produjo jamás, y desde una IP limpia
       * no importa: alcanza con parecer plausible. Desde una IP marcada, que
       * es donde vivimos, cada campo que Google no reconoce suma. Con `false`
       * pide `/sw.js_data` y usa el contexto que le devuelven — el mismo
       * criterio que el cliente de descarga de zuno, que lo justifica así:
       * un visitor id fabricado «describe una sesión que Google nunca emitió,
       * y nada en ella valida».
       *
       * El `visitor_data` sigue siendo el del bootstrap: el PO token de sesión
       * está atado a *ese*, y que la sesión use otro lo invalidaría.
       */
      generate_session_locally: false,
      /*
       * No se pide la config fría: es un POST que contesta 401 en todos los
       * clientes y nada de acá lee lo que trae. Un pedido que siempre falla no
       * ayuda a parecer un cliente sano.
       */
      retrieve_innertube_config: false,
      user_agent: UA_NAVEGADOR,
      cache: new UniversalCache(false),
      fetch: fetchYt,
    })
    await refrescarVersionDeMusica(yt)
    return yt
  })()

  /* Una creación que falló no puede quedar cacheada seis horas: se suelta para
     que el próximo pedido lo intente de nuevo. Solo si sigue siendo la actual —
     un reset ajeno pudo haber puesto otra en el medio. */
  const propia = clientPromise
  propia.catch(() => {
    if (clientPromise === propia) resetClient()
  })

  return clientPromise
}

export type YtTrack = {
  videoId: string
  title: string
  artist: string
  /** Canal del artista principal; sirve para pedir su ficha. */
  artistId: string | null
  album: string
  /** Id de navegación del álbum; null si el resultado no lo trae. */
  albumId: string | null
  artworkUrl: string
  durationMs: number
}

const GOOGLE_ARTWORK_HOST =
  /^https:\/\/(?:yt3|lh3)\.(?:googleusercontent\.com|ggpht\.com)\//
const GOOGLE_ARTWORK_SIZE = /=w\d+-h\d+(?=-|$)/

/** URL de carátula apta para el panel grande; el cliente pide variantes chicas. */
function fullArtworkUrl(url: string): string {
  if (!GOOGLE_ARTWORK_HOST.test(url)) return url
  return url.replace(GOOGLE_ARTWORK_SIZE, '=w640-h640')
}

type Thumb = { url: string; width?: number; height?: number }

/** La miniatura más grande que ofrezca el ítem, venga como array o envuelta. */
function biggestThumb(raw: unknown): Thumb | undefined {
  const thumbs: Thumb[] = Array.isArray(raw)
    ? (raw as Thumb[])
    : ((raw as { contents?: Thumb[] })?.contents ?? [])
  return thumbs.reduce<Thumb | undefined>(
    (current, candidate) =>
      (candidate.width ?? 0) * (candidate.height ?? 0) >
      (current?.width ?? 0) * (current?.height ?? 0)
        ? candidate
        : current,
    thumbs[0],
  )
}

/**
 * Una fila de canción, venga de la búsqueda o de la página de un artista.
 *
 * Las dos llegan como `MusicResponsiveListItem`, con los mismos campos: por eso
 * el mapeo es uno solo. La fila del artista además trae el álbum, que es de
 * donde sale poder ir al disco desde su top de canciones.
 */
function trackFrom(raw: unknown): YtTrack[] {
  const song = raw as {
    id?: string
    title?: string
    artists?: { name: string; channel_id?: string }[]
    album?: { name?: string; id?: string }
    duration?: { seconds?: number }
    thumbnail?: unknown
    flex_columns?: {
      title?: { runs?: { text?: string; endpoint?: { payload?: { browseId?: string } } }[] }
    }[]
  }
  if (!song.id) return []

  /*
   * En la búsqueda el álbum viene como campo; en el top de un artista, no: hay
   * que sacarlo de las columnas de texto, donde el nombre del disco es el único
   * fragmento que enlaza a una página `MPRE`. Sin esto, «Ir al álbum» quedaría
   * apagado justo donde más ganas dan de entrar.
   */
  const enlace = song.album?.id
    ? null
    : song.flex_columns
        ?.flatMap((col) => col.title?.runs ?? [])
        .find((run) => run.endpoint?.payload?.browseId?.startsWith('MPRE'))

  const album = song.album?.name ?? enlace?.text ?? ''

  /*
   * Un álbum con nombre numérico envenena la duración.
   *
   * El parser de youtubei.js busca la duración entre las columnas de texto de
   * la fila, y con el «5202» de DUKI leyó el **nombre del álbum** como si
   * fueran segundos: toda la búsqueda mostraba 86:42 (= 5202 s), canción por
   * canción. Si los segundos coinciden exactamente con un álbum de puros
   * dígitos, eso no es una duración: se deja en 0, que la app ya trata como
   * «no se sabe» — el reproductor la corrige al cargar el audio, y el resolve
   * guarda la real.
   */
  const seconds = song.duration?.seconds ?? 0
  const envenenada = /^\d+$/.test(album.trim()) && Number(album.trim()) === seconds

  return [
    {
      videoId: song.id,
      title: song.title ?? '',
      artist: song.artists?.map((a) => a.name).join(', ') ?? '',
      artistId: song.artists?.find((a) => a.channel_id)?.channel_id ?? null,
      album,
      albumId: song.album?.id ?? enlace?.endpoint?.payload?.browseId ?? null,
      artworkUrl: fullArtworkUrl(biggestThumb(song.thumbnail)?.url ?? ''),
      durationMs: envenenada ? 0 : seconds * 1000,
    },
  ]
}

export async function search(query: string, limit = 20): Promise<YtTrack[]> {
  const yt = await getClient()
  const res = await yt.music.search(query, { type: 'song' })
  return (res.songs?.contents ?? []).slice(0, limit).flatMap(trackFrom)
}

/**
 * La forma de onda de una canción, para el editor de fragmentos.
 *
 * Se mide el **RMS por tramo** y no el pico: con el pico, en material
 * masterizado fuerte casi todas las barras tocan el techo y la onda se ve como
 * un bloque. El RMS conserva la dinámica que la hace reconocible.
 *
 * Se decodifica a mono 8 kHz porque para dibujar 160 barras no hace falta más,
 * y bajar el muestreo hace la diferencia entre medio segundo y varios.
 */
export async function peaks(
  audioUrl: string,
  buckets: number,
  tramo?: { desdeMs: number; durMs: number },
): Promise<{ peaks: number[]; durationMs: number }> {
  /*
   * El tramo, cuando se pide uno.
   *
   * `-ss` va **antes** de `-i`: así ffmpeg salta hasta ahí en el archivo en vez
   * de decodificar todo lo anterior y tirarlo. Es la diferencia entre medir un
   * fragmento de quince segundos y medir la canción entera para quedarse con
   * quince segundos — que es justo lo que hace falta para dibujar la onda de un
   * fragmento en un perfil o en el chat.
   */
  const recorte = tramo
    ? ['-ss', (tramo.desdeMs / 1000).toFixed(3), '-t', (tramo.durMs / 1000).toFixed(3)]
    : []
  const { stdout } = await run(
    'ffmpeg',
    [
      '-loglevel', 'error',
      ...recorte,
      '-i', audioUrl,
      '-ac', '1', '-ar', '8000', '-f', 's16le', '-',
    ],
    { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 },
  )
  const muestras = new Int16Array(
    stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.byteLength - (stdout.byteLength % 2)),
  )
  if (!muestras.length) throw new Error('No se pudo leer el audio')

  const porTramo = Math.floor(muestras.length / buckets)
  const salida: number[] = []
  for (let b = 0; b < buckets; b++) {
    let suma = 0
    const desde = b * porTramo
    for (let i = 0; i < porTramo; i++) {
      const v = muestras[desde + i] / 32768
      suma += v * v
    }
    salida.push(Math.sqrt(suma / Math.max(porTramo, 1)))
  }

  // Normalizado: lo que importa es la forma, no el volumen absoluto.
  const max = Math.max(...salida, 1e-6)
  return {
    peaks: salida.map((p) => p / max),
    durationMs: Math.round((muestras.length / 8000) * 1000),
  }
}

export type YtArtistHit = {
  /** Id de canal (UC…): con esto se pide su página. */
  id: string
  name: string
  photoUrl: string
  /** Lo que YouTube ponga debajo del nombre, ej. "Artist · 4.3M subscribers". */
  subtitle: string
}

/**
 * Artistas que coinciden con lo buscado.
 *
 * Va aparte de `search` y no en la misma llamada porque YouTube filtra por tipo:
 * pedir todo junto devuelve un rejunte con formas distintas según la sección, y
 * dos llamadas en paralelo salen igual de rápido y se mapean sin adivinar.
 */
export async function searchArtists(query: string, limit = 4): Promise<YtArtistHit[]> {
  const yt = await getClient()
  const res = await yt.music.search(query, { type: 'artist' })
  const found = (res.artists?.contents ?? res.contents ?? []) as unknown[]

  return found
    .flatMap((raw) => {
      const item = raw as {
        id?: string
        name?: string
        title?: string
        subtitle?: { text?: string }
        subscribers?: string
        thumbnail?: unknown
        endpoint?: { payload?: { browseId?: string } }
      }
      const id = item.endpoint?.payload?.browseId ?? item.id ?? ''
      const name = item.name ?? item.title ?? ''
      // Sin canal no hay página a la que ir: la fila sería un adorno muerto.
      if (!id.startsWith('UC') || !name) return []
      return [
        {
          id,
          name,
          photoUrl: fullArtworkUrl(biggestThumb(item.thumbnail)?.url ?? ''),
          subtitle: item.subtitle?.text ?? item.subscribers ?? '',
        },
      ]
    })
    .slice(0, limit)
}

export type ResolvedAudio = {
  videoId: string
  title: string
  artist: string
  durationMs: number
  mimeType: string
  /** Extensión que le corresponde al contenedor: `m4a` o `webm`. */
  ext: 'm4a' | 'webm'
  bitrate: number
  bytes: Buffer
}

/** googlevideo rechaza el GET completo; hay que pedir por rangos. */
const CHUNK_BYTES = 1 << 20

/**
 * Con qué clientes pedir los formatos, en orden. Gana el primero que traiga
 * audio.
 *
 * Con MUSIC solo alcanzaba en desarrollo y no en producción: a la IP de un
 * datacenter (Railway), YouTube le responde al cliente MUSIC **sin
 * `streaming_data`** —su anti-bot— y todos los /resolve morían con «Sin
 * formatos de audio». En la app eso era «no puedo escuchar ni agregar ninguna
 * recomendación» y el autoplay mudo al final de la lista, mientras que lo ya
 * cacheado en Storage seguía sonando como si nada. Los clientes de TV, iOS y
 * VR pasan por otras rejas y alguno suele sobrevivir; el recorrido con caída
 * es lo mismo que hacen yt-dlp y zuno.
 */
const CLIENTES_RESOLVE = [
  'YTMUSIC',
  'TV',
  'TV_SIMPLY',
  'IOS',
  'ANDROID_VR',
  'WEB_EMBEDDED',
  'MWEB',
] as const

/**
 * Clientes que además del token de sesión piden uno **atado al video**.
 *
 * Es la familia web —incluida la de TV, que es HTML5— y es la misma lista que
 * usa yt-dlp. A un cliente de esa familia, desde una IP de datacenter y sin
 * este token, YouTube le contesta `LOGIN_REQUIRED — Sign in to confirm you're
 * not a bot`: el cartel habla de iniciar sesión, pero lo que en realidad falta
 * es la prueba de origen del contenido. Ese era el motivo de que *todos* los
 * clientes de la lista fallaran a la vez —el error que llenaba la pantalla al
 * tocar cualquier cosa del trending— mientras lo ya guardado en Storage seguía
 * sonando.
 *
 * iOS y ANDROID_VR no llevan: son clientes nativos, no pasan por BotGuard, y
 * mandarles un token web solo agrega una firma que no esperan.
 */
const TOKEN_POR_VIDEO = new Set<(typeof CLIENTES_RESOLVE)[number]>([
  'YTMUSIC',
  'TV',
  'TV_SIMPLY',
  'WEB_EMBEDDED',
  'MWEB',
])

/** Qué cliente vio el video, o por qué dijo que no cada uno. */
type Formatos =
  | { info: Awaited<ReturnType<Innertube['getBasicInfo']>>; cliente: (typeof CLIENTES_RESOLVE)[number] }
  | { info: null; razones: string[] }

async function buscarFormatos(yt: Innertube, videoId: string): Promise<Formatos> {
  /* Por qué dijo que no cada cliente, para que el error final cuente la
     historia entera: un «Sin formatos» pelado obligó a mirar los logs de
     producción para descubrir que era el anti-bot. */
  const razones: string[] = []
  /* El token del video se acuña **una vez** y lo comparten todos los clientes
     que lo piden: el minter está cacheado, pero acuñar seis veces el mismo
     token por canción no le aporta nada a nadie. Si BotGuard falla, se sigue
     sin él —es lo que hacíamos hasta ahora— en vez de tirar el /resolve. */
  let acunado: Promise<string | undefined> | null = null
  const tokenDelVideo = () =>
    (acunado ??= mintVideoToken(videoId).catch((e: unknown) => {
      console.warn(`[resolve] ${videoId} sin token de video: ${(e as Error).message}`)
      return undefined
    }))

  for (const candidato of CLIENTES_RESOLVE) {
    try {
      const intento = await yt.getBasicInfo(videoId, {
        client: candidato,
        po_token: TOKEN_POR_VIDEO.has(candidato) ? await tokenDelVideo() : undefined,
      })
      /*
       * Un formato sin URL no sirve, aunque venga listado.
       *
       * A los clientes web YouTube les está pasando a SABR: los formatos
       * aparecen en `adaptive_formats` pero sin `url` ni `signature_cipher`
       * porque el audio hay que pedirlo por el protocolo UMP. Contarlos como
       * audio encontrado cortaba la caída en seco y el /resolve moría más
       * abajo, en `decipher`, con un error que no se entendía.
       */
      const audio = (intento.streaming_data?.adaptive_formats ?? []).filter(
        (f) => f.mime_type.startsWith('audio') && (f.url || f.signature_cipher),
      )
      if (audio.length) {
        /* Que quede en los logs cuándo el titular dejó de alcanzar: si esto
           aparece seguido, el anti-bot volvió a correr la reja. */
        if (candidato !== 'YTMUSIC') console.log(`[resolve] ${videoId} vía ${candidato}`)
        return { info: intento, cliente: candidato }
      }
      const estado = intento.playability_status
      razones.push(
        `${candidato}: ${estado?.status ?? 'sin streaming_data'}${estado?.reason ? ` — ${estado.reason}` : ''}`,
      )
    } catch (e) {
      razones.push(`${candidato}: ${(e as Error).message}`)
    }
  }
  return { info: null, razones }
}

/**
 * Lo que se le muestra a quien tocó play, sacado de lo que dijeron los clientes.
 *
 * Una sola frase, en el idioma de la app y sin nombres de clientes ni códigos:
 * lo que importa del otro lado es si conviene probar otra versión, esperar, o
 * si esa canción sencillamente no se puede. El detalle técnico queda en el log,
 * que es donde sirve.
 */
function motivoParaLaApp(razones: string[]): string {
  const todo = razones.join(' ')
  if (/LOGIN_REQUIRED|not a bot/i.test(todo))
    return 'YouTube no está entregando el audio de esta canción ahora mismo. Probá con otra versión o volvé a intentar en un rato.'
  if (/AGE_(VERIFICATION|CHECK)_REQUIRED|age.?restrict/i.test(todo))
    return 'Esta canción tiene restricción de edad y no se puede reproducir acá.'
  if (/premium|members.?only|purchase|paid/i.test(todo))
    return 'Esta canción es solo para suscriptores de YouTube.'
  if (/UNPLAYABLE|unavailable|private|removed/i.test(todo))
    return 'Esta canción no está disponible. Probá con otra versión.'
  return 'No se pudo obtener el audio de esta canción.'
}

export async function resolveAudio(
  videoId: string,
  /** Avisa el avance de la **descarga** (0..1). El remux y la subida van aparte. */
  onProgreso?: (pct: number) => void,
): Promise<ResolvedAudio> {
  // La misma sesión de punta a punta: la que firmó los formatos es la única
  // cuyo reproductor los sabe descifrar.
  let yt = await getClient()
  let encontrado = await buscarFormatos(yt, videoId)

  if (!encontrado.info && puedeResetear()) {
    /*
     * Ningún cliente vio el video: el caso conocido es la sesión pasada de
     * fecha — su PO token venció y YouTube contesta `LOGIN_REQUIRED` a todo —
     * y una sesión recién nacida es exactamente lo que lo destraba. Una vez
     * sola, y nunca sobre una sesión joven: si acaba de nacer y tampoco puede,
     * rehacerla no aporta nada más que ruido de bot (ver `RESET_MIN_MS`).
     */
    console.log(`[resolve] ${videoId} sin formatos; reintento con sesión nueva`)
    resetClient()
    yt = await getClient()
    encontrado = await buscarFormatos(yt, videoId)
  }
  if (!encontrado.info) {
    /*
     * El detalle entero va al log; a la app, una frase.
     *
     * Saber qué contestó cada cliente es justo lo que hace falta para
     * diagnosticar el anti-bot, y por eso se arma. Pero ese párrafo llegaba
     * tal cual a la pantalla: seis renglones de «Sign in to confirm you're not
     * a bot» encima de la biblioteca, que a quien solo quería escuchar una
     * canción no le dicen nada y encima rompían el panel.
     */
    /* Cuál de las dos rejas fue. `LOGIN_REQUIRED` sale igual cuando la IP está
       marcada y cuando la atestación fue rechazada, y el arreglo de cada una
       no tiene nada que ver con el de la otra: proxy/IP residencial contra
       BotGuard. Sin esta línea hay que adivinar.

       Ojo con el «sin token de reserva»: dice que Google **aceptó acuñar**, no
       que vaya a honrar lo acuñado. Está medido —dos corridas, orden y videos
       cruzados— que en la misma ventana de tiempo un token de jsdom se comía un
       403 pasado el primer MiB mientras uno acuñado en un navegador de verdad
       servía los bytes. O sea: la atestación de jsdom es más débil, y este
       renglón solo descarta el caso ruidoso. */
    const reja = tokensSinRespaldo()
      ? 'BotGuard rechazó este runtime (PO tokens sin respaldo)'
      : 'BotGuard acuñó sin quejarse — puede ser la IP, o un token de jsdom que igual no honran'
    console.error(`[resolve] ${videoId} sin formatos [${reja}] — ${encontrado.razones.join('; ')}`)
    throw new Error(motivoParaLaApp(encontrado.razones))
  }

  const { info, cliente } = encontrado
  const formats = (info.streaming_data?.adaptive_formats ?? []).filter((f) =>
    f.mime_type.startsWith('audio'),
  )

  /*
   * Se prefiere **AAC en mp4**, aunque Opus venga con más bitrate.
   *
   * YouTube ofrece las dos cosas y Opus siempre gana por calidad por bit, que
   * es lo que miraba este código antes. El problema es que iOS no sabe
   * decodificar WebM ni Opus: en el navegador sonaba impecable y en el teléfono
   * no sonaba absolutamente nada, sin error ni pista. Un códec que anda en los
   * dos lados vale más que unos kbps.
   *
   * Si algún video no ofreciera mp4 —raro en música— se cae al mejor de todos:
   * mejor que suene en la web a que no suene en ningún lado.
   */
  const enMp4 = formats.filter((f) => f.mime_type.startsWith('audio/mp4'))
  const candidatos = enMp4.length ? enMp4 : formats
  const best = candidatos.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]
  let url = await best.decipher(yt.session.player)

  /*
   * youtubei.js estampa `cver` desde su propia constante compilada, que puede
   * estar meses atrasada respecto de la versión que la sesión negoció. La
   * llamada a /player firma como un cliente y la petición de media dice ser
   * otro; googlevideo responde 403 sin cuerpo. `cver` no entra en la firma, así
   * que reescribirlo es seguro. (Truco tomado de zuno.) La versión buena la
   * pone `refrescarVersionDeMusica`; sin ella esto se copiaba sobre sí mismo.
   *
   * Solo para el cliente MUSIC: la versión que negoció la sesión es la de
   * MUSIC, y estampársela a una URL firmada por el cliente de TV o iOS crearía
   * exactamente el desajuste que este parche arregla.
   */
  const cver = yt.session.context.client.clientVersion
  if (cver && cliente === 'YTMUSIC')
    url = url.replace(/([?&]cver=)[^&]*/, `$1${encodeURIComponent(cver)}`)

  /*
   * El `pot` de la URL de media va atado al video, no a la sesión.
   *
   * Se elimina el parámetro entero antes de agregar el nuevo. Dejarlo vacío
   * (`&pot=`) y añadir otro produce dos `pot` en la URL: googlevideo toma el
   * primero, lo encuentra inválido y sirve exactamente 1 MB antes de cortar con
   * 403 — el mismo síntoma que no tener token.
   *
   * Cirugía sobre el string y no URLSearchParams: re-serializar la query
   * re-codifica valores que ya están percent-exactos y una URL firmada no
   * sobrevive a que la normalicen.
   */
  url = url
    .replace(/&pot=[^&]*/g, '')
    .replace(/\?pot=[^&]*&/, '?')
    .replace(/\?pot=[^&]*$/, '')
  const videoToken = await mintVideoToken(videoId)
  url += `${url.includes('?') ? '&' : '?'}pot=${encodeURIComponent(videoToken)}`

  /*
   * El primer rango dice el total; el resto baja **en paralelo**.
   *
   * En serie, una canción de 4 MB eran cuatro viajes encadenados a
   * googlevideo, y esa espera era el grueso de lo que tarda un /resolve
   * nuevo. Son exactamente los mismos bytes —ni un kbps menos—, solo que
   * llegan juntos. De a cuatro a la vez y no todos: una ráfaga de decenas de
   * rangos sobre la misma URL firmada es la forma de que googlevideo corte
   * con 403.
   *
   * Un rango que falla ahora **tira**, no recorta: el `break` de antes
   * guardaba en Storage lo que hubiera llegado, y una canción trunca cacheada
   * es para siempre — el caché de arriba no la vuelve a pedir nunca.
   */
  const pedir = async (desde: number) => {
    // googlevideo por la misma salida que firmó la URL: cambiar de IP a mitad
    // de camino es una de las formas clásicas del 403.
    const res = await fetchYt(url, {
      headers: {
        Range: `bytes=${desde}-${desde + CHUNK_BYTES - 1}`,
        /*
         * Las cabeceras que manda el reproductor de verdad.
         *
         * Este pedido salía con `Range` a secas: sin User-Agent propio, sin
         * origen y sin las `Sec-Fetch-*` que Chrome pone en **todo** pedido de
         * media. googlevideo sirve igual a una IP limpia, pero es el último
         * tramo del recorrido y el único que mueve bytes de verdad; llegar
         * hasta acá con la sesión atestada y pedir el audio con cara de script
         * es tirar el trabajo en la puerta. Mismo criterio que
         * `fetch_audio_bytes` de zuno.
         */
        'User-Agent': UA_NAVEGADOR,
        Origin: 'https://music.youtube.com',
        Referer: 'https://music.youtube.com/',
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
      },
    })
    /*
     * Un 200 en un rango que no arranca en cero es el archivo ENTERO metido en
     * el medio: pegado con los demás daría un audio con las tablas del
     * contenedor apuntando a bytes corridos — se «reproduce», pero suena roto.
     * Mejor fallar y reintentar que cachear eso para siempre.
     */
    if (res.status !== 206 && !(res.status === 200 && desde === 0)) {
      throw new Error(`googlevideo respondió ${res.status} al rango ${desde}`)
    }
    const range = res.headers.get('content-range')
    const inicio = range ? Number(range.split(' ')[1]?.split('-')[0]) : desde
    if (Number.isFinite(inicio) && inicio !== desde) {
      throw new Error(`googlevideo sirvió el rango ${inicio} en vez de ${desde}`)
    }
    return {
      buf: Buffer.from(await res.arrayBuffer()),
      total: range ? Number(range.split('/')[1]) : null,
    }
  }

  const primero = await pedir(0)
  if (!primero.buf.length) throw new Error('No se descargó audio')
  const total = primero.total
  const chunks: Buffer[] = [primero.buf]

  if (total !== null && total > primero.buf.length) {
    const desde: number[] = []
    for (let o = primero.buf.length; o < total; o += CHUNK_BYTES) desde.push(o)
    const PARALELO = 4
    const resto: Buffer[] = new Array<Buffer>(desde.length)
    let puntero = 0
    // El primero ya está; el avance se cuenta sobre los pedazos terminados.
    const pedazos = desde.length + 1
    let listos = 1
    onProgreso?.(listos / pedazos)
    await Promise.all(
      Array.from({ length: Math.min(PARALELO, desde.length) }, async () => {
        while (puntero < desde.length) {
          const i = puntero++
          resto[i] = (await pedir(desde[i])).buf
          listos++
          // Nunca 100% antes de tiempo: falta remuxar y subir; eso lo cierra
          // la línea final del stream.
          onProgreso?.(Math.min(0.98, listos / pedazos))
        }
      }),
    )
    chunks.push(...resto)
  } else {
    // Un solo pedazo (o sin largo conocido): a mitad de camino y listo.
    onProgreso?.(0.5)
  }

  const crudo = Buffer.concat(chunks)
  /* Exacto, no «al menos»: bytes de más son tan corruptos como bytes de menos. */
  if (total !== null && crudo.length !== total) {
    throw new Error(`Descarga inconsistente: ${crudo.length} de ${total} bytes`)
  }
  const esMp4 = best.mime_type.startsWith('audio/mp4')

  return {
    videoId,
    title: info.basic_info.title ?? '',
    artist: info.basic_info.author ?? '',
    durationMs: (info.basic_info.duration ?? 0) * 1000,
    mimeType: best.mime_type.split(';')[0],
    ext: best.mime_type.startsWith('audio/mp4') ? 'm4a' : 'webm',
    bitrate: best.bitrate ?? 0,
    bytes: esMp4 ? await remux(crudo) : crudo,
  }
}

/**
 * Verifica y prepara un audio que **aportó un cliente**, antes de guardarlo.
 *
 * Existe por la resolución comunitaria: cuando la IP de este servidor está en
 * la reja anti-bot, los dispositivos con IP residencial (Electron, iOS)
 * resuelven ellos y mandan los bytes. Pero el bucket es de todos —una canción
 * se guarda una vez y suena para siempre—, así que **nada entra sin pasar por
 * acá**: un cliente malicioso no puede envenenar el caché con un archivo que
 * no sea el audio que dice ser.
 *
 * Tres controles, todos del lado del servidor:
 *   1. ffprobe confirma que es audio AAC en contenedor mp4 — el único formato
 *      que aceptamos de un aporte, porque es el único que suena en iOS.
 *   2. La duración medida tiene que coincidir con la esperada (la que el
 *      catálogo ya conocía): un archivo válido pero de otra canción rebota.
 *   3. El remux es **estricto**: si ffmpeg no puede reescribir el contenedor,
 *      el aporte se rechaza — a diferencia del remux del camino propio, que
 *      ante la duda devuelve los bytes tal cual porque confía en su origen.
 */
export async function prepararAporte(
  crudo: Buffer,
  duracionEsperadaMs: number | null,
): Promise<{ bytes: Buffer; durationMs: number }> {
  let dir: string | null = null
  try {
    dir = await mkdtemp(join(tmpdir(), 'dnmusic-aporte-'))
    const entrada = join(dir, 'in.m4a')
    await writeFile(entrada, crudo)

    const { stdout } = await run('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=format_name,duration:stream=codec_type,codec_name',
      '-of', 'json',
      entrada,
    ])
    const info = JSON.parse(String(stdout)) as {
      format?: { format_name?: string; duration?: string }
      streams?: { codec_type?: string; codec_name?: string }[]
    }
    const contenedor = info.format?.format_name ?? ''
    if (!/mp4|m4a|mov/.test(contenedor)) {
      throw new Error(`no es un contenedor mp4 (${contenedor || 'ilegible'})`)
    }
    const audio = (info.streams ?? []).find((s) => s.codec_type === 'audio')
    if (!audio || audio.codec_name !== 'aac') {
      throw new Error(`no trae audio AAC (${audio?.codec_name ?? 'sin audio'})`)
    }
    const durationMs = Math.round(Number(info.format?.duration ?? 0) * 1000)
    if (!Number.isFinite(durationMs) || durationMs < 15_000) {
      throw new Error(`dura ${durationMs}ms, demasiado corto para una canción`)
    }
    if (
      duracionEsperadaMs !== null &&
      duracionEsperadaMs > 0 &&
      Math.abs(durationMs - duracionEsperadaMs) > 7_000
    ) {
      throw new Error(
        `dura ${durationMs}ms y el catálogo esperaba ${duracionEsperadaMs}ms: no es esta canción`,
      )
    }

    const salida = join(dir, 'out.m4a')
    await run('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-i', entrada,
      '-c', 'copy', '-movflags', '+faststart',
      salida,
    ])
    return { bytes: await readFile(salida), durationMs }
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// ── Ficha del artista ──────────────────────────────────────────────────────

/**
 * Una canción del top de un artista.
 *
 * Lleva el año del disco al que pertenece, que YouTube no pone en la fila pero
 * sí en el carrusel de álbumes: se cruza acá, del lado del servidor, porque es
 * el único lugar donde las dos listas están juntas.
 */
export type YtArtistSong = YtTrack & { year: number | null }

export type YtArtist = {
  name: string
  photoUrl: string
  /**
   * Proporción real de la foto (ancho/alto).
   *
   * Se manda para que el cliente la dibuje con su forma y no recorte cabezas:
   * las fotos de artista de YouTube son apaisadas (~2.4:1) y encajarlas en un
   * recuadro fijo obliga a cortar.
   */
  photoAspect: number | null
  description: string
  /** Texto tal cual lo da YouTube, ej. "4.32 million". */
  subscribers: string | null
  /**
   * Artistas relacionados: la sección «Fans might also like» de la página.
   *
   * Es un grafo de co-escucha que calcula YouTube sobre el comportamiento
   * agregado de todo el mundo —quién escucha a quién junto con quién—, no algo
   * que infiera esta app. Acá se consume como se consume su catálogo.
   *
   * Se venía descartando junto con «Videos» por no ser un destino navegable.
   * Sigue sin serlo, pero es la única puerta que tenemos a artistas que quien
   * escucha todavía no conoce: la recomendación propia solo sabe de su historial
   * y por definición nunca sale de él.
   */
  relacionados: YtHomeItem[]
  /** Lo más escuchado, en el orden que lo devuelve YouTube. */
  topSongs: YtArtistSong[]
  /** Discos y EPs, del más nuevo al más viejo. */
  albums: YtHomeItem[]
  /** Simples. Van aparte porque no son lo mismo que un disco. */
  singles: YtHomeItem[]
}

/**
 * Qué es cada estante de la página del artista.
 *
 * YouTube los titula en inglés cuando no hay sesión con idioma, y en español
 * cuando sí: se miran las dos formas porque el título es lo único que dice qué
 * hay adentro — el tipo de nodo es el mismo para todos.
 */
function shelfKind(title: string): 'songs' | 'albums' | 'singles' | 'relacionados' | null {
  const t = title.toLocaleLowerCase('es')
  if (t.includes('song') || t.includes('canci')) return 'songs'
  if (t.includes('album') || t.includes('álbum')) return 'albums'
  if (t.includes('single') || t.includes('simple')) return 'singles'
  /*
   * Los artistas relacionados. YouTube Music titula esta sección de varias
   * formas según el idioma y el momento —«Fans might also like», «Los fans
   * también escuchan», «Artistas similares»— así que se reconoce por las
   * palabras que sobreviven a todas las variantes en vez de por un título
   * exacto, que se rompería con el próximo cambio de copy.
   */
  if (t.includes('fan') || t.includes('similar') || t.includes('relacionad') || t.includes('parecid'))
    return 'relacionados'
  return null
}

export async function getArtist(channelId: string): Promise<YtArtist> {
  const yt = await getClient()
  const artist = await yt.music.getArtist(channelId)

  /*
   * Las secciones vienen todas mezcladas —el top de canciones como `MusicShelf`
   * y los discos como carruseles— y sin nada que las distinga salvo el título.
   * Las que no reconocemos («Videos», «Fans might also like») se descartan: son
   * paseos laterales que no llevan a ningún lado dentro de la app.
   */
  const topSongs: YtTrack[] = []

  const albums: YtHomeItem[] = []
  const singles: YtHomeItem[] = []
  const relacionados: YtHomeItem[] = []
  for (const raw of artist.sections ?? []) {
    const shelf = raw as unknown as {
      title?: { text?: string }
      header?: { title?: { text?: string } }
      contents?: unknown[]
    }
    const kind = shelfKind(shelf.header?.title?.text ?? shelf.title?.text ?? '')
    if (!kind) continue
    const contents = shelf.contents ?? []
    if (kind === 'songs') topSongs.push(...contents.flatMap(trackFrom))
    else if (kind === 'albums') albums.push(...contents.flatMap(mapHomeItem))
    else if (kind === 'singles') singles.push(...contents.flatMap(mapHomeItem))
    else {
      /* `mapHomeItem` ya sabe leer un artista: le saca el `browseId` que empieza
         con UC y lo marca como `artist`. Se filtra por eso y no por confiar en
         que la sección traiga solo artistas — a veces mezcla videos. */
      relacionados.push(...contents.flatMap(mapHomeItem).filter((i) => i.kind === 'artist'))
    }
  }

  const header = artist.header as unknown as {
    title?: { text?: string }
    description?: { text?: string }
    thumbnail?: { contents?: { url: string; width?: number; height?: number }[] }
    subscription_button?: { subscribe_accessibility_label?: string }
  }

  const thumbs = header?.thumbnail?.contents ?? []
  const biggest = thumbs.reduce<{ url: string; width?: number; height?: number } | undefined>(
    (a, b) => ((a?.width ?? 0) >= (b.width ?? 0) ? a : b),
    thumbs[0],
  )

  /*
   * El conteo de suscriptores no viene como dato: solo aparece dentro de la
   * etiqueta de accesibilidad del botón de suscripción
   * ("Subscribe to this channel. 4.32 million"). Se extrae de ahí porque no hay
   * otro lugar donde YouTube Music lo exponga.
   */
  const label = header?.subscription_button?.subscribe_accessibility_label ?? ''
  const match = /([\d.,]+\s*(?:million|thousand|mil|K|M|B)?)\s*$/i.exec(label.trim())

  return {
    name: header?.title?.text ?? '',
    photoUrl: biggest?.url ?? '',
    photoAspect:
      biggest?.width && biggest?.height ? biggest.width / biggest.height : null,
    description: header?.description?.text ?? '',
    subscribers: match ? match[1].trim() : null,
    relacionados,
    topSongs: topSongs.map((song) => ({
      ...song,
      year: [...albums, ...singles].find((r) => r.id === song.albumId)?.year ?? null,
    })),
    albums: byYearDesc(albums),
    singles: byYearDesc(singles),
  }
}

/** Lo más nuevo primero; lo que no tiene año se va al final sin reordenarse. */
function byYearDesc(items: YtHomeItem[]): YtHomeItem[] {
  return [...items].sort((a, b) => (b.year ?? -1) - (a.year ?? -1))
}

export type YtAlbumTrack = {
  videoId: string
  title: string
  artist: string
  durationMs: number
}

export type YtAlbum = {
  title: string
  artist: string
  /** Texto tal cual lo da YouTube, ej. "2017 · 10 canciones". */
  subtitle: string
  artworkUrl: string
  tracks: YtAlbumTrack[]
}

/**
 * Un álbum con sus canciones.
 *
 * El id de álbum viaja en cada resultado de búsqueda (`albumId`); sin él no hay
 * forma de llegar acá, porque YouTube Music no permite buscar un álbum por
 * nombre y quedarse con el correcto.
 *
 * La cabecera viene en dos formas según qué versión de la interfaz responda
 * —`MusicDetailHeader` o `MusicResponsiveHeader`— y los campos no se llaman
 * igual en las dos. Se leen las dos y gana la que tenga algo.
 */
export async function getAlbum(albumId: string): Promise<YtAlbum> {
  const yt = await getClient()
  const album = await yt.music.getAlbum(albumId)
  return collectionFrom(album.header, album.contents ?? [])
}

/**
 * Una lista de YouTube Music, en la misma forma que un álbum.
 *
 * Se devuelven iguales a propósito: del lado de la app las dos son «una tapa y
 * una lista de canciones», y darles formas distintas obligaría a dos pantallas
 * para dibujar lo mismo.
 *
 * El id llega con el prefijo `VL` cuando sale de la portada —así es como
 * YouTube marca la *vista* de una lista— y la API lo quiere sin él.
 */
export async function getPlaylistInfo(playlistId: string): Promise<YtAlbum> {
  const yt = await getClient()
  const clean = playlistId.startsWith('VL') ? playlistId.slice(2) : playlistId
  const playlist = await yt.music.getPlaylist(clean)
  return collectionFrom(playlist.header, playlist.contents ?? [])
}

function collectionFrom(rawHeader: unknown, contents: unknown[]): YtAlbum {
  const header = rawHeader as unknown as {
    title?: { text?: string }
    subtitle?: { text?: string }
    strapline_text_one?: { text?: string }
    second_subtitle?: { text?: string }
    author?: { name?: string }
    thumbnail?:
      | { contents?: { url: string; width?: number; height?: number }[] }
      | { url: string }[]
  }
  const thumbs = Array.isArray(header?.thumbnail)
    ? header.thumbnail
    : (header?.thumbnail?.contents ?? [])
  const biggest = thumbs.reduce<{ url: string; width?: number; height?: number } | undefined>(
    (a, b) => (((a as { width?: number })?.width ?? 0) >= ((b as { width?: number }).width ?? 0) ? a : b),
    thumbs[0],
  )

  const albumArtist = header?.strapline_text_one?.text ?? header?.author?.name ?? ''

  /*
   * Adentro de un álbum, YouTube no repite el artista en cada canción: se da
   * por sobreentendido que es el del álbum. Si lo dejáramos vacío, la fila se
   * vería a medias, así que se completa con el del álbum.
   */
  const tracks = contents.map((item) => {
    const song = item as unknown as {
      id?: string
      title?: string
      artists?: { name: string }[]
      authors?: { name: string }[]
      duration?: { seconds?: number }
    }
    /*
     * De dónde sale el artista, en orden.
     *
     * En un álbum viene vacío —se sobreentiende que es el del disco— y en una
     * lista aparece a veces como `artists` y a veces como `authors`, según de
     * dónde la haya armado YouTube. El último recurso es el artista de la
     * colección, que en un álbum es exacto y en una lista queda vacío antes
     * que mentir.
     */
    const quien =
      song.artists?.map((a) => a.name).join(', ') ||
      song.authors?.map((a) => a.name).join(', ') ||
      albumArtist
    /* La misma guarda que `trackFrom`: una colección con nombre numérico
       («5202» de DUKI) puede colarse como si fuera la duración de cada fila. */
    const seconds = song.duration?.seconds ?? 0
    const titulo = (header?.title?.text ?? '').trim()
    const envenenada = /^\d+$/.test(titulo) && Number(titulo) === seconds
    return {
      videoId: song.id ?? '',
      title: song.title ?? '',
      artist: quien,
      durationMs: envenenada ? 0 : seconds * 1000,
    }
  }).filter((t) => t.videoId)

  return {
    title: header?.title?.text ?? '',
    artist: albumArtist,
    subtitle: header?.subtitle?.text ?? header?.second_subtitle?.text ?? '',
    artworkUrl: fullArtworkUrl(biggest?.url ?? ''),
    tracks,
  }
}

export type YtHomeItem = {
  /** Qué es: define a dónde lleva al tocarlo. */
  kind: 'song' | 'album' | 'playlist' | 'artist'
  /** videoId para canciones; id de navegación para el resto. */
  id: string
  title: string
  subtitle: string
  artworkUrl: string
  /**
   * El canal del artista, cuando el ítem es una canción y YouTube lo trae.
   *
   * Sin esto, una escucha nacida en la portada se anotaba sin id de artista, y
   * el historial que alimenta las recomendaciones no la podía usar: quien
   * escuchaba solo desde la portada llegaba al final de la cola y el autoplay
   * no tenía de dónde sacar con qué seguir.
   */
  artistId: string | null
  /**
   * Año de salida, sacado del subtítulo («Album • 2019»).
   *
   * No viene como dato aparte, pero es lo único con lo que se puede ordenar la
   * discografía de alguien: sin esto, los discos salen en el orden arbitrario
   * en que YouTube arme el carrusel.
   */
  year: number | null
}

export type YtHomeSection = {
  title: string
  items: YtHomeItem[]
}

/**
 * La portada de YouTube Music, en carruseles.
 *
 * Es lo que llena el panel principal cuando no hay ninguna lista abierta: en
 * vez de un cartel diciendo «elegí una lista», hay música para mirar. Cada
 * sección viene ya armada por YouTube —novedades, mezclas, lo que escuchaste—
 * así que no hay que inventar ningún criterio de recomendación.
 *
 * Se filtra sin piedad: cualquier ítem sin id utilizable no sirve para nada
 * salvo ocupar lugar, porque no se puede abrir ni reproducir.
 */
export async function getHome(): Promise<YtHomeSection[]> {
  const yt = await getClient()

  /*
   * Dos fuentes, en este orden.
   *
   * `getExplore` es la que trae lo que uno espera de una portada —álbumes
   * nuevos, lo que está sonando— y no depende de tener sesión. `getHomeFeed`
   * sin cuenta iniciada devuelve poco y nada: un par de carruseles de listas.
   * Juntas alcanzan; por separado, ninguna llena la pantalla.
   */
  const [explore, feed] = await Promise.all([
    yt.music.getExplore().catch(() => null),
    yt.music.getHomeFeed().catch(() => null),
  ])

  const shelves = [
    ...((explore as unknown as { sections?: unknown[] } | null)?.sections ?? []),
    ...(feed?.sections ?? []),
  ]

  const sections: YtHomeSection[] = []
  for (const shelf of shelves) {
    const s = shelf as unknown as {
      title?: { text?: string }
      header?: { title?: { text?: string } }
      contents?: unknown[]
    }
    const title = s.header?.title?.text ?? s.title?.text ?? ''
    const items = (s.contents ?? []).flatMap((raw) => mapHomeItem(raw))
    // Una sección sin nada abrible es una fila de huecos: mejor no mostrarla.
    if (title && items.length) sections.push({ title, items })
  }
  return sections
}

type HomeItemFlexColumn = {
  title?: {
    text?: string
    runs?: {
      text?: string
      endpoint?: { payload?: { browseId?: string; videoId?: string } }
    }[]
  }
}

function mapHomeItem(raw: unknown): YtHomeItem[] {
  let item = raw as {
    id?: string
    title?: { text?: string } | string
    subtitle?: {
      text?: string
      runs?: { text?: string; endpoint?: { payload?: { browseId?: string } } }[]
    }
    subtitles?: { text?: string }[]
    artists?: { name: string; channel_id?: string }[]
    item_type?: string
    endpoint?: { payload?: { browseId?: string; videoId?: string } }
    thumbnail?:
      | { contents?: { url: string; width?: number; height?: number }[] }
      | { url: string; width?: number; height?: number }[]
    /* Las filas planas («Trending», «New music videos») llegan como
       MusicResponsiveListItem: dos columnas de texto y nada más. */
    flex_columns?: HomeItemFlexColumn[]
  }

  /*
   * El canal del artista escondido en el subtítulo.
   *
   * En los ítems altos («New music videos», «New releases») el artista no viene
   * como campo: es el primer fragmento del subtítulo, y el que enlaza a una
   * página `UC`. Sin esto, esas canciones — justo los lanzamientos nuevos —
   * se anotaban sin `artistId` y el historial que alimenta las recomendaciones
   * no las podía usar.
   */
  const canalDelSubtitulo = item.subtitle?.runs?.find((run) =>
    run.endpoint?.payload?.browseId?.startsWith('UC'),
  )?.endpoint?.payload?.browseId

  /*
   * La fila plana de la portada, traducida al idioma del ítem alto.
   *
   * «Trending» y «New music videos» no traen `title` ni `subtitle` como campos:
   * traen `flex_columns`, donde la primera columna es el título completo y la
   * segunda junta «artista • N vistas». Leerlos como si fuera un
   * MusicTwoRowItem daba canciones sin artista y sin `artistId` — justo los
   * lanzamientos nuevos, que es lo primero que se toca — y el historial que
   * alimenta recomendaciones las perdía todas.
   *
   * El canal del artista sale del primer fragmento de la segunda columna que
   * enlace a una página `UC`; el resto de esa columna («• 704K views») queda
   * como subtítulo, igual a como lo muestra YouTube.
   */
  if (item.flex_columns?.length) {
    const primera = item.flex_columns[0]
    const segunda = item.flex_columns[1]
    const artista = (segunda?.title?.runs ?? []).find((run) =>
      run.endpoint?.payload?.browseId?.startsWith('UC'),
    )
    item = {
      ...item,
      title: primera?.title?.text,
      subtitle: segunda?.title ? { text: segunda.title.text ?? '' } : item.subtitle,
      ...(artista?.endpoint?.payload?.browseId
        ? {
            artists: [
              { name: artista.text ?? '', channel_id: artista.endpoint.payload.browseId },
            ],
          }
        : {}),
      /* Sin `item_type` propio, estas filas dependen de que el id se parezca a
         una canción: decírselo explícito vale más que deducir. */
      item_type: item.item_type ?? 'video',
    }
  }

  const thumbs = Array.isArray(item.thumbnail) ? item.thumbnail : (item.thumbnail?.contents ?? [])
  const biggest = thumbs.reduce<{ url: string; width?: number }|undefined>(
    (a, b) => ((a?.width ?? 0) >= (b.width ?? 0) ? a : b),
    thumbs[0],
  )

  const title = typeof item.title === 'string' ? item.title : (item.title?.text ?? '')
  const subtitle =
    item.subtitle?.text ??
    item.subtitles?.map((x) => x.text).filter(Boolean).join(' · ') ??
    item.artists?.map((a) => a.name).join(', ') ??
    ''

  const esCancion = item.item_type === 'song' || item.item_type === 'video'
  const videoId = item.endpoint?.payload?.videoId ?? (esCancion ? item.id : undefined)
  const browseId = item.endpoint?.payload?.browseId

  /*
   * El tipo lo dice `item_type` cuando está; si no, se deduce del prefijo del
   * id de navegación, que es como YouTube distingue sus páginas: MPRE para
   * álbumes, UC para canales de artista, VL/RD para listas.
   */
  let kind: YtHomeItem['kind'] | null = null
  let id = ''
  if (videoId) {
    kind = 'song'
    id = videoId
  } else if (browseId?.startsWith('MPRE')) {
    kind = 'album'
    id = browseId
  } else if (browseId?.startsWith('UC')) {
    kind = 'artist'
    id = browseId
  } else if (browseId) {
    kind = 'playlist'
    id = browseId
  }

  if (!kind || !id || !title) return []
  const year = /\b(19|20)\d{2}\b/.exec(subtitle)
  return [
    {
      kind,
      id,
      title,
      subtitle,
      artworkUrl: fullArtworkUrl(biggest?.url ?? ''),
      /* Mismo criterio que la búsqueda: el primer artista con canal. El canal
         del subtítulo entra como último recurso, que es el único lugar donde
         viven los videos oficiales nuevos. */
      artistId:
        kind === 'song'
          ? (item.artists?.find((a) => a.channel_id)?.channel_id ??
            canalDelSubtitulo ??
            null)
          : null,
      year: year ? Number(year[0]) : null,
    },
  ]
}

/* ── Géneros y momentos ─────────────────────────────────────────────────────
 *
 * La página «Moods & genres» de YouTube Music (`FEmusic_moods_and_genres`):
 * una lista de categorías —géneros y estados de ánimo— y, adentro de cada
 * una, sus listas y álbumes. Es la materia prima de la grilla de géneros de
 * la portada, al modo de Apple Music.
 */

export type YtGenero = {
  /** El parámetro opaco con el que YouTube abre la página de la categoría. */
  params: string
  name: string
  /** Una tapa representativa: la primera lista de la categoría. */
  artworkUrl: string
}

/**
 * Los géneros cambian una vez cada tanto y armarlos cuesta una llamada por
 * categoría (la tapa representativa): un día entero de caché en memoria.
 */
const GENEROS_TTL_MS = 24 * 60 * 60 * 1000
let generosCache: { at: number; generos: YtGenero[] } | null = null

export async function getGeneros(): Promise<YtGenero[]> {
  if (generosCache && Date.now() - generosCache.at < GENEROS_TTL_MS) {
    return generosCache.generos
  }

  const yt = await getClient()
  const page = await yt.actions.execute('/browse', {
    browse_id: 'FEmusic_moods_and_genres',
    client: 'YTMUSIC',
    parse: true,
  })
  const botones = page.contents_memo?.getType(YTNodes.MusicNavigationButton) ?? []

  /* La misma categoría puede aparecer dos veces (arriba en «moods», abajo en
     «genres»): se queda la primera. */
  const vistos = new Set<string>()
  const crudos: { params: string; name: string }[] = []
  for (const boton of botones) {
    const payload = boton.endpoint?.payload as
      | { browseId?: string; params?: string }
      | undefined
    if (payload?.browseId !== 'FEmusic_moods_and_genres_category') continue
    if (!payload.params || !boton.button_text || vistos.has(payload.params)) continue
    vistos.add(payload.params)
    crudos.push({ params: payload.params, name: boton.button_text })
  }

  /*
   * La tapa de cada categoría es la de su primera lista: los botones de
   * YouTube no traen imagen —son chips de color— y una grilla al modo de
   * Apple Music vive de las fotos. Se piden de a seis para no clavarle
   * veinte llamadas juntas a YouTube; con el caché de un día, este costo se
   * paga una vez por proceso.
   */
  const generos: YtGenero[] = []
  const LOTE = 6
  for (let i = 0; i < crudos.length; i += LOTE) {
    const tanda = await Promise.all(
      crudos.slice(i, i + LOTE).map(async (g) => {
        const artworkUrl = await getGenero(g.params)
          .then((cat) => cat.items[0]?.artworkUrl ?? '')
          .catch(() => '')
        return { ...g, artworkUrl }
      }),
    )
    generos.push(...tanda)
  }

  generosCache = { at: Date.now(), generos }
  return generos
}

/** Una categoría: sus listas y álbumes, en la forma de la portada. */
export async function getGenero(params: string): Promise<{ items: YtHomeItem[] }> {
  const yt = await getClient()
  const page = await yt.actions.execute('/browse', {
    browse_id: 'FEmusic_moods_and_genres_category',
    params,
    client: 'YTMUSIC',
    parse: true,
  })
  const nodos =
    page.contents_memo?.getType(YTNodes.MusicTwoRowItem, YTNodes.MusicResponsiveListItem) ?? []

  /* `mapHomeItem` ya sabe leer estos nodos: son los mismos de la portada. Un
     ítem repetido entre secciones de la categoría se muestra una sola vez. */
  const unicos = new Map<string, YtHomeItem>()
  for (const nodo of nodos) {
    for (const item of mapHomeItem(nodo)) {
      if (!unicos.has(item.id)) unicos.set(item.id, item)
    }
  }
  return { items: [...unicos.values()] }
}

/** Una semilla del onboarding, tal como la guarda el cliente. */
export type SemillaEntrada = { kind: string; ref: string; name: string }

/**
 * El home tejido de lo que la persona eligió, no la portada genérica.
 *
 * Por cada género que marcó en el onboarding se arma una fila con sus listas
 * —lo que `getGenero` ya sabe traer—, y el cliente las pone arriba de la
 * portada de YouTube Music: primero lo suyo, después lo nuevo para descubrir.
 * Es el salto de una portada igual para todos a un inicio que arranca sonando
 * a lo que dijo que le gusta.
 *
 * Sin cuenta de YouTube, como todo acá: sale de la misma sesión anónima que el
 * resto. Las semillas viajan en el pedido —el cliente ya las tiene— así que el
 * servidor no toca la base para esto.
 *
 * De mejor esfuerzo por fila: un `params` viejo que YouTube ya no reconoce
 * devuelve vacío y esa fila no se dibuja, sin llevarse las demás. Se acota a
 * seis géneros: más que eso es un home que no termina de cargar nunca.
 */
export async function getHomeGeneros(semillas: SemillaEntrada[]): Promise<YtHomeSection[]> {
  const generos = semillas
    .filter((s) => s.kind === 'genero' && typeof s.ref === 'string' && s.ref && s.name)
    .slice(0, 6)

  const secciones = await Promise.all(
    generos.map(async (g) => {
      try {
        const { items } = await getGenero(g.ref)
        /* La fila vacía no se muestra: prometer un género y no traer nada es
           peor que no ofrecerlo. Doce alcanzan para un carrusel. */
        return items.length ? { title: g.name, items: items.slice(0, 12) } : null
      } catch {
        return null
      }
    }),
  )
  return secciones.filter((s): s is YtHomeSection => s !== null)
}
