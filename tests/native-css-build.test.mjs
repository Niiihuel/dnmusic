import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { cssToReactNativeRuntime } = require('react-native-css-interop/css-to-rn')

// Metro converts the entire stylesheet, including shadows intended for web.
// NativeWind 0.2.6 fell through from box-shadow into the aspect-ratio parser.
test('el bundle nativo convierte sombras sin interpretarlas como aspect-ratio', () => {
  const result = cssToReactNativeRuntime(`
    .card { box-shadow: 0 2px 6px rgb(0 0 0 / 0.12); aspect-ratio: 1 / 1; }
    .wide { aspect-ratio: 16 / 9; }
  `)
  const declarations = JSON.stringify(result.rules)
  assert.ok(result.rules.card)
  assert.match(declarations, /"aspectRatio":1/)
  assert.match(declarations, /"aspectRatio":"16 \/ 9"/)
  assert.match(declarations, /"shadowColor"/)
})

test('las sombras múltiples de escritorio se omiten sin abortar el bundle nativo', () => {
  const result = cssToReactNativeRuntime(`
    @media (min-width: 780px) {
      .glass { box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.4), 0 2px 6px rgb(0 0 0 / 0.12); }
    }
    .content { width: 42px; }
  `)
  assert.match(JSON.stringify(result.rules.content), /"width":42/)
  assert.ok(result.rules.glass.warnings.some(warning => warning.property === 'box-shadow'))
})
