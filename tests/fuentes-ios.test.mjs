import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const compile = path => ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText
const fonts = {}
let bundled
new Function('exports', 'require', compile('src/lib/fuentes.ts'))(fonts, name => {
  if (name === 'expo-font') return { useFonts: files => { bundled = files; return [true] } }
  assert.ok(existsSync(require.resolve(name)), `Falta el asset ${name}`)
  return require.resolve(name)
})

test('el catálogo completo está empaquetado y la base acepta los mismos IDs', () => {
  assert.equal(fonts.useFuentesDelPerfil(), true)
  const ids = fonts.FUENTES.map(f => f.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(ids.length, 12)
  const sql = readFileSync('supabase/migrations/20260918000000_fuentes_ampliadas.sql', 'utf8')
  for (const f of fonts.FUENTES) {
    assert.ok(bundled[f.familia], `Falta archivo para ${f.nombre}`)
    assert.ok(sql.includes(`'${f.id}'`), `La base rechazaría ${f.nombre}`)
    assert.equal(fonts.estiloDeFuente(f.id, 20).fontWeight, 'normal')
  }
  assert.equal(fonts.fuenteDe('desconocida'), null)
})

test('iOS muestra lista independiente con cabecera nativa y permite elegir sin guardar todavía', () => {
  const jsx = (type, props) => ({ type, props })
  const perfil = { username: 'ana', displayName: 'Ana', fuente: 'revista' }
  const cambios = [], salidas = [], exports = {}
  const imports = {
    react: { useState: initial => [initial, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Platform: { OS: 'ios' }, FlatList: 'FlatList', View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView' },
    'expo-router': { Stack: { Screen: 'StackScreen' }, useRouter: () => ({ dismissTo: path => salidas.push(path) }) },
    '../../src/lib/fuentes': fonts,
    '../../src/ui/FilaSocial': { FilaSocial: 'FilaSocial' },
    '../../src/ui/Hoja': { Hoja: 'Hoja', useHojaModal: () => false, usePisoHoja: () => 34 },
    '../../src/ui/icons': { ICON_COLOR: { foreground: '#fff' }, IconCheck: 'IconCheck' },
    '../../src/ui/EditorDeCampo': { CabeceraEdicionPerfil: 'CabeceraEdicionPerfil' },
    '../../src/ui/TarjetaPerfil': { TarjetaPerfil: 'TarjetaPerfil' },
    '../../src/ui/EncabezadoHoja': { BotonHoja: 'BotonHoja' },
    '../../src/ui/estadoControl': { estadoControlWeb: () => ({}) },
    '../../src/state/perfilEdicion': { useIniciarPerfilEdicion: () => perfil, usePerfilEdicion: () => ({ ocupado: false }), actualizarPerfilEdicion: patch => cambios.push(patch) },
  }
  new Function('exports', 'require', compile('app/profile/fuente.tsx'))(exports, name => {
    assert.ok(name in imports, name); return imports[name]
  })
  const tree = exports.default()
  const [header, list] = tree.props.children
  assert.equal(header.type, 'StackScreen')
  assert.equal(header.props.options.headerShown, true)
  assert.equal(list.type, 'FlatList')
  assert.equal(list.props.style.flex, 1)
  assert.equal(list.props.collapsable, false)
  assert.equal(list.props.data.length, 13)
  const item = list.props.renderItem({ item: fonts.fuenteDe('editorial') })
  const option = item.type(item.props)
  assert.equal(option.type, 'FilaSocial')
  assert.equal(option.props.fontFamily, fonts.estiloDeFuente('editorial').fontFamily)
  assert.equal(option.props.selected, false)
  assert.equal(option.props.disabled, false)
  option.props.onPress()
  assert.deepEqual(cambios, [{ fuente: 'editorial' }])
  assert.deepEqual(salidas, [])
  header.props.options.headerLeft().props.onPress()
  assert.deepEqual(salidas, ['/profile/editar'])
})
