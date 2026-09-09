import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const jsx = (type, props) => ({type,props})
const transpile = source => ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
const flatten = n => Array.isArray(n) ? n.flatMap(flatten) : n && typeof n === 'object' ? [n,...flatten(n.props?.children)] : []
const tick = () => new Promise(resolve=>setImmediate(resolve))
const deferred = () => { let resolve,reject; const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject} }

function service(rpc, auth) {
 const exports={}
 new Function('exports','require',transpile(readFileSync('src/services/acceso.ts','utf8')))(exports,()=>({getSupabase:()=>({rpc,auth})}))
 return exports
}

test('RPC de estado conserva pending/rejected y rechaza errores o permisos malformados', async () => {
 for(const status of ['pending','approved','rejected']) {
  const f=service(async name=>{assert.equal(name,'access_status');return {data:{status,is_admin:false},error:null}})
  assert.deepEqual(await f.fetchAccessStatus(),{status,is_admin:false})
 }
 for(const data of [null,{}, {status:'approved',is_admin:'true'}, {status:'unknown',is_admin:true}]) {
  await assert.rejects(service(async()=>({data})).fetchAccessStatus(),/verificar/)
 }
 const denied=new Error('permission denied')
 await assert.rejects(service(async()=>({error:denied})).fetchAccessStatus(),e=>e===denied)
})

test('lista y decisiones usan exclusivamente RPC, parámetros exactos y confirmación del servidor', async () => {
 const calls=[], row={user_id:'solicitante',status:'pending',requested_at:'2026-09-07T00:00:00Z'}
 const f=service(async(name,args)=>{
  calls.push([name,args])
  return {data:name==='access_requests'?[row]:name==='delete_access_account'?{user_id:args.p_user_id,deleted:true}:{user_id:args.p_user_id,status:args.p_approve?'approved':'rejected',decided_at:'2026-09-07T01:00:00Z'}}
 })
 assert.deepEqual(await f.listAccessRequests(),[row])
 assert.equal((await f.decideAccess('solicitante',true)).status,'approved')
 assert.equal((await f.decideAccess('solicitante',false)).status,'rejected')
 assert.deepEqual(await f.deleteAccessAccount('solicitante'),{user_id:'solicitante',deleted:true})
 assert.deepEqual(calls,[['access_requests',undefined],['decide_access',{p_user_id:'solicitante',p_approve:true}],['decide_access',{p_user_id:'solicitante',p_approve:false}],['delete_access_account',{p_user_id:'solicitante'}]])
 await assert.rejects(service(async()=>({error:new Error('forbidden')})).listAccessRequests(),/forbidden/)
 await assert.rejects(service(async()=>({data:null})).listAccessRequests(),/leer/)
 await assert.rejects(service(async()=>({data:{user_id:'otra',status:'approved',decided_at:'hoy'}})).decideAccess('solicitante',true),/confirmar/)
 await assert.rejects(service(async()=>({data:{user_id:'otra',deleted:true}})).deleteAccessAccount('solicitante'),/confirmar/)
})

function uiFixture(path, mocks={}, name='default') {
 const exports={},slots=[],effects=[]
 let index=0
 const stub=new Proxy({}, {get:(_,key)=>key})
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>v===b[i])
 const react={
  useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},
  useRef(initial){const i=index++;return slots[i]??={current:initial}},
  useCallback(fn,deps){const i=index++;if(!same(slots[i]?.deps,deps))slots[i]={fn,deps};return slots[i].fn},
  useEffect(fn,deps){const i=index++;if(!same(slots[i]?.deps,deps)){effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()}})}},
 }
 new Function('exports','require',transpile(readFileSync(path,'utf8')+(name==='default'?'':`\nexport { ${name} }`)))(exports,id=>{
  if(id==='react/jsx-runtime')return {jsx,jsxs:jsx}
  if(id==='react')return react
  if(id==='expo-router')return {useRouter:()=>({})}
  if(id.endsWith('/shell'))return {usePiso:()=>40}
  if(id.endsWith('/icons'))return {ICON_COLOR:{foreground:'white',muted:'gray'},IconBack:'IconBack'}
  return mocks[id.split('/').at(-1)]??stub
 })
 return {
  render(props){index=0;return flatten(exports[name](props))},
  effects(){effects.splice(0).forEach(fn=>fn())},
  cleanup(){slots.forEach(slot=>slot?.cleanup?.())},
 }
}

