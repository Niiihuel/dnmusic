import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const code=ts.transpileModule(readFileSync('src/state/escucha.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r))}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
const track={id:'song',videoId:'song',audioPath:'audio/song.m4a',durationMs:300000,title:'Tema',artist:'Artista'}
function fixture({playing=true,owner='pc',timestamp=true,send,claim,read}={}){
 let now=100000, seq=0, hooks, registered, fetches=0
 const timers=new Map(),listeners=new Set(),published=[],sent=[]
 let row={deviceId:owner,deviceNombre:owner==='pc'?'Mi PC':'Teléfono',track,suena:playing,posicionMs:12000,arrancadoEn:playing?now:null,revision:3,actualizadoEn:timestamp?now:null}
 let p={tracks:[],index:-1,manual:null,upNext:[],origin:null,wantPlay:false,positionMs:0,durationMs:300000,error:null}
 const emitPlayback=patch=>{p={...p,...patch};for(const l of listeners)l()}
 const state=()=>({escucha:row,cola:{tracks:[track],index:0,upNext:[],manual:null,origin:null},ahora:now})
 const modules={
 '../services/lecturaViva':{LATIDO_ESCUCHA_MS:20000,VIGENCIA_ESCUCHA_MS:65000},
 'react-native':{AppState:{addEventListener:()=>({remove(){}})}},
 '../lib/supabase':{getSupabase:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'user'}}}})}})},
 '../lib/dispositivo':{idDispositivo:async()=>'ios',nombreDispositivo:()=> 'Mi iPhone'},
 '../services/escucha':{fetchEscuchaEstado:async()=>{fetches++;return read?read(state(),fetches):state()},publicarEscucha:async a=>{published.push(a);if(claim)return claim(a);row={...row,...a,actualizadoEn:now,revision:row.revision+1,arrancadoEn:a.suena?now:null};return row.revision},suscribirEscucha:(_,__,h)=>{hooks=h;h.onConexion('conectado');h.onPresentes([{deviceId:'pc',nombre:'Mi PC'},{deviceId:'ios',nombre:'Mi iPhone'}]);return{listo:Promise.resolve(),desuscribir(){},mandarA:async(...a)=>{sent.push(a);if(send)return send(...a)}}}},
 './jam':{hayJam:()=>false},
 './playback':{getPlaybackState:()=>p,registerEscucha:c=>{registered=c},subscribePlayback:l=>{listeners.add(l);return()=>listeners.delete(l)},escuchaAplicar:emitPlayback,escuchaSoltar:()=>emitPlayback({tracks:[],index:-1,wantPlay:false}),escuchaTransporte:(wantPlay,positionMs)=>emitPlayback({wantPlay,positionMs}),resumePlayback:()=>emitPlayback({wantPlay:true}),reportProgress:(positionMs,durationMs)=>emitPlayback({positionMs,durationMs})},
 './store':{createStore(initial){let s=initial;const ls=new Set();return{get:()=>s,set(patch){const v=typeof patch==='function'?patch(s):patch;if(!Object.keys(v).some(k=>!Object.is(v[k],s[k])))return;s={...s,...v};for(const l of ls)l()},subscribe:l=>{ls.add(l);return()=>ls.delete(l)}}},useStore:(s,fn)=>fn(s.get())},
 }
 const api={}
 const schedule=(fn,ms,interval=false)=>{timers.set(++seq,{fn,at:now+ms,interval:interval?ms:0});return seq}
 new Function('exports','require','module','Date','setTimeout','clearTimeout','setInterval','clearInterval',code)(api,k=>{assert.ok(k in modules,k);return modules[k]}, {},class extends Date{static now(){return now}},(f,ms)=>schedule(f,ms),id=>timers.delete(id),(f,ms)=>schedule(f,ms,true),id=>timers.delete(id))
 return{api,published,sent,async start(){await api.iniciarEscucha();await flush()},get p(){return p},emit(patch){row={...row,...patch};hooks.onFila(row)},tomar(pedido){hooks.onTomar(pedido)},presence(ds){hooks.onPresentes(ds)},connection(c){hooks.onConexion(c)},playback:emitPlayback,remote(patch){row={...row,...patch}},get registered(){return registered},async advance(ms){const target=now+ms;for(;;){const next=[...timers].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;const[id,t]=next;now=t.at;if(t.interval)t.at+=t.interval;else timers.delete(id);t.fn();await flush()}now=target;await flush()},close(){api.desconectarEscucha()}}
}

test('sonando exige fecha vigente y presencia; pausado no se presenta como reproducción activa',async()=>{
 const h=fixture();await h.start();assert.equal(h.api.useActividadEscucha().estado,'sonando');assert.equal(h.api.useDispositivoQueSuena(),'pc')
 h.emit({suena:false,revision:4});assert.equal(h.api.useActividadEscucha().estado,'pausado');assert.equal(h.api.useDispositivoQueSuena(),null)
 h.emit({suena:true,revision:5});await h.advance(70000);assert.equal(h.api.useActividadEscucha().estado,'desconectado');assert.equal(h.api.useDispositivoQueSuena(),null)
 h.close()
 const missing=fixture({timestamp:false});await missing.start();assert.equal(missing.api.useActividadEscucha().estado,'preparando');missing.close()
})

