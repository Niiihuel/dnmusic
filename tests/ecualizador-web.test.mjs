import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync('src/ui/Ecualizador.web.tsx', 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText

function pantalla({ activo = true, cargado = true, soporte = 'disponible', remoto = null, jam = false, comparacion = null, personales = [] } = {}) {
  const calls = []
  const exports = {}
  const jsx = (type, props) => ({ type, props })
  const eq = {
    FRECUENCIAS_EQ: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
    GANANCIA_EQ_MIN: -12, GANANCIA_EQ_MAX: 12,
    PRESETS_EQ: { Plano: [], Graves: [], Vocal: [] },
    useEcualizador: () => ({ activo, cargado, preset: 'Vocal', presetPersonalId: null, presetsPersonales: personales, comparacion, ganancias: [0, 0.5, 0, 0, 0, 0, 0, 0, 0, 0] }),
    useSoporteEcualizador: () => soporte,
    nombrePresetEcualizador: state => state.preset,
    setGananciaEcualizador: (...args) => calls.push(['banda', ...args]),
    guardarEcualizadorAhora: () => calls.push(['guardar']),
    reintentarEcualizador: () => calls.push(['reintentar']),
    elegirPresetEcualizador: value => calls.push(['preset', value]),
    elegirPresetPersonalEcualizador: value => calls.push(['personal', value]),
    iniciarComparacionEcualizador: () => calls.push(['iniciar']),
    seleccionarComparacionEcualizador: value => calls.push(['escuchar', value]),
    usarComparacionEcualizador: () => calls.push(['usar']),
    cancelarComparacionEcualizador: () => calls.push(['descartar']),
  }
  new Function('exports', 'require', compiled)(exports, id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === 'react') return { useEffect: () => {}, useState: initial => [initial, () => {}] }
    if (id === '../state/ecualizador') return eq
    if (id === '../state/escucha') return { useEscuchaEspejoNombre: () => remoto }
    if (id === '../state/jam') return { useJamSilencioso: () => jam }
    if (id === '../state/shell') return { usePiso: () => 24 }
    if (id === 'expo-router') return { useRouter: () => ({}) }
    if (id === './ecualizadorGeometry') return {
      frecuenciaEQ: hz => `${hz} Hz`, decibeliosEQ: gain => `${gain} dB`,
    }
    return new Proxy({}, { get: (_target, name) => name })
  })
  const elements = []
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node || typeof node !== 'object') return
    elements.push(node)
    visit(node.props?.children)
  }
  visit(exports.default())
  return { elements, calls }
}

test('PC muestra diez sliders de ganancia con unidades, límites y teclado nativo', () => {
  const { elements, calls } = pantalla()
  const sliders = elements.filter(node => node.type === 'input' && node.props.type === 'range')
  assert.equal(sliders.length, 10)
  sliders.forEach(node => {
    assert.equal(node.props.type, 'range')
    assert.equal(node.props.min, -12)
    assert.equal(node.props.max, 12)
    assert.equal(node.props.step, 0.5)
    assert.match(node.props['aria-label'], /Ganancia de/)
    assert.match(node.props['aria-valuetext'], /dB$/)
  })
  sliders[1].props.onChange({ currentTarget: { valueAsNumber: 3.5 } })
  sliders[1].props.onPointerUp()
  assert.deepEqual(calls, [['banda', 1, 3.5], ['guardar']])
  assert.doesNotMatch(source, /SeekBar|elapsedMs|totalMs/)
})

test('apagado, carga, remoto, Jam y falta de soporte bloquean la edición', () => {
  for (const options of [{ activo: false }, { cargado: false }, { remoto: 'Mi PC' }, { jam: true }, { soporte: 'no-disponible' }, { soporte: 'error' }]) {
    const { elements, calls } = pantalla(options)
    assert.equal(elements.find(node => node.type === 'fieldset').props.disabled, true)
    const slider = elements.find(node => node.type === 'input' && node.props.type === 'range')
    slider.props.onChange({ currentTarget: { valueAsNumber: 6 } })
    assert.deepEqual(calls, [])
    const presets = elements.filter(node => node.type === 'button' && 'aria-pressed' in node.props)
    assert.ok(presets.every(node => node.props.disabled))
  }
})

test('preajustes y error tienen acciones explícitas sin perder la curva', () => {
  const normal = pantalla()
  const preset = normal.elements.find(node => node.type === 'button' && node.props.children === 'Vocal')
  assert.equal(preset.props['aria-pressed'], true)
  preset.props.onClick()
  assert.deepEqual(normal.calls, [['preset', 'Vocal']])
  const error = pantalla({ soporte: 'error' })
  const retry = error.elements.find(node => node.type === 'button' && node.props.children === 'Reintentar')
  assert.equal(retry.props.disabled, false)
  retry.props.onClick()
  assert.deepEqual(error.calls, [['reintentar']])
  assert.match(source, /addEventListener\('pagehide', guardar\)/)
  assert.match(source, /removeEventListener\('pagehide', guardar\)/)
})

test('PC muestra selección de preajustes personales y comparación A/B', () => {
  const personal = { id: 'eq-1', nombre: 'Mi sala', ganancias: Array(10).fill(0) }
  const normal = pantalla({ personales: [personal] })
  const boton = normal.elements.find(node => node.type === 'button' && node.props.children === 'Mi sala')
  boton.props.onClick()
  assert.deepEqual(normal.calls, [['personal', 'eq-1']])
  const iniciar = normal.elements.find(node => node.type === 'button' && node.props.children === 'Iniciar comparación')
  iniciar.props.onClick()
  assert.deepEqual(normal.calls.at(-1), ['iniciar'])

  const activo = pantalla({ comparacion: { seleccion: 'B' }, personales: [personal] })
  activo.elements.find(node => node.type === 'button' && node.props.children === 'Escuchar A').props.onClick()
  activo.elements.find(node => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.join('') === 'Usar curva B').props.onClick()
  assert.deepEqual(activo.calls, [['escuchar', 'A'], ['usar']])
  assert.equal(activo.elements.find(node => node.type === 'input' && node.props.type === 'text').props.disabled, true)
  assert.match(source, /visibilitychange/)
})
