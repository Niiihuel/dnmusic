import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = ts.transpileModule(readFileSync('src/services/music.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function musicService() {
  const module = { exports: {} }
  const supabase = { auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) } }
  const imports = {
    '../lib/trabajosCompartidos': {
      trabajosCompartidos: () => (_key, start, signal) => start(signal ?? new AbortController().signal),
    },
    '../lib/supabase': { getSupabase: () => supabase },
    '../lib/mixSpectrum': { validMixSpectrum: () => true },
    './letra': { parseLrc: () => [] },
    './motor/resolutorABordo': { hayResolutorABordo: () => false, resolverYAportar: () => {} },
    '../state/resolucion': {
      iniciarResolucion: () => {}, progresoResolucion: () => {}, terminarResolucion: () => {},
    },
  }
  new Function('exports', 'require', 'process', source)(module.exports, id => {
    if (!(id in imports)) throw new Error(`Unexpected dependency: ${id}`)
    return imports[id]
  }, process)
  return module.exports
}

const track = {
  videoId: 'abcdefghijk', title: 'Canción', artist: 'Artista', artworkUrl: '', durationMs: 1000,
}

class MockXHR {
  constructor(responseText) {
    this.responseText = responseText
    this.status = 200
  }
  open() {}
  setRequestHeader() {}
  send() { this.onload() }
}

test('un error declarado por /resolve/progreso pasa directo al resolutor local', async () => {
  const originalXHR = globalThis.XMLHttpRequest
  const originalFetch = globalThis.fetch
  const originalBridge = globalThis.dnmusicEscritorio
  let peticiones = 0
  let aportes = 0
  try {
    globalThis.XMLHttpRequest = class extends MockXHR {
      constructor() { super('{"error":"YouTube no está entregando el audio"}\n') }
    }
    globalThis.fetch = async () => { peticiones++; throw new Error('No debía repetirse') }
    globalThis.dnmusicEscritorio = {
      resolver: async () => { aportes++; throw new Error('Falló el intento local') },
    }
    await assert.rejects(musicService().resolveSong(track), /Esta computadora tampoco pudo/)
    assert.equal(peticiones, 0)
    assert.equal(aportes, 1)
  } finally {
    globalThis.XMLHttpRequest = originalXHR
    globalThis.fetch = originalFetch
    globalThis.dnmusicEscritorio = originalBridge
  }
})

test('si no hay respuesta NDJSON, conserva el fallback a /resolve', async () => {
  const originalXHR = globalThis.XMLHttpRequest
  const originalFetch = globalThis.fetch
  let peticiones = 0
  try {
    globalThis.XMLHttpRequest = class extends MockXHR {
      constructor() { super('Not found') ; this.status = 404 }
    }
    globalThis.fetch = async () => {
      peticiones++
      return { ok: false, status: 503, json: async () => ({ error: 'Origen temporalmente no disponible' }) }
    }
    await assert.rejects(musicService().resolveSong(track), /Origen temporalmente no disponible/)
    assert.equal(peticiones, 1)
  } finally {
    globalThis.XMLHttpRequest = originalXHR
    globalThis.fetch = originalFetch
  }
})