test('pantalla pendiente muestra decisión viva, reconsulta sin duplicados y permite salir tras error', async () => {
 let access={status:'pending',is_admin:false}, accessError=null,logoutFailure=true
 const request=deferred(),calls=[]
 const f=uiFixture('app/acceso-pendiente.tsx',{session:{
  useAccessStatus:()=>access,useAccessError:()=>accessError,useAuthUser:()=>({email:'cuenta@gmail.com'}),
  refrescarAcceso:()=>{calls.push('recheck');return request.promise},
  endSession:async()=>{calls.push('logout');if(logoutFailure)throw Error('offline')},
 }})
 let ui=f.render()
 assert.equal(ui.find(n=>n.type==='PantallaAcceso').props.titulo,'Solicitud pendiente')
 const refresh=ui.find(n=>n.props?.label==='Volver a consultar').props.onPress
 const first=refresh();await refresh()
 assert.deepEqual(calls,['recheck'])
 assert.equal(f.render().find(n=>n.props?.label==='Cerrar sesión').props.disabled,true)
 request.resolve();await first
 access={status:'rejected',is_admin:false};ui=f.render()
 assert.equal(ui.find(n=>n.type==='PantallaAcceso').props.titulo,'Acceso no aprobado')
 assert.equal(ui.some(n=>n.props?.label==='Crear cuenta'),false)
 await ui.find(n=>n.props?.label==='Cerrar sesión').props.onPress()
 assert.match(f.render().find(n=>n.type==='FormError').props.message,/cerrar la sesión/)
 logoutFailure=false
 await f.render().find(n=>n.props?.label==='Cerrar sesión').props.onPress()
 access=null;accessError='No se pudo verificar el acceso';ui=f.render()
 assert.equal(ui.find(n=>n.type==='PantallaAcceso').props.titulo,'Verificar acceso')
 assert.equal(ui.find(n=>n.type==='FormError').props.message,accessError)
 assert.equal(ui.find(n=>n.props?.label==='Volver a consultar').props.busy,false)
 access={status:'approved',is_admin:false}
 assert.equal(f.render().find(n=>n.type==='PantallaAcceso').props.titulo,'Acceso aprobado')
})

const account=(id,status='pending')=>({user_id:id,email:`${id}@gmail.com`,display_name:id,username:id,avatar_url:null,status,requested_at:'2026-09-07T00:00:00Z',decided_at:null})

test('ruta admin no monta la lista sin permiso y cambia su instancia cuando cambia la cuenta', () => {
 let admin=false,uid='owner'
 const f=uiFixture('app/ajustes/accesos.tsx',{
  session:{useIsAccessAdmin:()=>admin,useAuthUser:()=>({id:uid})},
  'react-native':{useWindowDimensions:()=>({width:390}),Text:'Text',View:'View'},
 })
 assert.equal(f.render().some(n=>n.type==='ListaSolicitudes'),false)
 assert.ok(f.render().some(n=>n.props?.accessibilityRole==='alert'))
 admin=true
 const first=f.render().find(n=>n.type==='ListaSolicitudes')
 assert.equal(first.props.administradorId,'owner')
 uid='other'
 assert.equal(f.render().find(n=>n.type==='ListaSolicitudes').props.administradorId,'other')
 admin=false
 assert.equal(f.render().some(n=>n.type==='ListaSolicitudes'),false)
})

