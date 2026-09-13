import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compile = path => ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText
const jsx = (type, props) => ({ type, props })
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)]
const modifiers = new Proxy({}, { get: (_, name) => (...args) => ({ name, args }) })
function fixture() {
  const states = [], efectos = []
  let cursor = 0
  const natives = new Proxy({ Toolbar: { Content: 'Toolbar.Content' }, ConfirmationDialog: { Trigger: 'Trigger', Message: 'Message', Actions: 'Actions' },
    useNativeState: initial => { let value = initial; return { get: () => value, set: next => { value = next } } },
  }, { get: (value, name) => value[name] ?? name })
  const imports = {
    react: { useState: initial => { const i = cursor++; states[i] ??= initial; return [states[i], next => { states[i] = next }] }, useEffect: efecto => efectos.push(efecto) },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { View: 'RNView', Image: 'RNImage', useWindowDimensions: () => ({ width: 390 }) },
    '@expo/ui/swift-ui': natives, '@expo/ui/swift-ui/modifiers': modifiers,
    './Avatar': { Avatar: 'Avatar' }, './Marco': { Marco: 'Marco' }, './TarjetaPerfil': { TarjetaPerfil: 'TarjetaPerfil' }, './PerfilPublico': { FondoPerfil: 'FondoPerfil' },
    '../services/showcases': { esVideo: url => url.endsWith('.mp4') },
    './EditorDeCampo': { TITULO_CAMPO: { usuario: 'Usuario', nombre: 'Nombre visible', linea: 'Tu línea' } },
    '../models/username': { normalizeUsername: value => value.toLowerCase().replace(/[^a-z0-9_]/g, '') },
    '../services/music': { proxiedImage: url => url },
  }
  const exports = {}
  new Function('exports', 'require', compile('src/ui/EditorPerfilNativo.ios.tsx'))(exports, name => { assert.ok(name in imports, name); return imports[name] })
  const cambios = [], rutas = [], acciones = []
  const editor = { valor: 'Ana', placeholder: '', busy: false, cambiar: value => cambios.push(value) }
  const props = { perfil: { username: 'ana', displayName: 'Ana', visibility: 'privado', compartirEscucha: false }, nombre: editor, usuario: editor, linea: editor,
    ocupado: false, guardando: false, cambiado: false, puedeGuardar: true, error: null, piso: 170, subiendoFoto: false, subiendoFondo: false, progresoFondo: null, estilo: {},
    onVolver: () => acciones.push('volver'), onAbrir: ruta => rutas.push(ruta), onGuardar: () => acciones.push('guardar'), onRestablecer: () => acciones.push('reset'),
    onElegirFoto: () => acciones.push('foto'), onElegirFondo: () => acciones.push('fondo'), onQuitar: tipo => acciones.push(tipo), onCambiar: cambio => cambios.push(cambio),
  }
  const render = patch => { cursor = 0; return nodes(exports.EditorPerfilNativo({ ...props, ...patch })) }
  return { exports, render, props, cambios, rutas, acciones, natives }
}
const isDisabled = node => node.props.modifiers?.some(m => m.name === 'disabled' && m.args[0])

test('iOS conserva el borrador al navegar y guarda desde todas las secciones sólo cuando corresponde', () => {
  const f = fixture()
  let ui = f.render()
  assert.ok(ui.filter(n => n.type === 'Button' && n.props.label === 'Guardar').every(isDisabled))
  ui.find(n => n.type === 'NavigationStack').props.onPathChange(['identidad'])
  ui = f.render({ cambiado: true })
  assert.deepEqual(ui.find(n => n.type === 'NavigationStack').props.path, ['identidad'])
  const save = ui.find(n => n.type === 'Button' && n.props.label === 'Guardar')
  assert.equal(isDisabled(save), false)
  save.props.onPress()
  assert.deepEqual(f.acciones, ['guardar'])
  assert.ok(f.render({ cambiado: true, puedeGuardar: false }).filter(n => n.type === 'Button' && n.props.label === 'Guardar').every(isDisabled))
  assert.ok(f.render({ cambiado: true, ocupado: true }).filter(n => n.type === 'Button' && n.props.label === 'Guardar').every(isDisabled))
})

