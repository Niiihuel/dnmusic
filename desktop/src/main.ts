import { app, BrowserWindow, ipcMain, Menu, safeStorage, session, shell } from 'electron'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  arrancarActualizador,
  buscarAhora,
  descargarAhora,
  estadoActual,
  instalarYReabrir,
  seguirAudioDe,
} from './actualizador'
import { ORIGEN, raizWeb, registrarEsquema, servirWeb } from './protocolo'
import { ESQUEMA_ENLACE, EntregaDeEnlaces } from './enlaces'
import { type Aporte } from './resolutor'
import { cerrarResolutor, resolverEnHijo } from './resolutor-remoto'
import { descargarArchivos } from './descargas'
import { DiscoAudioOffline } from './audio-offline'
import { origenAudioConfigurado } from './audio-offline-origen'
import { registrarAudioOffline } from './audio-offline-ipc'
import { GoogleOAuthEscritorio } from './oauth-google'
import { registrarGoogleOAuth } from './oauth-google-ipc'
import { AlmacenAuth } from './auth-storage'
import { registrarAlmacenAuth } from './auth-storage-ipc'
import { DiscordPresence } from './discord-presence'
import { registrarDiscord } from './discord-ipc'

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
/* Los `dnmusic://` que manda el sistema, guardados hasta que haya ventana.
   Ver `enlaces.ts`: en Windows y Linux el primero llega antes que ella. */
const enlaces = new EntregaDeEnlaces()

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

/** Alto compacto del overlay nativo; el renderer reserva su geometría real. */
const BANDA_VENTANA = 38

