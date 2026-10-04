import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
function load(path, mocks = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  new Function('exports', 'require', code)(exports, name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name in mocks) return mocks[name]
    if (name.startsWith('.')) return load(`${resolve(dirname(path), name)}.ts`, mocks)
    throw Error(`Missing mock: ${name}`)
  })
  return exports
}
function tree(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(tree)
  return [node, ...tree(node.props?.children)]
}
const song = { kind: 'track', videoId: 'track', title: 'La Chica Que Soñé', artist: 'Tropical Panamá',
  artistId: null, artworkUrl: null, artworkPath: null, audioPath: null, durationMs: 180000 }
const label = shared => `🎵 ${shared.title} — ${shared.artist}`.slice(0, 2000).trim()
const message = (patch = {}) => ({ id: 'message', senderUid: 'author', text: label(song),
  createdAt: new Date('2026-10-04T16:01:00'), openedAt: null, readAt: null, editedAt: null,
  editedRevision: null, deletedAt: null, song: null, sharedSong: song, ...patch })
const presentation = load('src/ui/chatPresentation.ts')
const symbols = new Proxy({}, { get: (_, key) => String(key) })
function mocks(platform) {
  return {
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Image: 'Image',
      Platform: { OS: platform }, StyleSheet: { absoluteFill: {} } },
    './Menu': { Menu: 'Menu', MantenerApretado: 'MantenerApretado' },
    './useClicDerecho': { useClicDerecho: () => ({ gestos: { onContextMenu() {} }, punto: null, cerrar() {} }) },
    '../lib/portapapeles': { copiarAlPortapapeles: async () => true }, '../state/aviso': { avisar() {} },
    './IconButton': { IconButton: 'IconButton' }, './CancionCompartida': { CancionCompartida: 'CancionCompartida' },
    './InvitacionJam': { InvitacionJam: 'InvitacionJam' }, '../lib/artwork': { artworkSource: () => null },
    '../lib/teclado': { TECLADO_FISICO: platform === 'web' }, './SeekBar': { SeekBar: 'SeekBar' },
    './icons': symbols, './estadoControl': { estadoControlWeb: () => ({}) },
    '../state/shell': { usePiso: () => 24 }, './Social': { SeccionSocial: 'SeccionSocial' },
    './CabeceraLateral': { CabeceraLateral: 'CabeceraLateral', BotonLateral: 'BotonLateral' },
    './Lyrics': { Lyrics: 'Lyrics' }, './ScrollArea': { ScrollArea: 'ScrollArea' }, './Vacio': { Vacio: 'Vacio' },
  }
}
const bubbleProps = msg => ({ message: msg, mine: true, userId: 'author', onPress() {},
  onPlay() {}, onSeek() {}, onEdit() {}, onDelete() {} })

test('oculta sólo el rótulo automático sin modificar mensajes ni dedicatorias', () => {
  const original = message()
  assert.equal(presentation.messageDisplayText(original), '')
  assert.equal(original.text, label(song))
  for (const text of ['Escuchá esta canción ❤️', `${label(song)}\nMe acordé de vos`, '🎵 La Chica Que Soñé - Tropical Panamá']) {
    assert.equal(presentation.messageDisplayText(message({ text })), text)
  }
  assert.equal(presentation.messageDisplayText(message({ sharedSong: null })), label(song))
  assert.equal(presentation.messageDisplayText(message({ editedAt: new Date() })), label(song))
  assert.equal(presentation.messageDisplayText(message({ editedRevision: 'revision' })), label(song))
  assert.equal(presentation.messageDisplayText(message({ deletedAt: new Date() })), label(song))
  const long = { ...song, title: 't'.repeat(1997), artist: 'Artista' }
  assert.equal(presentation.messageDisplayText(message({ sharedSong: long, text: label(long) })), '')
})

