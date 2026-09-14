# Tarjetas de enlaces compartidos

`api/tarjeta.ts` sirve el HTML de las rutas públicas con Open Graph y Twitter
Card. El mismo endpoint acepta `modo=imagen` para el PNG de 1200 × 630 y
`modo=oembed` para los consumidores que descubren oEmbed. El iframe existente
`/embed/:que/:id` abre DMusic; no ofrece audio público ni reproducción automática.

La imagen horizontal se dibuja en `src/server/imagenTarjeta.ts`: portada, título,
artista y marca. Se consultan los mismos datos públicos de `tarjeta_enlace`, sin
service-role ni acceso a listas/perfiles privados. Las portadas sólo se descargan
de Storage público del proyecto o de los CDN musicales permitidos, sin seguir
redirecciones, con límite de tiempo y de tamaño. Si falta o falla la imagen, se
conservan el título y artista. La dependencia `@vercel/og` queda fijada en 0.8.6:
la 1.0.2 falló al cargar HarfBuzz en Node ESM durante las pruebas de render real.

Compartir y copiar una canción publican sus metadatos antes de entregar el link.
Un error del RPC se propaga al llamador; esos dos flujos conservan la posibilidad
de copiar aunque la publicación falle. Los previews inexistentes no se cachean;
los válidos se revalidan a los cinco minutos, sin stale-while-revalidate. Las apps
receptoras administran sus propias cachés y el aspecto final del mensaje.

Verificación: `tests/tarjeta-preview.test.mjs`, `tests/imagen-tarjeta.test.mjs`
y `tests/compartir-enlaces.test.mjs`. Los cambios del servidor requieren desplegar
la web para que Discord o Mensajes puedan solicitar las nuevas tarjetas.
