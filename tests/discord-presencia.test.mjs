import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const code = ts.transpileModule(readFileSync('src/state/discord.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const flush = async () => { for(let i=0;i<6;i++) await new Promise(r=>setImmediate(r)) }
const deferred = () => { let resolve; const promise = new Promise(r=>resolve=r); return {promise,resolve} }
function fixture({ raw = null, storage, write, configure } = {}) {
  const sent = [], configs = [], written = [], callbacks = new Set(), timers = new Map()
  let remoto
  let session = {user:{id:'a'},access:{status:'approved'}}, listening = {track:{title:'Tema'},sonando:true,posicionMs:50,actualizadoEn:100}, seq=0
  const initial = {enabled:false,applicationId:'',status:'disabled'}
  const bridge = {
    estado:async()=>initial, alCambiar:()=>()=>{},
    configurar:async c=>{configs.push(c);if(configure)await configure(c);return {...c,status:c.enabled?'ready':'disabled'}},
    publicar:async a=>{sent.push(a);return {...configs.at(-1),status:a?'published':'ready'}},
  }
  const modules={
    '@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async key=>storage ? storage(key) : raw,setItem:async(...a)=>{written.push(a);if(write)await write(...a)}}},
    './discordRemoto': { iniciarDiscordRemoto: (_id, adapter) => { remoto = adapter; return () => {} } },
    react:{useEffect(){}},
    '../services/actividadEscucha':{actividadParaCompartir:a=>a.autorizada?{title:a.track.title}:null},
    './escucha':{leerEscuchaParaIntegraciones:()=>listening,suscribirActividadParaIntegraciones:fn=>{callbacks.add(fn);return()=>callbacks.delete(fn)}},
    './playback':{subscribePlayback:fn=>{callbacks.add(fn);return()=>callbacks.delete(fn)}},
    './session':{getSession:()=>session,useUser:()=>session.user},
    './store':{createStore(initial){let state=initial;return {get:()=>state,set:p=>{state={...state,...p}},subscribe(){return()=>{}}}},useStore:(s,fn)=>fn(s.get())},
  }
  const exports={}
  new Function('exports','require','globalThis','setTimeout','clearTimeout','setInterval','clearInterval',code)(exports,k=>{assert.ok(k in modules,k);return modules[k]}, {dnmusicEscritorio:{discord:bridge}},(fn)=>{timers.set(++seq,fn);return seq},id=>timers.delete(id),(fn)=>{timers.set(++seq,fn);return seq},id=>timers.delete(id))
  return {api:exports,get remoto(){return remoto},sent,configs,written,timers,callbacks,session:s=>session=s,listening:l=>{listening=l;for(const fn of callbacks)fn()},tick:()=>{for(const fn of [...timers.values()])fn()}}
}
const enabled = JSON.stringify({enabled:true,applicationId:'123456789012345678'})
test('Discord queda desactivado por defecto y no entrega canciones sin consentimiento',async()=>{
 const h=fixture();const close=h.api.iniciarDiscord('a');await flush();h.tick();await flush()
 assert.ok(h.configs.every(c=>!c.enabled));assert.ok(h.sent.every(a=>a===null))
 assert.equal(h.configs.at(-1).applicationId,'1548502947623739552');close()
})
test('consentimiento guardado comparte, pausa borra y logout deshabilita puente',async()=>{
 const h=fixture({raw:enabled});const close=h.api.iniciarDiscord('a');await flush()
 assert.equal(h.sent.at(-1).title,'Tema');h.listening(null);await flush();assert.equal(h.sent.at(-1),null)
 close();await flush();assert.equal(h.configs.at(-1).enabled,false);assert.equal(h.callbacks.size,0);assert.equal(h.timers.size,0)
})
test('cambio de cuenta mientras carga no habilita preferencia de la cuenta anterior',async()=>{
 const read=deferred();const h=fixture({storage:key=>key.endsWith(':a')?read.promise:Promise.resolve(null)})
 const close=h.api.iniciarDiscord('a');await flush();close();h.session({user:{id:'b'},access:{status:'approved'}})
 const closeB=h.api.iniciarDiscord('b');await flush();read.resolve(enabled);await flush()
 assert.ok(h.configs.every(c=>!c.enabled));assert.ok(h.sent.every(a=>a===null));closeB()
})
test('cualquier cambio de cuenta o acceso revocado retira presencia antes del efecto React',async()=>{
 const h=fixture({raw:enabled});const close=h.api.iniciarDiscord('a');await flush()
 h.session({user:{id:'b'},access:{status:'approved'}});h.tick();await flush();assert.equal(h.sent.at(-1),null);close()
})
test('ID inválido no llega a main y revocación persiste sólo en cuenta actual',async()=>{
 const h=fixture({raw:enabled});const close=h.api.iniciarDiscord('a');await flush()
 const before=h.configs.length;await h.api.configurarDiscord({enabled:true,applicationId:'secret-token'});assert.equal(h.configs.length,before)
 await h.api.configurarDiscord({enabled:false,applicationId:'123456789012345678'})
 assert.equal(h.configs.at(-1).enabled,false);assert.equal(h.written.at(-1)[0],'discord-presence:v1:a');assert.equal(JSON.parse(h.written.at(-1)[1]).enabled,false);close()
})
test('preferencia corrupta no habilita actividad y estado vacío no genera IPC en cada progreso',async()=>{
 const h=fixture({raw:'{broken'});const close=h.api.iniciarDiscord('a');await flush();const count=h.sent.length
 for(let i=0;i<20;i++) h.listening(null)
 await flush();assert.equal(h.sent.length,count);assert.ok(h.configs.every(c=>!c.enabled));close()
})


test('revocación con disco lento sobrevive a cerrar y reabrir la misma cuenta',async()=>{
 const saved=deferred();const h=fixture({raw:enabled,write:()=>saved.promise})
 const close=h.api.iniciarDiscord('a');await flush()
 const change=h.api.configurarDiscord({enabled:false,applicationId:'123456789012345678'});await flush()
 close();const startIndex=h.configs.length;const closeAgain=h.api.iniciarDiscord('a');await flush()
 assert.ok(h.configs.slice(startIndex).every(c=>!c.enabled))
 saved.resolve();await change;await flush()
 assert.equal(h.configs.at(-1).enabled,false);assert.equal(h.api.useDiscord().estado.enabled,false);closeAgain()
})
test('revocación persiste aunque el ACK llegue después de salir de la cuenta',async()=>{
 const ack=deferred();const h=fixture({raw:enabled,configure:c=>!c.enabled&&c.applicationId?ack.promise:Promise.resolve()})
 const close=h.api.iniciarDiscord('a');await flush()
 const change=h.api.configurarDiscord({enabled:false,applicationId:'123456789012345678'});await flush();close()
 assert.equal(JSON.parse(h.written.at(-1)[1]).enabled,false)
 const startIndex=h.configs.length;const closeAgain=h.api.iniciarDiscord('a');await flush();ack.resolve();await change;await flush()
 assert.ok(h.configs.slice(startIndex).every(c=>!c.enabled));assert.equal(h.api.useDiscord().estado.enabled,false);closeAgain()
})
test('fallo de disco no restaura consentimiento viejo durante la misma sesión',async()=>{
 const h=fixture({raw:enabled,write:async()=>{throw Error('disk')}})
 const close=h.api.iniciarDiscord('a');await flush();await h.api.configurarDiscord({enabled:false,applicationId:'123456789012345678'});close()
 const startIndex=h.configs.length;const closeAgain=h.api.iniciarDiscord('a');await flush()
 assert.ok(h.configs.slice(startIndex).every(c=>!c.enabled));assert.equal(h.api.useDiscord().estado.enabled,false);closeAgain()
})

test('cancel remoto revoca antes del ACK pendiente y la respuesta vieja no habilita después',async()=>{
 const ack=deferred();const h=fixture({configure:c=>c.enabled?ack.promise:Promise.resolve()})
 const close=h.api.iniciarDiscord('a');await flush()
 const operation=h.remoto.cambiar(true);await flush()
 assert.equal(h.api.useDiscord().guardando,true)
 operation.cancelar();await flush()
 assert.equal(h.configs.at(-1).enabled,false)
 assert.equal(JSON.parse(h.written.at(-1)[1]).enabled,false)
 ack.resolve();assert.equal(await operation.terminado,false);await flush()
 assert.equal(h.api.useDiscord().estado.enabled,false);assert.equal(h.api.useDiscord().guardando,false)
 close()
})

test('cancel remoto no revoca una decisión local posterior ni reenciende un opt-out',async()=>{
 const h=fixture(),close=h.api.iniciarDiscord('a');await flush()
 const operation=h.remoto.cambiar(true);assert.equal(await operation.terminado,true);await flush()
 await h.api.configurarDiscord({enabled:true,applicationId:'123456789012345678'});await flush()
 const count=h.configs.length;operation.cancelar();await flush()
 assert.equal(h.configs.length,count);assert.equal(h.api.useDiscord().estado.enabled,true)
 const disable=h.remoto.cambiar(false);await disable.terminado;disable.cancelar();await flush()
 assert.equal(h.api.useDiscord().estado.enabled,false);close()
})

test('cancel remoto tardío no altera la configuración de otra cuenta',async()=>{
 const h=fixture(),close=h.api.iniciarDiscord('a');await flush()
 const operation=h.remoto.cambiar(true);await operation.terminado;close()
 h.session({user:{id:'b'},access:{status:'approved'}})
 const closeB=h.api.iniciarDiscord('b');await flush()
 await h.api.configurarDiscord({enabled:true,applicationId:'123456789012345678'});await flush()
 const count=h.configs.length;operation.cancelar();await flush()
 assert.equal(h.configs.length,count);assert.equal(h.api.useDiscord().estado.enabled,true)
 closeB()
})


test('alta remota provisional no se restaura al reiniciar; sólo confirmar guarda consentimiento',async()=>{
 const h=fixture(),close=h.api.iniciarDiscord('a');await flush()
 const operation=h.remoto.cambiar(true);await operation.terminado;await flush()
 assert.equal(h.api.useDiscord().estado.enabled,true)
 assert.equal(JSON.parse(h.written.at(-1)[1]).enabled,false)
 close();const index=h.configs.length;const closeAgain=h.api.iniciarDiscord('a');await flush()
 assert.ok(h.configs.slice(index).every(c=>!c.enabled))
 const confirmed=h.remoto.cambiar(true);await confirmed.terminado;confirmed.confirmar();await flush()
 assert.equal(JSON.parse(h.written.at(-1)[1]).enabled,true)
 closeAgain()
})
