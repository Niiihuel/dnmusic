import { spawnSync, spawn } from 'node:child_process'
import { accessSync, constants, existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const command = process.argv[2] ?? 'doctor'
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(), process.platform === 'darwin' ? 'Library/Android/sdk' : 'Android/Sdk')
const adb = existsSync(join(sdk, 'platform-tools/adb')) ? join(sdk, 'platform-tools/adb') : 'adb'
const java = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin/java') : 'java'
const tool = (name, args) => spawnSync(name, args, { encoding: 'utf8', timeout: 10000 })

if (command === 'doctor') {
  const j = tool(java, ['-version'])
  const javaVersion = (j.stderr || j.stdout || '').match(/version \"(\d+)/)?.[1]
  const compatibleJava = j.status === 0 && javaVersion === '17'
  const a = tool(adb, ['version'])
  const platform = existsSync(join(sdk, 'platforms/android-36/android.jar'))
  const buildTools = existsSync(join(sdk, 'build-tools/36.0.0'))
  const ndk = existsSync(join(sdk, 'ndk/27.1.12297006/source.properties'))
  const cmake = existsSync(join(sdk, 'cmake/3.30.5'))
  let acceleration = process.platform !== 'linux'
  if (process.platform === 'linux') { try { accessSync('/dev/kvm', constants.R_OK | constants.W_OK); acceleration = true } catch {} }
  console.log(`Java: ${j.status === 0 ? (j.stderr || j.stdout).split('\n')[0] : 'falta JDK 17'}`)
  console.log(`ADB: ${a.status === 0 ? 'disponible' : 'faltan Android SDK Platform-Tools'}`)
  console.log(`Android SDK 36: ${platform ? 'disponible' : 'falta'} (${sdk})`)
  console.log(`Build-Tools 36.0.0: ${buildTools ? 'disponible' : 'faltan'}`)
  console.log(`NDK 27.1.12297006: ${ndk ? 'disponible' : 'falta'}`)
  console.log(`CMake 3.30.5: ${cmake ? 'disponible' : 'falta'}`)
  if (j.status === 0 && !compatibleJava) console.log('Usá JDK 17 para la configuración de este proyecto.')
  console.log(`Virtualización: ${acceleration ? 'disponible' : 'revisar acceso a KVM o usar teléfono USB'}`)
  if (a.status === 0) console.log(tool(adb, ['devices', '-l']).stdout.trim())
  console.log('Guía: docs/ANDROID.md')
  process.exitCode = compatibleJava && a.status === 0 && platform && buildTools && ndk && cmake ? 0 : 1
} else if (command === 'reverse') {
  for (const port of ['8081', '8787']) {
    const result = tool(adb, ['reverse', `tcp:${port}`, `tcp:${port}`])
    if (result.status !== 0) { console.error(result.stderr || 'No hay dispositivo autorizado'); process.exit(1) }
  }
  console.log('USB conectado: Metro 8081 y API local 8787.')
} else if (command === 'start' || command === 'run') {
  const config = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8')).build.preview.env
  const env = { ...config, ...process.env, ANDROID_HOME: sdk }
  const args = command === 'run' ? ['expo', 'run:android', ...process.argv.slice(3)] : ['expo', 'start', '--dev-client', '--android', '--localhost', ...process.argv.slice(3)]
  const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, { cwd: root, env, stdio: 'inherit' })
  child.on('error', error => { console.error(error.message); process.exitCode = 1 })
  child.on('exit', code => { process.exitCode = code ?? 1 })
} else {
  console.error('Uso: node scripts/android-dev.mjs doctor|run|start|reverse')
  process.exitCode = 1
}
