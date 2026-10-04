import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
const jsx = (type, props) => ({ type, props })
function load(path, mocks = {}) {
  const exports = {}
  new Function('exports', 'require', ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText)(exports, name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name in mocks) return mocks[name]
    throw Error(`Missing mock: ${name}`)
  })
  return exports
}
const presentation = load('src/ui/chatPresentation.ts')
const msg = (senderUid, at) => ({ senderUid, createdAt: new Date(at), deletedAt: null })
test('agrupa solo mensajes consecutivos del mismo remitente dentro del mismo día y cinco minutos', () => {
  const a = msg('a', '2026-09-13T10:00:00')
  assert.equal(presentation.sameChatGroup(a, msg('a', '2026-09-13T10:04:59')), true)
  assert.equal(presentation.sameChatGroup(a, msg('a', '2026-09-13T10:05:00')), false)
  assert.equal(presentation.sameChatGroup(a, msg('b', '2026-09-13T10:01:00')), false)
  assert.equal(presentation.sameChatGroup(a, { ...a, deletedAt: new Date() }), false)
  assert.equal(presentation.sameChatGroup(msg('a', '2026-09-12T23:59:00'), msg('a', '2026-09-13T00:00:00')), false)
  assert.equal(presentation.sameChatGroup(a, { ...a, createdAt: null }), false)
})
test('separadores por día local; la hora permanece visible también en mensajes viejos', () => {
  const now = new Date('2026-09-13T10:00:00')
  assert.equal(presentation.chatDayLabel(now, undefined, now), 'Hoy')
  assert.equal(presentation.chatDayLabel(now, new Date('2026-09-13T01:00:00'), now), null)
  assert.equal(presentation.chatDayLabel(new Date('2026-09-12T23:59:00'), undefined, now), 'Ayer')
  assert.match(presentation.chatTime(new Date('2025-03-01T14:30:00')), /14:30/)
  assert.equal(presentation.chatDayLabel(new Date('invalid')), null)
})
test('clic derecho y Shift+F10 abren el mismo menú; las otras teclas no se interceptan', () => {
  let point = null, prevented = 0
  const { useClicDerecho } = load('src/ui/useClicDerecho.ts', {
    react: { useCallback: fn => fn, useState: () => [point, next => { point = next }] },
    '../lib/teclado': { TECLADO_FISICO: true },
  })
  const f = useClicDerecho()
  f.gestos.onContextMenu({ clientX: 80, clientY: 90, preventDefault() { prevented++ } })
  assert.deepEqual(point, { x: 80, y: 90 })
  f.gestos.onKeyDown({ key: 'F10', shiftKey: true, preventDefault() { prevented++ }, currentTarget: { getBoundingClientRect: () => ({ left: 10, top: 20, width: 120, height: 80 }) } })
  assert.deepEqual(point, { x: 42, y: 52 })
  f.gestos.onKeyDown({ key: 'a', preventDefault() { prevented++ } })
  assert.equal(prevented, 2)
  f.cerrar(); assert.equal(point, null)
})

test('menú de escritorio enfoca la primera acción, recorre filas y cierra con Escape', () => {
  const effects = [], document = { activeElement: null }, actions = [], closes = []
  const menu = { querySelectorAll: () => items, querySelector: () => items[0] }
  const items = ['Información', 'Copiar', 'Editar'].map((textContent, i) => ({
    textContent, isConnected: true, focus() { document.activeElement = this }, scrollIntoView() {},
    closest: () => menu, getAttribute: () => null, click: () => actions.push(i),
  }))
  const exports = {}
  const code = ts.transpileModule(readFileSync('src/ui/MenuKeyboardScope.web.tsx', 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  new Function('exports', 'require', 'document', 'requestAnimationFrame', 'cancelAnimationFrame', code)(exports, name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name === 'react-native') return { View: 'View' }
    if (name === 'react') return { useRef: current => ({ current }), useEffect: fn => effects.push(fn) }
    throw Error(name)
  }, document, fn => { fn(); return 1 }, () => {})
  const ui = exports.MenuKeyboardScope({ children: null, subMenu: null, onClose: () => closes.push(true), onCloseSub() {} })
  ui.props.ref.current = { querySelectorAll: () => [menu] }
  effects.forEach(fn => fn())
  assert.equal(document.activeElement, items[0])
  const key = value => ui.props.onKeyDown({ key: value, preventDefault() {}, stopPropagation() {} })
  key('ArrowDown'); assert.equal(document.activeElement, items[1])
  key('End'); assert.equal(document.activeElement, items[2])
  key('Home'); assert.equal(document.activeElement, items[0])
  key('c'); assert.equal(document.activeElement, items[1])
  key('Enter'); assert.deepEqual(actions, [1])
  key('Escape'); assert.equal(closes.length, 1)
})
