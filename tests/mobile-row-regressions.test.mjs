import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node)
  ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
function load(source, imports = {}) {
  const exports = {}
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText
  new Function('exports', 'require', code)(exports, id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    assert.ok(id in imports, id)
    return imports[id]
  })
  return exports
}
const { filaCargando } = load(readFileSync('src/ui/estadoFilaReproduccion.ts', 'utf8'))

test('la pausa gana sobre buffer vacío o resolución pendiente; sólo la reproducción espera audio', () => {
  for (const cargada of [true, false]) for (const busy of [true, false]) {
    assert.equal(filaCargando(true, false, cargada, busy), false)
    assert.equal(filaCargando(true, true, cargada, busy), busy || !cargada)
    assert.equal(filaCargando(false, false, cargada, busy), busy)
  }
})

test('las tapas de sugerencias, búsquedas y listas muestran play al pausar, no barras ni spinner', () => {
  const { EstadoTapa } = load(readFileSync('src/ui/CoverState.tsx', 'utf8'), {
    'react-native': { ActivityIndicator: 'Spinner', Text: 'Text', View: 'View' },
    './PlayingBars': { PlayingBars: 'PlayingBars' },
    './estadoFilaReproduccion': { filaCargando },
    '../state/playback': { usePlaybackCargada: () => false },
    '../state/resolucion': { useProgresoResolucion: () => null },
    './icons': { ICON_COLOR: {}, IconPlay: 'Play', IconPause: 'Pause' },
  })
  for (const busy of [false, true]) for (const hovered of [false, true]) {
    const tree = nodes(EstadoTapa({ sounding: true, playing: false, busy, hovered }))
    assert.ok(tree.some(n => n.type === 'Play'))
    assert.equal(tree.some(n => n.type === 'PlayingBars' || n.type === 'Spinner' || n.type === 'Pause'), false)
  }
})

test('la tilde pertenece sólo a descargas explícitas, nunca a la precarga automática', () => {
  const source = ts.createSourceFile('PlaylistView.tsx', readFileSync('src/ui/PlaylistView.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const fn = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === 'MarcaDescarga')
  assert.ok(fn)
  const { MarcaDescarga } = load(`const HAY_DESCARGAS = true, View = 'View', Text = 'Text', IconDownloaded = 'Downloaded', IconDownload = 'Download', ICON_COLOR = {}; export ${fn.getText(source)}`)
  for (const estado of ['espera', 'bajando', 'lista', 'error', 'pausada']) {
    assert.equal(MarcaDescarga({ descarga: { temporal: true, estado } }), null)
  }
  assert.equal(MarcaDescarga({}), null)
  assert.ok(nodes(MarcaDescarga({ descarga: { temporal: false, estado: 'lista' } })).some(n => n.type === 'Downloaded'))
  assert.equal(nodes(MarcaDescarga({ descarga: { temporal: false, estado: 'bajando', progreso: 0.5 } })).some(n => n.type === 'Downloaded'), false)
})

test('una playlist abierta no puede ocultar Chats cuando cambia la sección', () => {
  const source = ts.createSourceFile('index.tsx', readFileSync('app/index.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let condition
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'PlaylistView') {
      let parent = node.parent
      while (parent && !ts.isConditionalExpression(parent)) parent = parent.parent
      condition = parent?.condition.getText(source)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(condition)
  const displaysPlaylist = new Function('music', 'openPlaylist', `return !!(${condition})`)
  assert.equal(displaysPlaylist(true, { id: 'abierta' }), true)
  assert.equal(displaysPlaylist(false, { id: 'abierta' }), false, 'un solo cambio a Chats debe retirar la playlist')
  assert.equal(displaysPlaylist(true, null), false)
})

test('Tus me gusta extiende el tinte detrás del header y abre Buscar desde el estado vacío', () => {
  const gustos = readFileSync('src/ui/MeGusta.tsx', 'utf8')
  assert.match(gustos, /<CollectionHeader\s+kind="Colección"\s+bleedTop=\{techo\}/)
  const index = readFileSync('app/index.tsx', 'utf8')
  assert.match(index, /<MeGustaView\s+onSearch=\{\(\) => setTab\('buscar'\)\}/)
})
