import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'

/**
 * Las actualizaciones de escritorio.
 *
 * Se apoya en electron-updater, que lee `app-update.yml` —lo escribe
 * electron-builder con el `publish` de electron-builder.yml— y compara la
 * versión instalada contra el `latest.yml` del último release publicado en
 * Niiihuel/dnmusic-releases.
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

export type EstadoActualizacion =
  | { fase: 'inactivo' }
  | { fase: 'buscando' }
  | { fase: 'sin-novedad' }
  | { fase: 'esperando-silencio'; version: string }
  | { fase: 'bajando'; version: string; porcentaje: number }
  | { fase: 'lista'; version: string }
  | { fase: 'error'; mensaje: string }

let estado: EstadoActualizacion = { fase: 'inactivo' }
let sonando = false
let pendiente: UpdateInfo | null = null
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

function bajar(): void {
  if (!pendiente || bajando || sonando) return
  // Ya está en disco esperando el cierre; volver a pedirla sería bajar 100 MB
  // para terminar exactamente igual.
  if (estado.fase === 'lista') return
  bajando = true
  registrar('bajando', pendiente.version)
  autoUpdater.downloadUpdate().catch((error: unknown) => {
    bajando = false
    registrar('falló la descarga:', error)
    avisar({ fase: 'error', mensaje: String(error) })
  })
}

export async function buscarAhora(manual = false): Promise<void> {
  const motivo = porQueNoCorre()
  if (motivo) {
    registrar('no busco:', motivo)
    if (manual) {
      await dialog.showMessageBox({
        type: 'info',
        message: 'Las actualizaciones automáticas están apagadas acá',
        detail: `${motivo[0].toUpperCase()}${motivo.slice(1)}.`,
        buttons: ['Listo'],
      })
    }
    return
  }

  avisar({ fase: 'buscando' })
  try {
    /*
     * El resultado del promise no alcanza para saber si hay algo nuevo: trae
     * `updateInfo` siempre, con la versión que hay publicada, haya o no
     * novedad. Quien contesta esa pregunta son los eventos, que ya corrieron
     * cuando este await vuelve — de ahí que se mire `pendiente`.
     */
    await autoUpdater.checkForUpdates()
    if (!manual) return

    if (!pendiente) {
      await dialog.showMessageBox({
        type: 'info',
        message: 'Ya tenés la última',
        detail: `Versión ${app.getVersion()}.`,
        buttons: ['Listo'],
      })
      return
    }

    await dialog.showMessageBox({
      type: 'info',
      message: `Hay una nueva: ${pendiente.version}`,
      detail:
        estado.fase === 'lista'
          ? 'Ya está bajada. Cerrá la app cuando quieras: se instala sola y vuelve a abrirse.'
          : sonando
            ? 'Se baja cuando pares la música. Después, al cerrar la app se instala sola y vuelve a abrirse.'
            : 'Se está bajando. Al cerrar la app se instala sola y vuelve a abrirse.',
      buttons: ['Listo'],
    })
  } catch (error) {
    /*
     * Sin internet esto falla, y fallar acá es normal: se registra y se sigue.
     * Solo se muestra si lo pediste vos desde el menú — un cartel de error que
     * aparece solo porque el wifi se cayó es ruido, no información.
     */
    registrar('falló la búsqueda:', error)
    avisar({ fase: 'error', mensaje: String(error) })
    if (manual) {
      await dialog.showMessageBox({
        type: 'warning',
        message: 'No se pudo buscar la actualización',
        detail: String(error),
        buttons: ['Listo'],
      })
    }
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
    registrar('hay', info.version)
    if (sonando) {
      avisar({ fase: 'esperando-silencio', version: info.version })
    } else {
      avisar({ fase: 'bajando', version: info.version, porcentaje: 0 })
      bajar()
    }
  })

  autoUpdater.on('update-not-available', () => {
    pendiente = null
    avisar({ fase: 'sin-novedad' })
  })

  autoUpdater.on('download-progress', (progreso) => {
    if (!pendiente) return
    avisar({
      fase: 'bajando',
      version: pendiente.version,
      porcentaje: Math.round(progreso.percent),
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    bajando = false
    registrar('lista', info.version, '— se instala al cerrar')
    avisar({ fase: 'lista', version: info.version })
  })

  autoUpdater.on('error', (error) => {
    bajando = false
    registrar('error:', error)
    avisar({ fase: 'error', mensaje: String(error) })
  })

  const motivo = porQueNoCorre()
  if (motivo) {
    registrar('apagado:', motivo)
    return
  }

  setTimeout(() => void buscarAhora(), AL_ARRANCAR_MS)
  setInterval(() => void buscarAhora(), CADA_MS)
}
