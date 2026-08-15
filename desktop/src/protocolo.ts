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

function servirArchivo(ruta: string): Promise<Response> {
  return net.fetch(pathToFileURL(ruta).toString())
}

export function servirWeb(raiz: string): void {
  const indice = join(raiz, 'index.html')

  protocol.handle(ESQUEMA, async (pedido) => {
    const { pathname } = new URL(pedido.url)
    const destino = resolverDentro(raiz, decodeURIComponent(pathname))

    if (destino && esArchivo(destino)) return servirArchivo(destino)

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

    return servirArchivo(indice)
  })
}
