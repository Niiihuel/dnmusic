import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const colors = { background: '#121212', surface: '#242426', raised: '#303032', text: '#FFFFFF', muted: '#B3B3B3', primary: '#FFFFFF', onPrimary: '#121212', error: '#FF6961' }

function harness(path, dimensions = { width: 390, height: 844, fontScale: 1 }, overrides = {}) {
  let index = 0
  const states = [], effects = [], exports = {}, components = new Map()
  const component = name => {
    if (!components.has(name)) components.set(name, new Proxy(() => {}, {
      get: (_, prop) => prop === '_nativeType' ? name : component(`${name}.${String(prop)}`),
    }))
    return components.get(name)
  }
  const jsx = (type, props) => ({ type: typeof type === 'function' ? type._nativeType : type, props })
  const react = {
    useState(initial) {
      const n = index++
      if (!(n in states)) states[n] = typeof initial === 'function' ? initial() : initial
      return [states[n], value => { states[n] = typeof value === 'function' ? value(states[n]) : value }]
    },
    useRef(current) { const n = index++; return states[n] ??= { current } },
    useLayoutEffect(effect, deps) {
      const n = index++, previous = states[n]
      if (!previous || deps.some((v, i) => !Object.is(v, previous[i]))) effects.push(effect)
      states[n] = deps
    },
    useEffect(effect, deps) {
      const n = index++, previous = states[n]
      if (!previous || deps.some((v, i) => !Object.is(v, previous[i]))) effects.push(effect)
      states[n] = deps
    },
  }
  const native = new Proxy({ useNativeState(initial) {
    const state = react.useRef(initial)
    return { get: () => state.current, set: value => { state.current = value } }
  } }, { get: (target, name) => target[name] ?? component(String(name)) })
  const reparto = {}
  new Function('exports', ts.transpileModule(readFileSync('src/ui/menuReparto.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(reparto)
  const gesture = new Proxy({}, { get: () => () => gesture })
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { absoluteFill: {} }, useWindowDimensions: () => dimensions },
    'react-native-gesture-handler': { Gesture: { LongPress: () => gesture }, GestureDetector: 'GestureDetector' },
    './menuReparto': reparto, '../lib/portapapeles': { copiarAlPortapapeles: async () => true }, '../state/aviso': { avisar() {} },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 24 }) },
    '@expo/ui/jetpack-compose': native,
    '@expo/ui/jetpack-compose/modifiers': new Proxy({}, { get: (_, kind) => (...args) => ({ kind, args }) }),
    './AndroidHost': { AndroidHost: 'AndroidHost', ANDROID_COLORS: colors,
      androidAccessibility: (...args) => ({ kind: 'androidAccessibility', args }) },
    './AndroidIcon': { AndroidIcon: 'AndroidIcon' }, './IconButton': { IconButton: 'IconButton' }, './SearchField': { SearchField: 'SearchField' }, './Menu': { Menu: 'Menu' }, ...overrides,
  }
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  new Function('exports', 'require', code)(exports, name => { if (name.endsWith('.xml')) return name; if (!(name in imports)) throw Error(name); return imports[name] })
  return { render(name, props) { index = 0; const ui = exports[name](props); effects.splice(0).forEach(effect => effect()); return ui } }
}

function walk(node) {
  if (!node || typeof node !== 'object') return []
  return Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.props?.children)]
}
const find = (node, type) => walk(node).find(n => n.type === type)
const button = (node, label) => walk(node).find(n => ['Button', 'TextButton'].includes(n.type) && walk(n).some(c => c.type === 'Text' && c.props.children === label))

test('confirmación Material: volver/cerrar cancela y sólo la acción explícita confirma', () => {
  const h = harness('src/ui/Confirmar.android.tsx'), calls = []
  const props = { visible: false, titulo: '¿Eliminar?', mensaje: 'Se quitará el mensaje.', rotulo: 'Eliminar',
    onCancelar: () => calls.push('cancelar'), onConfirmar: () => calls.push('eliminar') }
  assert.equal(h.render('Confirmar', props), null)
  const ui = h.render('Confirmar', { ...props, visible: true })
  find(ui, 'AlertDialog').props.onDismissRequest()
  button(ui, 'Cancelar').props.onClick()
  assert.deepEqual(calls, ['cancelar', 'cancelar'])
  button(ui, 'Eliminar').props.onClick()
  assert.deepEqual(calls, ['cancelar', 'cancelar', 'eliminar'])
})

