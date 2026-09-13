import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function harness(path, imports = {}) {
  let index = 0
  const states = [], effects = [], exports = {}
  const jsx = (type, props) => ({ type, props })
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  const react = {
    useState(initial) { const n = index++; if (!(n in states)) states[n] = typeof initial === 'function' ? initial() : initial
      return [states[n], (v) => { states[n] = typeof v === 'function' ? v(states[n]) : v }] },
    useRef(current) { const n = index++; return states[n] ??= { current } },
    useEffect(f) { effects.push(f) },
    useImperativeHandle(ref, create) { if (ref) ref.current = create() },
  }
  const native = { useNativeState(initial) { const r = react.useRef(initial); return { get: () => r.current, set: v => { r.current = v } } } }
  new Function('exports', 'require', code)(exports, id => {
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === '@expo/ui/swift-ui') return new Proxy(native, { get: (o, k) => o[k] ?? k })
    if (id === '@expo/ui/swift-ui/modifiers') return new Proxy({}, { get: (_, k) => (...args) => ({ kind: k, args }) })
    if (id === './tiempos') return { formatClock: String }
    if (id in imports) return imports[id]
    if (id === 'react-native') return { View: 'View', Text: 'Text' }
    throw Error(id)
  })
  return { render(name, props) { index = 0; return exports[name](props) }, effects }
}
function find(node, type) {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) return node.map(n => find(n, type)).find(Boolean)
  return node.type === type ? node : find(node.props?.children, type)
}

test('slider nativo: arrastrar no busca audio hasta soltar y conserva el último valor', () => {
  const h = harness('src/ui/SeekBar.ios.tsx'), seeks = []
  const props = { label: 'Tema', progress: .1, elapsedMs: 1000, totalMs: 10000, onSeek: v => seeks.push(v) }
  let slider = find(h.render('SeekBar', props), 'Slider')
  slider.props.onEditingChanged(true)
  slider.props.onValueChange(.4)
  slider = find(h.render('SeekBar', { ...props, progress: .2 }), 'Slider')
  assert.equal(slider.props.value, .4, 'una actualización del reproductor no pisa el dedo')
  slider.props.onValueChange(.7)
  assert.deepEqual(seeks, [])
  slider.props.onEditingChanged(false)
  assert.deepEqual(seeks, [.7])
  slider.props.onEditingChanged(false)
  assert.deepEqual(seeks, [.7], 'un final repetido no repite el salto')
})

test('volumen en vivo y ajustes de VoiceOver notifican sin depender de un arrastre', () => {
  const h = harness('src/ui/SeekBar.ios.tsx'), seeks = []
  const props = { label: 'Volumen', progress: 0, elapsedMs: 0, totalMs: 1, onSeek: v => seeks.push(v), envivo: true }
  const slider = find(h.render('SeekBar', props), 'Slider')
  slider.props.onEditingChanged(true)
  slider.props.onValueChange(.2)
  slider.props.onValueChange(.4)
  slider.props.onEditingChanged(false)
  assert.deepEqual(seeks, [.2, .4])
  slider.props.onValueChange(.5)
  slider.props.onValueChange(NaN)
  assert.deepEqual(seeks, [.2, .4, .5])
})

test('el buscador SwiftUI conserva foco externo, submit y limpiar el estado nativo', () => {
  const h = harness('src/ui/SearchField.ios.tsx'), calls = [], inputRef = { current: null }
  const ui = h.render('SearchField', { value: 'Tema', onChangeText: v => calls.push(v), inputRef, onSubmit: () => calls.push('submit') })
  const field = find(ui, 'TextField')
  field.props.ref.current = { focus: () => calls.push('focus'), blur: () => calls.push('blur') }
  inputRef.current.focus()
  inputRef.current.blur()
  field.props.modifiers.find(m => m.kind === 'onSubmit').args[0]()
  find(ui, 'Button').props.onPress()
  assert.equal(field.props.text.get(), '')
  assert.deepEqual(calls, ['focus', 'blur', 'submit', '', 'focus'])
})

test('acciones sociales nativas bloquean reenvíos y guardados mientras están ocupadas', () => {
  const h = harness('src/ui/Social.ios.tsx', {
    'react-native': { Platform: { Version: 26 }, View: 'View' },
    './EncabezadoHoja': { BotonHoja: 'BotonHoja', EncabezadoHoja: 'EncabezadoHoja' },
  })
  let llamadas = 0
  const props = { label: 'Guardar cambios', onPress: () => llamadas++ }
  for (const estado of [{ busy: true }, { disabled: true }]) {
    const button = find(h.render('AccionSocial', { ...props, ...estado }), 'Button')
    assert.equal(button.props.onPress, undefined)
  }
  const button = find(h.render('AccionSocial', props), 'Button')
  button.props.onPress()
  assert.equal(llamadas, 1)
})

