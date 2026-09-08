import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import ts from 'typescript'
const source = ts.transpileModule(readFileSync('src/state/session.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const deferred = () => {let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b}); return {promise,resolve,reject}}
const flush = async () => {for(let n=0;n<6;n++) await new Promise(r=>setImmediate(r))}
function fixture() {
 let auth, status = {status:'pending',is_admin:false}, failure=null, pending=null, inboxFailure=null, conversation=null
 const timers=[], calls=[]
 const deps={
  '../lib/notificarEscritorio': {hayNotificaciones:()=>false,notificar(){},prepararNotificaciones(){}},
  '../lib/supabase':{isSupabaseConfigured:true},
  '../services/auth':{subscribeToAuth:f=>{auth=f;return()=>{}},logOut:async()=>auth(null)},
  '../services/accesoOffline':{accesoSinConexion:async()=>null,recordarAccesoLocal:async()=>{}},
  '../services/acceso':{ensureApprovedSession:async()=>calls.push('renew'),fetchAccessStatus:async()=>{calls.push('access');if(pending)return pending.promise;if(failure)throw failure;return status}},
  '../services/contacts':{listConversations:async()=>{calls.push('inbox');if(inboxFailure)throw inboxFailure;return[]},ensureConversation:async()=>conversation.promise,respondContactRequest:async()=>conversation.promise,listContactRequests:async()=>[],subscribeToInbox:()=>{calls.push('subscribe');return()=>calls.push('unsubscribe')}},
  '../services/messages':{subscribeToMessages:()=>{calls.push('messages');return()=>{}}},'../services/profile':{fetchMyProfile:async()=>{calls.push('profile');return {username:'local'}}},
  './aviso':{avisar(){}},'./jam':{desconectarJam:()=>calls.push('stopJam')},'./escucha':{desconectarEscucha(){}},
  './playback':{stopPlayback:()=>calls.push('stopPlayback')},'./gustos':{limpiarMeGusta(){}},
  './store':{createStore:initial=>{let value=initial;return{get:()=>value,set:patch=>value={...value,...patch}}},useStore:(store,selector)=>selector(store.get())},
 }
 const api={};new Function('exports','require','setTimeout','clearTimeout',source)(api,key=>{assert.ok(key in deps,key);return deps[key]},fn=>timers.push(fn),()=>{})
 api.startSession()
 return{api,calls,signIn(id){auth({id,email:id+'@example.test'})},status(value){status=value},inboxFail(e){inboxFailure=e},deferConversation(){conversation=deferred();return conversation},fail(e){failure=e},defer(){pending=deferred();return pending},async tick(){timers.splice(0).forEach(f=>f());await flush()}}
}
test('Google pendiente no activa datos, canales ni identidad aprobada',async()=>{
 const f=fixture();f.signIn('new');await f.tick()
 assert.equal(f.api.useAuthUser().id,'new');assert.equal(f.api.useUser(),null)
 assert.equal(f.api.useAccessStatus().status,'pending');assert.equal(f.api.useIsAccessAdmin(),false)
 assert.ok(!f.calls.includes('inbox'));assert.ok(!f.calls.includes('profile'));assert.ok(!f.calls.includes('subscribe'))
})
test('aprobar activa una sola vez y refrescar tokens conserva conversaciones',async()=>{
 const f=fixture();f.signIn('new');await f.tick();f.status({status:'approved',is_admin:false})
 await f.api.refrescarAcceso();assert.equal(f.api.useUser().id,'new');assert.ok(f.calls.indexOf('renew')<f.calls.indexOf('inbox'));assert.equal(f.calls.filter(x=>x==='subscribe').length,1)
 f.signIn('new');await f.tick();assert.equal(f.calls.filter(x=>x==='subscribe').length,1)
})
test('rechazar corta servicios y oculta datos de la cuenta',async()=>{
 const f=fixture();f.status({status:'approved',is_admin:true});f.signIn('owner');await f.tick()
 assert.equal(f.api.useIsAccessAdmin(),true)
 f.status({status:'rejected',is_admin:false});await f.api.refrescarAcceso()
 assert.equal(f.api.useUser(),null);assert.equal(f.api.useMyProfile(),null);assert.equal(f.api.useIsAccessAdmin(),false)
 assert.ok(f.calls.includes('unsubscribe'))
})
test('una respuesta vieja de aprobación no habilita la nueva cuenta ni revive logout',async()=>{
 const f=fixture(),d=f.defer();f.signIn('old');await f.tick();f.signIn('new')
 d.resolve({status:'approved',is_admin:true});await flush()
 assert.equal(f.api.useUser(),null);assert.equal(f.api.useIsAccessAdmin(),false)
 await f.api.endSession();await f.tick();assert.equal(f.api.useAuthUser(),null);assert.equal(f.api.useUser(),null)
})
test('fallo de red inicial permanece cerrado y permite reintentar',async()=>{
 const f=fixture();f.fail(new Error('offline'));f.signIn('new');await f.tick()
 assert.equal(f.api.useUser(),null);assert.ok(f.api.useAccessError());assert.ok(!f.calls.includes('subscribe'))
 f.fail(null);await f.api.refrescarAcceso();assert.equal(f.api.useAccessStatus().status,'pending')
})
test('todas las rutas de producto están declaradas dentro del grupo aprobado',()=>{
 const layout=readFileSync('app/_layout.tsx','utf8')
 const protectedRoutes=layout.split('<Stack.Protected guard={approved}>')[1].split('</Stack.Protected>')[0]
 const names=new Set([...protectedRoutes.matchAll(/name="([^"]+)"/g)].map(m=>m[1]))
 const publicRoutes=new Set(['sign-in','sign-up','acceso-pendiente','auth/callback','_layout'])
 const walk=(path,prefix='')=>readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path+'/'+e.name,prefix+e.name+'/'):e.name.endsWith('.tsx')?[prefix+e.name.slice(0,-4)]:[])
 for(const route of walk('app'))if(!publicRoutes.has(route))assert.ok(names.has(route),'Ruta sin protección: '+route)
})

test('una carga inicial fallida de bandeja puede reintentarse sin salir de la cuenta',async()=>{
 const f=fixture();f.status({status:'approved',is_admin:false});f.inboxFail(new Error('network'));f.signIn('old');await f.tick()
 assert.ok(!f.calls.includes('subscribe'));f.inboxFail(null);await f.api.refrescarAcceso();assert.ok(f.calls.includes('subscribe'))
})
test('una RPC de conversación tardía no restaura chats después del logout',async()=>{
 for(const operation of ['openContactConversation','respondToRequest']){
  const f=fixture();f.status({status:'approved',is_admin:false});f.signIn('old');await f.tick()
  const d=f.deferConversation(),result=f.api[operation]({id:'contact'},true)
  await f.api.endSession();d.resolve('pair')
  await assert.rejects(result,/sesión cambió/);assert.equal(f.api.useContact(),null);assert.ok(!f.calls.includes('messages'))
 }
})