test('ACK de envío no cierra selector ni confirma; sólo dueño y estado servidor nuevos confirman',async()=>{
 const h=fixture();await h.start();h.api.abrirSelectorDispositivos()
 const promise=h.api.mandarEscuchaA('ios');await flush() // traer local espera audio real
 assert.equal(h.api.useTransferenciaEscucha().estado,'pendiente');assert.equal(h.api.useSelectorDispositivos(),true)
 h.api.reportarActividadEscucha(true);await h.advance(300)
 assert.equal(await promise,true);assert.equal(h.api.useTransferenciaEscucha().estado,'confirmada');h.close()
 const push=fixture({owner:'ios'});await push.start();push.playback({tracks:[track],index:0,wantPlay:true});push.api.abrirSelectorDispositivos()
 const moving=push.api.mandarEscuchaA('pc');await flush()
 assert.equal(push.api.useTransferenciaEscucha().estado,'pendiente');assert.deepEqual(push.sent,[['pc',true,4]])
 push.emit({deviceId:'pc',revision:4,suena:false});assert.equal(push.api.useTransferenciaEscucha().estado,'pendiente')
 push.emit({revision:5,suena:true});assert.equal(await moving,true);assert.equal(push.api.useSelectorDispositivos(),true);push.close()
})

test('traer una escucha pausada conserva posición y pausa tras reclamar el servidor',async()=>{
 const request=deferred(),h=fixture({playing:false,claim:()=>request.promise});await h.start()
 const promise=h.api.traerEscuchaAca();await flush()
 assert.equal(h.api.useEscuchaEspejo(),true);assert.equal(h.p.wantPlay,false)
 request.resolve(4);assert.equal(await promise,true)
 assert.equal(h.p.wantPlay,false);assert.equal(h.p.positionMs,12000);assert.equal(h.api.useEscuchaEspejo(),false);h.close()
})

test('error al reclamar deja el espejo y la música remota intactos',async()=>{
 const h=fixture({claim:async()=>{throw Error('Servidor sin conexión')}});await h.start()
 assert.equal(await h.api.traerEscuchaAca(),false);assert.equal(h.api.useEscuchaEspejo(),true)
 assert.equal(h.api.useTransferenciaEscucha().estado,'error');assert.match(h.api.useTransferenciaEscucha().error,/Servidor/);h.close()
})

test('timeout termina la espera aunque envío nunca resuelva; logout invalida respuestas tardías',async()=>{
 const pending=deferred(),h=fixture({owner:'ios',send:()=>pending.promise});await h.start();h.playback({tracks:[track],index:0,wantPlay:false})
 const p=h.api.mandarEscuchaA('pc');await h.advance(15000);assert.equal(await p,false);assert.equal(h.api.useTransferenciaEscucha().estado,'error')
 h.close();pending.reject(Error('tarde'));await flush();assert.equal(h.api.useTransferenciaEscucha(),null)
})

test('wantPlay no publica sonando antes de que el motor confirme audio',async()=>{
 const h=fixture({owner:'ios',playing:false});await h.start();h.playback({tracks:[track],index:0,wantPlay:true})
 await h.advance(300);assert.equal(h.published.at(-1).suena,false);assert.equal(h.api.useActividadEscucha().estado,'preparando')
 h.api.reportarActividadEscucha(true);await h.advance(300);assert.equal(h.published.at(-1).suena,true);assert.equal(h.api.useActividadEscucha().estado,'sonando');h.close()
})

test('lectura bloqueada al traer responde timeout y su respuesta tardía no reclama la fila',async()=>{
 const slow=deferred(),h=fixture({read:(s,n)=>n===1?s:slow.promise});await h.start()
 const p=h.api.traerEscuchaAca();await h.advance(15000);assert.equal(await p,false)
 slow.resolve({escucha:{deviceId:'pc',track,suena:true,revision:3,actualizadoEn:100000},cola:null,ahora:115000})
 await flush();assert.equal(h.published.length,0);assert.equal(h.api.useEscuchaEspejo(),true);h.close()
})

test('respuesta de un envío expirado no altera una transferencia posterior',async()=>{
 const old=deferred(),next=deferred();let sends=0
 const h=fixture({owner:'ios',playing:false,send:()=>++sends===1?old.promise:next.promise});await h.start()
 const a=h.api.mandarEscuchaA('pc');await h.advance(15000);assert.equal(await a,false)
 const b=h.api.mandarEscuchaA('pc');old.reject(Error('tarde'));await flush()
 assert.equal(h.api.useTransferenciaEscucha().estado,'pendiente')
 h.emit({deviceId:'pc',revision:4,suena:false,actualizadoEn:115000});assert.equal(await b,true);next.resolve();h.close()
})

