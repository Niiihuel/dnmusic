import { session, WebContentsView } from 'electron'
import { scriptTokens } from './potoken-script.js'

const PAGINA = 'https://music.youtube.com/robots.txt'
let vista: WebContentsView | null = null
let preparando: Promise<WebContentsView> | null = null
let pausaHasta = 0
let permisosConfigurados = false

export function userAgentTokens(): string {
  return session.defaultSession.getUserAgent()
}

export function cerrarTokens() {
  const actual = vista
  vista = null
  preparando = null
  if (actual && !actual.webContents.isDestroyed()) actual.webContents.close()
}

async function conPlazo<T>(trabajo: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([trabajo, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('El navegador de YouTube no respondió a tiempo')), 40_000)
    })])
  } finally {
    clearTimeout(timer)
  }
}

async function navegador(): Promise<WebContentsView> {
  if (preparando) return preparando
  const propia = new WebContentsView({ webPreferences: {
    partition: 'dnmusic-youtube-tokens',
    nodeIntegration: false, contextIsolation: true, sandbox: true,
    backgroundThrottling: false,
  } })
  vista = propia
  const wc = propia.webContents
  wc.setUserAgent(userAgentTokens())
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  wc.on('will-navigate', (event) => event.preventDefault())
  wc.on('will-redirect', (event) => event.preventDefault())
  if (!permisosConfigurados) {
    wc.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    wc.session.setPermissionCheckHandler(() => false)
    wc.session.on('will-download', (event) => event.preventDefault())
    permisosConfigurados = true
  }
  preparando = (async () => {
    // El hijo usa fetch de Node, que sale directo; la atestación usa la misma salida.
    await wc.session.setProxy({ mode: 'direct' })
    await wc.loadURL(PAGINA)
    if (wc.getURL() !== PAGINA) throw new Error('Origen inesperado al verificar YouTube')
    await wc.executeJavaScript(scriptTokens())
    return propia
  })()
  return preparando
}

/** Solo bindings; nunca código del renderer ni credenciales de la app. */
export async function acunarEnNavegador(binding: string): Promise<string> {
  if (typeof binding !== 'string' || !binding || binding.length > 4096) throw new Error('Binding de token inválido')
  if (Date.now() < pausaHasta) throw new Error('YouTube no pudo verificar el navegador. Probá en un minuto.')
  try {
    const token = await conPlazo((async () => {
      const actual = await navegador()
      return actual.webContents.executeJavaScript(`window.__dnmusicMint(${JSON.stringify(binding)})`)
    })())
    if (typeof token !== 'string' || !token) throw new Error('BotGuard no devolvió token')
    return token
  } catch (e) {
    pausaHasta = Date.now() + 60_000
    cerrarTokens()
    throw e
  }
}
