import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { ventanaPrecarga } from '../src/lib/politicaPrecarga.ts'
const source=ts.transpileModule(readFileSync('src/ui/usePrecargaCola.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r))}
const track=id=>({id,videoId:id,audioPath:`${id}.m4a`})
function montar({disk=true, platform='web', network='amplia',failSigning=false, resolverEspera}={}){
 const hooks=[],effects=[],timers=new Map(),downloads=[],sources=[],protectedPaths=[],priorities=[]
 const resolved=[],completed=[],cached=new Map()
 let signatures=0
 let cursor=0,sequence=0,statusListener,ready=true,online=true,automatic=true,current=track('a')
 const player={addListener(_,fn){statusListener=fn;return{remove(){statusListener=null}}}}
 const deps={
  react:{useRef(value){const n=cursor++;return hooks[n]??(hooks[n]={current:value})},useState(initial){const n=cursor++;if(!(n in hooks))hooks[n]=typeof initial==='function'?initial():initial;return[hooks[n],fn=>{hooks[n]=typeof fn==='function'?fn(hooks[n]):fn}]},useEffect(fn,dependencies){const n=cursor++,old=hooks[n];if(!dependencies||!old||dependencies.some((d,i)=>!Object.is(d,old.dependencies[i])))effects.push(()=>{old?.cleanup?.();hooks[n]={dependencies,cleanup:fn()}})}},
  'react-native':{Platform:{OS:platform}},
  '../state/ajustes':{useAjustes:()=>({precargaAutomatica:automatic,precargaDatos:false}),useAjustesCargados:()=>ready},
  '../state/redPrecarga':{useTipoRedPrecarga:()=>online?network:'no'},
  '../lib/politicaPrecarga':{ventanaPrecarga},
  '../state/playback':{getPlaybackState:()=>({tracks:[current],index:0,manual:null}),completarCancion:(...args)=>completed.push(args)},
  '../services/music':{resolveSong:async t=>{resolved.push(t.videoId);await resolverEspera?.(t);return{path:`${t.id}.m4a`,url:`https://audio/${t.id}`,artworkPath:null,durationMs:180000}},signedUrl:async path=>{signatures++;if(failSigning)throw Error('sin firma');return`https://audio/${path}`}},
  '../state/descargas':{HAY_DESCARGAS:disk,rutaLocal:path=>cached.get(path)??null,priorizarReproduccion:v=>priorities.push(v),protegerDescargas:paths=>protectedPaths.push(paths),prepararCache:(t,signal)=>new Promise(resolve=>{downloads.push({track:t,signal,resolve:uri=>{if(uri)cached.set(t.audioPath,uri);resolve(uri)}});signal.addEventListener('abort',()=>resolve(null),{once:true})})},
  '../lib/prepararBuffer':{prepararBuffer:async uri=>{sources.push('buffer');return platform==='web'?'blob:prepared':uri},liberarBuffer:uri=>sources.push(['release',uri])},
 }
 const exports={}
 new Function('exports','require','setTimeout','clearTimeout',source)(exports,k=>{assert.ok(k in deps,k);return deps[k]},fn=>{timers.set(++sequence,fn);return sequence},id=>timers.delete(id))
 let props={current,proximas:[track('b'),track('c')],url:'https://audio/a',player,wantPlay:true,mudo:false,remember:(...v)=>sources.push(v),olvidar:(...v)=>sources.push(['forget',...v])}
 return{downloads,sources,priorities,protectedPaths,resolved,completed,
  unmount(){for(const hook of hooks)hook?.cleanup?.()},
  render(patch={}){props={...props,...patch};current=props.current;cursor=0;exports.usePrecargaCola(props);effects.splice(0).forEach(fn=>fn())},
  status(s={isLoaded:true,isBuffering:false,playing:true}){statusListener?.(s)},
  async clock(){const tasks=[...timers.values()];timers.clear();tasks.forEach(fn=>fn());await flush()},
  settings(values){if('ready'in values)ready=values.ready;if('online'in values)online=values.online;if('automatic'in values)automatic=values.automatic},
  get signatures(){return signatures},
  get timers(){return timers.size},
 }
}
test('espera audio estable, prepara dos secuencialmente y no cambia la fuente que suena',async()=>{
 const h=montar();h.render();await h.clock();assert.equal(h.downloads.length,0);assert.equal(h.priorities.at(-1),true)
 h.status();h.render();assert.equal(h.priorities.at(-1),false)
 await h.clock();assert.equal(h.downloads.length,1);assert.equal(h.downloads[0].track.id,'b')
 h.downloads[0].resolve('local:b');await flush();assert.equal(h.downloads.length,2);assert.equal(h.downloads[1].track.id,'c')
 h.downloads[1].resolve('local:c');await flush();assert.deepEqual(h.sources,[['b','https://audio/b.m4a'],['c','https://audio/c.m4a']])
 assert.ok(h.protectedPaths.at(-1).includes('video:a'))
})
test('buffering o cambiar de playlist cancela trabajo anterior sin tocar la canción actual',async()=>{
 const h=montar();h.render();h.status();h.render();await h.clock()
 h.status({isLoaded:true,isBuffering:true,playing:true});h.render();assert.equal(h.downloads[0].signal.aborted,true);assert.equal(h.priorities.at(-1),true)
 await flush();assert.equal(h.downloads.length,1)
 h.render({current:track('x'),proximas:[track('y')],url:'https://audio/x'});h.status();h.render();await h.clock()
 assert.equal(h.downloads.at(-1).track.id,'y');assert.ok(h.sources.every(x=>Array.isArray(x)&&!['a','x'].includes(x[0])))
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
 assert.equal(h.sources.includes('buffer'),false)
 assert.deepEqual(h.sources,[['b','https://audio/b.m4a'],['c','https://audio/c.m4a']])
})

test('metadata y nuevas referencias equivalentes no cancelan una descarga en curso',async()=>{
 const h=montar();h.render();h.status();h.render();await h.clock()
 const primera=h.downloads[0]
 h.render({current:{...track('a'),title:'nuevo título'},proximas:[{...track('b'),title:'metadatos'},track('c')]})
 assert.equal(primera.signal.aborted,false);assert.equal(h.timers,0)
 primera.resolve('local:b');await flush();assert.equal(h.downloads.length,2)
 h.unmount();assert.equal(h.downloads[1].signal.aborted,true);assert.deepEqual(h.protectedPaths.at(-1),[])
})

test('iOS calienta sólo el próximo AVPlayerItem local y libera buffers al desmontar',async()=>{
 const h=montar({platform:'ios'});h.render();h.status();h.render();await h.clock()
 h.downloads[0].resolve('local:b');await flush()
 assert.deepEqual(h.sources,[['b','https://audio/b.m4a'],['c','https://audio/c.m4a'],['b','local:b'],'buffer'])
 h.downloads[1].resolve('local:c');await flush();assert.equal(h.sources.filter(x=>x==='buffer').length,1)
 h.unmount();assert.ok(h.sources.some(x=>Array.isArray(x)&&x[0]==='release'&&x[1]==='local:b'))
 assert.ok(h.sources.some(x=>Array.isArray(x)&&x[0]==='forget'&&x[1]==='b'))
 assert.deepEqual(h.protectedPaths.at(-1),[])
})

test('ventana nativa amplía canciones cortas, datos autorizados conservan máximo dos',async()=>{
 for(const [network,total] of [['amplia',5],['datos',2]]){
  const h=montar({network});h.render({proximas:['b','c','d','e','f'].map(id=>({...track(id),durationMs:60000}))})
  h.status();h.render();await h.clock()
  for(let i=0;i<total;i++){assert.ok(h.downloads[i]);h.downloads[i].resolve(`local:${i}`);await flush()}
  assert.equal(h.downloads.length,total);h.unmount()
 }
})


test('errores especulativos reintentan una vez y no generan un bucle al renderizar',async()=>{
 const h=montar({disk:false,failSigning:true});h.render({proximas:[track('b')]});h.status();h.render()
 await h.clock();assert.equal(h.signatures,1);assert.equal(h.timers,1)
 await h.clock();assert.equal(h.signatures,2);assert.equal(h.timers,0)
 h.render({proximas:[{...track('b'),title:'cambio visual'}]});await h.clock()
 assert.equal(h.signatures,2);h.unmount()
})


test('Android prepara disco sin duplicar la canción completa en memoria nativa',async()=>{
 const h=montar({platform:'android'});h.render();h.status();h.render();await h.clock()
 h.downloads[0].resolve('local:b');await flush();h.downloads[1].resolve('local:c');await flush()
 assert.equal(h.sources.includes('buffer'),false);h.unmount()
})


test('resultados sin audio se resuelven en orden mientras suena la actual; conserva resolución sin espacio',async()=>{
 const h=montar({platform:'ios'})
 h.render({proximas:[{...track('b'),audioPath:''},{...track('c'),audioPath:''}]})
 await h.clock();assert.deepEqual(h.resolved,[])
 h.status();h.render();await h.clock()
 assert.deepEqual(h.resolved,['b','c']);assert.equal(h.completed[0][0],'b')
 assert.deepEqual(h.sources,[['b','https://audio/b'],['c','https://audio/c']], 'ambas firmas listas antes de terminar una descarga')
 assert.equal(h.completed[0][1].audioPath,'b.m4a')
 h.downloads[0].resolve(null);await flush()
 assert.deepEqual(h.resolved,['b','c']);assert.equal(h.completed[1][0],'c')
 h.downloads[1].resolve('local:c');await flush()
 assert.equal(h.downloads.length,2);h.unmount()
})


test('iOS repone la ventana durante diez canciones sin necesitar un regreso a foreground',async()=>{
 const h=montar({platform:'ios'})
 const cola=Array.from({length:10},(_,i)=>({...track(String(i)),durationMs:60000}))
 let entregadas=0
 for(let actual=0;actual<cola.length;actual++){
  h.render({current:cola[actual],proximas:cola.slice(actual+1,actual+6),url:`local:${actual}`})
  h.status();h.render();await h.clock()
  while(entregadas<h.downloads.length){
   const descarga=h.downloads[entregadas++]
   assert.equal(descarga.signal.aborted,false)
   descarga.resolve(`local:${descarga.track.id}`);await flush()
  }
  if(actual<cola.length-1){
   assert.ok(h.sources.some(x=>Array.isArray(x)&&x[0]===String(actual+1)&&x[1]===`local:${actual+1}`))
  }
 }
 assert.deepEqual(h.downloads.map(d=>d.track.id),['1','2','3','4','5','6','7','8','9'])
 h.unmount()
})

test('Wi-Fi adelanta dos resoluciones aunque la primera demore, datos sólo una en vuelo',async()=>{
 for(const network of ['amplia','datos']){
  const pendientes=new Map()
  const h=montar({platform:'ios',network,resolverEspera:t=>new Promise(resolve=>pendientes.set(t.id,resolve))})
  h.render({proximas:['b','c','d'].map(id=>({...track(id),audioPath:''}))});h.status();h.render();await h.clock()
  assert.deepEqual(h.resolved,network==='amplia'?['b','c']:['b'])
  assert.equal(h.downloads.length,0)
  pendientes.get('b')();await flush()
  assert.deepEqual(h.resolved,['b','c'])
  assert.equal(h.downloads.length,1)
  assert.ok(h.sources.some(x=>Array.isArray(x)&&x[0]==='b'&&x[1]==='https://audio/b'))
  pendientes.get('c')();await flush()
  assert.ok(h.sources.some(x=>Array.isArray(x)&&x[0]==='c'&&x[1]==='https://audio/c'))
  assert.equal(h.downloads.length,1,'la segunda URL está lista sin terminar la primera descarga')
  h.unmount()
 }
})

test('cancelar una resolución anticipada no escribe metadata ni URL al retornar tarde',async()=>{
 const pendientes=[]
 const h=montar({platform:'ios',resolverEspera:()=>new Promise(resolve=>pendientes.push(resolve))})
 h.render({proximas:['b','c'].map(id=>({...track(id),audioPath:''}))});h.status();h.render();await h.clock()
 h.settings({automatic:false});h.render()
 pendientes.forEach(resolve=>resolve());await flush()
 assert.deepEqual(h.sources,[]);assert.deepEqual(h.completed,[]);assert.equal(h.downloads.length,0)
 h.unmount()
})
