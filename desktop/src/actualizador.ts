import { app, BrowserWindow } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'

/**
 * Las actualizaciones de escritorio.
 *
 * Se apoya en electron-updater, que lee `app-update.yml` —lo escribe
 * electron-builder con el `publish` de electron-builder.yml— y compara la
 * versión instalada contra el `latest.yml` del último release publicado en
 * Niihuel/dnmusic-releases.
 *
 * Ese repo es **público a propósito**, aunque el del código sea privado: contra
 * un repo privado electron-updater necesita un token de GitHub metido adentro
 * de la app, y eso es repartirle a todo el que la instale una credencial de
 * lectura del código fuente, sacable del .asar en dos minutos. Con el repo de
 * releases público el cliente descarga sin credencial ninguna y el código sigue
 * donde estaba.
 *
 * La instalación es **al cerrar**, nunca en el medio: un reproductor que se
 * reinicia solo te corta la canción, y no hay actualización que valga eso. Pero
 * cerrar tampoco te deja sin app — termina de instalar y la vuelve a abrir sola,
 * ya en la versión nueva.
 */

/** La primera búsqueda no compite con el arranque ni con la primera canción. */
const AL_ARRANCAR_MS = 3 * 60 * 1000
const CADA_MS = 6 * 60 * 60 * 1000

/**
 * Cuánto silencio hace falta para dar por terminada la escucha.
 *
 * Entre dos canciones hay un hueco sin audio —`useAudioPlayer` recrea el
 * reproductor cuando cambia la fuente— así que el primer instante de silencio
 * no significa que dejaste de escuchar. Con medio minuto, una pausa real se
 * distingue de un cambio de tema.
 */
const ESPERA_SILENCIO_MS = 30 * 1000

/**
 * Qué trae la versión que viene, sacado del propio feed.
 *
 * `latest.yml` incluye las notas del release —las escribe
 * `scripts/notas-release.mjs` desde las mismas novedades que muestra la app— y
 * hasta ahora las tirábamos. Son la única forma de contar qué trae una versión
 * que todavía no está instalada: el `novedades.json` del bundle llega hasta la
 * que estás corriendo, no más.
 */
export type NotasVersion = { titulo: string; cambios: string[]; fecha: string | null }

export type EstadoActualizacion =
  /** Todavía no buscó nada. Trae la versión instalada para no pedirla aparte. */
  | { fase: 'inactivo'; version: string }
  /** No corre acá, y por qué. Antes esto era un diálogo del sistema. */
  | { fase: 'apagado'; motivo: string }
  | { fase: 'buscando' }
  | { fase: 'sin-novedad'; version: string }
  | { fase: 'esperando-silencio'; version: string; notas: NotasVersion | null }
  | {
      fase: 'bajando'
      version: string
      notas: NotasVersion | null
      porcentaje: number
      /** Bytes, para poder decir «42 de 137 MB» en vez de solo un porcentaje. */
      bajados: number
      total: number
    }
  | { fase: 'lista'; version: string; notas: NotasVersion | null }
  | { fase: 'error'; mensaje: string }

/**
 * Las notas del release, de markdown a algo que la app pueda dibujar con su
 * propia tipografía.
 *
 * Se parsea y no se muestra el markdown crudo porque del otro lado hay un
 * sistema de diseño, no un visor de texto. Es seguro parsearlo: ese markdown lo
 * generamos nosotros con un formato fijo (`## título`, `- cambio`, `_fecha_`).
 * Si algún día cambia de forma, esto devuelve lo que pueda y la interfaz cae al
 * caso sin notas — nunca tira.
 */
export function leerNotas(crudo: unknown): NotasVersion | null {
  /* electron-updater las da como string o como lista por idioma; con el
     provider de GitHub y nuestro yml es siempre string. */
  const texto =
    typeof crudo === 'string'
      ? crudo
      : Array.isArray(crudo)
        ? crudo
            .map((n) => (typeof n === 'object' && n && 'note' in n ? String(n.note) : ''))
            .join('\n')
        : ''
  if (!texto.trim()) return null

  const lineas = texto.split('\n').map((l) => l.trim())
  const titulo =
    lineas
      .find((l) => l.startsWith('## '))
      ?.slice(3)
      .trim() ?? ''
  const cambios = lineas.filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim())
  const fecha = lineas.find((l) => /^_.+_$/.test(l))?.slice(1, -1) ?? null

  if (!titulo && !cambios.length) return null
  return { titulo, cambios, fecha }
}

