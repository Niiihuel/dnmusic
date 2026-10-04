import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
const flatStyle = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}

function entorno(platform = 'ios', consultaInicial = Promise.resolve(false), fontScale = 1) {
  let actual
  const effects = [], animation = [], createdStyles = [], eventos = new Map(), ids = new Map()
  const eventSource = key => ({
    addEventListener(name, fn) {
      const id = `${key}:${name}`
      const listeners = eventos.get(id) ?? new Set()
      listeners.add(fn); eventos.set(id, listeners)
      return { remove: () => listeners.delete(fn) }
    },
    removeEventListener(name, fn) { eventos.get(`${key}:${name}`)?.delete(fn) },
  })
  const app = { currentState: 'active', ...eventSource('app') }
  const media = { matches: false, ...eventSource('media') }
  const document = {
    hidden: false, ...eventSource('document'),
    getElementById: id => ids.get(id), createElement: () => ({}),
    head: { appendChild(style) { createdStyles.push(style); ids.set(style.id, style) } },
  }
  const react = {
    memo: fn => fn,
    useState(initial) {
      const runner = actual, index = runner.index++
      const slot = runner.slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value }]
    },
    useRef(initial) {
      const [ref] = react.useState(() => ({ current: initial }))
      return ref
    },
    useEffect(fn, dependencies) {
      const runner = actual, index = runner.index++
      const slot = runner.slots[index] ??= {}
      if (!slot.dependencies || dependencies.some((value, i) => !Object.is(value, slot.dependencies[i]))) {
        effects.push(() => { slot.cleanup?.(); slot.cleanup = fn(); slot.dependencies = dependencies })
      }
    },
    useSyncExternalStore(subscribe, snapshot) {
      const runner = actual, index = runner.index++
      const slot = runner.slots[index] ??= {}
      if (slot.subscribe !== subscribe) {
        slot.cleanup?.(); slot.cleanup = subscribe(() => {}); slot.subscribe = subscribe
      }
      return snapshot()
    },
  }
  const reanimated = {
    __esModule: true, default: { View: 'AnimatedView' },
    useSharedValue(initial) {
      const [value] = react.useState(() => ({ value: initial }))
      return value
    },
    useAnimatedStyle: fn => fn(),
    withTiming(value, options) { animation.push({ kind: 'timing', value, options }); return value },
    withRepeat(value, count, reverse) { animation.push({ kind: 'repeat', count, reverse }); return value },
    withSpring(value, options) { animation.push({ kind: 'spring', value, options }); return value },
    cancelAnimation(value) { animation.push({ kind: 'cancel', value }) },
    Easing: { out: x => x, quad: 'quad', linear: 'linear' },
  }
  const dependencies = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': {
      View: 'View', Text: 'Text', Image: 'Image', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator',
      Platform: { OS: platform }, AppState: app,
      useWindowDimensions: () => ({ width: 390, height: 844, fontScale }),
      AccessibilityInfo: { ...eventSource('a11y'), isReduceMotionEnabled: () => consultaInicial },
      StyleSheet: { create: styles => styles, absoluteFill: { position: 'absolute', inset: 0 } },
    },
    'react-native-reanimated': reanimated,
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    'react-native-svg': { __esModule: true, default: 'Svg', Circle: 'Circle', Path: 'Path', Defs: 'Defs', RadialGradient: 'RadialGradient', Stop: 'Stop' },
    '../lib/artwork': { artworkUrlAtSize: uri => uri, artworkSource: (_path, uri) => uri },
    '../lib/colorPortada': { useColorPortada: () => '#44303b' },
    './estadoControl': { estadoControlWeb: () => ({}) },
    './icons': { ...Object.fromEntries(['IconMusic', 'IconPlay', 'IconPause', 'IconWave'].map(name => [name, name])), ICON_COLOR: { muted: '#aaa' } },
    './Glass': { ES_WEB: platform === 'web' },
  }
  const movimiento = {}
  new Function('exports', 'require', 'document', 'window', ts.transpileModule(readFileSync('src/ui/useMovimientoVisible.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(movimiento, name => dependencies[name], document, { matchMedia: () => media })
  dependencies['./useMovimientoVisible'] = movimiento
  const exports = {}
  const source = ts.transpileModule(readFileSync('src/ui/TarjetaMusica.tsx', 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  new Function('exports', 'require', 'document', 'window', source)(exports, name => {
    assert.ok(name in dependencies, `Import inesperado: ${name}`)
    return dependencies[name]
  }, document, { matchMedia: () => media })
  for (const path of ['src/ui/SongDisc.tsx', 'src/ui/PlayerArtwork.tsx']) {
    new Function('exports', 'require', 'document', ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText)(exports, name => {
      assert.ok(name in dependencies, `Import inesperado: ${name}`)
      return dependencies[name]
    }, document)
  }
  function montar(props, nombre = 'TarjetaMusica') {
    const runner = { slots: [], index: 0, props }
    const render = (patch = {}) => {
      runner.props = { ...runner.props, ...patch }; runner.index = 0; actual = runner
      const ui = exports[nombre](runner.props)
      effects.splice(0).forEach(fn => fn())
      return ui
    }
    return { render, initial: render(), unmount() { runner.slots.forEach(slot => slot.cleanup?.()) } }
  }
  const emitir = (key, name, value) => {
    if (key === 'app') app.currentState = value
    eventos.get(`${key}:${name}`)?.forEach(fn => fn(value))
  }
  return { montar, emitir, document, media, eventos, animation, createdStyles }
}
const datos = { titulo: 'Tema', artista: 'Artista', imagen: 'https://images.test/cover.jpg' }
const botones = ui => nodes(ui).filter(node => node.type === 'Pressable')
const vinilo = ui => nodes(ui).find(node => node.props?.dataSet?.tarjetaVinilo)

test('preview sin acciones conserva la portada y los textos sin controles de reproducción falsos', () => {
  const e = entorno()
  const card = e.montar({ datos })
  assert.equal(botones(card.initial).length, 0)
  assert.equal(nodes(card.initial).some(node => node.type === 'IconPlay'), false)
  assert.equal(e.eventos.size, 0, 'un preview estático no instala listeners de movimiento')
  assert.equal(flatStyle(card.initial.props.style).height, 100)
  const text = nodes(card.initial).filter(node => node.type === 'Text')
  assert.equal(text.find(node => node.props.children === datos.titulo).props.numberOfLines, 1)
  assert.equal(text.find(node => node.props.children === datos.artista).props.numberOfLines, 1)
  card.unmount()
})

test('texto nativo grande aumenta el alto de la tarjeta sin achicar portada ni cambiar el tamaño web', () => {
  for (const platform of ['ios', 'android', 'web']) {
    const e = entorno(platform, Promise.resolve(false), 2.5)
    const card = e.montar({ datos })
    assert.equal(flatStyle(card.initial.props.style).height, platform === 'web' ? 100 : 159)
    const cover = nodes(card.initial).find(node => node.props?.style && flatStyle(node.props.style).width === 75)
    assert.equal(flatStyle(cover.props.style).height, 75)
    assert.equal(nodes(card.initial).find(node => node.type === 'Text' && node.props.children === datos.titulo).props.numberOfLines, 1)
    card.unmount()
  }
})

test('portada y título ejecutan acciones distintas; una carga se puede pausar sin deshabilitar el botón', () => {
  for (const platform of ['ios', 'android', 'web']) {
    const e = entorno(platform), calls = []
    const card = e.montar({ datos, onReproducir: () => calls.push('play'), onAbrir: () => calls.push('open') })
    let [play, open] = botones(card.initial)
    assert.equal(play.props.accessibilityLabel, 'Reproducir Tema, Artista')
    play.props.onPress(); open.props.onPress()
    assert.deepEqual(calls, ['play', 'open'])
    const busy = card.render({ cargando: true })
    ;[play] = botones(busy)
    assert.equal(play.props.accessibilityState.busy, true)
    assert.equal(play.props.disabled, undefined)
    assert.equal(play.props.accessibilityLabel, 'Pausar Tema, Artista')
    play.props.onPress()
    assert.deepEqual(calls, ['play', 'open', 'play'])
    assert.equal(nodes(busy).some(node => node.type === 'ActivityIndicator'), true)
    assert.equal(nodes(busy).some(node => node.type === 'IconPause'), false)
    card.unmount()
  }
})

test('la acción de traer reproducción remota puede anunciar su intención en todas las plataformas', () => {
  for (const plataforma of ['ios', 'android', 'web']) {
    const e = entorno(plataforma)
    let acciones = 0
    const card = e.montar({ datos, onReproducir() { acciones++ }, etiquetaReproduccion: 'Traer música a este dispositivo' })
    const [play] = botones(card.initial)
    assert.equal(play.props.accessibilityLabel, 'Traer música a este dispositivo')
    assert.equal(play.props.accessibilityState.busy, false)
    assert.equal(nodes(card.initial).some(node => node.type === 'ActivityIndicator'), false)
    play.props.onPress()
    assert.equal(acciones, 1)
    assert.equal(botones(card.render({ etiquetaReproduccion: undefined }))[0].props.accessibilityLabel, 'Reproducir Tema, Artista')
    card.unmount()
  }
})

test('dos tarjetas nativas comparten listeners; el giro exige audio real, primer plano y movimiento permitido', async () => {
  const e = entorno()
  const a = e.montar({ datos, onReproducir() {}, reproduciendo: true })
  const b = e.montar({ datos, onReproducir() {} })
  assert.equal(e.eventos.get('app:change').size, 1)
  assert.equal(e.eventos.get('a11y:reduceMotionChanged').size, 1)
  assert.equal(e.animation.filter(item => item.kind === 'repeat').length, 0, 'espera la preferencia de accesibilidad')
  await Promise.resolve()
  a.render()
  assert.equal(e.animation.filter(item => item.kind === 'repeat').length, 1)
  assert.ok(e.animation.some(item => item.kind === 'timing' && item.options.duration === 3000))
  a.render({ cargando: true })
  assert.equal(e.animation.at(-1).kind, 'cancel', 'no gira durante buffering')
  a.render({ cargando: false })
  e.emitir('app', 'change', 'background'); a.render()
  assert.equal(e.animation.at(-1).kind, 'cancel', 'no mantiene un bucle visual con la pantalla bloqueada')
  const repeats = e.animation.filter(item => item.kind === 'repeat').length
  e.emitir('app', 'change', 'active'); a.render()
  assert.equal(e.animation.filter(item => item.kind === 'repeat').length, repeats + 1)
  e.emitir('a11y', 'reduceMotionChanged', true); a.render()
  assert.equal(e.animation.at(-1).kind, 'cancel')
  a.unmount()
  assert.equal(e.eventos.get('app:change').size, 1, 'la segunda tarjeta conserva la suscripción')
  b.unmount()
  assert.equal(e.eventos.get('app:change').size, 0)
  assert.equal(e.eventos.get('a11y:reduceMotionChanged').size, 0)
})

test('un cambio de accesibilidad reciente prevalece sobre la respuesta inicial tardía', async () => {
  let resolver
  const e = entorno('ios', new Promise(resolve => { resolver = resolve }))
  const card = e.montar({ datos, onReproducir() {}, reproduciendo: true })
  e.emitir('a11y', 'reduceMotionChanged', true)
  resolver(false); await Promise.resolve(); card.render()
  assert.equal(e.animation.filter(item => item.kind === 'repeat').length, 0)
  card.unmount()
})

test('hover y foco revelan un vinilo quieto; la pestaña oculta y movimiento reducido pausan su animación CSS', async () => {
  const e = entorno('web')
  const card = e.montar({ datos, onReproducir() {} })
  await Promise.resolve()
  const [play] = botones(card.render())
  play.props.onHoverIn()
  let ui = card.render()
  assert.equal(vinilo(ui).props.dataSet.tarjetaVinilo, 'quieto')
  const diskPosition = nodes(ui).find(node => node.props?.style && flatStyle(node.props.style).left === 7.5)
  assert.equal(flatStyle(diskPosition.props.style).transform[0].translateX, 24)
  play.props.onHoverOut(); play.props.onFocus()
  assert.equal(flatStyle(nodes(card.render()).find(node => node.props?.style && flatStyle(node.props.style).left === 7.5).props.style).transform[0].translateX, 24)
  ui = card.render({ reproduciendo: true })
  assert.equal(vinilo(ui).props.dataSet.tarjetaVinilo, 'gira')
  e.document.hidden = true; e.emitir('document', 'visibilitychange'); ui = card.render()
  assert.equal(vinilo(ui).props.dataSet.tarjetaVinilo, 'quieto')
  e.document.hidden = false; e.emitir('document', 'visibilitychange'); ui = card.render()
  assert.equal(vinilo(ui).props.dataSet.tarjetaVinilo, 'gira')
  e.media.matches = true; e.emitir('media', 'change'); ui = card.render()
  assert.equal(vinilo(ui).props.dataSet.tarjetaVinilo, 'quieto')
  assert.equal(e.animation.some(item => item.kind === 'repeat'), false, 'web rota en el compositor, sin un loop de JS')
  const other = e.montar({ datos, onReproducir() {} })
  assert.equal(e.createdStyles.length, 1, 'los keyframes se registran una sola vez')
  assert.match(e.createdStyles[0].textContent, /prefers-reduced-motion/)
  card.unmount(); other.unmount()
})

test('una portada fallida muestra un respaldo y una portada nueva se vuelve a dibujar', () => {
  const e = entorno()
  const card = e.montar({ datos, onAbrir() {} })
  const cover = nodes(card.initial).find(node => node.type === 'Image' && node.props.onError)
  cover.props.onError()
  assert.equal(nodes(card.render()).some(node => node.type === 'Image'), false)
  assert.equal(nodes(card.render()).some(node => node.type === 'IconMusic'), true)
  assert.equal(nodes(card.render({ datos: { ...datos, imagen: 'https://images.test/other.jpg' } })).some(node => node.type === 'Image'), true)
  assert.equal(botones(card.render())[0].props.accessibilityLabel, 'Abrir Tema en dnmusic')
  card.unmount()
})

test('disco, portada y tarjeta comparten la misma suscripción; el disco nativo frena sólo en pausa visible', async () => {
  const e = entorno()
  const disc = e.montar({ title: 'Tema', playing: true }, 'SongDisc')
  const artwork = e.montar({ uri: datos.imagen, playing: true }, 'PlayerArtwork')
  const card = e.montar({ datos, onReproducir() {} })
  assert.equal(e.eventos.get('app:change').size, 1)
  assert.equal(e.eventos.get('a11y:reduceMotionChanged').size, 1)
  assert.equal(e.animation.filter(item => item.kind === 'repeat').length, 0)
  await Promise.resolve(); disc.render(); artwork.render(); card.render()
  assert.equal(e.animation.filter(item => item.kind === 'repeat').length, 1)
  disc.render({ playing: false })
  assert.equal(e.animation.filter(item => item.kind === 'timing' && item.options.duration === 650).length, 1, 'conserva la inercia al pausar')
  disc.render({ playing: true })
  const before = e.animation.filter(item => item.kind === 'repeat').length
  e.emitir('app', 'change', 'background'); disc.render()
  assert.equal(e.animation.at(-1).kind, 'cancel')
  disc.render({ playing: false })
  e.emitir('app', 'change', 'active'); disc.render()
  assert.equal(e.animation.filter(item => item.kind === 'repeat').length, before, 'volver a una canción pausada no inicia un loop')
  assert.equal(e.animation.filter(item => item.kind === 'timing' && item.options.duration === 650).length, 1, 'volver del fondo no inventa otro frenado')
  disc.render({ playing: true })
  e.emitir('a11y', 'reduceMotionChanged', true); disc.render()
  assert.equal(e.animation.at(-1).kind, 'cancel')
  disc.unmount(); card.unmount()
  assert.equal(e.eventos.get('app:change').size, 1)
  artwork.unmount()
  assert.equal(e.eventos.get('app:change').size, 0)
})

test('el disco web pausa en pestaña oculta o movimiento reducido y conserva los keyframes únicos', async () => {
  const e = entorno('web')
  const a = e.montar({ title: 'Tema', playing: true }, 'SongDisc')
  const b = e.montar({ title: 'Otra canción', playing: false }, 'SongDisc')
  assert.equal(a.initial.props.dataSet.disco, 'quieto')
  assert.equal(e.createdStyles.length, 1)
  assert.match(e.createdStyles[0].textContent, /6000ms/)
  await Promise.resolve()
  assert.equal(a.render().props.dataSet.disco, 'gira')
  assert.equal(b.render().props.dataSet.disco, 'quieto')
  e.document.hidden = true; e.emitir('document', 'visibilitychange')
  assert.equal(a.render().props.dataSet.disco, 'quieto')
  e.document.hidden = false; e.emitir('document', 'visibilitychange')
  assert.equal(a.render().props.dataSet.disco, 'gira')
  e.media.matches = true; e.emitir('media', 'change')
  assert.equal(a.render().props.dataSet.disco, 'quieto')
  assert.equal(e.animation.some(item => item.kind === 'repeat'), false)
  a.unmount(); b.unmount()
})

test('la portada cancela el resorte al ocultarse; cambios de reproducción ocultos o reducidos son instantáneos', async () => {
  const e = entorno('web')
  const artwork = e.montar({ uri: datos.imagen, playing: true }, 'PlayerArtwork')
  assert.equal(e.animation.some(item => item.kind === 'spring'), false)
  await Promise.resolve(); artwork.render()
  artwork.render({ playing: false })
  assert.equal(e.animation.filter(item => item.kind === 'spring').length, 1)
  e.document.hidden = true; e.emitir('document', 'visibilitychange'); artwork.render()
  assert.equal(e.animation.at(-1).kind, 'cancel')
  artwork.render({ playing: true })
  assert.equal(e.animation.filter(item => item.kind === 'spring').length, 1)
  e.media.matches = true; e.emitir('media', 'change')
  e.document.hidden = false; e.emitir('document', 'visibilitychange'); artwork.render({ playing: false })
  assert.equal(e.animation.filter(item => item.kind === 'spring').length, 1)
  const latest = artwork.render()
  assert.equal(flatStyle(latest.props.style).transform[0].scale, .82)
  artwork.unmount()
  assert.equal(e.animation.at(-1).kind, 'cancel')
})

test('si no se puede leer Reducir movimiento se conserva la reproducción visual estática', async () => {
  const e = entorno('android', Promise.reject(new Error('Preferencia no disponible')))
  const disc = e.montar({ title: 'Tema', playing: true }, 'SongDisc')
  await Promise.resolve(); await Promise.resolve(); disc.render()
  assert.equal(e.animation.some(item => item.kind === 'repeat'), false)
  disc.unmount()
})
