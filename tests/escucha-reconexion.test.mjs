import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function fixture() {
  const channels = [], removed = []
  const client = {
    getChannels: () => channels,
    async removeChannel(c) {
      await Promise.resolve()
      const index = channels.indexOf(c)
      if (index >= 0) channels.splice(index, 1)
      removed.push(c)
    },
    channel(topic) {
      const existing = channels.find(c => c.topic === `realtime:${topic}`)
      if (existing) return existing
      const c = {
        topic: `realtime:${topic}`, subscribed: false, callbacks: [], sent: [],
        on(type, filter, callback) {
          assert.equal(this.subscribed, false, 'No agregar callbacks después de subscribe')
          this.callbacks.push({ type, callback }); return this
        },
        subscribe(callback) { this.subscribed = true; this.status = callback; return this },
        track: async () => {}, presenceState: () => ({}),
        send(payload) { this.sent.push(payload); return Promise.resolve() },
      }
      channels.push(c)
      return c
    },
  }
  function load() {
    const exports = {}
    const { outputText } = ts.transpileModule(readFileSync('src/services/escucha.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    })
    new Function('exports', 'require', outputText)(exports, id => {
      if (id === '../lib/supabase') return { getSupabase: () => client }
      if (id === '../lib/dispositivo') return { nombreDispositivo: () => 'Prueba' }
      throw Error(id)
    })
    return exports.suscribirEscucha
  }
  const calls = []
  const hooks = { onFila: () => calls.push('fila'), onPresentes: () => calls.push('presencia'), onTomar: () => calls.push('tomar'), onListo: () => calls.push('listo') }
  return { load, client, channels, removed, hooks, calls }
}

test('reconectar incluso tras Fast Refresh reemplaza el canal y descarta eventos tardíos', async () => {
  const f = fixture()
  const first = f.load()('user', 'device', f.hooks)
  await first.listo
  const old = f.channels[0]
  const next = f.load()('user', 'device', f.hooks)
  await next.listo
  assert.equal(f.channels.length, 1)
  assert.notEqual(f.channels[0], old)
  assert.ok(f.removed.includes(old))
  old.status('SUBSCRIBED')
  old.callbacks.find(c => c.type === 'broadcast').callback({ payload: { destino: 'device' } })
  assert.deepEqual(f.calls, [])
  first.mandarA('otro')
  assert.equal(old.sent.length, 0)
  next.mandarA('otro')
  assert.equal(f.channels[0].sent.length, 1)
  next.desuscribir()
})

test('inicio simultáneo y limpieza repetida dejan una sola conexión nueva', async () => {
  const f = fixture(), subscribe = f.load()
  const a = subscribe('user', 'device', f.hooks)
  const b = subscribe('user', 'device', f.hooks)
  b.desuscribir(); b.desuscribir()
  const c = subscribe('user', 'device', f.hooks)
  await Promise.all([a.listo, b.listo, c.listo])
  assert.equal(f.channels.length, 1)
  f.channels[0].status('SUBSCRIBED')
  assert.deepEqual(f.calls, ['listo'])
  c.desuscribir()
})

test('recupera un canal legado ya suscripto y mantiene las conexiones de otras cuentas', async () => {
  const f = fixture()
  const old = f.client.channel('escucha:user').subscribe(() => {})
  const other = f.client.channel('escucha:other').subscribe(() => {})
  const sub = f.load()('user', 'device', f.hooks)
  await sub.listo
  assert.equal(f.channels.length, 2)
  assert.ok(f.removed.includes(old))
  assert.ok(f.channels.includes(other))
  sub.desuscribir()
})
