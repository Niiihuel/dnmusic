import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const exports = {}
new Function('exports','require',ts.transpileModule(readFileSync('src/ui/Dispositivos.shared.ts','utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText)(exports,()=>({}))
const panel = exports.crearPanelDispositivos
const base = {
  actividad:{deviceId:'pc',nombre:'Computadora',estado:'sonando'},conexion:'conectado',transferencia:null,
  dispositivos:[{deviceId:'ios',nombre:'iPhone'},{deviceId:'pc',nombre:'Computadora'}],esteId:'ios',seleccionadoId:'pc',hayCancion:true,enJam:false,nombreLocal:'iPhone',
}
test('el destino remoto y el local se identifican sin confundir presencia con reproducción',()=>{
  const p=panel(base)
  assert.equal(p.resumen,'Sonando en Computadora');assert.equal(p.remoto,true)
  assert.equal(p.filas[0].id,'pc');assert.equal(p.filas[0].seleccionado,true);assert.equal(p.filas[0].estado,'sonando')
  assert.equal(p.filas[1].detalle,'Este dispositivo · Disponible');assert.equal(p.filas[1].disabled,false)
})
test('pausa y preparación nunca se rotulan como sonando',()=>{
  for(const estado of ['pausado','preparando']){
    const p=panel({...base,actividad:{...base.actividad,estado}})
    assert.doesNotMatch(p.resumen,/Sonando/);assert.equal(p.filas[0].estado,estado)
  }
})
test('presencia vacía conserva este dispositivo y el dueño remoto como no disponible',()=>{
  const p=panel({...base,dispositivos:[],conexion:'desconectado',actividad:{...base.actividad,estado:'desconectado'}})
  assert.equal(p.filas.length,2);assert.match(p.resumen,/Última reproducción/)
  assert.equal(p.filas.every(f=>f.disabled),true)
  assert.equal(p.filas.find(f=>f.esEste).nombre,'iPhone')
})
test('sin pista o dentro de un Jam no ofrece un traspaso que no puede completar',()=>{
  for(const cambio of [{hayCancion:false},{enJam:true}]) assert.equal(panel({...base,...cambio}).filas.every(f=>f.disabled),true)
})
test('transferencia pendiente bloquea duplicados y sólo confirma cuando llega la confirmación',()=>{
  const pendiente=panel({...base,transferencia:{destino:'ios',estado:'pendiente',error:null}})
  assert.equal(pendiente.filas.every(f=>f.disabled),true);assert.equal(pendiente.filas.find(f=>f.id==='ios').busy,true)
  assert.match(pendiente.mensaje,/Esperando confirmación de iPhone/)
  assert.equal(pendiente.filas.find(f=>f.id==='pc').seleccionado,true)
  const ok=panel({...base,transferencia:{destino:'ios',estado:'confirmada',error:null},actividad:{deviceId:'ios',nombre:'iPhone',estado:'pausado'}})
  assert.equal(ok.resumen,'En pausa en este dispositivo');assert.equal(ok.remoto,false);assert.match(ok.mensaje,/confirmado/)
})
test('un error deja el destino original marcado y vuelve a permitir elegir otro',()=>{
  const p=panel({...base,transferencia:{destino:'ios',estado:'error',error:'El dispositivo no respondió'}})
  assert.equal(p.error,true);assert.equal(p.mensaje,'El dispositivo no respondió')
  assert.equal(p.filas.find(f=>f.id==='pc').seleccionado,true);assert.equal(p.filas.find(f=>f.id==='ios').disabled,false)
})
test('la cuenta sin reproducción no hereda la etiqueta sonando del último dueño',()=>{
  const p=panel({...base,actividad:{deviceId:null,nombre:null,estado:'inactivo'},hayCancion:false})
  assert.equal(p.resumen,'Sin reproducción activa');assert.equal(p.filas.some(f=>f.estado==='sonando'),false)
})
