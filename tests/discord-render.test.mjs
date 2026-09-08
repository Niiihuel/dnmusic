import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

function cargar(path, dependencias = {}, globals = {}) {
  const source = readFileSync(path, 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  } }).outputText
  const exports = {}
  vm.runInNewContext(output, { exports, require: id => {
    if (id in dependencias) return dependencias[id]
    throw new Error(`Dependencia inesperada: ${id}`)
  }, setTimeout, clearTimeout, ...globals }, { filename: path })
  return exports
}
const helper = cargar('src/ui/DiscordCosmeticos.helpers.ts')
const intro = { src: 'intro.png', loop: false, start: 0, duration: 2573, loopDelay: 0, zIndex: 100 }
const idle = { src: 'idle.png', loop: true, start: 5146, duration: 2000, loopDelay: 4000, zIndex: 101 }
const plano = value => JSON.parse(JSON.stringify(value))

test('respeta entrada, pausa, idle, loopDelay y reinicio de APNG por ciclo', () => {
  for (const [tiempo, visibles, siguiente] of [
    [0, [{ index: 0, ciclo: 0 }], 2573], [2572, [{ index: 0, ciclo: 0 }], 2573],
    [2573, [], 5146], [5145, [], 5146], [5146, [{ index: 1, ciclo: 0 }], 7146],
    [7146, [], 11146], [11146, [{ index: 1, ciclo: 1 }], 13146],
  ]) {
    const actual = helper.fasesDiscord([intro, idle], tiempo)
    assert.deepEqual(plano(actual.visibles), visibles, `fase en ${tiempo} ms`)
    assert.equal(actual.siguiente, siguiente)
  }
  assert.equal(helper.fasesDiscord([intro], 2573).siguiente, Infinity)
})

test('sin demora entre loops reinicia la capa y no reproduce entradas terminadas', () => {
  assert.deepEqual(plano(helper.fasesDiscord([{ ...idle, start: 0, loopDelay: 0 }], 2000).visibles), [{ index: 0, ciclo: 1 }])
  assert.deepEqual(plano(helper.fasesDiscord([{ ...intro, duration: 0 }, { ...intro, duration: NaN }], 0).visibles), [])
})

test('un solo timer sirve para múltiples perfiles; el último desmontaje lo elimina', () => {
  let tiempo = 0, contador = 0
  const pendientes = new Map(), a = [], b = []
  const reloj = helper.crearRelojDiscord(() => tiempo, (fn, ms) => {
    const id = ++contador; pendientes.set(id, { fn, ms }); return id
  }, id => pendientes.delete(id))
  const salirA = reloj.suscribir([intro, idle], fases => a.push(plano(fases)))
  tiempo = 100
  const salirB = reloj.suscribir([intro], fases => b.push(plano(fases)))
  assert.equal(pendientes.size, 1)
  assert.equal([...pendientes.values()][0].ms, 2473)
  tiempo = 2573
  const callback = [...pendientes.values()][0].fn
  pendientes.clear(); callback()
  assert.deepEqual(a.at(-1), [])
  assert.deepEqual(b.at(-1), [{ index: 0, ciclo: 0 }])
  assert.equal([...pendientes.values()][0].ms, 100)
  salirA(); salirB()
  assert.equal(pendientes.size, 0)
})

test('una galería sin suscriptores y un efecto terminado no mantienen timers', () => {
  let tiempo = 0, callback, programados = 0
  const reloj = helper.crearRelojDiscord(() => tiempo, fn => { callback = fn; programados++; return 1 }, () => {})
  assert.equal(programados, 0)
  const salir = reloj.suscribir([intro], () => {})
  assert.equal(programados, 1)
  tiempo = intro.duration; callback()
  assert.equal(programados, 1)
  salir()
})

const marco = { innerWidth: 1200, overflowTop: 211, overflowBottom: 186, overflowHorizontal: 56 }
const capa = { id: '1515086606665646213', type: 'staple', order: 'front', anchor: 'top', responsive: false }
test('staples mantienen proporciones naturales y overflow del catálogo al cambiar ancho/alto', () => {
  const imagen = { width: 1312, height: 623 }
  const g = helper.geometriaCapaDiscord(marco, capa, 300, 500, imagen)
  assert.deepEqual(plano(g), { left: -14, top: -52.75, width: 328, height: 155.75, repetir: 1, recortar: false })
  const doble = helper.geometriaCapaDiscord(marco, capa, 600, 700, imagen)
  assert.equal(doble.width / doble.height, 1312 / 623)
  assert.equal(doble.height, g.height * 2)
  const abajo = helper.geometriaCapaDiscord(marco, { ...capa, anchor: 'bottom' }, 300, 500, { width: 1312, height: 398 })
  assert.equal(abajo.top + abajo.height, 500 + 186 / 4)
})

