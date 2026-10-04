import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('el export publica una URL canónica y previews absolutos coherentes con el dominio configurado', () => {
  const dist = mkdtempSync(join(tmpdir(), 'dnmusic-pwa-'))
  const index = join(dist, 'index.html')
  try {
    writeFileSync(index, '<!doctype html><html lang="en"><head><title>Expo</title><meta name="viewport" content="width=device-width"></head><body><div id="root"></div></body></html>')
    const inyectar = () => execFileSync(process.execPath, ['scripts/inject-pwa.mjs', dist], {
      env: { ...process.env, SITE_URL: ' https://music.example.test/ ' },
      stdio: 'pipe',
    })
    inyectar()
    const html = readFileSync(index, 'utf8')
    assert.equal((html.match(/<title>/g) ?? []).length, 1)
    assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1)
    const meta = html.slice(html.indexOf('<!-- dany:tarjeta -->'), html.indexOf('<!-- /dany:tarjeta -->'))
    assert.match(meta, /<link rel="canonical" href="https:\/\/music\.example\.test"/)
    assert.match(meta, /property="og:url" content="https:\/\/music\.example\.test"/)
    for (const etiqueta of ['property="og:image"', 'name="twitter:image"']) {
      assert.ok(meta.includes(`${etiqueta} content="https://music.example.test/icons/icon-512.png"`))
    }
    assert.match(meta, /property="og:image:alt" content="dnmusic"/)
    assert.doesNotMatch(meta, /railway\.app|example\.test\/\//)
    inyectar()
    assert.equal(readFileSync(index, 'utf8'), html, 'repetir la inyección no duplica metadatos')
  } finally {
    rmSync(dist, { recursive: true, force: true })
  }
})