function crearVentana(): BrowserWindow {
  const ventana = new BrowserWindow({
    // Windows elige el frame ICO según el DPI; Linux usa PNG con transparencia.
    icon: app.isPackaged
      ? join(process.resourcesPath, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
      : join(__dirname, '..', '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'desktop-icon.png'),
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
    /*
     * Conserva los controles de ventana nativos (snap layouts y menú del
     * escritorio). Su posición depende del sistema, RTL y preferencias del
     * usuario: no se fuerza la distribución de Windows sobre Linux.
     * BandaVentana reserva el alto y respeta el rectángulo libre que publica
     * windowControlsOverlay; ningún logo o botón de la app queda debajo.
     */
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#121212', symbolColor: '#B3B3B3', height: BANDA_VENTANA },
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
 * Dejar dicho si esta máquina tiene el almacén protegido del sistema.
 *
 * Mismo motivo que `registrarGPU`: es lo único que decide dónde termina la
 * sesión de Supabase, y no se puede ver desde el código. Con él, la sesión
 * viaja cifrada con DPAPI en Windows o con el llavero en Linux; sin él —una
 * sesión de escritorio sin llavero, un contenedor— el archivo queda en texto
 * plano, que sigue siendo mejor que perder la sesión, pero conviene saberlo
 * cuando alguien reporta que la app le pide entrar todo el tiempo.
 */
function registrarAlmacenProtegido(): void {
  try {
    registrar('almacén protegido:', safeStorage.isEncryptionAvailable() ? 'sí' : 'NO (la sesión se guarda sin cifrar)')
  } catch (error) {
    registrar('no se pudo consultar el almacén protegido:', error)
  }
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
 * Que el sistema sepa que los `dnmusic://` son de esta app.
 *
 * Va antes de `whenReady` porque en Windows el registro se escribe en el
 * arranque. Sin empaquetar hay que decirle además **qué** ejecutar: el binario
 * de Electron con el script como argumento, o el registro apuntaría a un
 * `electron` pelado que no sabe qué abrir. Empaquetado, el instalador ya lo
 * declara (`protocols` en electron-builder.yml) y esto es el respaldo para la
 * AppImage, que no instala nada.
 */
if (app.isPackaged) app.setAsDefaultProtocolClient(ESQUEMA_ENLACE)
else app.setAsDefaultProtocolClient(ESQUEMA_ENLACE, process.execPath, [resolve(process.argv[1] ?? '.')])

/* En macOS el link nunca llega por argv: llega por acá, y también con la app
   ya abierta. Se registra afuera de `whenReady` porque el sistema puede
   dispararlo antes de que la app esté lista. */
app.on('open-url', (evento, url) => {
  evento.preventDefault()
  if (enlaces.recibir(url)) traerAlFrente()
})

/*
 * Una sola instancia. Abrir dnmusic dos veces daría dos reproductores peleando
 * por la misma cuenta y por la misma sesión de escucha (docs/ESCUCHA.md), así
 * que el segundo arranque le devuelve el foco al primero y se va.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  /* El `argv` del segundo arranque es por dónde llega un link en Windows y en
     Linux cuando la app ya estaba abierta: es el caso normal, no el raro. */
  app.on('second-instance', (_evento, argv) => {
    enlaces.recibirArgumentos(argv)
    traerAlFrente()
  })
  /* Y el de este mismo arranque, para el clic que abrió la app. */
  enlaces.recibirArgumentos(process.argv)

  void app.whenReady().then(async () => {
    const raiz = raizWeb()
    const origenSupabase = await origenAudioConfigurado(raiz, app.isPackaged)
    const disco = new DiscoAudioOffline(join(app.getPath('userData'), 'audio-offline'), {
      origen: origenSupabase, desarrollo: !app.isPackaged,
    })
    const logoGoogle = app.isPackaged ? join(process.resourcesPath, 'icons', 'logo.png') : join(__dirname, '..', '..', 'assets', 'branding', 'splash-dnmusic.png')
    const google = new GoogleOAuthEscritorio({ origen: origenSupabase, logoBase64: readFileSync(logoGoogle).toString('base64'), abrirExterno: url => shell.openExternal(url), alCompletar: traerAlFrente })
    registrarGoogleOAuth(ipcMain, google, () => ventanaPrincipal?.webContents ?? null)
    registrarAlmacenProtegido()
    const auth = new AlmacenAuth(
      join(app.getPath('userData'), 'auth-session.bin'),
      {
        codificar: (texto) => safeStorage.isEncryptionAvailable()
          ? Buffer.concat([Buffer.from([1]), safeStorage.encryptString(texto)])
          : Buffer.concat([Buffer.from([0]), Buffer.from(texto, 'utf8')]),
        decodificar: (datos) => {
          if (datos[0] === 1) return safeStorage.decryptString(datos.subarray(1))
          if (datos[0] === 0) return datos.subarray(1).toString('utf8')
          throw new Error('Formato de sesión desconocido.')
        },
      },
      (motivo, error) => registrar(`sesión: ${motivo} —`, error),
    )
    registrarAlmacenAuth(ipcMain, auth, () => ventanaPrincipal?.webContents ?? null)
    app.on('will-quit', () => google.cancelar())
    registrarAudioOffline(ipcMain, disco, () => ventanaPrincipal?.webContents ?? null)
    const discord = new DiscordPresence(state => {
      const contents = ventanaPrincipal?.webContents
      if (contents && !contents.isDestroyed() && contents.getURL().startsWith('app://dnmusic/')) contents.send('discord:estado', state)
    })
    registrarDiscord(ipcMain, discord, () => ventanaPrincipal?.webContents ?? null)
    app.on('will-quit', () => discord.limpiar())
    servirWeb(raiz, pedido => disco.servir(pedido))
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
    /* Recién con la ventana hay a quién darle los links: se le manda la ruta y
       navega expo-router, sin recargar el bundle ni cortar lo que suena. */
    enlaces.conectar((ruta) => ventanaPrincipal?.webContents.send('enlace:abrir', ruta))
    ventanaPrincipal.on('closed', () => enlaces.desconectar())
    ventanaPrincipal.webContents.on('destroyed', () => google.cancelar())
    ventanaPrincipal.webContents.on('destroyed', () => discord.limpiar())
    ventanaPrincipal.webContents.on('render-process-gone', () => discord.limpiar())
    ventanaPrincipal.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => { if (isMainFrame && !isInPlace) discord.limpiar() })
    ventanaPrincipal.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => { if (isMainFrame && !isInPlace) google.cancelar() })
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
