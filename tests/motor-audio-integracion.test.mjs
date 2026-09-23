import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
const compiled = new Map()
const noop = () => {}
const pista = id => ({ id, videoId: id, audioPath: `${id}.m4a`, title: id, artist: `Artista ${id}`, artistId: null, durationMs: 180000 })
const microtasks = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

// Executes the production MotorAudio and recovery/lease/listening helpers.
// React's hook slots, effect cleanup order, native players and clock are the
// boundary mocks. Network/preload/Jam are independent of these integration cases.
function montar({ local = true, falloFirma = false, rotatingSignature = false } = {}) {
  let now = 0, cursor = 0, dirty = true, timerId = 0, firmadoFalla = falloFirma, descargada = local
  let engine = null, siguienteId = 0, enJam = false, mirrored = false, visible = false
  const slots = [], layouts = [], effects = [], timers = new Map(), players = []
  const calls = { advance: 0, progress: [], listens: [], errors: [], signatures: 0, raf: 0, events: [] }
  let state = { tracks: ['a', 'b', 'c'].map(pista), index: 0, manual: null, upNext: [], shuffle: null,
    repetir: 'no', origin: null, wantPlay: true, seleccionRevision: 0, positionMs: 0, durationMs: 180000, volume: 1, error: null }
  const actual = () => state.manual ?? state.tracks[state.index]
  const setState = patch => {
    if (Object.keys(patch).some(key => !Object.is(state[key], patch[key]))) { state = { ...state, ...patch }; dirty = true }
  }
  const equalDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const effect = (queue, fn, dependencies) => {
    const n = cursor++, old = slots[n]
    if (!old || !equalDeps(old.dependencies, dependencies)) {
      const slot = { dependencies, cleanup: old?.cleanup }
      slots[n] = slot; queue.push({ slot, old, fn })
    }
  }
  const react = {
    useRef(value) { const n = cursor++; return slots[n] ?? (slots[n] = { current: value }) },
    useState(initial) {
      const n = cursor++
      if (!(n in slots)) slots[n] = { value: typeof initial === 'function' ? initial() : initial }
      const slot = slots[n]
      slot.set ??= value => { const next = typeof value === 'function' ? value(slot.value) : value; if (!Object.is(slot.value, next)) { slot.value = next; dirty = true } }
      return [slot.value, slot.set]
    },
    useMemo(fn, dependencies) { const n = cursor++; if (!slots[n] || !equalDeps(slots[n].dependencies, dependencies)) slots[n] = { dependencies, value: fn() }; return slots[n].value },
    useCallback(fn, dependencies) { return react.useMemo(() => fn, dependencies) },
    useEffect(fn, dependencies) { effect(effects, fn, dependencies) },
    useLayoutEffect(fn, dependencies) { effect(layouts, fn, dependencies) },
  }
  const schedule = (fn, delay = 0, interval = false) => {
    const id = ++timerId; timers.set(id, { fn, due: now + delay, interval: interval ? delay : null }); return id
  }
  const cancel = id => timers.delete(id)
  const fakeDate = class extends Date { static now() { return now } }
  function playerFor(source) {
    const listeners = new Set()
    const player = { id: ++siguienteId, source, currentTime: 0, duration: 180, playing: false, volume: 1,
      playCalls: 0, pauseCalls: 0, seeks: [], replacements: [], equalizers: [],
      play() { this.playCalls++; this.playing = true },
      pause() { this.pauseCalls++; this.playing = false },
      seekTo(seconds) { this.seeks.push(seconds); return Promise.resolve() },
      replace(next) { this.replacements.push(next); this.source = next },
      setEqualizer(enabled, gains) { this.equalizers.push({ enabled, gains: [...gains] }) },
      setPlaybackRate: noop,
      addListener(name, fn) { assert.equal(name, 'playbackStatusUpdate'); listeners.add(fn); return { remove: () => listeners.delete(fn) } },
      callbacks() { return [...listeners] },
      emit(patch = {}) {
        const status = { currentTime: this.currentTime, duration: 180, playing: true, isLoaded: true, isBuffering: false,
          timeControlStatus: 'playing', playbackState: 'readyToPlay', error: null, didJustFinish: false, ...patch }
        this.currentTime = status.currentTime; this.playing = status.playing; this.duration = status.duration
        for (const callback of [...listeners]) callback(status)
        return status
      },
    }
    players.push(player); return player
  }
  const moduleCache = new Map()
  const playback = {
    usePlaybackState: () => state, getPlaybackState: () => state,
    advance() { calls.advance++; setState({ index: state.index + 1, positionMs: 0 }) },
    reportProgress(ms, durationMs) { calls.progress.push({ id: actual()?.id, ms }); setState({ positionMs: ms, durationMs }) },
    reportError(message) { calls.errors.push(message); setState({ error: message, wantPlay: false }) },
    reportRecuperada() { setState({ error: null }) },
    pausaExterna() { setState({ wantPlay: false }) }, reanudacionExterna() { setState({ wantPlay: true }) },
    registerEngine(value) { engine = value }, registerRelleno: noop,
    playbackOrigin: () => null, videoIdsRecorridos: () => [], rellenarSiFalta: noop,
    reportCargada: noop, reportarPosicionFina: noop, completarCancion: noop, reanudarTrasInterrupcion: noop,
  }
  const deps = {
    react,
    'react-native': { AppState: { currentState: 'background', addEventListener: () => ({ remove() {} }) }, Platform: { OS: 'ios' } },
    'expo-audio': { setAudioModeAsync: async () => {}, useAudioPlayer: source => react.useMemo(() => playerFor(source), [source?.uri ?? null]) },
    '../state/playback': playback,
    '../state/ecualizador': { useEcualizador: () => ({ cargado: true, activo: false, ganancias: Array(10).fill(0) }), informarSoporteEcualizador() {}, guardarEcualizadorAhora: async () => {} },
    '../state/diagnosticoAudio': { registrarIncidenciaAudio: async evento => { calls.events.push(evento) } },
    '../lib/proximasCola': { proximasCola: ({ tracks, index }, limit) => tracks.slice(index + 1, index + 1 + limit) },
    './usePrecargaCola': { usePrecargaCola: noop }, './useEspectroAudio': { useEspectroAudio: noop },
    '../lib/artwork': { artworkSource: () => null },
    '../services/music': { headroomGain: () => 1, perceptualGain: n => n,
      signedUrl: async path => { calls.signatures++; if (firmadoFalla) throw Error('sin conexión'); return `https://audio/${path}${rotatingSignature ? `?v=${calls.signatures}` : ''}` },
      resolveSong: async () => { throw Error('unexpected resolveSong') } },
    '../state/lockScreen': { useLockScreen: noop },
    '../services/plays': { anotarEscucha: async value => { calls.listens.push(value) } },
    '../services/recomendaciones': { proximasRecomendadas: async () => [] },
    '../state/descargas': { HAY_DESCARGAS: true, marcarAudioUsado: noop, rutaLocal: path => descargada ? `file://${path}` : null,
      useDescargasCargadas: () => true, useDescargasError: () => null },
    '../state/jam': { jamEsperaArranqueMs: () => 0, jamPosicionObjetivoMs: () => null, jamSuena: () => false,
      rellenarJamSiFalta: noop, useJamActivo: () => enJam, useJamRevision: () => 0, useJamSilencioso: () => false, useJamSincronizo: () => false },
    '../state/escucha': { useEscuchaEspejo: () => mirrored, esEscuchaEspejo: () => mirrored, reportarActividadEscucha() {} },
    '../lib/appActiva': { useAppActiva: () => visible },
    '../state/aviso': { avisar: noop }, '../lib/mensajeError': { mensajeError: error => error.message },
  }
  const actualHelpers = { '../lib/recuperacionAudio': 'src/lib/recuperacionAudio.ts', '../lib/escuchaEfectiva': 'src/lib/escuchaEfectiva.ts',
    '../lib/useAudioLease': 'src/lib/useAudioLease.ts', '../lib/seek': 'src/lib/seek.ts' }
  function load(path) {
    if (moduleCache.has(path)) return moduleCache.get(path)
    let source = compiled.get(path)
    if (!source) { source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions }).outputText; compiled.set(path, source) }
    const exports = {}; moduleCache.set(path, exports)
    const require = name => {
      if (name in deps) return deps[name]
      if (name in actualHelpers) return load(actualHelpers[name])
      throw Error(`Missing mock ${name} in ${path}`)
    }
    new Function('exports', 'require', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date', source)(
      exports, require, (fn, delay) => schedule(fn, delay), cancel, (fn, delay) => schedule(fn, delay, true), cancel,
      () => { calls.raf++; if (!visible) throw Error('RAF must stay stopped in background'); return calls.raf }, noop, { now: () => now }, fakeDate)
    return exports
  }
  const { MotorAudio } = load('src/ui/MotorAudio.tsx')
  const commit = queue => {
    const entries = queue.splice(0)
    for (const { old } of entries) old?.cleanup?.()
    for (const { slot, fn } of entries) slot.cleanup = fn()
  }
  function render() { dirty = false; cursor = 0; assert.equal(MotorAudio(), null); commit(layouts); commit(effects) }
  async function settle() {
    for (let i = 0; i < 30; i++) { await microtasks(); if (!dirty) return; render() }
    throw Error('MotorAudio did not settle')
  }
  return {
    calls, players, render, settle,
    get state() { return state }, get player() { return players.at(-1) },
    mirror(value) { mirrored = value; dirty = true },
    foreground(value) { visible = value; deps['react-native'].AppState.currentState = value ? 'active' : 'background'; dirty = true },
    signingFails(value) { firmadoFalla = value },
    download(value) { descargada = value },
    select(index) { setState({ index, manual: null, positionMs: 0 }) },
    reselect() { setState({ seleccionRevision: state.seleccionRevision + 1, positionMs: 0 }) },
    wantPlay(value) { setState({ wantPlay: value }) },
    configure(patch) { setState(patch) },
    jam(value) { enJam = value; dirty = true },
    seek(ms) { assert.ok(engine); engine.seekTo(ms) },
    async status(seconds, patch = {}) { now += 1000; this.player.emit({ currentTime: seconds, ...patch }); await settle() },
    async advanceClock(ms) {
      const target = now + ms
      for (let i = 0; i < 100; i++) {
        await settle()
        const next = [...timers].filter(([, value]) => value.due <= target).sort((a, b) => a[1].due - b[1].due)[0]
        if (!next) { now = target; await settle(); return }
        const [id, task] = next; now = task.due; timers.delete(id)
        if (task.interval !== null) timers.set(id, { ...task, due: now + task.interval })
        task.fn()
      }
      throw Error('Too many timers')
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); timers.clear() },
  }
}

