import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import type { Directory, File } from 'expo-file-system'
import { excluirDeCopias } from '../../modules/backup-exclusion'
import { artworkRemoto, registerArteLocal } from '../lib/artwork'
import { mensajeError } from '../lib/mensajeError'
import { signedUrl } from '../services/music'
import type { PlaylistTrack } from '../services/playlists'
import { leerAjustes } from './ajustes'
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
 * **Solo en el teléfono, y solo con el binario al día.** En web
 * `expo-file-system` no hace nada —cada método imprime un aviso y devuelve
 * vacío— y en una app compilada antes de que esto existiera los módulos nativos
 * directamente no están. En los dos casos `HAY_DESCARGAS` es falso y las
 * pantallas no dibujan un control que no podrían cumplir; ver el bloque de abajo,
 * que es donde se decide.
 */

/*
 * Los dos módulos nativos se cargan **a mano y sin reventar si no están**.
 *
 * `expo-file-system` y `expo-network` usan `requireNativeModule`, que **lanza
 * cuando se importa** si el binario no los trae. Y este archivo lo importa el
 * layout, así que un `import` normal arriba de todo convierte «esta versión no
 * tiene descargas» en «la app no abre»: pantalla roja al arrancar, sin nada que
 * se pueda hacer desde la app.
 *
 * Eso pasa siempre que se suma una dependencia nativa, y pasa en un caso que es
 * completamente normal: cualquier development client o TestFlight compilado
 * **antes** de que existiera esta función. Es el mismo motivo por el que
 * `modules/remote-commands` y `modules/audio-route` se resuelven de forma
 * opcional; acá el paquete no ofrece esa variante, así que el `try` lo escribe
 * este archivo.
 *
 * El `require` va con la ruta escrita literal y no en una variable: Metro
 * resuelve las dependencias leyendo el código, y con un nombre calculado no
 * empaquetaría el módulo.
 */
type ModuloArchivos = typeof import('expo-file-system')
type ModuloRed = typeof import('expo-network')

let modArchivos: ModuloArchivos | null = null
let modRed: ModuloRed | null = null

if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modArchivos = require('expo-file-system') as ModuloArchivos
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modRed = require('expo-network') as ModuloRed
  } catch {
    /* Binario viejo. La app arranca igual y las descargas no existen: la
       pantalla de Ajustes no dibuja su grupo y las listas no dibujan el botón. */
    modArchivos = null
    modRed = null
  }
}

/**
 * Si esta plataforma **y este binario** pueden guardar archivos.
 *
 * Es lo que consultan las pantallas para no ofrecer un control que no podrían
 * cumplir. Ver arriba los dos motivos por los que puede ser falso.
 */
export const HAY_DESCARGAS = modArchivos !== null && modRed !== null

/* Los accesores no devuelven `null` para que las llamadas de abajo no arrastren
   un `?.` cada una: todas corren detrás de `HAY_DESCARGAS`, así que si alguna
   llegara acá sin módulo es un error nuestro y tiene que sonar como tal. */
function fs(): ModuloArchivos {
  if (!modArchivos) throw new Error('Esta versión de la app no puede descargar canciones.')
  return modArchivos
}

function net(): ModuloRed {
  if (!modRed) throw new Error('Esta versión de la app no puede descargar canciones.')
  return modRed
}

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
  /**
   * La cola está frenada esperando Wi-Fi.
   *
   * Se muestra porque si no la app parecería colgada: canciones marcadas para
   * bajar que no bajan nunca, sin ninguna explicación en pantalla. Con esto, la
   * fila de Ajustes dice qué está pasando y qué hay que hacer.
   */
  esperandoWifi: boolean
}

const store = createStore<Estado>({ items: {}, cargado: false, esperandoWifi: false })

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
  const dir = new (fs().Directory)(fs().Paths.document, CARPETA)
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
  return new (fs().File)(carpeta(), nombreSeguro(audioPath))
}

/* La carátula lleva prefijo: si algún día audio y arte compartieran extensión,
   uno pisaría al otro sin que nadie se entere. */
