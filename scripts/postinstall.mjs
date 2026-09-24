import { spawnSync } from 'node:child_process'

/*
 * expo-audio contiene cambios nativos de Android/iOS. Vercel aplica solo el
 * runtime web compilado de expo-audio: Metro importa `build/`, no `src/`.
 * En builds nativos se aplican también los parches Swift/Kotlin y el source.
 */
const args = process.env.VERCEL
  ? ['--patch-dir', 'patches-vercel', '--error-on-fail']
  : ['--error-on-fail']

const command = process.platform === 'win32'
  ? 'node_modules\\.bin\\patch-package.cmd'
  : 'node_modules/.bin/patch-package'
const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })

if (result.error) throw result.error
process.exit(result.status ?? 1)
