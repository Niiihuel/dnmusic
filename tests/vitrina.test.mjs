import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import babel from '@babel/core'
import traverse from '@babel/traverse'
import generate from '@babel/generator'

const jsx = (type, props) => ({ type, props })
function vitrina() {
  const exports = {}
  const codigo = ts.transpileModule(readFileSync('src/ui/Vitrina.tsx', 'utf8') + '\nexport { VitrinaLista, VitrinaArtista, FichaFijada, ChipsDeReacciones }', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  new Function('exports', 'require', codigo)(exports, id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === 'react') return { useState: v => [v, () => {}], useEffect() {} }
    if (id === '../lib/tema') return { temaEfectivo: () => null, coloresDe: () => c }
    if (id === '../lib/colorPortada') return { useColorPortada: () => null }
    if (id === '../services/music') return { proxiedImage: url => url }
    if (id === './estadoControl') return { estadoControlWeb: modo => ({ dataSet: { dnHover: modo } }) }
    return new Proxy({}, { get: (_, key) => key })
  })
  return exports
}
const c = { texto: '#fff', secundario: '#bbb', claro: false }
const lista = { id: 'local-lista', name: 'Mi música', visibilidad: 'privada', tracks: 34, covers: [], coverPath: null }

test('la pieza privada conserva su destino y la marca solo visible para su dueño', () => {
  const { VitrinaLista, FichaFijada } = vitrina()
  const abiertas = []
  const ficha = VitrinaLista({ playlistId: lista.id, playlists: [lista], esMio: true, c, mitad: false, onOpen: id => abiertas.push(id) })
  assert.equal(ficha.props.privada, true)
  const enlace = FichaFijada(ficha.props)
  assert.equal(enlace.props.accessibilityRole, 'link')
  enlace.props.onPress()
  assert.deepEqual(abiertas, [lista.id])
  assert.equal(VitrinaLista({ playlistId: lista.id, playlists: [], esMio: false, c, mitad: false }), null)
})

test('artista conserva nombre e id al navegar; las previas sin callback no crean enlaces falsos', () => {
  const { VitrinaArtista, VitrinaLista, FichaFijada } = vitrina()
  const abiertas = []
  const props = { artista: { artistId: 'local-artista', nombre: 'Artista', fotoUrl: '' }, c, mitad: true }
  const ficha = VitrinaArtista({ ...props, onOpen: (...args) => abiertas.push(args) })
  FichaFijada(ficha.props).props.onPress()
  assert.deepEqual(abiertas, [['local-artista', 'Artista']])
  assert.equal(FichaFijada(VitrinaArtista(props).props).type, 'View')
  const previaLista = VitrinaLista({ playlistId: lista.id, playlists: [lista], esMio: true, c, mitad: true })
  assert.equal(FichaFijada(previaLista.props).type, 'View')
})

test('el mosaico conecta destinos reales y desactiva navegación mientras edita o muestra borrador', () => {
  const ast = babel.parseSync(readFileSync('src/ui/PerfilPublico.tsx', 'utf8'), { configFile: false, babelrc: false, parserOpts: { plugins: ['typescript', 'jsx'] } })
  const props = {}
  traverse.default(ast, {
    JSXAttribute(path) {
      const name = path.node.name.name
      if (name === 'onOpenPlaylist' || name === 'onOpenArtist') props[name] = generate.default(path.node.value.expression).code
    },
  })
  const acciones = []
  const router = { push: path => acciones.push(['push', path]), dismissTo: path => acciones.push(['dismiss', path]) }
  const abrirArtista = (...args) => acciones.push(['artista', ...args])
  const leer = (name, editando, borrador) => new Function('editando', 'borrador', 'router', 'abrirArtista', `return (${props[name]})`)(editando, borrador, router, abrirArtista)
  leer('onOpenPlaylist', false, undefined)('local-lista')
  leer('onOpenArtist', false, undefined)('local-artista', 'Artista')
  assert.deepEqual(acciones, [['push', '/lista/local-lista'], ['artista', 'local-artista', 'Artista'], ['dismiss', '/']])
  for (const name of ['onOpenPlaylist', 'onOpenArtist']) {
    assert.equal(leer(name, true, undefined), undefined)
    assert.equal(leer(name, false, { guardando: false }), undefined)
  }
})

function buscar(node, type) {
  if (!node || typeof node !== 'object') return undefined
  if (Array.isArray(node)) return node.map(child => buscar(child, type)).find(Boolean)
  return node.type === type ? node : buscar(node.props?.children, type)
}

