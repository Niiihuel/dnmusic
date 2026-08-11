import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { Directory, File, Paths } from 'expo-file-system'
import { excluirDeCopias } from '../../modules/backup-exclusion'
import { artworkRemoto, registerArteLocal } from '../lib/artwork'
import { mensajeError } from '../lib/mensajeError'
import { signedUrl } from '../services/music'
import type { PlaylistTrack } from '../services/playlists'
import { avisar } from './aviso'
import { createStore, useStore } from './store'

/**
 * Las canciones guardadas en el teléfono, para escuchar sin internet.
 *
 * Es el único lugar de la app donde vive un archivo. Todo lo demás —el audio, las
 * carátulas, las listas— está en Supabase y se pide cuando hace falta, que es lo
 * correcto mientras haya conexión y lo único que no sirve cuando no la hay: en el
 * subte, en un avión, o simplemente sin datos.
 *
 * **Se indexa por `audioPath`, no por canción.** Una misma canción puede estar en
 * dos listas y en la radio de recomendados, y en cada lado tiene un `id`
 * distinto —el de `playlist_tracks`, o el `radio:...` que arma el recomendador—.
 * Lo que no cambia nunca es el archivo en Storage, que es `{videoId}.m4a`. Con esa
 * clave, bajarla una vez la deja bajada **en todos lados**, y quitarla de una
 * lista no borra el archivo que otra sigue usando.
 *
 * **Solo en el teléfono.** En web `expo-file-system` no hace nada: cada método
 * imprime un aviso en la consola y devuelve vacío. Así que en vez de descargas
 * rotas, en web no hay descargas — `HAY_DESCARGAS` es lo que consultan las
 * pantallas para no dibujar controles que no podrían cumplir. El navegador ya
 * cachea el audio por su cuenta, que es lo más parecido que puede ofrecer.
 */

/** Si esta plataforma puede guardar archivos. Ver arriba. */
export const HAY_DESCARGAS = Platform.OS !== 'web'

/** Dónde viven los archivos, dentro de Documents. */
const CARPETA = 'descargas'
/** El índice de lo bajado. Los archivos son la verdad; esto es el catálogo. */
const CLAVE = 'descargas:v1'
/**
 * Espacio que se deja libre pase lo que pase.
 *
 * Llenar el disco de un teléfono no rompe solo a esta app: rompe la cámara, las
 * actualizaciones y el propio sistema. Trescientos megas es el colchón por debajo
 * del cual no se empieza ninguna descarga.
 */
const MARGEN_LIBRE = 300 * 1024 * 1024
/**
 * Cada cuánto se le avisa al store el progreso.
 *
 * `onProgress` llega muchísimas veces por segundo, y cada aviso es un `store.set`
 * que redibuja la lista entera. Es exactamente la forma del problema que nos hizo
 * matar la app por consumo de CPU en segundo plano —ver el comentario largo de
 * `MotorAudio`— así que acá se corta de entrada: cinco veces por segundo, y solo
 * si el porcentaje entero cambió.
 */
const AVISO_CADA_MS = 200

/**
 * En qué anda una canción.
 *
 * No hay estado `error`: una descarga que falla **se borra del índice** y vuelve
 * a ser una canción sin bajar. Dejarla marcada como fallada obligaría a quien
 * mira a limpiarla a mano antes de reintentar, y no hay nada que limpiar — el
 * archivo no llegó a existir.
 */
export type EstadoDescarga = 'espera' | 'bajando' | 'lista'

export type Descarga = {
  audioPath: string
  artworkPath: string | null
  videoId: string
  title: string
  artist: string
  estado: EstadoDescarga
  /** 0..1 mientras baja; 1 cuando está. */
  progreso: number
  /** Lo que ocupa en el teléfono. 0 hasta que termina. */
  bytes: number
  /**
   * Si la carátula también quedó guardada.
   *
   * Se anota en vez de preguntarle al disco. `arteLocal` corre **al dibujar cada
   * imagen** —cincuenta filas de una lista son cincuenta llamadas por render— y
   * `File.exists` es una lectura de disco síncrona: preguntarlo ahí congelaba el
   * hilo de JavaScript en cada cuadro de scroll. Bajar la carátula puede fallar
   * sin que falle la canción, así que el dato no se puede deducir de `estado`.
   */
  arte: boolean
}

type Estado = {
  /** Por `audioPath`. Ver el comentario de arriba. */
  items: Record<string, Descarga>
  /** Si ya se leyó el índice del disco. Antes de eso no se sabe nada. */
  cargado: boolean
}

const store = createStore<Estado>({ items: {}, cargado: false })

