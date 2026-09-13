import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
function load(path, imports = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  new Function('exports', 'require', code)(exports, id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id in imports) return imports[id]
    if (id === '@expo/ui/swift-ui') return new Proxy({}, { get: (_, key) => key })
    if (id === '@expo/ui/swift-ui/modifiers') return new Proxy({ shapes: { rectangle: () => 'rectangle' } }, { get: (o, key) => o[key] ?? ((...args) => ({ kind: key, args })) })
    throw Error(`Import sin simular: ${id}`)
  })
  return exports
}
function find(node, type) {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) return node.map(n => find(n, type)).find(Boolean)
  return node.type === type ? node : find(node.props?.children, type)
}

test('el transporte nativo permite pausar mientras carga y respeta las acciones bloqueadas', () => {
  const { IconButton } = load('src/ui/IconButton.ios.tsx', { 'react-native': { Platform: { Version: 26 } } })
  const calls = []
  const props = { label: 'Pausar', symbol: 'pause.fill', onPress: () => calls.push('pause'), busy: true, lado: 32 }
  const tree = IconButton(props)
  assert.equal(tree.props.style.width, 44, 'área mínima con controles compactos')
  assert.ok(find(tree, 'ProgressView'))
  find(tree, 'Button').props.onPress()
  assert.deepEqual(calls, ['pause'])
  assert.equal(find(IconButton({ ...props, disabled: true }), 'Button').props.onPress, undefined)
  assert.equal(find(IconButton({ ...props, disableWhileBusy: true }), 'Button').props.onPress, undefined)
})

test('los estilos iOS anteriores a Liquid Glass conservan el botón principal y su callback', () => {
  const { IconButton } = load('src/ui/IconButton.ios.tsx', { 'react-native': { Platform: { Version: 18 } } })
  let calls = 0
  const tree = IconButton({ label: 'Guardar', symbol: 'checkmark', selected: true, variant: 'primary', onPress: () => calls++ })
  const button = find(tree, 'Button')
  assert.equal(button.props.modifiers.find(m => m.kind === 'buttonStyle').args[0], 'borderedProminent')
  assert.deepEqual(button.props.modifiers.find(m => m.kind === 'accessibilityAddTraits').args[0], ['isSelected'])
  button.props.onPress()
  assert.equal(calls, 1)
})

test('la barra nativa conserva la navegación y el badge; ignora destinos desconocidos', () => {
  const calls = []
  const { TabPildora } = load('src/ui/TabBar.ios.tsx', {
    'react-native': { Platform: { Version: 26 }, useWindowDimensions: () => ({ fontScale: 1 }) },
    '../../modules/media-controls': { NativeMediaTabs: 'NativeTabs' },
    '../state/session': { usePendientesChats: () => 7 },
    './TabBar.shared': { useIrATab: () => id => calls.push(id), TabPildora: 'Fallback' },
  })
  const tabs = TabPildora({ active: 'perfil' })
  assert.equal(tabs.props.active, 'perfil')
  assert.equal(tabs.props.unread, 7)
  tabs.props.onSelect({ nativeEvent: { id: 'buscar' } })
  tabs.props.onSelect({ nativeEvent: { id: 'listas' } })
  tabs.props.onSelect({ nativeEvent: { id: 'unknown' } })
  assert.deepEqual(calls, ['buscar', 'listas'])
})

test('las filas nativas mantienen las acciones, el contexto y el estado real de carga', () => {
  const calls = []
  const { TrackRow } = load('src/ui/TrackRow.ios.tsx', {
    'react-native': { View: 'View', useWindowDimensions: () => ({ fontScale: 2 }) },
    '../../modules/media-controls': { NativeMediaRow: 'NativeRow' },
    '../state/playback': { usePlaybackCargada: () => false },
    './Menu': { MantenerApretado: 'Context' },
    './TrackRow.shared': { TrackRow: 'Fallback', ANCHO_DURACION: 64 },
  })
  const menu = [{ label: 'Compartir', onPress: () => calls.push('share') }]
  const trailing = jsx('Remove', { onPress: () => calls.push('remove') })
  const tree = TrackRow({ title: 'Tema', artist: 'Artista', artwork: 'https://cover', sounding: true, playing: true, onPlay: () => calls.push('pause'), trailing, menu })
  assert.equal(tree.type, 'Context')
  assert.equal(tree.props.items, menu)
  const row = find(tree, 'NativeRow')
  assert.equal(row.props.busy, true)
  assert.ok(row.props.style.height > 68, 'texto grande conserva espacio para dos líneas')
  row.props.onActivate()
  find(tree, 'Remove').props.onPress()
  assert.deepEqual(calls, ['pause', 'remove'])
})

test('el binario anterior conserva las filas y la navegación de respaldo', () => {
  const { TrackRow } = load('src/ui/TrackRow.ios.tsx', {
    'react-native': { useWindowDimensions: () => ({ fontScale: 1 }) },
    '../../modules/media-controls': { NativeMediaRow: null },
    '../state/playback': { usePlaybackCargada: () => true }, './Menu': {},
    './TrackRow.shared': { TrackRow: 'Fallback', ANCHO_DURACION: 64 },
  })
  const props = { title: 'Tema', onPlay() {} }
  assert.deepEqual(TrackRow(props), jsx('Fallback', props))
  const { TabPildora } = load('src/ui/TabBar.ios.tsx', {
    'react-native': { Platform: { Version: 26 }, useWindowDimensions: () => ({ fontScale: 1 }) },
    '../../modules/media-controls': { NativeMediaTabs: null },
    '../state/session': { usePendientesChats: () => 0 },
    './TabBar.shared': { useIrATab: () => () => {}, TabPildora: 'Fallback' },
  })
  assert.deepEqual(TabPildora({ active: 'inicio' }), jsx('Fallback', { active: 'inicio' }))
})