for (const platform of ['ios', 'android', 'web']) {
  test(`${platform}: una tarjeta sin doble burbuja conserva alineación, hora y opciones accesibles`, () => {
    const { ChatBubble } = load('src/ui/ChatBubble.tsx', mocks(platform))
    let opened = 0, edited = 0
    for (const mine of [true, false]) {
      const msg = message({ readAt: new Date(), editedAt: null })
      const nodes = tree(ChatBubble({ ...bubbleProps(msg), mine, userId: mine ? 'author' : 'recipient', onDetails: () => opened++, onEdit: () => edited++ }))
      const cards = nodes.filter(node => node.type === 'CancionCompartida')
      assert.equal(cards.length, 1)
      assert.equal(cards[0].props.song, song)
      assert.ok(!nodes.some(node => node.type === 'Text' && node.props.children === msg.text))
      const wrapper = nodes.find(node => node.props.dataSet?.chatBubble === 'true')
      assert.equal(wrapper.props.style.width, 325)
      assert.equal(wrapper.props.style.maxWidth, platform === 'web' ? '76%' : '88%')
      const hold = nodes.find(node => node.type === 'MantenerApretado')
      assert.equal(hold.props.children.props.style.backgroundColor, undefined)
      assert.equal(hold.props.children.props.style.paddingHorizontal, undefined)
      assert.ok(nodes.some(node => node.props.className === (mine ? 'items-end' : 'items-start')))
      const receipt = nodes.find(node => node.props.accessible && node.props.accessibilityActions)
      assert.match(receipt.props.accessibilityLabel, /16:01/)
      assert.equal(receipt.props.accessibilityLabel.includes('leído'), mine)
      const info = receipt.props.accessibilityActions.find(action => action.label === 'Información del mensaje')
      receipt.props.onAccessibilityAction({ nativeEvent: { actionName: info.name } })
      const edit = receipt.props.accessibilityActions.find(action => action.label === 'Editar mensaje')
      assert.equal(!!edit, mine)
      if (edit) receipt.props.onAccessibilityAction({ nativeEvent: { actionName: edit.name } })
      assert.ok(hold.props.items.some(item => item.label === 'Copiar'))
      const menus = nodes.filter(node => node.type === 'Menu')
      assert.equal(menus.length, platform === 'web' ? 1 : 0)
      if (platform === 'web') {
        const actions = nodes.find(node => node.props.dataSet?.chatActions === 'true')
        assert.equal(actions.props.style?.position, undefined, 'el menú no tapa la tarjeta')
        assert.ok(tree(hold.props.children).includes(actions))
      }
    }
    assert.equal(opened, 2)
    assert.equal(edited, 1)
  })

  test(`${platform}: la dedicatoria tiene su superficie y la tarjeta permanece independiente`, () => {
    const { ChatBubble } = load('src/ui/ChatBubble.tsx', mocks(platform))
    const caption = 'Esta canción me hace pensar en vos'
    const nodes = tree(ChatBubble(bubbleProps(message({ text: caption }))))
    const text = nodes.find(node => node.type === 'Text' && node.props.children === caption)
    assert.ok(text)
    const pressable = nodes.find(node => node.type === 'Pressable' && node.props.accessibilityLabel === caption)
    assert.equal(pressable.props.style.backgroundColor, '#303033')
    assert.equal(tree(pressable).filter(node => node.type === 'CancionCompartida').length, 0)
    assert.equal(nodes.filter(node => node.type === 'CancionCompartida').length, 1)
    assert.equal(message({ text: caption }).text, caption)
    const edited = tree(ChatBubble(bubbleProps(message({ editedAt: new Date() }))))
    assert.ok(edited.some(node => node.type === 'Text' && node.props.children === label(song)))
    assert.ok(edited.some(node => node.type === 'Text' && node.props.children === 'Editado'))
  })

  test(`${platform}: seleccionar una canción resalta su pie sin desplazar hora, recibos ni menú`, () => {
    const { ChatBubble } = load('src/ui/ChatBubble.tsx', mocks(platform))
    const msg = message({ readAt: new Date() })
    const unselected = tree(ChatBubble({ ...bubbleProps(msg), selected: false }))
    const selected = tree(ChatBubble({ ...bubbleProps(msg), selected: true }))
    const footer = nodes => nodes.find(node => node.type === 'View' && node.props.style?.paddingHorizontal === 4)
    const normalStyle = footer(unselected).props.style
    const selectedStyle = footer(selected).props.style
    assert.equal(normalStyle.backgroundColor, undefined)
    assert.equal(selectedStyle.backgroundColor, '#414145', 'el mensaje abierto en detalle sigue siendo identificable')
    const { backgroundColor: _, ...selectedLayout } = selectedStyle
    assert.deepEqual(selectedLayout, normalStyle, 'seleccionar no mueve el pie de la tarjeta')
    for (const nodes of [unselected, selected]) {
      assert.equal(nodes.filter(node => node.type === 'CancionCompartida').length, 1)
      assert.ok(!nodes.some(node => node.type === 'Text' && node.props.children === msg.text))
      const receipt = tree(footer(nodes)).find(node => node.props.accessible && node.props.accessibilityActions)
      assert.match(receipt.props.accessibilityLabel, /16:01, leído/)
      assert.equal(receipt.props.accessibilityState.selected, nodes === selected)
      assert.ok(receipt.props.accessibilityActions.some(action => action.label === 'Información del mensaje'))
      assert.equal(tree(footer(nodes)).filter(node => node.type === 'Menu').length, platform === 'web' ? 1 : 0)
      assert.equal(nodes.find(node => node.type === 'MantenerApretado').props.children.props.style.backgroundColor, undefined)
    }
  })
}

