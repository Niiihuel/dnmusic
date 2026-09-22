import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import androidDesign from './helpers/androidDesign.mjs'

function harness(path, imports = {}) {
  let index = 0
  const states = [], effects = [], exports = {}
  const jsx = (type, props) => ({ type, props })
  const nativeNames = new Map()
  const native = new Proxy({}, { get: (_, name) => {
    if (name === 'Shape') return { Pill: () => ({ type: 'Pill' }) }
    if (name === 'useNativeState') return initial => {
      const r = react.useRef(initial)
      return { get: () => r.current, set: next => { r.current = next } }
    }
    if (!nativeNames.has(name)) nativeNames.set(name, Object.assign(function () {}, { displayName: name,
      DecorationBox: `${name}.DecorationBox`, InnerTextField: `${name}.InnerTextField`, Placeholder: `${name}.Placeholder`, Label: `${name}.Label`, HeadlineContent: `${name}.HeadlineContent`, SupportingContent: `${name}.SupportingContent`, TrailingContent: `${name}.TrailingContent` }))
    return nativeNames.get(name)
  } })
  const react = {
    forwardRef: render => props => render(props, props.ref),
    useState(initial) { const n = index++; if (!(n in states)) states[n] = typeof initial === 'function' ? initial() : initial
      return [states[n], next => { states[n] = typeof next === 'function' ? next(states[n]) : next }] },
    useRef(initial) { const n = index++; return states[n] ??= { current: initial } },
    useEffect(effect) { effects.push(effect) },
    useImperativeHandle(ref, create) { if (ref) ref.current = create() },
  }
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('exports', 'require', code)(exports, id => {
    if (id in imports) return imports[id]
    if (id === './androidDesign') return androidDesign
    if (id === './androidComposeDesign') return { androidControlModifiers: () => [] }
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === 'react-native') return { View: 'View', Text: 'Text', useWindowDimensions: () => ({ width: 390 }), StyleSheet: { flatten: style => Array.isArray(style) ? Object.assign({}, ...style) : style } }
    if (id === '@expo/ui/jetpack-compose') return native
    if (id === '@expo/ui/jetpack-compose/modifiers') return new Proxy({ Shapes: { RoundedCorner: radius => ({ radius }) } }, { get: (o, k) => o[k] ?? ((...args) => ({ kind: k, args })) })
    if (id === 'nativewind') return { cssInterop() {} }
    if (id === 'lucide-react-native') return { Search: 'Search', X: 'X' }
    if (id === './AndroidHost') return { AndroidHost: 'AndroidHost', AndroidIcon: 'AndroidIcon', ANDROID_COLORS: { text: '#FFFFFF', primary: '#FFFFFF', onPrimary: '#121212', surface: '#242426', raised: '#303032', muted: '#B3B3B3' }, androidAccessibility: (label, value) => ({ kind: 'accessibility', label, value }) }
    if (id === '../state/copia') return { useEstadoCopia: () => 'idle' }
    if (id === './EncabezadoHoja') return { EncabezadoHoja: 'EncabezadoHoja', BotonHoja: 'BotonHoja' }
    if (id === './AndroidIcon') return { AndroidIcon: 'AndroidIcon' }
    if (id === './EntradaTexto.android') return { EntradaTexto: 'EntradaTexto' }
    if (id === './tiempos') return { formatClock: String }
    throw Error(id)
  })
  return { render(name, props) { index = 0; effects.length = 0; const ui = exports[name](props); effects.forEach(f => f()); return ui }, exports }
}
function all(node, type) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(n => all(n, type))
  return [...(node.type === type || node.type?.displayName === type ? [node] : []), ...all(node.props?.children, type)]
}
const find = (node, type) => all(node, type)[0]

function input(field, text) { field.props.value.set(text); field.props.onValueChange(text) }

test('Android slider: no adelanta audio durante arrastre ni deja que el progreso pise el pulgar', () => {
  const h = harness('src/ui/SeekBar.android.tsx'), seeks = []
  const props = { label: 'Tema', progress: .1, elapsedMs: 1000, totalMs: 10000, onSeek: v => seeks.push(v) }
  let slider = find(h.render('SeekBar', props), 'Slider')
  slider.props.onValueChange(.4)
  slider = find(h.render('SeekBar', { ...props, progress: .2 }), 'Slider')
  assert.equal(slider.props.value, .4)
  slider.props.onValueChange(.7)
  assert.deepEqual(seeks, [])
  slider.props.onValueChangeFinished()
  assert.deepEqual(seeks, [.7])
  slider.props.onValueChangeFinished()
  assert.deepEqual(seeks, [.7])
  assert.equal(find(h.render('SeekBar', { ...props, progress: NaN }), 'Slider').props.value, 0)
})

