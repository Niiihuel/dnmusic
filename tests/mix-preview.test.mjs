import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMixPreviewWindow, previewDeckPositionMs } from '../src/lib/mixPreview.ts'

const draft = {
  preset: 'custom', durationMs: 8_000, fromCueMs: 92_000, toCueMs: 4_000,
  volumeLaw: 'equal_power',
  volumeOut: [{ t: 0, value: 1 }, { t: 0.5, value: 0.3 }, { t: 1, value: 0 }],
  volumeIn: [{ t: 0, value: 0 }, { t: 0.5, value: 0.8 }, { t: 1, value: 1 }],
}

test('preescucha el borrador real con cinco segundos de entrada y cola', () => {
  const result = buildMixPreviewWindow(draft, 100_000, 50_000)
  assert.equal(result?.outgoingSeekSeconds, 87)
  assert.equal(result?.incomingSeekSeconds, 4)
  assert.equal(result?.incomingStopSeconds, 17)
  assert.deepEqual(result?.transition, {
    durationSeconds: 8, fromStartSeconds: 92, toStartSeconds: 4,
    volumeLaw: 'equal_power', volumeOut: draft.volumeOut, volumeIn: draft.volumeIn,
    eqSettings: undefined, filterSettings: undefined,
  })
})

test('acota cues y duración a ambos archivos para evitar buscar fuera del audio', () => {
  const result = buildMixPreviewWindow({ ...draft, durationMs: 20_000, fromCueMs: 99_000, toCueMs: 99_000 }, 10_000, 12_000)
  assert.equal(result?.transition?.durationSeconds, 10)
  assert.equal(result?.transition?.fromStartSeconds, 0)
  assert.equal(result?.transition?.toStartSeconds, 2)
  assert.equal(result?.incomingStopSeconds, 12)
})

test('sin mezcla escucha el corte natural y arranca la segunda desde cero', () => {
  const result = buildMixPreviewWindow({ ...draft, preset: 'none' }, 100_000, 3_000)
  assert.equal(result?.transition, null)
  assert.equal(result?.outgoingSeekSeconds, 95)
  assert.equal(result?.incomingSeekSeconds, 0)
  assert.equal(result?.incomingStopSeconds, 3)
})

test('con archivos decodificados más cortos, corrige el final natural, cues y timeout', () => {
  // La playlist declara 100 s y 50 s, pero los reproductores cargan 86 s y 7 s.
  const natural = buildMixPreviewWindow({ ...draft, preset: 'none' }, 86_000, 7_000)
  assert.equal(natural?.outgoingSeekSeconds, 81)
  assert.equal(natural?.outgoingEndSeconds, 86)
  assert.equal(natural?.timeoutSeconds, 25)

  const crossfade = buildMixPreviewWindow(draft, 86_000, 7_000)
  assert.equal(crossfade?.transition?.durationSeconds, 7)
  assert.equal(crossfade?.transition?.fromStartSeconds, 79)
  assert.equal(crossfade?.transition?.toStartSeconds, 0)
  assert.equal(crossfade?.outgoingSeekSeconds, 74)
  assert.equal(crossfade?.incomingStopSeconds, 7)
})

test('rechaza metadatos y duraciones que no pueden generar un cruce', () => {
  assert.equal(buildMixPreviewWindow(draft, NaN, 20_000), null)
  assert.equal(buildMixPreviewWindow(draft, 20_000, 0), null)
  assert.equal(buildMixPreviewWindow({ ...draft, durationMs: 100 }, 20_000, 20_000), null)
})

test('el cursor sigue el tiempo absoluto de cada deck y desaparece al pausarlo', () => {
  const outgoing = previewDeckPositionMs(92.125, true)
  const incoming = previewDeckPositionMs(4.25, true)
  assert.equal(outgoing, 92_125)
  assert.equal(incoming, 4_250)
  assert.equal(previewDeckPositionMs(92.125, false), null)
  assert.equal(previewDeckPositionMs(Number.NaN, true), null)
  assert.equal(previewDeckPositionMs(-1, true), null)
})
