import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compile = path => ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const protocol = {}
new Function('exports', compile('src/services/protocoloDiscordRemoto.ts'))(protocol)
const code = compile('src/services/controlDiscordRemoto.ts')
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

function fixture() {
  const clients = new Map(), packets = [], sent = [], timers = new Map()
  let now = 0, seq = 0, deliveryError = null
  const engine = {}
  const timeout = (fn, delay) => { const id = ++seq; timers.set(id, { fn, at: now + delay }); return id }
  new Function('exports', 'require', 'setTimeout', 'clearTimeout', code)(engine, () => protocol, timeout, id => timers.delete(id))
  function client(id, desktop = false) {
    const c = { id, allowed: true, account: 'account', session: `${id}-epoch`, connection: 'conectado', seen: [], advertised: null, changes: [], cancelled: 0, actual: 0, confirmed: 0, autoReady: true, succeeds: true, loaded: true, busy: false, localState: { enabled: false, status: 'disabled' } }
    const local = desktop ? {
      leer: () => ({ cargado: c.loaded, guardando: c.busy, estado: c.localState }),
      cambiar: enabled => {
        c.changes.push(enabled)
        const intention = ++c.actual
        c.localState = { enabled, status: enabled ? (c.autoReady ? 'ready' : 'connecting') : 'disabled' }
        return { terminado: Promise.resolve(c.succeeds), confirmar: () => { c.confirmed++ }, cancelar: () => {
          if (!enabled || intention !== c.actual) return
          c.actual++; c.cancelled++; c.localState = { enabled: false, status: 'disabled' }; c.control.actualizar()
        } }
      },
    } : undefined
    c.control = engine.crearControlDiscordRemoto({ userId: 'account', local,
      permitido: () => c.allowed,
      conexion: () => ({ userId: c.account, deviceId: c.id, sesion: c.session, conexion: c.connection, presentes: [...clients.values()].filter(x => x.connection === 'conectado' && x.account === c.account).map(x => ({ deviceId: x.id, nombre: `Equipo ${x.id}`, controlDiscord: { version: 1, sesion: x.session, ...(x.advertised ? { discord: x.advertised } : {}) } })) }),
      enviar: async m => { sent.push(m); if (deliveryError?.(m)) throw Error('transport'); packets.push(m) },
      anunciar: estado => { c.advertised = estado },
      notificar: estado => { c.seen.push(estado); c.state = estado },
    })
    clients.set(id, c)
    return c
  }
  const refresh = () => { for (const c of clients.values()) c.control.actualizar() }
  async function deliver(type) {
    const index = type ? packets.findIndex(m => m.tipo === type) : 0
    assert.ok(index >= 0 && packets.length > index, `Falta paquete ${type ?? ''}: ${packets.map(m => m.tipo)}`)
    const [m] = packets.splice(index, 1)
    clients.get(m.destino)?.control.recibir(m)
    await flush(); refresh(); return m
  }
  async function drain() { for (let n = 0; packets.length; n++) { assert.ok(n < 100, 'No debe haber reintentos/bucles'); await deliver() } await flush(); refresh() }
  async function advance(ms) {
    now += ms
    for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn() }
    await flush(); refresh()
  }
  return { client, refresh, deliver, drain, advance, packets, sent, timers,
    reject: fn => { deliveryError = fn },
    close() { for (const c of clients.values()) c.control.cerrar(); assert.equal(timers.size, 0, 'Se limpian leases y pedidos') },
  }
}
function setup(t) { const f = fixture(), phone = f.client('iphone'), pc = f.client('pc', true); f.refresh(); t.after(() => f.close()); return { f, phone, pc } }

function request(overrides = {}) { return { version: 1, tipo: 'solicitud', requestId: 'request-1', origen: 'iphone', origenSesion: 'iphone-epoch', destino: 'pc', destinoSesion: 'pc-epoch', enabled: true, ...overrides } }