test('privacidad edita el borrador con los valores reales y no guarda una fila por separado', () => {
  const f = fixture()
  const ui = f.render()
  const toggles = ui.filter(n => n.type === 'Toggle')
  assert.equal(toggles.length, 2)
  assert.ok(toggles.every(n => n.props.isOn === false))
  toggles[0].props.onIsOnChange(true)
  toggles[1].props.onIsOnChange(true)
  assert.deepEqual(f.cambios, [{ visibility: 'publico' }, { compartirEscucha: true }])
  assert.deepEqual(f.acciones, [])
  assert.ok(f.render({ ocupado: true }).filter(n => n.type === 'Toggle').every(isDisabled))
})

test('el usuario normalizado queda igual en el campo SwiftUI y en el borrador', () => {
  const f = fixture()
  const campo = f.render().find(n => n.type?.name === 'Campo' && n.props.usuario)
  const input = nodes(campo.type(campo.props)).find(n => n.type === 'TextField')
  input.props.onTextChange('ANA!')
  assert.deepEqual(f.cambios, ['ana'])
  assert.equal(input.props.text.get(), 'ana')
  const bloqueado = nodes(campo.type({ ...campo.props, editor: { ...campo.props.editor, busy: true } })).find(n => n.type === 'TextField')
  bloqueado.props.onTextChange('otra')
  assert.deepEqual(f.cambios, ['ana'])
})

test('buscar música para el perfil siempre selecciona el resultado completo sin cambiar la reproducción', () => {
  const f = fixture(), selecciones = []
  const track = { videoId: 'cancion', title: 'Tema', artist: 'Artista', artworkUrl: 'https://example.test/cover.jpg', durationMs: 123000 }
  const ui = nodes(f.exports.BusquedaPerfilNativa({ termino: 'Tema', resultados: [track], cargando: false, error: null, piso: 24,
    onCambiar() {}, onElegir: resultado => selecciones.push(resultado), onVolver() {} }))
  const song = ui.find(n => n.type === 'Button' && n.props.modifiers?.some(m => m.name === 'accessibilityLabel' && m.args[0].startsWith('Agregar Tema')))
  song.props.onPress()
  assert.equal(selecciones[0], track)
  assert.equal(ui.find(n => n.type === 'RNImage').props.source.uri, track.artworkUrl)
  assert.equal(ui.filter(n => n.type === 'TextField').length, 1)
})

test('los toggles nativos alimentan el store real y preservan el borrador al volver de una sección', () => {
  const f = fixture(), store = {}, state = {}
  let guardado = { ...f.props.perfil, userId: 'yo', bio: null }
  new Function('exports', 'require', compile('src/state/store.ts'))(store, () => ({ useSyncExternalStore: (_subscribe, get) => get() }))
  new Function('exports', 'require', compile('src/state/perfilEdicion.ts'))(state, name => {
    if (name === './store') return store
    if (name === './session') return { useMyProfile: () => guardado }
    if (name === 'react') return { useMemo: fn => fn(), useEffect: fn => fn() }
    throw Error(name)
  })
  state.iniciarPerfilEdicion(guardado)
  state.actualizarPerfilEdicion({ displayName: 'Mi nombre nuevo' })
  const render = () => f.render({ perfil: state.usePerfilBorrador(), cambiado: Object.keys(state.getPerfilEdicion().cambios).length > 0, onCambiar: state.actualizarPerfilEdicion })
  let ui = render()
  ui.find(n => n.type === 'NavigationStack').props.onPathChange(['privacidad'])
  ui.filter(n => n.type === 'Toggle')[1].props.onIsOnChange(true)
  ui = render()
  assert.equal(ui.filter(n => n.type === 'Toggle')[1].props.isOn, true)
  ui.find(n => n.type === 'NavigationStack').props.onPathChange([])
  state.useIniciarPerfilEdicion()
  assert.equal(state.usePerfilBorrador().displayName, 'Mi nombre nuevo')
  assert.equal(state.usePerfilBorrador().compartirEscucha, true)
  const patch = state.cambiosParaGuardar(state.usePerfilBorrador(), state.getPerfilEdicion().cambios)
  assert.deepEqual(patch, { displayName: 'Mi nombre nuevo', compartirEscucha: true })
  state.ocuparPerfilEdicion(true)
  render().filter(n => n.type === 'Toggle')[1].props.onIsOnChange(false)
  assert.equal(state.usePerfilBorrador().compartirEscucha, true, 'el store real también bloquea un evento tardío durante el guardado')
  guardado = { ...guardado, ...patch }
  state.confirmarPerfilEdicion(guardado)
  state.ocuparPerfilEdicion(false)
  assert.deepEqual(state.getPerfilEdicion().cambios, {})
  assert.equal(state.usePerfilBorrador().displayName, 'Mi nombre nuevo')
})