test('la superficie UIKit mantiene acciones y long press de selección con sus coordenadas; bloqueada no invoca ninguna', () => {
  const calls = []
  const { BotonSuperficie } = load('src/ui/BotonSuperficie.ios.tsx', {
    react: { useState: v => [v, () => {}], Children: { toArray: n => Array.isArray(n) ? n : [n] }, isValidElement: n => !!n && typeof n === 'object' && 'props' in n },
    'react-native': { View: 'View', Pressable: 'Fallback', StyleSheet: { absoluteFill: { position: 'absolute' } } },
    '../../modules/media-controls': { NativeSurface: 'NativeSurface' },
  })
  const content = jsx('Text', { children: 'Colección' })
  const props = { children: content, accessibilityRole: 'checkbox', accessibilityState: { checked: true },
    onPress: () => calls.push('activate'), onLongPress: e => calls.push([e.nativeEvent.pageX, e.nativeEvent.pageY]), delayLongPress: null }
  const tree = BotonSuperficie(props)
  const button = find(tree, 'NativeSurface')
  assert.equal(button.props.label, 'Colección')
  assert.equal(button.props.selected, true)
  assert.equal(button.props.controlRole, 'checkbox')
  assert.equal(button.props.longPressDelay, 500)
  const event = { nativeEvent: { pageX: 30, pageY: 60, locationX: 20, locationY: 15, timestamp: 0 } }
  button.props.onActivate(event)
  button.props.onLongActivate(event)
  assert.deepEqual(calls, ['activate', [30, 60]])
  const blocked = find(BotonSuperficie({ ...props, disabled: true }), 'NativeSurface')
  blocked.props.onActivate(event)
  blocked.props.onLongActivate(event)
  assert.equal(calls.length, 2)
})

test('un binario anterior con MediaControls no solicita la vista nueva de mini player', () => {
  for (const [capabilities, expected] of [[null, false], [{}, false], [{ miniPlayerVersion: 1 }, true]]) {
    const requested = []
    const bridge = load('modules/media-controls/index.ts', {
      'react-native': { Platform: { OS: 'ios' } },
      expo: {
        requireOptionalNativeModule: () => capabilities,
        requireNativeView: (module, name) => { requested.push(name); return name },
      },
    })
    assert.equal(bridge.NativeMiniPlayer, expected ? 'MediaMiniPlayerView' : null)
    assert.equal(requested.includes('MediaMiniPlayerView'), expected)
  }
})

test('las tabs dan espacio al sistema y al texto grande sin cambiar callbacks', () => {
  for (const [version, fontScale, height] of [[18, 1, 60], [26, 1, 72], [26, 2, 88]]) {
    const { TabPildora } = load('src/ui/TabBar.ios.tsx', {
      'react-native': { Platform: { Version: version }, useWindowDimensions: () => ({ fontScale }) },
      '../../modules/media-controls': { NativeMediaTabs: 'NativeTabs' },
      '../state/session': { usePendientesChats: () => 100 },
      './TabBar.shared': { useIrATab: () => () => {}, TabPildora: 'Fallback' },
    })
    assert.equal(TabPildora({ active: 'inicio' }).props.style.height, height)
  }
})

test('Swift registra todos los eventos de mini player y mantiene pausa disponible mientras carga', () => {
  const swift = readFileSync('modules/media-controls/ios/MediaMiniPlayerView.swift', 'utf8')
  const module = readFileSync('modules/media-controls/ios/MediaControlsModule.swift', 'utf8')
  for (const name of ['onOpen', 'onPlayPause', 'onNext', 'onPrevious', 'onDevices', 'onOptions']) {
    assert.ok(module.includes(`"${name}"`))
    assert.ok(swift.includes(`let ${name} = EventDispatcher()`))
  }
  assert.match(module, /Constant\("miniPlayerVersion"\) \{ 1 \}/)
  assert.match(swift, /Button\(action: model\.onPlayPause\)/)
  assert.doesNotMatch(swift, /\.disabled\(model\.busy\)/)
  assert.match(swift, /accessibilityLabel\(model\.remote \? "Traer música a este dispositivo" : model\.busy \? "Pausar carga"/)
  assert.equal(swift.includes('Sonando en '), false)
  assert.match(swift, /accessibilityValue\(model\.deviceLabel\)/)
  assert.match(swift, /\.disabled\(!model\.canNext\)/)
  assert.match(swift, /\.disabled\(!model\.canPrevious\)/)
  assert.match(swift, /if #available\(iOS 26\.0, \*\), !reduceTransparency/)
  assert.match(swift, /controls\.glassEffect\(\.regular/)
  assert.match(swift, /if reduceMotion \{ transaction\.animation = nil \}/)
  assert.match(swift, /guard !Task\.isCancelled, let data/)
  assert.match(swift, /if url\.isFileURL/)
})
