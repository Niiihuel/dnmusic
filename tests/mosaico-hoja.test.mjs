import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function elegirImagen(contexto) {
  const path = 'app/profile/agregar.tsx'
  const ast = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let node
  function visit(n) {
    if (ts.isFunctionDeclaration(n) && n.name?.text === 'elegirImagen') node = n
    ts.forEachChild(n, visit)
  }
  visit(ast)
  const code = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(contexto), `${code}; return elegirImagen`)(...Object.values(contexto))
}
function caso() {
  const state = { busy: false, error: null, destino: null, drafts: [], uploads: 0, picks: 0 }
  let resolver
  const enVuelo = { current: false }
  const run = elegirImagen({ user: { id: 'yo' }, enVuelo, ocupado: false, parentId: null,
    setError: v => { state.error = v }, setSubiendo: v => { state.busy = v }, setDestino: v => { state.destino = v },
    pickImage: () => { state.picks++; return new Promise(r => { resolver = r }) },
    uploadIlustracion: async () => { state.uploads++; return 'yo/foto.jpg' },
    empezarBorrador: (...args) => state.drafts.push(args), actualizarBorrador: patch => state.drafts.push(patch),
    mensajeError: e => e.message,
    router: { replace() { assert.fail('No navegar mientras la guarda de subiendo siga activa') } },
  })
  return { state, run, enVuelo, resolver: value => resolver(value) }
}

test('seleccionar foto levanta la guarda y pide reemplazar el drawer una sola vez al completar', async () => {
  const h = caso(), done = h.run()
  await h.run()
  assert.equal(h.state.picks, 1)
  h.resolver({ blob: new ArrayBuffer(8), mime: 'image/jpeg', fileName: 'foto.jpg' })
  await done
  assert.equal(h.state.uploads, 1)
  assert.equal(h.state.destino, 'editor')
  assert.equal(h.state.busy, false)
  assert.equal(h.enVuelo.current, false)
  assert.equal(h.state.drafts[1].contenido.imagen.path, 'yo/foto.jpg')
})

test('cancelar Fotos deja el drawer utilizable, sin crear una pieza vacía', async () => {
  const h = caso(), done = h.run()
  h.resolver(null)
  await done
  assert.equal(h.state.destino, null)
  assert.equal(h.state.busy, false)
  assert.equal(h.state.uploads, 0)
  assert.deepEqual(h.state.drafts, [])
})

test('la hoja de piezas usa una List nativa y detents explícitos, sin doble scroll ni fitToContents', () => {
  const source = readFileSync('app/profile/agregar.tsx', 'utf8')
  assert.match(source, /Platform.OS === 'ios'\) return <ListaAjustes/)
  assert.match(source, /useSalidaConCambios\(false, subiendo && !destino\)/)
  const root = readFileSync('app/_layout.tsx', 'utf8').split('name="profile/agregar"')[1].split('<Stack.Screen')[0]
  assert.match(root, /sheetAllowedDetents: \[0.85, 1\]/)
  assert.doesNotMatch(root, /fitToContents/)
})