test('una publicación atrasada no recupera el dueño después de una revisión remota más nueva',async()=>{
 const slow=deferred(),h=fixture({owner:'ios',playing:false,claim:()=>slow.promise});await h.start()
 h.playback({tracks:[track],index:0,wantPlay:true});h.api.reportarActividadEscucha(true);await h.advance(300)
 h.emit({deviceId:'pc',revision:7,suena:true});slow.resolve(4);await flush()
 assert.equal(h.api.useDispositivoSeleccionado(),'pc');assert.equal(h.api.useEscuchaEspejo(),true);h.close()
})

test('RPC de reclamo en vuelo sobrevive timeout como barrera; eco tardío propio respeta pausa',async()=>{
 const slow=deferred(),h=fixture({claim:()=>slow.promise});await h.start()
 const p=h.api.traerEscuchaAca();await flush();assert.equal(h.published.length,1)
 await h.advance(15000);assert.equal(await p,false)
 assert.equal(await h.api.traerEscuchaAca(),false);assert.match(h.api.useTransferenciaEscucha().error,/operación pendiente/);assert.equal(h.published.length,1)
 h.emit({deviceId:'ios',revision:4,suena:false,actualizadoEn:115000})
 assert.equal(h.p.wantPlay,false);assert.equal(h.api.useDispositivoQueSuena(),null)
 slow.resolve(4);await flush();assert.equal(h.p.wantPlay,false);h.close()
})

test('pedido dirigido con revisión vieja no reanuda una pausa posterior',async()=>{
 const h=fixture({playing:true});await h.start();h.remote({revision:4,suena:false})
 h.tomar({destino:'ios',suena:true,revision:3});await flush()
 assert.equal(h.published.length,0);assert.equal(h.api.useEscuchaEspejo(),true)
 assert.match(h.api.useTransferenciaEscucha().error,/reproducción cambió/);h.close()
})

test('dueño nuevo con otra canción no confirma que la canción solicitada fue transferida',async()=>{
 const h=fixture({owner:'ios',playing:false});await h.start()
 const p=h.api.mandarEscuchaA('pc');h.emit({deviceId:'pc',revision:4,suena:false,track:{...track,id:'otra'}})
 assert.equal(h.api.useTransferenciaEscucha().estado,'pendiente');await h.advance(15000);assert.equal(await p,false);h.close()
})

test('logout libera las barreras de la sesión anterior sin reutilizar sus respuestas',async()=>{
 const old=deferred();let calls=0
 const h=fixture({owner:'ios',playing:false,claim:()=>++calls===1?old.promise:Promise.resolve(5)});await h.start()
 h.playback({tracks:[track],index:0,wantPlay:true});await h.advance(300);assert.equal(calls,1)
 h.close();await h.start();h.playback({tracks:[track],index:0,wantPlay:false});await h.advance(300);assert.equal(calls,2)
 old.resolve(4);await flush();assert.equal(h.api.useDispositivoSeleccionado(),'ios');h.close()
})

test('traer desde selector conserva una pausa remota ocurrida durante el refetch',async()=>{
 const h=fixture({read:(s,n)=>n===1?s:{...s,escucha:{...s.escucha,suena:false,arrancadoEn:null,posicionMs:23000,revision:4}},claim:async()=>5})
 await h.start();assert.equal(h.p.wantPlay,true)
 assert.equal(await h.api.traerEscuchaAca(),true)
 assert.equal(h.p.wantPlay,false);assert.equal(h.p.positionMs,23000);h.close()
})

test('mandar publica lo pendiente una vez y cancela debounce viejo antes de fijar la revisión esperada',async()=>{
 const h=fixture({owner:'ios',playing:false});await h.start()
 h.playback({tracks:[track],index:0,wantPlay:false}) // debounce300 pendiente
 const p=h.api.mandarEscuchaA('pc');await flush()
 assert.equal(h.published.length,1);assert.deepEqual(h.sent,[['pc',false,4]])
 await h.advance(300);assert.equal(h.published.length,1)
 h.emit({deviceId:'pc',revision:5,suena:false});assert.equal(await p,true);h.close()
})

test('snapshot externo exige audio local real y retira la actividad al pausar',async()=>{
 const h=fixture({owner:'ios',playing:false});await h.start()
 h.playback({tracks:[track],index:0,wantPlay:true,positionMs:17000})
 assert.equal(h.api.leerEscuchaParaIntegraciones(),null)
 h.api.reportarActividadEscucha(true)
 assert.equal(h.api.leerEscuchaParaIntegraciones().posicionMs,17000)
 h.playback({wantPlay:false});assert.equal(h.api.leerEscuchaParaIntegraciones(),null);h.close()
})
test('snapshot externo refleja otro dispositivo sólo mientras su escucha está vigente',async()=>{
 const h=fixture();await h.start()
 assert.equal(h.api.leerEscuchaParaIntegraciones().track.id,'song')
 h.connection('desconectado');assert.equal(h.api.leerEscuchaParaIntegraciones(),null)
 h.connection('conectado');h.presence([{deviceId:'ios',nombre:'Teléfono'}]);assert.equal(h.api.leerEscuchaParaIntegraciones(),null);h.close()
})
