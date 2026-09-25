import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const patchPath = resolve('patches/expo-audio+57.0.3.patch')
const patch = readFileSync(patchPath, 'utf8')
const base = 'node_modules/expo-audio/ios/'
const player = readFileSync(`${base}AudioPlayer.swift`, 'utf8')
const records = readFileSync(`${base}AudioRecords.swift`, 'utf8')
const registry = readFileSync(`${base}AudioComponentRegistry.swift`, 'utf8')
const module = readFileSync(`${base}AudioModule.swift`, 'utf8')
const section = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))

// This verifies the shipped patch, not iOS runtime behavior. Device checks live
// in patches/README.md; AVFoundation/UIKit cannot execute in the Linux suite.
test('el parche se revierte y reaplica completo sin perder cambios del SDK instalado', () => {
  assert.equal(JSON.parse(readFileSync('node_modules/expo-audio/package.json', 'utf8')).version, '57.0.3')
  const dir = mkdtempSync(join(tmpdir(), 'dnmusic-audio-patch-test-'))
  const files = [...patch.matchAll(/^\+\+\+ b\/(.+)$/gm)].map(match => match[1])
  assert.deepEqual([...files].sort(), [
    'node_modules/expo-audio/android/build.gradle',
    'node_modules/expo-audio/android/src/main/java/expo/modules/audio/AudioCrossfade.kt',
    'node_modules/expo-audio/android/src/main/java/expo/modules/audio/AudioModule.kt',
    'node_modules/expo-audio/android/src/main/java/expo/modules/audio/AudioPlayer.kt',
    'node_modules/expo-audio/android/src/main/java/expo/modules/audio/AudioRecords.kt',
    'node_modules/expo-audio/android/src/main/java/expo/modules/audio/TransitionPcmProcessor.kt',
    'node_modules/expo-audio/android/src/test/java/expo/modules/audio/AudioCrossfadeCurveTest.kt',
    'node_modules/expo-audio/android/src/test/java/expo/modules/audio/TransitionDspTest.kt',
    `${base}AudioComponentRegistry.swift`, `${base}AudioCrossfade.swift`, `${base}AudioPlayer.swift`, `${base}AudioModule.swift`, `${base}AudioRecords.swift`,
    `${base}AudioTapProcessor.h`, `${base}AudioTapProcessor.m`, `${base}DNCrossfadeDSP.h`, `${base}DNEqualizerDSP.h`, `${base}DNTransitionDSP.h`, `${base}MediaController.swift`,
    'node_modules/expo-audio/build/Audio.types.d.ts', 'node_modules/expo-audio/build/AudioModule.types.d.ts',
    'node_modules/expo-audio/build/AudioPlayer.web.d.ts', 'node_modules/expo-audio/build/AudioPlayer.web.js',
    'node_modules/expo-audio/src/Audio.types.ts', 'node_modules/expo-audio/src/AudioModule.types.ts', 'node_modules/expo-audio/src/AudioPlayer.web.ts',
  ].sort())
  try {
    for (const file of files) {
      mkdirSync(dirname(join(dir, file)), { recursive: true })
      writeFileSync(join(dir, file), readFileSync(file))
    }
    for (const extra of [['--reverse'], []]) {
      const result = spawnSync('patch', ['--batch', '--fuzz=0', ...extra, '-p1', '-i', patchPath], { cwd: dir, encoding: 'utf8' })
      assert.equal(result.status, 0, result.stdout + result.stderr)
    }
    for (const file of files) assert.equal(readFileSync(join(dir, file), 'utf8'), readFileSync(file, 'utf8'), file)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('el parche de Vercel contiene el runtime web que importa Metro', () => {
  const webPatch = readFileSync('patches-vercel/expo-audio+57.0.3.patch', 'utf8')
  const fullWebSections = patch.split(/(?=^diff --git )/m)
    .filter(section => /^diff --git a\/node_modules\/expo-audio\/build\//.test(section)).join('')
  assert.equal(webPatch, fullWebSections)
  const builtPlayer = readFileSync('node_modules/expo-audio/build/AudioPlayer.web.js', 'utf8')
  assert.match(builtPlayer, /async scheduleCrossfade\(/)
  assert.match(builtPlayer, /setEqualizer\(/)
  assert.match(builtPlayer, /cancelCrossfade\(/)
})

test('el Record de filtro iOS inicializa su enum para el property wrapper de Expo', () => {
  // Expo Field sólo puede sintetizar un init sin valor para tipos opcionales.
  // Sin default, Swift falla al compilar el IPA antes de entrar a la app.
  assert.match(records, /struct CrossfadeTransitionFilterDeck: Record\s*\{\s*@Field var kind: CrossfadeTransitionFilterKind = \.lowpass/)
})

test('los fallos terminales conservan el error y no se confunden con fin normal o buffering', () => {
  const failure = section(player, '  private func addPlaybackFailureNotification()', '  private func addPlaybackEndNotification()')
  assert.match(failure, /AVPlayerItem\.failedToPlayToEndTimeNotification/)
  assert.match(failure, /object: item,[\s\S]*queue: \.main/)
  assert.match(failure, /failedItem === self\.ref\.currentItem/)
  assert.match(failure, /AVPlayerItemFailedToPlayToEndTimeErrorKey/)
  assert.match(failure, /self\.playbackFailure =/)
  assert.doesNotMatch(failure, /didJustFinish|playbackStalledNotification/)
  const status = section(player, '  func currentStatus()', '  func setActiveForLockScreen(')
  assert.match(status, /currentItem\?\.status == \.failed/)
  assert.match(status, /ref\.currentItem != nil && failedItem === ref\.currentItem \? playbackFailure : nil/)
  assert.match(status, /"playbackState": itemFailed \|\| error != nil \? "failed"/)
  assert.match(status, /"error": error/)
  const cleanup = section(player, '  private func teardownPlayer()', '  private func onReady(')
  assert.match(cleanup, /removeObserver\(failureObserver\)/)
  assert.match(cleanup, /playbackFailure = nil/)
})

test('la transición pide tiempo antes del evento JS, y sólo en segundo plano y con sesión persistente', () => {
  const finish = section(player, '  private func addPlaybackEndNotification()', '  private func registerTimeObserver()')
  assert.match(finish, /if self\.keepAudioSessionActive \{\s*self\.owningRegistry\?\.beginPlaybackTransition\(\)/)
  assert.ok(finish.indexOf('beginPlaybackTransition()') < finish.indexOf('"didJustFinish": true'))
  assert.match(registry, /UIApplication\.shared\.applicationState == \.background,[\s\S]*transitionTask == \.invalid/)
  assert.match(registry, /asyncAfter\(deadline: \.now\(\) \+ 20, execute: deadline\)/)
  assert.match(registry, /beginBackgroundTask\(withName:[\s\S]*self\.endPlaybackTransition\(\)/)
  assert.match(registry, /self\.transitionTask == task/)
  assert.match(registry, /self\.transitionGeneration == generation/)
  assert.match(registry, /transitionTask = \.invalid\s*UIApplication\.shared\.endBackgroundTask\(task\)/)
})

test('la ventana sobrevive al player anterior y termina con audio real, pausa, foreground o destrucción', () => {
  assert.match(player, /status == \.playing, self\.isPlaying[\s\S]*self\.owningRegistry\?\.endPlaybackTransition\(\)/)
  assert.match(section(player, '  func pause()', '  func resumePlayback()'), /endPlaybackTransition\(\)/)
  assert.match(module, /Function\("pause"\) \{ player in\s*player\.pause\(\)/)
  assert.match(module, /OnAppEntersForeground \{\s*registry\.endPlaybackTransition\(\)/)
  assert.match(registry, /func removeAll\(\) \{\s*endPlaybackTransition\(\)/)
  assert.doesNotMatch(section(player, '  private func teardownPlayer()', '  private func onReady('), /endPlaybackTransition/)
  assert.match(registry, /transitionDeadline\?\.cancel\(\)/)
})


test('pausa explícita emite marcador también desde lockscreen, sin contaminar fin ni teardown', () => {
  const pause = section(player, '  func pause()', '  func resumePlayback()')
  assert.match(pause, /ref\.pause\(\)[\s\S]*endPlaybackTransition\(\)[\s\S]*updateStatus\(with: \["didJustPause": true\]\)/)
  assert.equal((player.match(/"didJustPause"/g) ?? []).length, 1)
  const remote = readFileSync(`${base}MediaController.swift`, 'utf8')
  const commands = section(remote, '    remoteCommandCenter.pauseCommand', '    remoteCommandCenter.changePlaybackPositionCommand')
  assert.equal((commands.match(/player\.pause\(\)/g) ?? []).length, 2)
  assert.doesNotMatch(commands, /player\.ref\.pause/)
})

test('interrupción cancela recuperación del player persistente sin marcarlo para reanudar', () => {
  const interruption = section(module, '  private func handleInterruptionBegan()', '  private func handleInterruptionEnded(')
  const pending = interruption.slice(interruption.indexOf('} else if let player'))
  assert.match(pending, /playable as\? AudioPlayer, player\.keepAudioSessionActive/)
  assert.match(pending, /player\.wasPlaying = false\s*player\.pause\(\)/)
  assert.doesNotMatch(pending, /interruptedPlayers\.insert|resumePlayback/)
  assert.match(interruption, /if playable\.isPlaying \{\s*interruptedPlayers\.insert/)
})

test('una canción que empieza detrás prepara el tap antes de sonar, y volver al frente sólo habilita muestras', () => {
  const ready = section(player, '        if status == .readyToPlay {', '        if status == .failed {')
  assert.match(ready, /shouldInstallAudioTap \|\| samplingEnabled \|\| keepAudioSessionActive/)
  assert.ok(ready.indexOf('installTap()') < ready.indexOf('self.updateStatus'))
  const play = section(player, '  func play(at rate:', '  func setSamplingEnabled(')
  assert.match(play, /keepAudioSessionActive && !isPlaying/)
  assert.ok(play.indexOf('installTap()') < play.indexOf('ref.playImmediately'))
  const enable = section(player, '  func setSamplingEnabled(', '  func currentStatus()')
  assert.match(enable, /samplingEnabled = enabled/)
  assert.match(enable, /if keepAudioSessionActive && isPlaying \{\s*return\s*\}/)
  assert.ok(enable.indexOf('if keepAudioSessionActive && isPlaying') < enable.indexOf('installTap()'))
  assert.doesNotMatch(enable, /uninstallTap\(|\.pause\(|\.seek\(/)
  const item = section(player, '    ref.publisher(for: \\.currentItem)', '  func replaceWithPreloadedItem(')
  assert.doesNotMatch(item, /uninstallTap\(/)
  assert.match(player, /self\.samplingEnabled else \{\s*return/)
})

test('el handoff nativo y el fin natural compiten por un solo avance', () => {
  const crossfade = readFileSync(`${base}AudioCrossfade.swift`, 'utf8')
  const complete = section(crossfade, '  private func complete()', '  func cancel()')
  const cancel = section(crossfade, '  func cancel()', '  private func closeObservers()')
  const naturalEnd = section(player, '  private func addPlaybackEndNotification()', '  private func registerTimeObserver()')
  assert.ok(complete.indexOf('suppressNaturalEndForCrossfade()') < complete.indexOf('didJustCrossfade'))
  assert.match(complete, /outgoing\.ref\.pause\(\)/)
  assert.doesNotMatch(complete, /didJustFinish/)
  assert.match(naturalEnd, /finishedItem === self\.crossfadedItem \{ return \}/)
  assert.match(naturalEnd, /self\.outgoingCrossfade != nil \{ self\.cancelCrossfade\(\) \}/)
  assert.doesNotMatch(cancel, /outgoing\?\.ref\.pause|didJustPause|didJustFinish/)
  assert.match(cancel, /if shouldStopIncoming \{ incoming\?\.ref\.pause\(\) \}/)
  assert.match(crossfade, /addBoundaryTimeObserver/)
})