test('border repite y recorta; rail se centra sin estirar y respeta responsive', () => {
  const imagen = { width: 1312, height: 2270 }
  const border = helper.geometriaCapaDiscord(marco, { ...capa, type: 'border', anchor: 'center' }, 300, 1500, imagen)
  assert.equal(border.height, 567.5)
  assert.equal(border.repetir, 4)
  assert.equal(border.recortar, true)
  const rail = { ...capa, type: 'rail', anchor: 'center', responsive: true }
  assert.equal(helper.geometriaCapaDiscord(marco, rail, 300, 480, imagen), null)
  const g = helper.geometriaCapaDiscord(marco, rail, 300, 600, imagen)
  assert.equal(g.top, (600 - 567.5) / 2)
  assert.equal(g.repetir, 1)
  assert.equal(helper.geometriaCapaDiscord({}, rail, 300, 600, imagen), null)
  assert.equal(helper.geometriaCapaDiscord(marco, { ...capa, type: 'unknown' }, 300, 600, imagen), null)
})

test('las URLs usan endpoints públicos verificados y PNG realmente estático para web', () => {
  assert.equal(helper.urlCapaDiscord('discord:1511834130294247555', capa.id),
    'https://cdn.discordapp.com/media/v1/collectibles-shop/1511834130294247555/1515086606665646213/static')
  assert.equal(helper.urlCapaDiscord('discord:../bad', capa.id), undefined)
  const avatar = helper.urlsAvatarDiscord('a_33656b7ed12cde00c1826b654cf65590', 96)
  assert.equal(avatar.animada, 'https://cdn.discordapp.com/avatar-decoration-presets/a_33656b7ed12cde00c1826b654cf65590.png?size=256')
  assert.ok(avatar.estatica.endsWith('&passthrough=false'))
  assert.equal(helper.urlsAvatarDiscord('invalid', 96), null)
  assert.equal(helper.urlsPlacaDiscord('nameplates/../'), null)
  assert.equal(helper.urlsPlacaDiscord('nameplates/gothica/nevermore/').animada,
    'https://cdn.discordapp.com/assets/collectibles/nameplates/gothica/nevermore/asset.webm')
})

test('posiciones y tamaños del efecto comparten escala; no se ajusta cada capa por separado', () => {
  const efectos = [{ ...intro, width: 450, height: 880 }, { ...idle, width: 80, height: 90, position: { x: 150, y: 200 } }]
  assert.equal(helper.lienzoEfectosDiscord(efectos, 300), 2 / 3)
})

const fixtures = {
  avatar: { id: 'discord:1287835633485877369', tipo: 'marco', asset: 'a_33656b7ed12cde00c1826b654cf65590' },
  efecto: { id: 'discord:1158572178179108968', tipo: 'efecto', reducedMotionSrc: 'https://cdn.discordapp.com/quiet.png', efectos: [intro, idle] },
  placa: { id: 'discord:1541533896326512781', tipo: 'placa', asset: 'nameplates/angry/1541533896326512781/' },
  marco: { id: 'discord:1511834130294247555', tipo: 'marcoPerfil', capas: [capa, { ...capa, id: '1515086611896078477', order: 'back', anchor: 'bottom' }], ...marco },
}
const flatten = s => Array.isArray(s) ? Object.assign({}, ...s.map(flatten)) : s
const native = {
  Platform: { OS: 'ios' }, AppState: { currentState: 'active' }, AccessibilityInfo: {},
  StyleSheet: { absoluteFill: { position: 'absolute', top: 0, left: 0, bottom: 0, right: 0 } },
  View: ({ pointerEvents, style, children }) => React.createElement('div', { style: flatten(style), 'data-pointer-events': pointerEvents }, children),
}
const imagen = React.forwardRef(({ source, style, pointerEvents, contentFit }, _ref) =>
  React.createElement('img', { src: source.uri, style: flatten(style), 'data-pointer-events': pointerEvents, 'data-fit': contentFit, alt: '' }))
