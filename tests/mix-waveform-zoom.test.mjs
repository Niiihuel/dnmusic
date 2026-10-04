import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cueFromFocusDrag,
  cueFromOverviewX,
  detailAmplitudeScale,
  mixWaveformDetailRange,
  mixWaveformZoom,
  sampleMixWaveform,
  stepMixCue,
} from '../src/lib/mixWaveformZoom.ts'

test('un cruce corto conserva más de 70 % del ancho sin SVG de toda la canción', () => {
  const geometry = mixWaveformZoom(320, 180_000, 4_000, 176_000)
  assert.ok(geometry)
  assert.ok(geometry.windowWidth / 320 >= 0.7)
  assert.ok(geometry.renderWidth < 320 * 2.3)
  assert.equal(geometry.maxStartMs, 176_000)
  assert.equal(cueFromOverviewX(geometry.overviewLeft, geometry, 320), 176_000)
  assert.equal(cueFromFocusDrag(176_000, 320, geometry), 170_737)
  const range = mixWaveformDetailRange(180_000, 4_000, 176_000)
  assert.ok(range)
  assert.ok(range.startMs <= Math.max(0, geometry.renderStartMs))
  assert.ok(range.startMs + range.durationMs >=
    Math.min(180_000, geometry.renderStartMs + geometry.renderWidth / geometry.pxPerMs))
})

test('los extremos y canciones cortas mantienen cues dentro del audio', () => {
  const geometry = mixWaveformZoom(300, 1_000, 250, 0)
  assert.ok(geometry)
  assert.equal(cueFromFocusDrag(0, 10_000, geometry), 0)
  assert.equal(cueFromFocusDrag(0, -10_000, geometry), 750)
  assert.equal(cueFromOverviewX(-10_000, geometry, 300), 0)
  assert.equal(cueFromOverviewX(10_000, geometry, 300), 750)
  assert.equal(mixWaveformZoom(300, 0, 250, 0), null)
})

test('el muestreo local queda acotado y respeta silencio fuera del tema', () => {
  const geometry = mixWaveformZoom(320, 180_000, 250, 0)
  assert.ok(geometry)
  const bars = sampleMixWaveform(Array(256).fill(0.5), 180_000,
    geometry.renderStartMs, geometry.pxPerMs, geometry.renderWidth, 100_000)
  assert.equal(bars.length, 900)
  assert.equal(bars[0], 0)
  assert.ok(bars.some(value => value === 0.5))
})

test('el detalle PCM conserva la escala global cuando cubre toda la vista válida', () => {
  const geometry = mixWaveformZoom(320, 180_000, 4_000, 60_000)
  const range = mixWaveformDetailRange(180_000, 4_000, 60_000)
  assert.ok(geometry && range)
  const global = Array(256).fill(0.2)
  const measured = sampleMixWaveform(global, 180_000, geometry.renderStartMs,
    geometry.pxPerMs, geometry.renderWidth, 180,
    { peaks: Array(600).fill(0.8), startMs: range.startMs, durationMs: range.durationMs })
  assert.ok(measured.every(v => Math.abs(v - 0.2) < 0.001))
  const stale = sampleMixWaveform(global, 180_000, geometry.renderStartMs,
    geometry.pxPerMs, geometry.renderWidth, 180,
    { peaks: Array(600).fill(0.8), startMs: 0, durationMs: 1_000 })
  assert.ok(stale.every(v => Math.abs(v - 0.2) < 0.001))
})