test('fila social conserva destinatario y no permite reenviar una invitación deshabilitada', () => {
  const h = harness('src/ui/FilaSocial.ios.tsx'), llamados = []
  const props = { titulo: 'Ana', detalle: '@ana', onPress: () => llamados.push('ana') }
  const disponible = find(h.render('FilaSocial', props), 'Button')
  disponible.props.onPress()
  assert.deepEqual(llamados, ['ana'])
  for (const estado of [{ disabled: true, selected: true }, { busy: true }]) {
    assert.equal(find(h.render('FilaSocial', { ...props, ...estado }), 'Button').props.onPress, undefined)
  }
})

test('pestañas de perfil no seleccionan una sección hasta elegir un valor válido', () => {
  const h = harness('src/ui/SelectorPestanasPerfil.ios.tsx'), cambios = []
  const picker = find(h.render('SelectorPestanasPerfil', { activa: null, onCambiar: v => cambios.push(v) }), 'Picker')
  assert.equal(picker.props.selection, null)
  picker.props.onSelectionChange(null)
  picker.props.onSelectionChange('desconocido')
  assert.deepEqual(cambios, [])
  picker.props.onSelectionChange('space')
  picker.props.onSelectionChange('reciente')
  assert.deepEqual(cambios, ['space', 'reciente'])
})

test('catálogo nativo filtra por nombre sin tildes, elige la colección y cierra sin guardar perfil', () => {
  const h = harness('src/ui/SelectorCatalogo.ios.tsx', {
    'react-native': { Modal: 'Modal', View: 'View' },
    './Social': { AccionSocial: 'AccionSocial', CabeceraSocial: 'CabeceraSocial' },
    './SearchField': { SearchField: 'SearchField' },
  }), cambios = []
  const props = { etiqueta: 'Colección', valor: '0', opciones: Array.from({ length: 9 }, (_, i) => ({ id: String(i), nombre: i === 4 ? 'Océano' : `Colección ${i}` })), onChange: v => cambios.push(v) }
  find(h.render('SelectorCatalogo', props), 'AccionSocial').props.onPress()
  let ui = h.render('SelectorCatalogo', props)
  assert.equal(find(ui, 'Modal').props.visible, true)
  find(ui, 'SearchField').props.onChangeText('oceano')
  ui = h.render('SelectorCatalogo', props)
  const rows = find(ui, 'List').props.children
  assert.equal(rows.length, 1)
  rows[0].props.onPress()
  assert.deepEqual(cambios, ['4'])
  ui = h.render('SelectorCatalogo', { ...props, valor: '4' })
  assert.equal(find(ui, 'Modal').props.visible, false)
  assert.equal(find(ui, 'SearchField').props.value, '')
})

test('cuentas iOS separa visitar perfil, elegir y aceptar sin cambiar destinatario', () => {
  const h = harness('src/ui/FilaCuenta.ios.tsx', {
    '../services/contacts': { contactLabel: c => c.username, contactTitle: c => c.username },
    './Avatar': { Avatar: 'Avatar' },
  })
  const calls = []
  const base = { cuenta: { username: 'ana', pairId: 'pair-ana', solicitud: null },
    onAbrir: () => calls.push('elegir-ana'), onVerPerfil: () => calls.push('perfil-ana'),
    onAceptar: () => calls.push('aceptar-ana'), onSolicitar: () => calls.push('solicitar-ana') }
  function buttons(node) {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(buttons)
    return [...(node.type === 'Button' ? [node] : []), ...buttons(node.props?.children)]
  }
  let actions = buttons(h.render('FilaCuenta', base))
  actions[0].props.onPress(); actions[1].props.onPress()
  assert.deepEqual(calls, ['perfil-ana', 'elegir-ana'])
  actions = buttons(h.render('FilaCuenta', { ...base, cuenta: { ...base.cuenta, pairId: null, solicitud: 'recibida' } }))
  actions[1].props.onPress()
  assert.equal(calls.at(-1), 'aceptar-ana')
  actions = buttons(h.render('FilaCuenta', { ...base, cuenta: { ...base.cuenta, pairId: null } }))
  actions[1].props.onPress()
  assert.equal(calls.at(-1), 'solicitar-ana')
  actions = buttons(h.render('FilaCuenta', { ...base, busy: true }))
  assert.equal(actions.length, 1)
  assert.equal(actions[0].props.onPress, undefined)
})
