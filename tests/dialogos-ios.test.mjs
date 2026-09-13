import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compile = path => ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText
const hookCode = compile('src/ui/Traspaso.shared.ts')
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

function fixture() {
  const slots = [], exports = {}
  let index = 0, effects = []
  const state = { pendiente: { nombre: 'PC' }, transferencia: null, llamadas: [], requests: [] }
  const react = {
    useRef(current) { const n = index++; return slots[n] ??= { current } },
    useState(initial) {
      const n = index++
      if (!(n in slots)) slots[n] = initial
      return [slots[n], value => { slots[n] = typeof value === 'function' ? value(slots[n]) : value }]
    },
    useEffect(fn, deps) {
      const n = index++, last = slots[n]
      if (!last || deps.some((value, i) => !Object.is(value, last.deps[i]))) {
        effects.push(() => { last?.cleanup?.(); slots[n] = { deps, cleanup: fn() } })
      }
    },
  }
  new Function('exports', 'require', hookCode)(exports, id => {
    if (id === 'react') return react
    assert.equal(id, '../state/escucha')
    return {
      useTraspasoPendiente: () => state.pendiente, useTransferenciaEscucha: () => state.transferencia,
      cancelarTraspaso() { state.llamadas.push('cancelar'); state.pendiente = null },
      confirmarTraspaso() { state.llamadas.push('confirmar'); const request = deferred(); state.requests.push(request); return request.promise },
    }
  })
  return { state,
    render() { index = 0; effects = []; const result = exports.useConfirmacionTraspaso(); effects.forEach(fn => fn()); return result },
    unmount() { slots.forEach(slot => slot?.cleanup?.()) },
  }
}

test('traspaso bloquea doble toque y cierre durante envío; fallo conserva decisión y permite reintentar', async () => {
  const f = fixture(), ui = f.render()
  const first = ui.confirmar()
  void ui.confirmar()
  ui.cancelar()
  assert.deepEqual(f.state.llamadas, ['confirmar'])
  assert.equal(f.render().ocupado, true)
  f.state.transferencia = { estado: 'error', error: 'El dispositivo no respondió' }
  f.state.requests[0].resolve(false)
  await first
  assert.equal(f.render().error, 'El dispositivo no respondió')
  assert.equal(f.render().ocupado, false)
  assert.equal(f.state.pendiente.nombre, 'PC')
  const second = f.render().confirmar()
  assert.equal(f.render().error, null)
  f.state.pendiente = null // La decisión sólo se elimina cuando confirma el store.
  f.render()
  f.state.requests[1].resolve(true)
  await second
  assert.equal(f.render().pendiente, null)
  assert.deepEqual(f.state.llamadas, ['confirmar', 'confirmar'])
})

test('rechazo inesperado muestra error recuperable y seguir allá cancela tras terminar', async () => {
  const f = fixture()
  const request = f.render().confirmar()
  f.state.requests[0].reject(new Error('error de transporte'))
  await request
  assert.equal(f.render().error, 'No se pudo traer la música. Intentá nuevamente.')
  f.render().cancelar()
  assert.equal(f.render().pendiente, null)
  assert.deepEqual(f.state.llamadas, ['confirmar', 'cancelar'])
})

test('errores previos y callbacks de otra decisión o desmontados no afectan el diálogo vigente', async () => {
  const f = fixture()
  f.state.transferencia = { estado: 'error', error: 'Error de selector anterior' }
  const old = f.render()
  assert.equal(old.error, null)
  f.state.pendiente = { nombre: 'Tablet' }
  f.render()
  await old.confirmar(); old.cancelar()
  assert.deepEqual(f.state.llamadas, [])
  const current = f.render()
  const request = current.confirmar()
  f.unmount()
  f.state.requests[0].resolve(false)
  await request
  await current.confirmar(); current.cancelar()
  assert.deepEqual(f.state.llamadas, ['confirmar'])
})

test('una transferencia global pendiente bloquea también el diálogo recién abierto', async () => {
  const f = fixture()
  f.state.transferencia = { estado: 'pendiente' }
  const ui = f.render()
  assert.equal(ui.ocupado, true)
  await ui.confirmar(); ui.cancelar()
  assert.deepEqual(f.state.llamadas, [])
})

const jsx = (type, props) => ({ type, props })
function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}
function viewFixture(path) {
  const state = { pendiente: { nombre: 'PC' }, ocupado: true, error: null, confirmar() {}, cancelar() {} }
  const exports = {}
  new Function('exports', 'require', compile(path))(exports, id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === './Traspaso.shared') return { useConfirmacionTraspaso: () => state }
    if (id === './estadoControl') return { estadoControlWeb: () => ({}) }
    if (id === 'react-native') return { Modal: 'Modal', Pressable: 'Pressable', View: 'View', Text: 'Text', StyleSheet: { absoluteFill: {} } }
    if (id === './Button') return { PrimaryButton: 'PrimaryButton', GhostButton: 'GhostButton' }
    if (id === './EncabezadoHoja') return { EncabezadoHoja: 'EncabezadoHoja', BotonHoja: 'BotonHoja' }
    if (id === './Hoja') return { Hoja: 'Hoja' }
    if (id === './ListaAgrupada') return { ListaAgrupada: 'ListaAgrupada' }
    assert.fail(`Import inesperado ${id}`)
  })
  return { state, render: () => nodes(exports.Traspaso()) }
}

test('iOS mantiene hoja viva con progreso, bloquea swipe y conserva error al pie para reintentar', () => {
  const f = viewFixture('src/ui/Traspaso.ios.tsx')
  let ui = f.render()
  assert.equal(ui[0].props.presentationStyle, 'formSheet')
  assert.equal(ui[0].props.allowSwipeDismissal, false)
  let group = ui.find(node => node.type === 'ListaAgrupada').props.secciones[0]
  assert.equal(group.filas[0].busy, true)
  assert.equal(group.filas[1].disabled, true)
  f.state.ocupado = false; f.state.error = 'No se pudo conectar'
  ui = f.render(); group = ui.find(node => node.type === 'ListaAgrupada').props.secciones[0]
  assert.equal(ui[0].props.allowSwipeDismissal, true)
  assert.equal(group.error, 'No se pudo conectar')
  assert.equal(group.filas[0].rotulo, 'Traer acá')
  assert.equal(group.filas[1].rotulo, 'Seguir allá')
  f.state.pendiente = null
  assert.equal(f.render().length, 0)
})

test('PC conserva modal accesible con progreso, cierre deshabilitado y error anunciado', () => {
  const f = viewFixture('src/ui/Traspaso.tsx')
  let ui = f.render()
  assert.equal(ui[0].type, 'Modal')
  assert.equal(ui.find(node => node.type === 'PrimaryButton').props.busy, true)
  assert.equal(ui.find(node => node.type === 'GhostButton').props.disabled, true)
  assert.equal(ui.find(node => node.type === 'Pressable').props.disabled, true)
  f.state.ocupado = false; f.state.error = 'No se pudo conectar'
  ui = f.render()
  const error = ui.find(node => node.props?.accessibilityRole === 'alert')
  assert.equal(error.props.children, 'No se pudo conectar')
  assert.equal(error.props.accessibilityLiveRegion, 'polite')
})
