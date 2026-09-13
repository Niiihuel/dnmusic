import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function fixture(os = 'web') {
  const states = [], modules = new Map()
  let cursor = 0
  const jsx = (type, props) => ({ type, props })
  const generic = id => { if (!modules.has(id)) modules.set(id, new Proxy({}, { get: (_t, key) => String(key) })); return modules.get(id) }
  const output = ts.transpileModule(readFileSync('src/ui/EstudioPerfil.tsx','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}
  new Function('exports', 'require', output)(exports, id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === 'react') return {
      memo: v => v, useMemo: fn => fn(), useDeferredValue: v => v,
      useState(value) { const i=cursor++; if (!(i in states)) states[i]=value; return [states[i], v => states[i]=typeof v==='function'?v(states[i]):v] },
      useRef(value) { const i=cursor++; return states[i]??={current:value} },
    }
    if (id === 'react-native') return { ...generic(id), View:'View', Pressable:'Pressable', Text:'Text', FlatList:'FlatList', ScrollView:'ScrollView', StyleSheet:{ create:v=>v }, Platform:{OS:os} }
    if (id === '../services/discordCatalogo') return { useCatalogoDiscord: () => ({ catalogo:{ piezas:[], paquetes:[], colecciones:[], actualizado:'2026-09-01' } }) }
    if (id === '../services/decoraciones') return { useDecoraciones:()=>[], esDecoracionPropia:()=>false }
    if (id === './Marco') return { MARCOS:[], Marco:'Marco' }
    if (id === './EfectosDibujados') return { EFECTOS:[] }
    if (id === './Placas') return { PLACAS:[], PlacaDeNombre:'PlacaDeNombre' }
    return generic(id)
  })
  const original = {userId:'u',username:'ana',displayName:'Ana',fuente:null,marco:null,efecto:null,placa:null,marcoPerfil:null,tema:null}
  const draft = {...original,bio:'Borrador',fuente:'mono',marco:'discord:nuevo'}
  function flatten(n) {
    if (!n || typeof n!=='object') return []
    if (Array.isArray(n)) return n.flatMap(flatten)
    return [n,...Object.values(n.props??{}).flatMap(flatten)]
  }
  const render = () => { cursor=0; return flatten(exports.EstudioPerfil({perfil:draft,perfilOriginal:original,estilo:exports.estiloDelPerfil(draft),onCambiar(){}})) }
  const label=(ui,name)=>ui.find(n=>n.props?.accessibilityLabel===name || n.props?.label===name)
  const setWidth=width=>render().find(n=>n.props?.onLayout).props.onLayout({nativeEvent:{layout:{width}}})
  return {render,label,setWidth,original,draft}
}

test('PC: plegar la previa libera ancho para catálogo y volver a abrir conserva selección', () => {
  const f=fixture();f.setWidth(1120)
  let ui=f.render()
  const cols=ui.find(n=>n.type==='FlatList').props.numColumns
  assert.ok(ui.some(n=>n.type==='FondoEstiloPerfil'))
  f.label(ui,'Ocultar vista previa').props.onPress()
  ui=f.render()
  assert.equal(ui.some(n=>n.type==='FondoEstiloPerfil'),false)
  assert.ok(ui.find(n=>n.type==='FlatList').props.numColumns>cols)
  f.label(ui,'Mostrar vista previa').props.onPress()
  ui=f.render()
  assert.equal(ui.find(n=>n.type==='FondoEstiloPerfil').props.perfil.marco,'discord:nuevo')
})

test('teléfono: catálogo y vista previa son pasos separados con regreso sin guardar', () => {
  const f=fixture();f.setWidth(390)
  let ui=f.render()
  assert.ok(ui.some(n=>n.type==='FlatList'))
  assert.equal(ui.some(n=>n.type==='FondoEstiloPerfil'),false)
  f.label(ui,'Ver vista previa del perfil').props.onPress();ui=f.render()
  assert.equal(ui.some(n=>n.type==='FlatList'),false)
  assert.ok(ui.some(n=>n.type==='FondoEstiloPerfil'))
  ui.find(n=>n.type==='BotonHoja'&&n.props.label==='Volver al catálogo').props.onPress()
  assert.ok(f.render().some(n=>n.type==='FlatList'))
})

test('comparar original usa lo guardado y nunca la mezcla del borrador', () => {
  const f=fixture();f.setWidth(1120)
  const ui=f.render()
  const menu=ui.find(n=>n.props?.label==='Opciones de vista previa').props
  menu.items.find(i=>i.label==='Ver original').onPress()
  assert.equal(f.render().find(n=>n.type==='FondoEstiloPerfil').props.perfil,f.original)
})


test('iOS: filtros fijos y catálogo opaco no dejan pasar filas ni ajustan dos veces el inset', () => {
  const f = fixture('ios'); f.setWidth(390)
  let ui = f.render()
  const filtros = ui.find(n => n.props?.testID === 'filtros-catalogo-perfil')
  const catalogo = ui.find(n => n.props?.testID === 'catalogo-perfil')
  const lista = ui.find(n => n.type === 'FlatList')
  assert.equal(filtros.props.style.flexShrink, 0)
  assert.equal(catalogo.props.style.overflow, 'hidden')
  assert.equal(lista.props.style.backgroundColor, filtros.props.style.backgroundColor)
  assert.equal(lista.props.contentInsetAdjustmentBehavior, 'never')
  assert.equal(lista.props.automaticallyAdjustContentInsets, false)
  assert.equal(lista.props.removeClippedSubviews, false)
  f.label(ui, 'Ver vista previa del perfil').props.onPress(); ui = f.render()
  const previa = ui.find(n => n.type === 'ScrollArea')
  assert.equal(previa.props.contentInsetAdjustmentBehavior, 'never')
  assert.ok(previa.props.contentContainerStyle.paddingBottom >= 20)
})