let estado: EstadoActualizacion = { fase: 'inactivo', version: '' }
let sonando = false
let pendiente: UpdateInfo | null = null
let notasPendientes: NotasVersion | null = null
let bajando = false
let temporizadorSilencio: NodeJS.Timeout | null = null
/** Una sola vez por sesión: si el instalador falla, cerrar tiene que cerrar. */
let intentoInstalar = false

function registrar(...partes: unknown[]): void {
  console.log('[actualizador]', ...partes)
}

function avisar(nuevo: EstadoActualizacion): void {
  estado = nuevo
  for (const ventana of BrowserWindow.getAllWindows()) {
    if (!ventana.isDestroyed()) ventana.webContents.send('actualizacion:estado', nuevo)
  }
}

export function estadoActual(): EstadoActualizacion {
  /* Si nunca buscó, se contesta con la versión instalada ya adentro: la
     pantalla de novedades la pedía por separado y quedaba un cuadro con el
     estado puesto y el número todavía vacío. */
  if (estado.fase === 'inactivo' && !estado.version) {
    const motivo = porQueNoCorre()
    estado = motivo ? { fase: 'apagado', motivo } : { fase: 'inactivo', version: app.getVersion() }
  }
  return estado
}

/**
 * Por qué no corre, en castellano, o `null` si sí corre.
 *
 * Devolver el motivo en vez de un booleano es lo que hace que «no me
 * actualiza» tenga respuesta en el log en vez de terminar en un rato de
 * adivinar.
 */
function porQueNoCorre(): string | null {
  if (!app.isPackaged) return 'la app no está empaquetada'
  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    return 'en Linux solo el AppImage sabe reemplazarse a sí mismo'
  }
  return null
}

/**
 * Le avisa al actualizador si en este momento está sonando algo.
 *
 * Lo alimenta `audio-state-changed` del webContents, que es Chromium contando
 * si la página emite audio: no hace falta que el bundle web sepa que corre
 * adentro de Electron.
 *
 * Existe por lo mismo que las descargas van de a una (docs/DESCARGAS.md):
 * llenar la conexión bajando 100 MB de instalador y cortar lo que estás
 * escuchando ahora es trabajar en contra de lo único que la app hace.
 */
export function marcarSonando(activo: boolean): void {
  sonando = activo

  if (activo) {
    if (temporizadorSilencio) clearTimeout(temporizadorSilencio)
    temporizadorSilencio = null
    return
  }

  if (!pendiente || bajando || temporizadorSilencio) return
  temporizadorSilencio = setTimeout(() => {
    temporizadorSilencio = null
    bajar()
  }, ESPERA_SILENCIO_MS)
}

function bajar(manual = false): void {
  if (!pendiente || bajando || (sonando && !manual)) return
  // Ya está en disco esperando el cierre; volver a pedirla sería bajar 100 MB
  // para terminar exactamente igual.
  if (estado.fase === 'lista') return
  bajando = true
  if (temporizadorSilencio) clearTimeout(temporizadorSilencio)
  temporizadorSilencio = null
  avisar({
    fase: 'bajando',
    version: pendiente.version,
    notas: notasPendientes,
    porcentaje: 0,
    bajados: 0,
    total: 0,
  })
  registrar('bajando', pendiente.version)
  autoUpdater.downloadUpdate().catch((error: unknown) => {
    bajando = false
    registrar('falló la descarga:', error)
    avisar({ fase: 'error', mensaje: String(error) })
  })
}

/** Solo una acción explícita permite competir con el audio. */
export function descargarAhora(): void {
  if (estado.fase === 'esperando-silencio') bajar(true)
}

export async function buscarAhora(manual = false): Promise<void> {
  if (
    bajando ||
    estado.fase === 'buscando' ||
    estado.fase === 'lista' ||
    estado.fase === 'esperando-silencio'
  )
    return
  const motivo = porQueNoCorre()
  if (motivo) {
    registrar('no busco:', motivo)
    /*
     * Antes esto abría un `dialog.showMessageBox`, y también lo hacían el «ya
     * tenés la última» y el «hay una nueva».
     *
     * Se fueron los tres. Un diálogo del sistema es una caja gris con el marco
     * del sistema operativo encima de una interfaz que se separa por luminancia
     * y no por bordes (docs/DESIGN.md), es modal —te bloquea la app para
     * decirte algo que no es urgente— y encima aparecía **incluso mientras
     * sonaba música**. Todo lo que decían ahora se publica como estado, y la
     * app lo dibuja con su propia tipografía y sin frenar a nadie.
     */
    if (manual) avisar({ fase: 'apagado', motivo })
    return
  }

  avisar({ fase: 'buscando' })
  try {
    /*
     * El resultado del promise no alcanza para saber si hay algo nuevo: trae
     * `updateInfo` siempre, con la versión que hay publicada, haya o no
     * novedad. Quien contesta esa pregunta son los eventos, que ya corrieron
     * cuando este await vuelve.
     */
    await autoUpdater.checkForUpdates()
  } catch (error) {
    // Salir de «buscando» también si falló la comprobación automática:
    // dejarlo ahí impediría reintentar. El error no abre ningún aviso.

    registrar('falló la búsqueda:', error)
    avisar({ fase: 'error', mensaje: String(error) })
  }
}

