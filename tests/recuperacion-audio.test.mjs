import test from 'node:test'
import assert from 'node:assert/strict'
import { crearVigilanteAudio, abrirFuenteConReintento, esperarAperturaAudio } from '../src/lib/recuperacionAudio.ts'
import { crearMedidorEscucha } from '../src/lib/escuchaEfectiva.ts'

const flush = () => new Promise(resolve => setImmediate(resolve))
const normal = (patch = {}) => ({ currentTime: 42, playing: true, isLoaded: true, isBuffering: false, timeControlStatus: 'playing', ...patch })
function fixture(presupuesto = { intentos: 0 }) {
  let now = 0, active = true, failure = false, n = 0
  const timers = new Map(), calls = [], events = []
  const api = crearVigilanteAudio({ presupuesto, sigue: () => active, ahora: () => now,
    programar: (fn, delay) => { const id = ++n; timers.set(id, {fn, delay}); return id }, cancelar: id => timers.delete(id),
    recargar: async ms => { calls.push(ms); if (failure) throw Error('sin red') },
    agotado: () => calls.push('agotado'), incidencia: evento => events.push(evento),
  })
  return { api, calls, events, timers, presupuesto,
    time: value => now = value, active: value => active = value, fail: () => failure = true,
    async run() { const task = timers.values().next().value; timers.clear(); task?.fn(); await flush() },
  }
}

test('error nativo reabre el mismo tema desde el último segundo, sin duplicar reintentos', async () => {
  const h = fixture(); h.api.recibir(normal())
  assert.equal(h.api.recibir(normal({ currentTime: 0, playing: false, error: 'HTTP 403' })), true)
  h.api.recibir(normal({ playing: false, error: 'HTTP 403' }))
  assert.equal(h.timers.size, 1); assert.equal(h.presupuesto.intentos, 1)
  await h.run(); assert.deepEqual(h.calls, [42000])
  h.api.recibir(normal({ currentTime: 43 }))
  assert.equal(h.events.at(-1).tipo, 'recuperado')
})

test('el presupuesto de dos reintentos sobrevive al cambio de player y termina con error legible', async () => {
  const budget = { intentos: 0 }, h = fixture(budget)
  h.fail(); h.api.recibir(normal({ error: 'sin red' })); await h.run(); await h.run()
  assert.equal(budget.intentos, 2); assert.equal(h.calls.filter(x => x === 'agotado').length, 1)
  h.api.recibir(normal({ error: 'otra vez' })); assert.equal(h.timers.size, 0)
  const nuevo = fixture(budget); nuevo.api.recibir(normal({ error: 'otro player' }))
  assert.deepEqual(nuevo.calls, ['agotado']); assert.equal(nuevo.timers.size, 0)
})

test('pausar, cambiar de canción o desmontar cancela la recuperación sin reanudar nada', async () => {
  for (const cancelar of ['intencion', 'desmontar']) {
    const h = fixture(); h.api.recibir(normal({ error: 'falló' }))
    if (cancelar === 'intencion') h.active(false); else h.api.cancelar()
    await h.run(); assert.deepEqual(h.calls, [])
  }
  const h = fixture(); h.api.recibir(normal()); h.api.recibir(normal({ playing: false, timeControlStatus: 'paused' }))
  h.time(30_000); h.api.recibir(normal({ playing: false, timeControlStatus: 'paused' }))
  assert.equal(h.timers.size, 0)
})

test('esperar buffer no equivale a pausar: sólo recupera tras quince segundos sin avance', () => {
  const h = fixture(), waiting = normal({ playing: false, isBuffering: true, timeControlStatus: 'waitingToPlayAtSpecifiedRate' })
  h.api.recibir(waiting); h.time(14_999); h.api.recibir(waiting); assert.equal(h.timers.size, 0)
  h.time(15_000); h.api.recibir(waiting); assert.equal(h.timers.size, 1)
  const avanza = fixture(); avanza.api.recibir(waiting)
  for (let n = 1; n < 40; n++) { avanza.time(n * 1000); avanza.api.recibir({...waiting, currentTime: 42 + n}) }
  assert.equal(avanza.timers.size, 0, 'una reproducción que avanza no se reinicia')
})

test('la firma cancelada no publica resultados ni inicia otro intento', async () => {
  const abort = new AbortController(); let finish, calls = 0
  const result = abrirFuenteConReintento(() => { calls++; return new Promise(resolve => finish = resolve) }, abort.signal)
  await Promise.resolve(); abort.abort(); finish('url-vieja'); await assert.rejects(result, { name: 'AbortError' }); assert.equal(calls, 1)
})

test('contabiliza escucha por eventos con pantalla apagada y excluye seeks, pausa y buffering', () => {
  const meter = crearMedidorEscucha()
  assert.equal(meter.medir(0, 0, true), 0)
  let total = 0
  for (let i = 1; i <= 180; i++) total += meter.medir(i * 1000, i * 1000, true)
  assert.equal(total, 180000)
  assert.equal(meter.medir(240000, 181000, true, true), 0, 'adelantar no es escuchar')
  assert.equal(meter.medir(241000, 182000, true), 0)
  assert.equal(meter.medir(242000, 183000, false), 1000)
  assert.equal(meter.medir(242000, 184000, false), 0)
  assert.equal(meter.medir(242000, 185000, true), 0)
  assert.equal(meter.medir(243000, 186000, true), 1000)
  assert.equal(meter.medir(300000, 250000, true), 0, 'un hueco sin eventos no se inventa como escucha')
  meter.reiniciar(); assert.equal(meter.medir(0, 251000, true), 0)
})


test('una apertura colgada termina por plazo y una cancelación no espera a la red', async () => {
  const abort = new AbortController()
  await assert.rejects(esperarAperturaAudio(() => new Promise(() => {}), abort.signal, 10), /Tiempo de espera/)
  const result = esperarAperturaAudio(() => new Promise(() => {}), abort.signal)
  abort.abort()
  await assert.rejects(result, { name: 'AbortError' })
})

test('si el buffer se recupera antes del reintento, no reabre ni retrocede el audio', async () => {
  const h = fixture(), waiting = normal({ playing: false, isBuffering: true })
  h.api.recibir(waiting); h.time(15_000); h.api.recibir(waiting)
  assert.equal(h.timers.size, 1)
  h.time(15_500); h.api.recibir(normal({ currentTime: 42.5 }))
  await h.run(); assert.deepEqual(h.calls, []); assert.equal(h.events.at(-1).tipo, 'recuperado')
})

test('fallar al abrir el player de recuperación conserva el segundo del anterior', async () => {
  const budget = { intentos: 0 }, primero = fixture(budget)
  primero.api.recibir(normal({ currentTime: 42 })); primero.api.recibir(normal({ error: 'falló' }))
  await primero.run(); primero.api.cancelar()
  const segundo = fixture(budget)
  segundo.api.recibir(normal({ currentTime: 0, playing: false, isLoaded: false }))
  segundo.api.recibir(normal({ currentTime: 0, playing: false, isLoaded: false, error: 'falló de nuevo' }))
  await segundo.run(); assert.deepEqual(segundo.calls, [42000])
})
