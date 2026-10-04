import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object'
  ? [node, ...nodes(node.props?.children)] : []
function load(path, dependencies) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  new Function('exports', 'require', code)(exports, name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    assert.ok(name in dependencies, `Import inesperado: ${name}`)
    return dependencies[name]
  })
  return exports
}

const { FilaAccion } = load('src/ui/Ajustes.shared.tsx', {
  react: { createContext: value => ({ value }), useContext: context => context.value },
  'react-native': Object.fromEntries(['ActivityIndicator', 'Pressable', 'Text', 'TextInput', 'View'].map(name => [name, name])),
  './SharedLayoutBg': { SharedLayoutBg: 'SharedLayoutBg' },
  './estadoControl': { superficieInteractivaWeb: () => ({}) },
  './CopyFeedback': { CopyFeedback: 'CopyFeedback' },
  './Interruptor': { Interruptor: 'Interruptor', INTERRUPTOR_PROPIO: false },
  './Menu': { Menu: 'Menu' }, './Mantener': { FilaSostener: 'FilaSostener' },
  './icons': { ICON_COLOR: { muted: '#aaa' }, IconChevronDown: 'Down', IconChevronRight: 'Right' },
})

test('dos líneas son opt-in y la acción conserva etiqueta completa, controles y estado ocupado', () => {
  const label = 'Compartir historia con texto grande'
  let calls = 0
  for (const lineas of [undefined, 1, 2]) {
    const props = { rotulo: label, onPress: () => calls++, ...(lineas ? { lineas } : {}) }
    const ui = FilaAccion(props)
    assert.equal(nodes(ui).find(node => node.type === 'Text').props.numberOfLines, lineas ?? 1)
    assert.equal(ui.props.accessibilityLabel, label)
    ui.props.onPress()
    const busy = FilaAccion({ ...props, busy: true })
    assert.equal(busy.props.disabled, true)
    assert.equal(busy.props.accessibilityState.busy, true)
    assert.equal(nodes(busy).filter(node => node.type === 'ActivityIndicator').length, 1)
  }
  assert.equal(calls, 3)
})

test('la fila de copiar pasa el mismo límite al feedback sin sustituir el gesto de copia', () => {
  let copied = 0
  for (const lineas of [undefined, 2]) {
    const ui = FilaAccion({ rotulo: 'Copiar el link', copyText: 'https://dnmusic.test/cancion/tema',
      onPress: () => copied++, ...(lineas ? { lineas } : {}) })
    const feedback = nodes(ui).find(node => node.type === 'CopyFeedback')
    assert.equal(feedback.props.lineas, lineas ?? 1)
    assert.equal(feedback.props.label, ui.props.accessibilityLabel)
    ui.props.onPress()
  }
  assert.equal(copied, 2)
})

let state = 'idle'
const { CopyFeedback } = load('src/ui/CopyFeedback.tsx', {
  'react-native': { Text: 'Text', View: 'View' },
  '../state/copia': { useEstadoCopia: () => state }, './ActionSwap': { ActionSwap: 'ActionSwap' },
  './icons': { IconCheck: 'IconCheck', IconCopiar: 'IconCopiar' },
})

test('copiar conserva dos líneas y ancho acotado durante idle, pending, copied y error', () => {
  const label = 'Copiar el link de la canción'
  for (const [value, title] of [['idle', label], ['pending', 'Copiando…'], ['copied', 'Copiado'], ['error', 'Reintentar copia']]) {
    state = value
    const ui = CopyFeedback({ text: 'enlace', label, lineas: 2, rowDensity: 'regular' })
    assert.equal(ui.props.accessibilityLiveRegion, 'polite')
    assert.equal(ui.props.style.flex, 1)
    assert.equal(ui.props.style.minWidth, 0)
    const text = ui.props.children[1]
    assert.equal(text.type, 'Text', 'el label multilínea no depende del ancho intrínseco del grid de animación')
    assert.equal(text.props.style.flex, 1)
    assert.equal(text.props.style.minWidth, 0)
    assert.equal(text.props.style.width, '100%')
    assert.equal(text.props.numberOfLines, 2)
    assert.equal(text.props.children, title)
    assert.equal(ui.props.children[0].type, 'ActionSwap', 'el icono conserva su animación')
    assert.equal(ui.props.children[0].props.value, value)
  }
})

test('el feedback sin opt-in conserva su estructura y tamaño originales', () => {
  state = 'idle'
  const ui = CopyFeedback({ text: 'enlace', label: 'Copiar' })
  assert.equal(ui.props.style.flex, undefined)
  assert.equal(ui.props.style.minWidth, undefined)
  assert.equal(ui.props.children[1].type, 'ActionSwap')
  assert.equal(ui.props.children[1].props.children.props.numberOfLines, undefined)
  assert.deepEqual(ui.props.children[1].props.children.props.style, { color: '#FFFFFF' })
})
