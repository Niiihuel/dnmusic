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
    <meta name="description" content="Un jardín para los dos" />
    <!-- iOS ignora buena parte del manifest y necesita estos meta propios para
         abrir sin la barra de Safari y usar el ícono correcto. -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Flora" />
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
const required = ['manifest.json', 'apple-touch-icon', 'viewport-fit=cover', 'lang="es-AR"']
const missing = required.filter((needle) => !html.includes(needle))
if (missing.length) {
  console.error(`✗ Faltaron etiquetas tras la inyección: ${missing.join(', ')}`)
  process.exit(1)
}

console.log('✓ Etiquetas de PWA inyectadas en', INDEX)
