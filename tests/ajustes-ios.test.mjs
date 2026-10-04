import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
const nodes = value => !value || typeof value !== 'object'
  ? []
  : Array.isArray(value)
    ? value.flatMap(nodes)
    : [value, ...nodes(value.props?.children)]
const modifiers = new Proxy({}, { get: (_, name) => (...args) => ({ name, args }) })

function fixture(initialId = 'cuenta') {
  const source = ts.transpileModule(readFileSync('src/ui/Ajustes.ios.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const state = []
  let cursor = 0
  const natives = new Proxy({
    Toolbar: { Content: 'Toolbar.Content' },
    useNativeState: initial => ({ get: () => initial, set() {} }),
  }, { get: (target, name) => target[name] ?? name })
  const shared = new Proxy({}, { get: (_, name) => name })
  const imports = {
    react: {
      createContext: value => ({ value }),
      useContext: context => context.value,
      useEffect() {},
      useState(initial) {
        const index = cursor++
        state[index] ??= initial
        return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next }]
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Alert: { alert() {} }, View: 'RNView' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ bottom: 34 }) },
    '@expo/ui/swift-ui': natives,
    '@expo/ui/swift-ui/modifiers': modifiers,
    '../state/shell': { useKeyboardH: () => 0 },
    './SearchField': { SearchField: 'SearchField' },
    './CollectionScrollEdge': { BordeScrollNativo: 'BordeScrollNativo' },
    './Ajustes.shared': shared,
    './Mantener': {},
  }
  const exports = {}
  new Function('exports', 'require', source)(exports, name => {
    assert.ok(name in imports, name)
    return imports[name]
  })
  const searches = []
  const categorias = [
    { id: 'reproduccion', titulo: 'Reproducción', resumen: 'Modo y audio', simbolo: 'waveform', bloques: { type: 'Audio' } },
    { id: 'cuenta', titulo: 'Cuenta', resumen: 'Perfil y sesión', simbolo: 'person.crop.circle', bloques: { type: 'Cuenta' } },
  ]
  const props = { categorias, initialId, cuenta: { type: 'Perfil' }, piso: 24, buscando: false, busqueda: '', onBusqueda: value => searches.push(value), onVolver() {} }
  const render = patch => {
    cursor = 0
    return nodes(exports.AjustesNativos({ ...props, ...patch }))
  }
  return { render, searches }
}

test('Ajustes de iOS usa navegación, títulos y destinos SwiftUI nativos', () => {
  const f = fixture()
  const ui = f.render()
  assert.deepEqual(ui.find(node => node.type === 'NavigationStack').props.path, ['cuenta'])
  assert.deepEqual(ui.filter(node => node.type === 'NavigationLink').map(node => node.props.value), ['reproduccion', 'cuenta'])
  assert.deepEqual(ui.filter(node => node.type === 'NavigationDestination').map(node => node.props.value), ['reproduccion', 'cuenta'])
  const titles = ui.filter(node => node.props?.modifiers?.some(modifier => modifier.name === 'navigationTitle'))
    .map(node => node.props.modifiers.find(modifier => modifier.name === 'navigationTitle').args[0])
  assert.deepEqual(titles, ['Configuración', 'Reproducción', 'Cuenta'])
  assert.ok(ui.some(node => node.type === 'Toolbar.Content'))
})

test('buscar desde un destino vuelve a la raíz y conserva el campo inferior', () => {
  const f = fixture()
  let ui = f.render()
  ui.find(node => node.type === 'SearchField').props.onChangeText('audio')
  ui = f.render({ buscando: true, busqueda: 'audio' })
  assert.deepEqual(ui.find(node => node.type === 'NavigationStack').props.path, [])
  assert.deepEqual(f.searches, ['audio'])
  assert.equal(ui.find(node => node.type === 'SearchField').props.value, 'audio')
})

test('la navegación posee el área segura y un borde suave, sin recorte RN sobre el reloj', () => {
  const ui = fixture().render()
  assert.equal(ui[0].type, 'RNView')
  assert.equal(ui.find(node => node.type === 'Host').props.ignoreSafeArea, undefined)
  assert.equal(ui.find(node => node.type === 'BordeScrollNativo').props.nativeNavigation, true)
  assert.equal(ui.some(node => node.type === 'SafeAreaView'), false)
  assert.equal(ui.some(node => node.props?.children === 'Modo y audio'), false, 'los resúmenes sólo se muestran al buscar')
})
