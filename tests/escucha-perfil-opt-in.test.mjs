import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
function load(path, mocks = {}) {
 const exports = {}
 const code = ts.transpileModule(readFileSync(path,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('exports','require',code)(exports,id => id in mocks ? mocks[id] : require(id))
 return exports
}
const live = load('src/services/lecturaViva.ts')
const track = {videoId:'one',title:'Canción',artist:'Artista'}

test('escuchaDe descarta pausa, ausencia, timestamps inválidos y desconexión; propaga revocación', async () => {
 let row, error
 const api = load('src/services/reacciones.ts', {
  './lecturaViva': live,
  '../lib/supabase': {getSupabase:()=>({rpc:async(name,args)=>{
   assert.equal(name,'escucha_de_contacto');assert.deepEqual(args,{p_usuario:'owner'})
   return {data:row ? [row]:[],error}
  }})},
  './escucha': {cancionDeFila:v=>v?.videoId ? v : null},
 })
 for (const [suena, updated_at] of [[false,new Date().toISOString()],[true,new Date(Date.now()-66000).toISOString()],[true,null],[true,'invalid']]) {
  row={track,suena,updated_at};assert.equal(await api.escuchaDe('owner'),null)
 }
 row={track,suena:true,updated_at:new Date().toISOString()}
 assert.equal((await api.escuchaDe('owner')).track,track)
 row=undefined;assert.equal(await api.escuchaDe('owner'),null)
 error=Error('sin red');await assert.rejects(api.escuchaDe('owner'),/sin red/)
})

function component(escucha, viewer='contact') {
 const effects = []
 const {EscuchaConReacciones} = load('src/ui/Reacciones.tsx', {
  './Social': { AccionSocial: 'AccionSocial' }, './AutoresReaccion': {}, './useLecturaViva':{useLecturaViva:()=>escucha},
  './FuentePerfil':{TextoPerfil:'Text'},
  'react':{useCallback:f=>f,useEffect:f=>effects.push(f),useRef:v=>({current:v}),useState:v=>[v,()=>{}]},
  'react-native':{View:'View',Text:'Text',Image:'Image',Pressable:'Pressable',ScrollView:'ScrollView',ActivityIndicator:'ActivityIndicator'},
  '../services/lecturaViva':live,'../state/session':{useUser:()=>viewer ? {id:viewer}:null},
  '../lib/artwork':{artworkSource:()=>null},'../lib/mensajeError':{},'../services/reacciones':{},'../state/aviso':{},'./Avatar':{},'./PlayingBars':{PlayingBars:'PlayingBars'},'./icons':{},
 })
 return EscuchaConReacciones({ownerId:'owner',nombre:'Ana',onReaccion:()=>{}})
}
const walk = node => node && typeof node === 'object' ? [node,...[node.props?.children].flat(Infinity).flatMap(walk)] : []
test('la tarjeta solo muestra escucha vigente; el dueño y una sesión ausente no tienen botones de reacción', () => {
 const fresh={track,suena:true,cuando:new Date()}
 assert.equal(walk(component(fresh)).filter(n=>n.type==='AccionSocial').length,6)
 for (const viewer of ['owner',null]) assert.equal(walk(component(fresh,viewer)).filter(n=>n.type==='AccionSocial').length,0)
 for (const value of [null,{...fresh,suena:false},{...fresh,cuando:new Date(Date.now()-66000)}]) assert.equal(component(value),null)
})

test('guardar transmite el opt-out false y omite el parámetro cuando no se tocó', async () => {
 let sent
 const api=load('src/services/profile.ts', {
  '../lib/fuentes':{fuenteDe:()=>null},'../lib/tema':{temaDe:()=>null},
  '../lib/supabase':{getSupabase:()=>({rpc:async(_name,args)=>{
   sent=args;return {data:[{user_id:'owner',username:'ana',compartir_escucha:args.p_compartir_escucha}]}
  }})},
 })
 assert.equal((await api.saveMyProfile({compartirEscucha:true})).compartirEscucha,true)
 assert.equal(sent.p_compartir_escucha,true)
 assert.equal((await api.saveMyProfile({compartirEscucha:false})).compartirEscucha,false)
 assert.equal(sent.p_compartir_escucha,false)
 await api.saveMyProfile({bio:'Otra edición'})
 assert.equal('p_compartir_escucha' in sent,false)
})

test('el hook limpia al ir al fondo o perder foco y no revive respuestas tardías', async () => {
 let result=null, focus, stateChanged
 const pending=[]
 const api=load('src/ui/useLecturaViva.ts', {
  'react':{useCallback:f=>f,useState:()=>[result,next=>{result=next}]},
  'expo-router':{useFocusEffect:f=>{focus=f}},
  'react-native':{AppState:{currentState:'active',addEventListener:(_e,f)=>{stateChanged=f;return {remove(){}}}}},
  '../services/lecturaViva':live,
 })
 const read=()=>new Promise(resolve=>pending.push(resolve))
 const render=()=>api.useLecturaViva('owner',read)
 assert.equal(render(),null)
 const blur=focus()
 pending.shift()('canción');await new Promise(resolve=>setImmediate(resolve))
 assert.equal(render(),'canción')
 stateChanged('background');assert.equal(render(),null)
 stateChanged('active');assert.equal(render(),null)
 const late=pending.shift()
 blur();late('respuesta vieja');await new Promise(resolve=>setImmediate(resolve))
 assert.equal(render(),null)
})

test('escuchaDe propaga AbortSignal y no devuelve datos si la petición se cancela durante el RPC',async()=>{
 let resolve,calls=0,received
 const result=new Promise(r=>{resolve=r});result.abortSignal=signal=>{received=signal;return result}
 const api=load('src/services/reacciones.ts',{'./lecturaViva':live,'./escucha':{cancionDeFila:v=>v},'../lib/supabase':{getSupabase:()=>({rpc:()=>{calls++;return result}})}})
 const before=new AbortController();before.abort();await assert.rejects(api.escuchaDe('owner',before.signal),{name:'AbortError'});assert.equal(calls,0)
 const abort=new AbortController(),pending=api.escuchaDe('owner',abort.signal);assert.equal(received,abort.signal)
 abort.abort();resolve({data:[{track,suena:true,updated_at:new Date().toISOString()}],error:null})
 await assert.rejects(pending,{name:'AbortError'})
})
