import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }

function cargarEstado(saved = null, read) {
  const writes = []
  const cache = new Map()
  const storage = {
    getItem: read ?? (async key => key === 'ecualizador:v1' ? saved : null),
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
  assert.equal(writes.length, 2)
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
  assert.match(tap, /DNEQSetTarget/)
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

test('mover una banda muchas veces guarda sólo el último valor y evita índices inválidos', async () => {
  const { eq, writes } = cargarEstado()
  await eq.cargarEcualizador()
  for (let value = -12; value <= 12; value += 0.5) eq.setGananciaEcualizador(0, value)
  eq.setGananciaEcualizador(0.5, 3)
  eq.setGananciaEcualizador(NaN, 3)
  eq.setGananciaEcualizador(10, 3)
  eq.setGananciaEcualizador(0, NaN)
  await drenar()
  assert.equal(writes.length, 0)
  await eq.guardarEcualizadorAhora()
  assert.equal(writes.length, 1)
  assert.equal(writes[0][1].ganancias[0], 12)
  assert.equal(eq.leerEcualizador().ganancias.length, 10)
})

test('la carga tardía nunca pisa una edición y el preset corresponde a la curva real', async () => {
  let resolve
  const { eq } = cargarEstado(null, () => new Promise(r => { resolve = r }))
  const load = eq.cargarEcualizador()
  eq.elegirPresetEcualizador('Rock')
  resolve(JSON.stringify({ activo: true, preset: 'Graves', ganancias: Array(10).fill(0) }))
  await load
  assert.equal(eq.leerEcualizador().preset, 'Rock')
  const stale = cargarEstado(JSON.stringify({ activo: false, preset: 'Rock', ganancias: Array(10).fill(0) })).eq
  await stale.cargarEcualizador()
  assert.equal(stale.leerEcualizador().preset, 'Plano')
  stale.setGananciaEcualizador(0, 3.24)
  assert.equal(stale.leerEcualizador().ganancias[0], 3)
  stale.setGananciaEcualizador(0, 0)
  assert.equal(stale.leerEcualizador().preset, 'Plano')
  await stale.guardarEcualizadorAhora()
})

test('iOS aloja la curva con RNHostView, usa dB accesibles y navegación sin safe area duplicada', () => {
  const screen = readFileSync('src/ui/Ecualizador.ios.tsx', 'utf8')
  assert.match(screen, /<NavigationStack>/)
  assert.match(screen, /<RNHostView matchContents><CurvaEcualizador/)
  assert.match(screen, /<Slider[\s\S]*min=\{-12\} max=\{12\}/)
  assert.match(screen, /accessibilityValue\(decibeliosEQ\(ganancia\)\)/)
  assert.match(screen, /useEscuchaEspejoNombre/)
  assert.match(screen, /disabled\(edicionBloqueada\)/)
  assert.match(screen, /<BordeScrollNativo nativeNavigation/)
  assert.doesNotMatch(screen, /SafeAreaView|SeekBar|FilaOpciones/)
  const state = readFileSync('src/state/ecualizador.ts', 'utf8')
  assert.match(state, /setTimeout/)
})

test('la geometría mantiene extremos y centros dentro del gráfico y limita los gestos', () => {
  const source = ts.transpileModule(readFileSync('src/ui/ecualizadorGeometry.ts', 'utf8'), { compilerOptions }).outputText
  const g = {}
  new Function('exports', source)(g)
  for (const width of [240, 280, 350, 430]) for (let index = 0; index < 10; index++) {
    for (const gain of [-12, -6, 0, 6, 12]) {
      const p = g.puntoEQ(index, gain, width, 10)
      assert.ok(p.x >= 20 && p.x <= width - 20)
      assert.ok(p.y >= 20 && p.y <= g.EQ_GRAPH_HEIGHT - 20)
      assert.equal(g.bandaEQ(p.x, width, 10), index)
      assert.equal(g.gananciaEQ(p.y), gain)
    }
  }
  assert.equal(g.gananciaEQ(-999), 12)
  assert.equal(g.gananciaEQ(999), -12)
  assert.equal(g.bandaEQ(-999, 280, 10), 0)
  assert.equal(g.bandaEQ(999, 280, 10), 9)
  assert.match(g.decibeliosEQ(3.5), /\+3,5 dB/)
})

test('el callback iOS no bloquea el render y respeta formato y número real de muestras', () => {
  const tap = readFileSync('node_modules/expo-audio/ios/AudioTapProcessor.m', 'utf8')
  const process = tap.slice(tap.indexOf('- (void)processEqualizer:'), tap.indexOf('- (BOOL)isTapInstalled'))
  assert.match(process, /os_unfair_lock_trylock/)
  assert.doesNotMatch(process, /os_unfair_lock_lock|memset|calloc|malloc/)
  assert.match(tap, /mBitsPerChannel == 32/)
  assert.match(tap, /\(long\)\*numberFramesOut/)
  assert.match(tap, /AVMediaTypeAudio/)
  const swift = readFileSync('node_modules/expo-audio/ios/AudioPlayer.swift', 'utf8')
  assert.match(swift, /Int\(frameCount\) \* channelCount/)
  assert.match(swift, /to: sampleCount/)
})
