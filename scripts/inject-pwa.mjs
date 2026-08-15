#!/usr/bin/env node
/**
 * Inyecta las etiquetas de PWA en el index.html exportado.
 *
 * Por qué un script y no `app/+html.tsx`: ese archivo solo lo usa el static
 * rendering de Expo Router. Con `web.output: "single"` — que es lo que queremos,
 * una sola index.html con ruteo en cliente para que los deep links no dependan
 * de rewrites del host — Expo genera su propia plantilla y +html.tsx se ignora.
 * Verificado exportando con la caché limpia: las etiquetas no aparecían.
 *
 * Es idempotente: si ya inyectó, no duplica.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIST = process.argv[2] ?? 'dist'
const INDEX = join(DIST, 'index.html')
const MARKER = '<!-- dany:pwa -->'

/**
 * Cómo se presenta un link de la app cuando lo pegás en otro lado.
 *
 * Es lo único que ve alguien **antes** de entrar: los links de Jam se comparten
 * por WhatsApp y por Discord, y ahí el preview es la app entera. Tiene que decir
 * qué es esto, no de dónde viene — la descripción anterior («Un jardín para los
 * dos») quedó de cuando esto era una app de mensajes para dos personas.
 *
 * El dominio va absoluto porque las tarjetas lo piden así: los crawlers no
 * resuelven rutas relativas, y con una ruta suelta el preview sale sin imagen.
 */
const SITIO = process.env.SITE_URL ?? 'https://dnmusic-app.vercel.app'
const TITULO = 'dnmusic'
const DESCRIPCION =
  'Escuchá tu música, armá tus listas y ponete en Jam: la misma canción, al mismo tiempo, con quien quieras.'

if (!existsSync(INDEX)) {
  console.error(`✗ No existe ${INDEX}. ¿Corriste "expo export --platform web" antes?`)
  process.exit(1)
}

let html = readFileSync(INDEX, 'utf8')

if (html.includes(MARKER)) {
  console.log('✓ Las etiquetas de PWA ya estaban inyectadas.')
  process.exit(0)
}

const HEAD_TAGS = `${MARKER}
    <link rel="manifest" href="/manifest.json" />
    <meta name="description" content="${DESCRIPCION}" />
    <!-- La tarjeta del link: es lo que se ve en WhatsApp y en Discord cuando
         alguien pasa una invitación a un Jam. -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${TITULO}" />
    <meta property="og:title" content="${TITULO}" />
    <meta property="og:description" content="${DESCRIPCION}" />
    <meta property="og:url" content="${SITIO}" />
    <meta property="og:image" content="${SITIO}/icons/icon-512.png" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${TITULO}" />
    <meta name="twitter:description" content="${DESCRIPCION}" />
    <meta name="twitter:image" content="${SITIO}/icons/icon-512.png" />
    <!-- iOS ignora buena parte del manifest y necesita estos meta propios para
         abrir sin la barra de Safari y usar el ícono correcto. -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="${TITULO}" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <style>
      body { background-color: #121212; overscroll-behavior-y: none; }
      html[data-theme='light'] body { background-color: #FFFFFF; }
    </style>
  </head>`

// viewport-fit=cover para que el notch no coma la UI en modo standalone;
// maximum-scale=1 evita que iOS haga zoom al enfocar un input.
html = html.replace(
  /<meta name="viewport"[^>]*>/,
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />',
)

html = html.replace('<html lang="en">', '<html lang="es-AR" data-theme="dark">')
html = html.replace('</head>', HEAD_TAGS)

writeFileSync(INDEX, html)

// Chequeo de que quedó todo, en vez de confiar en que los replace matchearon.
const required = [
  'manifest.json',
  'apple-touch-icon',
  'viewport-fit=cover',
  'lang="es-AR"',
  'og:description',
]
const missing = required.filter((needle) => !html.includes(needle))
if (missing.length) {
  console.error(`✗ Faltaron etiquetas tras la inyección: ${missing.join(', ')}`)
  process.exit(1)
}

console.log('✓ Etiquetas de PWA inyectadas en', INDEX)
