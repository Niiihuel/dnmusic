import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cacheConsultas } from '../dist/cache-consultas.js'

test('normaliza espacios y comparte consultas simultáneas y resultados', async () => {
  let calls = 0
  const search = cacheConsultas(async query => { calls++; return [query] })
  const [a, b] = await Promise.all([search('  The   Neighbourhood '), search('The Neighbourhood')])
  assert.deepEqual(a, ['The Neighbourhood'])
  assert.equal(a, b)
  assert.equal(await search('The Neighbourhood'), a)
  assert.equal(calls, 1)
})

test('un error no queda cacheado ni bloquea búsquedas posteriores', async () => {
  let calls = 0
  const search = cacheConsultas(async () => {
    if (++calls === 1) throw new Error('network')
    return ['ok']
  })
  await assert.rejects(search('abc'), /network/)
  assert.deepEqual(await search('abc'), ['ok'])
  assert.equal(calls, 2)
})

test('vence por TTL y limita la memoria con expulsión LRU', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 })
  let calls = 0
  const search = cacheConsultas(async query => { calls++; return query }, 100, 2)
  await search('a'); await search('b'); await search('a'); await search('c')
  assert.equal(calls, 3)
  await search('b')
  assert.equal(calls, 4)
  t.mock.timers.tick(101)
  await search('b')
  assert.equal(calls, 5)
})
