import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validarEntorno, prepararSubmit } from '../scripts/ci/ios.mjs'

const base = { IOS_PROFILE: 'production', EXPO_TOKEN: 'test-only', SUBMIT_TESTFLIGHT: 'false' }
const privateKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' })
const submit = { ...base, SUBMIT_TESTFLIGHT: 'true', ASC_API_KEY_ID: 'ABC1234567',
  ASC_API_KEY_ISSUER_ID: '12345678-1234-1234-1234-123456789abc',
  ASC_API_KEY_P8_BASE64: Buffer.from(pem).toString('base64') }

test('compilar production o preview sólo requiere EXPO_TOKEN', () => {
  assert.doesNotThrow(() => validarEntorno(base))
  assert.doesNotThrow(() => validarEntorno({ ...base, IOS_PROFILE: 'preview' }))
  assert.throws(() => validarEntorno({ ...base, EXPO_TOKEN: '' }), /EXPO_TOKEN/)
  assert.throws(() => validarEntorno({ ...base, IOS_PROFILE: 'arbitrary' }), /production o preview/)
  assert.throws(() => validarEntorno({ ...base, SUBMIT_TESTFLIGHT: 'yes' }), /true o false/)
})

test('TestFlight rechaza preview, claves faltantes e identificadores inválidos', () => {
  assert.doesNotThrow(() => validarEntorno(submit))
  assert.throws(() => validarEntorno({ ...submit, IOS_PROFILE: 'preview' }), /requiere el perfil production/)
  for (const key of ['ASC_API_KEY_ID', 'ASC_API_KEY_ISSUER_ID', 'ASC_API_KEY_P8_BASE64']) {
    assert.throws(() => validarEntorno({ ...submit, [key]: '' }), new RegExp(key))
  }
  assert.throws(() => validarEntorno({ ...submit, ASC_API_KEY_ID: '../key' }), /formato válido/)
  assert.throws(() => validarEntorno({ ...submit, ASC_API_KEY_ISSUER_ID: 'wrong' }), /formato válido/)
})

test('claves dañadas o de otro tipo fallan sin revelar contenido', () => {
  const wrongCurve = generateKeyPairSync('ec', { namedCurve: 'secp384r1' }).privateKey
    .export({ type: 'pkcs8', format: 'pem' })
  for (const secret of ['!!private-secret!!', Buffer.from('sensitive-not-a-key').toString('base64'), Buffer.from(wrongCurve).toString('base64')]) {
    assert.throws(() => validarEntorno({ ...submit, ASC_API_KEY_P8_BASE64: secret }), error => {
      assert.match(error.message, /ASC_API_KEY_P8_BASE64/)
      assert.ok(!error.message.includes(secret))
      assert.ok(!error.message.includes('sensitive-not-a-key'))
      return true
    })
  }
})

test('preparación conserva perfiles y escribe la clave fuera del proyecto con permisos privados', t => {
  const root = mkdtempSync(join(tmpdir(), 'dnmusic-ios-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const config = { build: { production: { autoIncrement: true } }, submit: {
    production: { ios: { ascAppId: '12345', appleTeamId: 'TEAM123456' } } } }
  writeFileSync(join(root, 'eas.json'), JSON.stringify(config))
  const env = { ...submit, RUNNER_TEMP: join(root, 'runner') }
  prepararSubmit(env, root)
  const actual = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8'))
  assert.deepEqual(actual.build, config.build)
  assert.deepEqual(actual.submit.production, config.submit.production)
  const ios = actual.submit.github.ios
  assert.equal(ios.ascAppId, '12345')
  assert.equal(ios.appleTeamId, 'TEAM123456')
  assert.equal(ios.ascApiKeyId, submit.ASC_API_KEY_ID)
  assert.equal(ios.ascApiKeyIssuerId, submit.ASC_API_KEY_ISSUER_ID)
  assert.equal(readFileSync(ios.ascApiKeyPath, 'utf8'), pem)
  assert.equal(statSync(ios.ascApiKeyPath).mode & 0o777, 0o600)
  assert.equal(statSync(join(env.RUNNER_TEMP, 'dnmusic-apple')).mode & 0o777, 0o700)
  assert.ok(!JSON.stringify(actual).includes(submit.ASC_API_KEY_P8_BASE64))
})

test('configuración incompleta falla antes de escribir una clave privada', t => {
  const root = mkdtempSync(join(tmpdir(), 'dnmusic-ios-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(join(root, 'eas.json'), '{}')
  assert.throws(() => prepararSubmit({ ...submit, RUNNER_TEMP: root }, root), /ascAppId/)
  assert.equal(existsSync(join(root, 'dnmusic-apple')), false)
  assert.throws(() => prepararSubmit(base, root), /RUNNER_TEMP/)
})


test('sin claves locales, TestFlight reutiliza la configuración remota sin crear archivos de claves', t => {
  const root = mkdtempSync(join(tmpdir(), 'dnmusic-ios-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const ios = { ascAppId: '12345', appleTeamId: 'TEAM123456' }
  writeFileSync(join(root, 'eas.json'), JSON.stringify({ submit: { production: { ios } } }))
  const env = { ...base, SUBMIT_TESTFLIGHT: 'true', RUNNER_TEMP: root }
  assert.doesNotThrow(() => validarEntorno(env))
  prepararSubmit(env, root)
  const config = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8'))
  assert.deepEqual(config.submit.github.ios, ios)
  assert.equal(existsSync(join(root, 'dnmusic-apple')), false)
})
