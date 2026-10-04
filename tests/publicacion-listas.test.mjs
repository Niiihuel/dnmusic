import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compile = path => ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText
const serviceCode = compile('src/services/playlists.ts')
const hookCode = compile('src/ui/useListasPublicas.ts')
const flush = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes }); return { promise, resolve } }
const row = (id = 'lista', owner = 'yo') => ({ id, owner_id: owner, name: 'Mi lista', visibilidad: 'privada', tracks: 1 })
function fixture() {
  const state = { filas: [row()], writes: [], reads: [], response: null, failRead: false, hold: false, requests: [] }
  const service = {}
  const supabase = {
    from(table) {
      assert.equal(table, 'playlists')
      let values, id
      const query = {
        update(v) { values = v; return query },
        eq(column, value) { assert.equal(column, 'id'); id = value; return query },
        select(columns) { assert.equal(columns, 'id, owner_id, visibilidad'); return query },
        async single() {
          state.writes.push(id)
          if (state.response) return state.response
          const current = state.filas.find(row => row.id === id)
          if (!current) return { data: null, error: { code: 'PGRST116' } }
          Object.assign(current, values)
          return { data: { ...current }, error: null }
        },
      }
      return query
    },
    rpc(name, args) {
      assert.equal(name, 'list_public_playlists')
      state.reads.push(args.p_owner)
      const data = state.filas.filter(row => row.owner_id === args.p_owner && row.visibilidad === 'publica').map(row => ({ ...row }))
      if (state.hold) { const request = deferred(); state.requests.push(request); return request.promise }
      return Promise.resolve(state.failRead ? { data: null, error: { message: 'red caída' } } : { data, error: null })
    },
  }
  new Function('exports', 'require', serviceCode)(service, id => {
    if (id === './storageBudget') return { assertStorageBudget: async () => {} }
    assert.equal(id, '../lib/supabase'); return { getSupabase: () => supabase }
  })
  const slots = [], hook = {}
  let cursor = 0, effects = []
  const react = {
    useState(initial) {
      const n = cursor++
      if (!(n in slots)) slots[n] = initial
      return [slots[n], value => { slots[n] = typeof value === 'function' ? value(slots[n]) : value }]
    },
    useEffect(fn, deps) {
      const n = cursor++, previous = slots[n]
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) effects.push(() => {
        previous?.cleanup?.(); slots[n] = { deps, cleanup: fn() }
      })
    },
  }
  new Function('exports', 'require', hookCode)(hook, id => {
    if (id === 'react') return react
    assert.equal(id, '../services/playlists'); return service
  })
  return { state, service,
    render(owner = 'yo', recarga = 0) { cursor = 0; effects = []; const value = hook.useListasPublicas(owner, recarga); effects.forEach(fn => fn()); return value },
    unmount() { slots.forEach(slot => slot?.cleanup?.()) },
  }
}

test('perfil abierto vacío aparece al publicar y desaparece al hacer privada, sin remontar', async () => {
  const f = fixture(); f.render(); await flush()
  assert.deepEqual(f.render().listas, [])
  await f.service.setPlaylistVisibility('lista', 'publica'); await flush()
  assert.equal(f.render().listas[0].name, 'Mi lista')
  assert.equal(f.render().listas[0].visibilidad, 'publica')
  await f.service.setPlaylistVisibility('lista', 'privada'); await flush()
  assert.deepEqual(f.render().listas, [])
  assert.equal(f.state.reads.length, 3)
})

test('volver al perfil relee publicaciones de otro cliente, sin requerir cambio de ownerId', async () => {
  const f = fixture(); f.render(); await flush()
  f.state.filas[0].visibilidad = 'publica'
  f.render('yo', 1); await flush()
  assert.equal(f.render('yo', 1).listas.length, 1)
})

test('escritura nula, rechazada o no confirmada no anuncia publicación ni invalida el perfil', async () => {
  const f = fixture(); f.render(); await flush()
  for (const response of [
    { data: null, error: { code: 'PGRST116' } },
    { data: null, error: null },
    { data: { id: 'lista', owner_id: 'yo', visibilidad: 'privada' }, error: null },
    { data: null, error: { code: '42501' } },
  ]) {
    f.state.response = response
    await assert.rejects(f.service.setPlaylistVisibility('lista', 'publica'))
    assert.equal(f.state.reads.length, 1)
    assert.deepEqual(f.render().listas, [])
  }
})

