import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const copy = v => JSON.parse(JSON.stringify(v))
function load(path, deps = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, { exports, require: id => { assert.ok(id in deps, id); return deps[id] } })
  return exports
}
const stores = load('src/state/store.ts', { react: { useSyncExternalStore: (_s, get) => get() } })
const helper = load('src/ui/mosaicoBorrador.ts')
const estilo = { tema: null, fondo: null, fuente: null }
const pieza = (id, texto = id) => ({ id, kind: 'texto', texto, ancho: 'mitad', estilo })
const draft = (id, texto, parentId = null) => ({ id, kind: 'texto', ancho: 'mitad', estilo, contenido: { kind: 'texto', texto }, parentId })
function montar() {
  let fail = null, sec = 0
  const stableIds = new Map()
  const calls = [], data = new Map([[null, [pieza('a'), pieza('b')]]])
  const service = {
    listShowcases: async (_owner, parent) => copy(data.get(parent) ?? []),
    payloadDe: v => ({ texto: v.texto, titulo: v.titulo }),
    addShowcase: async (owner, kind, payload, ancho, estilo, parent, reserved) => {
      calls.push(['add', parent, payload, reserved]); if (fail === 'add') throw Error('add offline')
      const id = stableIds.get(reserved) ?? `real-${++sec}`
      if (reserved) stableIds.set(reserved, id)
      data.set(parent, [...(data.get(parent) ?? []).filter(v => v.id !== id), { id, kind, ...payload, ancho, estilo }])
      if (fail === 'lost') throw Error('respuesta perdida')
      return id
    },
    updateShowcase: async (id, patch) => { calls.push(['update', id, patch]); if (fail === 'update') throw Error('update offline') },
    reorderShowcases: async ids => { calls.push(['order', ids]); if (fail === 'order') throw Error('order offline') },
    removeShowcase: async id => { calls.push(['remove', id]); if (fail === 'remove') throw Error('remove offline') },
  }
  const ui = load('src/state/mosaicoEdicion.ts', { './store': stores, '../services/showcases': service, '../ui/mosaicoBorrador': helper })
  return { ui, calls, data, fail: v => { fail = v } }
}

test('tema/layout/contenido pueden navegar y volver sin RPC; Restablecer descarta todo', async () => {
  const { ui, calls } = montar()
  await ui.cargarMosaicoEdicion('yo', null)
  ui.ponerVitrinaEdicion('yo', draft('a', 'Nuevo'), 'tmp', draft('a', 'a'), true)
  ui.editarMosaicoEdicion('yo', null, vs => [vs[1], { ...vs[0], ancho: 'grande' }])
  assert.equal(calls.length, 0)
  assert.equal(ui.cambioMosaicosEdicion(ui.leerMosaicosEdicion('yo')), true)
  assert.deepEqual(copy(ui.mosaicoDeEdicion(ui.leerMosaicosEdicion('yo'), null).actual.map(v => [v.id, v.ancho, v.texto])), [['b', 'mitad', 'b'], ['a', 'grande', 'Nuevo']])
  ui.restablecerMosaicosEdicion('yo')
  assert.equal(ui.cambioMosaicosEdicion(ui.leerMosaicosEdicion('yo')), false)
  assert.equal(calls.length, 0)
})

test('volver al perfil y releer mantiene contenido pendiente, tamaño, orden y altas locales', async () => {
  const { ui } = montar()
  await ui.cargarMosaicoEdicion('yo', null)
  ui.ponerVitrinaEdicion('yo', draft('a', 'Pendiente'), 'tmp', draft('a', 'a'), true)
  ui.ponerVitrinaEdicion('yo', draft(null, 'Nueva'), 'borrador:nueva', null, true)
  ui.editarMosaicoEdicion('yo', null, vs => [vs[2], { ...vs[0], ancho: 'grande' }])
  await ui.cargarMosaicoEdicion('yo', null)
  const actual = ui.mosaicoDeEdicion(ui.leerMosaicosEdicion('yo'), null).actual
  assert.deepEqual(copy(actual.map(v => v.id)), ['borrador:nueva', 'a'])
  assert.equal(actual[1].texto, 'Pendiente'); assert.equal(actual[1].ancho, 'grande')
})

