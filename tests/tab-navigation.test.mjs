import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const code = ts.transpileModule(readFileSync('src/ui/TabBar.shared.tsx', 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText
function navigation(pathname) {
  const calls = [], exports = {}
  const router = { dismissTo: path => calls.push(['dismissTo', path]), navigate: path => calls.push(['navigate', path]) }
  new Function('exports', 'require', code)(exports, id => {
    if (id === 'react') return { useCallback: fn => fn }
    if (id === 'expo-router') return { useRouter: () => router, usePathname: () => pathname }
    if (id === '../state/shell') return { setTab: tab => calls.push(['tab', tab]) }
    return {}
  })
  return { go: exports.useIrATab(), calls }
}
for (const path of ['/lista/123', '/profile/editar', '/profile/editar/musica', '/profile', '/ajustes']) {
  test(`las secciones y la búsqueda salen de ${path} hasta la raíz`, () => {
    for (const tab of ['inicio', 'listas', 'chats', 'buscar']) {
      const h = navigation(path)
      h.go(tab)
      assert.deepEqual(h.calls, [['tab', tab], ['dismissTo', '/']])
    }
  })
}
test('repetir una sección en la raíz vuelve a disparar su navegación interna', () => {
  const h = navigation('/')
  h.go('listas'); h.go('listas')
  assert.deepEqual(h.calls, [['tab', 'listas'], ['tab', 'listas']])
})
test('perfil vuelve a su raíz desde el editor y no se duplica si ya está abierto', () => {
  const h = navigation('/profile/editar')
  h.go('perfil')
  assert.deepEqual(h.calls, [['tab', 'perfil'], ['dismissTo', '/profile']])
  const root = navigation('/profile')
  root.go('perfil')
  assert.deepEqual(root.calls, [['tab', 'perfil']])
})

test('abrir perfil desde inicio conserva la pantalla principal en la pila', () => {
  const h = navigation('/')
  h.go('perfil')
  assert.deepEqual(h.calls, [['tab', 'perfil'], ['navigate', '/profile']])
})