test('un callback saliente antes del commit no avanza otra pista ni pisa progreso', async () => {
  const h = montar(); h.render(); await h.settle()
  const anterior = h.player, callbackViejo = anterior.callbacks()[0]
  await h.status(42)
  h.select(1) // Store already moved, React has not committed/inactivated the old lease yet.
  const avances = h.calls.advance, progreso = h.calls.progress.length
  callbackViejo({ currentTime: 180, duration: 180, playing: false, isLoaded: true, isBuffering: false, timeControlStatus: 'paused', didJustFinish: true })
  assert.equal(h.state.index, 1); assert.equal(h.calls.advance, avances)
  assert.equal(h.calls.progress.length, progreso); assert.equal(h.state.positionMs, 0)
  await h.settle(); assert.notEqual(h.player, anterior)
  callbackViejo({ currentTime: 180, duration: 180, playing: false, isLoaded: true, didJustFinish: true })
  assert.equal(h.state.index, 1, 'the released player cannot advance after the commit either')
  await h.status(180, { playing: false, timeControlStatus: 'paused', didJustFinish: true })
  assert.equal(h.state.index, 2); assert.equal(h.calls.advance, avances + 1)
  h.unmount()
})

test('agotar las firmas pausa y un play explícito vuelve a firmar y reproducir', async () => {
  const h = montar({ local: false, falloFirma: true }); h.render(); await h.settle()
  await h.advanceClock(3000)
  assert.equal(h.calls.signatures, 3); assert.equal(h.state.wantPlay, false)
  assert.equal(h.calls.errors.length, 1); assert.equal(h.player.playCalls, 0)
  h.signingFails(false); h.wantPlay(true); await h.settle()
  assert.equal(h.calls.signatures, 4)
  assert.equal(h.player.source.uri, 'https://audio/a.m4a'); assert.equal(h.player.playCalls, 1)
  await h.status(1); assert.equal(h.state.error, null)
  h.unmount()
})

