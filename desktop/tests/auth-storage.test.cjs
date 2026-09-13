const test = require('node:test')
const assert = require('node:assert/strict')
const { chmod, mkdtemp, readFile, writeFile } = require('node:fs/promises')
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

test('un guardado que falla deja la sesión nueva en pie, no la anterior', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dnmusic-auth-'))
  const ruta = join(dir, 'auth.bin')
  const avisos = []
  let disco = true
  const fragil = {
    codificar: texto => {
      if (!disco) throw Object.assign(new Error('ocupado'), { code: 'EPERM' })
      return codec.codificar(texto)
    },
    decodificar: codec.decodificar,
  }
  const almacen = new AlmacenAuth(ruta, fragil, (motivo) => avisos.push(motivo))

  await almacen.setItem('sb-proyecto-auth-token', 'sesion-vieja')
  disco = false
  await assert.rejects(almacen.setItem('sb-proyecto-auth-token', 'sesion-nueva'))

  /* Lo que no se pudo guardar no vuelve para atrás: servir la sesión anterior
     era lo que hacía que Supabase la renovara con un refresh token gastado y
     cerrara la sesión a los segundos de entrar. */
  assert.equal(await almacen.getItem('sb-proyecto-auth-token'), 'sesion-nueva')
  assert.deepEqual(avisos, ['no se pudo guardar la sesión'])
})

test('reintenta el reemplazo del archivo mientras el sistema lo tiene ocupado', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dnmusic-auth-'))
  const ruta = join(dir, 'auth.bin')
  const avisos = []
  const almacen = new AlmacenAuth(ruta, codec, (motivo) => avisos.push(motivo))

  /* La carpeta sin permiso de escritura es lo más parecido que hay acá al
     antivirus de Windows agarrando el archivo justo cuando se lo reemplaza:
     falla, y un instante después deja de fallar. */
  await chmod(dir, 0o500)
  const suelta = setTimeout(() => void chmod(dir, 0o700), 30)
  try {
    await almacen.setItem('sb-proyecto-auth-token', 'sesion')
  } finally {
    clearTimeout(suelta)
    await chmod(dir, 0o700)
  }

  assert.equal(await new AlmacenAuth(ruta, codec).getItem('sb-proyecto-auth-token'), 'sesion')
  assert.deepEqual(avisos, [])
})
