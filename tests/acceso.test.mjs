import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
const username = {}
new Function('exports', transpile(readFileSync('src/models/username.ts', 'utf8')))(username)
function flatten(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(flatten)
  return [node, ...flatten(node.props?.children)]
}
function fixture(route, configured = true) {
  let index = 0, failure = null, available = true
  const states = [], effects = [], timers = [], calls = [], navigation = []
  const exports = {}
  const stub = new Proxy({}, { get: (_, key) => key })
  new Function('exports', 'require', 'setTimeout', 'clearTimeout', transpile(readFileSync(`app/${route}.tsx`, 'utf8')))(exports, id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === 'react') return {
      useState(v) { const i = index++; if (!(i in states)) states[i] = v; return [states[i], v => states[i] = typeof v === 'function' ? v(states[i]) : v] },
      useRef(v) { const i = index++; return states[i] ??= { current: v } },
      useEffect(fn) { effects.push(fn) },
    }
    if (id === 'expo-router') return { useRouter: () => ({ replace: route => navigation.push(route) }) }
    if (id.endsWith('/username')) return username
    if (id.endsWith('/supabase')) return { isSupabaseConfigured: configured }
    if (id.endsWith('/auth')) return {
      isUsernameAvailable: async () => available,
      signIn: async (...args) => { calls.push(['signIn', ...args]); if (failure) throw failure },
      signUp: async (...args) => { calls.push(['signUp', ...args]); if (failure) throw failure },
    }
    if (id.endsWith('/semillas')) return { marcarOnboardingPendiente: async () => calls.push(['onboarding']) }
    if (id.endsWith('/icons')) return { ...stub, ICON_COLOR: {} }
    return stub
  }, fn => timers.push(fn), () => {})
  function render() { index = 0; return flatten(exports.default()) }
  return { calls, navigation, render, fail: e => failure = e, available: v => available = v,
    field: label => render().find(n => n.type === 'CampoAcceso' && n.props.label === label).props,
    button: () => render().find(n => n.type === 'AccionSocial').props,
    error: () => render().find(n => n.type === 'FormError' && n.props.message)?.props.message,
    async check() { effects.length = 0; render(); effects.splice(0).forEach(fn => fn()); timers.splice(0).forEach(fn => fn()); await Promise.resolve(); await Promise.resolve() },
  }
}

test('login: siguiente enfoca contraseña, error conserva datos y reintento no duplica autenticación', async () => {
  const f = fixture('sign-in')
  assert.equal(f.button().disabled, true)
  let focused = 0
  f.field('Contraseña').ref.current = { focus: () => focused++ }
  f.field('Usuario').onSubmitEditing()
  assert.equal(focused, 1)
  f.field('Usuario').onChangeText('usuario_local')
  f.field('Contraseña').onChangeText('secreto_local')
  f.fail({ code: 'invalid_credentials' })
  await f.field('Contraseña').onSubmitEditing()
  assert.equal(f.error(), 'Usuario o contraseña incorrectos.')
  assert.equal(f.field('Usuario').value, 'usuario_local')
  assert.equal(f.field('Contraseña').value, 'secreto_local')
  f.fail(null)
  const submit = f.button().onPress
  await Promise.all([submit(), submit()])
  assert.equal(f.calls.length, 2) // one failure, one successful retry
  assert.equal(f.field('Usuario').editable, false)
})

test('registro: valida disponibilidad/confirmación, mantiene autofill y marca onboarding tras alta', async () => {
  const f = fixture('sign-up')
  f.field('Usuario').onChangeText('NUEVA_LOCAL')
  f.field('Contraseña').onChangeText('secreto_local')
  f.field('Repetir contraseña').onChangeText('otra_clave')
  f.field('Repetir contraseña').onBlur()
  assert.equal(f.field('Repetir contraseña').error, 'No coinciden.')
  assert.equal(f.button().disabled, true)
  await f.check()
  f.field('Repetir contraseña').onChangeText('secreto_local')
  assert.equal(f.button().disabled, false)
  assert.equal(f.field('Contraseña').autoComplete, 'new-password')
  let focuses = 0
  f.field('Repetir contraseña').ref.current = { focus: () => focuses++ }
  f.field('Contraseña').onSubmitEditing()
  assert.equal(focuses, 1)
  const submit = f.button().onPress
  await Promise.all([submit(), submit()])
  assert.deepEqual(f.calls, [['signUp', 'nueva_local', 'secreto_local'], ['onboarding']])
})

test('registro: nombre ocupado impide alta; fallo remoto deja reintentar sin perder campos', async () => {
  const f = fixture('sign-up')
  f.available(false)
  f.field('Usuario').onChangeText('ocupado')
  f.field('Contraseña').onChangeText('secreto_local')
  f.field('Repetir contraseña').onChangeText('secreto_local')
  await f.check()
  assert.equal(f.button().disabled, true)
  await f.button().onPress()
  assert.equal(f.calls.length, 0)
  f.available(true)
  f.field('Usuario').onChangeText('otro_local')
  await f.check()
  f.fail({ code: 'signup_disabled' })
  await f.button().onPress()
  assert.equal(f.error(), 'El registro está cerrado por ahora.')
  assert.equal(f.field('Usuario').value, 'otro_local')
  assert.equal(f.button().disabled, false)
  assert.equal(f.calls.some(c => c[0] === 'onboarding'), false)
})

test('las puertas de acceso conservan el enlace recíproco y sin configuración no envían', async () => {
  for (const route of ['sign-in', 'sign-up']) {
    const f = fixture(route, false)
    f.render().find(n => n.props?.accessibilityRole === 'link').props.onPress()
    assert.deepEqual(f.navigation, [route === 'sign-in' ? '/sign-up' : '/sign-in'])
    f.field('Usuario').onChangeText('cuenta_local')
    f.field('Contraseña').onChangeText('secreto_local')
    if (route === 'sign-up') { f.field('Repetir contraseña').onChangeText('secreto_local'); await f.check() }
    await f.button().onPress()
    assert.equal(f.calls.length, 0)
  }
})
