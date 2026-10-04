import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
/* La escala de Apple de verdad: la prueba mide lo que mide la app. */
const MEDIDAS = JSON.parse(readFileSync('src/ui/apple.json', 'utf8')).texto
const TIPOGRAFIA = { texto: e => ({ fontSize: MEDIDAS[e].size, lineHeight: MEDIDAS[e].leading, letterSpacing: MEDIDAS[e].tracking }) }

const jsx = (type, props) => ({ type, props })
const runtime = { jsx, jsxs: jsx }
const invitacion = { id: 'jam-qa', code: 'ABC123', hostUsername: 'qa', cuantos: 1 }
const tick = () => new Promise(resolve => setImmediate(resolve))

function cargar(path, imports) {
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  })
  const exports = {}
  vm.runInNewContext(outputText, { exports, require: name => {
    assert.ok(name in imports, `Import no simulado: ${name}`)
    return imports[name]
  } })
  return exports
}

const rn = { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', Text: 'Text', View: 'View', useWindowDimensions: () => ({ width: 390 }) }
const cabecera = cargar('src/ui/EncabezadoHoja.tsx', {
  react: { isValidElement: value => !!value?.type },
  './ModalContext': { useDentroModalPC: () => false },
  'react/jsx-runtime': runtime, 'react-native': rn,
  'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
  './BotonVolver': { BotonVolver: 'BotonVolver' },
  './Glass': { BotonVidrio: 'BotonVidrio', ES_WEB: false },
  './estadoControl': { estadoControlWeb: modo => ({ dataSet: { dnHover: modo } }) },
  './icons': { ICON_COLOR: {}, IconCheck: 'IconCheck', IconClose: 'IconClose', IconChevronLeft: 'IconChevronLeft' },
})
const social = cargar('src/ui/Social.tsx', {
  './CopyFeedback': { CopyFeedback: 'CopyFeedback' },
  '../state/copia': { useEstadoCopia: () => 'idle' },
  'react/jsx-runtime': runtime, 'react-native': rn,
  './EncabezadoHoja': cabecera,
  './icons': { ICON_COLOR: {} },
  './tipografia': TIPOGRAFIA,
})

function nodos(node) {
  if (Array.isArray(node)) return node.flatMap(nodos)
  if (!node || typeof node !== 'object') return []
  const rendered = typeof node.type === 'function' ? node.type(node.props) : node.props?.children
  return [node, ...nodos(rendered)]
}

/** Ejecuta la pantalla y sus componentes Social reales con un store Jam simulado.
 * El servicio publica el estado ANTES de resolver true, como aplicarEstado → conectar.
 * Los renders explícitos permiten verificar también esa ventana de conexión pendiente.
 */
function montar({ width = 390, jamInicial = null } = {}) {
  const slots = [], pendientes = [], navegaciones = [], intentos = [], paneles = [], uniones = []
  let cursor = 0, jam = jamInicial, guardia = null, terminarUnion
  const react = {
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next }]
    },
    useCallback(fn, deps) {
      const i = cursor++, before = slots[i]
      if (!before || deps.some((v, j) => !Object.is(v, before.deps[j]))) slots[i] = { deps, fn }
      return slots[i].fn
    },
    useEffect(fn, deps) {
      const i = cursor++, before = slots[i]
      if (!before || deps.some((v, j) => !Object.is(v, before.deps[j]))) {
        before?.cleanup?.(); slots[i] = { deps }
        pendientes.push(() => { slots[i].cleanup = fn() })
      }
    },
  }
  function intentarNavegar(destino) {
    intentos.push(destino)
    if (guardia?.activa) { guardia.onPrevent({ data: { action: { type: 'GO_BACK' } } }); return false }
    navegaciones.push(destino); return true
  }
  const router = { replace: intentarNavegar }
  const pantalla = cargar('app/jam/[code].tsx', {
    'react/jsx-runtime': runtime, react,
    'react-native': { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', Text: 'Text', View: 'View', useWindowDimensions: () => ({ width }) },
    'expo-router': { useRouter: () => router, useLocalSearchParams: () => ({ code: invitacion.code }) },
    'expo-router/react-navigation': { usePreventRemove: (activa, onPrevent) => { guardia = { activa, onPrevent } } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../../src/services/jam': { verJam: async () => invitacion },
    '../../src/state/jam': {
      useJam: () => jam,
      unirseAJam: (code, salida) => {
        uniones.push({ code, salida })
        return new Promise(resolve => { terminarUnion = resolve })
      },
    },
    '../../src/state/playback': { abrirVista: vista => paneles.push(vista) },
    '../../src/state/shell': { usePiso: () => 24 },
    '../../src/ui/Social': social,
    '../../src/ui/FilaSocial': { FilaSocial: 'FilaSocial' },
    '../../src/ui/Avatar': { Avatar: 'Avatar' },
    '../../src/ui/NowPlayingBar': { PANEL_PX: 1100 },
    '../../src/ui/icons': { ICON_COLOR: {}, IconCheck: 'IconCheck', IconUsers: 'IconUsers' },
    '../../src/ui/ScrollArea': { ScrollArea: 'ScrollArea' },
    /* La puerta del Jam se dibuja sin sesión en modo tarjeta; acá se prueba lo
       que ve quien sí tiene cuenta aprobada. Ver `ui/Aterrizaje`. */
    '../../src/state/session': { useUser: () => ({ id: 'quien' }) },
    '../../src/ui/Aterrizaje': { Aterrizaje: 'Aterrizaje' },
  }).default
  function render() {
    cursor = 0
    const tree = pantalla()
    while (pendientes.length) pendientes.shift()()
    return nodos(tree)
  }
  function boton(label) {
    const found = render().find(n => (n.type === 'Pressable' && n.props.accessibilityLabel === label) || (n.type === 'BotonVidrio' && n.props.label === label))
    assert.ok(found, `Falta botón ${label}`)
    return found
  }
  function pulsar(label) {
    const node = boton(label)
    if (node.props.disabled) return false
    node.props.onPress(); return true
  }
  return {
    render, boton, pulsar, navegaciones, intentos, paneles, uniones,
    bloqueada: () => guardia?.activa,
    atras: () => intentarNavegar('back'),
    publicarEstado: () => { jam = { ...invitacion } },
    resolver: ok => { if (ok) jam = { ...invitacion }; terminarUnion(ok) },
  }
}

for (const width of [390, 1440]) {
  test(`unión a ${width}px: bloquea X/atrás y navega una vez tras publicar Jam y levantar la guarda`, async () => {
    const h = montar({ width })
    h.render(); await tick(); h.render()
    assert.equal(h.pulsar('Unirme al Jam'), true)
    h.render()
    assert.equal(h.bloqueada(), true)
    assert.equal(h.boton('Cerrar invitación a un jam').props.disabled, true)
    assert.equal(h.pulsar('Cerrar invitación a un jam'), false)
    assert.equal(h.pulsar('Ahora no'), false)
    assert.equal(h.pulsar('Unirme al Jam'), false)
    assert.equal(h.atras(), false)
    assert.equal(h.uniones.length, 1)

    h.publicarEstado(); h.render() // aplicarEstado ocurrió; conectar todavía no terminó.
    assert.deepEqual(h.navegaciones, [])
    assert.deepEqual(h.paneles, [])
    h.resolver(true); await tick(); h.render()
    assert.equal(h.bloqueada(), false)
    assert.deepEqual(h.navegaciones, width < 1100 ? ['/jam'] : ['/'])
    assert.deepEqual(h.paneles, width < 1100 ? [] : ['jam'])
    h.render()
    assert.equal(h.navegaciones.length, 1, 'Sin navegación duplicada entre handler y efecto')
    assert.deepEqual(h.intentos.filter(destino => destino !== 'back'), h.navegaciones, 'Tampoco intenta navegar antes de levantar la guarda')
  })
}

test('unión rechazada mantiene invitación, libera cierre y permite reintentar', async () => {
  const h = montar()
  h.render(); await tick(); h.pulsar('Unirme al Jam'); h.render()
  h.resolver(false); await tick(); h.render()
  assert.equal(h.bloqueada(), false)
  assert.equal(h.boton('Cerrar invitación a un jam').props.disabled, false)
  assert.deepEqual(h.navegaciones, [])
  assert.equal(h.pulsar('Unirme al Jam'), true)
  assert.equal(h.uniones.length, 2)
  h.resolver(false); await tick()
  assert.equal(h.pulsar('Cerrar invitación a un jam'), true)
  assert.deepEqual(h.navegaciones, ['/'])
})

test('pertenecer a otro Jam no redirige; pertenecer al invitado evita una nueva unión', async () => {
  for (const mismo of [false, true]) {
    const h = montar({ jamInicial: { id: mismo ? invitacion.id : 'otro-jam' } })
    h.render(); await tick(); h.render()
    assert.deepEqual(h.navegaciones, mismo ? ['/jam'] : [])
    assert.equal(h.uniones.length, 0)
  }
})

test('la unión respeta la salida elegida y el servicio exitoso publica el Jam antes de navegar', async () => {
  const h = montar()
  h.render(); await tick()
  const opcion = h.render().find(n => typeof n.type === 'function' && n.props.titulo === 'Escuchar donde @qa')
  assert.ok(opcion); opcion.props.onPress()
  h.pulsar('Unirme al Jam')
  assert.deepEqual(h.uniones, [{ code: 'ABC123', salida: 'host' }])
  assert.deepEqual(h.navegaciones, [])
  h.resolver(true); await tick(); h.render()
  assert.deepEqual(h.navegaciones, ['/jam'])
})
