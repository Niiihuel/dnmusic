import { readFileSync, writeFileSync } from 'node:fs'

/**
 * Escribe las notas del release de GitHub, sacadas de las mismas novedades que
 * lee la app (`src/lib/novedades.json`): una sola fuente, dos lectores. El
 * archivo que emite lo levanta electron-builder vía `releaseInfo.
 * releaseNotesFile` y queda como cuerpo del release en dnmusic-releases.
 *
 * La versión llega por argumento (el CI le pasa la del tag); sin argumento usa
 * la entrada más nueva, que es lo que corresponde al empaquetado local. Si la
 * versión pedida no tiene entrada, **falla**: publicar una versión sin haber
 * escrito qué trae es exactamente el olvido que este archivo existe para
 * atajar.
 */
const notas = JSON.parse(
  readFileSync(new URL('../../src/lib/novedades.json', import.meta.url), 'utf8'),
)

const pedida = process.argv[2]
const entrada = pedida ? notas.find((n) => n.version === pedida) : notas[0]
if (!entrada) {
  console.error(
    `✗ La versión ${pedida} no tiene novedades escritas en src/lib/novedades.json.`,
  )
  console.error('  Agregala ahí (es lo que la gente lee adentro de la app) y volvé a taggear.')
  process.exit(1)
}

const md = [
  `## ${entrada.titulo}`,
  '',
  ...(entrada.pasos?.length ? [
    '### Lo destacado',
    '',
    ...entrada.pasos.flatMap((paso, i) => [
      `#### ${String(i + 1).padStart(2, '0')} · ${paso.titulo}`,
      '',
      paso.detalle,
      '',
    ]),
    '### Todos los cambios',
    '',
  ] : []),
  ...entrada.cambios.map((c) => `- ${c}`),
  '',
  `_${entrada.fecha}_`,
  '',
].join('\n')

writeFileSync(new URL('../release-notas.md', import.meta.url), md)
console.log(`✓ release-notas.md con las novedades de la ${entrada.version}`)
