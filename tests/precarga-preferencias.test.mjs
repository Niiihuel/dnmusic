import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const flush=()=>new Promise(resolve=>setImmediate(resolve))
function fixture(read=async()=>null) {
 const writes=[], exports={}, store={}
 new Function('exports','require',compile('src/state/store.ts'))(store,()=>({useSyncExternalStore:(_s,get)=>get()}))
 new Function('exports','require',compile('src/state/ajustes.ts'))(exports,id=>id==='./store'?store:{__esModule:true,default:{getItem:read,setItem:async(key,data)=>writes.push([key,JSON.parse(data)])}})
 return {api:exports,writes}
}
test('instalación nueva y preferencias antiguas adoptan precarga automática sin datos móviles', async()=>{
 for (const saved of [null,JSON.stringify({autoplay:false,soloWifi:false}),JSON.stringify({precargaAutomatica:'false',precargaDatos:1})]) {
  const f=fixture(async()=>saved);await f.api.cargarAjustes()
  assert.equal(f.api.leerAjustes().precargaAutomatica,true)
  assert.equal(f.api.leerAjustes().precargaDatos,false)
  assert.ok(Object.values(f.api.leerAjustes()).every(v=>typeof v==='boolean'))
 }
})
test('precarga, datos y solo Wi-Fi son independientes y sobreviven a la recarga',async()=>{
 const f=fixture();await f.api.cargarAjustes()
 f.api.setPrecargaAutomatica(false);f.api.setPrecargaDatos(true);f.api.setSoloWifi(false)
 await flush()
 const saved=f.writes.at(-1)[1]
 assert.equal(saved.precargaAutomatica,false);assert.equal(saved.precargaDatos,true);assert.equal(saved.soloWifi,false)
 const reloaded=fixture(async()=>JSON.stringify(saved));await reloaded.api.cargarAjustes()
 assert.deepEqual(reloaded.api.leerAjustes(),saved)
 assert.equal(f.writes.length,3)
})
test('una carga tardía no pisa las preferencias de precarga que se tocaron durante el inicio',async()=>{
 let resolve
 const f=fixture(()=>new Promise(r=>resolve=r)), loading=f.api.cargarAjustes()
 f.api.setPrecargaAutomatica(false);f.api.setPrecargaDatos(true)
 resolve(JSON.stringify({precargaAutomatica:true,precargaDatos:false,soloWifi:false}));await loading
 assert.equal(f.api.leerAjustes().precargaAutomatica,false)
 assert.equal(f.api.leerAjustes().precargaDatos,true)
 assert.equal(f.api.leerAjustes().soloWifi,false)
})
