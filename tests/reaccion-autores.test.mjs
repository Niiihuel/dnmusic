import test from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { readFileSync } from 'node:fs'

function fixture(tactil=false) {
  const states=[],refs=[],calls=[];let cursor=0,ri=0
  const jsx=(type,props)=>({type,props})
  const output=ts.transpileModule(readFileSync('src/ui/AutoresReaccion.tsx','utf8'), { compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022} }).outputText
  const exports={}
  new Function('exports','require',output)(exports,id=>{
    if(id==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'}
    if(id==='react')return {useEffect(){},useRef(v){return refs[ri++]??= {current:v}},useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]}}
    if(id==='react-native')return {ActivityIndicator:'ActivityIndicator',Modal:'Modal',Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',View:'View',useWindowDimensions:()=>({width:tactil?390:1280,height:800})}
    if(id==='expo-router')return {useRouter:()=>({push:path=>calls.push(path)})}
    if(id==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({top:0,bottom:34})}
    if(id==='../lib/teclado')return {TECLADO_FISICO:!tactil}
    return new Proxy({}, {get:(_t,key)=>String(key)})
  })
  function flatten(n){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(flatten);return [n,...Object.values(n.props??{}).flatMap(flatten)]}
  const render=()=>{cursor=0;ri=0;return flatten(exports.AutoresReaccion({showcaseId:'piece',emoji:'🔥',cantidad:2,children:'🔥 2'}))}
  render();refs[0].current={measureInWindow:fn=>fn(1200,740,28,28)}
  return {render,calls}
}

test('hover o foco de PC abre los autores sin ejecutar ninguna acción musical',()=>{
  const f=fixture(),ui=f.render(),trigger=ui.find(n=>n.props?.accessibilityLabel?.startsWith('Ver quién'))
  trigger.props.onHoverIn()
  assert.equal(f.render().find(n=>n.type==='Modal').props.visible,true)
  assert.deepEqual(f.calls,[])
  const modal=f.render().find(n=>n.type==='Modal');modal.props.onRequestClose()
  assert.equal(f.render().find(n=>n.type==='Modal').props.visible,false)
  trigger.props.onFocus();assert.equal(f.render().find(n=>n.type==='Modal').props.visible,false, 'restaurar el foco al cerrar no reabre el modal')
  trigger.props.onFocus();assert.equal(f.render().find(n=>n.type==='Modal').props.visible,true)
})
test('en teléfono el toque detiene la propagación y muestra una hoja cerrable',()=>{
  const f=fixture(true),trigger=f.render().find(n=>n.props?.accessibilityLabel?.startsWith('Ver quién'))
  assert.equal(trigger.props.onHoverIn,undefined)
  let stopped=false;trigger.props.onPress({stopPropagation(){stopped=true}})
  assert.equal(stopped,true)
  assert.equal(f.render().find(n=>n.type==='Modal').props.visible,true)
  assert.ok(f.render().some(n=>n.props?.style?.justifyContent==='flex-end'))
  assert.deepEqual(f.calls,[])
})


test('el puente de hover conserva el detalle mientras el cursor llega al panel', async()=>{
  const f=fixture(),trigger=f.render().find(n=>n.props?.accessibilityLabel?.startsWith('Ver quién'))
  trigger.props.onHoverIn();trigger.props.onHoverOut()
  const bridge=f.render().find(n=>n.props?.importantForAccessibility==='no-hide-descendants')
  assert.ok(bridge);bridge.props.onPointerEnter()
  await new Promise(resolve=>setTimeout(resolve,250))
  assert.equal(f.render().find(n=>n.type==='Modal').props.visible,true)
  bridge.props.onPointerLeave()
  await new Promise(resolve=>setTimeout(resolve,250))
  assert.equal(f.render().find(n=>n.type==='Modal').props.visible,false)
})
