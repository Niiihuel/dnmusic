import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function fixture() {
  const channels = [], removed = [], clock = new Map(), presences = [], conexiones = []
  let now=100000, timer=0
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
        presence: {}, result: 'ok', track: async () => {}, presenceState() { return this.presence },
        send(payload) { this.sent.push(payload); return Promise.resolve(this.result) },
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
    new Function('exports', 'require', 'Date', 'setInterval', 'clearInterval', outputText)(exports, id => {
      if (id === '../lib/supabase') return { getSupabase: () => client }
      if (id === './lecturaViva') return { LATIDO_ESCUCHA_MS: 20000, VIGENCIA_ESCUCHA_MS: 65000 }
      if (id === '../lib/dispositivo') return { nombreDispositivo: () => 'Prueba' }
      throw Error(id)
    }, class extends Date { static now(){return now} }, (fn)=>{clock.set(++timer,fn);return timer}, id=>clock.delete(id))
    return exports.suscribirEscucha
  }
  const calls = []
  const hooks = { onFila: () => calls.push('fila'), onPresentes: ds => { presences.push(ds); calls.push('presencia') }, onTomar: () => calls.push('tomar'), onListo: () => calls.push('listo'), onConexion: c=>conexiones.push(c) }
  return { load, client, channels, removed, hooks, calls, presences, conexiones, advance(ms){now+=ms;for(const fn of clock.values())fn()} }
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
  await assert.rejects(first.mandarA('otro'), /conexión/)
  assert.equal(old.sent.length, 0)
  f.channels[0].status('SUBSCRIBED')
  await next.mandarA('otro')
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
  assert.deepEqual(f.calls, ['presencia', 'listo'])
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


test('presencia vence sin latido nuevo y error de canal deja de anunciar dispositivos conectados',async()=>{
 const f=fixture(),sub=f.load()('user','ios',f.hooks);await sub.listo
 const ch=f.channels[0];ch.presence={pc:[{nombre:'PC',en:1}]};ch.status('SUBSCRIBED')
 assert.equal(f.presences.at(-1)[0].deviceId,'pc')
 f.advance(70000);assert.deepEqual(f.presences.at(-1),[])
 ch.presence.pc[0].en=2;f.advance(20000);assert.equal(f.presences.at(-1)[0].nombre,'PC')
 ch.status('CHANNEL_ERROR');assert.equal(f.conexiones.at(-1),'desconectado');assert.deepEqual(f.presences.at(-1),[])
 await assert.rejects(sub.mandarA('pc'),/conexión/);sub.desuscribir()
})

test('envío exige ACK y conserva explícitamente el estado pausado',async()=>{
 const f=fixture(),sub=f.load()('user','ios',f.hooks);await sub.listo
 const ch=f.channels[0];ch.status('SUBSCRIBED');await sub.mandarA('pc',false)
 assert.equal(ch.sent[0].payload.destino,'pc');assert.equal(ch.sent[0].payload.suena,false);assert.equal(typeof ch.sent[0].payload.requestId,'string')
 ch.result='timed out';await assert.rejects(sub.mandarA('pc'),/enviar/);sub.desuscribir()
})

test('pedidos dirigidos duplicados o con revisión malformada no vuelven a disparar el receptor',async()=>{
 const f=fixture(),sub=f.load()('user','ios',f.hooks);await sub.listo
 const ch=f.channels[0];ch.status('SUBSCRIBED')
 const recibir=ch.callbacks.find(c=>c.type==='broadcast').callback
 const payload={destino:'ios',requestId:'request-1',revision:3,suena:false}
 recibir({payload});recibir({payload});recibir({payload:{...payload,requestId:'request-2',revision:-1}})
 assert.equal(f.calls.filter(x=>x==='tomar').length,1);sub.desuscribir()
})
