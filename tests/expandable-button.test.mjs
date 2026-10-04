import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
const require = createRequire(import.meta.url)

function fixture(props) {
  let state, initialized = false
  const exports = {}
  const { outputText } = ts.transpileModule(readFileSync('src/ui/ExpandableButton.web.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  new Function('exports', 'require', outputText)(exports, id => id === 'react' ? {
    useState(initial) {
      if (!initialized) { state = initial; initialized = true }
      return [state, value => { state = value }]
    },
  } : id === '../state/copia' ? { useEstadoCopia: () => props.copyState ?? 'idle' } : id === './ActionSwap' ? { ActionSwap: ({ children }) => children } : id === './icons' ? { IconCheck: () => null } : require(id))
  return () => exports.ExpandableButton({ icon: '+', label: 'Notificaciones', ...props })
}

test('clic expande y Escape contrae; notifica ambos cambios', () => {
  const changes = []
  const render = fixture({ onExpandedChange: value => changes.push(value) })
  assert.equal(render().props['aria-expanded'], false)
  render().props.onClick()
  assert.equal(render().props['aria-expanded'], true)
  let stopped = false
  render().props.onKeyDown({ key: 'Escape', stopPropagation() { stopped = true } })
  assert.equal(render().props['aria-expanded'], false)
  assert.deepEqual(changes, [true, false])
  assert.equal(stopped, true)
})

test('estado controlado respeta al dueño, y una acción ejecuta en el primer clic', () => {
  const changes = []
  const controlled = fixture({ expanded: false, onExpandedChange: value => changes.push(value) })
  controlled().props.onClick()
  assert.equal(controlled().props['aria-expanded'], false)
  assert.deepEqual(changes, [true])
  let clicks = 0
  const action = fixture({ onPress() { clicks++ } })
  action().props.onClick()
  assert.equal(clicks, 1)
  assert.equal(action().props['aria-expanded'], undefined, 'una acción no anuncia un panel inexistente')
  assert.equal(action().props['aria-label'], 'Notificaciones')
  assert.equal(fixture({ disabled: true })().props.disabled, true)
})