test('los eventos nativos cuentan escucha con pantalla apagada sin ejecutar RAF', async () => {
  const h = montar(); h.render(); await h.settle()
  for (let seconds = 0; seconds <= 6; seconds++) await h.status(seconds)
  assert.equal(h.state.positionMs, 6000); assert.equal(h.calls.raf, 0)
  h.select(1); await h.settle()
  assert.equal(h.calls.listens.length, 1)
  assert.equal(h.calls.listens[0].videoId, 'a'); assert.equal(h.calls.listens[0].ms, 6000)
  h.unmount()
})

test('un seek en background se libera al aterrizar por evento y retoma progreso e historial', async () => {
  const h = montar(); h.render(); await h.settle()
  await h.status(0); await h.status(1)
  h.seek(60000); assert.deepEqual(h.player.seeks, [60])
  const count = h.calls.progress.length
  await h.status(1) // The old native position arrives while seek is still in flight.
  assert.equal(h.calls.progress.length, count)
  await h.status(60); assert.equal(h.state.positionMs, 60000)
  await h.status(61); assert.equal(h.state.positionMs, 61000)
  h.select(1); await h.settle()
  assert.equal(h.calls.listens[0].ms, 2000, 'only actual listening before/after seek is counted')
  assert.equal(h.calls.raf, 0)
  h.unmount()
})


