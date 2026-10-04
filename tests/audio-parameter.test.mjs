import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
function load(path, require = () => { throw Error('Unexpected dependency') }) {
  const exports = {}
  new Function('exports', 'require', ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions }).outputText)(exports, require)
  return exports
}
const values = load('src/ui/audioParameterValue.ts')
function control(initial) {
  const calls = [], refs = [], states = []
  let index = 0
  const hooks = {
    useState: value => {
      const at = index++
      if (!(at in states)) states[at] = value
      return [states[at], next => { states[at] = next }]
    },
    useRef: value => {
      const at = index++
      return refs[at] ?? (refs[at] = { current: value })
    },
  }
  const module = load('src/ui/useAudioParameter.ts', id => id === 'react' ? hooks : values)
  let props = { label: 'Ganancia', min: -12, max: 12, step: 0.5, value: 0,
    onChange: value => calls.push(['change', value]), onCommit: value => calls.push(['commit', value]), ...initial }
  const render = (next = {}) => { props = { ...props, ...next }; index = 0; return module.useAudioParameter(props) }
  return { calls, render }
}

test('Mix previews locally and commits exactly one undoable change when a drag finishes', () => {
  const h = control({ commitOnly: true })
  h.render().change(1)
  h.render().change(2.25)
  assert.equal(h.render().value, 2.5)
  assert.deepEqual(h.calls, [])
  h.render().finish()
  assert.deepEqual(h.calls, [['change', 2.5], ['commit', 2.5]])
  h.render({ value: 2.5 }).finish()
  assert.deepEqual(h.calls, [['change', 2.5], ['commit', 2.5]])
})

test('live EQ changes sound during the drag and flushes persistence at the end', () => {
  const h = control()
  h.render().change(1)
  h.render({ value: 1 }).change(3)
  h.render({ value: 3 }).finish()
  assert.deepEqual(h.calls, [['change', 1], ['change', 3], ['commit', 3]])
})

test('measured cue positions are displayed unchanged; editing alone uses the grid', () => {
  const h = control({ min: 0, max: 30_000, step: 100, value: 1854, commitOnly: true })
  assert.equal(h.render().value, 1854)
  h.render().change(1908)
  h.render().finish()
  assert.deepEqual(h.calls, [['change', 1900], ['commit', 1900]])
})

test('disabled, canceled and nonfinite edits never reach the audio engine', () => {
  const h = control({ commitOnly: true })
  h.render().change(3)
  h.render().cancel()
  h.render().finish()
  h.render().commit(NaN)
  h.render({ disabled: true }).change(8)
  h.render().commit(8)
  assert.deepEqual(h.calls, [])
})

test('becoming read-only during a drag cancels its pending change before editing resumes', () => {
  for (const commitOnly of [true, false]) {
    const h = control({ commitOnly })
    h.render().change(3)
    h.calls.length = 0
    h.render({ disabled: true }).finish()
    assert.deepEqual(h.calls, [])
    h.render({ disabled: false }).finish()
    assert.equal(h.render().value, 0, 'a canceled preview does not remain on the slider')
    assert.deepEqual(h.calls, [], 're-enabling the control does not commit an older gesture')
  }
})

test('real dB, seconds and logarithmic Hz keep endpoints, units and bounded steps', () => {
  const db = { min: -24, max: 6, step: 0.1 }
  assert.equal(values.parameterValue(99, db), 6)
  assert.equal(values.parameterValue(-99, db), -24)
  assert.equal(values.parameterValue(0.28, db), 0.3)
  assert.equal(values.parameterEntry('1,85', 1000), 1850)
  for (const entry of ['', ' ', '-', 'Infinity', 'NaN']) assert.equal(values.parameterEntry(entry), null)
  const hz = { min: 20, max: 20_000, step: 10, scale: 'log' }
  assert.equal(values.parameterFromPosition(0, hz), 20)
  assert.equal(values.parameterFromPosition(1, hz), 20_000)
  assert.equal(values.parameterFromPosition(0.5, hz), 630)
  assert.ok(Math.abs(values.parameterPosition(200, hz) - 1 / 3) < 1e-12)
})
