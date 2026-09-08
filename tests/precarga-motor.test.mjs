import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source=ts.transpileModule(readFileSync('src/ui/usePrecargaCola.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r))}
const track=id=>({id,videoId:id,audioPath:`${id}.m4a`})
function montar({disk=true}={}){
 const hooks=[],effects=[],timers=new Map(),downloads=[],sources=[],protectedPaths=[],priorities=[]
 let cursor=0,sequence=0,statusListener,ready=true,online=true,automatic=true,current=track('a')
 const player={addListener(_,fn){statusListener=fn;return{remove(){statusListener=null}}}}
 const deps={
  react:{useRef(value){const n=cursor++;return hooks[n]??(hooks[n]={current:value})},useState(initial){const n=cursor++;if(!(n in hooks))hooks[n]=initial;return[hooks[n],fn=>{hooks[n]=typeof fn==='function'?fn(hooks[n]):fn}]},useEffect(fn,dependencies){const n=cursor++,old=hooks[n];if(!old||dependencies.some((d,i)=>!Object.is(d,old.dependencies[i])))effects.push(()=>{old?.cleanup?.();hooks[n]={dependencies,cleanup:fn()}})}},
  'react-native':{Platform:{OS:'web'}},
  '../state/ajustes':{useAjustes:()=>({precargaAutomatica:automatic,precargaDatos:false}),useAjustesCargados:()=>ready},
  '../state/redPrecarga':{useRedPrecarga:()=>online},
  '../state/playback':{getPlaybackState:()=>({tracks:[current],index:0,manual:null}),completarCancion(){}},
  '../services/music':{resolveSong:async t=>({path:`${t.id}.m4a`,url:`https://audio/${t.id}`}),signedUrl:async path=>`https://audio/${path}`},
  '../state/descargas':{HAY_DESCARGAS:disk,rutaLocal:()=>null,priorizarReproduccion:v=>priorities.push(v),protegerDescargas:paths=>protectedPaths.push(paths),prepararCache:(t,signal)=>new Promise(resolve=>{downloads.push({track:t,signal,resolve});signal.addEventListener('abort',()=>resolve(null),{once:true})})},
  '../lib/prepararBuffer':{prepararBuffer:async()=>{sources.push('buffer');return'blob:prepared'},liberarBuffer:uri=>sources.push(['release',uri])},
 }
 const exports={}
 new Function('exports','require','setTimeout','clearTimeout',source)(exports,k=>{assert.ok(k in deps,k);return deps[k]},fn=>{timers.set(++sequence,fn);return sequence},id=>timers.delete(id))
 let props={current,proximas:[track('b'),track('c')],url:'https://audio/a',player,wantPlay:true,mudo:false,remember:(...v)=>sources.push(v),olvidar:(...v)=>sources.push(['forget',...v])}
 return{downloads,sources,priorities,protectedPaths,
  render(patch={}){props={...props,...patch};current=props.current;cursor=0;exports.usePrecargaCola(props);effects.splice(0).forEach(fn=>fn())},
  status(s={isLoaded:true,isBuffering:false,playing:true}){statusListener?.(s)},
  async clock(){const tasks=[...timers.values()];timers.clear();tasks.forEach(fn=>fn());await flush()},
  settings(values){if('ready'in values)ready=values.ready;if('online'in values)online=values.online;if('automatic'in values)automatic=values.automatic},
  get timers(){return timers.size},
 }
}
test('espera audio estable, prepara dos secuencialmente y no cambia la fuente que suena',async()=>{
 const h=montar();h.render();await h.clock();assert.equal(h.downloads.length,0);assert.equal(h.priorities.at(-1),true)
 h.status();h.render();assert.equal(h.priorities.at(-1),false)
 await h.clock();assert.equal(h.downloads.length,1);assert.equal(h.downloads[0].track.id,'b')
 h.downloads[0].resolve('local:b');await flush();assert.equal(h.downloads.length,2);assert.equal(h.downloads[1].track.id,'c')
 h.downloads[1].resolve('local:c');await flush();assert.deepEqual(h.sources,[])
 assert.ok(h.protectedPaths.at(-1).includes('video:a'))
})
test('buffering o cambiar de playlist cancela trabajo anterior sin tocar la canción actual',async()=>{
 const h=montar();h.render();h.status();h.render();await h.clock()
 h.status({isLoaded:true,isBuffering:true,playing:true});h.render();assert.equal(h.downloads[0].signal.aborted,true);assert.equal(h.priorities.at(-1),true)
 await flush();assert.equal(h.downloads.length,1)
 h.render({current:track('x'),proximas:[track('y')],url:'https://audio/x'});h.status();h.render();await h.clock()
 assert.equal(h.downloads.at(-1).track.id,'y');assert.deepEqual(h.sources,[])
})
test('preferencias sin cargar, desactivadas o sin red no inician descargas',async()=>{
 const h=montar();h.settings({ready:false});h.render();h.status();h.render();await h.clock();assert.equal(h.downloads.length,0)
 h.settings({ready:true,automatic:false});h.render();await h.clock();assert.equal(h.downloads.length,0)
 h.settings({automatic:true,online:false});h.render();await h.clock();assert.equal(h.downloads.length,0)
 h.settings({online:true});h.render();await h.clock();assert.equal(h.downloads.length,1)
 h.settings({automatic:false});h.render();assert.equal(h.downloads[0].signal.aborted,true)
})
test('un disco sin espacio no dispara un buffer adicional fuera de la cuota',async()=>{
 const h=montar();h.render();h.status();h.render();await h.clock()
 h.downloads[0].resolve(null);await flush();h.downloads[1].resolve(null);await flush()
 assert.deepEqual(h.sources,[])
})
