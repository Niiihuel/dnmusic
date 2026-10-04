import { Buffer } from 'node:buffer'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createPrivateKey } from 'node:crypto'
import { fileURLToPath } from 'node:url'

export function validarEntorno(env) {
  if (!['production', 'preview'].includes(env.IOS_PROFILE)) throw new Error('Elegí production o preview.')
  if (!env.EXPO_TOKEN?.trim()) throw new Error('Falta el secreto EXPO_TOKEN en GitHub Actions.')
  if (!['true', 'false'].includes(env.SUBMIT_TESTFLIGHT)) throw new Error('La opción TestFlight debe ser true o false.')
  if (env.IPA_RELEASE && (!/^ios-build-[0-9]+-[0-9]+$/.test(env.IPA_RELEASE) || env.IOS_PROFILE !== 'production' || env.SUBMIT_TESTFLIGHT !== 'true')) {
    throw new Error('IPA_RELEASE requiere un borrador ios-build-ID-INTENTO y TestFlight production.')
  }
  if (env.SUBMIT_TESTFLIGHT === 'true') {
    if (env.IOS_PROFILE !== 'production') throw new Error('TestFlight requiere el perfil production; preview es instalación interna.')
    // Sin overrides, EAS Submit reutiliza la clave guardada en Expo.
    if (!hayClaveLocal(env)) return
    for (const name of ['ASC_API_KEY_ID', 'ASC_API_KEY_ISSUER_ID', 'ASC_API_KEY_P8_BASE64']) {
      if (!env[name]?.trim()) throw new Error(`Para TestFlight falta el secreto ${name}. Podés compilar sin activar TestFlight.`)
    }
    if (!/^[A-Z0-9]{10}$/.test(env.ASC_API_KEY_ID)) throw new Error('ASC_API_KEY_ID no tiene un formato válido.')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env.ASC_API_KEY_ISSUER_ID)) throw new Error('ASC_API_KEY_ISSUER_ID no tiene un formato válido.')
    leerClave(env.ASC_API_KEY_P8_BASE64)
  }
}

function hayClaveLocal(env) {
  return ['ASC_API_KEY_ID', 'ASC_API_KEY_ISSUER_ID', 'ASC_API_KEY_P8_BASE64'].some(name => env[name]?.trim())
}

function leerClave(encoded) {
  const compact = encoded.replace(/\s/g, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) throw new Error('ASC_API_KEY_P8_BASE64 no es base64 válido.')
  const pem = Buffer.from(compact, 'base64').toString('utf8')
  try {
    const key = createPrivateKey(pem)
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error()
  } catch { throw new Error('ASC_API_KEY_P8_BASE64 debe contener la clave privada .p8 de App Store Connect.') }
  return pem
}

export function prepararSubmit(env, projectRoot = process.cwd()) {
  validarEntorno(env)
  if (env.SUBMIT_TESTFLIGHT !== 'true' || !env.RUNNER_TEMP) throw new Error('La preparación de TestFlight requiere RUNNER_TEMP y la opción activada.')
  const path = join(projectRoot, 'eas.json')
  const config = JSON.parse(readFileSync(path, 'utf8'))
  const production = config.submit?.production?.ios
  if (!production?.ascAppId) throw new Error('Falta submit.production.ios.ascAppId en eas.json.')
  config.submit.github = { ios: { ...production } }
  if (hayClaveLocal(env)) {
    const dir = join(env.RUNNER_TEMP, 'dnmusic-apple')
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const keyPath = join(dir, `AuthKey_${env.ASC_API_KEY_ID}.p8`)
    writeFileSync(keyPath, leerClave(env.ASC_API_KEY_P8_BASE64), { mode: 0o600 })
    Object.assign(config.submit.github.ios, { ascApiKeyPath: keyPath,
      ascApiKeyId: env.ASC_API_KEY_ID, ascApiKeyIssuerId: env.ASC_API_KEY_ISSUER_ID })
  }
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'check') validarEntorno(process.env)
    else if (process.argv[2] === 'prepare-submit') prepararSubmit(process.env)
    else throw new Error('Usá check o prepare-submit.')
    console.log('Configuración de iOS verificada.')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