imagen.displayName = 'ImagenPruebaDiscord'
const dependencias = {
  react: React, 'react/jsx-runtime': await import('react/jsx-runtime'), 'react-native': native,
  'expo-linear-gradient': { LinearGradient: () => React.createElement('div', { 'data-gradient': true }) },
  'expo-image': { Image: imagen }, 'expo-video': { useVideoPlayer: () => { throw new Error('Un preview quieto no debe crear un player') } },
  '../services/discordCatalogo': { usePiezaDiscord: id => fixtures[id] ?? null }, './DiscordCosmeticos.helpers': helper,
}
const ui = cargar('src/ui/DiscordCosmeticos.tsx', dependencias)
const render = (componente, props) => renderToStaticMarkup(React.createElement(componente, props))

test('avatar 1.2× no captura clicks; efecto quieto usa reducedMotionSrc sin montar secuencia', () => {
  const avatar = render(ui.DiscordAvatar, { id: 'avatar', size: 100, animado: false })
  assert.match(avatar, /width:120px;height:120px;left:-10px;top:-10px/)
  assert.match(avatar, /passthrough=false/)
  assert.match(avatar, /data-pointer-events="none"/)
  const efecto = render(ui.DiscordEfecto, { id: 'efecto', animado: false })
  assert.match(efecto, /quiet.png/)
  assert.doesNotMatch(efecto, /intro.png|idle.png/)
})

test('placa y marco preservan controles hijos; IDs ausentes no agregan envolturas', () => {
  const children = React.createElement('button', { type: 'button' }, 'Editar')
  const placa = render(ui.DiscordPlaca, { id: 'placa', children })
  assert.match(placa, /static.png/)
  assert.match(placa, /<button type="button">Editar<\/button>/)
  assert.doesNotMatch(placa, /disabled|<video/)
  const frame = render(ui.DiscordMarcoPerfil, { id: 'marco', children })
  assert.match(frame, /z-index:0/); assert.match(frame, /z-index:1/); assert.match(frame, /z-index:2/)
  assert.match(frame, /collectibles-shop\/1511834130294247555\/1515086606665646213\/static/)
  assert.equal(render(ui.DiscordMarcoPerfil, { id: 'unknown', children }), '<button type="button">Editar</button>')
  assert.equal(render(ui.DiscordAvatar, { id: 'unknown', size: 40 }), '')
})

test('la placa es una franja adaptable con aire para el texto, incluso con nombres cortos', () => {
  for (const nombre of ['N', 'Nihuel', 'Un nombre de perfil bastante largo']) {
    const html = render(ui.DiscordPlaca, { id: 'placa', children: nombre })
    assert.match(html, /width:320px;max-width:100%;min-width:0;min-height:72px/)
    assert.match(html, /padding-horizontal:14px/)
    assert.match(html, /data-fit="cover"/, 'el fondo cubre ambas líneas sin deformarse')
  }
  const mini = render(ui.DiscordPlaca, { id: 'placa', compacta: true, children: 'N' })
  assert.match(mini, /min-height:24px/, 'la galería no hereda la altura del perfil')
})

test('preferencias y AppState se comparten; background detiene movimiento y se limpian listeners', async () => {
  const callbacks = {}, salidas = []
  let agregados = 0, eliminados = 0, resolver
  const bus = {
    currentState: 'active',
    addEventListener: (name, fn) => { agregados++; callbacks[name] = fn; return { remove: () => eliminados++ } },
    isReduceMotionEnabled: () => new Promise(resolve => { resolver = resolve }),
  }
  const reactHooks = { ...React,
    useSyncExternalStore: (subscribe, snapshot) => { salidas.push(subscribe(() => {})); return snapshot() },
  }
  const modulo = cargar('src/ui/DiscordCosmeticos.tsx', {
    ...dependencias, react: reactHooks, 'react-native': { ...native, AppState: bus, AccessibilityInfo: bus },
  })
  modulo.DiscordAvatar({ id: 'avatar', size: 100 })
  modulo.DiscordAvatar({ id: 'avatar', size: 40 })
  assert.equal(agregados, 2)
  resolver(false); await Promise.resolve()
  const arbol = modulo.DiscordAvatar({ id: 'avatar', size: 100 })
  assert.equal(arbol.props.children.props.animado, true)
  callbacks.change('background')
  assert.equal(modulo.DiscordAvatar({ id: 'avatar', size: 100 }).props.children.props.animado, false)
  callbacks.change('active'); callbacks.reduceMotionChanged(true)
  assert.equal(modulo.DiscordAvatar({ id: 'avatar', size: 100 }).props.children.props.animado, false)
  salidas.forEach(fn => fn())
  assert.equal(eliminados, 2)
})

