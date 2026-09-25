import { createRequire } from 'node:module'

/**
 * Dónde están ffmpeg y ffprobe.
 *
 * El servicio los usa para cuatro cosas —remuxar lo que baja de YouTube,
 * verificar lo que aporta un cliente, medir duraciones y dibujar la onda— y
 * hasta ahora salían del `PATH`, que es lo que hay adentro del contenedor:
 * el Dockerfile los instala con apt.
 *
 * En Vercel no hay apt ni `PATH` que valga: una función es un directorio de
 * archivos, y lo que no viaja en el bundle no existe. De ahí los paquetes
 * `ffmpeg-static` y `ffprobe-static`, que son el binario estático adentro de
 * `node_modules` — probado contra el despliegue: corren, y conservan el bit de
 * ejecución.
 *
 * Los contenedores Docker fijan `FFMPEG_PATH` y `FFPROBE_PATH` a los ejecutables
 * de apt: los estáticos de npm arrancan allí, pero pueden abortar con SIGSEGV
 * cuando ffprobe/ffmpeg abre una URL firmada de Storage. Vercel conserva los
 * estáticos porque no trae apt. Si ninguno está disponible, se usa el PATH.
 */
const require_ = createRequire(import.meta.url)

/**
 * Los `require` van con el nombre **escrito literal**, y no por una variable.
 *
 * Vercel arma la función rastreando el código: sigue los `import` y los
 * `require` que puede leer estáticamente, y copia lo que encuentra. Un
 * `require_(paquete)` con el nombre en una variable no lo puede leer, así que
 * `ffmpeg-static` no viajaba en el bundle y esto caía al `PATH`, donde no hay
 * ningún ffmpeg: `/peaks` moría con `spawn ffmpeg ENOENT`. Con el nombre a la
 * vista, el rastreador lo mete solo.
 *
 * El `includeFiles` de `vercel.json` sigue haciendo falta igual: el rastreador
 * copia el `index.js` del paquete —que es lo que se importa— pero no el
 * binario, que ese `index.js` arma con un `join(__dirname, …)` en tiempo de
 * ejecución. Uno trae el módulo; el otro, los ochenta megas que importan.
 */
function ruta(leer: () => unknown): string | null {
  try {
    const v = leer()
    const r = typeof v === 'string' ? v : ((v as { default?: string; path?: string })?.default ?? (v as { path?: string })?.path)
    return typeof r === 'string' && r.length > 0 ? r : null
  } catch {
    /* No está instalado: no es un error, es un entorno que trae los suyos. */
    return null
  }
}

/** El ejecutable de ffmpeg. */
export const FFMPEG: string =
  process.env.FFMPEG_PATH ?? ruta(() => require_('ffmpeg-static')) ?? 'ffmpeg'

/** El ejecutable de ffprobe. */
export const FFPROBE: string =
  process.env.FFPROBE_PATH ?? ruta(() => require_('ffprobe-static')) ?? 'ffprobe'
