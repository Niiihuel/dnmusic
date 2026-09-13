import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const code = ts.transpileModule(readFileSync('src/ui/SelectorDispositivos.ios.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const jsx = (type, props) => ({ type, props })
function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}
function fixture() {
  const state = { abierto: true, calls: [], panel: {
    resumen: 'En pausa en PC', detalle: 'Elegí dónde escuchar.', estado: 'pausado', remoto: true,
    pendiente: false, mensaje: null, error: false,
    filas: [
      { id: 'local', nombre: 'Este dispositivo', detalle: 'Disponible', estado: 'disponible', esEste: true, seleccionado: false, disabled: false, busy: false },
      { id: 'pc', nombre: 'PC', detalle: 'En pausa', estado: 'pausado', esEste: false, seleccionado: true, disabled: false, busy: false },
    ],
    elegir: id => state.calls.push(id),
  } }
  const exports = {}
  new Function('exports', 'require', code)(exports, id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === 'react-native') return { Modal: 'Modal' }
    if (id === '../state/escucha') return {
      useSelectorDispositivos: () => state.abierto,
      cerrarSelectorDispositivos: () => { state.abierto = false; state.calls.push('cerrar') },
    }
    if (id === './Dispositivos.shared') return { usePanelDispositivos: () => state.panel }
    if (id === './EncabezadoHoja') return { BotonHoja: 'BotonHoja', EncabezadoHoja: 'EncabezadoHoja' }
    if (id === './Hoja') return { Hoja: 'Hoja' }
    if (id === './ListaAgrupada') return { ListaAgrupada: 'ListaAgrupada' }
    assert.fail(`Import inesperado ${id}`)
  })
  const render = () => nodes(exports.SelectorDispositivos())
  return { state, render, list: () => render().find(node => node.type === 'ListaAgrupada').props,
    row: id => render().find(node => node.type === 'ListaAgrupada').props.secciones[0].filas.find(row => row.id === id) }
}

test('iOS presenta una hoja nativa viva y actualiza pausa, reproducción y nuevos dispositivos', () => {
  const f = fixture()
  assert.equal(f.render()[0].props.presentationStyle, 'formSheet')
  assert.equal(f.row('pc').symbol, 'pause.circle', 'ser seleccionado no significa sonar')
  assert.equal(f.row('pc').valor, 'Seleccionado')
  f.state.panel.filas[1] = { ...f.state.panel.filas[1], estado: 'sonando', detalle: 'Sonando ahora' }
  f.state.panel.filas.push({ id: 'tablet', nombre: 'Tablet', detalle: 'Disponible', estado: 'disponible', esEste: false })
  assert.equal(f.row('pc').symbol, 'waveform')
  assert.equal(f.row('tablet').rotulo, 'Tablet')
  assert.equal(f.list().secciones[0].filas.length, 3)
  f.state.panel.filas[1] = { ...f.state.panel.filas[1], estado: 'preparando', detalle: 'Preparando audio' }
  assert.equal(f.row('pc').symbol, 'hourglass')
  f.state.panel.filas[1] = { ...f.state.panel.filas[1], estado: 'desconectado', detalle: 'No disponible ahora', disabled: true }
  assert.equal(f.row('pc').symbol, 'wifi.slash')
  f.row('pc').onPress()
  assert.deepEqual(f.state.calls, [], 'un destino desconectado no acepta la acción')
})

test('elegir mantiene la hoja abierta para mostrar pendiente, error y confirmación', () => {
  const f = fixture()
  f.row('local').onPress()
  assert.deepEqual(f.state.calls, ['local'])
  assert.equal(f.state.abierto, true)
  f.state.panel = { ...f.state.panel, pendiente: true, mensaje: 'Esperando al iPhone' }
  f.state.panel.filas = f.state.panel.filas.map(row => ({ ...row, disabled: true, busy: row.esEste }))
  assert.equal(f.row('local').busy, true)
  f.row('pc').onPress()
  assert.deepEqual(f.state.calls, ['local'], 'no envía una segunda selección mientras espera')
  assert.equal(f.list().secciones[1].filas[0].valor, 'Conectando')
  f.state.panel = { ...f.state.panel, pendiente: false, error: true, mensaje: 'El dispositivo no respondió' }
  assert.equal(f.list().secciones[1].error, 'El dispositivo no respondió')
  assert.equal(f.list().secciones[1].filas[0].valor, 'No se pudo cambiar')
  assert.equal(f.state.abierto, true)
  f.state.panel = { ...f.state.panel, error: false, mensaje: 'Dispositivo cambiado' }
  assert.equal(f.list().secciones[1].filas[0].valor, 'Confirmado')
  assert.equal(f.state.abierto, true)
})

test('sin dispositivos conserva contexto y el gesto cierra sin transferir', () => {
  const f = fixture()
  f.state.panel = { ...f.state.panel, filas: [], resumen: 'Sin reproducción', detalle: 'Conectando con tus dispositivos…' }
  assert.equal(f.list().secciones[0].filas[0].valor, 'Ninguno disponible')
  assert.equal(f.list().secciones[0].pie, 'Conectando con tus dispositivos…')
  assert.equal(f.render().find(node => node.type === 'EncabezadoHoja').props.sobre, 'Sin reproducción')
  const modal = f.render()[0]
  assert.equal(modal.props.allowSwipeDismissal, true)
  modal.props.onRequestClose()
  assert.deepEqual(f.state.calls, ['cerrar'])
  assert.equal(f.render().length, 0)
})