test('disponible=false no dibuja ni monta reproductores y conserva el contenido', () => {
  fixtures.noDisponible = { ...fixtures.placa, disponible: false }
  assert.equal(render(ui.DiscordPlaca, { id: 'noDisponible', children: 'Nombre' }), 'Nombre')
  fixtures.noDisponible = { ...fixtures.avatar, disponible: false }
  assert.equal(render(ui.DiscordAvatar, { id: 'noDisponible', size: 80 }), '')
})

test('la placa animada pausa en layout cleanup antes de liberar el player nativo', () => {
  let setupPlayer, limpiar
  const eventos = []
  const player = { status: 'readyToPlay', play: () => eventos.push('play'), pause: () => eventos.push('pause'),
    addListener: () => ({ remove: () => eventos.push('remove') }) }
  const modulo = cargar('src/ui/DiscordCosmeticos.tsx', {
    ...dependencias,
    react: { ...React, useSyncExternalStore: () => true, useLayoutEffect: fn => { limpiar = fn() } },
    'react-native': { ...native, Platform: { OS: 'android' } },
    'expo-video': {
      useVideoPlayer: (_uri, setup) => { setup(player); setupPlayer = player; return player },
      VideoView: ({ contentFit }) => React.createElement('video', { 'data-decorative': 'true', 'data-fit': contentFit }),
    },
  })
  assert.match(render(modulo.DiscordPlaca, { id: 'placa', children: 'Nombre' }), /<video[^>]*data-fit="cover"/, 'vídeo y PNG comparten encuadre')
  assert.equal(setupPlayer.muted, true)
  assert.equal(setupPlayer.audioMixingMode, 'mixWithOthers')
  assert.equal(setupPlayer.loop, true)
  limpiar()
  assert.deepEqual(eventos, ['play', 'remove', 'pause'])
})

test('iOS conserva PNG incluso cuando el movimiento está permitido', () => {
  const modulo = cargar('src/ui/DiscordCosmeticos.tsx', {
    ...dependencias, react: { ...React, useSyncExternalStore: () => true },
  })
  const html = render(modulo.DiscordPlaca, { id: 'placa', children: 'Nombre' })
  assert.match(html, /static.png/)
  assert.doesNotMatch(html, /<video/)
})

test('el callback de error permite señalar un asset fallido sin tapar los controles', () => {
  const callbacks = []
  const modulo = cargar('src/ui/DiscordCosmeticos.tsx', {
    ...dependencias,
    'expo-image': { Image: React.forwardRef(function ImagenConError({ onError }, _ref) {
      callbacks.push(onError)
      return null
    }) },
  })
  let errores = 0
  const html = render(modulo.DiscordAvatar, { id: 'avatar', size: 80, onError: () => errores++ })
  assert.match(html, /data-pointer-events="none"/)
  callbacks[0]({ error: 'CDN unavailable' })
  assert.equal(errores, 1)
})


test('placas conservan su paleta original; none/desconocida no inventan colores', () => {
  assert.deepEqual(plano(helper.gradientePlacaDiscord('crimson')), ['#9000071A', '#90000766'])
  assert.equal(helper.gradientePlacaDiscord('none'), undefined)
  assert.equal(helper.gradientePlacaDiscord('unknown'), undefined)
  fixtures.placa.palette = 'crimson'
  assert.match(render(ui.DiscordPlaca, { id: 'placa', children: 'Nombre' }), /data-gradient/)
})

test('hover false → true → false cambia URL avatar y monta/desmonta vídeo de placa', async () => {
  const salidas = []
  const bus = {
    currentState: 'active',
    addEventListener: () => ({ remove() {} }),
    isReduceMotionEnabled: () => Promise.resolve(false),
  }
  const modulo = cargar('src/ui/DiscordCosmeticos.tsx', {
    ...dependencias,
    react: { ...React, useSyncExternalStore: (subscribe, snapshot) => {
      salidas.push(subscribe(() => {})); return snapshot()
    } },
    'react-native': { ...native, Platform: { OS: 'web' }, AppState: bus, AccessibilityInfo: bus },
    'expo-video': {
      useVideoPlayer: (_uri, setup) => { const player = {}; setup(player); return player },
      VideoView: () => React.createElement('video'),
    },
  })
  const avatar = animado => render(modulo.DiscordAvatar, { id: 'avatar', size: 80, animado })
  const placa = animado => render(modulo.DiscordPlaca, { id: 'placa', children: 'Nombre', animado })
  assert.match(avatar(false), /passthrough=false/)
  assert.doesNotMatch(placa(false), /<video/)
  avatar(true); await Promise.resolve()
  assert.doesNotMatch(avatar(true), /passthrough=false/)
  assert.match(placa(true), /<video/)
  assert.match(avatar(false), /passthrough=false/)
  assert.doesNotMatch(placa(false), /<video/)
  salidas.forEach(fn => fn())
})

