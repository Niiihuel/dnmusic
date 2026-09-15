import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function load(result) {
  let request
  const source = ts.transpileModule(readFileSync('src/services/storageBudget.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  new Function('exports', 'require', source)(exports, id => {
    assert.equal(id, '../lib/supabase')
    return { getSupabase: () => ({ rpc: async (name, args) => {
      request = { name, args }
      return result
    } }) }
  })
  return { ...exports, get request() { return request } }
}

test('consulta el total con el tamaño exacto antes de permitir la subida', async () => {
  const api = load({ data: true, error: null })
  await api.assertStorageBudget(new ArrayBuffer(1234))
  assert.deepEqual(api.request, {
    name: 'storage_upload_allowed',
    args: { p_size: 1234, p_exclude: null },
  })
})

test('falla cerrado si no hay reserva o no puede comprobarla', async () => {
  await assert.rejects(
    load({ data: false, error: null }).assertStorageBudget(new ArrayBuffer(1)),
    /reserva para iniciar sesión/,
  )
  await assert.rejects(
    load({ data: null, error: { message: 'sin conexión' } }).assertStorageBudget(new ArrayBuffer(1)),
    /No se pudo comprobar.*sin conexión/,
  )
})