test('el loop nativo sigue repetir y se desactiva para Jam o una cola con siguiente pista', async () => {
  const h = montar(); h.render(); await h.settle()
  assert.equal(h.player.loop, false)
  h.configure({ repetir: 'una' }); await h.settle()
  assert.equal(h.player.loop, true)
  h.jam(true); await h.settle()
  assert.equal(h.player.loop, false, 'Jam conserva su transición coordinada')
  h.jam(false); h.configure({ repetir: 'lista', tracks: [pista('a')] }); await h.settle()
  assert.equal(h.player.loop, true, 'repetir la única pista no depende del callback JS')
  h.configure({ upNext: [pista('b')] }); await h.settle()
  assert.equal(h.player.loop, false, 'la canción encolada debe poder avanzar')
  h.configure({ upNext: [], manual: pista('x') }); await h.settle()
  assert.equal(h.player.loop, false)
  h.configure({ manual: null, tracks: [pista('a'), pista('b')] }); await h.settle()
  assert.equal(h.player.loop, false, 'repetir lista con varias canciones conserva sus transiciones')
  h.unmount()
})

test('una pausa nativa cancela el reintento aunque el último estado conserve un error', async () => {
  const h = montar(); h.render(); await h.settle()
  await h.status(42)
  await h.status(0, { playing: false, timeControlStatus: 'paused', error: 'stream fallido', playbackState: 'failed' })
  await h.status(0, { playing: false, timeControlStatus: 'paused', error: 'stream fallido', playbackState: 'failed', didJustPause: true })
  assert.equal(h.state.wantPlay, false)
  const plays = h.player.playCalls
  await h.advanceClock(5000)
  assert.equal(h.calls.signatures, 0, 'no firma después de pausar')
  assert.equal(h.player.playCalls, plays, 'no reanuda después de pausar')
  h.unmount()
})

test('el segundo intento conserva la posición si el player nuevo falla antes de cargar', async () => {
  const h = montar({ local: false, rotatingSignature: true }); h.render(); await h.settle()
  await h.status(42)
  const primero = h.player
  await h.status(0, { playing: false, isLoaded: false, error: 'primera fuente fallida', playbackState: 'failed', timeControlStatus: 'paused' })
  await h.advanceClock(1000)
  assert.notEqual(h.player, primero)
  await h.status(0, { playing: false, isLoaded: false, error: 'segunda fuente fallida', playbackState: 'failed', timeControlStatus: 'paused' })
  await h.advanceClock(3000)
  await h.status(0)
  assert.equal(h.player.seeks.at(-1), 42, 'la última posición confirmada sobrevive a ambos players')
  assert.equal(h.calls.advance, 0)
  h.unmount()
})

test('una descarga gana a la URL remota recordada y la recuperación bloqueada no pide red', async () => {
  const h = montar({ local: false }); h.render(); await h.settle()
  assert.equal(h.player.source.uri, 'https://audio/a.m4a')
  assert.equal(h.calls.signatures, 1)
  const remoto = h.player
  h.download(true)
  h.configure({ volume: 0.8 }); await h.settle()
  assert.equal(h.player, remoto, 'terminar una descarga no corta la pista que está sonando')
  h.reselect(); await h.settle()
  assert.equal(h.player.source.uri, 'file://a.m4a', 'la URL remota anterior no tapa la descarga')
  await h.status(42)
  await h.status(0, { playing: false, isLoaded: false, error: 'Sin conexión de red', playbackState: 'failed' })
  await h.advanceClock(1000)
  assert.equal(h.calls.signatures, 1, 'la renovación del archivo local no firma en Storage')
  assert.deepEqual(h.player.replacements, [{ uri: 'file://a.m4a' }])
  await h.status(0)
  assert.equal(h.player.seeks.at(-1), 42)
  assert.equal(h.state.wantPlay, true)
  h.unmount()
})

