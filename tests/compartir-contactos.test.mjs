import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function fixture({ loadError = false } = {}) {
  const states = [], effects = [], calls = []
  let index = 0, mounted = false, pending
  const contacts = [
    { pairId: 'par-a', contact: { id: 'a', username: 'ana', displayName: 'Ana' } },
    { pairId: 'par-b', contact: { id: 'b', username: 'bea', displayName: null } },
  ]
  const jsx = (type, props) => ({ type, props })
  const exports = {}
  const dependencies = {
    react: {
      useState(initial) { const i = index++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial
        return [states[i], v => { states[i] = typeof v === 'function' ? v(states[i]) : v }] },
      useRef(current) { const i = index++; return states[i] ??= { current } },
      useEffect(f) { if (!mounted) effects.push(f) },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { View: 'View', Text: 'Text' },
    'expo-router': { useRouter: () => ({}) },
    '../src/lib/volver': { volver() {} },
    '../src/lib/mensajeError': { mensajeError: e => e.message },
    '../src/services/contacts': { listConversations: async () => { if (loadError) throw Error('Sin red'); return contacts }, contactTitle: c => c.displayName || `@${c.username}` },
    '../src/services/compartirPorChat': { compartirPorChat: (...args) => { calls.push(args); return new Promise((resolve, reject) => { pending = { resolve, reject } }) } },
    '../src/state/compartir': { cancionACompartir: () => ({ videoId: 'tema', title: 'Tema', artist: 'Artista' }) },
    '../src/state/session': { useUser: () => ({ id: 'yo' }) },
    '../src/state/aviso': { avisar() {} },
  }
  for (const name of ['Hoja', 'EncabezadoHoja', 'ListaAgrupada', 'SearchField', 'Vacio']) {
    dependencies[`../src/ui/${name}`] = { [name]: name, BotonHoja: 'BotonHoja' }
  }
  dependencies['../src/ui/icons'] = { IconMessage: 'IconMessage', ICON_COLOR: {} }
  const code = ts.transpileModule(readFileSync('app/compartir-contactos.tsx', 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  new Function('exports', 'require', code)(exports, id => { assert.ok(id in dependencies, id); return dependencies[id] })
  return { calls, render() { index = 0; const ui = exports.default(); mounted = true; return ui },
    async mount() { this.render(); effects.forEach(f => f()); await new Promise(r => setImmediate(r)) },
    async finish(error) { if (error) pending.reject(Error(error)); else pending.resolve('nuevo'); await new Promise(r => setImmediate(r)) },
  }
}
function find(node, type) {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) return node.map(n => find(n, type)).find(Boolean)
  return node.type === type ? node : find(node.props?.children, type)
}
const rows = h => find(h.render(), 'ListaAgrupada').props.secciones[0].filas

test('filtra contactos locales y bloquea dobles toques y reenvío exitoso en la misma hoja', async () => {
  const h = fixture()
  await h.mount()
  assert.equal(rows(h).length, 2)
  find(h.render(), 'SearchField').props.onChangeText('BEA')
  assert.deepEqual(rows(h).map(r => r.id), ['par-b'])
  const row = rows(h)[0]
  row.onPress(); row.onPress()
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0][0], 'par-b')
  assert.equal(h.calls[0][1], 'yo')
  assert.equal(rows(h)[0].disabled, true)
  await h.finish()
  assert.match(rows(h)[0].rotulo, /Enviada/)
  rows(h)[0].onPress()
  assert.equal(h.calls.length, 1)
})

test('el error conserva selección y permite reintentar sin marcar un envío falso', async () => {
  const h = fixture()
  await h.mount()
  rows(h)[0].onPress()
  await h.finish('Sin permiso')
  assert.equal(rows(h)[0].disabled, false)
  assert.ok(!rows(h)[0].rotulo.includes('Enviada'))
  assert.equal(find(h.render(), 'Text').props.children, 'Sin permiso')
  rows(h)[0].onPress()
  assert.equal(h.calls.length, 2)
  await h.finish()
})

test('un error de carga ofrece reintentar y nunca envía mensajes', async () => {
  const h = fixture({ loadError: true })
  await h.mount()
  assert.equal(rows(h)[0].rotulo, 'Reintentar')
  assert.equal(h.calls.length, 0)
  assert.equal(find(h.render(), 'Text').props.children, 'Sin red')
})
