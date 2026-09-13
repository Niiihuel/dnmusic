import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const jsx=(type,props)=>({type,props})
function nodes(ui,predicate){if(!ui||typeof ui!=='object')return[];if(Array.isArray(ui))return ui.flatMap(n=>nodes(n,predicate));return [...(predicate(ui)?[ui]:[]),...nodes(ui.props?.children,predicate)]}
function fixture(){
 const calls=[]
 const panel={resumen:'En pausa en Computadora',detalle:'Elegí un destino',error:false,mensaje:null,filas:[{id:'ios',nombre:'iPhone',detalle:'Disponible',estado:'disponible',esEste:false,seleccionado:false,disabled:false,busy:false}],elegir:id=>calls.push(id)}
 const exports={}
 const imports={
  'react/jsx-runtime':{jsx,jsxs:jsx},
  'react-native':{Modal:'Modal',Pressable:'Pressable',View:'View',Text:'Text',ScrollView:'ScrollView',ActivityIndicator:'Busy',StyleSheet:{absoluteFill:{}},useWindowDimensions:()=>({height:900})},
  '../state/escucha':{useSelectorDispositivos:()=>true,cerrarSelectorDispositivos:()=>calls.push('close')},
  './Dispositivos.shared':{usePanelDispositivos:()=>panel},
 }
 new Function('exports','require',ts.transpileModule(readFileSync('src/ui/SelectorDispositivos.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText)(exports,k=>imports[k]??new Proxy({ICON_COLOR:{foreground:'white',muted:'gray'}},{get:(o,k)=>o[k]??k}))
 return{calls,panel,render:exports.SelectorDispositivos}
}
test('el selector PC espera confirmación visible; seleccionar no cierra ni declara éxito',()=>{
 const h=fixture();let ui=h.render()
 const elegir=nodes(ui,n=>n.type==='Pressable'&&n.props.accessibilityLabel==='iPhone. Disponible')[0]
 elegir.props.onPress();assert.deepEqual(h.calls,['ios'])
 h.panel.filas[0].busy=true;h.panel.filas[0].disabled=true;h.panel.mensaje='Esperando confirmación de iPhone…'
 ui=h.render();assert.equal(nodes(ui,n=>n.type==='Busy').length,1)
 assert.equal(nodes(ui,n=>n.type==='Pressable'&&n.props.disabled===true).length,1)
 assert.ok(nodes(ui,n=>n.props?.children===h.panel.mensaje).length)
 h.panel.error=true;h.panel.mensaje='El dispositivo no respondió';ui=h.render()
 assert.ok(nodes(ui,n=>n.props?.accessibilityRole==='alert').length)
 ui.props.onRequestClose();assert.deepEqual(h.calls,['ios','close'])
})
