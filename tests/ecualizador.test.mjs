import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }

function cargarEstado(saved = null) {
  const writes = []
  const cache = new Map()
  const storage = {
    getItem: async key => key === 'ecualizador:v1' ? saved : null,
    setItem: async (key, value) => { writes.push([key, JSON.parse(value)]) },
  }
  function load(path) {
    if (cache.has(path)) return cache.get(path)
    const exports = {}
    cache.set(path, exports)
    const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions }).outputText
    new Function('exports', 'require', source)(exports, id => {
      if (id === '@react-native-async-storage/async-storage') return storage
      if (id === 'react') return { useSyncExternalStore: (_subscribe, snapshot) => snapshot() }
      if (id === './store') return load('src/state/store.ts')
      throw Error(`Dependencia no simulada: ${id}`)
    })
    return exports
  }
  return { eq: load('src/state/ecualizador.ts'), writes }
}

const drenar = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

test('ecualizador carga, limita y persiste una curva de diez bandas', async () => {
  const saved = JSON.stringify({ activo: true, preset: 'Personalizado', ganancias: [-99, -8, -4, 0, 2, 4, 8, 99, null, 'x'] })
  const { eq, writes } = cargarEstado(saved)
  await eq.cargarEcualizador()
  assert.deepEqual(eq.leerEcualizador(), {
    cargado: true,
    activo: true,
    preset: 'Personalizado',
    ganancias: [-12, -8, -4, 0, 2, 4, 8, 12, 0, 0],
  })

  eq.elegirPresetEcualizador('Rock')
  eq.setGananciaEcualizador(0, 40)
  eq.setEcualizadorActivo(false)
  await drenar()
  const estado = eq.leerEcualizador()
  assert.equal(estado.preset, 'Personalizado')
  assert.equal(estado.ganancias[0], 12)
  assert.equal(estado.activo, false)
  assert.equal(writes.length, 3)
  assert.deepEqual(writes.at(-1), ['ecualizador:v1', { activo: false, preset: 'Personalizado', ganancias: estado.ganancias }])
})

test('los tres motores exponen el procesamiento nativo y el motor web usa diez biquads', () => {
  const kotlin = readFileSync('node_modules/expo-audio/android/src/main/java/expo/modules/audio/AudioPlayer.kt', 'utf8')
  const swift = readFileSync('node_modules/expo-audio/ios/AudioPlayer.swift', 'utf8')
  const tap = readFileSync('node_modules/expo-audio/ios/AudioTapProcessor.m', 'utf8')
  const web = readFileSync('node_modules/expo-audio/src/AudioPlayer.web.ts', 'utf8')
  assert.match(kotlin, /android\.media\.audiofx\.Equalizer/)
  assert.match(kotlin, /setEqualizer\(enabled: Boolean, gains: List<Double>\)/)
  assert.match(swift, /func setEqualizer\(enabled: Bool, gains: \[Double\]\)/)
  assert.match(tap, /MTAudioProcessingTapGetSourceAudio/)
  assert.match(tap, /DNEQMakePeaking/)
  assert.match(web, /createBiquadFilter/)
  assert.match(web, /EQUALIZER_FREQUENCIES/)
  assert.match(web, /this\.setEqualizer\(true, this\.equalizerGains\)/)
})

test('los GIF de avatar y vitrina usan expo-image con reproducción habilitada', () => {
  for (const path of ['src/ui/Avatar.tsx', 'src/ui/Vitrina.tsx']) {
    const source = readFileSync(path, 'utf8')
    assert.match(source, /from 'expo-image'/)
    assert.match(source, /autoplay/)
    assert.match(source, /recyclingKey=/)
    assert.match(source, /cachePolicy="memory-disk"/)
  }
})
