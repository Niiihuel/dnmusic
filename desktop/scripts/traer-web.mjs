#!/usr/bin/env node
/**
 * Trae adentro de desktop/ lo que electron-builder tiene que empaquetar: el
 * export web de Expo y el ícono.
 *
 * Se copia en vez de apuntarle a `../dist` desde electron-builder.yml porque
 * los `extraResources` que salen del directorio del proyecto se comportan
 * distinto según el sistema, y un empaquetado que anda en Linux y sale vacío en
 * Windows es exactamente el tipo de error que no se ve hasta que alguien
 * instala el .exe.
 *
 * De paso es el único lugar donde se puede avisar a tiempo del olvido más
 * probable de todos —empaquetar sin haber exportado la web—, que si no se nota
 * recién al abrir la app instalada y encontrarse una ventana negra.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '..', '..')

const WEB_ORIGEN = join(RAIZ, 'dist')
const WEB_DESTINO = resolve(AQUI, '..', 'web')
const ICONO_ORIGEN = join(RAIZ, 'assets', 'icon.png')
const ICONO_DESTINO = resolve(AQUI, '..', 'build', 'icon.png')

if (!existsSync(join(WEB_ORIGEN, 'index.html'))) {
  console.error(
    `✗ No hay export web en ${WEB_ORIGEN}.\n` +
      '  Corré "npm run build:web" en la raíz del repo y volvé a intentar.',
  )
  process.exit(1)
}

if (!existsSync(ICONO_ORIGEN)) {
  console.error(`✗ Falta ${ICONO_ORIGEN}, que es de donde salen los íconos de Windows y Linux.`)
  process.exit(1)
}

// Se borra entero: si quedaran chunks de un export anterior, el .asar los
// cargaría de contrabando y el instalador crecería sin motivo.
rmSync(WEB_DESTINO, { recursive: true, force: true })
cpSync(WEB_ORIGEN, WEB_DESTINO, { recursive: true })

mkdirSync(dirname(ICONO_DESTINO), { recursive: true })
cpSync(ICONO_ORIGEN, ICONO_DESTINO)

console.log(`✓ web → ${WEB_DESTINO}`)
console.log(`✓ ícono → ${ICONO_DESTINO}`)
