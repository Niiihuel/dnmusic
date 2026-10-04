# Tarjetas de enlaces compartidos

`api/tarjeta.ts` sirve el HTML de las rutas públicas con Open Graph y Twitter
Card. El mismo endpoint acepta `modo=imagen` para el PNG de 1200 × 630 y
`modo=oembed` para los consumidores que descubren oEmbed. El iframe existente
`/embed/:que/:id` abre DMusic; no ofrece audio público ni reproducción automática.

La imagen horizontal se dibuja en `src/server/imagenTarjeta.ts`: portada, vinilo,
fondo desenfocado y título/artista a la derecha, con la marca de DMusic. El
iframe usa la misma composición compacta y un único link accesible. Se consultan
los mismos datos públicos de `tarjeta_enlace`, sin
service-role ni acceso a listas/perfiles privados. Las portadas sólo se descargan
de Storage público del proyecto o de los CDN musicales permitidos, sin seguir
redirecciones, con límite de tiempo y de tamaño. Si falta o falla la imagen, se
conservan el título y artista. La dependencia `@vercel/og` queda fijada en 0.8.6:
la 1.0.2 falló al cargar HarfBuzz en Node ESM durante las pruebas de render real.

Copiar y compartir una canción inician la escritura del enlace dentro del gesto,
antes de esperar la publicación de metadatos. Compartir espera ese intento de
publicación antes de abrir la hoja del sistema; iOS usa el portapapeles nativo.
La publicación fallida conserva la posibilidad de copiar. Los previews
inexistentes no se cachean;
los válidos se revalidan a los cinco minutos, sin stale-while-revalidate. Las apps
receptoras administran sus propias cachés y el aspecto final del mensaje.

El iframe mantiene 152 px de alto y oEmbed declara 560 × 152. Su CSP permite
incrustarlo, sin scripts ni almacenamiento propio. `allow-popups-to-escape-sandbox`
hace que la pestaña de la app abierta por el link no herede ese bloqueo. El link
lleva `noopener noreferrer` y admite foco de teclado. No contiene controles de
audio que prometan reproducir dentro del sitio receptor.

Verificación: `tests/tarjeta-preview.test.mjs`, `tests/imagen-tarjeta.test.mjs`
y `tests/compartir-enlaces.test.mjs`. Los cambios del servidor requieren desplegar
la web para que Discord o Mensajes puedan solicitar las nuevas tarjetas.
