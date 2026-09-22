import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const jsx = (type, props) => ({ type, props })
const flatten = n => Array.isArray(n) ? n.flatMap(flatten) : n && typeof n === 'object' ? [n, ...flatten(n.props?.children)] : []
const compile = path => ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
function load(path, modules) { const exports = {}; new Function('exports','require',compile(path))(exports,id=>{assert.ok(id in modules,id);return modules[id]});return exports }
const core = load('src/services/politicaActualizacion.ts', {})
const native = { View:'View',Text:'Text',Pressable:'Pressable',ActivityIndicator:'ActivityIndicator',Platform:{OS:'web'},Linking:{openURL:async()=>{}} }
const ajustes = Object.fromEntries(['GrupoAjustes','FilaDato','FilaAccion','FilaInterruptor','ListaAjustes'].map(k=>[k,k]))
const react = { useState: value=>[value,()=>{}],useEffect:()=>{} }
function fixture({ platform='web', installed={platform:'windows',version:'1.10.0'}, capability=true, state={fase:'inactivo',version:'1.10.0'}, policy=null }={}) {
 const actions=[],opened=[]
 const bridge={HAY_ACTUALIZADOR:capability,PUEDE_DESCARGAR_ACTUALIZACION:true,useActualizacion:()=>state,buscarActualizacion:()=>actions.push('buscar'),descargarActualizacion:()=>actions.push('descargar'),instalarActualizacion:()=>actions.push('instalar')}
 const modules={'react':react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{...native,Platform:{OS:platform},Linking:{openURL:async url=>opened.push(url)}},'expo-application':{nativeBuildVersion:'112'},
  '../services/instalacionActual':{obtenerInstalacion:async()=>installed},'../services/politicaActualizacion':core,
  '../state/politicaActualizacion':{usePoliticaActualizacion:()=>({instalacion:installed,politica:policy})},'../state/actualizacion':bridge,
  '../state/ajustes':{useAjustes:()=>({avisosActualizacion:true}),setPreferencia:(...a)=>actions.push(a)},'./Ajustes':ajustes,'./Actualizador':{Actualizador:'Actualizador'},
  './icons':{ICON_COLOR:{},IconCheck:'check',IconDownload:'download',IconSparkles:'sparkles'}}
 const api=load('src/ui/AjustesActualizaciones.tsx',modules), actualizador=load('src/ui/Actualizador.tsx',modules)
 return {api,bridge,actions,opened,render:()=>flatten(api.AjustesActualizaciones()),renderUpdater:()=>flatten(actualizador.Actualizador())}
}

test('versión instalada es la del binario, sin sustituirla por la versión publicada',()=>{
 const f=fixture({platform:'ios',installed:{platform:'ios',version:'1.10.0'},capability:false,policy:{enabled:true,platform:'ios',latest_version:'9.9.9',update_url:'https://testflight.apple.com/join/Ab123'}})
 const ui=f.render()
 assert.equal(ui.find(n=>n.props?.rotulo==='Versión instalada').props.valor,'1.10.0')
 assert.equal(ui.find(n=>n.props?.rotulo==='Compilación').props.valor,'112')
 assert.equal(ui.some(n=>n.type==='Actualizador'),false)
 assert.ok(!JSON.stringify(ui).includes('9.9.9'))
 assert.ok(ui.some(n=>n.props?.pie?.includes('Si instalaste DMusic con TestFlight')))
 assert.equal(f.actions.length,0,'Abrir ajustes no descarga ni publica políticas')
 ui.find(n=>n.props?.rotulo==='Abrir enlace de TestFlight').props.onPress()
 assert.deepEqual(f.opened,['https://testflight.apple.com/join/Ab123'])
})

test('sin versión identificada muestra consulta, nunca afirma estar al día',()=>{
 const ui=fixture({installed:null,capability:false}).render()
 assert.equal(ui.find(n=>n.props?.rotulo==='Versión cargada').props.valor,'Consultando…')
 assert.ok(!JSON.stringify(ui).includes('al día'))
})

test('escritorio ofrece sólo acciones de actualización válidas para el estado y capacidades',()=>{
 for(const [state,expected] of [[{fase:'inactivo',version:'1.10.0'},'buscar'],[{fase:'error',mensaje:'offline'},'buscar'],[{fase:'esperando-silencio',version:'1.11.0',notas:null},'descargar'],[{fase:'lista',version:'1.11.0',notas:null},'instalar']]){
  const f=fixture({state}),ui=f.renderUpdater()
  const action=ui.find(n=>n.type==='Pressable')
  assert.ok(action);action.props.onPress();assert.deepEqual(f.actions,[expected])
  if(state.fase==='inactivo')assert.ok(!JSON.stringify(ui).includes('al día'))
 }
 for(const state of [{fase:'buscando'},{fase:'bajando',version:'1.11.0',porcentaje:50,bajados:1,total:2,notas:null},{fase:'apagado',motivo:'se actualiza manualmente'}])assert.equal(fixture({state}).renderUpdater().some(n=>n.type==='Pressable'),false)
 const old=fixture({state:{fase:'esperando-silencio',version:'1.11.0',notas:null}});old.bridge.PUEDE_DESCARGAR_ACTUALIZACION=false
 assert.equal(old.renderUpdater().some(n=>n.type==='Pressable'),false)
})

test('instalador manual tiene destino real; iOS/web sin capacidad no inventan un actualizador',()=>{
 const pc=fixture({state:{fase:'apagado',motivo:'se actualiza manualmente'}})
 pc.render().find(n=>n.props?.rotulo==='Ver descargas de DMusic').props.onPress()
 assert.deepEqual(pc.opened,['https://github.com/Niihuel/dnmusic-releases/releases/latest'])
 const ios=fixture({platform:'ios',installed:{platform:'ios',version:'1.10.0'},capability:false})
 assert.equal(ios.render().filter(n=>n.type==='FilaAccion').length,0)
 assert.equal(ios.api.orientacionActualizacion('ios','https://example.com/peligro').destino,null)
 assert.equal(ios.api.orientacionActualizacion('ios','https://github.com/Niihuel/dnmusic-releases/releases/latest').destino,null)
 assert.equal(ios.api.orientacionActualizacion('web').destino,null)
})

test('ruta de compatibilidad no monta el editor ni consulta políticas sin administrador',()=>{
 let admin=false,user={id:'user'}
 const modules={'react/jsx-runtime':{jsx,jsxs:jsx},'expo-router':{useRouter:()=>({})},'react-native-safe-area-context':{SafeAreaView:'safe'},
 '../../src/state/session':{useAuthUser:()=>user,useIsAccessAdmin:()=>admin},'../../src/state/shell':{usePiso:()=>24},'../../src/lib/volver':{volver(){}},
 '../../src/ui/AdministrarActualizaciones':{AdministrarActualizaciones:'AdminEditor'},'../../src/ui/BotonVolver':{BotonVolver:'Back'},'../../src/ui/EncabezadoHoja':{EncabezadoHoja:'Header'},'../../src/ui/Ajustes':ajustes}
 const api=load('app/ajustes/compatibilidad.tsx',modules)
 assert.equal(flatten(api.default()).some(n=>n.type==='AdminEditor'),false)
 admin=true
 assert.equal(flatten(api.default()).some(n=>n.type==='AdminEditor'),true)
 user=null
 assert.equal(flatten(api.default()).some(n=>n.type==='AdminEditor'),false)
})
