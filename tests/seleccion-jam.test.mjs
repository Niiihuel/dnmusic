import test from 'node:test'
import assert from 'node:assert/strict'
import { crearSeleccionJam } from '../src/lib/seleccionJam.ts'
const track = (id, preparado = true) => ({ id, audioPath: preparado ? id + '.mp3' : '' })
const diferida = () => {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}

test('resuelve la elegida y nunca la saltea por otra ya preparada', async () => {
  const pedidos = [],
    envios = []
  const c = crearSeleccionJam({
    preparar: async (t) => {
      pedidos.push(t.id)
      return track(t.id)
    },
    publicar: async (_, lista) => envios.push(lista),
    vigente: () => true,
    onError: (e) => {
      throw e
    },
  })
  await c.elegir(
    'jam',
    [track('antes'), track('elegida', false), track('despues'), track('pendiente', false)],
    1,
  )
  assert.deepEqual(pedidos, ['elegida'])
  assert.deepEqual(
    envios[0].map((t) => t.id),
    ['elegida', 'despues'],
  )
})
test('el último clic gana aunque la descarga anterior termine tarde', async () => {
  const lenta = diferida(),
    envios = []
  let signal
  const c = crearSeleccionJam({
    preparar: async (t, s) => {
      signal = s
      await lenta.promise
      return track(t.id)
    },
    publicar: async (_, lista) => envios.push(lista[0].id),
    vigente: () => true,
    onError: (e) => {
      throw e
    },
  })
  const anterior = c.elegir('jam', [track('lenta', false)], 0)
  await c.elegir('jam', [track('ultima')], 0)
  lenta.resolve()
  await anterior
  assert.equal(signal.aborted, true)
  assert.deepEqual(envios, ['ultima'])
})
test('salir cancela selecciones pendientes', async () => {
  const lenta = diferida(),
    envios = []
  const c = crearSeleccionJam({
    preparar: async (t) => {
      await lenta.promise
      return track(t.id)
    },
    publicar: async (_, lista) => envios.push(lista),
    vigente: () => true,
    onError: (e) => {
      throw e
    },
  })
  const p = c.elegir('jam', [track('pendiente', false)], 0)
  c.cancelar()
  lenta.resolve()
  await p
  assert.deepEqual(envios, [])
})
test('serializa RPCs en vuelo para que el servidor termine en la última canción', async () => {
  const lenta = diferida(),
    inicio = diferida(),
    envios = []
  const c = crearSeleccionJam({
    preparar: async (t) => t,
    publicar: async (_, lista) => {
      if (lista[0].id === 'primera') {
        inicio.resolve()
        await lenta.promise
      }
      envios.push(lista[0].id)
    },
    vigente: () => true,
    onError: (e) => {
      throw e
    },
  })
  const a = c.elegir('jam', [track('primera')], 0)
  await inicio.promise
  const b = c.elegir('jam', [track('ultima')], 0)
  lenta.resolve()
  await Promise.all([a, b])
  assert.deepEqual(envios, ['primera', 'ultima'])
})
