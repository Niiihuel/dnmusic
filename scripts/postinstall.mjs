import { spawnSync } from 'node:child_process'

/*
 * expo-audio contiene cambios nativos de Android/iOS. El build web de Vercel
 * no compila ninguno de esos archivos y una diferencia del paquete publicado
 * no debe tirar abajo toda la web durante npm install. En los builds nativos
 * se siguen aplicando y verificando todos los parches.
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