test('Android volumen: envía valores en vivo, limita valores inválidos y no duplica al soltar', () => {
  const h = harness('src/ui/SeekBar.android.tsx'), seeks = []
  const slider = find(h.render('SeekBar', { label: 'Volumen', progress: 0, totalMs: 1, elapsedMs: 0, envivo: true, onSeek: v => seeks.push(v) }), 'Slider')
  slider.props.onValueChange(.2); slider.props.onValueChange(2); slider.props.onValueChange(NaN)
  slider.props.onValueChangeFinished()
  assert.deepEqual(seeks, [.2, 1])
})

test('Android búsqueda: foco externo, teclado Buscar, limpiar y cambios de valor externos', () => {
  const h = harness('src/ui/SearchField.android.tsx'), calls = [], inputRef = { current: null }
  const props = { value: 'Tema', onChangeText: v => calls.push(v), inputRef, onSubmit: () => calls.push('submit'), onFocusChange: v => calls.push(v) }
  const ui = h.render('SearchField', props), field = find(ui, 'BasicTextField')
  field.props.ref.current = { focus: () => calls.push('focus'), blur: () => calls.push('blur') }
  inputRef.current.focus(); inputRef.current.blur()
  assert.equal(field.props.keyboardOptions.imeAction, 'search')
  field.props.onFocusChanged(false)
  assert.deepEqual(calls, ['focus', 'blur'], 'Compose no debe cerrar la búsqueda con su false inicial')
  field.props.keyboardActions.onSearch('Tema'); field.props.onFocusChanged(true); field.props.onFocusChanged(false)
  find(ui, 'IconButton').props.onClick()
  assert.equal(field.props.value.get(), '')
  assert.deepEqual(calls, ['focus', 'blur', 'submit', true, false, '', 'focus'])
  const changed = find(h.render('SearchField', { ...props, value: 'Otro tema' }), 'BasicTextField')
  assert.equal(changed.props.value.get(), 'Otro tema')
  const busy = h.render('SearchField', { ...props, loading: true })
  assert.ok(find(busy, 'CircularProgressIndicator'))
  assert.equal(find(busy, 'IconButton'), undefined)
})

test('Android mensaje: buffer nativo conserva cambios externos al editar/enviar y respeta readonly', () => {
  const h = harness('src/ui/CampoMensaje.android.tsx'), changes = []
  const props = { value: 'Borrador', placeholder: 'Mensaje', onChangeText: v => changes.push(v), maxLength: 2000, autoFocus: true }
  let field = find(h.render('CampoMensaje', props), 'BasicTextField')
  assert.equal(field.props.maxLength, 2000)
  assert.equal(field.props.maxLines, 5)
  assert.equal(field.props.keyboardOptions.imeAction, 'none')
  input(field, 'Borrador cambiado')
  field = find(h.render('CampoMensaje', { ...props, value: 'Mensaje para editar' }), 'BasicTextField')
  assert.equal(field.props.value.get(), 'Mensaje para editar')
  field = find(h.render('CampoMensaje', { ...props, value: '', editable: false }), 'BasicTextField')
  assert.equal(field.props.value.get(), '')
  assert.equal(field.props.enabled, false)
  field.props.onValueChange('No debe enviarse')
  assert.deepEqual(changes, ['Borrador cambiado'])
})

