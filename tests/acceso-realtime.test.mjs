import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function fixture(service) {
  const channels = [], removed = []
  let reads = 0
  const client = {
    getChannels: () => channels,
    removeChannel: async channel => { removed.push(channel); channels.splice(channels.indexOf(channel), 1) },
    from: () => ({ select: () => ({ eq: () => ({ order: async () => { reads++; return { data: [], error: null } } }) }) }),
    channel(topic, options) {
      // Emulate private-only: even Postgres Changes channels must opt in at join.
      assert.equal(options?.config?.private, true)
      const channel = {
        topic: `realtime:${topic}`, options, events: [], tracked: [], sent: [],
        on(type, filter, fn) { this.events.push({ type, filter, fn }); return this },
        subscribe(fn) { this.status = fn; return this },
        track: async data => channel.tracked.push(data),
        presenceState: () => ({ owner: [{ nombre: 'PC' }] }),
        send: async data => channel.sent.push(data),
      }
      channels.push(channel); return channel
    },
  }
  const exports = {}
  const code = ts.transpileModule(readFileSync(`src/services/${service}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('exports', 'require', code)(exports, id => {
    if (id === '../lib/supabase') return { getSupabase: () => client }
    if (id === '../lib/dispositivo') return { nombreDispositivo: () => 'PC' }
    if (id === '../models/message') return { messageFromRow: row => row }
    throw Error(`Unexpected dependency ${id}`)
  })
  return { api: exports, channels, removed, reads: () => reads }
}
const tick = async () => { await Promise.resolve(); await Promise.resolve() }

test('Jam privado conserva presencia, filtros, recarga al reconectar y limpieza', async () => {
  const f = fixture('jam'), present = [], fallen = []
  let reloads = 0
  const stop = f.api.suscribirJam('jam-id', 'owner', {
    onJam: () => {}, onGrueso: () => reloads++, onPresentes: users => present.push(users), onCaida: () => fallen.push(true),
  })
  const c = f.channels[0]
  assert.equal(c.options.config.presence.key, 'owner')
  assert.deepEqual(c.events.filter(e => e.type === 'postgres_changes').map(e => e.filter.filter), ['id=eq.jam-id', 'jam_id=eq.jam-id', 'jam_id=eq.jam-id'])
  c.status('SUBSCRIBED'); c.status('SUBSCRIBED')
  assert.equal(reloads, 2); assert.equal(c.tracked.length, 2)
  c.events.find(e => e.type === 'presence').fn()
  assert.deepEqual(present, [['owner']])
  c.status('CHANNEL_ERROR'); assert.equal(fallen.length, 1)
  stop(); await tick(); assert.deepEqual(f.removed, [c])
})

test('Escucha privada conserva entrega dirigida y cierra el canal al desmontar', async () => {
  const f = fixture('escucha')
  let taken = 0, ready = 0
  const sub = f.api.suscribirEscucha('owner', 'device', { onFila: () => {}, onPresentes: () => {}, onTomar: () => taken++, onListo: () => ready++ })
  await sub.listo
  const c = f.channels[0]
  assert.equal(c.options.config.presence.key, 'device')
  assert.equal(c.events.find(e => e.type === 'postgres_changes').filter.filter, 'user_id=eq.owner')
  c.status('SUBSCRIBED'); assert.equal(ready, 1)
  const delivery = c.events.find(e => e.type === 'broadcast').fn
  delivery({ payload: { destino: 'other' } }); assert.equal(taken, 0)
  delivery({ payload: { destino: 'device' } }); assert.equal(taken, 1)
  sub.mandarA('other'); assert.deepEqual(c.sent[0].payload, { destino: 'other' })
  sub.desuscribir(); await tick(); await tick(); assert.deepEqual(f.removed, [c])
  delivery({ payload: { destino: 'device' } }); assert.equal(taken, 1)
})

test('Inbox privado sigue escuchando mensajes y ambos sentidos de solicitudes', async () => {
  const f = fixture('contacts')
  let changed = 0
  const stop = f.api.subscribeToInbox('owner', () => changed++)
  const c = f.channels[0]
  assert.equal(c.topic, 'realtime:inbox:owner')
  assert.deepEqual(c.events.map(e => [e.filter.table, e.filter.filter]), [
    ['messages', undefined], ['pair_members', 'user_id=eq.owner'], ['contact_requests', 'to_user=eq.owner'], ['contact_requests', 'from_user=eq.owner'],
  ])
  c.status('SUBSCRIBED'); assert.equal(changed, 0)
  c.status('SUBSCRIBED'); assert.equal(changed, 1)
  stop(); await tick(); assert.deepEqual(f.removed, [c])
})

test('Mensajes privados conservan hidratación, filtro del par y recarga tras reconexión', async () => {
  const f = fixture('messages'), renders = [], errors = []
  const stop = f.api.subscribeToMessages('pair-id', (messages, hydrated) => renders.push({ messages, hydrated }), e => errors.push(e))
  await tick()
  const c = f.channels[0]
  assert.equal(c.topic, 'realtime:messages:pair-id')
  assert.equal(c.events[0].filter.filter, 'pair_id=eq.pair-id')
  assert.equal(f.reads(), 1); assert.equal(renders.at(-1).hydrated, true)
  c.status('SUBSCRIBED'); assert.equal(f.reads(), 1)
  c.status('SUBSCRIBED'); await tick(); assert.equal(f.reads(), 2)
  c.status('CHANNEL_ERROR'); assert.equal(errors.length, 1)
  stop(); await tick(); assert.deepEqual(f.removed, [c])
})
