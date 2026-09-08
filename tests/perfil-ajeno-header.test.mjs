import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
function compile(path, deps) {
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } })
  const exports = {}
  new Function('exports', 'require', outputText)(exports, id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' }
    assert.ok(id in deps, id)
    return deps[id]
  })
  return exports
}
function nodes(node, type) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(n => nodes(n, type))
  return [...(node.type === type ? [node] : []), ...nodes(node.props?.children, type)]
}
function render({ width = 390, top = 59, bottom = 34, bannerPath = null, state = 'ready', back = true } = {}) {
  let i = 0
  const calls = [], perfil = { userId: 'local-other', username: 'local', displayName: 'Local', bannerPath }
  const router = { canGoBack: () => back, back: () => calls.push('back'), replace: route => calls.push(route) }
  const forbidden = () => assert.fail('La prueba de presentación no accede ni escribe datos')
  const deps = {
    react: { useState: initial => [i++ === 0 ? state === 'loading' ? null : { usuario: 'local', perfil: state === 'missing' ? null : perfil } : initial, () => {}], useRef: current => ({ current }), useCallback: fn => fn, useEffect() {} },
    'react-native': { ActivityIndicator: 'ActivityIndicator', View: 'View', useWindowDimensions: () => ({ width, height: 844 }) },
    'expo-router': { useLocalSearchParams: () => ({ usuario: 'local' }), useRouter: () => router, useFocusEffect() {} },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top, bottom, left: 0, right: 0 }) },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    '../../src/ui/ScrollArea': { ScrollArea: 'ScrollArea' },
    '../../src/ui/TarjetaPerfil': { CabeceraPerfil: 'CabeceraPerfil', SuperficiePerfil: 'SuperficiePerfil', FondoEstiloPerfil: 'FondoEstiloPerfil' },
    '../../src/ui/FuentePerfil': { FuentePerfil: 'FuentePerfil', TextoPerfil: 'Text' },
    '../../src/ui/Panel': { Panel: 'Panel' }, '../../src/ui/BotonVolver': { BotonVolver: 'BotonVolver' },
    '../../src/ui/PerfilPublico': { alturaDeHeroe: (alto, banner, compacto) => banner ? Math.max(compacto, Math.round(alto * .38)) : compacto, Resumen: 'Resumen', useCuantasVitrinas: () => 0, Vitrinas: 'Vitrinas' },
    '../../src/ui/PestanasPerfil': { pestanaInicial: () => 'reciente', PestanasPerfil: 'PestanasPerfil', Reciente: 'Reciente' },
    '../../src/ui/Reacciones': { EscuchaConReacciones: 'EscuchaConReacciones' },
    '../../src/ui/Mantener': { FilaSostener: 'FilaSostener' }, '../../src/ui/Vacio': { Vacio: 'Vacio' },
    '../../src/ui/icons': { ICON_COLOR: {}, IconBack: 'IconBack', IconBan: 'IconBan', IconUser: 'IconUser' },
    '../../src/services/profile': { fetchProfile: forbidden }, '../../src/services/contacts': { blockUser: forbidden },
    '../../src/state/session': { refreshConversations: forbidden, useMyProfile: () => ({ userId: 'local-self' }) },
    '../../src/state/aviso': { avisar: forbidden }, '../../src/lib/mensajeError': { mensajeError: forbidden },
    '../../src/state/shell': { usePiso: extra => 80 + extra },
    '../../src/lib/volver': compile('src/lib/volver.ts', {}),
  }
  return { tree: compile('app/perfil/[usuario].tsx', deps).default(), calls }
}

