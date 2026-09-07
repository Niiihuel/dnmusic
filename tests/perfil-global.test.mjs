import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

function cargar(path, deps = {}) {
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } })
  const exports = {}
  vm.runInNewContext(outputText, { exports, require: id => { assert.ok(id in deps, id); return deps[id] } })
  return exports
}
const helper = cargar('src/ui/DiscordCosmeticos.helpers.ts')
const marco = { innerWidth: 1200, overflowHorizontal: 56, overflowTop: 211, overflowBottom: 186 }
const top = { id: '1515086606665646213', type: 'staple', anchor: 'top', order: 'front', responsive: false }
// Dimensiones leídas de los PNG públicos previamente verificados; ninguna descarga en los tests.
const imagen = { width: 1312, height: 623 }

test('el margen exterior reserva las puntas y mantiene íntegro el PNG a 300–360px', () => {
  for (const ancho of [300, 320, 360]) {
    const margen = helper.margenesMarcoDiscord(marco, ancho)
    const interior = ancho - margen.paddingHorizontal * 2
    const g = helper.geometriaCapaDiscord(marco, top, interior, 420, imagen)
    assert.ok(Math.abs(g.width - ancho) < 1e-10)
    assert.ok(Math.abs(g.height / g.width - imagen.height / imagen.width) < 1e-12)
    assert.ok(Math.abs(g.top + margen.paddingTop) < 1e-10)
    assert.equal(g.repetir, 1)
    assert.equal(g.recortar, false)
  }
})

test('cover conserva el lienzo y los offsets tanto en perfiles largos como apaisados', () => {
  const efectos = [{ width: 450, height: 880, position: { x: 0, y: 0 } }, { width: 80, height: 90, position: { x: 150, y: 200 } }]
  for (const [width, height] of [[320, 900], [1100, 600], [1100, 2400]]) {
    const g = helper.encuadreEfectosDiscord(efectos, width, height, 'cover')
    assert.ok(g.width >= width); assert.ok(g.height >= height)
    assert.ok(Math.abs(g.width / g.height - 450 / 880) < 1e-12)
    assert.equal(g.left, (width - g.width) / 2)
    assert.equal(g.top, 0)
  }
  assert.equal(helper.encuadreEfectosDiscord(efectos, 300, 2000, 'ancho').escala, 2 / 3)
})

const jsxRuntime = await import('react/jsx-runtime')
const flatten = s => Array.isArray(s) ? Object.assign({}, ...s.map(flatten)) : s
const deps = {
  react: React, 'react/jsx-runtime': jsxRuntime,
  'react-native': { StyleSheet: { absoluteFill: { position: 'absolute', inset: 0 } }, View: ({ children, style, pointerEvents, testID }) => React.createElement('div', { style: flatten(style), 'data-pointer-events': pointerEvents, 'data-testid': testID }, children) },
  'expo-linear-gradient': { LinearGradient: () => React.createElement('div', { 'data-scrim': true }) },
  '../services/discordCatalogo': { esDiscord: id => id?.startsWith('discord:'), usePiezaDiscord: () => ({ ...marco, tipo: 'marcoPerfil' }) },
  './Avatar': { Avatar: () => null }, './Marco': { Marco: () => null }, './Placas': { PlacaDeNombre: ({ children }) => children },
  './PerfilPublico': { FondoPerfil: () => null, Identidad: props => React.createElement('header', { 'data-animado': props.animado }, props.nombre) },
  './DecoracionImagen': { EfectoPerfil: () => null },
  './DiscordCosmeticos': { DiscordEfecto: props => React.createElement('div', { 'data-fit': props.ajuste, 'data-animado': props.animado }), MarcoContenidoDiscord: ({ children }) => React.createElement('section', { 'data-card-frame': true }, children) },
  './DiscordCosmeticos.helpers': helper,
  './FuentePerfil': { FuentePerfil: ({ children }) => children, TextoPerfil: ({ children }) => React.createElement('span', null, children) },
}
const ui = cargar('src/ui/TarjetaPerfil.tsx', deps)
const perfil = { userId: 'qa', username: 'qa', displayName: 'QA', marcoPerfil: 'discord:frame', efecto: 'discord:effect' }
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props))

