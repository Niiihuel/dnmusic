import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import babel from '@babel/core'

const copy = v => JSON.parse(JSON.stringify(v))
const jsx = (type, props) => ({ type, props })
function compilar(source, contexto = {}) {
  const exports = {}
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  vm.runInNewContext(code, { exports, require: () => ({ jsx, jsxs: jsx }), ...contexto })
  return exports
}
function funcion(archivo, nombre, contexto) {
  const source = ts.createSourceFile(archivo, readFileSync(archivo, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const node = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === nombre)
  return compilar(`export ${node.getText(source).replace(/^export /, '')}`, contexto)[nombre]
}
const helper = compilar(readFileSync('src/ui/mosaicoResize.ts', 'utf8'))

test('resize devuelve tamaños discretos y mantiene la base de inicio al invertir el gesto', () => {
  const inicio = { w: 600, h: 300, mosaico: 600, filas: 1 }
  assert.deepEqual(copy(helper.objetivoResizeMosaico(inicio, -200, 0)), { cols: 1, filas: 1 })
  assert.deepEqual(copy(helper.objetivoResizeMosaico(inicio, -40, 0)), { cols: 2, filas: 1 })
  assert.deepEqual(copy(helper.objetivoResizeMosaico(inicio, 0, 180)), { cols: 2, filas: 2 })
  assert.deepEqual(copy(helper.objetivoResizeMosaico(inicio, -9999, -9999)), { cols: 1, filas: 1 })
})

function montarCelda() {
  const shared = value => ({ value }), pans = [], styles = [], llamadas = []
  const agarre = {
    activa: shared(-1), dx: shared(0), dy: shared(0), origen: shared({}), pendiente: shared(false),
    rects: shared([{ x: 0, y: 0, w: 600, h: 300 }]), estirando: shared(-1), anchoMosaico: shared(600),
    refs: { current: new Map() }, onLayoutCelda() {},
    empezar() {}, moverA() {}, soltar() {}, cancelar() {}, tocarAsa() {},
    empezarEstirar: () => llamadas.push('inicio'), estirarA: (...args) => llamadas.push(args),
    soltarEstirar: () => llamadas.push('soltar'), cancelarEstirar: () => llamadas.push('cancelar'),
  }
  const gesto = () => { const handlers = {}; const proxy = new Proxy(handlers, { get: (_, k) => (...args) => { if (String(k).startsWith('on')) handlers[k] = args[0]; return proxy } }); return { handlers, proxy } }
  const contexto = {
    AIRE_CELDA: 6, objetivoResizeMosaico: helper.objetivoResizeMosaico,
    useSharedValue: shared, useAnimatedStyle: fn => { styles.push(fn); return fn() },
    useState: initial => [initial, () => {}], useAnimatedReaction() {}, withTiming: v => v, runOnJS: fn => fn,
    TECLADO_FISICO: true, State: { END: 5 }, Animated: { View: 'AnimatedView' }, View: 'View', Pressable: 'Pressable',
    IconRedimensionar: 'Icon', GestureDetector: 'Detector', ReduceMotion: { System: 'system' },
    LinearTransition: { duration: ms => ({ reduceMotion: () => ({ ms }) }) },
    Gesture: { Pan: () => { const g = gesto(); pans.push(g.handlers); return g.proxy }, LongPress: () => gesto().proxy, Race: (...g) => g },
  }
  const Celda = funcion('src/ui/PerfilPublico.tsx', 'CeldaDeMosaico', contexto)
  return { arbol: Celda({ indice: 0, mitad: false, filas: 1, agarre, editando: true, children: { type: 'pieza' } }), agarre, asa: pans[1], styles, llamadas }
}

test('el handler real no suma deltas al nuevo layout y no cruza a JS en cada movimiento', () => {
  const { asa, agarre, llamadas } = montarCelda()
  asa.onStart()
  asa.onUpdate({ translationX: -200, translationY: 0 })
  agarre.rects.value = [{ x: 0, y: 0, w: 300, h: 480 }]
  for (let i = 0; i < 20; i++) asa.onUpdate({ translationX: -200 - i, translationY: 0 })
  asa.onUpdate({ translationX: -40, translationY: 0 })
  assert.deepEqual(copy(llamadas), ['inicio', [0, 1, 1], [0, 2, 1]])
  asa.onFinalize({ state: 3 })
  assert.equal(llamadas.at(-1), 'cancelar')
  assert.equal(agarre.estirando.value, -1)
})

function nodos(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodos)
  return [node, ...nodos(node.props?.children)]
}
test('el contorno se ancla a los cuatro bordes de la pieza, sin ancho/alto crudo independiente', () => {
  const { arbol, asa, styles } = montarCelda()
  const contorno = nodos(arbol).find(n => n.props?.testID === 'contorno-resize-mosaico')
  assert.deepEqual(copy(contorno.props.style[0]).left, 0)
  for (const lado of ['left', 'right', 'top', 'bottom']) assert.equal(contorno.props.style[0][lado], 0)
  asa.onStart()
  const visible = styles[2]()
  assert.deepEqual(copy(visible), { opacity: 1 })
  assert.equal(arbol.props.style.minWidth, 0)
})