test('perfil ajeno iOS: salida flotante de 44px bajo safe area, fondo continuo y contenido sin doble inset', () => {
  for (const width of [390, 844, 1024, 1440]) for (const bannerPath of [null, 'local-banner']) {
    const top = width === 390 ? 59 : width === 1024 ? 24 : 0
    const { tree } = render({ width, top, bannerPath })
    const safe = nodes(tree, 'SafeAreaView')[0]
    assert.deepEqual(safe.props.edges, ['left', 'right'], 'la seguridad lateral sigue protegida en landscape')
    const panel = nodes(tree, 'Panel')[0], scroll = nodes(tree, 'ScrollArea')[0]
    const gradient = nodes(panel, 'LinearGradient')[0], button = nodes(panel, 'BotonVolver')[0]
    assert.equal(nodes(tree, 'BotonVolver').length, 1)
    assert.equal(nodes(scroll, 'BotonVolver').length, 0)
    assert.equal(nodes(scroll, 'FondoEstiloPerfil').length, 0)
    assert.match(readFileSync('src/ui/BotonVolver.tsx', 'utf8'), /width: 44, height: 44/)
    assert.equal(button.props.label, 'Volver')
    const buttonContainer = nodes(panel, 'View').find(n => n.props.children === button)
    const buttonTop = top + (width >= 900 ? 16 : 8), headerBottom = buttonTop + 44
    assert.equal(buttonContainer.props.style.top, buttonTop)
    assert.equal(gradient.props.pointerEvents, 'none')
    const overlay = nodes(panel, 'View').find(n => nodes(n, 'LinearGradient').length)
    assert.equal(overlay.props.pointerEvents, 'box-none')
    assert.equal(overlay.props.style.position, 'absolute')
    assert.equal(overlay.props.style.height, headerBottom + 32)
    assert.equal(scroll.props.scrollIndicatorInsets.top, headerBottom)
    assert.equal(scroll.props.contentInsetAdjustmentBehavior, 'never')
    assert.equal(scroll.props.automaticallyAdjustsScrollIndicatorInsets, false)
    assert.equal(scroll.props.contentContainerStyle.paddingTop, bannerPath ? Math.max(headerBottom + 16, 321) : headerBottom + 16)
    assert.ok(scroll.props.contentContainerStyle.paddingBottom >= 58)
    assert.equal(nodes(tree, 'CabeceraPerfil').length, 1)
  }
})

test('cargando o privado mantiene salida y fallback sin historial, sin acciones de escritura', () => {
  for (const state of ['loading', 'missing', 'ready']) for (const back of [true, false]) {
    const { tree, calls } = render({ state, back })
    nodes(tree, 'BotonVolver')[0].props.onPress()
    assert.deepEqual(calls, [back ? 'back' : '/'])
    if (state === 'loading') assert.equal(nodes(tree, 'ActivityIndicator').length, 1)
    if (state === 'missing') assert.equal(nodes(tree, 'Vacio').length, 1)
  }
})

test('el stack de perfiles mantiene header nativo oculto y gesto de volver de iOS', () => {
  const source = readFileSync('app/_layout.tsx', 'utf8')
  const ast = ts.createSourceFile('layout.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const stacks = [], routes = []
  function visit(node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === 'Stack') stacks.push(node)
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'Stack.Screen' && node.attributes.properties.some(p => p.name?.getText(ast) === 'name' && p.initializer?.text === 'perfil/[usuario]')) routes.push(node)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.equal(routes.length, 1)
  const options = stacks[0].attributes.properties.find(p => p.name?.getText(ast) === 'screenOptions').initializer.expression
  const values = Object.fromEntries(options.properties.map(p => [p.name.getText(ast), p.initializer.getText(ast)]))
  assert.equal(values.headerShown, 'false')
  assert.equal(values.gestureEnabled, 'true')
  assert.equal(routes[0].attributes.properties.some(p => p.name?.getText(ast) === 'options'), false)
})


test('sólo la hoja nativa de marcos fija fondo y evita expandir al alcanzar el borde', () => {
  const source = readFileSync('app/_layout.tsx', 'utf8')
  const ast = ts.createSourceFile('layout.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let screen
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'Stack.Screen' && node.attributes.properties.some(p => p.name?.getText(ast) === 'name' && p.initializer?.text === 'profile/marco')) screen = node
    ts.forEachChild(node, visit)
  }
  visit(ast)
  const expression = screen.attributes.properties.find(p => p.name?.getText(ast) === 'options').initializer.expression.getText(ast)
  const options = new Function('ES_WEB', 'HOJA_WEB', `return (${expression})`)
  const native = options(false, {})
  assert.equal(native.presentation, 'formSheet')
  assert.deepEqual(native.contentStyle, { backgroundColor: '#121212' })
  assert.equal(native.sheetExpandsWhenScrolledToEdge, false)
  assert.deepEqual(native.sheetAllowedDetents, [1])
  const web = { presentation: 'transparentModal' }
  assert.equal(options(true, web), web)
})
