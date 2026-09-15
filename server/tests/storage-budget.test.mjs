import test from 'node:test'
import assert from 'node:assert/strict'
import { planStorageBudget } from '../dist/storage-budget.js'

const hour = 60 * 60 * 1000
const now = Date.parse('2026-09-15T12:00:00Z')
const old = now - 24 * hour
const recent = now - hour
const mib = 1024 * 1024

const refs = (audio = [], artwork = []) => ({
  audio: new Set(audio),
  artwork: new Set(artwork),
  covers: new Set(),
})

test('borra primero cachés viejos y conserva todo lo referenciado', () => {
  const files = [
    { bucket: 'songs', name: 'picos/a.json', bytes: 20 * mib, createdAt: old },
    { bucket: 'artwork', name: 'unused.jpg', bytes: 30 * mib, createdAt: old },
    { bucket: 'songs', name: 'unused.m4a', bytes: 120 * mib, createdAt: old },
    { bucket: 'songs', name: 'used.m4a', bytes: 700 * mib, createdAt: old },
  ]
  const plan = planStorageBudget(files, refs(['used.m4a']), 0, {
    hardLimitBytes: 850 * mib,
    targetBytes: 800 * mib,
    now,
  })

  assert.equal(plan.allowed, true)
  assert.deepEqual(plan.deletions.map((file) => file.name), [
    'picos/a.json',
    'unused.jpg',
    'unused.m4a',
  ])
  assert.equal(plan.projectedBytes, 700 * mib)
})

test('nunca elimina archivos propios ni medios de perfil', () => {
  const files = [
    { bucket: 'songs', name: 'propias/uuid.mp3', bytes: 400 * mib, createdAt: old },
    { bucket: 'avatars', name: 'user/avatar.gif', bytes: 100 * mib, createdAt: old },
    { bucket: 'showcases', name: 'user/fondo.mp4', bytes: 400 * mib, createdAt: old },
  ]
  const plan = planStorageBudget(files, refs(), 10 * mib, {
    hardLimitBytes: 850 * mib,
    targetBytes: 800 * mib,
    now,
  })

  assert.equal(plan.allowed, false)
  assert.deepEqual(plan.deletions, [])
})

test('respeta la gracia de archivos nuevos para no borrar una resolución en curso', () => {
  const files = [
    { bucket: 'songs', name: 'fresh.m4a', bytes: 840 * mib, createdAt: recent },
  ]
  const plan = planStorageBudget(files, refs(), 20 * mib, {
    hardLimitBytes: 850 * mib,
    targetBytes: 800 * mib,
    graceMs: 6 * hour,
    now,
  })

  assert.equal(plan.allowed, false)
  assert.deepEqual(plan.deletions, [])
})

test('limpia cuarentenas de archivos propios, no su copia durable', () => {
  const files = [
    { bucket: 'songs', name: 'propias/user/song.mp3', bytes: 100 * mib, createdAt: old },
    { bucket: 'songs', name: 'propias/uuid.mp3', bytes: 760 * mib, createdAt: old },
  ]
  const plan = planStorageBudget(files, refs(), 0, {
    hardLimitBytes: 850 * mib,
    targetBytes: 800 * mib,
    now,
  })

  assert.equal(plan.allowed, true)
  assert.deepEqual(plan.deletions.map((file) => file.name), ['propias/user/song.mp3'])
})
