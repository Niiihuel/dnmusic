import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const copia = value => JSON.parse(JSON.stringify(value))
const pieza = (id, ancho = 'mitad') => ({ id, ancho, kind: 'texto', texto: id })
function modulo(path, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const exports = {}
  vm.runInNewContext(outputText, { exports, require: name => {
    assert.ok(name in imports, `Import sin mock: ${name}`); return imports[name]
  } })
  return exports
}
const helpers = modulo('src/ui/mosaicoBorrador.ts')
const { reconciliarMosaico, persistirMosaico, mismoMosaico } = helpers
const base = [pieza('a'), pieza('b'), pieza('c')]

test('al volver del editor conserva orden/tamaño/quitar y adopta contenido/nuevas piezas', () => {
  const draft = [pieza('c', 'grande'), pieza('a')]
  const fresh = [...base.map(v => ({ ...v, texto: `${v.id} editado` })), pieza('nueva')]
  const result = copia(reconciliarMosaico(base, draft, fresh))
  assert.deepEqual(result.map(v => v.id), ['c', 'a', 'nueva'])
  assert.equal(result[0].ancho, 'grande'); assert.equal(result[0].texto, 'c editado')
  assert.equal(result[1].texto, 'a editado')
  assert.deepEqual(copia(base).map(v => v.ancho), ['mitad', 'mitad', 'mitad'])
})

test('sin cambios locales adopta el orden y tamaños guardados en otro editor', () => {
  const fresh = [pieza('c'), pieza('b', 'entero'), pieza('a')]
  assert.deepEqual(copia(reconciliarMosaico(base, base, fresh)), fresh)
  assert.equal(mismoMosaico(base, base.map(v => ({ ...v, texto: 'nuevo' }))), true)
  assert.equal(mismoMosaico(base, fresh), false)
})

test('quitar todas mantiene el mosaico vacío al recargar; sólo nuevas piezas se agregan', () => {
  assert.deepEqual(copia(reconciliarMosaico(base, [], base)), [])
  assert.deepEqual(copia(reconciliarMosaico(base, [], [...base, pieza('nueva')])), [pieza('nueva')])
})

test('no resucita eliminaciones externas ni pierde el orden objetivo tras un fallo parcial', () => {
  assert.deepEqual(copia(reconciliarMosaico(base, [base[2], base[0]], [base[0]])), [base[0]])
  assert.deepEqual(copia(reconciliarMosaico(base, base.slice(1), [base[2], base[1]], true)), base.slice(1))
})

test('guardar manda sólo tamaños cambiados, orden y finalmente eliminaciones', async () => {
  const calls = []
  await persistirMosaico(base, [pieza('c', 'grande'), pieza('a')], {
    ancho: async (...args) => calls.push(['ancho', ...args]),
    ordenar: async ids => calls.push(['orden', ...ids]),
    quitar: async id => calls.push(['quitar', id]),
  })
  assert.deepEqual(calls, [['ancho', 'c', 'grande'], ['orden', 'c', 'a'], ['quitar', 'b']])
})

test('fallar orden no envía eliminaciones; guardar sin cambios no escribe', async () => {
  let deletes = 0, writes = 0
  const ops = { ancho: async () => { writes++ }, ordenar: async () => { throw Error('offline') }, quitar: async () => { deletes++ } }
  await assert.rejects(persistirMosaico(base, base.slice(1), ops), /offline/)
  assert.equal(deletes, 0)
  await persistirMosaico(base, base, ops)
  assert.equal(writes, 0)
})

// Harness de hooks: ejecuta el hook real, efectos/deps y actualizaciones funcionales sin red ni UI nativa.
function montar(servicio) {
  const slots = [], effects = []
  let cursor = 0, recarga = 0, cambios = 0
  const react = {
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next }]
    },
    useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }) },
    useCallback(fn) { cursor++; return fn },
    useEffect(fn, deps) {
      const i = cursor++, before = slots[i]
      if (!before || deps.some((v, j) => !Object.is(v, before.deps[j]))) {
        before?.cleanup?.(); slots[i] = { deps }
        effects.push(() => { slots[i].cleanup = fn() })
      }
    },
  }
  const { useMosaicoPerfil } = modulo('src/ui/useMosaicoPerfil.ts', {
    '../state/perfilEdicion': { usePerfilEdicion: () => ({ ownerId: null }) },
    '../state/mosaicoEdicion': { useMosaicosEdicion: () => ({}) },
    react, '../services/showcases': servicio, '../lib/mensajeError': { mensajeError: e => e.message }, './mosaicoBorrador': helpers,
  })
  function RenderMosaico() {
    cursor = 0
    const result = useMosaicoPerfil('yo', 'subspace-1', recarga, () => { cambios++ })
    while (effects.length) effects.shift()()
    return result
  }
  return { render: RenderMosaico, refresh: () => { recarga++; return RenderMosaico() }, cambios: () => cambios }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