test('la superficie tiene contenido limitado pero ningún marco, fondo, radio o padding extra', () => {
  const contenido = React.createElement('button', { type: 'button' }, 'Editar vitrina')
  const resultado = render(ui.SuperficiePerfil, { perfil, anchoContenido: 1100, children: contenido })
  const outer = resultado.match(/<div[^>]*data-testid="superficie-perfil"[^>]*>/)[0]
  const inner = resultado.match(/<div[^>]*data-testid="contenido-perfil"[^>]*>/)[0]
  assert.match(outer, /width:100%/)
  assert.doesNotMatch(outer, /max-width|padding|border|background/)
  assert.match(inner, /max-width:1100px/)
  assert.doesNotMatch(resultado, /data-card-frame|data-fit|disabled/)
  assert.match(resultado, /<button type="button">Editar vitrina<\/button>/)
  const cabecera = render(ui.CabeceraPerfil, { perfil, banda: true, animado: false, accion: contenido })
  assert.match(cabecera, /<header data-animado="false">QA<\/header>/)
  assert.match(cabecera, /Editar vitrina/)
  assert.doesNotMatch(cabecera, /tarjeta-perfil|card-frame/)
  assert.match(render(ui.TarjetaPerfil, { perfil, animado: false }), /data-card-frame="true"/)
})

test('el efecto usa el alto medido del panel y se pausa desde el probador', () => {
  let alto = 0
  const local = cargar('src/ui/TarjetaPerfil.tsx', { ...deps, react: { ...React, useState: () => [alto, v => { alto = v }] } })
  let tree = local.FondoEstiloPerfil({ perfil, animado: false })
  assert.equal(tree.props.pointerEvents, 'none')
  tree.props.onLayout({ nativeEvent: { layout: { height: 812 } } })
  tree = local.FondoEstiloPerfil({ perfil, animado: false })
  const efecto = tree.props.children[1].props.children[0]
  assert.equal(efecto.props.alto, 812)
  assert.equal(efecto.props.ajuste, 'cover')
  assert.equal(efecto.props.animado, false)
})

test('ambos perfiles montan el fondo fuera del ScrollView y estadísticas sin duplicar resumen corto', () => {
  for (const ruta of ['app/profile/index.tsx', 'app/perfil/[usuario].tsx']) {
    const source = ts.createSourceFile(ruta, readFileSync(ruta, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const fondos = [], resumenes = [], recientes = []
    function walk(node, scroll = false) {
      const tag = ts.isJsxElement(node) ? node.openingElement.tagName.getText(source) : ts.isJsxSelfClosingElement(node) ? node.tagName.getText(source) : ''
      if (tag === 'FondoEstiloPerfil') fondos.push(scroll)
      if (tag === 'Resumen') resumenes.push(node.getText(source))
      if (tag === 'Reciente') recientes.push(node.getText(source))
      ts.forEachChild(node, child => walk(child, scroll || tag === 'ScrollView'))
    }
    walk(source)
    assert.deepEqual(fondos, [false], ruta)
    assert.equal(resumenes.length, 1)
    assert.match(resumenes[0], /marcoPerfil=/)
    assert.match(recientes[0], /sinResumen/)
  }
})

test('Resumen enmarca sólo cifras, omite biblioteca privada no provista y limita ancho a 360', () => {
  const source = ts.createSourceFile('PerfilPublico.tsx', readFileSync('src/ui/PerfilPublico.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const fn = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'Resumen').getText(source)
  const output = ts.transpileModule(fn, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}, nodes = []
  const stub = tag => function Stub(props) { nodes.push([tag, props]); return React.createElement('div', null, props.children) }
  vm.runInNewContext(output, { exports, require: () => jsxRuntime, useState: () => [null, () => {}], useEffect: () => {},
    usePiezaDiscord: () => ({ tipo: 'marcoPerfil', disponible: true }), View: stub('View'), Text: stub('Text'),
    MarcoContenidoDiscord: stub('Marco'), Dato: stub('Dato'), mesYAno: () => 'septiembre 2026' })
  render(exports.Resumen, { ownerId: 'qa', marcoPerfil: 'discord:stats', desde: null })
  assert.equal(nodes.find(([tag]) => tag === 'Marco')[1].id, 'discord:stats')
  assert.equal(nodes[0][1].style.maxWidth, 360)
  assert.equal(nodes[0][1].style.paddingBottom, 16)
  const rotulos = nodes.filter(([tag]) => tag === 'Dato').map(([, props]) => props.rotulo)
  assert.deepEqual(rotulos, ['Minutos escuchados', 'Vitrinas', 'Acá desde'])
  assert.ok(nodes.some(([tag, props]) => tag === 'View' && props.style.minHeight === 380))
})
