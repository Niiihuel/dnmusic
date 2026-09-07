import { app, BrowserWindow, ipcMain, Menu, session, shell } from 'electron'
import { join } from 'node:path'
import {
  arrancarActualizador,
  buscarAhora,
  descargarAhora,
  estadoActual,
  instalarYReabrir,
  seguirAudioDe,
} from './actualizador'
import { ORIGEN, raizWeb, registrarEsquema, servirWeb } from './protocolo'
import { type Aporte } from './resolutor'
import { cerrarResolutor, resolverEnHijo } from './resolutor-remoto'
import { descargarArchivos } from './descargas'

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

/*
 * Quién dice ser la app cuando notifica.
 *
 * En Windows, una notificación de una app sin AppUserModelID **no se muestra**:
 * el Action Center la descarta sin error y sin dejar rastro, así que el síntoma
 * es «no llegan las notificaciones» sin nada que depurar. Tiene que ser el
 * mismo id que registra el instalador NSIS, que sale del `appId` de
 * electron-builder.
 *
 * En Linux no hace nada; ahí lo que importa es el .desktop, que el AppImage ya
 * trae (ver `desktopName` en package.json).
 */
app.setAppUserModelId('com.nihuel.dnmusic')

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
    icon: join(raizWeb(), 'icons', 'icon-512.png'),
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
      /*
       * Los temporizadores siguen corriendo con la ventana escondida.
       *
       * Chromium estrangula a **una vez por minuto** los `setInterval` de una
       * ventana oculta u ocupada por otra. En una página cualquiera eso está
       * perfecto; en un reproductor que se usa justamente minimizado, rompe
       * cosas concretas: la corrección de deriva de Jam corre cada 7 segundos
       * (`MotorAudio.tsx`) y el latido de la escucha entre dispositivos cada
       * uno (`state/escucha.ts`). Con el estrangulamiento, escuchar en Jam con
       * la ventana atrás se desincroniza y el otro aparato cree que dejaste de
       * escuchar.
       *
       * El audio en sí nunca se frena —eso lo maneja el proceso de audio— así
       * que el síntoma no es silencio: es que se desacomoda todo lo que
       * depende del reloj, que es peor de encontrar.
       */
      backgroundThrottling: false,
      /*
       * Que V8 guarde el código compilado desde la primera corrida.
       *
       * Por defecto (`'code'`) V8 espera a que un script se ejecute varias
       * veces antes de molestarse en cachear su compilado. Un bundle de app se
       * ejecuta **una vez por arranque**, así que esa heurística no se cumple
       * nunca y se recompila siempre. Junto con las cabeceras de caché de
       * `protocolo.ts` —sin las que no hay dónde guardarlo— esto es lo que hace
       * que el segundo arranque sea más rápido que el primero.
       */
      v8CacheOptions: 'bypassHeatCheck',
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

/**
 * Dejar notificar sin preguntar.
 *
 * Chromium trata a `app://dnmusic` como cualquier sitio y le pide permiso al
 * usuario; en una app de escritorio ese diálogo no tiene sentido —ya la
 * instalaste— y además el permiso quedaría colgado de un origen que solo existe
 * acá. El sistema operativo sigue teniendo la última palabra: si apagaste las
 * notificaciones de dnmusic en Windows o en tu escritorio de Linux, esto no las
 * revive.
 *
 * Se responde `true` **solo** a notificaciones: cualquier otro permiso —cámara,
 * micrófono, ubicación— sigue el camino normal y se rechaza, que es lo que
 * corresponde en una app que no los usa.
 */
function permitirNotificaciones(): void {
  session.defaultSession.setPermissionRequestHandler((_contenido, permiso, responder) => {
    responder(permiso === 'notifications')
  })
}

/**
 * Dejar dicho en el log si esta máquina está dibujando por GPU o por software.
 *
 * Existe por un reporte de «toda la app va lagueada» que no se pudo reproducir
 * acá: medido en el navegador, el vidrio no cuesta nada —con y sin
 * `backdrop-filter` los cuadros salen a 16,7ms y ninguno se pasa de 20— y el
 * arrastre al mover el cursor era el hover, que ya está arreglado. Lo que
 * queda por descartar es lo único que no se puede ver desde el código: que
 * Chromium haya caído a **renderizado por software** en esa máquina, cosa que
 * pasa cuando el driver está en la lista negra y hace que todo se sienta
 * pesado sin que nada esté mal en la app.
 *
 * Sin esto, la próxima vez la conversación vuelve a ser «a mí me anda bien».
 * Con esto, la respuesta está en la consola del que la sufre.
 */