function servicioInicial() {
  let saved = copia(base)
  const calls = []
  return {
    calls, get saved() { return saved }, set saved(value) { saved = value },
    listShowcases: async (owner, parent) => { assert.equal(owner, 'yo'); assert.equal(parent, 'subspace-1'); return copia(saved) },
    setShowcaseAncho: async (id, ancho) => { calls.push(['ancho', id]); saved = saved.map(v => v.id === id ? { ...v, ancho } : v) },
    reorderShowcases: async ids => { calls.push(['orden']); saved = [...ids.map(id => saved.find(v => v.id === id)), ...saved.filter(v => !ids.includes(v.id))] },
    removeShowcase: async id => { calls.push(['quitar', id]); saved = saved.filter(v => v.id !== id) },
  }
}

test('hook: preview/reset no escriben; recarga desde subspace conserva el borrador', async () => {
  const service = servicioInicial(), h = montar(service)
  h.render(); await tick()
  h.render().editar([pieza('c', 'grande'), pieza('a')])
  assert.equal(h.render().cambiado, true)
  service.saved = [...service.saved.map(v => ({ ...v, texto: 'editado' })), pieza('nueva')]
  h.refresh(); await tick()
  assert.deepEqual(copia(h.render().vitrinas).map(v => v.id), ['c', 'a', 'nueva'])
  await h.render().restablecer()
  assert.equal(h.render().cambiado, false)
  assert.deepEqual(copia(h.render().vitrinas), service.saved)
  assert.equal(service.calls.length, 0)
})

test('hook: doble Guardar y editar mientras guarda no duplican ni cambian el objetivo', async () => {
  const service = servicioInicial(), h = montar(service)
  h.render(); await tick()
  h.render().editar([])
  const draft = h.render()
  const saving = draft.guardar()
  draft.editar(base)
  await Promise.all([saving, draft.guardar()])
  assert.deepEqual(copia(h.render().vitrinas), [])
  assert.deepEqual(service.calls, [['orden'], ['quitar', 'a'], ['quitar', 'b'], ['quitar', 'c']])
  assert.equal(h.cambios(), 1); assert.equal(h.render().cambiado, false)
})

test('hook: fallo parcial conserva objetivo y el reintento sólo termina lo pendiente', async () => {
  const service = servicioInicial(), quitar = service.removeShowcase
  let fail = true
  service.removeShowcase = async id => { if (id === 'b' && fail) throw Error('falló b'); await quitar(id) }
  const h = montar(service)
  h.render(); await tick(); h.render().editar([pieza('c', 'grande')])
  await h.render().guardar()
  assert.match(h.render().error, /Algunos pueden haberse aplicado/)
  assert.deepEqual(copia(h.render().vitrinas).map(v => v.id), ['c'])
  assert.equal(h.render().cambiado, true); assert.equal(h.cambios(), 0)
  fail = false; await h.render().guardar()
  assert.equal(h.render().error, null); assert.equal(h.render().cambiado, false)
  assert.deepEqual(service.saved, [pieza('c', 'grande')]); assert.equal(h.cambios(), 1)
  assert.equal(service.calls.filter(c => c[0] === 'ancho').length, 1)
})

test('hook: Restablecer tras fallo relee el servidor y no resucita una eliminación confirmada', async () => {
  const service = servicioInicial(), quitar = service.removeShowcase
  service.removeShowcase = async id => { if (id === 'b') throw Error('falló b'); await quitar(id) }
  const h = montar(service)
  h.render(); await tick(); h.render().editar([]); await h.render().guardar()
  await h.render().restablecer()
  assert.equal(h.render().cambiado, false); assert.equal(h.render().error, null)
  assert.deepEqual(copia(h.render().vitrinas).map(v => v.id), ['b', 'c'])
})

test('reorderShowcases espera todos los resultados y propaga error devuelto por Supabase', async () => {
  const source = ts.createSourceFile('showcases.ts', readFileSync('src/services/showcases.ts', 'utf8'), ts.ScriptTarget.Latest, true)
  const fn = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === 'reorderShowcases')
  const { outputText } = ts.transpileModule(fn.getText(source), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const exports = {}; let terminar
  vm.runInNewContext(outputText, { exports, getSupabase: () => ({ from: () => ({ update: () => ({ eq: (_column, id) => id === 'a' ? Promise.resolve({ error: Error('permiso') }) : new Promise(resolve => { terminar = () => resolve({ error: null }) }) }) }) }) })
  let settled = false
  const result = exports.reorderShowcases(['a', 'b']).catch(e => { settled = true; return e })
  await tick(); assert.equal(settled, false)
  terminar(); assert.match((await result).message, /permiso/)
})

test('hook: recuperar foco durante Guardar no invalida su confirmación ni duplica la lectura', async () => {
  const service = servicioInicial(), ordenar = service.reorderShowcases
  let terminar
  service.reorderShowcases = async ids => { await new Promise(resolve => { terminar = resolve }); await ordenar(ids) }
  const h = montar(service)
  h.render(); await tick(); h.render().editar([base[2], base[1], base[0]])
  const saving = h.render().guardar()
  h.refresh(); await tick()
  terminar(); await saving
  assert.equal(h.cambios(), 1)
  assert.equal(h.render().cambiado, false); assert.equal(h.render().guardando, false)
})
