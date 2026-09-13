import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

/**
 * Dónde queda la sesión de Supabase en el escritorio, y cuál de los dos lugares
 * gana al leerla. Ver el comentario de `storageAuthEscritorio`.
 */
const source = ts.transpileModule(readFileSync('src/lib/supabase.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function fixture({ archivo = new Map(), copia = new Map(), rompeArchivo = false } = {}) {
  const escrituras = []
  const authStorage = {
    async getItem(clave) { return archivo.has(clave) ? archivo.get(clave) : null },
    async setItem(clave, valor) {
      escrituras.push(clave)
      if (rompeArchivo) throw new Error('el archivo está ocupado')
      archivo.set(clave, valor)
    },
    async removeItem(clave) {
      if (rompeArchivo) throw new Error('el archivo está ocupado')
      archivo.delete(clave)
    },
  }
  globalThis.dnmusicEscritorio = { authStorage }
  globalThis.localStorage = {
    getItem: clave => (copia.has(clave) ? copia.get(clave) : null),
    setItem: (clave, valor) => copia.set(clave, valor),
    removeItem: clave => copia.delete(clave),
  }
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co'
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon'

  let opciones = null
  const deps = {
    'react-native-url-polyfill/auto': {},
    '@react-native-async-storage/async-storage': { default: {} },
    '@supabase/supabase-js': { createClient: (_url, _key, o) => { opciones = o; return {} } },
    'react-native': { Platform: { OS: 'web' } },
    'expo-crypto': { getRandomValues: () => {} },
  }
  const api = {}
  new Function('exports', 'require', source)(api, clave => {
    assert.ok(clave in deps, clave)
    return deps[clave]
  })
  api.getSupabase()
  return { almacen: opciones.auth.storage, archivo, copia, escrituras }
}

test.afterEach(() => {
  delete globalThis.dnmusicEscritorio
  delete globalThis.localStorage
})

const CLAVE = 'sb-proyecto-auth-token'

test('sin copia de respaldo la sesión sale del archivo protegido', async () => {
  const f = fixture({ archivo: new Map([[CLAVE, 'sesion']]) })
  assert.equal(await f.almacen.getItem(CLAVE), 'sesion')
  await f.almacen.setItem(CLAVE, 'renovada')
  assert.equal(f.archivo.get(CLAVE), 'renovada')
  assert.equal(f.copia.size, 0)
})

test('la copia de respaldo gana, porque solo existe cuando el archivo se quedó atrás', async () => {
  /*
   * Es el bug de Windows: el guardado protegido falla —antivirus, OneDrive— y
   * la sesión nueva queda solo en la copia. Leyendo primero el archivo se
   * devolvía la sesión **anterior**; Supabase la veía vencida, la renovaba con
   * un refresh token gastado, recibía un 400 y la borraba. Entrabas y a los
   * segundos volvías al login.
   */
  const f = fixture({ archivo: new Map([[CLAVE, 'vieja']]), copia: new Map([[CLAVE, 'nueva']]) })
  assert.equal(await f.almacen.getItem(CLAVE), 'nueva')
  /* Y al leerla se rescata: el archivo vuelve a estar al día y la copia sobra. */
  assert.equal(f.archivo.get(CLAVE), 'nueva')
  assert.equal(f.copia.size, 0)
})

test('un guardado que el archivo no acepta se lee igual, y no se rescata a cada lectura', async () => {
  const f = fixture({ archivo: new Map([[CLAVE, 'vieja']]), rompeArchivo: true })
  /* Guardar no falla: la copia también es un lugar del que se puede leer, y
     hacerlo fallar dejaría a Supabase creyendo que no hay sesión. */
  await f.almacen.setItem(CLAVE, 'nueva')
  assert.equal(f.copia.get(CLAVE), 'nueva')
  assert.equal(await f.almacen.getItem(CLAVE), 'nueva')
  assert.equal(await f.almacen.getItem(CLAVE), 'nueva')
  /* Un intento de rescate por lectura convertiría cada `getSession()` —que
     corre en cada pedido— en una escritura a disco. */
  assert.deepEqual(f.escrituras, [CLAVE, CLAVE])
})

test('cerrar sesión limpia los dos lados', async () => {
  const f = fixture({ archivo: new Map([[CLAVE, 'vieja']]), copia: new Map([[CLAVE, 'nueva']]) })
  await f.almacen.removeItem(CLAVE)
  assert.equal(f.archivo.size, 0)
  assert.equal(f.copia.size, 0)
  assert.equal(await f.almacen.getItem(CLAVE), null)
})
