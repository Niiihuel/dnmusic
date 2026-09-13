import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const paquete = JSON.parse(readFileSync('package.json', 'utf8'))
const modulos = {
  'audio-route': 'AudioRouteModule',
  'backup-exclusion': 'BackupExclusionModule',
  'collection-controls': 'CollectionControlsModule',
  'native-menu': 'NativeMenuModule',
  'media-controls': 'MediaControlsModule',
  'remote-commands': 'RemoteCommandsModule',
}

test('Expo busca explícitamente los módulos Swift locales', () => {
  assert.equal(paquete.expo.autolinking.nativeModulesDir, './modules')
})

test('cada puente local declara Apple y tiene su implementación Swift', () => {
  for (const [directorio, modulo] of Object.entries(modulos)) {
    const base = `modules/${directorio}`
    const config = JSON.parse(readFileSync(`${base}/expo-module.config.json`, 'utf8'))
    assert.deepEqual(config.platforms, ['apple'], directorio)
    assert.ok(config.apple.modules.includes(modulo), `${directorio}: falta ${modulo}`)
    assert.ok(existsSync(`${base}/ios/${modulo}.swift`), `${directorio}: falta la implementación Swift`)
  }
})

test('el switch y el editor de iOS resuelven componentes SwiftUI reales', () => {
  const interruptor = readFileSync('src/ui/Interruptor.ios.tsx', 'utf8')
  const editor = readFileSync('src/ui/CampoMensaje.ios.tsx', 'utf8')
  assert.match(interruptor, /from '@expo\/ui\/swift-ui'/)
  assert.match(interruptor, /<Toggle/)
  assert.match(interruptor, /toggleStyle\('switch'\)/)
  assert.match(interruptor, /deshabilitado\(disabled\)/)
  assert.match(editor, /<TextField/)
  assert.match(editor, /minHeight: expandido \? 112 : 44/)
})
