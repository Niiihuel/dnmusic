import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export type ResultadoGoogle = { type: 'success'; url: string } | { type: 'cancel' }
type Pendiente = {
  id: string; servidor: Server; redirectTo: string; nonce: string | null; flowId: string | null
  abierta: boolean; resolver: (r: ResultadoGoogle) => void; resultado: Promise<ResultadoGoogle>; reloj: ReturnType<typeof setTimeout>
}
function igual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function paginaRetornoGoogle(cancelado: boolean, logoBase64?: string) {
  const titulo = cancelado ? 'No se hicieron cambios' : 'Conexión lista'
  const detalle = cancelado
    ? 'Google canceló el acceso. Volvé a DMusic para intentarlo otra vez.'
    : 'Ya podés cerrar esta pestaña y volver a DMusic.'
  const logo = logoBase64 && /^[A-Za-z0-9+/=]+$/.test(logoBase64)
    ? `<img class="logo" src="data:image/png;base64,${logoBase64}" alt="DMusic" width="80" height="80">` : ''
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>DMusic · Google</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100svh;display:grid;place-items:center;padding:32px 24px;background:linear-gradient(180deg,#242424 0,#151515 48%,#121212 100%);color:#fff;font:16px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:100%;max-width:560px;text-align:center}.logo{display:block;width:80px;height:80px;object-fit:contain;margin:0 auto 28px}h1{margin:0 0 12px;font-size:clamp(28px,5vw,38px);font-weight:600;line-height:1.2;letter-spacing:-.7px}p{margin:0;color:#b3b3b3;text-wrap:balance}</style></head><body><main>${logo}<h1>${titulo}</h1><p>${detalle}</p></main></body></html>`
}

/** Sólo escucha loopback durante una transacción. El código vuelve por IPC, nunca por navegación del renderer. */
export class GoogleOAuthEscritorio {
  private pendiente: Pendiente | null = null
  private preparando = false
  private generacion = 0
  constructor(private readonly opciones: {
    origen: string | null; logoBase64?: string; abrirExterno: (url: string) => Promise<unknown>; alCompletar?: () => void; timeoutMs?: number
  }) {}

  async preparar(): Promise<{ id: string; redirectTo: string }> {
    if (!this.opciones.origen) throw new Error('Falta configurar el origen de autenticación de escritorio.')
    if (this.pendiente || this.preparando) throw new Error('Ya hay un inicio con Google en curso.')
    this.preparando = true
    const generacion = this.generacion
    const id = randomBytes(24).toString('hex')
    const servidor = createServer((req, res) => this.recibir(id, req, res))
    servidor.headersTimeout = 5000; servidor.requestTimeout = 5000; servidor.maxHeadersCount = 30
    try {
      await new Promise<void>((resolve, reject) => {
        servidor.once('error', reject)
        servidor.listen(0, '127.0.0.1', () => { servidor.removeListener('error', reject); resolve() })
      })
      if (generacion !== this.generacion) throw new Error('El inicio con Google fue cancelado.')
      const redirectTo = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/auth/callback/${id}`
      let resolver!: (r: ResultadoGoogle) => void
      const resultado = new Promise<ResultadoGoogle>(r => { resolver = r })
      const reloj = setTimeout(() => this.cancelar(id), this.opciones.timeoutMs ?? 10 * 60 * 1000)
      reloj.unref()
      this.pendiente = { id, servidor, redirectTo, resolver, resultado, reloj, nonce: null, flowId: null, abierta: false }
      servidor.on('error', () => this.cancelar(id))
      return { id, redirectTo }
    } catch (e) { servidor.close(); throw e }
    finally { this.preparando = false }
  }

  async abrirVinculacion(pedido: { id: string; url: string; retorno: string }): Promise<ResultadoGoogle> {
    if (!pedido || typeof pedido.retorno !== 'string') throw new Error('Retorno de vinculación inválido.')
    return this.abrir(pedido, pedido.retorno)
  }

  async abrir(pedido: { id: string; url: string }, retornoVinculacion?: string): Promise<ResultadoGoogle> {
    const p = this.pendiente
    if (!p || !pedido || pedido.id !== p.id || p.abierta) throw new Error('El inicio con Google no está pendiente.')
    const u = new URL(pedido.url), origen = this.opciones.origen
    const permitidos = new Set(['provider', 'redirect_to', 'code_challenge', 'code_challenge_method', 'prompt', 'scopes'])
    if (retornoVinculacion !== undefined) {
      if (u.origin !== 'https://accounts.google.com' || !['/o/oauth2/auth', '/o/oauth2/v2/auth'].includes(u.pathname) ||
        u.username || u.password || u.hash || u.searchParams.get('response_type') !== 'code' ||
        u.searchParams.get('redirect_uri') !== `${origen}/auth/v1/callback` ||
        !u.searchParams.get('state') || !u.searchParams.get('client_id')?.endsWith('.apps.googleusercontent.com') ||
        [...u.searchParams.keys()].some(k => u.searchParams.getAll(k).length !== 1)) throw new Error('URL de vinculación no permitida.')
    } else if (u.origin !== origen || u.pathname !== '/auth/v1/authorize' || u.username || u.password || u.hash ||
      u.searchParams.get('provider') !== 'google' || u.searchParams.get('code_challenge_method')?.toLowerCase() !== 's256' ||
      !/^[A-Za-z0-9_-]{43}$/.test(u.searchParams.get('code_challenge') ?? '') ||
      [...u.searchParams.keys()].some(k => !permitidos.has(k) || u.searchParams.getAll(k).length !== 1)) throw new Error('URL de Google no permitida.')
    const retorno = new URL(retornoVinculacion ?? u.searchParams.get('redirect_to') ?? '')
    const base = new URL(p.redirectTo)
    const nonce = retorno.searchParams.get('dn_state')
    const flowId = retorno.searchParams.get('sb_flow_id')
    if (retorno.origin !== base.origin || retorno.pathname !== base.pathname || retorno.username || retorno.password || retorno.hash ||
      !nonce || !/^[A-Za-z0-9-]{32,128}$/.test(nonce) ||
      (flowId !== null && !/^[A-Za-z0-9_-]{16,128}$/.test(flowId)) ||
      [...retorno.searchParams.keys()].some(k => !['dn_state', 'sb_flow_id'].includes(k) || retorno.searchParams.getAll(k).length !== 1)) throw new Error('Retorno de Google no permitido.')
    p.abierta = true; p.nonce = nonce; p.flowId = flowId
    try { await this.opciones.abrirExterno(u.href) }
    catch (e) { this.cancelar(p.id); throw e }
    return p.resultado
  }

  cancelar(id?: string) {
    if (id === undefined) this.generacion++
    const p = this.pendiente
    if (!p || (id !== undefined && id !== p.id)) return
    this.terminar(p, { type: 'cancel' })
  }
  private terminar(p: Pendiente, resultado: ResultadoGoogle) {
    if (this.pendiente !== p) return
    this.pendiente = null; clearTimeout(p.reloj)
    p.servidor.close(); p.servidor.closeIdleConnections()
    p.resolver(resultado)
    if (resultado.type === 'success') this.opciones.alCompletar?.()
  }
  private recibir(id: string, req: IncomingMessage, res: ServerResponse) {
    res.setHeader('Connection', 'close')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'")
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const rechazar = () => { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Retorno no válido.') }
    const p = this.pendiente
    if (!p || p.id !== id || !p.abierta || !p.nonce || req.method !== 'GET' || req.socket.remoteAddress !== '127.0.0.1' || req.headers.origin || (req.url?.length ?? 0) > 8192) { rechazar(); return }
    try {
      const u = new URL(req.url ?? '', p.redirectTo), base = new URL(p.redirectTo)
      const permitidos = new Set(['code', 'dn_state', 'sb_flow_id', 'error', 'error_description', 'error_code'])
      const code = u.searchParams.get('code'), error = u.searchParams.get('error')
      if (req.headers.host !== base.host || u.origin !== base.origin || u.pathname !== base.pathname || u.username || u.password || u.hash ||
        !igual(u.searchParams.get('dn_state') ?? '', p.nonce) || (u.searchParams.get('sb_flow_id') ?? null) !== p.flowId ||
        [...u.searchParams.keys()].some(k => !permitidos.has(k) || u.searchParams.getAll(k).length !== 1) ||
        (code && error) || (!code && !error) || (code && !/^[A-Za-z0-9._~-]{1,2048}$/.test(code))) { rechazar(); return }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(paginaRetornoGoogle(Boolean(error), this.opciones.logoBase64))
      this.terminar(p, { type: 'success', url: u.href })
    } catch { rechazar() }
  }
}
