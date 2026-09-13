import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const code = ts.transpileModule(readFileSync('modules/collection-controls/index.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
function load(OS, Version, nativeModule) {
  const exports = {}
  new Function('exports', 'require', code)(exports, id => {
    if (id === 'react-native') return { Platform: { OS, Version } }
    if (id === 'expo') return { requireOptionalNativeModule: () => nativeModule, requireNativeView: (_module, view) => view }
    throw Error(id)
  })
  return exports
}

test('fade nativo disponible también en versiones de iOS con parche', () => {
  for (const version of [26, '26.0', '26.0.1', '26.4.1']) {
    assert.equal(load('ios', version, { scrollEdgeVersion: 1 }).CollectionScrollEdge, 'CollectionScrollEdgeView')
  }
})
test('clientes antiguos, Expo Go y otras plataformas conservan el fallback', () => {
  for (const args of [['ios', '18.7.1', { scrollEdgeVersion: 1 }], ['ios', '26.0.1', {}], ['ios', 26, null], ['web', 26, {}]]) {
    assert.equal(load(...args).CollectionScrollEdge, null)
  }
})