test('catálogo corto: abrir y cancelar conserva la selección; elegir comunica el id y cierra', () => {
  const h = harness('src/ui/SelectorCatalogo.android.tsx'), calls = []
  const props = { etiqueta: 'Colección', valor: 'b', opciones: [{ id: 'a', nombre: 'Aurora' }, { id: 'b', nombre: 'Cosmos' }], onChange: id => calls.push(id) }
  let ui = h.render('SelectorCatalogo', props)
  button(ui, 'Cosmos').props.onClick()
  ui = h.render('SelectorCatalogo', props)
  assert.equal(find(ui, 'DropdownMenu').props.expanded, true)
  find(ui, 'DropdownMenu').props.onDismissRequest()
  assert.deepEqual(calls, [])
  ui = h.render('SelectorCatalogo', props)
  assert.equal(find(ui, 'DropdownMenu').props.expanded, false)
  button(ui, 'Cosmos').props.onClick()
  ui = h.render('SelectorCatalogo', props)
  walk(ui).find(n => n.type === 'DropdownMenuItem').props.onClick()
  assert.deepEqual(calls, ['a'])
  assert.equal(find(h.render('SelectorCatalogo', { ...props, valor: 'a' }), 'DropdownMenu').props.expanded, false)
})

test('catálogo largo: búsqueda sin tildes, selección y cierre respetan la animación nativa', async () => {
  const h = harness('src/ui/SelectorCatalogo.android.tsx'), calls = []
  const props = { etiqueta: 'Colección', valor: '0', opciones: Array.from({ length: 9 }, (_, i) => ({ id: String(i), nombre: i === 4 ? 'Océano' : `Colección ${i}` })), onChange: id => calls.push(id) }
  button(h.render('SelectorCatalogo', props), 'Colección 0').props.onClick()
  let ui = h.render('SelectorCatalogo', props)
  find(ui, 'TextField').props.onValueChange('oceano')
  ui = h.render('SelectorCatalogo', props)
  const rows = find(ui, 'LazyColumn').props.children
  assert.equal(rows.length, 1)
  assert.equal(find(rows[0], 'Text').props.children, 'Océano')
  let finish
  find(ui, 'ModalBottomSheet').props.ref.current = { hide: () => new Promise(resolve => { finish = resolve }) }
  rows[0].props.onClick()
  assert.deepEqual(calls, ['4'])
  assert.ok(find(h.render('SelectorCatalogo', props), 'ModalBottomSheet'), 'el contenido permanece hasta terminar el cierre')
  finish(); await Promise.resolve()
  assert.equal(find(h.render('SelectorCatalogo', props), 'ModalBottomSheet'), undefined)
  button(h.render('SelectorCatalogo', props), 'Colección 0').props.onClick()
  ui = h.render('SelectorCatalogo', props)
  assert.equal(find(ui, 'TextField').props.value.get(), '')
  assert.equal(find(ui, 'LazyColumn').props.children.length, 9)
  find(ui, 'ModalBottomSheet').props.onDismissRequest()
  assert.deepEqual(calls, ['4'], 'deslizar o volver no cambia la colección')
})

test('barra Material exige confirmación para restablecer, bloquea guardados y reserva su altura', () => {
  const h = harness('src/ui/BarraCambiosPerfil.android.tsx'), calls = []
  const props = { visible: false, onGuardar: () => calls.push('guardar'), onRestablecer: () => calls.push('restablecer'), onAltura: n => calls.push(n) }
  assert.equal(h.render('BarraCambiosPerfil', props), null)
  let ui = h.render('BarraCambiosPerfil', { ...props, visible: true })
  button(ui, 'Guardar').props.onClick()
  assert.equal(button(ui, 'Guardar').props.colors.contentColor, colors.onPrimary)
  button(ui, 'Restablecer').props.onClick()
  ui = h.render('BarraCambiosPerfil', { ...props, visible: true })
  assert.ok(find(ui, 'AlertDialog'))
  assert.deepEqual(calls, ['guardar'])
  find(ui, 'AlertDialog').props.onDismissRequest()
  ui = h.render('BarraCambiosPerfil', { ...props, visible: true })
  assert.equal(find(ui, 'AlertDialog'), undefined)
  button(ui, 'Restablecer').props.onClick()
  ui = h.render('BarraCambiosPerfil', { ...props, visible: true })
  button(find(ui, 'AlertDialog.ConfirmButton'), 'Restablecer').props.onClick()
  assert.deepEqual(calls, ['guardar', 'restablecer'])
  for (const estado of [{ ocupado: true }, { puedeGuardar: false }]) {
    ui = h.render('BarraCambiosPerfil', { ...props, visible: true, ...estado })
    assert.equal(button(ui, 'Guardar').props.enabled, false)
    assert.equal(button(ui, 'Guardar').props.onClick, undefined)
  }
  ui = h.render('BarraCambiosPerfil', { ...props, visible: true, ocupado: true, error: 'No se pudo guardar' })
  assert.equal(button(ui, 'Restablecer').props.onClick, undefined)
  assert.ok(find(ui, 'CircularProgressIndicator'))
  assert.ok(walk(ui).some(n => n.type === 'Text' && n.props.children === 'No se pudo guardar'))
  find(ui, 'AndroidHost').props.onLayoutContent({ nativeEvent: { height: 136 } })
  assert.equal(calls.at(-1), 136)
})

