import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
function cargar(source, dependencies = {}, globals = {}) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  new Function('exports', 'require', ...Object.keys(globals), outputText)(exports, (id) => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id in dependencies) return dependencies[id]
    throw Error(id)
  }, ...Object.values(globals))
  return exports
}
function expand(node) {
  if (Array.isArray(node)) return node.map(expand)
  if (!node || typeof node !== 'object') return node
  if (typeof node.type === 'function') return expand(node.type(node.props))
  return { ...node, props: { ...node.props, children: expand(node.props?.children) } }
}
function nodos(node, type) {
  if (Array.isArray(node)) return node.flatMap((n) => nodos(n, type))
  if (!node || typeof node !== 'object') return []
  return [...(node.type === type ? [node] : []), ...nodos(node.props?.children, type), ...nodos(node.props?.label, type)]
}
const reparto = cargar(readFileSync('src/ui/menuReparto.ts', 'utf8'))
const modifiers = Object.fromEntries(['accessibilityLabel', 'buttonStyle', 'contentShape', 'disabled', 'frame'].map((k) => [k, (value) => ({ type: k, value })]))
modifiers.shapes = { rectangle: () => ({ type: 'rectangle' }) }
const { MenuNativo } = cargar(readFileSync('src/ui/MenuNativo.ios.tsx', 'utf8'), {
  react: { Fragment: 'Fragment', useState: (v) => [v, () => {}] },
  'react-native': { View: 'View' },
  '@expo/ui/swift-ui': { ...Object.fromEntries(['Button', 'ControlGroup', 'Divider', 'Host', 'Image', 'Label', 'Menu', 'RNHostView', 'Text', 'Toggle'].map((k) => [k, k])), ContextMenu: { Trigger: 'Trigger', Items: 'Items' } },
  '@expo/ui/swift-ui/modifiers': modifiers,
  './menuReparto': reparto,
  './MenuContextualColeccion': { HAY_CONTEXTO_COLECCION: false },
  './icons': { ICON_COLOR: { foreground: '#fff', muted: '#aaa' } },
})

test('menú iOS conserva las opciones disabled sin callbacks, incluidos submenús y acciones rápidas', () => {
  let clicks = 0
  const action = () => clicks++
  const items = [
    { label: 'Fila', disabled: true, onPress: action },
    { label: 'Subtítulo', subtitle: 'Detalle', disabled: true, onPress: action },
    { label: 'Rápida', rapida: true, disabled: true, onPress: action },
    { label: 'Selector', selected: true, disabled: true, onPress: action },
    { label: 'Submenú', disabled: true, items: [{ label: 'Hijo', onPress: action }] },
    { label: 'Disponible', onPress: action },
  ]
  const ui = expand(MenuNativo({ items }))
  const buttons = nodos(ui, 'Button')
  assert.equal(buttons.length, 5)
  for (const node of [...buttons.filter((n) => n.props.label !== 'Disponible'), ...nodos(ui, 'Toggle'), ...nodos(ui, 'Menu').filter((n) => n.props.label === 'Submenú')]) {
    assert.ok(node.props.modifiers.some((m) => m.type === 'disabled' && m.value === true))
    assert.equal(node.props.onPress, undefined)
    assert.equal(node.props.onIsOnChange, undefined)
  }
  buttons.find((n) => n.props.label === 'Disponible').props.onPress()
  assert.equal(clicks, 1)
  assert.deepEqual(reparto.repartirMenu(items).lista.map((i) => i.label), ['Disponible'])
})

test('disparadores iOS ofrecen 44pt y un área de interacción explícita para icono/texto', () => {
  for (const props of [{}, { text: 'Opciones' }, { longPress: true }]) {
    const ui = expand(MenuNativo({ items: [], ...props }))
    const host = nodos(ui, 'Host')[0]
    assert.equal(host.props.style.height, 44)
    assert.ok(host.props.style.minWidth >= 44)
    const trigger = [...nodos(ui, 'Image'), ...nodos(ui, 'Label')][0]
    assert.ok(trigger.props.modifiers.some((m) => m.type === 'frame' && m.value.minWidth === 44 && m.value.minHeight === 44))
    assert.ok(trigger.props.modifiers.some((m) => m.type === 'contentShape'))
  }
  const custom = expand(MenuNativo({ items: [], children: jsx('Contenido', {}) }))
  const content = nodos(custom, 'RNHostView')[0].props.children
  assert.equal(content.props.style.minHeight, 44)
  assert.equal(content.props.style.minWidth, 44)
})

const index = readFileSync('app/index.tsx', 'utf8')
const start = index.indexOf('function ConversationSidebar(')
const source = index.slice(start, index.indexOf('\nfunction EmptyThread(', start))
const globals = Object.fromEntries(['View', 'Text', 'Panel', 'Pressable', 'Avatar', 'ActivityIndicator', 'BotonVidrio', 'CampoBusquedaLateral', 'FlatList', 'FilaCuenta', 'ScrollArea', 'Vacio', 'IconCollapseLeft', 'IconNewConversation', 'CabeceraLateral', 'BotonLateral', 'IconInbox', 'IconCheck', 'IconClose'].map((k) => [k, k]))
Object.assign(globals, { TECLADO_FISICO: true, ICON_COLOR: {}, usePiso: () => 8, useTecho: () => 16, useColapso: () => ({}), contactLabel: (c) => c.username, contactTitle: (c) => c.displayName || c.username, formatMessageDate: () => 'Hoy', invitacionEnTexto: () => false })
const { ConversationSidebar } = cargar(`${source}\nexport { ConversationSidebar }`, {}, globals)
const props = { conversations: [], requests: [], filtered: true, consulta: 'ana', activePairId: null, hovered: false, onCollapse() {}, onSelect() {}, onRespond() {}, onNew() {}, onBuscar() {}, onAbrirCuenta() {} }
const ana = { id: 'ana', username: 'ana', displayName: 'Ana', avatarPath: 'ana.jpg', pairId: null, solicitud: null }
const renderSidebar = (extra = {}) => nodos(ConversationSidebar({ ...props, ...extra }), 'FlatList')[0].props

