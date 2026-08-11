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
