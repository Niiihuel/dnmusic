import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = ts.transpileModule(readFileSync('src/lib/useAudioLease.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

test('el permiso de audio se conserva al renderizar y se invalida antes de liberar cada player', () => {
  let memo, dependencies, cleanup
  const exports = {}
  new Function('exports', 'require', source)(exports, () => ({
    useMemo(factory, next) {
      if (!dependencies || dependencies[0] !== next[0]) {
        memo = factory(); dependencies = next
      }
      return memo
    },
    useLayoutEffect(effect) { cleanup = effect() },
  }))
  const firstPlayer = {}, secondPlayer = {}
  const first = exports.useAudioLease(firstPlayer)
  assert.equal(first.active, true)
  assert.equal(exports.useAudioLease(firstPlayer), first)
  const closeFirst = cleanup
  closeFirst()
  assert.equal(first.active, false)
  const second = exports.useAudioLease(secondPlayer)
  assert.notEqual(first, second)
  assert.equal(second.active, true)
  closeFirst()
  assert.equal(second.active, true, 'Un cierre anterior no invalida el player nuevo')
  cleanup()
  assert.equal(second.active, false)
})
