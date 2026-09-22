import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

/**
 * Lo que devuelve el módulo, aplanado.
 *
 * Los objetos nacen adentro del `vm`, o sea con **otro** `Object.prototype`, y
 * `deepEqual` estricto compara prototipos: un `{que, id}` correcto fallaría por
 * venir del otro realm. Se comparan los campos, que es lo que importa.
 */
const plano = (d) => (d ? { que: d.que, id: d.id } : d)

/**
 * Los links compartidos: cómo se arman, cómo se reconocen y qué rutas se
 * dibujan sin sesión.
 *
 * `src/lib/compartir.ts` se carga en una caja con react-native simulado —el
 * módulo lo importa por `Share` y `Platform`, que acá no existen— para poder
 * probar además el orden de `compartirCancion`: publicar la tarjeta **antes**
 * de ofrecer el link no es un detalle de implementación, es lo único que hace
 * que el preview de WhatsApp llegue con tapa.
 */
function cargar(path, imports) {
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    require: (nombre) => {
      assert.ok(nombre in imports, `Import no simulado: ${nombre}`)
      return imports[nombre]
    },
  })
  return exports
}

function caja() {
  const hechos = []
  const compartir = cargar('src/lib/compartir.ts', {
    'react-native': {
      Platform: { OS: 'ios' },
      Share: { share: async () => hechos.push('hoja') },
    },
    '../state/aviso': { avisar: () => hechos.push('aviso') },
    './portapapeles': { copiarAlPortapapeles: async () => (hechos.push('copiar'), true) },
    '../services/compartidos': { publicarCancion: async () => hechos.push('publicar') },
  })
  return { compartir, hechos }
}

const { compartir } = caja()

test('cada compartible tiene su link y su versión para incrustar', () => {
  assert.equal(compartir.linkDe('cancion', 'abc123'), 'https://dnmusic-production-c3f4.up.railway.app/cancion/abc123')
  assert.equal(compartir.linkDe('lista', 'un-uuid'), 'https://dnmusic-production-c3f4.up.railway.app/lista/un-uuid')
  assert.equal(compartir.baseDe('jam'), 'https://dnmusic-production-c3f4.up.railway.app/jam')
  assert.equal(
    compartir.linkIncrustado('cancion', 'abc123'),
    'https://dnmusic-production-c3f4.up.railway.app/embed/cancion/abc123',
  )
  assert.match(compartir.codigoIncrustado('cancion', 'abc123'), /^<iframe src="https:\/\/dnmusic-production-c3f4\.up\.railway\.app\/embed\/cancion\/abc123"/)
})

test('una canción propia sobrevive al viaje por la URL', () => {
  const id = 'propia:0f8e2c1a-4b5d-4c6e-8f90-1a2b3c4d5e6f'
  const link = compartir.linkDe('cancion', id)
  assert.ok(!link.includes(':', 'https:'.length), 'los dos puntos del id van codificados')
  assert.deepEqual(plano(compartir.enlaceDeDnmusic(link)), { que: 'cancion', id })
})

test('reconoce las tres formas en que llega un link nuestro', () => {
  for (const url of [
    'https://dnmusic-production-c3f4.up.railway.app/cancion/abc123',
    'dnmusic://cancion/abc123',
    'app://dnmusic/cancion/abc123',
  ]) {
    assert.deepEqual(plano(compartir.enlaceDeDnmusic(url)), { que: 'cancion', id: 'abc123' }, url)
    assert.equal(compartir.rutaDeEnlace(url), '/cancion/abc123', url)
  }
})

test('nunca convierte un link ajeno en una ruta de la app', () => {
  for (const url of [
    'https://otro.test/cancion/abc123',
    'https://dnmusic-production-c3f4.up.railway.app.evil.test/cancion/abc123',
    'https://dnmusic-production-c3f4.up.railway.app/ajustes/accesos',
    'https://dnmusic-production-c3f4.up.railway.app/cancion/',
    'javascript:alert(1)//dnmusic-production-c3f4.up.railway.app/cancion/x',
    'dnmusic://cancion/%E0%A4%A',
    '',
  ]) {
    assert.equal(compartir.enlaceDeDnmusic(url), null, url)
  }
})

test('se dibujan sin sesión las cuatro rutas de link, y ninguna de adentro', () => {
  for (const segmentos of [
    ['cancion', '[id]'],
    ['lista', '[id]'],
    ['jam', '[code]'],
    ['perfil', '[usuario]'],
  ]) {
    assert.equal(compartir.esAterrizaje(segmentos), true, segmentos.join('/'))
  }
  /* Las de adentro tienen exactamente la misma forma en el pathname: por eso
     la pregunta se hace sobre los segmentos y no sobre la URL. */
  for (const segmentos of [
    ['lista', 'nueva'],
    ['lista', 'personas'],
    ['jam', 'opciones'],
    ['perfil', 'encuadrar'],
    ['ajustes', '[id]'],
    ['cancion'],
    ['cancion', '[id]', 'algo'],
  ]) {
    assert.equal(compartir.esAterrizaje(segmentos), false, segmentos.join('/'))
  }
})

test('compartir una canción publica su tarjeta antes de ofrecer el link', async () => {
  const { compartir: c, hechos } = caja()
  await c.compartirCancion({ videoId: 'abc123', title: 'Tema', artist: 'Artista' })
  assert.equal(hechos[0], 'publicar', 'la tarjeta se publica primero')
  assert.deepEqual(hechos, ['publicar', 'copiar', 'hoja'])
})

test('si publicar falla, la canción se comparte igual', async () => {
  const hechos = []
  const c = cargar('src/lib/compartir.ts', {
    'react-native': { Platform: { OS: 'web' }, Share: { share: async () => {} } },
    '../state/aviso': { avisar: () => hechos.push('aviso') },
    './portapapeles': { copiarAlPortapapeles: async () => (hechos.push('copiar'), true) },
    '../services/compartidos': {
      publicarCancion: async () => {
        throw new Error('sin red')
      },
    },
  })
  await c.compartirCancion({ videoId: 'abc123', title: 'Tema', artist: 'Artista' })
  assert.deepEqual(hechos, ['copiar', 'aviso'])
})
