import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n, ...nodes(n.props?.children)] : []
function harness(path, injected = {}) {
  const states = [], effects = [], exports = {}; let index = 0
  const react = {
    forwardRef: f => props => f(props, props.ref),
    createContext: value => ({ value, Provider: 'Provider' }), useContext: context => context.value,
    useRef: current => { const i = index++; return states[i] ??= { current } },
    useEffect: f => effects.push(f), useImperativeHandle: (ref, f) => { if (ref) ref.current = f() },
  }
  const native = { useNativeState: initial => { const r = react.useRef(initial); return { get: () => r.current, set: v => { r.current = v } } } }
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('exports', 'require', code)(exports, id => {
    if (id === 'nativewind') return { cssInterop() {} }
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === '@expo/ui/swift-ui') return new Proxy(native, { get: (o, k) => o[k] ?? k })
    if (id === '@expo/ui/swift-ui/modifiers') return new Proxy({}, { get: (_, k) => (...args) => ({ kind: k, args }) })
    if (id === 'react-native') return { View: 'View', StyleSheet: { flatten: style => Array.isArray(style) ? Object.assign({}, ...style) : style }, ...injected.native }
    if (id === './Ajustes.shared') return { GrupoAjustes: 'SharedGroup' }
    throw Error(id)
  })
  return { render: (name, props) => { index = 0; return nodes(exports[name](props)) }, effects: () => effects.splice(0).forEach(f => f()) }
}
const mod = (node, kind) => node.props.modifiers.find(m => m.kind === kind)?.args

test('TextField mantiene foco/submit explícito, edición controlada y autocompletado', () => {
  const h = harness('src/ui/EntradaTexto.ios.tsx'), ref = { current: null }, calls = []
  const props = { ref, value: 'ana', onChangeText: t => calls.push(t), onSubmitEditing: e => calls.push(e.nativeEvent.text),
    onFocus: () => calls.push('focus'), onBlur: () => calls.push('blur'), textContentType: 'username', autoCapitalize: 'none', submitBehavior: 'submit', returnKeyType: 'next' }
  const field = h.render('EntradaTexto', props).find(n => n.type === 'TextField')
  field.props.ref.current = { focus: () => field.props.onFocusChange(true), blur: () => field.props.onFocusChange(false), clear() {} }
  ref.current.focus(); assert.equal(ref.current.isFocused(), true)
  field.props.text.set('ana2'); field.props.onTextChange('ana2')
  mod(field, 'onSubmit')[0]()
  assert.equal(ref.current.isFocused(), true, 'next no pierde el foco antes de que el formulario lo transfiera')
  ref.current.blur(); assert.equal(ref.current.isFocused(), false)
  assert.deepEqual(calls, ['focus', 'ana2', 'ana2', 'blur'])
  assert.deepEqual(mod(field, 'textContentType'), ['username'])
  assert.deepEqual(mod(field, 'textInputAutocapitalization'), ['never'])
  h.render('EntradaTexto', { ...props, value: '' }); h.effects()
  assert.equal(field.props.text.get(), '', 'restablecer el borrador limpia también el campo nativo')
})

test('SecureField protege contenido; ocupado bloquea cambios y submit y respeta tipografía', () => {
  const h = harness('src/ui/EntradaTexto.ios.tsx'), calls = []
  const ui = h.render('EntradaTexto', { value: 'secreto', secureTextEntry: true, editable: false,
    autoComplete: 'current-password', maxLength: 80, style: { fontFamily: 'Perfil', fontSize: 20, fontWeight: '600', fontStyle: 'italic' },
    onChangeText: t => calls.push(t), onSubmitEditing: () => calls.push('submit') })
  assert.equal(ui.some(n => n.type === 'TextField'), false)
  const secure = ui.find(n => n.type === 'SecureField')
  secure.props.onTextChange('cambio'); mod(secure, 'onSubmit')[0]()
  assert.deepEqual(calls, [])
  assert.deepEqual(mod(secure, 'disabled'), [true])
  assert.deepEqual(mod(secure, 'textContentType'), ['password'])
  assert.equal(secure.props.maxLength, 80)
  assert.equal(mod(secure, 'font')[0].family, 'Perfil')
  assert.equal(mod(secure, 'font')[0].weight, 'semibold')
  assert.ok(mod(secure, 'italic'))
})

test('acciones de Ajustes nativas no ejecutan ocupado; borrar exige elección en Alert', () => {
  const alerts = [], calls = []
  const h = harness('src/ui/Ajustes.ios.tsx', { native: { Alert: { alert: (...args) => alerts.push(args) } } })
  const busy = h.render('FilaAccion', { rotulo: 'Guardar', busy: true, onPress: () => calls.push('guardar') }).find(n => n.type === 'Button')
  assert.equal(busy.props.onPress, undefined)
  assert.deepEqual(mod(busy, 'disabled'), [true])
  const destructive = h.render('FilaConfirmable', { rotulo: 'Borrar historial de escucha', onCompletar: () => calls.push('borrar') }).find(n => n.type === 'Button')
  destructive.props.onPress()
  assert.deepEqual(calls, [])
  assert.equal(alerts[0][2][0].style, 'cancel')
  assert.match(alerts[0][1], /No se puede deshacer/)
  alerts[0][2][1].onPress()
  assert.deepEqual(calls, ['borrar'])
})
