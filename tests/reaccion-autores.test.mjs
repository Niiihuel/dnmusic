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
  trigger.props.onPointerEnter()
  assert.equal(f.render().find(n=>n.type==='CapaAutores').props.visible,true)
  assert.deepEqual(f.calls,[])
  const modal=f.render().find(n=>n.type==='CapaAutores');modal.props.onRequestClose()
  assert.equal(f.render().find(n=>n.type==='CapaAutores').props.visible,false)
  trigger.props.onFocus();assert.equal(f.render().find(n=>n.type==='CapaAutores').props.visible,true)
})
test('en teléfono el toque detiene la propagación y muestra una hoja cerrable',()=>{
  const f=fixture(true),trigger=f.render().find(n=>n.props?.accessibilityLabel?.startsWith('Ver quién'))
  assert.equal(trigger.props.onPointerEnter,undefined)
  let stopped=false;trigger.props.onPress({stopPropagation(){stopped=true}})
  assert.equal(stopped,true)
  assert.equal(f.render().find(n=>n.type==='CapaAutores').props.visible,true)
  assert.ok(f.render().some(n=>n.props?.style?.justifyContent==='flex-end'))
  assert.deepEqual(f.calls,[])
})


test('el puente de hover conserva el detalle mientras el cursor llega al panel', async()=>{
  const f=fixture(),trigger=f.render().find(n=>n.props?.accessibilityLabel?.startsWith('Ver quién'))
  trigger.props.onPointerEnter();trigger.props.onPointerLeave()
  const bridge=f.render().find(n=>n.props?.importantForAccessibility==='no-hide-descendants')
  assert.ok(bridge);bridge.props.onPointerEnter()
  await new Promise(resolve=>setTimeout(resolve,250))
  assert.equal(f.render().find(n=>n.type==='CapaAutores').props.visible,true)
  bridge.props.onPointerLeave()
  await new Promise(resolve=>setTimeout(resolve,250))
  assert.equal(f.render().find(n=>n.type==='CapaAutores').props.visible,false)
})


test('en PC el detalle reutiliza la superficie de tooltip, sin encabezado grande; teléfono conserva la hoja', () => {
  const escritorio = fixture().render()
  assert.ok(escritorio.some(n => n.type === 'SuperficieTooltip'))
  assert.equal(escritorio.some(n => n.type === 'EncabezadoHoja'), false)
  const movil = fixture(true).render()
  assert.ok(movil.some(n => n.type === 'Glass'))
  assert.ok(movil.some(n => n.type === 'EncabezadoHoja'))
})

// La capa anterior tapaba el chip al montarse: enter → modal → leave → cierre.
test('el tooltip de PC no monta un backdrop ni un puente encima del disparador', () => {
  const f=fixture();f.render().find(n=>n.props?.accessibilityLabel?.startsWith('Ver quién')).props.onPointerEnter()
  const ui=f.render()
  assert.equal(ui.some(n=>n.props?.accessibilityLabel==='Cerrar detalle de reacciones'),false)
  const bridge=ui.find(n=>n.props?.importantForAccessibility==='no-hide-descendants').props.style
  assert.ok(bridge.top+bridge.height<=740 || bridge.top>=768, 'el puente ocupa solamente la separación con el panel')
})

test('entradas y salidas repetidas cancelan todos los cierres pendientes', async()=>{
  const f=fixture(),trigger=f.render().find(n=>n.props?.accessibilityLabel?.startsWith('Ver quién'))
  trigger.props.onPointerEnter();trigger.props.onPointerLeave();trigger.props.onPointerLeave();trigger.props.onPointerEnter()
  await new Promise(resolve=>setTimeout(resolve,270))
  assert.equal(f.render().find(n=>n.type==='CapaAutores').props.visible,true)
})

test('la capa flotante deja pasar eventos y cierra con Escape, fuera del chip o al desplazar la página', () => {
  const listeners=new Map(),cleanups=[],refs=[]
  class Nodo {}
  const trigger=new Nodo(), panel=new Nodo(), fuera=new Nodo()
  const document={body:new Nodo(),addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)}
  const window={addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)}
  const jsx=(type,props)=>({type,props})
  const output=ts.transpileModule(readFileSync('src/ui/CapaAutores.web.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
  const exports={};let closes=0
  new Function('exports','require','document','window','Node',output)(exports,id=>{
    if(id==='react/jsx-runtime')return {jsx,jsxs:jsx}
    if(id==='react')return {useRef:v=>{const ref={current:refs.length===0?{contains:t=>t===panel}:v};refs.push(ref);return ref},useEffect:fn=>{const clean=fn();if(clean)cleanups.push(clean)}}
    if(id==='react-dom')return {createPortal:(child,container)=>({child,container})}
    if(id==='react-native')return {Modal:'Modal'}
    if(id==='../lib/teclado')return {TECLADO_FISICO:true}
    throw Error(id)
  },document,window,Nodo)
  const tree=exports.CapaAutores({visible:true,onRequestClose:()=>closes++,anchor:{x:100,y:200,w:40,h:28},children:'panel'})
  assert.equal(tree.container,document.body)
  assert.equal(tree.child.props.style.pointerEvents,'none')
  listeners.get('pointerdown')({target:trigger,clientX:115,clientY:210})
  listeners.get('pointerdown')({target:panel,clientX:115,clientY:160})
  listeners.get('scroll')({target:panel})
  assert.equal(closes,0,'el chip, autores y scroll interno no cierran el tooltip')
  listeners.get('pointerdown')({target:fuera,clientX:500,clientY:500})
  listeners.get('keydown')({key:'Escape'})
  listeners.get('scroll')({target:fuera})
  assert.equal(closes,3)
  cleanups.forEach(fn=>fn())
  assert.equal(listeners.size,0)
})
