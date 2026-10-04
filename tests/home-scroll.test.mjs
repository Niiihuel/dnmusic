import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { tituloEditorial, identidadGenero } from '../src/lib/catalogoEditorial.ts'

const jsx = (type, props) => ({ type, props })
function nodes(node, type) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(n => nodes(n, type))
  return [...(node.type === type ? [node] : []), ...nodes(node.props?.children, type)]
}
function load(width, loaded) {
  const source = readFileSync('src/ui/HomeFeed.tsx', 'utf8') + '\nexport { GenerosPage, GeneroPage, SectionPage }'
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } })
  let stateIndex = 0
  const exports = {}, onScroll = () => {}
  const deps = {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    react: { useState: initial => [stateIndex++ === 0 && loaded ? loaded : initial, () => {}], useEffect() {} },
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', useWindowDimensions: () => ({ width }) },
    '../state/shell': { usePiso: extra => 80 + extra, useTecho: extra => (width >= 780 ? 48 : 96) + extra },
    './useColapso': { useColapso: () => ({ onScroll }) },
    './ScrollArea': { ScrollArea: 'ScrollArea' }, './Panel': { Panel: 'Panel' },
    './icons': { ICON_COLOR: {} },
    '../lib/catalogoEditorial': { tituloEditorial, identidadGenero },
  }
  new Function('exports', 'require', outputText)(exports, id => deps[id] ?? {})
  return { ...exports, onScroll }
}

test('Inicio consume ScrollArea en carga y con datos, conservando espacio de cabecera y colapso', () => {
  for (const width of [390, 1440]) for (const loaded of [null, {
    sections: [], misGeneros: [], semillas: [], generos: [], artistas: [], escuchas: [], origenes: [], listas: [], mixes: [], anclas: [], radio: [], porque: [], portadaPendiente: true,
  }]) {
    const h = load(width, loaded)
    const ui = h.HomeFeed({ section: null, onOpenSection() {} })
    const scroll = nodes(ui, 'ScrollArea')[0]
    assert.ok(scroll, 'un ScrollView directo ignoraría ScrollAreaTecho del panel central')
    assert.equal(nodes(ui, 'ScrollView').length, 0)
    assert.equal(scroll.props.contentContainerStyle.paddingTop, width >= 780 ? 72 : 120)
    assert.equal(scroll.props.contentContainerStyle.paddingBottom, 104)
    assert.equal(scroll.props.onScroll, h.onScroll)
    assert.equal(scroll.props.scrollIndicatorInsets, undefined, 'hereda navegación, no los 24px de respiro del contenido')
  }
})

test('géneros, su esqueleto y sección abierta también usan el indicador del panel', () => {
  const h = load(1440)
  const trees = [
    h.GenerosPage({ generos: [], onBack() {}, onOpen() {} }),
    h.GeneroPage({ genero: { params: 'local', name: 'Local' }, onBack() {} }),
    h.SectionPage({ section: { title: 'Local', items: [] }, onBack() {} }),
  ]
  for (const tree of trees) {
    assert.equal(tree.type, 'ScrollArea')
    assert.equal(tree.props.contentContainerStyle.paddingTop, 72)
    assert.equal(tree.props.scrollIndicatorInsets, undefined)
  }
})