test('admin recupera lectura fallida, confirma aprobación una vez y conserva rechazo ante fallo remoto', async () => {
 let failLoad=true,failDecision=false
 const decision=deferred(),calls=[]
 const f=uiFixture('src/ui/SolicitudesAcceso.tsx',{acceso:{
  listAccessRequests:async()=>{calls.push('list');if(failLoad)throw Error('offline');return [account('owner','approved'),account('new'),account('denied','rejected')]},
  decideAccess:(id,approve)=>{calls.push([id,approve]);return failDecision?Promise.reject(Error('forbidden')):decision.promise},
 }},'ListaSolicitudes')
 const render=()=>f.render({administradorId:'owner'})
 render();f.effects();await tick()
 let ui=render()
 assert.match(ui.find(n=>n.type==='FormError').props.message,/cargar/)
 assert.equal(ui.find(n=>n.props?.label==='Reintentar').props.busy,false)
 failLoad=false
 await ui.find(n=>n.props?.label==='Reintentar').props.onPress()
 ui=render()
 assert.equal(ui.filter(n=>n.type==='Menu').length,2,'el owner no tiene acciones contra su propio acceso')
 const menu=ui.find(n=>n.props?.label==='Decidir acceso de new@gmail.com')
 menu.props.items.find(i=>i.label==='Aprobar acceso').onPress()
 menu.props.items.find(i=>i.label==='Aprobar acceso').onPress()
 assert.deepEqual(calls.at(-1),['new',true]);assert.equal(calls.filter(Array.isArray).length,1)
 assert.ok(render().find(n=>n.props?.label==='Actualizar').props.disabled)
 decision.resolve({user_id:'new',status:'approved',decided_at:'2026-09-07T01:00:00Z'});await tick()
 ui=render()
 assert.deepEqual(ui.find(n=>n.props?.label==='Decidir acceso de new@gmail.com').props.items.map(i=>i.label),['Rechazar acceso','Eliminar cuenta'])
 failDecision=true
 ui.find(n=>n.props?.label==='Decidir acceso de denied@gmail.com').props.items[0].onPress();await tick()
 ui=render()
 assert.match(ui.find(n=>n.type==='FormError').props.message,/confirmar/)
 assert.deepEqual(ui.find(n=>n.props?.label==='Decidir acceso de denied@gmail.com').props.items.map(i=>i.label),['Aprobar acceso','Eliminar cuenta'])
 assert.equal(ui.find(n=>n.props?.label==='Actualizar').props.disabled,false)
 f.cleanup()
})


test('el borrado exige confirmación, se ejecuta una sola vez y saca la cuenta de la tabla', async () => {
 const deletion=deferred(),calls=[]
 const f=uiFixture('src/ui/SolicitudesAcceso.tsx',{acceso:{
  listAccessRequests:async()=>[account('owner','approved'),account('target','approved')],
  deleteAccessAccount:id=>{calls.push(id);return deletion.promise},
 }},'ListaSolicitudes')
 const render=()=>f.render({administradorId:'owner'})
 render();f.effects();await tick()
 let ui=render()
 const menu=ui.find(n=>n.props?.label==='Decidir acceso de target@gmail.com')
 menu.props.items.find(i=>i.label==='Eliminar cuenta').onPress()
 ui=render()
 const confirmar=ui.find(n=>n.type==='Confirmar')
 assert.equal(confirmar.props.visible,true)
 confirmar.props.onConfirmar()
 confirmar.props.onConfirmar()
 assert.deepEqual(calls,['target'])
 deletion.resolve({user_id:'target',deleted:true});await tick()
 ui=render()
 assert.equal(ui.some(n=>n.props?.label==='Decidir acceso de target@gmail.com'),false)
 assert.equal(ui.some(n=>n.props?.label==='Decidir acceso de owner@gmail.com'),false)
 f.cleanup()
})

test('una lectura administrativa tardía no actualiza la vista después de salir', async () => {
 const load=deferred()
 const f=uiFixture('src/ui/SolicitudesAcceso.tsx',{acceso:{listAccessRequests:()=>load.promise}},'ListaSolicitudes')
 f.render({administradorId:'owner'});f.effects();f.cleanup()
 load.resolve([account('private')]);await tick()
 assert.equal(f.render({administradorId:'owner'}).some(n=>n.type==='Menu'),false)
})

