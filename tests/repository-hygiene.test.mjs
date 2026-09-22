import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')

test('Vercel no despliega ninguna rama: producción vive en Railway', () => {
  for (const path of ['vercel.json', 'server/vercel.json']) {
    assert.equal(JSON.parse(read(path)).git.deploymentEnabled, false)
  }
})

test('el servicio y su lockfile usan el nombre dnmusic', () => {
  assert.equal(JSON.parse(read('server/package.json')).name, 'dnmusic')
  const lock = JSON.parse(read('server/package-lock.json'))
  assert.equal(lock.name, 'dnmusic')
  assert.equal(lock.packages[''].name, 'dnmusic')
})

test('Git ignora credenciales, claves y exportaciones locales de infraestructura', () => {
  const paths = ['.env', '.env.production', 'AuthKey.p8', 'signing.p12',
    'private.pem', 'private.key', 'credentials.json', 'service-account-prod.json',
    '.vercel/project.json', '.idea/workspace.xml', '.railway-config-pull-test/railway.ts']
  const ignored = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
    cwd: root, input: paths.join('\n'), encoding: 'utf8',
  }).trim().split('\n')
  assert.deepEqual(ignored, paths)
})

test('el CI de pull requests sólo tiene permisos de lectura', () => {
  assert.match(read('.github/workflows/ci-checks.yml'), /permissions:\s*\n\s+contents: read/)
})
