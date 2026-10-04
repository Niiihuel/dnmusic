import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ios = readFileSync('src/ui/ListaAgrupada.ios.tsx', 'utf8')
const web = readFileSync('src/ui/ListaAgrupada.tsx', 'utf8')
const tipos = readFileSync('src/ui/ListaAgrupada.types.ts', 'utf8')

test('en iOS la lista la dibuja el sistema, no nosotros', () => {
  /* La pieza entera existe para eso. Si algún día alguien la reemplaza por
     Views de React Native «para arreglar un detalle», esto lo dice. */
  assert.match(ios, /from '@expo\/ui\/swift-ui'/)
  assert.match(ios, /listStyle\('insetGrouped'\)/)
  for (const pieza of ['List', 'Section', 'Toggle', 'Button', 'LabeledContent']) {
    assert.match(ios, new RegExp(`\\b${pieza}\\b`), pieza)
  }
})

test('la superficie oscura conserva switches verdes distinguibles', () => {
  assert.match(ios, /scrollContentBackground\('hidden'\)/)
  assert.match(ios, /listRowBackground\(FILA\)/)
  assert.match(ios, /seedColor=\{ACENTO\}/)
  assert.match(ios, /const FILA = '#181818'/)
  assert.match(ios, /const ACENTO = '#FFFFFF'/)
  assert.match(ios, /toggleStyle\('switch'\)/)
  assert.match(ios, /tint\('#34C759'\)/)
})

test('las filas se describen como datos, que es lo que la vuelve nativa', () => {
  /*
   * Un `Section` de SwiftUI solo acepta vistas de SwiftUI. Si las filas
   * llegaran como hijos de React habría que hospedarlas en un `RNHostView` y
   * devolverle el alto a SwiftUI — el circuito de medición que este proyecto ya
   * sacó una vez (README de modules/collection-controls). Describiéndolas, cada
   * plataforma dibuja las suyas.
   */
  assert.match(tipos, /tipo: 'interruptor'/)
  assert.match(tipos, /tipo: 'accion'/)
  assert.match(tipos, /tipo: 'menu'/)
  assert.match(tipos, /tipo: 'dato'/)
  assert.match(tipos, /tipo: 'interruptor'[\s\S]*?disabled\?: boolean/)
  assert.doesNotMatch(tipos, /children/, 'las filas no pueden ser hijos: rompe el camino nativo')
})

test('web y iOS cubren los mismos cuatro tipos de fila', () => {
  /* Un tipo atendido de un solo lado es una fila que desaparece en la otra
     plataforma sin que falle nada. */
  for (const tipo of ['interruptor', 'menu', 'accion']) {
    assert.match(ios, new RegExp(`fila\\.tipo === '${tipo}'`), `iOS: ${tipo}`)
    assert.match(web, new RegExp(`fila\\.tipo === '${tipo}'`), `web: ${tipo}`)
  }
  /* `dato` es el caso que queda al final en los dos, sin `if`. */
  assert.match(ios, /LabeledContent label=\{fila\.rotulo\}/)
  assert.match(web, /<FilaDato/)
})

test('switch y menú respetan disabled en ambos dibujos', () => {
  assert.match(ios, /onIsOnChange=\{fila\.disabled \? undefined : fila\.onCambiar\}/)
  assert.match(ios, /disabled\(!!fila\.disabled\)/)
  assert.match(web, /disabled=\{fila\.disabled\}/)
})
