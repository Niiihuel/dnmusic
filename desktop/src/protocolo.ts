import { app, net, protocol } from 'electron'
import { statSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * De dónde carga la ventana el bundle web.
 *
 * No se usa `file://` —que sería lo obvio para servir una carpeta— por una
 * razón concreta: en `file://` el origen es opaco y **localStorage no
 * persiste**. La sesión de Supabase en web vive justo ahí (ver el comentario
 * de `storage` en src/lib/supabase.ts: en web se deja el default, que es
 * localStorage), así que con `file://` la app pediría iniciar sesión en cada
 * arranque. Tampoco habría contexto seguro, y sin contexto seguro no hay
 * `crypto.subtle` ni History API en condiciones, que es de lo que vive
 * expo-router.
 *
 * Un esquema propio registrado como `standard` + `secure` arregla las tres
 * cosas de una: `app://dnmusic` es un origen real, estable entre arranques y
 * tratado como https por Chromium.
 */
export const ESQUEMA = 'app'
export const HOST = 'dnmusic'
export const ORIGEN = `${ESQUEMA}://${HOST}`

/**
 * Tiene que correr **antes** de que la app esté lista: los privilegios de un
 * esquema se leen una sola vez, al levantar el proceso de red.
 */
export function registrarEsquema(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ESQUEMA,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

/**
 * La carpeta con el export de Expo.
 *
 * Empaquetada va en `resources/app` (extraResources), afuera del .asar. En
 * desarrollo se lee directo el `dist/` del repo, así un `npm run build:web`
 * se ve sin volver a copiar nada.
 */
export function raizWeb(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'app')
    : join(__dirname, '..', '..', 'dist')
}

/** Un pedido que no puede escaparse de la raíz por más `../` que traiga. */
function resolverDentro(raiz: string, ruta: string): string | null {
  const destino = normalize(join(raiz, ruta))
  if (destino !== raiz && !destino.startsWith(raiz + sep)) return null
  return destino
}

function esArchivo(ruta: string): boolean {
  try {
    return statSync(ruta).isFile()
  } catch {
    return false
  }
}

/**
 * Cuánto puede cachear Chromium cada cosa.
 *
 * Sin cabecera de caché, una respuesta es **no cacheable**, y eso no cuesta
 * solo un `read` de disco: el código compilado de V8 se guarda atado a la
 * entrada de caché HTTP, así que un bundle no cacheable se **vuelve a compilar
 * entero en cada arranque**. El de esta app son 5,3 MB de JavaScript, y ese
 * parseo es lo más caro que pasa entre que hacés doble clic y ves algo.
 *
 * El corte es el mismo que usa cualquier build moderno, y acá es seguro por
 * construcción: Expo exporta todo bajo `/_expo/` con el hash del contenido en
 * el nombre, así que un archivo con ese nombre nunca cambia — si cambia el
 * contenido, cambia la URL. `index.html` es lo contrario: es el único nombre
 * fijo y es el que apunta a los hashes nuevos después de una actualización, así
 * que **tiene** que revalidarse o la app quedaría cargando para siempre el
 * bundle de la versión vieja.
 */
function cacheDe(pathname: string): string {
  return pathname.startsWith('/_expo/') ? 'public, max-age=31536000, immutable' : 'no-cache'
}

async function servirArchivo(ruta: string, pathname: string): Promise<Response> {
  const res = await net.fetch(pathToFileURL(ruta).toString())
  /* Se rearma la respuesta en vez de mutar `res.headers`: las cabeceras de una
     Response ya construida son de solo lectura. El cuerpo pasa como stream, sin
     leerse a memoria. */
  const headers = new Headers(res.headers)
  headers.set('cache-control', cacheDe(pathname))
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

export function servirWeb(raiz: string): void {
  const indice = join(raiz, 'index.html')

  protocol.handle(ESQUEMA, async (pedido) => {
    const { pathname } = new URL(pedido.url)
    const destino = resolverDentro(raiz, decodeURIComponent(pathname))

    if (destino && esArchivo(destino)) return servirArchivo(destino, pathname)

    /*
     * El fallback de SPA, con el mismo corte que hace vercel.json en la web:
     * una ruta (`/lista/abc`) cae en index.html y el ruteo lo resuelve el
     * cliente, pero un archivo que no está (`/_expo/static/js/….js`) devuelve
     * 404 y no el HTML.
     *
     * La distinción importa: si a un chunk faltante le contestáramos index.html
     * con 200, el navegador intentaría ejecutar HTML como JavaScript y el error
     * que se vería sería «Unexpected token '<'» —que no dice absolutamente nada
     * sobre lo que pasó— en vez de un 404 con la ruta del archivo que falta.
     */
    const ultimo = pathname.split('/').pop() ?? ''
    if (ultimo.includes('.')) {
      return new Response(`No está: ${pathname}`, {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }

    if (!esArchivo(indice)) {
      return new Response(
        `Falta ${indice}. Corré "npm run build:web" en la raíz del repo antes de abrir el escritorio.`,
        { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } },
      )
    }

    return servirArchivo(indice, '/index.html')
  })
}