test('contactos: carga no presenta vacío ni resultados viejos; errores/mínimo llegan al estado vacío', () => {
  const loading = renderSidebar({ buscandoCuentas: true, cuentas: [ana] })
  assert.equal(loading.ListEmptyComponent, null)
  assert.equal(nodos(loading.ListFooterComponent, 'FilaCuenta').length, 0)
  assert.equal(nodos(loading.ListFooterComponent, 'View').find((n) => n.props.accessibilityRole === 'progressbar').props.accessibilityLabel, 'Buscando contactos…')
  const error = 'Escribí al menos 3 letras.'
  const empty = renderSidebar({ errorBusqueda: error })
  assert.equal(empty.ListEmptyComponent.props.detalle, error)
  assert.equal(renderSidebar({ filtered: false }).ListEmptyComponent.props.accion.rotulo, 'Buscar contacto')
})

test('contactos: solicitudes coincidentes se deduplican y acciones conservan destinatario', () => {
  const accepted = []
  const ui = renderSidebar({ requests: [{ ...ana, solicitud: 'recibida' }, { ...ana, id: 'pepe', username: 'pepe', displayName: 'Pepe' }], cuentas: [ana], onRespond: (...args) => accepted.push(args) })
  assert.equal(nodos(ui.ListHeaderComponent, 'Avatar').length, 1)
  assert.equal(ui.ListFooterComponent, null)
  nodos(ui.ListHeaderComponent, 'Pressable')[0].props.onPress()
  assert.equal(accepted[0][0].id, 'ana')
  assert.equal(accepted[0][1], true)
  const accounts = renderSidebar({ cuentas: [ana] })
  const row = nodos(accounts.ListFooterComponent, 'FilaCuenta')[0]
  assert.equal(row.props.density, 'compact')
  assert.equal(row.props.onSolicitar, undefined)
  const conv = { pairId: 'par', contact: ana, lastMessageAt: null, lastMessageText: 'Mensaje', unreadCount: 2 }
  const rendered = accounts.renderItem({ item: conv })
  assert.equal(nodos(rendered, 'Avatar')[0].props.size, 36)
  assert.ok(nodos(rendered, 'Text').some((n) => n.props.children === '@ana · Contacto'))
})


const { FilaCuenta } = cargar(readFileSync('src/ui/FilaCuenta.tsx', 'utf8'), {
  'react-native': { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', Text: 'Text', View: 'View' },
  '../services/contacts': { contactLabel: c => c.displayName || c.username, contactTitle: c => c.displayName || c.username },
  '../lib/teclado': { TECLADO_FISICO: true },
  './Avatar': { Avatar: 'Avatar' },
  './icons': { ICON_COLOR: {}, IconCheck: 'IconCheck', IconPlus: 'IconPlus' },
})

test('fila: perfil y elegir son botones hermanos; usos anteriores conservan abrir/solicitar', () => {
  const actions = []
  const onAbrir = () => actions.push('elegir')
  const ui = FilaCuenta({ cuenta: ana, onAbrir, onVerPerfil: () => actions.push('perfil') })
  const buttons = nodos(ui, 'Pressable')
  assert.equal(buttons.length, 2)
  for (const button of buttons) assert.equal(nodos(button.props.children, 'Pressable').length, 0)
  assert.equal(buttons[0].props.accessibilityLabel, 'Ver perfil de Ana')
  assert.equal(buttons[1].props.accessibilityLabel, 'Elegir a Ana')
  buttons[0].props.onPress()
  assert.deepEqual(actions, ['perfil'])
  buttons[1].props.onPress()
  assert.deepEqual(actions, ['perfil', 'elegir'])
  const legacy = nodos(FilaCuenta({ cuenta: ana, onAbrir }), 'Pressable')
  assert.equal(legacy.length, 1)
  assert.equal(legacy[0].props.accessibilityLabel, 'Abrir a Ana')
  const request = nodos(FilaCuenta({ cuenta: ana, onAbrir, onSolicitar: () => actions.push('solicitud') }), 'Pressable')
  request[1].props.onPress()
  assert.equal(actions.at(-1), 'solicitud')
})

test('resultados de chat: consultar perfil no dispara escribir ni solicitar', () => {
  const actions = []
  const ui = renderSidebar({ cuentas: [ana], onVerPerfilCuenta: c => actions.push(['perfil', c.id]), onAbrirCuenta: c => actions.push(['escribir', c.id]) })
  const row = nodos(ui.ListFooterComponent, 'FilaCuenta')[0].props
  assert.equal(row.rotuloAbrir, 'Escribir')
  row.onVerPerfil()
  assert.deepEqual(actions, [['perfil', 'ana']])
  row.onAbrir()
  assert.deepEqual(actions, [['perfil', 'ana'], ['escribir', 'ana']])
})