test('la imagen cambia de ancho y reencuadra contra su proporción real, sin alto heredado del ancho viejo', () => {
  let width = 300
  const VitrinaImagen = funcion('src/ui/Vitrina.tsx', 'VitrinaImagen', {
    useState: () => [width, next => { width = typeof next === 'function' ? next(width) : next }],
    View: 'View', Image: 'Image', ilustracionUrl: path => path,
    estiloEncuadrado: (w, encuadre, h) => ({ w, h, encuadre }),
  })
  const props = { imagen: { path: 'imagen-local', encuadre: { x: 0.5, y: 0.5, escala: 1 } } }
  const antes = VitrinaImagen(props)
  antes.props.onLayout({ nativeEvent: { layout: { width: 180 } } })
  const despues = VitrinaImagen(props)
  assert.equal(despues.props.style.height, undefined)
  assert.equal(despues.props.style.aspectRatio, 1 / 0.62)
  assert.match(despues.props.className, /overflow-hidden/)
  assert.equal(despues.props.children.props.style.w, 180)
  assert.equal(despues.props.children.props.style.h, 112)
})

test('el helper de resize se compila como worklet para iOS', () => {
  const result = babel.transformFileSync('src/ui/mosaicoResize.ts', { caller: { name: 'metro', platform: 'ios', supportsStaticESM: true, isDev: false } })
  assert.match(result.code, /__workletHash/)
})


test('el fondo recibe las nuevas medidas y queda recortado por la superficie del contenido', () => {
  let caja = null
  const Superficie = funcion('src/ui/Vitrina.tsx', 'Superficie', {
    useState: () => [caja, next => { caja = typeof next === 'function' ? next(caja) : next }],
    View: 'View', Image: 'Image', Glass: 'Glass', HAY_VIDRIO: false,
    LLENO: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
    ilustracionUrl: p => p, estiloEncuadrado: (w, encuadre, h) => ({ w, h, encuadre }),
  })
  const props = { colores: { fondo: '#234' }, fondo: null, children: { type: 'Texto' } }
  const inicial = Superficie(props)
  assert.equal(typeof inicial.props.onLayout, 'function')
  inicial.props.onLayout({ nativeEvent: { layout: { width: 420, height: 120 } } })
  const conFoto = { ...props, fondo: { path: 'local', encuadre: {} } }
  const grande = Superficie(conFoto)
  assert.equal(nodos(grande).find(n => n.type === 'Image').props.style.w, 420)
  grande.props.onLayout({ nativeEvent: { layout: { width: 180, height: 240 } } })
  const chico = Superficie(conFoto)
  const imagen = nodos(chico).find(n => n.type === 'Image')
  assert.equal(imagen.props.style.w, 180)
  assert.equal(imagen.props.style.h, 240)
  assert.equal(chico.props.style[0].overflow, 'hidden')
  assert.equal(chico.props.style[0].width, '100%')
  assert.equal(chico.props.children.at(-1).type, 'Texto')
})

test('la barra ofrece herramientas, agregar y editor sin confirmación propia; bloquea acciones ocupadas', () => {
  const llamadas = []
  const Barra = funcion('src/ui/BarraHerramientasMosaico.tsx', 'BarraHerramientasMosaico', {
    View: 'View', Text: 'Text', Menu: 'Menu', BotonVidrio: 'Boton',
    IconPalette: 'Icon', IconType: 'Icon', IconMore: 'Icon', IconPlus: 'Icon', IconBack: 'Icon',
    ICON_COLOR: { foreground: 'white', onPrimary: 'black' },
  })
  const props = { ocupado: false, onTema: () => llamadas.push('tema'), onFuente: () => llamadas.push('fuente'), onAgregar: () => llamadas.push('agregar'), onEditor: () => llamadas.push('editor') }
  const nodes = nodos(Barra(props))
  const menu = nodes.find(n => n.type === 'Menu')
  for (const item of menu.props.items) item.onPress()
  const botones = nodes.filter(n => n.type === 'Boton')
  assert.deepEqual(botones.map(n => n.props.label), ['Agregar una pieza', 'Volver al editor de perfil'])
  botones.forEach(n => n.props.onPress())
  assert.deepEqual(llamadas, ['tema', 'fuente', 'agregar', 'editor'])
  const ocupado = nodos(Barra({ ...props, ocupado: true }))
  for (const item of ocupado.find(n => n.type === 'Menu').props.items) { assert.equal(item.disabled, true); item.onPress() }
  assert.equal(llamadas.length, 4)
  assert.ok(ocupado.filter(n => n.type === 'Boton').every(n => n.props.disabled))
})

test('pulsación larga inicia el borrador global antes del armado, también dentro de subspaces', () => {
  for (const archivo of ['app/profile/index.tsx', 'app/profile/subspace.tsx']) {
    const texto = readFileSync(archivo, 'utf8')
    const source = ts.createSourceFile(archivo, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    let inicio
    const visitar = node => {
      if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'entrarEdicion') inicio = node.initializer.getText(source)
      ts.forEachChild(node, visitar)
    }
    visitar(source)
    const llamadas = [], profile = { userId: 'local' }
    const { entrar } = compilar(`export const entrar = ${inicio}`, {
      useCallback: fn => fn, profile, yo: profile, propio: true,
      iniciarPerfilEdicion: p => llamadas.push(['global', p.userId]),
      setElegida: () => {}, setArmando: b => llamadas.push(['armar', b]),
    })
    entrar()
    assert.deepEqual(llamadas, [['global', 'local'], ['armar', true]])
    assert.doesNotMatch(texto, /BarraCambiosPerfil|mosaico\.guardar\(/)
    assert.match(texto, /dismissTo\('\/profile\/editar'\)/)
  }
})
