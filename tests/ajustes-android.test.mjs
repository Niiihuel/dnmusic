import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import vm from 'node:vm'
import design from './helpers/androidDesign.mjs'

test('Android abre el enlace a Cuenta, Atrás vuelve a categorías y buscar permite entrar a otro detalle', () => {
  const source = ts.createSourceFile('settings.tsx', readFileSync('src/ui/Ajustes.android.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'AjustesNativos')
  const code = ts.transpileModule(declaration.getText(source), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}, state = [], effects = []
  let index = 0, back, search = ''
  const jsx = (type, props) => ({ type, props })
  const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : []
  vm.runInNewContext(code, {
    exports, require: () => ({ jsx, jsxs: jsx }), palette: design.ANDROID_COLORS, ANDROID_TYPE: design.ANDROID_TYPE,
    useState(initial) { const i = index++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value }] },
    useEffect(effect) { effects.push(effect) },
    useSafeAreaInsets: () => ({ bottom: 24 }), useKeyboardH: () => 0,
    BackHandler: { addEventListener(_event, listener) { back = listener; return { remove() {} } } },
    ...Object.fromEntries(['SafeAreaView', 'View', 'BotonVolver', 'RNText', 'ScrollArea', 'GrupoAjustes', 'FilaAjuste', 'SearchField'].map(name => [name, name])),
  })
  const all = [
    { id: 'cuenta', titulo: 'Cuenta', resumen: 'Perfil', bloques: { type: 'AccountSettings' } },
    { id: 'audio', titulo: 'Audio', resumen: 'Reproducción', bloques: { type: 'AudioSettings' } },
  ]
  const render = () => {
    index = 0
    const ui = nodes(exports.AjustesNativos({ initialId: 'cuenta', categorias: search ? all.filter(c => c.id.includes(search)) : all,
      buscando: !!search, busqueda: search, onBusqueda: value => { search = value }, piso: 24, onVolver() {} }))
    effects.splice(0).forEach(effect => effect())
    return ui
  }
  assert.ok(render().some(node => node.type === 'AccountSettings'))
  assert.equal(back(), true)
  let ui = render()
  assert.equal(ui.some(node => node.type === 'AccountSettings'), false)
  assert.equal(ui.filter(node => node.type === 'FilaAjuste').length, 2)
  ui.find(node => node.type === 'SearchField').props.onChangeText('audio')
  ui = render()
  assert.equal(ui.filter(node => node.type === 'FilaAjuste').length, 1)
  ui.find(node => node.type === 'FilaAjuste').props.onPress()
  assert.equal(search, '')
  ui = render()
  assert.ok(ui.some(node => node.type === 'AudioSettings'))
  ui.find(node => node.type === 'BotonVolver').props.onPress()
  assert.equal(render().filter(node => node.type === 'FilaAjuste').length, 2)
})