test('enlace de Ajustes usa exclusivamente el permiso administrativo del servidor', () => {
 const source=ts.createSourceFile('settings.tsx',readFileSync('app/ajustes/index.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 let category
 function visit(n){
  if(ts.isObjectLiteralExpression(n)&&n.properties.some(p=>ts.isPropertyAssignment(p)&&p.name.getText(source)==='id'&&p.initializer.getText(source)==="'accesos'"))category=n
  ts.forEachChild(n,visit)
 }
 visit(source);assert.ok(category)
 for(const admin of [false,true]) {
  const exports={},navigation=[]
  new Function('exports','require','esAdmin','escritorio','cuentaAuth','ListaSolicitudes','GrupoAjustes','FilaAjuste','IconUser','ICON_COLOR','router',transpile(`export const category=${category.getText(source)}`))(exports,()=>({jsx,jsxs:jsx}),admin,false,null,'ListaSolicitudes','GrupoAjustes','FilaAjuste','IconUser',{muted:'gray'},{push:p=>navigation.push(p)})
  assert.equal(exports.category.visible,admin)
  flatten(exports.category.bloques).find(n=>n.type==='FilaAjuste').props.onPress()
  assert.deepEqual(navigation,['/ajustes/accesos'])
 }
 const desktop={},owner={id:'owner'}
 new Function('exports','require','esAdmin','escritorio','cuentaAuth','ListaSolicitudes','GrupoAjustes','FilaAjuste','IconUser','ICON_COLOR','router',transpile(`export const category=${category.getText(source)}`))(desktop,()=>({jsx,jsxs:jsx}),true,true,owner,'ListaSolicitudes','GrupoAjustes','FilaAjuste','IconUser',{muted:'gray'},{push:()=>{}})
 const table=flatten(desktop.category.bloques).find(n=>n.type==='ListaSolicitudes')
 assert.equal(table.props.administradorId,'owner')
 assert.equal(table.props.integrada,true)
})


const token = role => `header.${Buffer.from(JSON.stringify({name:'Usuario 🌎',role})).toString('base64url')}.signature`
const sessionResult = role => ({data:{session:{access_token:token(role)}},error:null})

test('sesión authenticated evita refresh; app_pending espera la renovación antes de continuar', async () => {
 for(const role of ['authenticated','app_pending']) {
  const refresh=deferred(),calls=[]
  const f=service(()=>assert.fail('el helper no decide acceso por RPC'),{
   getSession:async()=>{calls.push('get');return sessionResult(role)},
   refreshSession:()=>{calls.push('refresh');return refresh.promise},
  })
  let finished=false
  const work=f.ensureApprovedSession().then(()=>finished=true)
  await tick()
  assert.equal(finished,role==='authenticated')
  assert.deepEqual(calls,role==='authenticated'?['get']:['get','refresh'])
  refresh.resolve(sessionResult('authenticated'));await work
  assert.equal(finished,true)
 }
})

test('renovar sesión propaga errores y nunca continúa con sesión nula o todavía pendiente', async () => {
 const failure=new Error('auth unavailable')
 for(const result of [{error:failure,data:{session:null}},{error:null,data:{session:null}}]) {
  const f=service(null,{getSession:async()=>result,refreshSession:()=>assert.fail('no hay sesión para renovar')})
  await assert.rejects(f.ensureApprovedSession(),result.error?e=>e===failure:/sesión terminó/)
 }
 for(const result of [{error:failure,data:{session:null}},{error:null,data:{session:null}},sessionResult('app_pending')]) {
  const f=service(null,{getSession:async()=>sessionResult('app_pending'),refreshSession:async()=>result})
  await assert.rejects(f.ensureApprovedSession(),result.error?e=>e===failure:/sesión terminó|todavía no se actualizó/)
 }
})

test('un JWT ilegible provoca una renovación limitada; el rol no sustituye la aprobación del servidor', async () => {
 for(const initial of ['broken', 'header.%%%.signature', token(undefined), token('unknown')]) {
  let refreshes=0
  const f=service(null,{
   getSession:async()=>({data:{session:{access_token:initial}},error:null}),
   refreshSession:async()=>{refreshes++;return sessionResult('authenticated')},
  })
  await f.ensureApprovedSession()
  assert.equal(refreshes,1)
 }
 const f=service(null,{
  getSession:async()=>sessionResult('app_pending'),
  refreshSession:async()=>({data:{session:{access_token:'broken'}},error:null}),
 })
 await assert.rejects(f.ensureApprovedSession(),/todavía no se actualizó/)
})
