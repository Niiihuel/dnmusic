import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node)
  ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
function component(path, platform = 'web') {
  let index = 0
  const states = [], exports = {}
  const icons = Object.fromEntries(['IconNext', 'IconPause', 'IconPlay', 'IconPrevious', 'IconVolume', 'IconVolumeOff', 'IconDisc', 'IconLyrics', 'IconUsers', 'IconCola'].map(name => [name, name]))
  const deps = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator', Platform: { OS: platform } },
    react: { useRef(value) { const key = index++; return states[key] ??= { current: value } } },
    './IconButton': { IconButton: 'IconButton' },
    './Transport': { BotonAleatorio: 'BotonAleatorio', BotonRepetir: 'BotonRepetir' },
    './AudioParameter': { AudioParameter: 'AudioParameter' },
    './icons': { ...icons, ICON_COLOR: { foreground: '#fff', muted: '#aaa', onPrimary: '#111' } },
  }
  new Function('exports', 'require', ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText)(exports, name => {
    assert.ok(name in deps, `Import inesperado: ${name}`)
    return deps[name]
  })
  return (name, props) => { index = 0; return exports[name](props) }
}
const byLabel = (ui, label) => nodes(ui).find(node => node.props?.label === label)

test('transporte en todas las plataformas conserva callbacks, modos y pausa durante buffering', () => {
  for (const platform of ['web', 'ios', 'android']) {
    const render = component('src/ui/ControlesTransporte.tsx', platform), calls = []
    const props = { reproduciendo: false, onAnterior: () => calls.push('previous'), onAlternar: () => calls.push('toggle'),
      onSiguiente: () => calls.push('next'), grande: true }
    let ui = render('ControlesTransporte', props)
    byLabel(ui, 'Anterior').props.onPress(); byLabel(ui, 'Reproducir').props.onPress(); byLabel(ui, 'Siguiente').props.onPress()
    assert.deepEqual(calls, ['previous', 'toggle', 'next'])
    assert.equal(nodes(ui).filter(node => node.type === 'BotonAleatorio' || node.type === 'BotonRepetir').length, 2)
    ui = render('ControlesTransporte', { ...props, cargando: true })
    const busy = byLabel(ui, 'Pausar carga')
    assert.equal(busy.props.busy, true)
    assert.equal(busy.props.disabled, undefined)
    busy.props.onPress()
    assert.equal(calls.at(-1), 'toggle')
    assert.equal(busy.props.icon.type, 'ActivityIndicator')
    ui = render('ControlesTransporte', { ...props, reproduciendo: true })
    assert.equal(byLabel(ui, 'Pausar').props.symbol, 'pause.fill')
    assert.equal(byLabel(ui, 'Pausar').props.lado, 64)
    ui = render('ControlesTransporte', { ...props, reproduciendo: true, remoto: true })
    assert.equal(byLabel(ui, 'Traer música a este dispositivo').props.symbol, 'play.fill')
    assert.equal(platform === 'web' ? ui.props.dataSet.audioState : ui.props.dataSet, platform === 'web' ? 'paused' : undefined)
  }
})

test('cola agotada y handlers ausentes deshabilitan navegación; compacto conserva play y saltos', () => {
  const render = component('src/ui/ControlesTransporte.tsx')
  let ui = render('ControlesTransporte', { reproduciendo: false, onAlternar() {}, onSiguiente() {}, sinSiguiente: true })
  assert.equal(byLabel(ui, 'Anterior').props.disabled, true)
  assert.equal(byLabel(ui, 'Siguiente').props.disabled, true)
  ui = render('ControlesTransporte', { reproduciendo: true, onAlternar() {}, onAnterior() {}, onSiguiente() {}, conModos: false })
  assert.equal(nodes(ui).some(node => node.type === 'BotonAleatorio' || node.type === 'BotonRepetir'), false)
  assert.equal(nodes(ui).filter(node => node.type === 'IconButton').length, 3)
  assert.equal(byLabel(ui, 'Pausar').props.lado, 40)
})

