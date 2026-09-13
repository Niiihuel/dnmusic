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
    if (id.endsWith('/GoogleOAuthFeedback')) return {
      EstadoGoogle: 'EstadoGoogle',
      mensajeErrorGoogle: (error, fallback) => error?.message?.includes('Network') ? 'Sin conexión. Revisá internet y volvé a intentarlo.' : fallback,
    }
    if (id.endsWith('/GoogleOAuthButton')) return { GoogleOAuthButton: 'GoogleOAuthButton' }
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
    button: (label = 'Iniciar sesión') => render().find(n =>
      (n.type === 'AccionSocial' || n.type === 'GoogleOAuthButton') && n.props.label === label,
    ).props,
    error: () => render().find(n => n.type === 'FormError' && n.props.message)?.props.message,
    async check() { effects.length = 0; render(); effects.splice(0).forEach(fn => fn()); timers.splice(0).forEach(fn => fn()); await Promise.resolve(); await Promise.resolve() },
  }
}

test('login ofrece una única entrada Google sin usuario, contraseña ni registro separado', async () => {
  const f = fixture('sign-in')
  assert.equal(f.render().some(n => n.type === 'CampoAcceso' || n.type === 'EnlaceAcceso'), false)
  assert.equal(f.render().filter(n => n.type === 'GoogleOAuthButton').length, 1)
  const google = f.button('Continuar con Google').onPress
  await Promise.all([google(), google()])
  assert.deepEqual(f.calls, [['google']])
  assert.equal(f.button('Continuar con Google').busy, false)
  assert.deepEqual(f.navigation, [])
})

test('fallo conserva la pantalla y permite reintentar; cancelación libera el botón', async () => {
  const f = fixture('sign-in')
  f.fail(new Error('Network'))
  await f.button('Continuar con Google').onPress()
  assert.match(f.error(), /Sin conexión/)
  assert.equal(f.button('Continuar con Google').disabled, false)
  f.fail(null)
  await f.button('Continuar con Google').onPress()
  assert.equal(f.error(), undefined)
  assert.equal(f.button('Continuar con Google').busy, false)
  assert.equal(f.calls.some(c => c[0] === 'signIn' || c[0] === 'signUp'), false)
})

test('sin configuración el acceso explica el error y no inicia OAuth', async () => {
  const f = fixture('sign-in', false)
  assert.equal(f.button('Continuar con Google').disabled, true)
  assert.match(f.error(), /no está disponible/)
  await f.button('Continuar con Google').onPress()
  assert.equal(f.calls.length, 0)
})

test('los enlaces de registro antiguos redirigen a la entrada única', () => {
  const exports = {}
  new Function('exports', 'require', transpile(readFileSync('app/sign-up.tsx', 'utf8')))(exports, id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === 'expo-router') return { Redirect: 'Redirect' }
    throw Error(id)
  })
  const ui = exports.default()
  assert.equal(ui.type, 'Redirect')
  assert.equal(ui.props.href, '/sign-in')
})
