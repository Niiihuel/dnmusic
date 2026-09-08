const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtemp, readFile, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { AlmacenAuth } = require('../dist/auth-storage.js')

const codec = {
  codificar: texto => Buffer.concat([Buffer.from('cifrado:'), Buffer.from(texto)]),
  decodificar: datos => {
    if (!datos.subarray(0, 8).equals(Buffer.from('cifrado:'))) throw new Error('dañado')
    return datos.subarray(8).toString('utf8')
  },
}

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'dnmusic-auth-'))
  return { ruta: join(dir, 'auth.bin'), almacen: new AlmacenAuth(join(dir, 'auth.bin'), codec) }
}

test('persiste varias claves de Auth, las recupera al reiniciar y elimina una sola', async () => {
  const h = await fixture()
  await Promise.all([
    h.almacen.setItem('sb-proyecto-auth-token', 'sesion'),
    h.almacen.setItem('sb-proyecto-auth-token-code-verifier', 'pkce'),
  ])
  const reinicio = new AlmacenAuth(h.ruta, codec)
  assert.equal(await reinicio.getItem('sb-proyecto-auth-token'), 'sesion')
  assert.equal(await reinicio.getItem('sb-proyecto-auth-token-code-verifier'), 'pkce')
  await reinicio.removeItem('sb-proyecto-auth-token')
  const otro = new AlmacenAuth(h.ruta, codec)
  assert.equal(await otro.getItem('sb-proyecto-auth-token'), null)
  assert.equal(await otro.getItem('sb-proyecto-auth-token-code-verifier'), 'pkce')
  assert.ok((await readFile(h.ruta)).toString().startsWith('cifrado:'))
})

test('un archivo dañado no bloquea un login nuevo y las claves arbitrarias se rechazan', async () => {
  const h = await fixture()
  await writeFile(h.ruta, 'contenido roto')
  const reparado = new AlmacenAuth(h.ruta, codec)
  assert.equal(await reparado.getItem('sb-proyecto-auth-token'), null)
  await reparado.setItem('sb-proyecto-auth-token', 'nueva')
  assert.equal(await new AlmacenAuth(h.ruta, codec).getItem('sb-proyecto-auth-token'), 'nueva')
  assert.throws(() => reparado.setItem('../archivo sorteado', 'valor'), /Clave/)
})