function archivoArte(artworkPath: string): File {
  return new (fs().File)(carpeta(), `arte-${nombreSeguro(artworkPath)}`)
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

/** Cuántas están en camino o esperando turno. */
export function cuantasPendientes(items: Record<string, Descarga>): number {
  return Object.values(items).filter((d) => d.estado !== 'lista').length
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

  /*
   * Volver a intentar cuando aparece el Wi-Fi.
   *
   * Sin esto, «solo con Wi-Fi» sería una trampa: las descargas quedarían
   * esperando para siempre aunque el teléfono se conectara a una red buena dos
   * minutos después, y la única forma de destrabarlas sería tocar el botón de
   * nuevo. El aviso llega del sistema, no hay que preguntar cada tanto.
   *
   * No se da de baja: este módulo vive lo que vive la app.
   */
  net().addNetworkStateListener(({ type }) => {
    if (type !== net().NetworkStateType.CELLULAR) void arrancar()
  })

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
      if (entrada instanceof fs().File && !esperados.has(entrada.name)) borrarSiEsta(entrada)
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
  /* Si era la última que esperaba, ya no hay nada esperando. */
  if (!cola.length && store.get().esperandoWifi) store.set({ esperandoWifi: false })
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
  store.set({ items: {}, esperandoWifi: false })
  guardarIndice()
}

/**
 * Si se puede bajar con la conexión que hay ahora.
 *
 * Frena **solo cuando el sistema dice que es celular**. `UNKNOWN` —lo que
 * devuelve cuando no puede clasificar la red— cuenta como permitida: dejar las
 * descargas colgadas para siempre por no poder confirmar el tipo de conexión
 * sería un problema peor que el que resuelve la preferencia. Lo mismo si la
 * consulta falla.
 */
async function redPermitida(): Promise<boolean> {
  if (!leerAjustes().soloWifi) return true
  try {
    const { type } = await net().getNetworkStateAsync()
    return type !== net().NetworkStateType.CELLULAR
  } catch {
    return true
  }
}

/**
 * Baja la cola entera, de a una, y se detiene sola cuando no queda nada.
 *
 * Es un bucle y no una recursión porque ahora la cola se puede **pausar**: con
 * «solo Wi-Fi» prendido y datos móviles, lo que corresponde no es fallar cada
 * canción sino dejarlas esperando. Sacando el elemento recién cuando se lo va a
 * bajar, la pausa no pierde nada — la cola queda tal cual y la retoma el aviso
 * de red, o apagar la preferencia.
 *
 * `corriendo` es lo que garantiza que hay un solo bucle: `descargar` llama a
 * esto sin esperar, y la primera pausa del bucle es un `await`, así que sin la
 * marca dos llamadas seguidas arrancarían dos descargas en paralelo.
 */
let corriendo = false

async function arrancar() {
  if (corriendo) return
  corriendo = true
  try {
    for (;;) {
      const audioPath = cola[0]
      if (!audioPath) {
        avisado = false
        if (store.get().esperandoWifi) store.set({ esperandoWifi: false })
        break
      }

      if (!(await redPermitida())) {
        /* El cartel una sola vez: quedarse sin Wi-Fi con veinte encoladas no
           puede ser veinte carteles diciendo lo mismo. */
        if (!store.get().esperandoWifi) {
          store.set({ esperandoWifi: true })
          avisar('Las descargas siguen cuando haya Wi-Fi.')
        }
        break
      }
      if (store.get().esperandoWifi) store.set({ esperandoWifi: false })

      cola.shift()
      /* Puede haber sido quitada mientras esperaba su turno. */
      if (!store.get().items[audioPath]) continue

      bajando = audioPath
      actualizar(audioPath, { estado: 'bajando', progreso: 0 })

      try {
        await bajarUna(audioPath)
      } catch (causa) {
        /*
         * La entrada se borra y la canción vuelve a estar «sin bajar». El archivo
         * a medio escribir también: en iOS `downloadAsync` mueve al destino recién
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
          avisar(
            `No se pudo descargar «${item?.title ?? 'la canción'}»: ${mensajeError(causa)}`,
            true,
          )
        }
      } finally {
        if (cancelado === audioPath) cancelado = null
        bajando = null
        tarea = null
      }
    }
  } finally {
    corriendo = false
  }
}

/**
 * Vuelve a mirar la cola. La llama el aviso de red y el interruptor de Ajustes.
 *
 * Es la única forma de salir de la pausa por datos móviles: el bucle se cortó y
 * nadie lo va a despertar solo.
 */
export function reanudarDescargas() {
  if (!HAY_DESCARGAS) return
  void arrancar()
}

async function bajarUna(audioPath: string) {
  const item = store.get().items[audioPath]
  if (!item) return

  if (fs().Paths.availableDiskSpace < MARGEN_LIBRE) {
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
  const task = fs().File.createDownloadTask(url, destino, {
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
        await fs().File.downloadFileAsync(remoto, arte, { idempotent: true })
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
