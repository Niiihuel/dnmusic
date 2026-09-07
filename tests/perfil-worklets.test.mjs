import test from 'node:test'
import assert from 'node:assert/strict'
import babel from '@babel/core'
import traverseModule from '@babel/traverse'

const traverse = traverseModule.default

test('el compilador nativo del mosaico no transfiere refs ni vistas al runtime de UI', () => {
  const { ast } = babel.transformFileSync('src/ui/PerfilPublico.tsx', {
    ast: true,
    code: false,
    caller: { name: 'metro', platform: 'ios', supportsStaticESM: true, isDev: false },
  })
  let comprobados = 0
  traverse(ast, {
    AssignmentExpression(path) {
      const { left, right } = path.node
      if (left.type !== 'MemberExpression' || left.property.name !== '__closure') return
      const capturas = right.properties?.map((prop) => prop.key.name) ?? []
      assert.ok(!capturas.includes('agarre'), 'el objeto contiene el Map de vistas nativas')
      assert.ok(!capturas.includes('children'), 'no transferir el árbol de React')
      if (capturas.includes('indice') && capturas.includes('withTiming') && capturas.includes('dx')) {
        assert.deepEqual(capturas.sort(), ['activa', 'dx', 'dy', 'estirando', 'indice', 'origen', 'rects', 'withTiming'])
        comprobados++
      }
    },
  })
  assert.equal(comprobados, 1, 'se inspeccionó la animación compilada, no el código web')
})