test('estado/presencia sólo exponen campos mínimos y descartan payloads inválidos', () => {
  const raw = { enabled: true, status: 'error', error: 'secret token', applicationId: '123', username: 'persona', token: 'secret' }
  const sanitized = protocol.estadoDiscordRemoto(raw)
  assert.deepEqual(Object.keys(sanitized).sort(), ['enabled', 'error', 'status'])
  assert.ok(!JSON.stringify(sanitized).includes('secret'))
  assert.equal(protocol.estadoDiscordRemoto({ enabled: false, status: 'published' }), null)
  assert.equal(protocol.mensajeControlDiscord(request({ requestId: 'x'.repeat(129) })), null)
  assert.equal(protocol.mensajeControlDiscord(request({ enabled: 'true' })), null)
  assert.equal(protocol.mensajeControlDiscord(request({ version: 0 })), null)
  assert.equal(protocol.presenciaControlDiscord({ version: 1, sesion: 'epoch', token: 'secret' }).discord, undefined)
  assert.ok(!('applicationId' in protocol.mensajeControlDiscord(request({ estado: raw, applicationId: '123' }))))
})

test('presencia y oferta no activan Discord: sólo se listan PCs con puente cargado', async t => {
  const { f, phone, pc } = setup(t), browser = f.client('browser'), oldPC = f.client('old-pc', true)
  oldPC.loaded = false; f.refresh()
  assert.deepEqual(phone.state.dispositivos.map(d => d.deviceId), ['pc'])
  assert.deepEqual(pc.changes, [])
  const done = phone.control.configurar('pc', true)
  await f.deliver('solicitud')
  assert.deepEqual(pc.changes, [])
  assert.equal(phone.state.pendiente, 'pc')
  assert.deepEqual(browser.changes, [])
  phone.control.cancelar(); await done; await f.drain()
  assert.deepEqual(pc.changes, [])
})

test('espera IPC real, diferencia ready/published y desactiva sólo tras resultado', async t => {
  const { f, phone, pc } = setup(t)
  pc.autoReady = false
  const done = phone.control.configurar('pc', true)
  await f.deliver('solicitud'); await f.deliver('oferta'); await f.deliver('aplicar')
  assert.deepEqual(pc.changes, [true])
  assert.equal(phone.state.pendiente, 'pc', 'ACK de transporte no confirma conexión')
  assert.equal(f.packets.filter(m => m.tipo === 'resultado').length, 0)
  pc.localState = { enabled: true, status: 'ready' }; f.refresh()
  const result = await f.deliver('resultado')
  assert.equal(result.estado.status, 'ready')
  await f.deliver('confirmar'); await done
  assert.equal(phone.state.pendiente, null); assert.equal(phone.state.error, null)
  assert.equal(pc.confirmed, 1)
  assert.equal(phone.state.dispositivos[0].estado.status, 'ready')
  pc.localState = { enabled: true, status: 'published' }; f.refresh(); f.refresh()
  assert.equal(phone.state.dispositivos[0].estado.status, 'published')
  const stop = phone.control.configurar('pc', false); await f.drain(); await stop
  assert.deepEqual(pc.changes, [true, false]); assert.equal(pc.cancelled, 0)
  assert.equal(phone.state.dispositivos[0].estado.status, 'disabled')
})

test('dirección, sesión, cuenta y acceso aprobado se verifican antes de aplicar', async t => {
  const { f, phone, pc } = setup(t)
  for (const m of [request({ destino: 'otro' }), request({ destinoSesion: 'old' }), request({ origenSesion: 'old' }), request({ origen: 'unknown' })]) pc.control.recibir(m)
  assert.equal(f.packets.length, 0)
  pc.allowed = false; pc.control.recibir(request()); pc.control.actualizar()
  assert.deepEqual(pc.changes, []); assert.equal(pc.advertised, null)
  phone.account = 'another-account'; f.refresh()
  await phone.control.configurar('pc', true)
  assert.equal(phone.state.conexion, 'desconectado'); assert.equal(phone.state.pendiente, null)
  assert.equal(f.packets.length, 0)
})

test('solicitudes/aplicar repetidos no se ejecutan dos veces y época nueva rechaza replay', async t => {
  const { f, phone, pc } = setup(t)
  const done = phone.control.configurar('pc', true)
  const solic = await f.deliver('solicitud'); pc.control.recibir(solic)
  await f.deliver('oferta'); const apply = await f.deliver('aplicar'); pc.control.recibir(apply)
  await f.drain(); await done
  assert.deepEqual(pc.changes, [true])
  pc.session = 'pc-next'; f.refresh(); pc.control.recibir(solic); pc.control.recibir(apply)
  assert.deepEqual(pc.changes, [true])
})

