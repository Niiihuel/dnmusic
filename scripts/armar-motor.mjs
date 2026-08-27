#!/usr/bin/env node
/**
 * Empaqueta bgutils-js en un solo `<script>` para el motor del WebView.
 *
 * El teléfono necesita BotGuard corriendo en un navegador de verdad (ver
 * `src/services/motor/`), y eso significa meter la librería dentro de una
 * página. Metro no sirve: empaqueta para React Native, no para el documento
 * que carga el WebView.
 *
 * Un bundler tampoco hace falta. bgutils-js son **20 KB** repartidos en seis
 * archivos con imports relativos, todos con nombres distintos y sin un solo
 * `export default`: alcanza con concatenarlos en orden de dependencia y sacar
 * los `import`/`export`, porque al quedar todos en el mismo ámbito los nombres
 * ya se ven entre sí. Menos maquinaria que instalar esbuild para 20 KB, y el
 * resultado se puede leer.
 *
 * La salida se **commitea**: el build de EAS no debería depender de que este
 * script corra bien en una máquina que no es la tuya. Si actualizás
 * bgutils-js, corré `npm run motor` y commiteá el diff.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'node_modules/bgutils-js/dist'
const SALIDA = 'src/services/motor/bgutils.generado.ts'

/** Orden de dependencia, a mano: son seis archivos y el grafo no se mueve. */
const ORDEN = [
  'utils/constants.js',
  'utils/EventEmitterLike.js',
  'utils/helpers.js',
  'core/BotGuardClient.js',
  'core/ChallengeFetcher.js',
  'core/WebPoMinter.js',
]

const version = JSON.parse(readFileSync('node_modules/bgutils-js/package.json', 'utf8')).version

const cuerpo = ORDEN.map((archivo) => {
  const crudo = readFileSync(join(DIST, archivo), 'utf8')
  const limpio = crudo
    /* Los imports sobran: todo termina en el mismo ámbito. */
    .replace(/^import\s[^;]*;\s*$/gm, '')
    /* `export class X` → `class X`. Nunca hay `export default` ni renombres. */
    .replace(/^export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/gm, '')
    .replace(/^export\s*\{\s*\};?\s*$/gm, '')
    .replace(/^\/\/# sourceMappingURL=.*$/gm, '')
    .trim()
  return `/* ── ${archivo} ── */\n${limpio}`
}).join('\n\n')

/* Una comprobación barata que atrapa el día que bgutils cambie de forma: si
   quedó algún `import`/`export` suelto, el bundle no va a correr y es mejor
   enterarse acá que en un iPhone. */
const sobrantes = cuerpo.match(/^\s*(import|export)\s/gm)
if (sobrantes) {
  console.error(`bgutils-js cambió de forma: quedaron ${sobrantes.length} import/export sin traducir.`)
  console.error('Revisá el grafo de módulos y actualizá ORDEN en scripts/armar-motor.mjs.')
  process.exit(1)
}

const archivo = `/* Generado por scripts/armar-motor.mjs a partir de bgutils-js ${version}. No editar a mano. */

/** bgutils-js aplanado, para inyectar en el documento del WebView. */
export const BGUTILS_JS = ${JSON.stringify(cuerpo)}

/** La versión de la que salió, para que se vea en un diff qué se actualizó. */
export const BGUTILS_VERSION = ${JSON.stringify(version)}
`

writeFileSync(SALIDA, archivo)
console.log(`${SALIDA}: bgutils-js ${version}, ${(cuerpo.length / 1024).toFixed(1)} KB`)
