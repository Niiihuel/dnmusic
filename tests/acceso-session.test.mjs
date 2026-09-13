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
/*
 * Las cuatro rutas de link compartido, y solo esas cuatro, se dibujan sin
 * cuenta aprobada. Están afuera de `Stack.Protected` a propósito —adentro no se
 * montan, y un link de WhatsApp terminaba en el login— pero eso les saca la
 * única protección declarativa que hay, así que acá se exige la que las
 * reemplaza: que cada una caiga en `Aterrizaje`, que no lee nada más que
 * `tarjeta_enlace`. Sumar una quinta ruta pública es cambiar esta lista, que es
 * exactamente el peso que esa decisión tiene que tener.
 */
const RUTAS_DE_ENLACE=new Set(['cancion/[id]','lista/[id]','jam/[code]','perfil/[usuario]'])

test('todas las rutas de producto están declaradas dentro del grupo aprobado',()=>{
 const layout=readFileSync('app/_layout.tsx','utf8')
 const protectedRoutes=layout.split('<Stack.Protected guard={approved}>')[1].split('</Stack.Protected>')[0]
 const names=new Set([...protectedRoutes.matchAll(/name="([^"]+)"/g)].map(m=>m[1]))
 const publicRoutes=new Set(['sign-in','sign-up','acceso-pendiente','auth/callback','_layout',...RUTAS_DE_ENLACE])
 const walk=(path,prefix='')=>readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path+'/'+e.name,prefix+e.name+'/'):e.name.endsWith('.tsx')?[prefix+e.name.slice(0,-4)]:[])
 for(const route of walk('app'))if(!publicRoutes.has(route))assert.ok(names.has(route),'Ruta sin protección: '+route)
 for(const route of RUTAS_DE_ENLACE)assert.ok(!names.has(route),'Ruta de enlace adentro del grupo: '+route)
})

test('cada ruta de enlace tiene su aterrizaje y nada más que eso sin sesión',()=>{
 for(const route of RUTAS_DE_ENLACE){
  const fuente=readFileSync('app/'+route+'.tsx','utf8')
  assert.match(fuente,/<Aterrizaje que="(cancion|lista|jam|perfil)"/,'Sin aterrizaje: '+route)
  assert.match(fuente,/if \(!aprobado\) return <Aterrizaje/,'El aterrizaje no cierra el paso: '+route)
 }
 /* Y que el gate imperativo no las mande al login antes de que se vean. */
 const layout=readFileSync('app/_layout.tsx','utf8')
 assert.match(layout,/if \(!enAterrizaje\) router\.replace\('\/sign-in'\)/)
 assert.match(layout,/if \(!onPending && !enAterrizaje\) router\.replace\('\/acceso-pendiente'\)/)
})

test('entrar no pasa por la pantalla de solicitud pendiente mientras se consulta el acceso',()=>{
 /* `access === null` es «la consulta no volvió», no «tu solicitud está
    pendiente». Tratarlos igual hacía que **cualquiera** —también quien tiene
    acceso desde siempre— viera medio segundo de «esperando la aprobación»
    justo después de entrar. Un fallo sí tiene que llevar ahí: es la única
    pantalla con el botón para volver a consultar. */
 const layout=readFileSync('app/_layout.tsx','utf8')
 assert.match(layout,/const accesoIncierto = !!user && access === null && !accessError/)
 assert.match(layout,/if \(user === undefined \|\| accesoIncierto\)/)
 assert.match(layout,/if \(accesoIncierto\) return/)
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