test('cancelar después de aplicar revoca la intención y rechaza resultados tardíos', async t => {
  const { f, phone, pc } = setup(t)
  const done = phone.control.configurar('pc', true)
  await f.deliver('solicitud'); await f.deliver('oferta'); await f.deliver('aplicar')
  phone.control.cancelar(); await done
  await f.deliver('cancelar'); await f.drain()
  assert.equal(pc.localState.enabled, false); assert.equal(pc.cancelled, 1)
  assert.equal(phone.state.pendiente, null)
  assert.equal(f.sent.filter(m => m.tipo === 'solicitud').length, 1)
})

test('sin confirmación la operación vence y nunca reintenta al reconectar', async t => {
  const { f, phone, pc } = setup(t)
  const done = phone.control.configurar('pc', true)
  await f.deliver('solicitud'); await f.deliver('oferta'); await f.deliver('aplicar')
  f.packets.length = 0 // red perdida antes del resultado
  await f.advance(36_000); await done
  assert.equal(pc.localState.enabled, false); assert.equal(pc.cancelled, 1)
  assert.match(phone.state.error, /confirmación/)
  phone.session = 'iphone-next'; pc.session = 'pc-next'; f.refresh(); await f.drain()
  assert.deepEqual(pc.changes, [true]); assert.equal(f.sent.filter(m => m.tipo === 'solicitud').length, 1)
})

test('PC ausente, cambio de cuenta y revocación durante configuración limpian pedidos', async t => {
  const { f, phone, pc } = setup(t)
  pc.autoReady = false
  const done = phone.control.configurar('pc', true)
  await f.deliver('solicitud'); await f.deliver('oferta'); await f.deliver('aplicar')
  phone.allowed = false; pc.allowed = false; f.refresh(); await done
  assert.equal(phone.state.pendiente, null); assert.deepEqual(phone.state.dispositivos, [])
  assert.equal(pc.localState.enabled, false); assert.equal(pc.cancelled, 1)
  phone.allowed = true; pc.allowed = true; f.refresh()
  const second = phone.control.configurar('pc', true)
  pc.connection = 'desconectado'; f.refresh(); await second
  assert.equal(phone.state.pendiente, null); assert.match(phone.state.error, /disponible/)
})

test('error IPC y receptor ocupado devuelven fallo sin consentimiento activo residual', async t => {
  const { f, phone, pc } = setup(t)
  pc.succeeds = false
  const done = phone.control.configurar('pc', true); await f.drain(); await done
  assert.match(phone.state.error, /No se pudo conectar/); assert.equal(pc.localState.enabled, false)
  pc.succeeds = true; pc.busy = true
  const second = phone.control.configurar('pc', true); await f.drain(); await second
  assert.match(phone.state.error, /cambiando/); assert.deepEqual(pc.changes, [true])
})

test('cancel de otro dispositivo no revoca un pedido confirmado; el original sí', async t => {
  const { f, phone, pc } = setup(t), other = f.client('other')
  f.refresh()
  const done = phone.control.configurar('pc', true); await f.drain(); await done
  const original = f.sent.find(m => m.tipo === 'solicitud')
  pc.control.recibir({ ...original, tipo: 'cancelar', origen: other.id, origenSesion: other.session })
  assert.equal(pc.localState.enabled, true); assert.equal(pc.cancelled, 0)
  pc.control.recibir({ ...original, tipo: 'cancelar' })
  assert.equal(pc.localState.enabled, false); assert.equal(pc.cancelled, 1)
})

test('fallo de envío devuelve error y cleanup no deja timers ni comandos de alta', async t => {
  const { f, phone, pc } = setup(t)
  f.reject(() => true)
  await phone.control.configurar('pc', true)
  assert.match(phone.state.error, /No se pudo enviar/)
  assert.deepEqual(pc.changes, [])
  assert.equal(phone.state.pendiente, null)
})


test('perder el ACK final informa resultado incierto sin inventar desconexión', async t => {
  const { f, phone, pc } = setup(t)
  const done = phone.control.configurar('pc', true)
  await f.deliver('solicitud'); await f.deliver('oferta'); await f.deliver('aplicar')
  f.reject(m => m.tipo === 'confirmar')
  await f.deliver('resultado'); await done
  assert.match(phone.state.error, /confirmar el cambio final/)
  assert.equal(phone.state.dispositivos[0].estado.status, 'ready')
  await f.drain()
  assert.equal(pc.localState.enabled, false)
  assert.equal(f.sent.filter(m => m.tipo === 'solicitud').length, 1)
})