/* ── Los archivos ────────────────────────────────────────────────────────── */

/**
 * La carpeta, creada al primer uso.
 *
 * Es perezosa a propósito: `Paths.document` es una llamada al módulo nativo, y
 * en web eso escupe un aviso en la consola apenas se importa este archivo. Nadie
 * lo pide hasta que hay algo que bajar, y en web no lo pide nunca.
 */
let carpetaCache: Directory | null = null

function carpeta(): Directory {
  if (carpetaCache) return carpetaCache
  const dir = new Directory(Paths.document, CARPETA)
  dir.create({ intermediates: true, idempotent: true })
  /*
   * Fuera de la copia de iCloud, una vez por sesión.
   *
   * Va acá y no por archivo porque en iOS el atributo se hereda: lo que se cree
   * adentro después queda excluido igual. Ver `modules/backup-exclusion`.
   */
  excluirDeCopias(dir.uri)
  carpetaCache = dir
  return dir
}

/**
 * El nombre en disco, derivado de la ruta de Storage.
 *
 * Es determinista para que el índice no tenga que guardarlo: con la ruta alcanza
 * para volver a encontrar el archivo, y así un índice a medio escribir nunca
 * apunta a un nombre que no existe.
 *
 * Hoy las rutas son `{videoId}.m4a` y `{videoId}.jpg`, que ya son nombres
 * válidos. El reemplazo es por si algún día dejan de serlo — una barra en el
 * nombre crearía una carpeta, y una ruta con `..` escribiría fuera de la nuestra.
 */
function nombreSeguro(path: string): string {
  return path.replace(/[^A-Za-z0-9._-]/g, '_')
}

function archivoAudio(audioPath: string): File {
  return new File(carpeta(), nombreSeguro(audioPath))
}

/* La carátula lleva prefijo: si algún día audio y arte compartieran extensión,
   uno pisaría al otro sin que nadie se entere. */
function archivoArte(artworkPath: string): File {
  return new File(carpeta(), `arte-${nombreSeguro(artworkPath)}`)
}

/**
 * La URI de algo adentro de la carpeta, **sin tocar el sistema de archivos**.
 *
 * `new File(...)` construye un objeto nativo, y las consultas de arriba corren
 * al dibujar. Con la carpeta ya resuelta, armar la ruta es pegar dos strings.
 */
function uriEn(nombre: string): string {
  const base = carpeta().uri
  return base.endsWith('/') ? `${base}${nombre}` : `${base}/${nombre}`
}

/** Borra sin quejarse si no estaba. Lo que se quería es que no exista. */
function borrarSiEsta(archivo: File) {
  try {
    if (archivo.exists) archivo.delete()
  } catch {
    // Un archivo que no se puede borrar no puede frenar nada de lo que sigue.
  }
}

/* ── Consultas ───────────────────────────────────────────────────────────── */

/**
 * El archivo local de una canción, si está bajada. `null` si no.
 *
 * Es síncrono porque quien lo llama —el motor, al elegir de dónde suena— no
 * puede esperar: cualquier `await` acá sería un hueco entre canciones.
 */
export function rutaLocal(audioPath: string): string | null {
  if (!HAY_DESCARGAS) return null
  const item = store.get().items[audioPath]
  if (!item || item.estado !== 'lista') return null
  try {
    return uriEn(nombreSeguro(audioPath))
  } catch {
    return null
  }
}

/**
 * Lo mismo para la carátula. Lo consulta `lib/artwork` por el puente.
 *
 * Se busca **por la canción a la que pertenece**, no por su propia ruta: el
 * índice está armado por `audioPath` y la carátula es un dato de la canción. El
 * recorrido corta al primer acierto y no toca el disco —eso es lo que dice el
 * campo `arte`—, así que es una comparación de strings sobre las canciones
 * bajadas y nada más.
 */
function arteLocal(artworkPath: string): string | null {
  if (!HAY_DESCARGAS) return null
  for (const item of Object.values(store.get().items)) {
    if (item.artworkPath !== artworkPath) continue
    if (item.estado !== 'lista' || !item.arte) return null
    try {
      return uriEn(`arte-${nombreSeguro(artworkPath)}`)
    } catch {
      return null
    }
  }
  return null
}

/** Lo que ocupan todas juntas, en bytes. */
export function espacioUsado(items: Record<string, Descarga>): number {
  return Object.values(items).reduce((suma, d) => suma + d.bytes, 0)
}

/** Cuántas hay guardadas del todo. Las que están bajando todavía no cuentan. */
export function cuantasListas(items: Record<string, Descarga>): number {
  return Object.values(items).filter((d) => d.estado === 'lista').length
}

