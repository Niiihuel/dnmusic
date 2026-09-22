import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

test('el DSP de iOS procesa señales reales en C sin saturar ni mezclar canales', t => {
  const compiler = process.env.CC || 'cc'
  if (spawnSync(compiler, ['--version']).error) {
    if (process.env.REQUIRE_EQ_DSP_TEST) assert.fail('Falta compilador C para validar el DSP')
    t.skip('Usar CC o ejecutar con nix shell nixpkgs#gcc --command node --test tests/ecualizador-dsp.test.mjs')
    return
  }
  const dir = mkdtempSync(join(tmpdir(), 'dnmusic-eq-dsp-'))
  try {
    const binary = join(dir, 'equalizer-test')
    const build = spawnSync(compiler, ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror',
      '-I', resolve('node_modules/expo-audio/ios'), resolve('tests/fixtures/equalizer-dsp.c'), '-lm', '-o', binary], { encoding: 'utf8' })
    assert.equal(build.status, 0, build.stdout + build.stderr)
    const run = spawnSync(binary, [], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stdout + run.stderr)
    assert.match(run.stdout, /DSP OK/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
