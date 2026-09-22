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

function selector(estadoFuentes = [true, null]) {
  const jsx = (type, props) => ({ type, props })
  const perfil = { username: 'ana', displayName: 'Ana', fuente: 'revista' }
  const cambios = [], salidas = [], exports = {}
  const imports = {
    react: { useState: initial => [initial, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Platform: { OS: 'ios' }, ActivityIndicator: 'ActivityIndicator', FlatList: 'FlatList', View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView' },
    'expo-router': { Stack: { Screen: 'StackScreen' }, useRouter: () => ({ dismissTo: path => salidas.push(path) }) },
    '../../src/lib/fuentes': { ...fonts, useEstadoFuentesDelPerfil: () => estadoFuentes },
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
  return { header, list, cambios, salidas }
}

test('iOS muestra lista independiente con cabecera nativa y permite elegir sin guardar todavía', () => {
  const { header, list, cambios, salidas } = selector()
  assert.equal(header.type, 'StackScreen')
  assert.equal(header.props.options.headerShown, true)
  assert.equal(list.type, 'FlatList')
  assert.equal(list.props.style.flex, 1)
  assert.equal(list.props.collapsable, false)
  assert.equal(list.props.data.length, 13)
  const item = list.props.renderItem({ item: fonts.fuenteDe('editorial') })
  const option = item.type(item.props)
  assert.equal(option.type, 'FilaSocial')
  assert.equal(option.props.fontFamily, 'Lora-SemiBold')
  assert.equal(option.props.fontSize, 20)
  assert.equal(option.props.selected, false)
  assert.equal(option.props.disabled, false)
  option.props.onPress()
  assert.deepEqual(cambios, [{ fuente: 'editorial' }])
  assert.deepEqual(salidas, [])
  header.props.options.headerLeft().props.onPress()
  assert.deepEqual(salidas, ['/profile/editar'])
})

test('las 12 muestras SwiftUI usan el nombre PostScript real dentro de su TTF', () => {
  fonts.useFuentesDelPerfil()
  const { list } = selector()
  for (const fuente of fonts.FUENTES) {
    const buffer = readFileSync(bundled[fuente.familia])
    const names = new Set()
    for (let i = 0; i < buffer.readUInt16BE(4); i++) {
      const table = 12 + i * 16
      if (buffer.toString('ascii', table, table + 4) !== 'name') continue
      const offset = buffer.readUInt32BE(table + 8)
      const start = offset + buffer.readUInt16BE(offset + 4)
      for (let n = 0; n < buffer.readUInt16BE(offset + 2); n++) {
        const record = offset + 6 + n * 12
        if (buffer.readUInt16BE(record + 6) !== 6) continue
        const pos = start + buffer.readUInt16BE(record + 10)
        const bytes = Buffer.from(buffer.subarray(pos, pos + buffer.readUInt16BE(record + 8)))
        const unicode = [0, 3].includes(buffer.readUInt16BE(record))
        names.add(unicode ? bytes.swap16().toString('utf16le') : bytes.toString())
      }
    }
    const item = list.props.renderItem({ item: fuente })
    const option = item.type(item.props)
    assert.ok(names.has(option.props.fontFamily), `${fuente.nombre}: ${option.props.fontFamily} no existe en el TTF`)
    assert.equal(option.props.fontSize, fonts.estiloDeFuente(fuente.id, 20).fontSize)
  }
  assert.equal(fonts.familiaSwiftUI(undefined), undefined)
  assert.equal(fonts.familiaSwiftUI('Helvetica'), 'Helvetica')
})

test('no monta muestras nativas antes de cargar; informa errores sin bloquear el cierre', () => {
  const loading = selector([false, null])
  assert.equal(loading.list.props.data.length, 0)
  assert.equal(loading.list.props.ListHeaderComponent, null)
  assert.equal(loading.list.props.ListEmptyComponent.props.children[0].type, 'ActivityIndicator')
  const failed = selector([false, new Error('Fuente no disponible')])
  assert.equal(failed.list.props.data.length, 0)
  assert.equal(failed.list.props.ListEmptyComponent.props.children[0], null)
  assert.equal(failed.list.props.ListEmptyComponent.props.children[1].props.accessibilityRole, 'alert')
  failed.header.props.options.headerLeft().props.onPress()
  assert.deepEqual(failed.salidas, ['/profile/editar'])
})

test('la fila conserva la fuente nativa, su tamaño y Dynamic Type sin forzar otro peso', () => {
  const jsx = (type, props) => ({ type, props })
  const exports = {}
  const imports = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@expo/ui/swift-ui': new Proxy({}, { get: (_, name) => name }),
    '@expo/ui/swift-ui/modifiers': new Proxy({}, { get: (_, name) => value => ({ name, value }) }),
  }
  new Function('exports', 'require', compile('src/ui/FilaSocial.ios.tsx'))(exports, name => {
    assert.ok(name in imports, name); return imports[name]
  })
  const tree = exports.FilaSocial({ titulo: 'Una muestra', fontFamily: 'Caveat-Bold', fontSize: 25, onPress() {} })
  const text = tree.props.children.props.children.props.children[0].props.children[0]
  assert.equal(text.type, 'Text')
  assert.deepEqual(text.props.modifiers[0].value, { textStyle: 'subheadline', family: 'Caveat-Bold', size: 25 })
})