/**
 * Cómo está una lista entera. Lo usa el botón de la cabecera.
 *
 * `progreso` mezcla las que ya están con lo que va de la que baja, así la barra
 * avanza parejo en vez de saltar de canción en canción.
 */
export function resumenLista(
  tracks: PlaylistTrack[],
  items: Record<string, Descarga>,
): { total: number; listas: number; bajando: number; progreso: number } {
  let listas = 0
  let bajando = 0
  let parcial = 0
  for (const track of tracks) {
    const item = items[track.audioPath]
    if (!item) continue
    if (item.estado === 'lista') {
      listas += 1
      parcial += 1
    } else {
      bajando += 1
      parcial += item.progreso
    }
  }
  const total = tracks.length
  return { total, listas, bajando, progreso: total > 0 ? parcial / total : 0 }
}

/** «128 MB», para mostrarlo. */
export function formatoBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (mb < 1024) return `${Math.round(mb)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

/* ── El índice guardado ──────────────────────────────────────────────────── */

/** Solo las terminadas: una a medio bajar no sobrevive a cerrar la app. */
function guardarIndice() {
  const listas = Object.values(store.get().items).filter((d) => d.estado === 'lista')
  void AsyncStorage.setItem(CLAVE, JSON.stringify(listas)).catch(() => {
    // Sin índice se pierde el catálogo, no los archivos: la próxima carga los
    // encuentra huérfanos y los limpia. Peor sería frenar la descarga por esto.
  })
}

/**
 * Lee el índice y lo **contrasta contra el disco**. Lo llama el layout al arrancar.
 *
 * Los dos pueden no coincidir, y en las dos direcciones:
 *
 * - Una entrada sin archivo. Pasa si iOS liberó espacio, si alguien borró los
 *   datos de la app, o si el proceso murió entre bajar y guardar el índice. Se
 *   descarta: prometer que una canción está bajada cuando no está es peor que no
 *   ofrecerla.
 * - Un archivo sin entrada. Es basura de una descarga que quedó a mitad de camino
 *   —el proceso se cerró mientras bajaba— y ocuparía espacio para siempre sin que
 *   nadie sepa que está. Se borra.
 *
 * Además vuelve a leer el tamaño real de cada archivo en vez de confiar en lo
 * guardado, así el «espacio usado» que se muestra en Ajustes es el de verdad.
 */
export async function cargarDescargas() {
  if (!HAY_DESCARGAS) {
    store.set({ cargado: true })
    return
  }

  /* El puente para las carátulas se registra siempre, aunque no haya nada
     guardado: puede haberlo dentro de un rato. Ver `lib/artwork`. */
  registerArteLocal(arteLocal)

  const items: Record<string, Descarga> = {}
  try {
    const crudo = await AsyncStorage.getItem(CLAVE)
    const guardadas = crudo ? (JSON.parse(crudo) as Descarga[]) : []
    for (const d of guardadas) {
      if (!d?.audioPath) continue
      const archivo = archivoAudio(d.audioPath)
      if (!archivo.exists || archivo.size <= 0) continue
      /* La carátula se comprueba **acá y solo acá**: es una lectura de disco, y
         este es el único momento en que corre una vez por canción y no una vez
         por dibujado. Ver el comentario del campo `arte`. */
      const arte = d.artworkPath ? archivoArte(d.artworkPath).exists : false
      items[d.audioPath] = { ...d, estado: 'lista', progreso: 1, bytes: archivo.size, arte }
    }
  } catch {
    // El índice no se entiende: se arranca sin nada y la limpieza de abajo se
    // lleva los archivos sueltos.
  }

  try {
    const esperados = new Set<string>()
    for (const d of Object.values(items)) {
      esperados.add(nombreSeguro(d.audioPath))
      if (d.arte && d.artworkPath) esperados.add(`arte-${nombreSeguro(d.artworkPath)}`)
    }
    for (const entrada of carpeta().list()) {
      if (entrada instanceof File && !esperados.has(entrada.name)) borrarSiEsta(entrada)
    }
  } catch {
    // Sin limpieza, pero con el índice al día.
  }

  store.set({ items, cargado: true })
  guardarIndice()
}

/* ── La cola ─────────────────────────────────────────────────────────────── */

/*
 * Se baja **de a una**.
 *
 * No es por prudencia abstracta: bajar un disco entero en paralelo satura la
 * conexión, y esta app está reproduciendo música al mismo tiempo. El audio que
 * suena tiene prioridad sobre el que se guarda para después — si se cortara la
 * canción para bajar más rápido las siguientes, la función estaría trabajando en
 * contra de lo único que la app hace.
 */
const cola: string[] = []
let bajando: string | null = null
let tarea: { cancel: () => void } | null = null
/**
 * Si ya se avisó de una falla en esta tanda.
 *
 * Sin esto, quedarse sin señal con veinte canciones encoladas serían veinte
 * carteles seguidos diciendo lo mismo. Se vuelve a habilitar cuando la cola se
 * vacía, así la próxima tanda sí puede avisar.
 */
let avisado = false
/**
 * La que se canceló a mano, para no confundirla con una que falló.
 *
 * Cancelar hace que `downloadAsync()` **rechace**, igual que un corte de red. Sin
 * distinguirlas, quitar una descarga mientras bajaba te tiraba un cartel rojo
 * diciendo que no se pudo bajar la canción que vos mismo acababas de sacar.
 */
let cancelado: string | null = null

function actualizar(audioPath: string, cambios: Partial<Descarga>) {
  const items = store.get().items
  const actual = items[audioPath]
  if (!actual) return
  store.set({ items: { ...items, [audioPath]: { ...actual, ...cambios } } })
}

function sacar(audioPath: string) {
  const items = { ...store.get().items }
  delete items[audioPath]
  store.set({ items })
}

/**
 * Pone una canción en la cola. Si ya está bajada o en camino, no hace nada.
 *
 * No devuelve promesa: quien la llama es un botón, y lo que le importa es que la
 * canción quede marcada al instante. Cómo va la bajada se ve en el store.
 */
export function descargar(track: PlaylistTrack) {
  if (!HAY_DESCARGAS || !track.audioPath) return
  if (store.get().items[track.audioPath]) return

  store.set({
    items: {
      ...store.get().items,
      [track.audioPath]: {
        audioPath: track.audioPath,
        artworkPath: track.artworkPath,
        videoId: track.videoId,
        title: track.title,
        artist: track.artist,
        estado: 'espera',
        progreso: 0,
        bytes: 0,
        arte: false,
      },
    },
  })
  cola.push(track.audioPath)
  void arrancar()
}

/** Toda una lista de un saque. Las que ya estén se saltean solas. */
export function descargarLista(tracks: PlaylistTrack[]) {
  for (const track of tracks) descargar(track)
}

/**
 * Saca una canción del teléfono: borra los archivos y la marca.
 *
 * Si es la que está bajando en este momento, se cancela la tarea nativa. No pide
 * confirmación a propósito: volver a bajarla es un toque, así que esto no es una
 * pérdida sino un cambio de opinión.
 */
export function quitarDescarga(audioPath: string) {
  if (!HAY_DESCARGAS) return
  const item = store.get().items[audioPath]
  if (!item) return

  const enCola = cola.indexOf(audioPath)
  if (enCola >= 0) cola.splice(enCola, 1)
  if (bajando === audioPath) {
    cancelado = audioPath
    tarea?.cancel()
    tarea = null
  }

  try {
    borrarSiEsta(archivoAudio(audioPath))
    if (item.artworkPath) borrarSiEsta(archivoArte(item.artworkPath))
  } catch {
    // La entrada se va igual: lo que quede suelto lo limpia el próximo arranque.
  }
  sacar(audioPath)
  guardarIndice()
}

export function quitarLista(tracks: PlaylistTrack[]) {
  for (const track of tracks) quitarDescarga(track.audioPath)
}

/** Todo. Es lo que ofrece Ajustes para recuperar espacio de una. */
export function borrarTodo() {
  if (!HAY_DESCARGAS) return
  cola.length = 0
  cancelado = bajando
  tarea?.cancel()
  tarea = null
  /* `bajando` no se toca: lo limpia el `finally` de `arrancar` cuando la tarea
     nativa termine de rechazar. Ponerlo en null acá dejaría arrancar una segunda
     descarga en paralelo con la que se está muriendo. */
  try {
    const dir = carpeta()
    if (dir.exists) dir.delete()
    carpetaCache = null
  } catch {
    // Si la carpeta no se pudo borrar, el índice vacío deja de ofrecer los
    // archivos y el próximo arranque los limpia por huérfanos.
  }
  store.set({ items: {} })
  guardarIndice()
}

/**
 * Baja la primera de la cola, y al terminar sigue con la que venga.
 *
 * Es recursiva por el final y no un bucle `while` para que cada canción sea una
 * pasada limpia: si algo lanza a mitad de camino, lo único que se pierde es esa.
 */
async function arrancar() {
  if (bajando) return
  const audioPath = cola.shift()
  if (!audioPath) {
    avisado = false
    return
  }
  /* Puede haber sido quitada mientras esperaba su turno. */
  if (!store.get().items[audioPath]) {
    void arrancar()
    return
  }

  bajando = audioPath
  actualizar(audioPath, { estado: 'bajando', progreso: 0 })

  try {
    await bajarUna(audioPath)
  } catch (causa) {
    /*
     * La entrada se borra y la canción vuelve a estar «sin bajar». El archivo a
     * medio escribir también: en iOS `downloadAsync` mueve al destino recién
     * cuando termina, así que normalmente no hay nada, pero una cancelación en
     * Android sí puede dejarlo.
     */
    const item = store.get().items[audioPath]
    try {
      borrarSiEsta(archivoAudio(audioPath))
      if (item?.artworkPath) borrarSiEsta(archivoArte(item.artworkPath))
    } catch {
      // Ya se hizo lo que se podía.
    }
    sacar(audioPath)
    /* Cancelada a mano no es un fallo: es exactamente lo que se pidió. */
    if (!avisado && cancelado !== audioPath) {
      avisado = true
      avisar(`No se pudo descargar «${item?.title ?? 'la canción'}»: ${mensajeError(causa)}`, true)
    }
  } finally {
    if (cancelado === audioPath) cancelado = null
    bajando = null
    tarea = null
  }

  void arrancar()
}

async function bajarUna(audioPath: string) {
  const item = store.get().items[audioPath]
  if (!item) return

  if (Paths.availableDiskSpace < MARGEN_LIBRE) {
    throw new Error('no queda espacio en el teléfono')
  }

  /*
   * La URL se firma **acá y no antes**: una firma vence, y con una cola larga la
   * de la última se habría emitido veinte minutos antes de usarse.
   */
  const url = await signedUrl(audioPath)
  const destino = archivoAudio(audioPath)
  /* Un archivo previo haría fallar la descarga por destino ocupado. Si está, es
     de un intento que no llegó a registrarse. */
  borrarSiEsta(destino)

  let ultimoAviso = 0
  let ultimoPct = -1
  const task = File.createDownloadTask(url, destino, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      /* `totalBytes` viene en -1 cuando el servidor no manda Content-Length: sin
         total no hay porcentaje que mostrar, y la barra se queda indeterminada. */
      if (totalBytes <= 0) return
      const pct = Math.round((bytesWritten / totalBytes) * 100)
      const ahora = Date.now()
      if (pct === ultimoPct || ahora - ultimoAviso < AVISO_CADA_MS) return
      ultimoPct = pct
      ultimoAviso = ahora
      actualizar(audioPath, { progreso: pct / 100 })
    },
  })
  tarea = task

  const archivo = await task.downloadAsync()
  /* `null` es «la tarea quedó en pausa». Nadie la pausa acá, así que llegar a
     esto significa que no terminó, y una canción a medias no se puede ofrecer. */
  if (!archivo || !destino.exists || destino.size <= 0) {
    throw new Error('la descarga quedó incompleta')
  }

  /*
   * La carátula, después y sin poder fallar la operación.
   *
   * Sin ella la canción suena igual; lo único que se ve es el cuadro vacío que
   * ya se veía antes de que existieran las descargas. Frenar por una imagen de
   * treinta kilobytes sería desproporcionado.
   */
  let conArte = false
  if (item.artworkPath) {
    try {
      const remoto = artworkRemoto(item.artworkPath)
      if (remoto) {
        const arte = archivoArte(item.artworkPath)
        borrarSiEsta(arte)
        await File.downloadFileAsync(remoto, arte, { idempotent: true })
        conArte = arte.exists && arte.size > 0
      }
    } catch {
      // Queda la del CDN, que es lo que había antes.
    }
  }

  actualizar(audioPath, {
    estado: 'lista',
    progreso: 1,
    bytes: destino.size,
    arte: conArte,
  })
  guardarIndice()
}

/* ── Para las pantallas ──────────────────────────────────────────────────── */

/**
 * El estado entero.
 *
 * Devuelve el objeto completo y no un pedazo calculado a propósito:
 * `useSyncExternalStore` compara por identidad, y un selector que arme un objeto
 * nuevo en cada llamada —«cuántas de esta lista están bajadas»— redibujaría para
 * siempre. Las cuentas las hace quien dibuja, con `resumenLista`.
 */
export const useDescargas = () => useStore(store, (s) => s)

/** Solo esta canción. Es lo que mira una fila para saber qué ícono poner. */
export const useDescarga = (audioPath: string | undefined) =>
  useStore(store, (s) => (audioPath ? (s.items[audioPath] ?? null) : null))
