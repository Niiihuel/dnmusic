import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const source=ts.transpileModule(readFileSync('src/services/accesoOffline.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
function fixture(){
 const values=new Map();const navigator={onLine:true};const api={}
 const storage={getItem:async k=>values.get(k),setItem:async(k,v)=>values.set(k,v),removeItem:async k=>values.delete(k)}
 new Function('exports','require','navigator',source)(api,id=>id==='react-native'?{Platform:{OS:'web'}}:storage,navigator)
 return{api,offline:()=>navigator.onLine=false,online:()=>navigator.onLine=true}
}
test('sin red conserva descargas sólo para la misma cuenta previamente aprobada',async()=>{
 const f=fixture();f.offline();assert.equal(await f.api.accesoSinConexion('one'),null)
 await f.api.recordarAccesoLocal('one',{status:'approved',is_admin:true})
 assert.deepEqual(await f.api.accesoSinConexion('one'),{status:'approved',is_admin:false})
 assert.equal(await f.api.accesoSinConexion('two'),null)
 f.online();assert.equal(await f.api.accesoSinConexion('one'),null)
})
test('una decisión pending/rejected borra el permiso local anterior',async()=>{
 for(const status of ['pending','rejected']){
  const f=fixture();await f.api.recordarAccesoLocal('one',{status:'approved',is_admin:false})
  await f.api.recordarAccesoLocal('one',{status,is_admin:false});f.offline()
  assert.equal(await f.api.accesoSinConexion('one'),null)
 }
})
