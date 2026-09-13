import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source=ts.transpileModule(readFileSync('src/lib/prepararBuffer.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r))}
function montar(){
 const precargas=[],limpiezas=[]
 const exports={}
 new Function('exports','require',source)(exports,()=>({
  preload(source,options){const task={...deferred(),source,options};precargas.push(task);return task.promise},
  clearPreloadedSource(source){const task={...deferred(),source};limpiezas.push(task);return task.promise},
 }))
 return{api:exports,precargas,limpiezas}
}

test('abort inmediato no espera bridge; nueva adquisición no espera preload anterior y sobrevive su retorno tardío',async()=>{
 const h=montar(),a=new AbortController(),b=new AbortController()
 const primera=h.api.prepararBuffer('file:tema',a.signal)
 const cancelada=assert.rejects(primera,{name:'AbortError'});a.abort();await cancelada;await flush()
 assert.equal(h.limpiezas.length,1)
 const segunda=h.api.prepararBuffer('file:tema',b.signal)
 assert.equal(h.precargas.length,1) // espera sólo clear en curso
 h.limpiezas[0].resolve();await flush();assert.equal(h.precargas.length,2)
 assert.equal(h.precargas[1].options.preferredForwardBufferDuration,30)
 h.precargas[1].resolve();assert.equal(await segunda,'file:tema');await flush()
 h.precargas[0].resolve();await flush();assert.equal(h.limpiezas.length,1)
 h.api.liberarBuffer('file:tema');await flush();assert.equal(h.limpiezas.length,2)
 h.limpiezas[1].resolve();await flush()
})

test('dos usuarios comparten URI: liberar uno no borra el buffer del otro',async()=>{
 const h=montar(),signal=new AbortController().signal
 const a=h.api.prepararBuffer('file:tema',signal),b=h.api.prepararBuffer('file:tema',signal)
 h.precargas[0].resolve();h.precargas[1].resolve();await Promise.all([a,b]);await flush()
 h.api.liberarBuffer('file:tema');await flush();assert.equal(h.limpiezas.length,0)
 h.api.liberarBuffer('file:tema');await flush();assert.equal(h.limpiezas.length,1)
 h.limpiezas[0].resolve();await flush()
})

test('final tardío tras cancelar vuelve a limpiar cuando el clear anterior ya estaba en vuelo',async()=>{
 const h=montar(),abort=new AbortController()
 const p=h.api.prepararBuffer('file:tema',abort.signal),cancelada=assert.rejects(p,{name:'AbortError'})
 abort.abort();await cancelada;await flush()
 h.precargas[0].resolve();await flush();h.limpiezas[0].resolve();await flush()
 assert.equal(h.limpiezas.length,2);h.limpiezas[1].resolve();await flush()
})