test('categorías Material conservan ids, filtro y vista previa; al guardar no alteran el borrador', () => {
  const h = harness('src/ui/FiltrosCatalogoPerfil.android.tsx'), calls = []
  const props = { tipo: 'marco', tipos: [{ id: 'marco', nombre: 'Marco de la foto' }, { id: 'efecto', nombre: 'Efecto del perfil' }],
    onTipo: id => calls.push(id), buscar: '', onBuscar: text => calls.push(text), coleccion: 'cosmos',
    colecciones: [{ id: 'todas', nombre: 'Todas las colecciones' }, { id: 'cosmos', nombre: 'Cosmos' }],
    onColeccion: id => calls.push(id), onPrevia: () => calls.push('previa') }
  let ui = h.render('FiltrosCatalogoPerfil', props)
  const segments = walk(ui).filter(n => n.type === 'SegmentedButton')
  assert.equal(segments[0].props.selected, true)
  assert.equal(segments[1].props.selected, false)
  assert.equal(segments[1].props.modifiers[0].args[0], 'Efecto del perfil')
  segments[1].props.onClick()
  find(ui, 'Menu').props.items[0].onPress()
  find(ui, 'SearchField').props.onChangeText('Aurora')
  find(ui, 'IconButton').props.onPress()
  assert.deepEqual(calls, ['efecto', 'todas', 'Aurora', 'previa'])
  assert.equal(find(ui, 'Menu').props.label, 'Colección: Cosmos')
  ui = h.render('FiltrosCatalogoPerfil', { ...props, ocupado: true })
  assert.equal(find(ui, 'SegmentedButton').props.enabled, false)
  assert.equal(find(ui, 'SegmentedButton').props.onClick, undefined)
  find(ui, 'Menu').props.items[0].onPress()
  assert.equal(calls.length, 4)
})

test('fuentes grandes pueden desplazar las categorías y confirmar respeta el estado ocupado', () => {
  const h = harness('src/ui/FiltrosCatalogoPerfil.android.tsx', { width: 320, height: 640, fontScale: 2 })
  const ui = h.render('FiltrosCatalogoPerfil', { tipo: 'marco', tipos: Array.from({ length: 5 }, (_, i) => ({ id: String(i), nombre: `Categoría ${i}` })), colecciones: [] })
  assert.equal(find(ui, 'ScrollView').props.horizontal, true)
  assert.ok(find(ui, 'AndroidHost').props.style.width > 320)
  const header = harness('src/ui/EncabezadoHoja.android.tsx')
  const close = header.render('BotonHoja', { tipo: 'volver', onPress() {}, disabled: true })
  assert.equal(close.props.label, 'Volver')
  assert.equal(close.props.disabled, true)
  const confirm = header.render('BotonConfirmar', { label: 'Guardar', activo: true, ocupado: true, onPress() {} })
  assert.equal(confirm.props.busy, true)
  assert.equal(confirm.props.disableWhileBusy, true)
})


test('menú abierto se cierra al bloquearse y no ejecuta ni reaparece al habilitarlo', () => {
  const h = harness('src/ui/MenuNativo.android.tsx'), calls = []
  const props = { items: [{ label: 'Eliminar', destructive: true, onPress: () => calls.push('eliminar') }] }
  find(h.render('MenuNativo', props), 'IconButton').props.onClick()
  let ui = h.render('MenuNativo', props)
  assert.equal(find(ui, 'DropdownMenu').props.expanded, true)
  const oldAction = find(ui, 'DropdownMenuItem').props.onClick
  ui = h.render('MenuNativo', { ...props, disabled: true })
  assert.equal(find(ui, 'DropdownMenu').props.expanded, false)
  assert.equal(find(ui, 'DropdownMenuItem').props.enabled, false)
  find(ui, 'DropdownMenuItem').props.onClick()
  oldAction()
  assert.deepEqual(calls, [])
  ui = h.render('MenuNativo', props)
  assert.equal(find(ui, 'DropdownMenu').props.expanded, false)
})

