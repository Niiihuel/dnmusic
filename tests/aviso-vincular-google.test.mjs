import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const tick = () => new Promise(resolve => setImmediate(resolve))
const legacy = { id: 'legacy', identities: [{ provider: 'email' }] }
function montar(respuesta = async () => ({ data: { user: legacy } })) {
  let cursor = 0
  const hooks = [], effects = [], rutas = []
  const estado = { user: legacy, acceso: { status: 'approved' }, path: '/', novedades: null, cargados: true, mostrar: true }
  const router = { push: path => rutas.push(path) }
  const deps = {
    react: {
      useRef(initial) { const index = cursor++; return hooks[index] ??= { current: initial } },
      useEffect(effect, values) {
        const index = cursor++, prev = hooks[index]
        if (prev && values.every((value, i) => Object.is(value, prev.values[i]))) return
        effects.push(() => { prev?.cleanup?.(); hooks[index] = { values, cleanup: effect() } })
      },
    },
    'expo-router': { usePathname: () => estado.path, useRouter: () => router },
    '../lib/supabase': { getSupabase: () => ({ auth: { getUser: respuesta } }) },
    '../state/session': { useUser: () => estado.user, useAccessStatus: () => estado.acceso },
    '../state/novedadesVistas': { useNovedadesPendientes: () => estado.novedades },
    '../state/ajustes': { useAjustesCargados: () => estado.cargados, usePreferencia: () => estado.mostrar },
  }
  const exports = {}
  const source = ts.transpileModule(readFileSync('src/ui/AvisoVincularGoogle.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('exports', 'require', source)(exports, id => { assert.ok(id in deps, id); return deps[id] })
  return {
    estado, rutas,
    render() { cursor = 0; exports.AvisoVincularGoogle(); effects.splice(0).forEach(effect => effect()) },
    unmount() { hooks.forEach(hook => hook.cleanup?.()) },
  }
}

test('invita una vez por sesión a una cuenta confirmada sin Google', async () => {
  const h = montar()
  h.render(); await tick()
  assert.deepEqual(h.rutas, ['/vincular-google'])
  h.estado.path = '/vincular-google'; h.render()
  h.estado.path = '/'; h.render(); await tick()
  assert.equal(h.rutas.length, 1, 'Más tarde no abre inmediatamente la misma invitación')
  h.estado.user = null; h.render()
  h.estado.user = legacy; h.render(); await tick()
  assert.equal(h.rutas.length, 2, 'otro inicio de sesión puede recordar la vinculación')
})

test('no invita a Google conectado ni ante identidad desconocida, ajena o error', async () => {
  for (const response of [
    { data: { user: { ...legacy, identities: [{ provider: 'google' }] } } },
    { data: { user: { id: 'legacy' } } },
    { data: { user: { ...legacy, id: 'otra' } } },
    { data: { user: null }, error: new Error('offline') },
  ]) {
    const h = montar(async () => response)
    h.render(); await tick(); assert.deepEqual(h.rutas, [])
  }
  const h = montar(async () => { throw new Error('offline') })
  h.render(); await tick(); assert.deepEqual(h.rutas, [])
})

test('espera Inicio, acceso aprobado, preferencias y cierre de novedades', async () => {
  for (const [key, value] of [['user', null], ['acceso', { status: 'pending' }], ['path', '/onboarding'], ['cargados', false], ['novedades', [{ version: '1' }]]]) {
    let lecturas = 0
    const h = montar(async () => { lecturas++; return { data: { user: legacy } } })
    const original = h.estado[key]; h.estado[key] = value; h.render(); await tick()
    assert.equal(lecturas, 0)
    h.estado[key] = original; h.render(); await tick()
    assert.deepEqual(h.rutas, ['/vincular-google'])
  }
})

test('descarta respuestas tardías después de salir, cambiar de usuario o desmontar', async () => {
  for (const accion of ['ruta', 'usuario', 'desmontar']) {
    let resolver
    const h = montar(() => new Promise(resolve => { resolver = resolve }))
    h.render()
    const primera = resolver
    if (accion === 'desmontar') h.unmount()
    else { if (accion === 'ruta') h.estado.path = '/ajustes'; else h.estado.user = { id: 'otra' }; h.render() }
    primera({ data: { user: legacy } }); await tick()
    assert.deepEqual(h.rutas, [])
  }
})