test('salir del hover durante precarga cancela el arranque tardío de efectos', async () => {
  let resolver, limpiar, suscripciones = 0, salidas = 0
  const imagenConPrefetch = Object.assign(() => null, { prefetch: () => new Promise(resolve => { resolver = resolve }) })
  const modulo = cargar('src/ui/DiscordCosmeticos.tsx', {
    ...dependencias,
    react: { ...React, useSyncExternalStore: () => true,
      useState: valor => [valor && typeof valor === 'object' && 'width' in valor ? { width: 300, height: 320 } : valor, () => {}],
      useEffect: fn => { limpiar = fn() }, useCallback: fn => fn,
    },
    'expo-image': { Image: imagenConPrefetch },
    './DiscordCosmeticos.helpers': { ...helper, crearRelojDiscord: () => ({
      suscribir: () => { suscripciones++; return () => { salidas++ } },
    }) },
  })
  const overlay = modulo.DiscordEfecto({ id: 'efecto', animado: true })
  const secuencia = overlay.props.children
  secuencia.type(secuencia.props)
  limpiar(); resolver(true); await Promise.resolve()
  assert.equal(suscripciones, 0, 'la carga que terminó fuera del hover no arranca un timer')
  secuencia.type(secuencia.props)
  resolver(true); await Promise.resolve()
  assert.equal(suscripciones, 1, 'un nuevo hover inicia una secuencia nueva')
  limpiar()
  assert.equal(salidas, 1, 'salir elimina la suscripción al reloj')
})


test('expo-image web recibe alt vacío y nunca accessible=false para el img DOM', () => {
  const recibidas = []
  const ImageWeb = React.forwardRef((props, _ref) => { recibidas.push(props); return null })
  ImageWeb.displayName = 'ImageWebPrueba'
  const modulo = cargar('src/ui/DiscordCosmeticos.tsx', {
    ...dependencias, 'react-native': { ...native, Platform: { OS: 'web' } },
    'expo-image': { Image: ImageWeb },
  })
  render(modulo.DiscordAvatar, { id: 'avatar', size: 80, animado: false })
  assert.equal(recibidas.length, 1)
  assert.equal(recibidas[0].accessible, undefined)
  assert.equal(recibidas[0].accessibilityLabel, '')
  assert.equal(recibidas[0].pointerEvents, 'none')
})


test('la reserva se mide antes del catálogo tardío y conserva el nodo onLayout al llegar el marco', () => {
  let pieza = null, medidas = { width: 0, height: 0 }
  const modulo = cargar('src/ui/DiscordCosmeticos.tsx', {
    ...dependencias,
    react: { ...React, useState: () => [medidas, next => { medidas = typeof next === 'function' ? next(medidas) : next }], useCallback: fn => fn },
    '../services/discordCatalogo': { usePiezaDiscord: () => pieza },
  })
  const children = React.createElement('button', null, 'Editar')
  const pendiente = modulo.MarcoContenidoDiscord({ id: 'marco', children })
  assert.equal(pendiente.type, native.View)
  assert.equal(pendiente.props.children, children)
  pendiente.props.onLayout({ nativeEvent: { layout: { width: 320, height: 479 } } })
  pieza = { ...fixtures.marco, innerWidth: 1200, overflowHorizontal: 56, overflowTop: 304, overflowBottom: 212 }
  const cargado = modulo.MarcoContenidoDiscord({ id: 'marco', children })
  assert.equal(cargado.type, pendiente.type)
  assert.equal(cargado.props.testID, pendiente.props.testID)
  assert.equal(cargado.props.style.flexShrink, 0)
  const margen = cargado.props.children.props.style
  assert.ok(margen.paddingBottom > 51 && margen.paddingBottom < 52)
  const interior = 320 - margen.paddingHorizontal * 2
  const bottom = helper.geometriaCapaDiscord(pieza, { ...capa, anchor: 'bottom' }, interior, 479, { width: 1312, height: 424 })
  const borde = margen.paddingTop + bottom.top + bottom.height
  const siguiente = margen.paddingTop + 479 + margen.paddingBottom + 16
  assert.ok(Math.abs(siguiente - borde - 16) < 1e-10)
})
