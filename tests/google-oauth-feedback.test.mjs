import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const transpile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText

function cargar(os, desktop = false) {
  const shared = {}
  new Function('exports', transpile(readFileSync('src/ui/GoogleOAuthFeedback.shared.ts', 'utf8')))(shared)
  const exports = {}
  const jsx = (type, props) => ({ type, props })
  const source = transpile(readFileSync('src/ui/GoogleOAuthFeedback.tsx', 'utf8'))
  new Function('exports', 'require', 'globalThis', source)(exports, id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === 'react-native') return { Platform: { OS: os }, Text: 'Text', View: 'View' }
    if (id === './GoogleOAuthFeedback.shared') return shared
    throw new Error(id)
  }, desktop ? { dnmusicEscritorio: {} } : {})
  return exports
}

const texto = tree => tree.props.children.props.children

test('el estado OAuth explica el retorno automático en iOS y el navegador externo en PC', () => {
  const ios = cargar('ios')
  assert.match(texto(ios.EstadoGoogle({ activo: true, contexto: 'acceso' })), /ventana segura/)
  assert.match(texto(ios.EstadoGoogle({ activo: true, contexto: 'acceso' })), /automáticamente/)
  const pc = cargar('web', true)
  assert.match(texto(pc.EstadoGoogle({ activo: true, contexto: 'vinculacion' })), /navegador/)
  assert.match(texto(pc.EstadoGoogle({ activo: true, contexto: 'vinculacion' })), /misma cuenta/)
  assert.equal(pc.EstadoGoogle({ activo: false, contexto: 'acceso' }), null)
})

test('los errores OAuth muestran acciones útiles sin filtrar mensajes internos', () => {
  const ui = cargar('ios')
  assert.match(ui.mensajeErrorGoogle(new Error('Network request failed'), 'fallback'), /Sin conexión/)
  assert.match(ui.mensajeErrorGoogle({ code: 'identity_already_exists' }, 'fallback'), /otra cuenta/)
  assert.match(ui.mensajeErrorGoogle(new Error('Para usar Google, abrí una compilación de dnmusic instalada en el dispositivo.'), 'fallback'), /compilación/)
  assert.equal(ui.mensajeErrorGoogle(new Error('internal database detail'), 'fallback'), 'fallback')
})

test('iOS dibuja botón y estado con SwiftUI, mientras PC conserva su botón con la marca de Google', () => {
  const buttonIOS = readFileSync('src/ui/GoogleOAuthButton.ios.tsx', 'utf8')
  const feedbackIOS = readFileSync('src/ui/GoogleOAuthFeedback.ios.tsx', 'utf8')
  const buttonPC = readFileSync('src/ui/GoogleOAuthButton.tsx', 'utf8')

  for (const source of [buttonIOS, feedbackIOS]) {
    assert.match(source, /@expo\/ui\/swift-ui/)
    assert.doesNotMatch(source, /from ['"]react-native['"]/)
  }
  assert.match(buttonIOS, /buttonStyle\('borderedProminent'\)/)
  assert.match(buttonIOS, /buttonBorderShape\('capsule'\)/)
  assert.match(feedbackIOS, /ProgressView/)
  assert.match(buttonPC, /GoogleIcon/)
})
