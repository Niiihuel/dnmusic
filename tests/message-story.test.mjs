import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

function story({ lyrics = true, text = 'Una dedicatoria', platform = 'ios', artwork = false } = {}) {
  let cursor = 0
  const states = [], played = [], seeks = [], translations = []
  const song = { title: 'Tema', artist: 'Artista', videoId: 'fixture', startMs: 1000, durationMs: 15000,
    lyrics: lyrics ? [{ atMs: 1000, text: 'Una línea' }] : undefined, style: 'disc' }
  const message = { id: 'message', text, song, createdAt: null, senderId: 'me' }
  const jsx = (type, props) => ({ type, props })
  const generic = new Proxy({}, { get: (_, key) => String(key) })
  const exports = {}
  runInNewContext(ts.transpileModule(readFileSync('app/message/[id].tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(name) {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name === 'react') return {
      useEffect() {}, useMemo: fn => fn(),
      useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }] },
    }
    if (name === 'react-native') return { ...generic, View: 'View', Text: 'Text', ScrollView: 'ScrollView', Platform: { OS: platform }, StyleSheet: { absoluteFill: {} } }
    if (name === 'expo-router') return { useLocalSearchParams: () => ({ id: 'message' }), useRouter: () => ({}) }
    if (name.endsWith('/session')) return { useMessages: () => [message], useUser: () => ({ id: 'me' }), useContact: () => ({ username: 'friend' }) }
    if (name.endsWith('/models/message')) return { isSentBy: () => true }
    if (name.endsWith('/contacts')) return { contactLabel: () => 'friend' }
    if (name.endsWith('/shell')) return { usePiso: () => 196 }
    if (name.endsWith('/player')) return { useSnippetPlayer: () => ({ currentId: 'message', playing: true, positionMs: 2000,
      posicionSV: { value: 2000 }, toggle: async id => played.push(id), seek: async (...args) => seeks.push(args) }) }
    if (name.endsWith('/Onda')) return { Onda: 'Onda', usePicos: () => null }
    if (name.endsWith('/invitacionJam')) return { invitacionEnTexto: () => null }
    if (name.endsWith('/artwork')) return { artworkSource: () => artwork ? 'https://example.test/cover.jpg' : null }
    if (name.endsWith('/music')) return { LYRIC_LANGS: [{ value: 'off', label: 'Original' }, { value: 'es', label: 'Español' }],
      translateLyrics: async (...args) => translations.push(args) }
    if (name.endsWith('/icons')) return { ...generic, ICON_COLOR: {} }
    return generic
  } })
  function flatten(node) {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(flatten)
    return [node, ...flatten(node.props?.children)]
  }
  return { render() { cursor = 0; return flatten(exports.default()) }, played, seeks, translations, text }
}

test('cambiar a letra y traducir no reproduce ni cierra el fragmento', () => {
  const f = story()
  let nodes = f.render()
  assert.ok(!nodes.some(n => n.props?.triggerSymbol === 'character.bubble'))
  nodes.find(n => n.props?.label === 'Vista del fragmento').props.onChange('lyrics')
  nodes = f.render()
  assert.ok(nodes.some(n => n.type === 'Lyrics'))
  const menu = nodes.find(n => n.props?.triggerSymbol === 'character.bubble').props
  menu.items.find(item => item.label === 'Español').onPress()
  assert.equal(f.render().find(n => n.props?.label === 'Vista del fragmento').props.value, 'lyrics')
  assert.equal(f.render().find(n => n.props?.triggerSymbol === 'character.bubble').props.items[1].selected, true)
  assert.deepEqual(f.played, [])
  assert.deepEqual(f.seeks, [])
})

test('nota larga permanece completa y se puede ocultar sin cambiar música', () => {
  const f = story({ text: 'Para vos. '.repeat(200) })
  let nodes = f.render()
  const note = nodes.find(n => n.type === 'Text' && n.props.children === f.text)
  assert.equal(note.props.numberOfLines, undefined)
  assert.equal(note.props.selectable, true)
  nodes.find(n => n.props?.label === 'Ocultar la frase').props.onPress()
  nodes = f.render()
  assert.ok(!nodes.some(n => n.type === 'Text' && n.props.children === f.text))
  nodes.find(n => n.props?.label === 'Ver la frase').props.onPress()
  assert.ok(f.render().some(n => n.type === 'Text' && n.props.children === f.text))
  assert.deepEqual(f.played, [])
})

test('fragmento sin letra conserva reproducción y no presenta traducción vacía', async () => {
  const f = story({ lyrics: false, text: '' })
  const nodes = f.render()
  assert.ok(!nodes.some(n => n.props?.label === 'Vista del fragmento'))
  assert.ok(!nodes.some(n => n.props?.triggerSymbol === 'character.bubble'))
  await nodes.find(n => n.props?.label === 'Pausar').props.onPress()
  assert.deepEqual(f.played, ['message'])
})


test('fragmentos reutilizan la portada del reproductor y un slider, sin visualizador', async () => {
  const f = story({ artwork: true })
  const nodes = f.render()
  assert.ok(nodes.some(n => n.type === 'PlayerArtwork' && n.props.playing === true))
  assert.ok(nodes.some(n => n.type === 'PlayerBackdrop'))
  assert.ok(!nodes.some(n => n.type === 'Onda' || n.type === 'SongDisc'))
  await nodes.find(n => n.type === 'SeekBar').props.onSeek(0.4)
  assert.equal(f.seeks.length, 1)
  assert.equal(f.seeks[0][0], 'message')
  assert.equal(f.seeks[0][2], 0.4)
})


test('el encabezado compartido usa el del reproductor y conserva el destinatario', () => {
 const nodes = story().render()
 const header = nodes.find(n => n.type === 'PlayerHeader')
 assert.equal(header.props.title, 'Para friend')
 assert.equal(header.props.closeLabel, 'Volver al chat')
 assert.ok(!nodes.some(n => n.type === 'CabeceraSocial'))
})
test('la frase conserva saltos y palabras largas dentro del scroll, con altura libre', () => {
 const text = 'Una frase\n\n' + 'Larga'.repeat(300)
 const nodes = story({text,platform:'web'}).render()
 const note = nodes.find(n => n.type === 'Text' && n.props.children === text)
 assert.equal(note.props.numberOfLines, undefined)
 assert.equal(note.props.style.overflowWrap, 'anywhere')
 assert.equal(note.props.style.height, undefined)
 assert.equal(note.props.style.maxHeight, undefined)
 assert.ok(nodes.some(n => n.type === 'ScrollView'))
})
