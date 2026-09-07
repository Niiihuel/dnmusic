import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function fixture() {
  const timers = new Map(); let id = 0
  const output = ts.transpileModule(readFileSync('src/services/lecturaViva.ts','utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  new Function('exports','setTimeout','clearTimeout',output)(exports,
    callback => { timers.set(++id, callback); return id }, key => timers.delete(key))
  return { ...exports, tick() { const callbacks=[...timers.values()];timers.clear(); callbacks.forEach(fn=>fn()) }, timers }
}
const flush = () => new Promise(resolve => setImmediate(resolve))
test('el perfil actualiza cambio de canción y pausa sin remontar, con lecturas serializadas', async () => {
  const f=fixture(), values=[];let index=0
  const rows=[{id:'a',suena:true},{id:'b',suena:true},{id:'b',suena:false}]
  const live=f.observarLectura(async()=>rows[index++],value=>values.push(value))
  live.activar(true);await flush();f.tick();await flush();f.tick();await flush()
  assert.deepEqual(values,rows);assert.equal(f.timers.size,1)
  live.cerrar();assert.equal(f.timers.size,0)
})
test('salir, ir al fondo o cambiar de usuario descarta respuestas antiguas y vuelve a consultar al regresar', async () => {
  const f=fixture(), values=[], pending=[]
  const live=f.observarLectura(()=>new Promise(resolve=>pending.push(resolve)),value=>values.push(value))
  live.activar(true);live.activar(false);pending[0]('anterior');await flush()
  assert.deepEqual(values,[]);assert.equal(f.timers.size,0)
  live.activar(true);pending[1]('nueva');await flush()
  assert.deepEqual(values,['nueva'])
  f.tick();live.cerrar();pending[2]('desmontada');await flush()
  assert.deepEqual(values,['nueva']);assert.equal(f.timers.size,0)
})
test('fallar una lectura retira el estado vivo y permite recuperar sin recargar', async () => {
  const f=fixture(),values=[];let fail=true
  const live=f.observarLectura(async()=>{ if(fail)throw Error('sin red');return 'actual' }, v=>values.push(v))
  live.activar(true);await flush();assert.deepEqual(values,[null])
  fail=false;f.tick();await flush();assert.deepEqual(values,[null,'actual']);live.cerrar()
})
test('una escucha antigua, sin fecha o pausada nunca cuenta como escuchando ahora', () => {
  const f=fixture(),now=Date.now()
  assert.equal(f.escuchaVigente(true,new Date(now-20_000),now),true)
  assert.equal(f.escuchaVigente(true,new Date(now-70_000),now),false)
  assert.equal(f.escuchaVigente(false,new Date(now),now),false)
  assert.equal(f.escuchaVigente(true,null,now),false)
  assert.equal(f.escuchaVigente(true,new Date('invalid'),now),false)
  assert.equal(f.escuchaVigente(true,new Date(now+120_000),now),false)
  assert.ok(f.LATIDO_ESCUCHA_MS < f.VIGENCIA_ESCUCHA_MS/2)
})