test('Android formulario: ref, selección, submit y callbacks preservan el texto de Compose', () => {
  const h = harness('src/ui/EntradaTexto.android.tsx'), calls = [], ref = { current: null }
  const props = { value: 'Ana', ref, placeholder: 'Nombre', selection: { start: 1, end: 2 }, selectTextOnFocus: true,
    onChangeText: v => calls.push(['text', v]), onSubmitEditing: e => calls.push(['submit', e.nativeEvent.text]),
    onSelectionChange: e => calls.push(['selection', e.nativeEvent.selection]), onBlur: e => calls.push(['blurEvent', e.nativeEvent.text]) }
  let field = find(h.render('EntradaTexto', props), 'BasicTextField')
  field.props.ref.current = { focus: () => calls.push('focus'), blur: () => calls.push('blur'), clear: () => calls.push('clear'), setSelection: (...v) => calls.push(v) }
  ref.current.focus(); field.props.onFocusChanged(true)
  assert.equal(ref.current.isFocused(), true)
  input(field, 'Anabel')
  field.props.onSelectionChange({ start: 2, end: 4 })
  field.props.keyboardActions.onDone('Anabel')
  field.props.onFocusChanged(false)
  assert.equal(ref.current.isFocused(), false)
  assert.deepEqual(calls, ['focus', [0, 3], ['text', 'Anabel'], ['selection', { start: 2, end: 4 }], ['submit', 'Anabel'], 'blur', ['blurEvent', 'Anabel']])
  field = find(h.render('EntradaTexto', { ...props, value: 'Nuevo' }), 'BasicTextField')
  assert.equal(field.props.value.get(), 'Nuevo')
  assert.deepEqual(calls.at(-1), [1, 2])
  ref.current.clear(); assert.equal(field.props.value.get(), '')
})

test('Android contraseña: oculta texto, desactiva autocorrección y conserva autocompletado', () => {
  const h = harness('src/ui/EntradaTexto.android.tsx')
  const field = find(h.render('EntradaTexto', { value: 'secreto', secureTextEntry: true, autoComplete: 'current-password', keyboardType: 'numeric', maxLength: 12 }), 'BasicTextField')
  assert.equal(field.props.visualTransformation, 'password')
  assert.equal(field.props.keyboardOptions.keyboardType, 'numberPassword')
  assert.equal(field.props.keyboardOptions.capitalization, 'none')
  assert.equal(field.props.keyboardOptions.autoCorrectEnabled, false)
  assert.equal(field.props.maxLength, 12)
  assert.deepEqual(field.props.modifiers.find(m => m.kind === 'semantics').args, [{ contentType: 'current-password' }])
})

test('Android multiline: Enter agrega línea sin enviar ni perder foco', () => {
  const h = harness('src/ui/EntradaTexto.android.tsx'), calls = []
  const field = find(h.render('EntradaTexto', { value: 'Dos\nlíneas', multiline: true, numberOfLines: 6, onSubmitEditing: () => calls.push('submit') }), 'BasicTextField')
  assert.equal(field.props.singleLine, false)
  assert.equal(field.props.maxLines, 6)
  assert.equal(field.props.keyboardOptions.imeAction, 'none')
  field.props.keyboardActions.onDone('Dos\nlíneas')
  assert.deepEqual(calls, [])
})

test('Android Field: no pierde iconos, accesorios, ref ni errores al cambiar el motor del campo', () => {
  const h = harness('src/ui/Field.android.tsx'), ref = { current: null }
  const ui = h.render('Field', { value: 'ana', label: 'Usuario', hint: 'Ayuda', error: 'No disponible', icon: 'icon', accessory: 'loading', ref })
  assert.equal(find(ui, 'EntradaTexto').props.ref, ref)
  assert.equal(find(ui, 'EntradaTexto').props.accessibilityLabel, 'Usuario')
  const texts = all(ui, 'Text')
  assert.equal(texts.at(-1).props.children, 'No disponible')
  assert.equal(texts.at(-1).props.accessibilityLiveRegion, 'polite')
})

test('Android switch y segmentos conservan selección y bloqueo', () => {
  const h = harness('src/ui/Interruptor.android.tsx'), changes = []
  let toggle = find(h.render('Interruptor', { activo: true, onCambiar: v => changes.push(v), rotulo: 'Descargas' }), 'Switch')
  toggle.props.onCheckedChange(false)
  toggle = find(h.render('Interruptor', { activo: true, disabled: true, onCambiar: v => changes.push(v), rotulo: 'Descargas' }), 'Switch')
  assert.equal(toggle.props.enabled, false); toggle.props.onCheckedChange(false)
  assert.deepEqual(changes, [false])
  const s = harness('src/ui/Segmentado.android.tsx')
  const buttons = all(s.render('Segmentado', { value: 'b', label: 'Ver', options: [{ value: 'a', label: 'Listas' }, { value: 'b', label: 'Artistas' }], onChange: v => changes.push(v) }), 'SegmentedButton')
  assert.equal(buttons[0].props.selected, false); assert.equal(buttons[1].props.selected, true)
  buttons[0].props.onClick()
  assert.deepEqual(changes, [false, 'a'])
})

