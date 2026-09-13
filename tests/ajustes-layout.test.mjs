import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import vm from 'node:vm'

function nodes(n) {
  if (!n || typeof n !== 'object') return []
  if (Array.isArray(n)) return n.flatMap(nodes)
  return [n, ...nodes(n.props?.children)]
}
function fixture() {
  const source = ts.createSourceFile('ajustes.tsx', readFileSync('app/ajustes/index.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const node = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === 'Escritorio')
  const code = ts.transpileModule(`export ${node.getText(source)}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  const state = [], exports = {}, jsx = (type, props) => ({ type, props })
  let cursor = 0, consulta = '', vuelta = 0
  vm.runInNewContext(code, {
    exports, require: () => ({ jsx, jsxs: jsx }), LATERAL_W: 240, MAX_W: 540,
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], v => { state[i] = typeof v === 'function' ? v(state[i]) : v }] },
    ...Object.fromEntries(['Shell', 'SafeAreaView', 'View', 'Panel', 'Text', 'Pressable', 'ScrollView', 'CabeceraLateral', 'BotonLateral', 'BotonVolver', 'CollapsedSidebar', 'SearchField', 'IconCollapseLeft', 'IconSliders', 'IconBack', 'AjustesCompactos'].map(k => [k, k])),
    ICON_COLOR: { foreground: 'white', muted: 'gray' },
  })
  const categorias = [{ id: 'music', titulo: 'Reproducción', icono: 'IconoMusic', bloques: { type: 'Music' } }, { id: 'app', titulo: 'La app', icono: 'IconoApp', bloques: { type: 'App' } }]
  const render = () => { cursor = 0; return nodes(exports.Escritorio({ categorias, coinciden: consulta === 'inexistente' ? [] : categorias, buscando: !!consulta, busqueda: consulta, onBusqueda: v => { consulta = v }, cuenta: { type: 'Cuenta' }, novedades: { type: 'Novedades' }, sinResultados: { type: 'Vacio' }, onVolver: () => vuelta++ })) }
  const label = (ui, text) => ui.find(n => n.props?.label === text || n.props?.accessibilityLabel === text)
  return { render, label, search: v => { consulta = v }, vuelta: () => vuelta }
}

test('configuración pliega a 64px sin perder categoría y Volver sigue accesible', () => {
  const f = fixture()
  f.label(f.render(), 'La app').props.onPress()
  f.label(f.render(), 'Contraer categorías de configuración').props.onPress()
  let ui = f.render()
  assert.equal(ui.find(n => n.props?.testID === 'ajustes-lateral').props.style.width, 64)
  assert.ok(ui.some(n => n.type === 'App'))
  assert.ok(ui.some(n => n.type === 'Novedades'))
  f.label(ui, 'Volver').props.onPress(); assert.equal(f.vuelta(), 1)
  f.label(ui, 'Mostrar categorías de configuración').props.onExpand()
  ui = f.render()
  assert.ok(f.label(ui, 'La app').props.accessibilityState.selected)
  assert.equal(ui.find(n => n.props?.testID === 'ajustes-lateral').props.style.width, 240)
  assert.equal(ui.filter(n => n.props?.label === 'Volver').length, 1)
})

test('buscar, plegar y volver conserva consulta; seleccionar categoría limpia búsqueda', () => {
  const f = fixture(); f.search('inexistente')
  f.label(f.render(), 'Contraer categorías de configuración').props.onPress()
  assert.ok(f.render().some(n => n.type === 'Vacio'))
  f.label(f.render(), 'Mostrar categorías de configuración').props.onExpand()
  assert.equal(f.render().find(n => n.type === 'SearchField').props.value, 'inexistente')
  f.label(f.render(), 'Reproducción').props.onPress()
  assert.ok(f.render().some(n => n.type === 'Music'))
  assert.ok(!f.render().some(n => n.type === 'Vacio'))
})

test('filas como Inicio: icono directo, 16px y sin placa individual', () => {
  const f = fixture(), fila = f.label(f.render(), 'Reproducción')
  assert.equal(fila.props.children[0].type, 'IconoMusic')
  assert.equal(fila.props.children[0].props.size, 16)
  assert.match(fila.props.className, /h-\[30px\].*gap-2\.5.*rounded-md/)
  assert.equal(f.render().find(n => n.type === 'SearchField').props.density, 'compact')
})


test('detalle de escritorio usa columna contenida y activa la densidad compacta', () => {
  const f = fixture()
  const ui = f.render()
  const contenido = ui.find(n => n.props?.style?.maxWidth === 540)
  assert.ok(contenido, 'la lista no debe expandirse como una tabla')
  assert.ok(ui.some(n => n.type === 'AjustesCompactos'))
})


/**
 * La vuelta de Google en el teléfono.
 *
 * `Escritorio` recibe la sección y la muestra sola; `Telefono` dibuja la tirada
 * entera de iOS, así que la sección tiene que ir a buscarse con el scroll.
 */
function fixtureTelefono(os = 'android') {
  const source = ts.createSourceFile('ajustes.tsx', readFileSync('app/ajustes/index.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const node = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === 'Telefono')
  const code = ts.transpileModule(`export ${node.getText(source)}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  const refs = [], exports = {}, jsx = (type, props) => ({ type, props })
  const saltos = []
  let cursor = 0
  vm.runInNewContext(code, {
    exports, require: () => ({ jsx, jsxs: jsx }),
    useRef(initial) { const i = cursor++; if (!(i in refs)) refs[i] = { current: initial }; return refs[i] },
    useCallback: fn => fn,
    Platform: { OS: os }, Fragment: 'Fragment',
    useState(initial) { const i = cursor++; if (!(i in refs)) refs[i] = initial; return [refs[i], v => { refs[i] = v }] },
    usePiso: () => 24, useKeyboardH: () => 0, useSafeAreaInsets: () => ({ bottom: 34 }),
    ...Object.fromEntries(['SafeAreaView', 'View', 'Text', 'ScrollView', 'BotonVolver', 'EncabezadoHoja', 'SearchField', 'ListaAjustes', 'GrupoAjustes', 'FilaAccion', 'FilaDato'].map(k => [k, k])),
  })
  const categorias = [{ id: 'music', titulo: 'Reproducción', bloques: { type: 'Music' } }, { id: 'cuenta', titulo: 'Cuenta', bloques: { type: 'Cuenta' } }]
  return {
    saltos,
    render(props = {}) {
      cursor = 0
      const ui = nodes(exports.Telefono({ coinciden: categorias, buscando: false, busqueda: '', onBusqueda: () => {}, cuenta: { type: 'BloqueCuenta' }, sinResultados: { type: 'Vacio' }, onVolver: () => {}, ...props }))
      const lista = ui.find(n => n.type === 'ScrollView')
      if (lista) lista.props.ref.current = { scrollTo: destino => saltos.push(destino) }
      return ui
    },
  }
}

test('volver de Google en el teléfono deja la sección de Cuenta a la vista, una sola vez', () => {
  const f = fixtureTelefono()
  const ui = f.render({ initialId: 'cuenta' })
  const seccion = ui.filter(n => n.props?.onLayout)
  assert.equal(seccion.length, 2, 'cada categoría avisa dónde quedó')
  seccion[0].props.onLayout({ nativeEvent: { layout: { y: 0 } } })
  seccion[1].props.onLayout({ nativeEvent: { layout: { y: 900 } } })
  // El objeto nace adentro del vm, con otro prototipo: se compara copiado.
  assert.deepEqual(f.saltos.map(s => ({ ...s })), [{ y: 892, animated: false }])
  // Medir de nuevo —una rotación, el teclado— no puede robarle el scroll a quien ya está leyendo.
  seccion[1].props.onLayout({ nativeEvent: { layout: { y: 880 } } })
  assert.equal(f.saltos.length, 1)
})

test('buscando no se salta a ninguna sección: la lista ya está filtrada', () => {
  const f = fixtureTelefono()
  const ui = f.render({ initialId: 'cuenta', buscando: true, busqueda: 'google' })
  ui.filter(n => n.props?.onLayout).forEach(n => n.props.onLayout({ nativeEvent: { layout: { y: 900 } } }))
  assert.deepEqual(f.saltos, [])
  assert.ok(!ui.some(n => n.type === 'BloqueCuenta'), 'la placa de la cuenta se retira mientras se busca')
})


test('iOS abre Cuenta tras Google, permite ver todas las categorías y conserva un único List al buscar', () => {
  const f = fixtureTelefono('ios')
  let ui = f.render({ initialId: 'cuenta' })
  assert.equal(ui.some(n => n.type === 'ScrollView'), false)
  assert.equal(ui.find(n => n.type === 'EncabezadoHoja').props.titulo, 'Cuenta')
  assert.equal(ui.some(n => n.type === 'Music'), false)
  ui.find(n => n.props?.rotulo === 'Ver toda la configuración').props.onPress()
  ui = f.render({ initialId: 'cuenta' })
  assert.ok(ui.some(n => n.type === 'Music'))
  assert.ok(ui.some(n => n.type === 'Cuenta'))
  assert.equal(ui.filter(n => n.type === 'ListaAjustes').length, 1)
  ui = f.render({ buscando: true, busqueda: 'sin coincidencias', coinciden: [] })
  assert.ok(ui.some(n => n.props?.rotulo === 'Sin resultados'))
  assert.equal(ui.some(n => n.type === 'BloqueCuenta'), false)
})
