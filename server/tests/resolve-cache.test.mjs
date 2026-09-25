import test from 'node:test'
import assert from 'node:assert/strict'
import { resolverCancion } from '../dist/index.js'

function dbConArchivos(names) {
  let consultas = 0
  return {
    db: {
      storage: {
        from(bucket) {
          assert.equal(bucket, 'songs')
          return {
            async list(folder, { search }) {
              assert.equal(folder, '')
              assert.equal(search, 'abcdefghijk')
              consultas++
              return { data: names.map(name => ({ name })) }
            },
          }
        },
      },
    },
    consultas: () => consultas,
  }
}

test('resolve reutiliza un webm ya guardado sin volver a pedir audio a YouTube', async () => {
  const { db, consultas } = dbConArchivos(['abcdefghijk.webm'])
  const result = await resolverCancion(db, { videoId: 'abcdefghijk', durationMs: 123000 })
  assert.deepEqual(result, {
    path: 'abcdefghijk.webm', artworkPath: null, cached: true, durationMs: 123000,
  })
  assert.equal(consultas(), 1)
})

test('resolve prefiere m4a y no confunde archivos ajenos con el audio', async () => {
  const { db } = dbConArchivos([
    'abcdefghijk2.m4a', 'abcdefghijk.json', 'abcdefghijk.webm', 'abcdefghijk.m4a',
  ])
  const result = await resolverCancion(db, { videoId: 'abcdefghijk', durationMs: 1000 })
  assert.equal(result.path, 'abcdefghijk.m4a')
  assert.equal(result.cached, true)
})