test('Android progreso: siempre entrega fracciones finitas dentro del rango nativo', () => {
  const h = harness('src/ui/Progreso.android.tsx')
  for (const [valor, expected] of [[NaN, 0], [-1, 0], [.4, .4], [2, 1]]) {
    assert.equal(find(h.render('BarraDeProgreso', { valor }), 'LinearProgressIndicator').props.progress, expected)
    assert.equal(h.exports.porciento(valor), `${Math.round(expected * 100)} %`)
  }
})

test('Android acción social: deshabilita reenvíos durante guardado y conserva contraste primario', () => {
  const h = harness('src/ui/Social.android.tsx'), calls = []
  const props = { label: 'Guardar', onPress: () => calls.push('guardar') }
  let button = find(h.render('AccionSocial', props), 'Button')
  button.props.onClick()
  assert.deepEqual(calls, ['guardar'])
  assert.equal(find(button, 'Text').props.color, '#FFFFFF')
  for (const patch of [{ disabled: true }, { busy: true }]) {
    button = find(h.render('AccionSocial', { ...props, ...patch }), 'Button')
    assert.equal(button.props.enabled, false)
    assert.equal(button.props.onClick, undefined)
  }
  button = find(h.render('AccionSocial', { ...props, secundaria: true, selected: true }), 'Button')
  assert.equal(find(button, 'Text').props.color, '#FFFFFF')
  assert.equal(button.props.modifiers.find(m => m.kind === 'accessibility').value, 'Seleccionado')
})

test('Android fila social: texto, familia, valor y selección no cambian el destinatario de la acción', () => {
  const h = harness('src/ui/FilaSocial.android.tsx'), calls = []
  const props = { titulo: 'Ana', detalle: '@ana', valor: 'Amiga', fontFamily: 'Caveat', label: 'Elegir Ana', onPress: () => calls.push('ana'), selected: true }
  let ui = h.render('FilaSocial', props), surface = find(ui, 'Surface')
  surface.props.onClick()
  assert.deepEqual(calls, ['ana'])
  assert.equal(surface.props.selected, true)
  assert.equal(surface.props.modifiers.find(m => m.kind === 'accessibility').label, 'Elegir Ana')
  assert.equal(all(ui, 'Text').find(n => n.props.children === 'Ana').props.style.fontFamily, 'Caveat')
  assert.ok(all(ui, 'Text').some(n => n.props.children === 'Amiga'))
  assert.equal(find(ui, 'AndroidIcon').props.symbol, 'checkmark')
  for (const patch of [{ busy: true }, { disabled: true }]) {
    ui = h.render('FilaSocial', { ...props, ...patch }); surface = find(ui, 'Surface')
    assert.equal(surface.props.enabled, false)
    surface.props.onClick()
  }
  assert.deepEqual(calls, ['ana'])
})

test('Android acciones de copiar reflejan el resultado real, bloquean pendiente y permiten reintentar', () => {
  let estado = 'pending'
  const imports = { '../state/copia': { useEstadoCopia: () => estado } }
  const buttonHarness = harness('src/ui/Social.android.tsx', imports), rowHarness = harness('src/ui/FilaSocial.android.tsx', imports), calls = []
  const props = { label: 'Copiar enlace', titulo: 'Invitación', onPress: () => calls.push('copiar'), copyText: 'enlace' }
  let button = find(buttonHarness.render('AccionSocial', props), 'Button')
  assert.equal(button.props.enabled, false)
  assert.equal(find(button, 'Text').props.children, 'Copiando…')
  let surface = find(rowHarness.render('FilaSocial', props), 'Surface')
  surface.props.onClick(); assert.deepEqual(calls, [])
  estado = 'copied'
  button = find(buttonHarness.render('AccionSocial', props), 'Button')
  assert.equal(find(button, 'Text').props.children, 'Copiado')
  estado = 'error'
  button = find(buttonHarness.render('AccionSocial', props), 'Button')
  assert.equal(find(button, 'Text').props.children, 'Reintentar copia')
  button.props.onClick()
  assert.deepEqual(calls, ['copiar'])
})