test('guardar crea padre antes de hijos y resuelve IDs temporales sin escribir antes', async () => {
  const { ui, calls } = montar()
  await ui.cargarMosaicoEdicion('yo', null)
  const parent = { ...draft(null, ''), kind: 'subspace', contenido: { kind: 'subspace', titulo: 'Espacio' } }
  ui.ponerVitrinaEdicion('yo', parent, 'borrador:parent', null, true)
  ui.ponerVitrinaEdicion('yo', draft(null, 'Hija', 'borrador:parent'), 'borrador:hija', null, true)
  assert.equal(calls.length, 0)
  await ui.guardarMosaicosEdicion('yo')
  const altas = calls.filter(c => c[0] === 'add')
  assert.equal(altas.length, 2); assert.equal(altas[0][1], null); assert.equal(altas[1][1], 'real-1')
  assert.equal(ui.resolverIdVitrina('yo', 'borrador:parent'), 'real-1')
  assert.equal(ui.cambioMosaicosEdicion(ui.leerMosaicosEdicion('yo')), false)
})

test('fallo después de crear no duplica el alta confirmada al reintentar', async () => {
  const { ui, calls, fail } = montar()
  await ui.cargarMosaicoEdicion('yo', null)
  ui.ponerVitrinaEdicion('yo', draft(null, 'Nueva'), 'borrador:nueva', null, true)
  ui.editarMosaicoEdicion('yo', null, vs => [vs[2], vs[0]])
  fail('order')
  await assert.rejects(ui.guardarMosaicosEdicion('yo'), /offline/)
  assert.equal(calls.filter(c => c[0] === 'remove').length, 0)
  fail(null); await ui.guardarMosaicosEdicion('yo')
  assert.equal(calls.filter(c => c[0] === 'add').length, 1)
  assert.equal(calls.filter(c => c[0] === 'remove').length, 1)
  assert.equal(ui.cambioMosaicosEdicion(ui.leerMosaicosEdicion('yo')), false)
})

test('una pieza incompleta bloquea el commit central sin escrituras', async () => {
  const { ui, calls } = montar()
  ui.ponerVitrinaEdicion('yo', draft(null, ''), 'borrador:nueva', null, false)
  assert.match(ui.validarMosaicosEdicion('yo'), /Completá/)
  await assert.rejects(ui.guardarMosaicosEdicion('yo'), /Completá/)
  assert.equal(calls.length, 0)
  ui.restablecerMosaicosEdicion('yo')
  assert.equal(ui.validarMosaicosEdicion('yo'), null)
})

test('quitar subspace descarta cambios de hijos y no actualiza piezas que van a desaparecer', async () => {
  const { ui, calls, data } = montar()
  data.set(null, [{ id: 'parent', kind: 'subspace', titulo: 'Viejo', ancho: 'grande', estilo }])
  data.set('parent', [pieza('hija')])
  await ui.cargarMosaicoEdicion('yo', null); await ui.cargarMosaicoEdicion('yo', 'parent')
  ui.ponerVitrinaEdicion('yo', draft('hija', 'Cambio', 'parent'), 'tmp', draft('hija', 'hija', 'parent'), true)
  ui.editarMosaicoEdicion('yo', null, [])
  await ui.guardarMosaicosEdicion('yo')
  assert.deepEqual(copy(calls), [['order', []], ['remove', 'parent']])
  assert.equal(ui.cambioMosaicosEdicion(ui.leerMosaicosEdicion('yo')), false)
})


test('agregar y quitar un subspace temporal con hijas no deja escrituras huérfanas', async () => {
  const { ui, calls } = montar()
  await ui.cargarMosaicoEdicion('yo', null)
  const parent = { ...draft(null, ''), kind: 'subspace', contenido: { kind: 'subspace', titulo: 'Nuevo' } }
  ui.ponerVitrinaEdicion('yo', parent, 'borrador:parent', null, true)
  ui.ponerVitrinaEdicion('yo', draft(null, '', 'borrador:parent'), 'borrador:hija', null, false)
  ui.editarMosaicoEdicion('yo', null, vs => vs.filter(v => v.id !== 'borrador:parent'))
  assert.equal(ui.validarMosaicosEdicion('yo'), null)
  assert.equal(ui.cambioMosaicosEdicion(ui.leerMosaicosEdicion('yo')), false)
  await ui.guardarMosaicosEdicion('yo')
  assert.equal(calls.length, 0)
})


