import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import babel from '@babel/core'
import traverseModule from '@babel/traverse'
import generateModule from '@babel/generator'

test('el selector compartido conserva las medidas después de liberar el evento', () => {
  const ast = babel.parseSync(readFileSync('src/ui/SelectorPestanasPerfil.tsx', 'utf8'), {
    configFile: false,
    babelrc: false,
    parserOpts: { plugins: ['typescript', 'jsx'] },
  })
  let codigo
  traverseModule.default(ast, {
    JSXAttribute(path) {
      if (path.node.name.name === 'onLayout') {
        codigo = generateModule.default(path.node.value.expression).code
      }
    },
  })
  assert.ok(codigo, 'se prueba el manejador que usa la pantalla')
  const pendientes = []
  const contexto = { p: { id: 'space' }, setSitios: (update) => pendientes.push(update) }
  const medir = vm.runInNewContext(`(${codigo})`, contexto)
  const evento = { nativeEvent: { layout: { x: 83, width: 96 } } }
  medir(evento)
  evento.nativeEvent = null // Fabric recicla el evento antes del próximo render.
  const sitios = pendientes.shift()({})
  assert.equal(sitios.space.x, 83)
  assert.equal(sitios.space.w, 96)

  // La misma medida no inicia otro render; una nueva sí actualiza la cápsula.
  medir({ nativeEvent: { layout: { x: 83, width: 96 } } })
  assert.equal(pendientes.shift()(sitios), sitios)
  const segundo = { nativeEvent: { layout: { x: 90, width: 105 } } }
  medir(segundo)
  segundo.nativeEvent = null
  const nuevos = pendientes.shift()(sitios)
  assert.equal(nuevos.space.x, 90)
  assert.equal(nuevos.space.w, 105)
})
