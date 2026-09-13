import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const jsx = (type, props) => ({ type, props })
const modifiers = new Proxy({}, {get:(_,name)=>name==='shapes'?{rectangle:()=>({type:'rectangle'})}:value=>({type:name,value})})
function load(file, ios) {
 const source=readFileSync(file,'utf8')
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const exports={};const components=new Proxy({}, {get:(_,name)=>String(name)})
 new Function('exports','require',code)(exports,name=>{
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx}
  if(name==='react-native')return {Platform:{Version:ios},View:'View',Text:'RNText',ActivityIndicator:'ActivityIndicator'}
  if(name==='@expo/ui/swift-ui')return components
  if(name==='@expo/ui/swift-ui/modifiers')return modifiers
  if(name==='./Avatar')return {Avatar:'Avatar'}
  if(name==='./BotonSuperficie')return {BotonSuperficie:'BotonSuperficie'}
  if(name==='./IconButton')return {IconButton:'IconButton'}
  if(name==='./Glass')return {BotonVidrio:'BotonVidrio'}
  if(name==='./icons')return {ICON_COLOR:{},IconCheck:'Check',IconClose:'Close',IconNewConversation:'New'}
  throw Error(name)
 });return exports
}
function nodes(node,type){if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(n=>nodes(n,type));return[...(node.type===type?[node]:[]),...nodes(node.props?.children,type)]}
const native=load('src/ui/ContenidoChats.ios.tsx',26), desktop=load('src/ui/ContenidoChats.tsx')
const row={nombre:'Ana',avatarPath:'ana.jpg',detalle:'Canción compartida',fecha:'Hoy',noLeidos:115,selected:true}

test('fila SwiftUI abre la conversación una sola vez y VoiceOver conoce selección y no leídos reales',()=>{
 let selected=0;const tree=native.FilaConversacion({...row,onPress:()=>selected++})
 const buttons=nodes(tree,'Button');assert.equal(buttons.length,1);buttons[0].props.onPress();assert.equal(selected,1)
 const mods=buttons[0].props.modifiers
 assert.ok(mods.some(m=>m.type==='accessibilityAddTraits'&&m.value.includes('isSelected')))
 assert.match(mods.find(m=>m.type==='accessibilityLabel').value,/115 mensajes sin leer/)
 assert.ok(nodes(tree,'Text').some(t=>t.props.children==='99+'))
 assert.equal(nodes(tree,'RNText').length,0)
 assert.deepEqual(nodes(tree,'Host')[0].props.matchContents,{vertical:true})
})
test('fila sin mensajes pendientes no muestra contador ni se anuncia seleccionada',()=>{
 const tree=native.FilaConversacion({...row,noLeidos:0,selected:false,fecha:undefined,onPress(){}})
 assert.ok(!nodes(tree,'Button')[0].props.modifiers.some(m=>m.type==='accessibilityAddTraits'))
 assert.ok(!nodes(tree,'Text').some(t=>t.props.children==='99+'))
 assert.doesNotMatch(nodes(tree,'Button')[0].props.modifiers.find(m=>m.type==='accessibilityLabel').value,/sin leer/)
})
test('aceptar y rechazar mantienen callbacks independientes y objetivos táctiles de 44 puntos',()=>{
 const calls=[];const tree=native.FilaSolicitudChat({nombre:'Ana',etiqueta:'@ana',onAceptar:()=>calls.push(true),onRechazar:()=>calls.push(false)})
 const buttons=nodes(tree,'Button');assert.equal(buttons.length,2)
 buttons[0].props.onPress();buttons[1].props.onPress();assert.deepEqual(calls,[true,false])
 assert.match(buttons[0].props.modifiers.find(m=>m.type==='accessibilityLabel').value,/Aceptar.*@ana/)
 assert.match(buttons[1].props.modifiers.find(m=>m.type==='accessibilityLabel').value,/Rechazar.*@ana/)
 for(const image of nodes(tree,'Image'))assert.ok(image.props.modifiers.some(m=>m.type==='frame'&&m.value.minWidth>=44&&m.value.minHeight>=44))
})
test('cabecera usa vidrio disponible y el botón conserva nueva conversación',()=>{
 for(const version of [18,26]){
  const ui=load('src/ui/ContenidoChats.ios.tsx',version);let called=0
  const tree=ui.CabeceraChats({cantidad:2,techo:16,onNew:()=>called++}),button=nodes(tree,'Button')[0]
  button.props.onPress();assert.equal(called,1)
  assert.equal(button.props.modifiers.find(m=>m.type==='buttonStyle').value,version>=26?'glass':'bordered')
  assert.ok(nodes(tree,'Text').some(t=>t.props.modifiers.some(m=>m.type==='accessibilityAddTraits'&&m.value.includes('isHeader'))))
 }
})
test('escritorio conserva densidad, selección, datos y callbacks tras extraer las filas',()=>{
 let called=0;const tree=desktop.FilaConversacion({...row,compacto:true,onPress:()=>called++})
 assert.equal(nodes(tree,'Avatar')[0].props.size,36);tree.props.onPress();assert.equal(called,1)
 assert.equal(tree.props.accessibilityState.selected,true)
 const calls=[],requests=desktop.FilaSolicitudChat({nombre:'Ana',etiqueta:'ana',compacto:true,onAceptar:()=>calls.push('aceptar'),onRechazar:()=>calls.push('rechazar')})
 const actions=nodes(requests,'IconButton');actions.forEach(b=>b.props.onPress());assert.deepEqual(calls,['aceptar','rechazar']);assert.ok(actions.every(b=>b.props.lado===32))
})


test('las iniciales del avatar usan el nombre sin la arroba del título',()=>{
 for(const ui of [native,desktop]){
  const tree=ui.FilaConversacion({...row,nombre:'@ana',nombreAvatar:'ana',onPress(){}})
  assert.equal(nodes(tree,'Avatar')[0].props.name,'ana')
 }
})