test('Android cabecera y sección social conservan cierre, acción y contenido', () => {
  const h = harness('src/ui/Social.android.tsx'), calls = []
  const ui = h.render('CabeceraSocial', { titulo: 'Invitar', detalle: 'Al Jam', onCerrar: () => calls.push('cerrar'), accion: 'accion', ocupado: true })
  const header = find(ui, 'EncabezadoHoja')
  assert.equal(header.props.sobre, 'Al Jam')
  assert.equal(header.props.derecha, 'accion')
  assert.equal(header.props.izquierda.props.disabled, true)
  assert.equal(header.props.izquierda.props.label, 'Cerrar invitar')
  const section = h.render('SeccionSocial', { titulo: 'Miembros', detalle: 'Elegí una cuenta', children: 'contenido' })
  assert.ok(all(section, 'View').some(n => n.props.children === 'contenido'))
  assert.deepEqual(all(section, 'Text').map(n => n.props.children), ['Miembros', 'Elegí una cuenta'])
})

for (const component of ['EntradaTexto', 'CampoMensaje', 'SearchField']) {
  test(`Android ${component}: cursor precargado al final, selección al escribir y borrador restaurado al cancelar`, () => {
    const h = harness(`src/ui/${component}.android.tsx`), changes = []
    const draft = 'Hola 🎵'
    const props = { value: draft, placeholder: 'Texto', autoFocus: true, onChangeText: text => changes.push(text) }
    let field = find(h.render(component, props), 'BasicTextField')
    assert.equal(field.props.autoFocus, true)
    assert.deepEqual(field.props.selection.get(), { start: draft.length, end: draft.length })

    const typed = 'Hola otra vez 🎵'
    input(field, typed)
    // El usuario selecciona parte del texto; confirmar el valor desde React no debe mover el cursor.
    const selected = { start: 5, end: 9 }
    field.props.selection.set(selected)
    field = find(h.render(component, { ...props, value: typed }), 'BasicTextField')
    assert.equal(field.props.value.get(), typed)
    assert.deepEqual(field.props.selection.get(), selected)

    const editing = 'Mensaje anterior para editar'
    field = find(h.render(component, { ...props, value: editing }), 'BasicTextField')
    assert.equal(field.props.value.get(), editing)
    assert.deepEqual(field.props.selection.get(), { start: editing.length, end: editing.length })

    // Cancelar vuelve al mismo borrador que ya se había notificado antes de abrir la edición.
    field = find(h.render(component, { ...props, value: typed }), 'BasicTextField')
    assert.equal(field.props.value.get(), typed)
    assert.deepEqual(field.props.selection.get(), { start: typed.length, end: typed.length })
    field = find(h.render(component, { ...props, value: '' }), 'BasicTextField')
    assert.equal(field.props.value.get(), '')
    assert.deepEqual(field.props.selection.get(), { start: 0, end: 0 })
    assert.deepEqual(changes, [typed], 'cargar, restaurar o limpiar desde afuera no simula pulsaciones')
  })

  test(`Android ${component}: un evento JS atrasado no borra las teclas ni la selección más recientes`, () => {
    const h = harness(`src/ui/${component}.android.tsx`), changes = []
    const props = { value: 'texto', placeholder: 'Texto', onChangeText: text => changes.push(text) }
    let field = find(h.render(component, props), 'BasicTextField')

    // Compose recibió A y B, pero el hilo JS todavía está procesando la notificación de A.
    field.props.value.set('textoAB')
    field.props.selection.set({ start: 7, end: 7 })
    field.props.onValueChange('textoA')
    field = find(h.render(component, { ...props, value: 'textoA' }), 'BasicTextField')
    assert.equal(field.props.value.get(), 'textoAB', 'la confirmación atrasada no debe eliminar B')
    assert.deepEqual(field.props.selection.get(), { start: 7, end: 7 })

    // Cuando JS alcanza a Compose, tampoco debe pisar una selección hecha entretanto.
    field.props.selection.set({ start: 2, end: 4 })
    field.props.onValueChange('textoAB')
    field = find(h.render(component, { ...props, value: 'textoAB' }), 'BasicTextField')
    assert.equal(field.props.value.get(), 'textoAB')
    assert.deepEqual(field.props.selection.get(), { start: 2, end: 4 })
    assert.deepEqual(changes, ['textoA', 'textoAB'])
  })
}
