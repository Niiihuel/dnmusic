import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import ts from 'typescript'
function load(path,deps,globals={}){
 const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,exports={}
 new Function('exports','require',...Object.keys(globals),code)(exports,id=>{assert.ok(id in deps,id);return deps[id]},...Object.values(globals));return exports
}
const activity=load('src/services/actividadEscucha.ts',{'./lecturaViva':{VIGENCIA_ESCUCHA_MS:65000}})
const now=1760000000000,when=new Date(now).toISOString()
const track={id:'id-private',videoId:'abcdefghijk',title:'Tema',artist:'Artista',durationMs:180000,audioPath:'secret.m4a',artworkPath:'secret-cover'}
async function request({token='Bearer session',method='GET',url='/api/v1/listening',status='approved',auth=200,suena=true,optin=true,updated=when,revoked=false,fail=false}={}){
 const calls=[]
 const payloads={access_status:{status},escucha_estado:{escucha:{device_id:'device-secret',track,suena,posicion_ms:15000,arrancado_en:when,updated_at:updated},cola:{secret:'private playlist'},ahora:now},escucha_de_contacto:optin&&!revoked?[{track,suena,updated_at:updated}]:[]}
 const fetcher=async(input,options)=>{
  calls.push({url:input,options});if(fail)throw Error('private provider details')
  if(input.endsWith('/auth/v1/user'))return Response.json({id:'verified-user'}, {status:auth})
  const rpc=input.split('/').at(-1);assert.ok(rpc in payloads,rpc)
  return Response.json(payloads[rpc])
 }
 const handler=load('api/v1/listening.ts',{'../../src/services/actividadEscucha':activity},{fetch:fetcher,process:{env:{EXPO_PUBLIC_SUPABASE_URL:'https://project.supabase.co',EXPO_PUBLIC_SUPABASE_ANON_KEY:'anon'}},Date:class extends Date{static now(){return now}}}).default
 const req=Object.assign(new EventEmitter(),{headers:{authorization:token},method,url}),headers={}
 const res={statusCode:200,writableEnded:false,setHeader(k,v){headers[k]=v},end(body){this.body=JSON.parse(body);this.writableEnded=true}}
 await handler(req,res);return{...res,headers,calls}
}
test('API propia autenticada verifica aprobación y opt-in antes de devolver sólo metadata compartible',async()=>{
 const r=await request();assert.equal(r.statusCode,200);assert.equal(r.body.version,1);assert.equal(r.body.activity.title,'Tema');assert.equal(r.body.activity.positionMs,15000)
 assert.equal(r.headers['Cache-Control'],'private, no-store, max-age=0');assert.equal(r.headers.Vary,'Authorization')
 assert.doesNotMatch(JSON.stringify(r.body),/device-secret|secret|audioPath|cola|verified-user/)
 const rpc=r.calls.find(c=>c.url.endsWith('/escucha_de_contacto'));assert.deepEqual(JSON.parse(rpc.options.body),{p_usuario:'verified-user'})
 assert.ok(r.calls.every(c=>c.options.headers.Authorization==='Bearer session'))
})
test('rechaza sesión ausente/vencida, acceso pendiente y parámetros que intentan elegir otra cuenta',async()=>{
 for(const config of [{token:null},{token:'Basic token'},{token:'Bearer '},{auth:401},{auth:403}])assert.equal((await request(config)).statusCode,401)
 assert.equal((await request({status:'pending'})).statusCode,403)
 const other=await request({url:'/api/v1/listening?userId=someone'});assert.equal(other.statusCode,400);assert.equal(other.calls.length,0)
 assert.equal((await request({method:'POST'})).statusCode,405)
})
test('pausa, revocación y escucha vencida son indistinguibles; errores no filtran detalle del proveedor',async()=>{
 for(const config of [{suena:false},{optin:false},{revoked:true},{updated:new Date(now-66000).toISOString()},{updated:'invalid'}])assert.deepEqual((await request(config)).body,{version:1,activity:null})
 const failed=await request({fail:true});assert.equal(failed.statusCode,503);assert.deepEqual(failed.body,{error:'unavailable'})
})
