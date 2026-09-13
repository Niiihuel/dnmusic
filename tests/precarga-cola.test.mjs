import test from 'node:test'
import assert from 'node:assert/strict'
import { proximasCola } from '../src/lib/proximasCola.ts'
import { trabajosCompartidos } from '../src/lib/trabajosCompartidos.ts'
const track = id => ({ id, videoId: id, audioPath: `${id}.m4a` })
const tracks = ['a','b','c','d'].map(track)
const cola = (patch = {}) => ({ tracks, index:0, manual:null, upNext:[],shuffle:null,repetir:'no',...patch })
const ids = state => proximasCola(state).map(t=>t.id)
test('anticipa solamente las siguientes dos del orden real',()=>{
  assert.deepEqual(ids(cola()),['b','c'])
  assert.deepEqual(ids(cola({shuffle:[0,3,1,2]})),['d','b'])
  assert.deepEqual(ids(cola({index:2,shuffle:[0,3,1,2],repetir:'lista'})),['a','d'])
})
test('manual y radio tienen prioridad y retoman la lista en el lugar correcto',()=>{
  assert.deepEqual(ids(cola({manual:track('radio'),upNext:[track('manual')]})),['manual','b'])
  assert.deepEqual(ids(cola({index:3,manual:track('radio'),upNext:[track('siguiente')]})),['siguiente'])
})
test('repetir una no baja extras; evita duplicados y actual',()=>{
  assert.deepEqual(ids(cola({repetir:'una',upNext:[track('x')]})),[])
  assert.deepEqual(ids(cola({upNext:[track('a'),track('b'),track('b')]})),['b','c'])
  assert.deepEqual(ids(cola({tracks:[track('a')],repetir:'lista'})),[])
})
test('baraja con índices antiguos y cola vacía no generan candidatos inválidos',()=>{
  assert.deepEqual(ids(cola({shuffle:[0,90,3,-1,1]})),['d','b'])
  assert.deepEqual(ids(cola({tracks:[],index:-1})),[])
})
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
test('descarga y reproducción comparten una extracción, cancelar precarga no cancela al oyente',async()=>{
  const ejecutar=trabajosCompartidos(),fin=deferred(),abort=new AbortController();let pedidos=0,señal
  const iniciar=signal=>{pedidos++;señal=signal;return fin.promise}
  const pref=ejecutar('a',iniciar,abort.signal)
  const play=ejecutar('a',iniciar)
  const cancelado=assert.rejects(pref,{name:'AbortError'})
  abort.abort();await cancelado
  assert.equal(señal.aborted,false)
  fin.resolve('audio');assert.equal(await play,'audio');assert.equal(pedidos,1)
})
test('cambiar de playlist aborta la preparación que nadie más necesita',async()=>{
  const ejecutar=trabajosCompartidos(),abort=new AbortController();let señal
  const tarea=ejecutar('a',signal=>{señal=signal;return new Promise(()=>{})},abort.signal)
  await Promise.resolve()
  const cancelado=assert.rejects(tarea,{name:'AbortError'});abort.abort();await cancelado
  assert.equal(señal.aborted,true)
  assert.equal(await ejecutar('a',async()=>'nuevo'),'nuevo')
})
test('error no queda cacheado y una cancelación previa no inicia trabajo',async()=>{
  const ejecutar=trabajosCompartidos()
  await assert.rejects(ejecutar('a',async()=>{throw Error('sin red')}),/sin red/)
  assert.equal(await ejecutar('a',async()=>'ok'),'ok')
  const abort=new AbortController();abort.abort()
  await assert.rejects(ejecutar('a',()=>{throw Error('no debería iniciar')},abort.signal),{name:'AbortError'})
})

test('tocar el próximo tema adopta la extracción aunque React limpie primero la precarga',async()=>{
  const ejecutar=trabajosCompartidos(),fin=deferred(),abort=new AbortController();let pedidos=0,señal
  const iniciar=signal=>{pedidos++;señal=signal;return fin.promise}
  const previa=ejecutar('a',iniciar,abort.signal)
  await Promise.resolve()
  const cancelado=assert.rejects(previa,{name:'AbortError'})
  abort.abort()
  const actual=ejecutar('a',iniciar)
  await cancelado
  assert.equal(señal.aborted,false)
  fin.resolve('mismo archivo')
  assert.equal(await actual,'mismo archivo');assert.equal(pedidos,1)
})

test('ventana temporal respeta duración, tope por red y soporte de disco',async()=>{
 const {ventanaPrecarga,clasificarRedPrecarga}=await import('../src/lib/politicaPrecarga.ts')
 const songs=Array.from({length:9},(_,i)=>({...track(String(i)),durationMs:120000}))
 assert.equal(ventanaPrecarga(songs,'amplia',true).length,5)
 assert.equal(ventanaPrecarga(songs.map(t=>({...t,durationMs:400000})),'amplia',true).length,2)
 assert.equal(ventanaPrecarga(songs.map(t=>({...t,durationMs:NaN})),'amplia',true).length,4)
 assert.equal(ventanaPrecarga(songs,'datos',true).length,2)
 assert.equal(ventanaPrecarga(songs,'amplia',false).length,2)
 assert.deepEqual(ventanaPrecarga(songs,'no',true),[])
 assert.equal(clasificarRedPrecarga({conectada:true,segura:true,datosPermitidos:false}),'amplia')
 assert.equal(clasificarRedPrecarga({conectada:true,segura:false,datosPermitidos:false}),'no')
 assert.equal(clasificarRedPrecarga({conectada:true,segura:false,datosPermitidos:true}),'datos')
 for(const extra of [{conectada:false},{ahorro:true},{lenta:true}])assert.equal(clasificarRedPrecarga({conectada:true,segura:true,datosPermitidos:true,...extra}),'no')
})