test('copiar desde menú Android conserva callback nativo y su feedback; sólo usa fallback sin callback', async () => {
  const calls = []
  const h = harness('src/ui/MenuNativo.android.tsx', undefined, {
    '../lib/portapapeles': { copiarAlPortapapeles: async text => { calls.push(text); return false } },
    '../state/aviso': { avisar: (...args) => calls.push(args) },
  })
  let props = { items: [{ label: 'Copiar', copyText: 'mensaje', onPress: () => calls.push('callback') }] }
  find(h.render('MenuNativo', props), 'IconButton').props.onClick()
  let ui = h.render('MenuNativo', props)
  find(ui, 'DropdownMenuItem').props.onClick()
  assert.deepEqual(calls, ['callback'])
  assert.equal(find(h.render('MenuNativo', props), 'DropdownMenu').props.expanded, false)
  props = { items: [{ label: 'Copiar', copyText: 'otro mensaje' }] }
  find(h.render('MenuNativo', props), 'IconButton').props.onClick()
  ui = h.render('MenuNativo', props)
  find(ui, 'DropdownMenuItem').props.onClick()
  await Promise.resolve()
  assert.equal(calls[1], 'otro mensaje')
  assert.equal(calls[2][1], true, 'una copia fallida se informa como error')
})

test('navegación Material integra cinco destinos, búsqueda y badge en una sola barra', () => {
  const calls = []
  const h = harness('src/ui/TabBar.android.tsx', undefined, {
    './TabBar.shared': { useIrATab: () => id => calls.push(id), FilaChat: 'FilaChat' },
    '../state/session': { usePendientesChats: () => 7 },
  })
  let ui = h.render('TabPildora', { active: 'listas' })
  const host = find(ui, 'AndroidHost')
  const items = walk(ui).filter(n => n.type === 'NavigationBarItem')
  assert.equal(host.props.style.height, 80)
  assert.equal(items.length, 5)
  assert.deepEqual(items.map(item => find(find(item, 'NavigationBarItem.Label'), 'Text').props.children), ['Inicio', 'Listas', 'Chats', 'Perfil', 'Buscar'])
  assert.deepEqual(items.map(item => item.props.selected), [false, true, false, false, false])
  assert.equal(find(ui, 'IconButton'), undefined, 'Buscar no vive en un botón flotante separado')
  assert.equal(walk(ui).filter(n => n.type === 'Icon').length, 5, 'los iconos pertenecen al árbol Compose')
  assert.equal(find(ui, 'Badge').props.children.props.children, 7)
  items[4].props.onClick()
  assert.deepEqual(calls, ['buscar'])
  ui = h.render('TabPildora', { active: 'buscar' })
  assert.equal(walk(ui).filter(n => n.type === 'NavigationBarItem')[4].props.selected, true)
})


test('pestañas del perfil usan un selector Material y conservan el callback', () => {
  const calls = []
  const h = harness('src/ui/SelectorPestanasPerfil.android.tsx', undefined, {
    './PestanasPerfil': {},
  })
  const ui = h.render('SelectorPestanasPerfil', { activa: 'reciente', onCambiar: id => calls.push(id) })
  const items = walk(ui).filter(n => n.type === 'SegmentedButton')
  assert.equal(find(ui, 'AndroidHost').props.style.width, 220)
  assert.deepEqual(items.map(item => item.props.selected), [true, false])
  assert.deepEqual(items.map(item => find(find(item, 'SegmentedButton.Label'), 'Text').props.children), ['Reciente', 'Space'])
  items[1].props.onClick()
  assert.deepEqual(calls, ['space'])
})

test('aviso Android usa SnackbarHost y limpia sólo el turno mostrado', async () => {
  const calls = []
  let aviso = { texto: null, turno: 3, malo: false }
  const h = harness('src/ui/Aviso.android.tsx', undefined, {
    '../lib/appActiva': { useAppActiva: () => true },
    '../state/aviso': { useAviso: () => aviso, limpiarAviso: turno => calls.push(['limpiar', turno]) },
    '../state/actualizacion': { useHayAvisoActualizacion: () => false },
    '../state/shell': { usePiso: n => n + 80 },
  })
  let ui = h.render('Aviso', {})
  const shown = []
  find(ui, 'SnackbarHost').props.ref.current = {
    showSnackbar: options => { shown.push(options); return Promise.resolve('dismissed') },
  }
  aviso = { texto: 'Cambios guardados', turno: 4, malo: false }
  ui = h.render('Aviso', {})
  await Promise.resolve()
  assert.deepEqual(shown, [{ message: 'Cambios guardados', duration: 'short' }])
  assert.deepEqual(calls, [['limpiar', 4]])
  assert.equal(find(ui, 'View').props.style.bottom, 84)
  assert.equal(find(ui, 'Snackbar').props.containerColor, colors.raised)
})
