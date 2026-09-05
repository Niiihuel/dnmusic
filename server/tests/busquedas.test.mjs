import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Innertube } from 'youtubei.js'

test('búsquedas comparten sesión sin player ni tokens y cachean antes de limitar', async t => {
  let sesiones = 0
  const llamadas = []
  t.mock.method(Innertube, 'create', async opciones => {
    sesiones++
    assert.equal(opciones.retrieve_player, false)
    assert.equal(opciones.retrieve_innertube_config, false)
    assert.equal(opciones.po_token, undefined)
    return {
      session: { context: { client: {} } },
      music: { search: async (query, { type }) => {
        llamadas.push([query, type])
        return { songs: { contents: [] }, artists: { contents: [
          { id: 'UCa', name: 'A' }, { id: 'UCb', name: 'B' },
        ] } }
      } },
    }
  })
  t.mock.method(globalThis, 'fetch', async input => {
    assert.equal(String(input), 'https://music.youtube.com/')
    return new Response('"INNERTUBE_CLIENT_VERSION":"1.test"')
  })
  const { search, searchArtists } = await import('../dist/youtube.js')
  const [songs, artists] = await Promise.all([
    search(' Example '), searchArtists('Example', 1), search('Example'),
  ])
  assert.deepEqual(songs, [])
  assert.equal(artists.length, 1)
  assert.equal((await searchArtists('Example', 2)).length, 2)
  assert.equal(sesiones, 1)
  assert.deepEqual(llamadas.map(x => x[1]).sort(), ['artist', 'song'])
})