/**
 * Instala lo que haya bajado y vuelve a abrir la app, ya actualizada.
 *
 * Devuelve `true` cuando tomó el control del cierre: quien lo llamó tiene que
 * frenar su propio `quit`, porque el que apaga la app de acá en más es
 * electron-updater —después de dejar corriendo al instalador.
 *
 * Los dos parámetros son el punto de todo esto:
 *
 *   `isSilent`        el instalador de Windows corre sin ventanas ni preguntas.
 *                     Ya dijiste que sí cuando instalaste la app.
 *   `isForceRunAfter` la vuelve a abrir cuando termina. Sin esto —que es lo
 *                     que hace `autoInstallOnAppQuit` por su cuenta— cerrás la
 *                     app y no vuelve: quedás con la versión nueva instalada y
 *                     con la pantalla vacía, teniendo que buscar el ícono.
 *
 * En Windows lo hace el propio instalador NSIS, que espera a que el proceso
 * termine, actualiza y lanza. En Linux el AppImage se reemplaza a sí mismo y
 * después lanza el archivo nuevo.
 */
export function instalarYReabrir(): boolean {
  if (estado.fase !== 'lista' || intentoInstalar) return false
  intentoInstalar = true
  registrar('instalando', estado.version, 'y reabriendo')
  autoUpdater.quitAndInstall(true, true)
  return true
}

/** Engancha la ventana: de ahí sale si está sonando algo. */
export function seguirAudioDe(ventana: BrowserWindow): void {
  ventana.webContents.on('audio-state-changed', (evento) => marcarSonando(evento.audible))
}

export function arrancarActualizador(): void {
  autoUpdater.logger = {
    info: (mensaje?: unknown) => registrar(mensaje),
    warn: (mensaje?: unknown) => registrar(mensaje),
    error: (mensaje?: unknown) => registrar(mensaje),
    debug: () => {},
  }

  // La descarga la dispara `bajar()` cuando no hay nada sonando, no el evento.
  autoUpdater.autoDownload = false

  /*
   * El instalado al cerrar lo maneja main.ts con `instalarYReabrir()`, no
   * electron-updater: el suyo instala y ahí termina, dejándote sin app abierta
   * y con la versión nueva esperando a que la busques en el menú de inicio.
   * Los dos prendidos a la vez correrían el instalador dos veces.
   */
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    // La búsqueda periódica sigue corriendo después de bajarla, y encuentra la
    // misma: sin esto, cada seis horas volvería a `bajando` y el aviso de
    // «lista» se perdería.
    if (estado.fase === 'lista' && estado.version === info.version) return

    pendiente = info
    notasPendientes = leerNotas(info.releaseNotes)
    registrar('hay', info.version, notasPendientes ? `— ${notasPendientes.titulo}` : '')
    if (sonando) {
      avisar({ fase: 'esperando-silencio', version: info.version, notas: notasPendientes })
    } else {
      bajar()
    }
  })

  autoUpdater.on('update-not-available', () => {
    pendiente = null
    notasPendientes = null
    avisar({ fase: 'sin-novedad', version: app.getVersion() })
  })

  autoUpdater.on('download-progress', (progreso) => {
    if (!pendiente) return
    avisar({
      fase: 'bajando',
      version: pendiente.version,
      notas: notasPendientes,
      porcentaje: Math.round(progreso.percent),
      bajados: progreso.transferred,
      total: progreso.total,
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    bajando = false
    registrar('lista', info.version, '— se instala al cerrar')
    avisar({ fase: 'lista', version: info.version, notas: notasPendientes })
  })

  autoUpdater.on('error', (error) => {
    bajando = false
    registrar('error:', error)
    avisar({ fase: 'error', mensaje: String(error) })
  })

  const motivo = porQueNoCorre()
  if (motivo) {
    registrar('apagado:', motivo)
    estado = { fase: 'apagado', motivo }
    return
  }

  setTimeout(() => void buscarAhora(), AL_ARRANCAR_MS)
  setInterval(() => void buscarAhora(), CADA_MS)
}
