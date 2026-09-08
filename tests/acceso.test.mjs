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
      signInWithGoogle: async () => { calls.push(['google']); if (failure) throw failure },
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
    button: (label = 'Iniciar sesión') => render().find(n => n.type === 'AccionSocial' && n.props.label === label).props,
    error: () => render().find(n => n.type === 'FormError' && n.props.message)?.props.message,
    async check() { effects.length = 0; render(); effects.splice(0).forEach(fn => fn()); timers.splice(0).forEach(fn => fn()); await Promise.resolve(); await Promise.resolve() },
  }
}

test('login: siguiente enfoca contraseña, error conserva datos y reintento no duplica autenticación', async () => {
  const f = fixture('sign-in')
  f.render().find(n => n.type === 'EnlaceAcceso' && n.props.expanded === false).props.onPress()
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

test('registro nuevo usa únicamente Google, evita duplicados y permite reintentar tras error o cancelación', async () => {
  const f = fixture('sign-up')
  assert.equal(f.render().some(n => n.type === 'CampoAcceso'), false)
  assert.match(f.render().find(n => n.type === 'PantallaAcceso').props.detalle, /@nihuel/)
  f.fail(new Error('Network'))
  const submit = f.button('Continuar con Google').onPress
  await Promise.all([submit(), submit()])
  assert.deepEqual(f.calls, [['google']])
  assert.match(f.error(), /No se pudo continuar con Google/)
  assert.equal(f.button('Continuar con Google').disabled, false)
  f.fail(null)
  await f.button('Continuar con Google').onPress()
  assert.equal(f.error(), undefined)
  assert.equal(f.button('Continuar con Google').busy, false, 'cancelar OAuth no deja un spinner infinito')
  assert.equal(f.calls.some(c => c[0] === 'signUp' || c[0] === 'onboarding'), false)
})

test('login ofrece Google primero y mantiene el acceso de cuentas antiguas como opción secundaria', async () => {
  const f = fixture('sign-in')
  assert.equal(f.render().some(n => n.type === 'CampoAcceso'), false)
  const botonGoogle = f.button('Continuar con Google')
  assert.equal(botonGoogle.icono.type, 'GoogleIcon')
  const google = botonGoogle.onPress
  await Promise.all([google(), google()])
  assert.deepEqual(f.calls, [['google']])
  assert.equal(f.button('Continuar con Google').busy, false)
})

test('las puertas conservan el enlace recíproco y sin configuración no envían OAuth', async () => {
  for (const route of ['sign-in', 'sign-up']) {
    const f = fixture(route, false)
    f.render().find(n => n.type === 'EnlaceAcceso' && n.props.label === (route === 'sign-in' ? 'Crear cuenta' : 'Ya tengo cuenta · Iniciar sesión')).props.onPress()
    assert.deepEqual(f.navigation, [route === 'sign-in' ? '/sign-up' : '/sign-in'])
    assert.equal(f.button('Continuar con Google').disabled, true)
    await f.button('Continuar con Google').onPress()
    assert.equal(f.calls.length, 0)
  }
})
