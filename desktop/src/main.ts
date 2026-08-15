import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import { join } from 'node:path'
import {
  arrancarActualizador,
  buscarAhora,
  estadoActual,
  instalarYReabrir,
  seguirAudioDe,
} from './actualizador'
import { ORIGEN, raizWeb, registrarEsquema, servirWeb } from './protocolo'

/**
 * dnmusic para escritorio.
 *
 * Adentro corre el mismo export web que sirve Vercel, sin una línea de
 * diferencia: el proceso principal solo le da una ventana, un origen propio
 * (ver protocolo.ts) y las actualizaciones.
 */

/*
 * Chromium bloquea el audio que arranca sin que el usuario haya tocado la
 * página. Es una defensa contra las webs que te gritan al abrirlas; en una app
 * cuyo único trabajo es reproducir música no defiende de nada, y lo único que
 * hace es romper cualquier «seguí donde lo dejaste».
 */
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Antes de que la app esté lista, o los privilegios del esquema no se aplican.
registrarEsquema()

let ventanaPrincipal: BrowserWindow | null = null

/** Solo http y https: un link no puede terminar lanzando algo de la máquina. */
function abrirAfuera(url: string): void {
  try {
    const { protocol } = new URL(url)
    if (protocol === 'http:' || protocol === 'https:') void shell.openExternal(url)
  } catch {
    /* Una URL que ni siquiera parsea no se abre en ningún lado. */
  }
}

function esNuestra(url: string): boolean {
  return url === ORIGEN || url === `${ORIGEN}/` || url.startsWith(`${ORIGEN}/`)
}

function crearVentana(): BrowserWindow {
  const ventana = new BrowserWindow({
    width: 1180,
    height: 780,
    /*
     * El mínimo es angosto a propósito: el layout ya se adapta al teléfono, y
     * dejar la ventana finita al costado de otra cosa es una forma legítima de
     * tener el reproductor a mano.
     */
    minWidth: 360,
    minHeight: 560,
    /*
     * El fondo de DESIGN.md puesto en la ventana, no solo en el CSS. Entre que
     * el sistema dibuja el marco y el bundle pinta la primera pantalla pasan
     * unos cuadros que por defecto son blancos, y un flash blanco al abrir una
     * app cuya idea es la oscuridad inmersiva se ve. `show: false` hasta
     * `ready-to-show` termina de sacarlo.
     */
    backgroundColor: '#121212',
    show: false,
    /*
     * La barra de menú aparece con Alt. Fija, sería una franja gris del sistema
     * arriba de una interfaz que se separa por luminancia y no por bordes: lo
     * único que hay ahí es «buscar actualizaciones» y las herramientas.
     */
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  ventana.once('ready-to-show', () => ventana.show())
  seguirAudioDe(ventana)

  // Todo lo que no sea la app —compartir, links de las letras— va al navegador.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    abrirAfuera(url)
    return { action: 'deny' }
  })
  ventana.webContents.on('will-navigate', (evento, url) => {
    if (esNuestra(url)) return
    evento.preventDefault()
    abrirAfuera(url)
  })

  void ventana.loadURL(`${ORIGEN}/`)
  return ventana
}

function armarMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Archivo',
        submenu: [{ role: 'quit', label: 'Salir' }],
      },
      {
        label: 'Ver',
        submenu: [
          { role: 'reload', label: 'Recargar' },
          { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
          { type: 'separator' },
          { role: 'resetZoom', label: 'Tamaño normal' },
          { role: 'zoomIn', label: 'Agrandar' },
          { role: 'zoomOut', label: 'Achicar' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: 'Pantalla completa' },
        ],
      },
      {
        label: 'Ayuda',
        submenu: [
          { label: 'Buscar actualizaciones', click: () => void buscarAhora(true) },
          { label: `Versión ${app.getVersion()}`, enabled: false },
        ],
      },
    ]),
  )
}

/*
 * Una sola instancia. Abrir dnmusic dos veces daría dos reproductores peleando
 * por la misma cuenta y por la misma sesión de escucha (docs/ESCUCHA.md), así
 * que el segundo arranque le devuelve el foco al primero y se va.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!ventanaPrincipal || ventanaPrincipal.isDestroyed()) return
    if (ventanaPrincipal.isMinimized()) ventanaPrincipal.restore()
    ventanaPrincipal.focus()
  })

  void app.whenReady().then(() => {
    servirWeb(raizWeb())

    ipcMain.handle('app:version', () => app.getVersion())
    ipcMain.handle('actualizacion:estado', () => estadoActual())
    ipcMain.on('actualizacion:buscar', () => void buscarAhora(true))
    ipcMain.on('actualizacion:instalar', () => void instalarYReabrir())

    armarMenu()
    ventanaPrincipal = crearVentana()
    arrancarActualizador()
  })

  /*
   * Cerrar es el momento de instalar lo que haya bajado — y de volver.
   *
   * `instalarYReabrir()` devuelve true cuando se hizo cargo del cierre: ahí hay
   * que frenar este quit, porque el que apaga la app pasa a ser el instalador,
   * que espera a que el proceso muera, actualiza y la lanza de nuevo. Sin el
   * preventDefault, Electron mataría el proceso antes de que el instalador
   * llegue a engancharse y la actualización quedaría a medio aplicar.
   *
   * Al segundo pasaje —el `quit` que dispara el propio electron-updater, y
   * también un cierre posterior si el instalador no arrancó— devuelve false y
   * el cierre sigue de largo. Cerrar siempre cierra.
   */
  app.on('before-quit', (evento) => {
    if (instalarYReabrir()) evento.preventDefault()
  })

  // Windows y Linux: cerrar la ventana es cerrar la app.
  app.on('window-all-closed', () => app.quit())
}
