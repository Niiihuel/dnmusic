# Fragmentos de canción (estilo Instagram)

Decisión sobre cómo adjuntar un pedacito de canción a una flor.

## Resumen

| Opción | Audio | Legal | Anda en la PWA | Necesita backend | Costo |
|---|---|---|---|---|---|
| **iTunes Search / Deezer** | 30s, archivo directo | Zona gris (ver abajo) | ✅ | ❌ | $0 |
| Embed de Spotify (IFrame API) | 30s en móvil | ✅ | ✅ | ❌ | $0 |
| YouTube IFrame + Data API | Completa | ✅ | ✅ | ❌ | $0 (cuota) |
| youtubei.js (lo que usa zuno) | Completa | ❌ Viola ToS | ❌ | ✅ Proxy propio | Servidor |

**Elegido: iTunes Search API** para el audio que suena bajo la floración, más un
enlace opcional a Spotify/YouTube para "escuchar completa".

## Por qué no Spotify

El `preview_url` de 30 segundos de la Web API está **deprecado desde el 27 de
noviembre de 2024** para toda app registrada después de esa fecha. Devuelve
`null`, incluso con usuario autenticado y en modo tester. Dany sería una app
nueva, así que esa puerta está cerrada de entrada.

Reproducción completa exige Spotify Premium *del oyente* + el Web Playback SDK
(navegador) o App Remote (nativo). No hay SDK oficial para React Native, el
audio sale por la app de Spotify y los términos prohíben explícitamente
descargar/cachear audio o sincronizarlo con contenido visual — que es
exactamente lo que hace la floración.

**El embed sí es legítimo** (`open.spotify.com/embed/track/{id}` + IFrame API),
pero: en móvil da 30s igual que iTunes, es un `<iframe>` que no se puede estilar
ni ocultar, y no se puede sincronizar con la animación. Sirve como botón
"escuchar completa", no como banda sonora.

## Por qué no YouTube Music vía `youtubei.js`

Es lo que hace zuno y funciona — pero funciona **porque zuno es Tauri**. De su
propia documentación (`docs/backend.md`, `docs/architecture.md`):

> "the WebView can't set `Cookie`/`Origin` headers or bypass CORS, and Innertube
> needs both."
>
> "All network traffic to Google goes through Rust (`proxy_http_request`) so the
> WebView's CORS/cookie rules never apply."

Tres problemas para nosotros:

1. **CORS.** Sin un backend Rust que haga las requests, `youtubei.js` no corre
   en una PWA. Habría que levantar y pagar un proxy propio que además relaye el
   audio — que es justo la parte más visible de la violación de términos.
2. **Fragilidad.** zuno necesita `bgutils-js` (BotGuard/PoToken) y `googlevideo`
   porque YouTube rompe esto activamente. Es una carrera armamentística que hay
   que mantener.
3. **Términos.** YouTube prohíbe acceder al contenido por medios distintos al
   reproductor o la API oficial. El propio zuno se describe como "unofficial".

**La alternativa legítima de YouTube sí existe**: el IFrame Player API oficial,
con búsqueda vía YouTube Data API v3. Reproduce la canción completa, acepta
`start`/`end`, y es gratis (10.000 unidades/día; cada búsqueda cuesta 100 → 100
búsquedas diarias, de sobra para dos personas). La contra es la misma que
Spotify: es un iframe visible que no se puede sincronizar finamente con la
floración. Queda como mejora futura para "escuchar completa".

## Lo que implementamos

**iTunes Search API** — gratis, sin API key, sin registro:

```
https://itunes.apple.com/search?term=<query>&media=music&entity=song&limit=20
```

Devuelve por track: `trackName`, `artistName`, `artworkUrl100`, y `previewUrl`
(m4a de 30s). Al ser un archivo de audio normal, `expo-av` lo controla
completamente: recorte por `startMs`, fade in/out, y sincronía exacta con la
apertura de la flor.

**Fallback: Deezer API** (`api.deezer.com/search`), también 30s y sin auth, por
si iTunes no tiene un tema.

Advertencia honesta: los términos de Apple dicen que los previews son para
*promocionar contenido de la store* y deberían mostrarse junto a un badge de
Apple Music. Para una app privada de dos personas el riesgo es prácticamente
nulo, pero conviene saberlo. Si algún día Dany se hiciera pública, esta pieza
habría que reemplazarla por el embed de Spotify o el IFrame de YouTube.

## Modelo de datos

Ver `SongSnippet` en `src/models/message.ts`. Se guarda dentro del documento del
mensaje, en el campo `song`. Las reglas de Firestore usan `hasAll` (no
`hasOnly`) en el `create`, así que el campo extra no requiere tocarlas.

## El inicio es de cada persona

La portada de YouTube Music es la misma para todo el mundo, y hasta acá era
casi todo el inicio. Ahora el inicio se arma desde **tu historial** (`plays`,
que desde la migración `escuchas_con_tapa` guarda también la tapa y la
colección que sonaba), en este orden y como en Spotify:

1. El saludo por la hora, con tu nombre.
2. La grilla de accesos: las colecciones que **usaste** últimamente —tus
   listas, tus mixes, la radio— más «Tus me gusta». No son las listas que
   tenés sino las que sonaron; salen de `origenesRecientes`.
3. «Seguir escuchando»: lo último que sonó, sin repetir (`ultimasEscuchas`).
4. «Hecho para vos»: la radio y los mixes de siempre.
5. «Tus artistas»: los que más tiempo sonaron (`artistasRecientes`), con la
   tapa de la canción suya que más escuchaste como cara.
6. «Porque escuchaste X»: los parecidos de tu más escuchado, que publica
   YouTube en su ficha («Fans might also like»). Ninguna inferencia propia.
7. Las filas de tus géneros y, al final, la portada de YouTube Music.

**Todo carga de una vez.** `useInicio` (en `src/ui/HomeFeed.tsx`) lanza los
nueve pedidos en paralelo, espera a todos —con un tope de doce segundos por
pedido, después del cual esa fila va vacía— y recién entonces dibuja la
portada entera. Antes cada fila aparecía cuando llegaba y la pantalla se
armaba a saltos. Cada sección se calla si no tiene con qué: una cuenta nueva ve
el saludo y la portada.

**Todo tiene tapa.** Los mixes toman la carátula de tus corazones y tus
listas, y si el artista entró solo por tiempo escuchado, la del historial
(`conTapa`). Las escuchas viejas se rellenaron con la copia del bucket
`artwork` en la misma migración. Y `proxiedImage` deja pasar directo lo que no
es de Google: una tapa de nuestro Storage no necesita el proxy.
