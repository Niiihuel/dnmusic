import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { accesoAprobado } from '../dist/acceso.js'

test('verifica sesión y usa sólo el UUID devuelto por Auth para consultar aprobación vigente', async () => {
  const calls = []
  const db = {
    auth: { getUser: async token => { calls.push(['auth', token]); return { data: { user: { id: 'verified-id', user_metadata: { is_admin: true, status: 'approved' } } }, error: null } } },
    rpc: async (name, args) => { calls.push([name, args]); return { data: true, error: null } },
  }
  assert.equal(await accesoAprobado(db, 'Bearer signed-session'), true)
  assert.deepEqual(calls, [['auth', 'signed-session'], ['access_user_approved', { p_user_id: 'verified-id' }]])
})

test('pendiente/rechazado o fallo de DB se deniegan aunque el JWT y metadata digan aprobado', async () => {
  const db = { auth: { getUser: async () => ({ data: { user: { id: 'one', app_metadata: { status: 'approved' } } }, error: null }) }, rpc: async () => ({ data: false, error: null }) }
  assert.equal(await accesoAprobado(db, 'Bearer token'), false)
  db.rpc = async () => ({ data: true, error: { message: 'unavailable' } })
  assert.equal(await accesoAprobado(db, 'Bearer token'), false)
  db.rpc = async () => { throw Error('network') }
  assert.equal(await accesoAprobado(db, 'Bearer token'), false)
})

test('token ausente, sesión inválida y usuario inexistente no alcanzan el RPC privilegiado', async () => {
  const db = { auth: { getUser: async () => ({ data: { user: null }, error: null }) }, rpc: () => assert.fail('No RPC without verified subject') }
  for (const token of [null, '', 'Basic token', 'Bearer ', 'Bearer invalid']) assert.equal(await accesoAprobado(db, token), false)
  db.auth.getUser = async () => ({ data: { user: { id: 'one' } }, error: { message: 'expired' } })
  assert.equal(await accesoAprobado(db, 'Bearer token'), false)
  assert.equal(await accesoAprobado(null, 'Bearer token'), false)
})

test('no cachea autorización: rechazo posterior bloquea inmediatamente la próxima operación', async () => {
  let approved = true, checks = 0
  const db = { auth: { getUser: async () => ({ data: { user: { id: 'one' } }, error: null }) }, rpc: async () => { checks++; return { data: approved, error: null } } }
  assert.equal(await accesoAprobado(db, 'Bearer same-token'), true)
  approved = false
  assert.equal(await accesoAprobado(db, 'Bearer same-token'), false)
  assert.equal(checks, 2)
})

test('ambas entradas del servidor delegan al mismo guard; proxy público no puede leer Storage', () => {
  for (const path of ['server/src/index.ts', 'server/src/livianas.ts']) {
    const source = readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
    assert.match(source, /return accesoAprobado\(supabase, (req.headers.authorization|cabecera)\)/)
  }
  const source = readFileSync(new URL('../src/livianas.ts', import.meta.url), 'utf8')
  const allowlist = source.match(/const IMAGE_HOSTS = (.+)/)[1]
  assert.doesNotMatch(allowlist, /supabase|storage/)
})
