import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
function montar({ os = 'web', width = 1440, guardar = async () => {} } = {}) {
  const slots = [], effects = [], llamadas = []
  let cursor = 0, id = 'lista-a', nombre = 'Mi lista', editor
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v }] },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
    useEffect(fn) { effects.push(fn) },
  }
  const rn = Object.fromEntries(['Modal', 'KeyboardAvoidingView', 'View', 'Pressable', 'Text', 'TextInput'].map(k => [k, k]))
  Object.assign(rn, { Platform: { OS: os }, useWindowDimensions: () => ({ width, height: 844 }) })
  const deps = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': rn,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    './CollectionHeader': { CollectionTitle: 'CollectionTitle', useAngosto: () => width < 640 },
    './ScrollArea': { ScrollArea: 'ScrollArea' }, './Hoja': { Hoja: 'Hoja' }, './Social': { AccionSocial: 'AccionSocial', CabeceraSocial: 'CabeceraSocial' },
    './EntradaTexto': { EntradaTexto: 'TextInput' },
    './Button': { FormError: 'FormError' }, './estadoControl': { estadoControlWeb: mode => ({ dataSet: { dnHover: mode } }) },
    './icons': { ICON_COLOR: {}, IconPencil: 'IconPencil' },
  }
  const exports = {}
  const source = ts.transpileModule(readFileSync('src/ui/RenombrarLista.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('exports', 'require', source)(exports, key => { assert.ok(key in deps, key); return deps[key] })
  function render() {
    cursor = 0
    const lista = id
    editor = exports.useRenombrarLista(id, nombre, async value => { llamadas.push([lista, value]); await guardar(value) })
    return editor
  }
  render()
  return { exports, effects, llamadas, render, get editor() { return editor }, abrir() { editor.abrir(); render() }, cambiar(v) { editor.cambiar(v); render() }, lista(next, name = 'Otra lista') { id = next; nombre = name; render() } }
}
function nodes(node, type) {
  if (Array.isArray(node)) return node.flatMap(n => nodes(n, type))
  if (!node || typeof node !== 'object') return []
  return [...(node.type === type ? [node] : []), ...nodes(node.props?.children, type)]
}

test('borrador no persiste al escribir ni al perder foco; cancelar y Escape descartan', () => {
  const h = montar(); h.abrir(); h.cambiar('Nuevo nombre')
  const input = h.exports.CampoNombreLista({ editor: h.editor, inline: true })
  assert.equal(input.props.onBlur, undefined)
  assert.equal(input.props.selectTextOnFocus, undefined)
  assert.equal(input.props.autoFocus, false)
  assert.equal(input.props.style.backgroundColor, 'transparent')
  assert.equal(input.props.style.padding, 0)
  assert.equal(input.props.style.position, 'absolute')
  const focused = []
  input.props.ref.current = { focus: opts => focused.push(opts) }
  h.effects.forEach(effect => effect())
  assert.deepEqual(focused, [{ preventScroll: true }])
  assert.equal(h.llamadas.length, 0)
  input.props.onKeyPress({ nativeEvent: { key: 'Escape' } }); h.render()
  assert.equal(h.editor.borrador, null)
  h.abrir(); h.cambiar('Cambio'); h.editor.cancelar(); h.render()
  assert.equal(h.editor.borrador, null)
  assert.equal(h.llamadas.length, 0)
})

test('valida vacío/límite, omite nombre igual y guarda nombre recortado explícitamente', async () => {
  const h = montar(); h.abrir(); h.cambiar('   ')
  await h.editor.guardar(); h.render()
  assert.match(h.editor.borrador.error, /Poné un nombre/)
  h.cambiar('x'.repeat(61)); await h.editor.guardar(); h.render()
  assert.match(h.editor.borrador.error, /60/)
  h.cambiar(' Mi lista '); await h.editor.guardar(); h.render()
  assert.equal(h.editor.borrador, null)
  assert.equal(h.llamadas.length, 0)
  h.abrir(); h.cambiar('  Nueva lista  '); await h.editor.guardar(); h.render()
  assert.deepEqual(h.llamadas, [['lista-a', 'Nueva lista']])
  assert.equal(h.editor.borrador, null)
})

test('error conserva texto, permite reintentar; mientras guarda bloquea duplicados/cancelar', async () => {
  let terminar, intentos = 0
  const h = montar({ guardar: () => ++intentos === 1 ? Promise.reject(new Error('offline')) : new Promise(resolve => { terminar = resolve }) })
  h.abrir(); h.cambiar('Nuevo nombre'); await h.editor.guardar(); h.render()
  assert.equal(h.editor.borrador.valor, 'Nuevo nombre')
  assert.equal(h.editor.borrador.ocupado, false)
  assert.match(h.editor.borrador.error, /Intentá de nuevo/)
  const pendiente = h.editor.guardar(); await h.editor.guardar(); h.render()
  assert.equal(h.editor.borrador.ocupado, true)
  h.editor.cancelar(); h.editor.cambiar('Cambio tardío'); h.render()
  assert.equal(h.editor.borrador.valor, 'Nuevo nombre')
  assert.equal(h.llamadas.length, 2)
  terminar(); await pendiente; h.render()
  assert.equal(h.editor.borrador, null)
})

test('cambiar de lista no aplica el borrador anterior ni cambia destino de un guardado pendiente', async () => {
  let terminar
  const h = montar({ guardar: () => new Promise(resolve => { terminar = resolve }) })
  h.abrir(); h.cambiar('Nombre A'); h.lista('lista-b')
  assert.equal(h.editor.borrador, null)
  await h.editor.guardar()
  assert.equal(h.llamadas.length, 0)
  h.abrir()
  assert.equal(h.editor.borrador.valor, 'Otra lista')
  h.cambiar('Nombre B'); const pendiente = h.editor.guardar()
  h.lista('lista-c'); h.editor.abrir(); h.render()
  assert.equal(h.editor.borrador, null)
  terminar(); await pendiente; h.render()
  assert.deepEqual(h.llamadas, [['lista-b', 'Nombre B']])
  h.abrir()
  assert.equal(h.editor.borrador.id, 'lista-c')
})

for (const [os, width, inline] of [['web', 1440, true], ['web', 390, false], ['ios', 390, false], ['ios', 1024, false]]) {
  test(`${os} ${width}: ${inline ? 'título conserva sus líneas y edición sin hoja' : 'hoja con guardar/cancelar explícitos'}`, () => {
    const h = montar({ os, width }); h.abrir()
    assert.equal(h.exports.useNombreInline(), inline)
    const title = h.exports.TituloNombreLista({ nombre: 'Mi lista', editor: h.editor })
    assert.equal(nodes(title, 'CollectionTitle')[0].props.children, 'Mi lista')
    assert.equal(nodes(title, 'Pressable')[0].props.style.opacity, inline ? 0 : 1)
    assert.equal(nodes(title, h.exports.CampoNombreLista).length, inline ? 1 : 0)
    const sheet = h.exports.HojaNombreLista({ editor: h.editor })
    if (inline) assert.equal(sheet, null)
    else {
      assert.equal(nodes(sheet, 'Hoja').length, 1)
      assert.equal(nodes(sheet, 'Modal').length, os === 'ios' ? 1 : 0)
      if (os === 'ios') assert.equal(sheet.props.presentationStyle, 'formSheet')
      const actions = h.exports.AccionesNombreLista({ editor: h.editor })
      assert.deepEqual(nodes(actions, 'AccionSocial').map(n => n.props.label), ['Cancelar', 'Guardar'])
      assert.equal(h.llamadas.length, 0)
    }
  })
}