test('los mensajes de texto y fragmentos conservan su burbuja y las acciones del fragmento', () => {
  const { ChatBubble } = load('src/ui/ChatBubble.tsx', mocks('ios'))
  const textMessage = message({ text: 'Te amo', sharedSong: null })
  const textNodes = tree(ChatBubble(bubbleProps(textMessage)))
  const bubble = textNodes.find(node => node.type === 'MantenerApretado').props.children
  assert.equal(bubble.props.style.paddingHorizontal, 12)
  assert.equal(bubble.props.style.backgroundColor, '#303033')
  assert.ok(textNodes.some(node => node.type === 'Text' && node.props.children === 'Te amo'))
  const snippet = { ...song, startMs: 30000, durationMs: 15000 }
  const snippetNodes = tree(ChatBubble(bubbleProps(message({ text: 'Mi verso favorito', sharedSong: null, song: snippet }))))
  assert.equal(snippetNodes.filter(node => node.type === 'SeekBar').length, 1)
  assert.equal(snippetNodes.find(node => node.props.dataSet?.chatBubble).props.style.width, 360)
  assert.ok(snippetNodes.find(node => node.type === 'MantenerApretado').props.items.some(item => item.label === 'Reproducir fragmento'))
})

test('bandeja y panel de detalle tampoco repiten metadatos y conservan las notas personales', () => {
  const { MessageCard } = load('src/ui/MessageCard.tsx', mocks('web'))
  const { MessageDetailBody } = load('src/ui/MessageDetailBody.tsx', {
    ...mocks('web'), './MessageCard': { formatMessageDate: () => '4 de octubre, 16:01' },
  })
  for (const render of [
    msg => MessageCard({ message: msg, mine: true, contactName: 'Kukis' }),
    msg => MessageDetailBody({ message: msg, mine: true, contactName: 'Kukis', playing: false,
      sonando: false, positionMs: 0, onCollapse() {}, onPlay() {}, onSeek() {} }),
  ]) {
    const nodes = tree(render(message()))
    assert.equal(nodes.filter(node => node.type === 'CancionCompartida').length, 1)
    assert.ok(!nodes.some(node => node.type === 'Text' && node.props.children === label(song)))
    const captionNodes = tree(render(message({ text: 'Dedicada para vos' })))
    assert.equal(captionNodes.filter(node => node.type === 'Text' && node.props.children === 'Dedicada para vos').length, 1)
    assert.equal(captionNodes.filter(node => node.type === 'CancionCompartida').length, 1)
  }
  assert.equal(MessageCard({ message: message(), mine: true, contactName: 'Kukis' }).props.className, 'min-w-0 gap-3')
})