test('tramo propio de 30 s cubre el cruce y combina PCM local con contexto global', () => {
  const songMs = 180_000, cueMs = 60_000, crossMs = 30_000
  const range = mixWaveformDetailRange(songMs, crossMs, cueMs, 30_000)
  const geometry = mixWaveformZoom(320, songMs, crossMs, cueMs)
  assert.ok(range && geometry)
  assert.equal(range.durationMs, 30_000)
  assert.ok(range.startMs <= cueMs)
  assert.ok(range.startMs + range.durationMs >= cueMs + crossMs)
  for (const edgeCue of [0, songMs - crossMs]) {
    const edgeRange = mixWaveformDetailRange(songMs, crossMs, edgeCue, 30_000)
    assert.ok(edgeRange)
    assert.equal(edgeRange.durationMs, 30_000)
    assert.ok(edgeRange.startMs <= edgeCue)
    assert.ok(edgeRange.startMs + edgeRange.durationMs >= edgeCue + crossMs)
  }
  const bars = sampleMixWaveform(Array(256).fill(0.2), songMs,
    geometry.renderStartMs, geometry.pxPerMs, geometry.renderWidth, 320,
    { peaks: Array(600).fill(0.8), ...range })
  const at = index => geometry.renderStartMs + ((index + 0.5) / bars.length * geometry.renderWidth) / geometry.pxPerMs
  const local = bars.filter((_, index) => at(index) > cueMs + 1_000 && at(index) < cueMs + crossMs - 1_000)
  const outside = bars.filter((_, index) => at(index) > 0 && at(index) < cueMs - 1_000)
  assert.ok(local.length > 30 && local.every(value => Math.abs(value - 0.2) < 0.001))
  assert.ok(outside.length > 30 && outside.every(value => Math.abs(value - 0.2) < 0.001))
})

test('la escala del PCM detallado usa energía de buckets completos y se comparte con las bandas', () => {
  const global = Array(100).fill(0.7)
  const local = Array.from({ length: 20 }, (_, index) => index % 2 ? 0.4 : 0.8)
  const rebucketRms = Math.sqrt((0.8 ** 2 + 0.4 ** 2) / 2)
  for (let index = 40; index < 50; index++) global[index] = rebucketRms * 0.25
  const detail = { peaks: local, startMs: 40_000, durationMs: 10_000 }
  const scale = detailAmplitudeScale(global, 100_000, detail)
  assert.ok(scale !== null && Math.abs(scale - 0.25) < 1e-9)
  const sampled = sampleMixWaveform(global, 100_000, 40_000, 1, 10_000, 20, detail, scale)
  assert.ok(sampled.some(value => Math.abs(value - 0.2) < 1e-9))
  assert.ok(sampled.some(value => Math.abs(value - 0.1) < 1e-9))
  const globalLow = Array(100).fill(0.01)
  const localLow = { ...detail, peaks: Array(20).fill(0.6) }
  const band = sampleMixWaveform(globalLow, 100_000, 40_000, 1, 10_000, 20, localLow, scale)
  assert.ok(band.every(value => Math.abs(value - 0.15) < 1e-9))
})

test('sin suficientes buckets globales no se inventa el volumen del detalle', () => {
  const global = Array(100).fill(0.08)
  const detail = { peaks: Array(60).fill(1), startMs: 40_100, durationMs: 200 }
  assert.equal(detailAmplitudeScale(global, 100_000, detail), null)
  const expected = sampleMixWaveform(global, 100_000, 40_000, 1, 400, 40)
  const actual = sampleMixWaveform(global, 100_000, 40_000, 1, 400, 40, detail)
  assert.deepEqual(actual, expected)
  const silence = { ...detail, peaks: Array(60).fill(0) }
  assert.equal(detailAmplitudeScale(global, 100_000, silence), 1)
})

test('ajuste fino y arrastre respetan límites sin cambiar un cue igual', () => {
  assert.equal(stepMixCue(1_000, -100, 10_000), 900)
  assert.equal(stepMixCue(0, -100, 10_000), 0)
  assert.equal(stepMixCue(9_950, 100, 10_000), 10_000)
  assert.equal(stepMixCue(1_000, 0, 10_000), 1_000)
  assert.equal(mixWaveformDetailRange(180_000, 0, 0), null)
})
