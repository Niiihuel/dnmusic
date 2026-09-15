import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('Vercel aplica solo el parche web y los builds nativos conservan expo-audio', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
  const script = readFileSync('scripts/postinstall.mjs', 'utf8')

  assert.equal(packageJson.scripts.postinstall, 'node scripts/postinstall.mjs')
  assert.match(script, /process\.env\.VERCEL/)
  assert.match(script, /\['--patch-dir', 'patches-vercel', '--error-on-fail'\]/)
  assert.match(script, /: \['--error-on-fail'\]/)
})
