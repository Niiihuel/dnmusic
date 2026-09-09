import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

/**
 * La tarjeta del preview: `api/tarjeta.ts`.
 *
 * Es la única parte del sistema que arma HTML con datos que vienen de la base,
 * así que lo que más se prueba acá es el escapado: un título con comillas o con
 * una etiqueta adentro no puede salirse de su atributo. Lo demás es el
 * contrato con `scripts/inject-pwa.mjs` —los marcadores— y que un fallo de la
 * base no rompa el link.
 */
const SHELL = `<!DOCTYPE html>
<html lang="es-AR" data-theme="dark"><head>
<meta charset="utf-8" />
<!-- dany:tarjeta -->
<title>dnmusic</title>
<meta property="og:title" content="dnmusic" />
<!-- /dany:tarjeta -->
</head><body><div id="root"></div></body></html>`

function cargar({ tarjeta, shellRota = false, baseRota = false }) {
  const { outputText } = ts.transpileModule(readFileSync('api/tarjeta.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const exports = {}
  const pedidos = []
  const contexto = {
    exports,
    require: () => ({}),
    process: {
      env: {
        EXPO_PUBLIC_SUPABASE_URL: 'https://proyecto.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-de-prueba',
      },
    },
    URL,
    fetch: async (url, init) => {
      pedidos.push({ url: String(url), init })
      if (String(url).endsWith('/index.html')) {
        if (shellRota) throw new Error('sin shell')
        return { ok: true, text: async () => SHELL }
      }
      if (baseRota) throw new Error('sin base')
      return { ok: true, json: async () => tarjeta ?? null }
    },
  }
  vm.runInNewContext(outputText, contexto)
  return { handler: exports.default, pedidos }
}

/** Un `res` de mentira que junta lo que se le escribió. */
function respuesta() {
  const r = {
    statusCode: 200,
    headers: {},
    cuerpo: '',
    setHeader(k, v) {
      r.headers[k.toLowerCase()] = v
    },
    end(c) {
      r.cuerpo = c ?? ''
    },
  }
  return r
}

const pedido = (ruta) => ({ url: ruta, headers: { host: 'dnmusic-app.vercel.app' } })

test('un tipo que no es compartible no llega a la base', async () => {
  const { handler, pedidos } = cargar({ tarjeta: null })
  const res = respuesta()
  await handler(pedido('/api/tarjeta?que=ajustes&id=abc'), res)
  assert.equal(res.statusCode, 404)
  assert.equal(pedidos.length, 0, 'ni siquiera se le pregunta a la base')
})

test('la tarjeta reemplaza el bloque marcado y deja un solo título', async () => {
  const { handler } = cargar({
    tarjeta: { titulo: 'Tema', subtitulo: 'Artista', tapa: 'artwork/abc.jpg', duracion_ms: 1000 },
  })
  const res = respuesta()
  await handler(pedido('/api/tarjeta?que=cancion&id=abc123'), res)
  assert.equal((res.cuerpo.match(/<title>/g) ?? []).length, 1)
  assert.match(res.cuerpo, /<title>Tema — dnmusic<\/title>/)
  assert.match(res.cuerpo, /property="og:title" content="Tema"/)
  assert.match(res.cuerpo, /content="Artista · Escuchalo en dnmusic"/)
  assert.match(
    res.cuerpo,
    /property="og:image" content="https:\/\/proyecto\.supabase\.co\/storage\/v1\/object\/public\/artwork\/abc\.jpg"/,
  )
  assert.match(res.cuerpo, /og:url" content="https:\/\/dnmusic-app\.vercel\.app\/cancion\/abc123"/)
  /* La app tiene que seguir arrancando: esto es el shell, no una página nueva. */
  assert.match(res.cuerpo, /<div id="root">/)
})

test('un título con comillas o etiquetas no se sale de su atributo', async () => {
  const { handler } = cargar({
    tarjeta: {
      titulo: '"><script>alert(1)</script>',
      subtitulo: "O'Hara & <b>",
      tapa: null,
    },
  })
  const res = respuesta()
  await handler(pedido('/api/tarjeta?que=cancion&id=abc123'), res)
  assert.ok(!res.cuerpo.includes('<script>alert(1)'), 'nada de script sin escapar')
  assert.match(res.cuerpo, /&quot;&gt;&lt;script&gt;/)
  assert.match(res.cuerpo, /O&#39;Hara &amp; &lt;b&gt;/)
})

test('sin tarjeta se sirve la app con el título de siempre', async () => {
  const { handler } = cargar({ tarjeta: null })
  const res = respuesta()
  await handler(pedido('/api/tarjeta?que=lista&id=nueva'), res)
  assert.match(res.cuerpo, /<title>dnmusic<\/title>/)
  assert.match(res.cuerpo, /<div id="root">/)
})

test('si la base no contesta, el link abre igual', async () => {
  const { handler } = cargar({ tarjeta: null, baseRota: true })
  const res = respuesta()
  await handler(pedido('/api/tarjeta?que=cancion&id=abc123'), res)
  assert.equal(res.statusCode, 200)
  assert.match(res.cuerpo, /<div id="root">/)
})

test('el embed es una página suelta, sin bundle y sí incrustable', async () => {
  const { handler } = cargar({
    tarjeta: { titulo: 'Tema', subtitulo: 'Artista', tapa: 'https://cdn.test/x.jpg' },
  })
  const res = respuesta()
  await handler(pedido('/api/tarjeta?modo=embed&que=cancion&id=abc123'), res)
  assert.ok(!res.cuerpo.includes('id="root"'), 'el embed no trae la app')
  assert.match(res.headers['content-security-policy'], /frame-ancestors \*/)
  assert.match(res.cuerpo, /href="https:\/\/dnmusic-app\.vercel\.app\/cancion\/abc123"/)
  assert.match(res.cuerpo, /background-image:url\('https:\/\/cdn\.test\/x\.jpg'\)/)
})

test('el shell se pide una sola vez por instancia', async () => {
  const { handler, pedidos } = cargar({ tarjeta: null })
  await handler(pedido('/api/tarjeta?que=cancion&id=uno'), respuesta())
  await handler(pedido('/api/tarjeta?que=cancion&id=dos'), respuesta())
  assert.equal(pedidos.filter((p) => p.url.endsWith('/index.html')).length, 1)
})