for (const esMio of [true, false]) {
  test(`perfil ${esMio ? 'propio' : 'ajeno'}: tocar lista pública o artista navega sin reproducir`, () => {
    const { Vitrina, VitrinaLista, VitrinaArtista, FichaFijada } = vitrina()
    const acciones = []
    const props = {
      esMio, playing: false, playlists: [{ ...lista, visibilidad: 'publica' }],
      onTogglePlay: () => assert.fail('Tocar una lista o artista no reproduce música'),
      onOpenPlaylist: id => acciones.push(['lista', id]),
      onOpenArtist: (id, nombre) => acciones.push(['artista', id, nombre]),
    }
    const listaUI = Vitrina({ ...props, showcase: { kind: 'lista', id: 'pieza-lista', playlistId: lista.id, ancho: 'entero', estilo: {} } })
    const fichaLista = VitrinaLista(buscar(listaUI, VitrinaLista).props)
    assert.equal(fichaLista.props.privada, false)
    FichaFijada(fichaLista.props).props.onPress()
    const artistaUI = Vitrina({ ...props, showcase: { kind: 'artista', id: 'pieza-artista', ancho: 'mitad', estilo: {}, artista: { artistId: 'artista-local', nombre: 'Artista', fotoUrl: '' } } })
    const fichaArtista = VitrinaArtista(buscar(artistaUI, VitrinaArtista).props)
    FichaFijada(fichaArtista.props).props.onPress()
    assert.deepEqual(acciones, [['lista', lista.id], ['artista', 'artista-local', 'Artista']])
  })
}

test('modo edición elimina enlaces de lista y artista aunque reciba callbacks de navegación', () => {
  const { Vitrina, VitrinaLista, VitrinaArtista, FichaFijada } = vitrina()
  const noNavegar = () => assert.fail('El gesto de edición no debe abrir otra pantalla')
  for (const kind of ['lista', 'artista']) {
    const ui = Vitrina({
      showcase: { kind, id: `pieza-${kind}`, ancho: 'entero', estilo: {}, playlistId: lista.id, artista: { artistId: 'artista-local', nombre: 'Artista', fotoUrl: '' } },
      esMio: true, editando: true, playing: false, playlists: [lista],
      onTogglePlay: noNavegar, onOpenPlaylist: noNavegar, onOpenArtist: noNavegar,
    })
    const component = kind === 'lista' ? VitrinaLista : VitrinaArtista
    const contenido = buscar(ui, component)
    assert.equal(contenido.props.onOpen, undefined)
    const ficha = FichaFijada(component(contenido.props).props)
    assert.equal(ficha.type, 'View')
    assert.equal(ficha.props.onPress, undefined)
  }
})

test('mostrar y editar conservan el ancho del mosaico; foco de teclado delega al vidrio compartido', () => {
  const { Vitrina, FichaFijada } = vitrina()
  for (const kind of ['lista', 'artista', 'album']) {
    for (const ancho of ['mitad', 'entero', 'grande']) {
      const props = { showcase: { kind, ancho, estilo: {} }, playlists: [], playing: false, esMio: true }
      const visible = Vitrina(props)
      const editando = Vitrina({ ...props, editando: true })
      assert.deepEqual(visible.props.style, editando.props.style)
      assert.equal(visible.props.style.width, '100%')
      assert.equal(visible.props.style.maxWidth, undefined)
    }
  }
  const enlace = FichaFijada({ tipo: 'Lista', titulo: 'Mi música', c, mitad: false, onPress() {} })
  assert.equal(enlace.props.dataSet.dnHover, 'glass')
  assert.equal(enlace.props.onFocus, undefined, 'el mouse no deja un foco guardado en React')
  assert.equal(enlace.props.style.boxShadow, undefined)
})


test('un fragmento sin reacciones ofrece un botón visible que no reproduce', () => {
  const { Vitrina, ChipsDeReacciones } = vitrina()
  let abiertas = 0, detenido = false
  const props = { showcase: { kind: 'cancion', id: 'fragmento', ancho: 'entero', estilo: {} },
    esMio: false, playlists: [], playing: false, onTogglePlay() { assert.fail('No debe reproducir') },
    onAgregarReaccion() { abiertas++ } }
  const pieza = Vitrina(props)
  const fila = buscar(pieza, ChipsDeReacciones)
  assert.ok(fila, 'no depende de un conteo previo ni del gesto largo')
  const boton = buscar(ChipsDeReacciones(fila.props), 'Pressable')
  assert.equal(boton.props.accessibilityLabel, 'Reaccionar a esta pieza')
  boton.props.onPress({ stopPropagation() { detenido = true } })
  assert.equal(abiertas, 1); assert.equal(detenido, true)
  assert.equal(buscar(Vitrina({ ...props, editando: true }), ChipsDeReacciones), undefined)
})