test('fallo RPC no se convierte en lista vacía y permite reintentar la misma cuenta', async () => {
  const f = fixture(); f.state.failRead = true
  f.render(); await flush()
  assert.equal(f.render().listas, null)
  assert.match(f.render().error, /No se pudieron cargar/)
  f.state.failRead = false; f.state.filas[0].visibilidad = 'publica'
  f.render().reintentar(); f.render(); await flush()
  assert.equal(f.render().error, null)
  assert.equal(f.render().listas.length, 1)
})

test('una respuesta anterior no restaura una publicación retirada durante la consulta', async () => {
  const f = fixture(); f.state.hold = true
  f.render()
  await f.service.setPlaylistVisibility('lista', 'publica')
  f.state.requests[1].resolve({ data: [{ ...row(), visibilidad: 'publica' }], error: null }); await flush()
  assert.equal(f.render().listas.length, 1)
  f.state.requests[0].resolve({ data: [], error: null }); await flush()
  assert.equal(f.render().listas.length, 1)
  await f.service.setPlaylistVisibility('lista', 'privada')
  f.state.requests[2].resolve({ data: [], error: null }); await flush()
  assert.deepEqual(f.render().listas, [])
})

test('cambiar perfil no muestra datos anteriores y desmontar retira la suscripción', async () => {
  const f = fixture(); f.state.filas.push({ ...row('otra', 'otro'), visibilidad: 'publica' })
  f.render('otro'); await flush()
  assert.equal(f.render('otro').listas.length, 1)
  assert.equal(f.render('yo').listas, null)
  await flush()
  await f.service.setPlaylistVisibility('otra', 'privada'); await flush()
  assert.equal(f.state.reads.length, 2, 'cambios de otro dueño no invalidan este perfil')
  f.unmount()
  await f.service.setPlaylistVisibility('lista', 'publica'); await flush()
  assert.equal(f.state.reads.length, 2)
})

const jsx = (type, props) => ({ type, props })
function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}
test('UI compartida PC/iOS muestra error y reintento, nunca el cartel vacío cuando falló', () => {
  let attempts = 0
  const result = { listas: null, cargando: false, error: 'No se pudieron cargar las listas públicas.', reintentar: () => attempts++ }
  const api = {}
  new Function('exports', 'require', compile('src/ui/ListasPerfil.tsx'))(api, id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === 'react') return { useState: initial => [initial, () => {}] }
    if (id === './FuentePerfil') return { TextoPerfil: 'Text' }
    if (id === 'react-native') return { View: 'View', Pressable: 'Pressable' }
    if (id === './useListasPublicas') return { useListasPublicas: (_owner, recarga) => { assert.equal(recarga, 2); return result } }
    if (id === './Social') return { AccionSocial: 'AccionSocial' }
    if (id === './PlaylistCover') return { PlaylistCover: 'PlaylistCover' }
    if (id === './SeekBar') return { formatLength: () => '' }
    assert.fail(`Import inesperado: ${id}`)
  })
  const render = () => nodes(api.ListasPerfil({ ownerId: 'yo', nombre: 'Yo', propio: true, recarga: 2, onAbrir() {} }))
  let ui = render()
  assert.ok(ui.some(n => n.props?.accessibilityRole === 'alert'))
  assert.ok(!ui.some(n => String(n.props?.children).includes('Todavía no publicaste')))
  ui.find(n => n.type === 'AccionSocial').props.onPress()
  assert.equal(attempts, 1)
  result.error = null; result.listas = []
  ui = render()
  assert.ok(ui.some(n => String(n.props?.children).includes('Todavía no publicaste')))
})

test('Reciente propaga recarga a las listas, tanto en perfil propio como ajeno', () => {
  const api = {}
  new Function('exports', 'require', compile('src/ui/PestanasPerfil.tsx'))(api, id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === 'react') return {}
    if (id === 'react-native') return { View: 'View' }
    if (id === '../services/plays') return {}
    if (id === './ListasPerfil') return { ListasPerfil: 'ListasPerfil' }
    if (id === './PerfilPublico') return { Dato: 'Dato' }
    if (id === './Reacciones') return { ParedDeReacciones: 'Pared' }
    if (id === './SelectorPestanasPerfil') return { SelectorPestanasPerfil: 'Tabs' }
    assert.fail(`Import inesperado: ${id}`)
  })
  for (const propio of [true, false]) {
    const list = nodes(api.Reciente({ ownerId: 'yo', nombre: 'Yo', propio, recarga: 3, onAbrirLista() {}, sinResumen: true }))
      .find(node => node.type === 'ListasPerfil')
    assert.equal(list.props.recarga, 3)
    assert.equal(list.props.ownerId, 'yo')
  }
})