function registrarGPU(): void {
  try {
    const estado = app.getGPUFeatureStatus()
    const dibujo = estado.gpu_compositing ?? 'desconocido'
    registrar('gpu_compositing:', dibujo)
    if (typeof dibujo === 'string' && dibujo.includes('software')) {
      registrar(
        'OJO: Chromium está dibujando por software en esta máquina. Todo va a ir a tirones',
        'y no es la app: es el driver o la lista negra de GPU. Probá arrancar con',
        '--ignore-gpu-blocklist.',
      )
    }
  } catch (error) {
    registrar('no se pudo leer el estado de la GPU:', error)
  }
}

function registrar(...partes: unknown[]): void {
  console.log('[dnmusic]', ...partes)
}

/**
 * El resolutor de a bordo (ver resolutor.ts), con lo que llegó por IPC validado.
 *
 * El renderer es nuestro propio bundle, pero corre sandboxeado justamente
 * porque trae código de terceros: nada de lo que mande se toma por su palabra.
 * Un videoId con otra forma o un apiBase que no sea una URL no llegan ni a
 * intentarse — el proceso principal no descarga nada que no tenga la forma de
 * un pedido legítimo.
 */
async function resolverDesdeAca(opciones: unknown): Promise<Aporte> {
  const o = (opciones ?? {}) as Record<string, unknown>
  if (typeof o.videoId !== 'string' || !/^[\w-]{11}$/.test(o.videoId)) {
    throw new Error('videoId inválido')
  }
  if (typeof o.apiBase !== 'string' || !/^https?:\/\//.test(o.apiBase)) {
    throw new Error('apiBase inválido')
  }
  if (typeof o.token !== 'string' || !o.token) throw new Error('sin sesión')
  registrar('resolviendo de a bordo:', o.videoId)
  /*
   * El hijo descarga sin ocupar el main. Para atestar pide tokens a un
   * WebContents de Chromium aislado; ver `resolutor-hijo.ts`.
   */
  return resolverEnHijo({
    videoId: o.videoId,
    apiBase: o.apiBase,
    token: o.token,
    artworkUrl: typeof o.artworkUrl === 'string' ? o.artworkUrl : undefined,
    durationMs: typeof o.durationMs === 'number' ? o.durationMs : undefined,
  })
}

/** Traer la ventana al frente: la usa el click en una notificación. */
function traerAlFrente(): void {
  if (!ventanaPrincipal || ventanaPrincipal.isDestroyed()) return
  if (ventanaPrincipal.isMinimized()) ventanaPrincipal.restore()
  ventanaPrincipal.show()
  ventanaPrincipal.focus()
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
  app.on('second-instance', () => traerAlFrente())

  void app.whenReady().then(() => {
    servirWeb(raizWeb())
    permitirNotificaciones()
    registrarGPU()

    ipcMain.handle('app:version', () => app.getVersion())
    ipcMain.on('ventana:enfocar', () => traerAlFrente())
    ipcMain.handle('actualizacion:estado', () => estadoActual())
    ipcMain.on('actualizacion:buscar', () => void buscarAhora(true))
    ipcMain.on('actualizacion:descargar', () => descargarAhora())
    ipcMain.on('actualizacion:instalar', () => void instalarYReabrir())
    ipcMain.handle('resolver:aportar', (_evento, opciones) => resolverDesdeAca(opciones))
    ipcMain.handle('descarga:lista', (_evento, opciones) =>
      descargarArchivos(ventanaPrincipal, opciones, (avance) =>
        ventanaPrincipal?.webContents.send('descarga:progreso', avance),
      ),
    )

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
  // Y el resolutor se va con la app: sin padre no tiene a quién contestarle.
  app.on('will-quit', () => cerrarResolutor())
}
