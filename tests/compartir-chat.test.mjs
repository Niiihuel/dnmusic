import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function load(path, imports = {}) {
  const exports = {}
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('exports', 'require', source)(exports, (name) => {
    assert.ok(name in imports, `Import inesperado: ${name}`)
    return imports[name]
  })
  return exports
}
const shared = load('src/models/sharedSong.ts')
const model = load('src/models/message.ts', { './sharedSong': shared })
const track = { videoId: 'abc123', title: 'Tema', artist: 'Artista', artistId: null,
  artworkUrl: 'https://images.test/cover.jpg', artworkPath: null, audioPath: '', durationMs: 180000 }
const row = { id: 'mensaje', sender_id: 'yo', pair_id: 'par', text: 'Una canción',
  created_at: '2026-09-12T18:00:00Z', opened_at: null, read_at: null }

test('canción completa: ida y vuelta por song JSON sin convertirse en fragmento', () => {
  const song = shared.sharedSongFrom({ ...track, kind: 'track' })
  const payload = model.toMessageRow('par', 'yo', { text: ' Canción ', sharedSong: song })
  assert.equal(payload.pair_id, 'par')
  assert.equal(payload.text, 'Canción')
  const result = model.messageFromRow({ ...row, ...payload })
  assert.deepEqual(result.sharedSong, song)
  assert.equal(result.song, null)
})

test('los fragmentos existentes conservan recorte y letra', () => {
  const snippet = { ...track, path: 'abc123.m4a', startMs: 45000, durationMs: 15000,
    lyrics: [{ atMs: 47000, text: 'Verso' }], style: 'lyrics' }
  const payload = model.toMessageRow('par', 'yo', { text: '', song: snippet })
  const result = model.messageFromRow({ ...row, ...payload })
  assert.equal(result.sharedSong, null)
  assert.equal(result.song.path, snippet.path)
  assert.equal(result.song.startMs, 45000)
  assert.equal(result.song.durationMs, 15000)
  assert.deepEqual(result.song.lyrics, snippet.lyrics)
})

test('adjuntos inválidos no ocultan el texto ni rompen la conversación', () => {
  for (const song of [null, {}, { kind: 'track', videoId: '', title: 'Tema' }, { kind: 'track', videoId: 'abc123' }]) {
    const result = model.messageFromRow({ ...row, song })
    assert.equal(result.text, row.text)
    assert.equal(result.sharedSong, null)
  }
})

test('el envío no guarda un archivo local, URL firmada ni duración no finita', () => {
  for (const audioPath of ['file:///tmp/song.m4a', 'https://storage.test/song?token=secreto', '/tmp/song', '../song']) {
    const song = shared.sharedSongFrom({ ...track, kind: 'track', audioPath, durationMs: Infinity })
    assert.equal(song.audioPath, '')
    assert.equal(song.durationMs, 0)
  }
})

test('se comparte sin resolver ni publicar la canción; errores del chat se propagan', async () => {
  const calls = []
  let failure = false
  const service = load('src/services/compartirPorChat.ts', {
    '../models/sharedSong': shared,
    './messages': { sendMessage: async (...args) => { if (failure) throw new Error('No autorizado'); calls.push(args); return 'nuevo' } },
  })
  assert.equal(await service.compartirPorChat('par', 'yo', track), 'nuevo')
  assert.equal(calls.length, 1)
  assert.equal(calls[0][2].sharedSong.kind, 'track')
  assert.equal(calls[0][2].sharedSong.audioPath, '')
  assert.ok(!calls[0][2].text.includes('http'))
  failure = true
  await assert.rejects(service.compartirPorChat('par', 'yo', track), /No autorizado/)
  await assert.rejects(service.compartirPorChat('par', 'yo', { ...track, videoId: '' }), /datos necesarios/)
})
