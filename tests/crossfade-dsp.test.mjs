import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

test('la envolvente nativa mantiene el volumen base y los cues en tiempo de audio', t => {
  const compiler = process.env.CC || 'cc'
  if (spawnSync(compiler, ['--version']).error) {
    if (process.env.REQUIRE_EQ_DSP_TEST) assert.fail('Falta compilador C para validar el DSP')
    t.skip('Usar CC o nix shell nixpkgs#gcc --command node --test tests/crossfade-dsp.test.mjs')
    return
  }
  const dir = mkdtempSync(join(tmpdir(), 'dnmusic-crossfade-dsp-'))
  try {
    const binary = join(dir, 'crossfade-test')
    const build = spawnSync(compiler, ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror',
      '-I', resolve('node_modules/expo-audio/ios'), resolve('tests/fixtures/crossfade-dsp.c'), '-lm', '-o', binary], { encoding: 'utf8' })
    assert.equal(build.status, 0, build.stdout + build.stderr)
    const run = spawnSync(binary, [], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stdout + run.stderr)
    assert.match(run.stdout, /Crossfade DSP OK/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
