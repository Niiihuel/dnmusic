import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const source=ts.transpileModule(readFileSync('src/state/player.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const song=id=>({path:`${id}.m4a`,videoId:id,startMs:10000,durationMs:15000})
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}}
const flush=()=>new Promise(r=>setImmediate(r))
function montar({local=()=>null,load=async()=>{},current=null,seek=async()=>{}}={}){
 const state=[],remote=[],used=[];let cursor=0
 const calls=[],lease={active:true}
 const player={pause(){calls.push('pause')},play(){calls.push('play')},seekTo:seek,currentTime:0}
 const deps={
  './descargas':{cargarDescargas:load,marcarAudioUsado:p=>used.push(p),rutaLocal:local,protegerDescargas(){}},
  react:{useCallback:fn=>fn,useEffect(){},useRef:value=>({current:value}),useState(value){const n=cursor++;state[n]=n===0?current:value;return[state[n],next=>{state[n]=next}]}},
  'expo-audio':{useAudioPlayer:()=>player},'react-native-reanimated':{useSharedValue:value=>({value})},
  '../services/music':{headroomGain:()=>1,urlDeAudio:(path)=>{const d=deferred();remote.push({path,...d});return d.promise}},
  './playback':{pauseForSnippet(){},registerSnippetStopper(){},useVolume:()=>1},
  '../lib/useAudioLease':{useAudioLease:()=>lease},
  '../lib/seek':{saltar(){}},'../lib/appActiva':{useAppActiva:()=>false},
 }
 const exports={};new Function('exports','require',source)(exports,k=>{assert.ok(k in deps,k);return deps[k]})
 return{api:exports.useSnippetPlayer(),state,remote,used,calls,lease}
}
test('fragmento espera el índice local y reproduce sin pedir una URL remota',async()=>{
 const ready=deferred(),h=montar({load:()=>ready.promise,local:path=>`file:${path}`})
 const playing=h.api.toggle('uno',song('uno'));assert.equal(h.state[1],null)
 assert.equal(h.remote.length,0);ready.resolve();await playing
 assert.equal(h.state[1],'file:uno.m4a');assert.deepEqual(h.used,['uno.m4a']);assert.equal(h.remote.length,0)
})
test('tocar dos fragmentos rápidamente no deja que la primera URL reemplace a la segunda',async()=>{
 const h=montar(),a=h.api.toggle('a',song('a'));await flush()
 const b=h.api.toggle('b',song('b'));await flush()
 h.remote[1].resolve({url:'https://audio/b'});await b
 h.remote[0].resolve({url:'https://audio/a'});await a
 assert.equal(h.state[1],'https://audio/b');assert.deepEqual(h.used,['b.m4a'])
})
test('detener mientras lee el disco no inicia una firma ni revive el fragmento',async()=>{
 const ready=deferred(),h=montar({load:()=>ready.promise}),pending=h.api.seek('a',song('a'),.5)
 h.api.stop();ready.resolve();await pending
 assert.equal(h.state[1],null);assert.equal(h.remote.length,0)
})

test('cerrar durante seek no reproduce ni toca el objeto liberado después del cierre',async()=>{
 const d=deferred(),h=montar({current:{id:'a',song:song('a')},seek:()=>d.promise})
 const pending=h.api.toggle('a',song('a'))
 h.lease.active=false // layout cleanup, antes del release de expo-audio
 h.api.stop()
 d.resolve();await pending
 assert.deepEqual(h.calls,[])
 assert.equal(h.state[2],false)
})
test('detener durante seek invalida la reanudación pendiente',async()=>{
 const d=deferred(),h=montar({current:{id:'a',song:song('a')},seek:()=>d.promise})
 const pending=h.api.toggle('a',song('a'))
 h.api.stop();d.resolve();await pending
 assert.deepEqual(h.calls,['pause'])
 assert.equal(h.state[0],null)
 assert.equal(h.state[2],false)
})
test('un callback de reproducción de una pantalla cerrada no inicia otra carga',async()=>{
 const h=montar();h.lease.active=false
 await h.api.toggle('a',song('a'));await h.api.seek('a',song('a'),.2)
 assert.deepEqual(h.calls,[])
 assert.equal(h.remote.length,0)
 assert.equal(h.state[0],null)
})