test('las vistas compartidas conservan etiquetas, estado seleccionado y acción en todas las plataformas', () => {
  const vistas = [
    ['disc', 'Ver el disco girando', 'opticaldisc', 'IconDisc'],
    ['lyrics', 'Ver la letra', 'quote.bubble', 'IconLyrics'],
    ['jam', 'Jam', 'person.2', 'IconUsers'],
    ['cola', 'Ver la cola', 'list.bullet', 'IconCola'],
  ]
  for (const plataforma of ['ios', 'android', 'web']) {
    const render = component('src/ui/ControlesTransporte.tsx', plataforma)
    for (const [vista, label, symbol, icono] of vistas) {
      let acciones = 0
      const props = { vista, label, active: true, onPress: () => acciones++ }
      const activo = render('BotonVistaAudio', props)
      assert.equal(activo.props.label, label)
      assert.equal(activo.props.symbol, symbol)
      assert.equal(activo.props.selected, true)
      assert.equal(activo.props.muted, false)
      assert.equal(activo.props.icon.type, icono)
      activo.props.onPress()
      assert.equal(acciones, 1)
      const inactivo = render('BotonVistaAudio', { ...props, active: false })
      assert.equal(inactivo.props.selected, false)
      assert.equal(inactivo.props.muted, true)
      assert.equal(inactivo.props.icon.props.color, '#aaa')
    }
  }
})

test('volumen exacto usa porcentaje y delega mute al estado compartido', () => {
  const render = component('src/ui/VolumenAudio.tsx'), changes = []
  let toggles = 0
  const props = { value: .37, onChange: value => changes.push(value), onToggleMute: () => toggles++ }
  let ui = render('VolumenAudio', props)
  const parameter = nodes(ui).find(node => node.type === 'AudioParameter')
  assert.equal(parameter.props.format(.37), '37 %')
  assert.equal(parameter.props.inputScale, .01)
  assert.equal(parameter.props.step, .01)
  parameter.props.onChange(.42)
  byLabel(ui, 'Silenciar').props.onPress()
  ui = render('VolumenAudio', { ...props, value: 0 })
  byLabel(ui, 'Devolver el sonido').props.onPress()
  assert.deepEqual(changes, [.42], 'el slider escribe el volumen; mute conserva la memoria en el estado')
  assert.equal(toggles, 2)
  const otraInstancia = component('src/ui/VolumenAudio.tsx')
  byLabel(otraInstancia('VolumenAudio', { ...props, value: 0, compact: true }), 'Devolver el sonido').props.onPress()
  assert.equal(toggles, 3, 'una instancia nueva delega a la misma acción')
})

test('volumen compacto conserva slider accessible dentro del mismo ancho; los valores inválidos no pasan al control', () => {
  const render = component('src/ui/VolumenAudio.tsx')
  const props = { value: .4, compact: true, angosto: true, onChange() {}, onToggleMute() {} }
  for (const value of [.4, 0, 1, NaN, Infinity]) {
    const ui = render('VolumenAudio', { ...props, value })
    const slider = nodes(ui).find(node => node.type === 'AudioParameter')
    assert.equal(slider.props.label, 'Volumen')
    assert.equal(slider.props.compact, true)
    assert.ok(Number.isFinite(slider.props.value))
    assert.equal(nodes(ui).find(node => node.props?.style?.width === 60).props.style.width, 60)
  }
})

test('volumen nativo de pantalla completa conserva porcentaje y un slider que cabe en móviles angostos', () => {
  const render = component('src/ui/VolumenAudio.tsx', 'android')
  const ui = render('VolumenAudio', { value: .37, onChange() {}, onToggleMute() {} })
  const slider = nodes(ui).find(node => node.type === 'AudioParameter')
  assert.equal(slider.props.compact, true)
  assert.equal(nodes(ui).find(node => node.type === 'Text').props.children, '37 %')
})