test('si una descarga termina durante streaming, un fallo detrás pasa al archivo sin firmar', async () => {
  const h = montar({ local: false }); h.render(); await h.settle()
  await h.status(42)
  h.download(true)
  await h.status(0, { playing: false, isLoaded: false, error: 'Sin conexión de red', playbackState: 'failed' })
  await h.advanceClock(1000)
  assert.equal(h.player.source.uri, 'file://a.m4a')
  assert.equal(h.calls.signatures, 1)
  await h.status(0)
  assert.equal(h.player.seeks.at(-1), 42)
  assert.equal(h.state.wantPlay, true)
  h.unmount()
})

test('si desaparece el archivo elegido, la recuperación conmuta a remoto', async () => {
  const h = montar(); h.render(); await h.settle()
  assert.equal(h.player.source.uri, 'file://a.m4a')
  await h.status(42)
  const anterior = h.player
  h.download(false)
  await h.status(0, { playing: false, isLoaded: false, error: 'No se pudo abrir el archivo', playbackState: 'failed' })
  await h.advanceClock(1000)
  assert.equal(h.calls.signatures, 1)
  assert.notEqual(h.player, anterior)
  assert.equal(h.player.source.uri, 'https://audio/a.m4a')
  await h.status(0)
  assert.equal(h.player.seeks.at(-1), 42)
  assert.equal(h.state.wantPlay, true)
  h.unmount()
})


test('el teléfono espejo conserva 1:32 al volver al frente y descarta el cero del motor local', async () => {
  const h = montar()
  h.mirror(true); h.configure({ positionMs: 92000 }); h.render(); await h.settle()
  h.foreground(true); await h.settle()
  assert.equal(h.state.positionMs, 92000)
  h.player.emit({ currentTime: 0, playing: false, isLoaded: true, timeControlStatus: 'paused' })
  await h.settle()
  assert.equal(h.state.positionMs, 92000)
  h.foreground(false); await h.settle()
  await h.status(0, { playing: false, timeControlStatus: 'paused' })
  assert.equal(h.state.positionMs, 92000)
  assert.equal(h.calls.progress.length, 0)
  assert.equal(h.calls.advance, 0)
  assert.equal(h.calls.raf, 0)
  h.unmount()
})

test('un callback de la misma pista anterior al render tampoco pisa el espejo recién recibido', async () => {
  const h = montar(); h.render(); await h.settle(); await h.status(20)
  const callback = h.player.callbacks()[0]
  h.mirror(true); h.configure({ positionMs: 90000 })
  callback({ currentTime: 21, duration: 180, playing: false, isLoaded: true, isBuffering: false, timeControlStatus: 'paused', didJustFinish: true })
  assert.equal(h.state.positionMs, 90000)
  assert.equal(h.state.wantPlay, true)
  assert.equal(h.calls.advance, 0)
  await h.settle(); h.unmount()
})

test('volver a foreground después de cambiar de tema detrás no recrea, pausa, busca ni recarga el player', async () => {
  const h = montar(); h.render(); await h.settle()
  await h.status(179)
  await h.status(180, { didJustFinish: true, playing: false })
  assert.equal(h.state.index, 1)
  await h.status(42)
  const player = h.player
  const before = { count: h.players.length, pause: player.pauseCalls, play: player.playCalls, seek: player.seeks.length, replace: player.replacements.length }
  for (let i = 0; i < 3; i++) {
    h.foreground(true); await h.settle()
    assert.equal(h.state.index, 1)
    assert.equal(h.state.positionMs, 42000)
    assert.equal(h.player, player)
    assert.equal(h.players.length, before.count)
    assert.equal(player.pauseCalls, before.pause)
    assert.equal(player.playCalls, before.play)
    assert.equal(player.seeks.length, before.seek)
    assert.equal(player.replacements.length, before.replace)
    h.foreground(false); await h.settle()
  }
  h.unmount()
})