test('revertir contenido en la hoja al original limpia el cambio global', async () => {
  const { ui, calls } = montar()
  await ui.cargarMosaicoEdicion('yo', null)
  const inicial = draft('a', 'a')
  ui.ponerVitrinaEdicion('yo', draft('a', 'Otro'), 'tmp', inicial, true)
  assert.equal(ui.cambioMosaicosEdicion(ui.leerMosaicosEdicion('yo')), true)
  ui.ponerVitrinaEdicion('yo', inicial, 'tmp', inicial, true)
  assert.equal(ui.cambioMosaicosEdicion(ui.leerMosaicosEdicion('yo')), false)
  assert.equal(calls.length, 0)
})


test('terminar la sesión elimina altas y aliases; la siguiente edición empieza limpia', async () => {
  const { ui, calls } = montar()
  ui.ponerVitrinaEdicion('yo', draft(null, 'Nueva'), 'borrador:nueva', null, true)
  const anterior = ui.leerMosaicosEdicion('yo')
  ui.terminarMosaicosEdicion('yo')
  const siguiente = ui.leerMosaicosEdicion('yo')
  assert.notEqual(anterior, siguiente)
  assert.deepEqual(copy(siguiente.ambitos), {})
  assert.equal(ui.cambioMosaicosEdicion(siguiente), false)
  assert.equal(calls.length, 0)
})


test('si termina la sesión durante un alta no inicia las operaciones restantes', async () => {
  let resolver, calls = 0
  const ui = load('src/state/mosaicoEdicion.ts', {
    './store': stores, '../ui/mosaicoBorrador': helper,
    '../services/showcases': { payloadDe: v => v, addShowcase: () => { calls++; return new Promise(resolve => { resolver = resolve }) } },
  })
  ui.ponerVitrinaEdicion('yo', draft(null, 'Primera'), 'borrador:1', null, true)
  ui.ponerVitrinaEdicion('yo', draft(null, 'Segunda'), 'borrador:2', null, true)
  const guardando = ui.guardarMosaicosEdicion('yo')
  ui.terminarMosaicosEdicion('yo')
  resolver('id-confirmado')
  await assert.rejects(guardando, /sesión.*terminó/)
  assert.equal(calls, 1)
  assert.equal(ui.cambioMosaicosEdicion(ui.leerMosaicosEdicion('yo')), false)
})


test('una respuesta perdida después de insertar reintenta con el mismo ID y no duplica la pieza', async () => {
  const { ui, calls, data, fail } = montar()
  await ui.cargarMosaicoEdicion('yo', null)
  ui.ponerVitrinaEdicion('yo', draft(null, 'Nueva'), 'borrador:respuesta-perdida', null, true)
  fail('lost')
  await assert.rejects(ui.guardarMosaicosEdicion('yo'), /respuesta perdida/)
  assert.equal(data.get(null).length, 3)
  fail(null)
  await ui.guardarMosaicosEdicion('yo')
  const altas = calls.filter(c => c[0] === 'add')
  assert.equal(altas.length, 2)
  assert.match(altas[0][3], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  assert.equal(altas[0][3], altas[1][3])
  assert.equal(data.get(null).length, 3)
  assert.equal(ui.cambioMosaicosEdicion(ui.leerMosaicosEdicion('yo')), false)
})

test('servicio reutiliza el ID reservado mediante upsert y mantiene insert para llamadas existentes', async () => {
  const source = readFileSync('src/services/showcases.ts', 'utf8')
  const start = source.indexOf('export async function addShowcase(')
  const part = source.slice(start, source.indexOf('\n/**', start))
  const exports = {}, calls = []
  const query = { select() { return this }, single: async () => ({ data:{id:'id-real'},error:null }) }
  const tabla = { insert: row => { calls.push(['insert',row]);return query },upsert: (row,opts) => { calls.push(['upsert',row,opts]);return query } }
  const code = ts.transpileModule(part, { compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022} }).outputText
  vm.runInNewContext(code, {exports, countShowcases: async () => 2, getSupabase:()=>({from:()=>tabla}), estiloParaLaBase:e=>e,SIN_ESTILO:estilo})
  await exports.addShowcase('yo','texto',{texto:'Uno'})
  await exports.addShowcase('yo','texto',{texto:'Dos'},'mitad',estilo,null,'id-reservado')
  assert.equal(calls[0][0],'insert');assert.equal('id' in calls[0][1],false)
  assert.equal(calls[1][0],'upsert');assert.equal(calls[1][1].id,'id-reservado')
  assert.equal(calls[1][2].onConflict,'id')
})
