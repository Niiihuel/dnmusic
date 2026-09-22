# Links compartidos: la canción, la lista, el Jam y el perfil

Pasar algo por WhatsApp y que del otro lado se pueda escuchar.

Antes de esto había dos links —el del Jam y el de una lista— y los dos llegaban
igual de mal: quien los abría sin la sesión puesta caía en el login sin ver
**qué** le habían mandado, y el preview del mensaje mostraba el ícono de la app
y la palabra «dnmusic» para cualquier URL. Una canción directamente no tenía
link: mandarla terminaba en una captura de pantalla.

## Enviar una canción dentro de dnmusic

La hoja de una canción incluye **Enviar por chat**. Abre un selector de
contactos existentes y envía un adjunto reproducible con título, artista y
portada; no necesita copiar un enlace. El destinatario escucha la canción
completa desde la conversación, usando el reproductor principal.

El adjunto se almacena en `messages.song` con `kind: 'track'`; los fragmentos
mantienen su formato anterior. El texto acompaña al adjunto para la bandeja,
las notificaciones y los clientes anteriores. No se publica una tarjeta
externa ni se resuelve el audio durante el envío. Las políticas del chat
siguen controlando quién puede enviar y leer.

Implementación: `app/compartir-contactos.tsx`,
`src/services/compartirPorChat.ts`, `src/models/sharedSong.ts` y
`src/ui/CancionCompartida.tsx`. El selector usa `ListaAgrupada.ios` en iOS.
Estado de la migración y validación: [MIGRACION-IOS.md](MIGRACION-IOS.md).

## Las cuatro cosas y sus dos URLs

| | Link | Para incrustar |
| --- | --- | --- |
| Canción | `/cancion/<videoId>` | `/embed/cancion/<videoId>` |
| Lista | `/lista/<uuid>` | `/embed/lista/<uuid>` |
| Jam | `/jam/<código>` | `/embed/jam/<código>` |
| Perfil | `/perfil/<usuario>` | `/embed/perfil/<usuario>` |

El nombre de cada una **es** el primer tramo de la URL y **es** la carpeta de su
ruta en expo-router. Que sean el mismo string es lo que hace que el mismo link
lo entiendan el navegador, el universal link de iOS, el `dnmusic://` del
escritorio y la función que arma la tarjeta, sin tablas de traducción.

La versión `/embed/` es una página aparte y no la misma con un parámetro porque
lo que sirve cada una no se parece: la primera entrega la app entera —5,8 MB de
bundle— y la segunda una tarjeta suelta de 1,8 KB. Es la división que hace
Spotify entre `open.spotify.com/track/…` y `…/embed/track/…`.

## Dónde está cada cosa

| Archivo | Qué hace |
| --- | --- |
| `src/lib/compartir.ts` | El dominio, los links, el reconocedor y la hoja de compartir |
| `src/lib/compartirLista.ts` | Lo propio de una lista: que tenga **dos** links |
| `src/lib/invitarJam.ts` | Lo propio del Jam: que además del link haya un código |
| `src/lib/abrirEnLaApp.ts` | El intento de saltar a la app instalada |
| `src/services/compartidos.ts` | Leer una tarjeta y publicar la de una canción |
| `src/ui/Aterrizaje.tsx` | Lo que ve quien llega sin estar adentro |
| `app/cancion/[id].tsx` | La canción por link, ya con cuenta |
| `api/tarjeta.ts` | El preview del lado del servidor y la página del embed |
| `scripts/inject-pwa.mjs` | Deja el bloque marcado que esa función reemplaza |
| `desktop/src/enlaces.ts` | Los `dnmusic://` que le llegan al escritorio |
| `supabase/migrations/20260920000000_tarjetas_de_enlace.sql` | La tabla, los dos RPC y la excepción en la reja |

## Qué ve quien lo recibe

```
   el link                        con cuenta aprobada → la pantalla de siempre
      │                           
      ▼                           
   ¿tiene la app instalada?  ─sí→  iOS la abre solo (universal link)
      │                            PC: «Abrir en la app» prueba dnmusic://
      no
      ▼
   la tarjeta: tapa, título, artista        ← ui/Aterrizaje
   [ Escuchar en dnmusic ]  → entrar, y volver acá
```

Las cuatro rutas de link son **las únicas de la app que se dibujan sin cuenta
aprobada**, y para eso están declaradas afuera de `<Stack.Protected>` en
`app/_layout.tsx`: adentro no se montan, y el gate mandaba al login antes de que
se viera nada. Lo cubre `tests/acceso-session.test.mjs`, que exige que sean esas
cuatro y solo esas, y que cada una caiga en `Aterrizaje`.

**Que la tarjeta se vea no abre la reproducción.** La tarjeta son cinco campos de
presentación; escuchar, ver el perfil entero o entrar al Jam siguen pidiendo
cuenta aprobada, y eso lo hace cumplir la RLS, no la pantalla.

## De dónde salen los datos de la tarjeta

`public.tarjeta_enlace(tipo, id)` es `security definer` y tiene su excepción en
`check_app_access` —la misma forma que ya tenían `auth_email_for_username` y
`access_status`—. Lee **solo** de filas que ya eran compartibles:

- una lista con `visibilidad = 'publica'`;
- un perfil con `visibility = 'publico'`;
- un Jam `activo`, llamado por su propio código de invitación (tener el código
  ya es la invitación: la tarjeta no agrega nada que el link no diera);
- una canción **publicada**.

La canción es el caso raro porque no es una fila de ninguna tabla: vive adentro
de las listas que la tienen. Por eso compartirla llama a `publicar_cancion`, que
copia su título, su artista y su tapa a `public.canciones_compartidas`. El link
muestra exactamente lo que quien compartió decidió mostrar, y un id inventado no
devuelve nada: no hay forma de recorrer el catálogo probando.

`tapa` vuelve como `bucket/camino` o como una URL absoluta del CDN, nunca como
una URL de Storage ya armada: la base no sabe con qué origen la van a leer, y
local, preview y producción no comparten uno. La componen
`services/compartidos.ts` y `api/tarjeta.ts`, cada uno de su lado.

## El preview de WhatsApp

El sitio es una sola `index.html` con ruteo en cliente (`web.output: "single"`),
así que no puede tener meta tags distintos por URL: el crawler no ejecuta
JavaScript. `api/tarjeta.ts` lo resuelve sirviendo **la misma** `index.html` con
el bloque entre `<!-- dany:tarjeta -->` y su cierre reemplazado por los datos de
lo que se compartió. La app arranca igual; el crawler se lleva la tapa.

El shell se pide por HTTP (`/index.html`) en vez de leerse del disco: ese archivo
lo escribe el build, y hacer que el empaquetado de la función dependa de algo que
otro paso del mismo build genera es una carrera que se pierde en silencio. Se
cachea por instancia.

El `<title>` va **adentro** de los marcadores, y `inject-pwa.mjs` borra el que
exporta Expo: si quedaran dos, el crawler lee el primero —el genérico— y toda la
tarjeta por canción se pierde sin que nada falle a la vista. El script lo
verifica y corta el build si no se cumple.

Nada que venga de la base entra en el HTML sin pasar por `escapar()`. Lo cubre
`tests/tarjeta-preview.test.mjs`.

## Abrir la app instalada

**No hay forma de preguntarle al sistema si una app está instalada** — sería una
huella digital perfecta—. Lo único que se puede hacer es intentar abrir el
esquema propio y mirar si la pestaña se va a segundo plano.

| | Cómo |
| --- | --- |
| iOS | Universal link. El `apple-app-site-association` declara los cuatro tramos; el sistema abre la app sin pasar por Safari. `/embed/*` está excluido a propósito |
| Android | `intentFilters` en `app.json`, con `autoVerify`. **Todavía inerte**: no hay perfil de Android en `eas.json` ni `assetlinks.json`, que necesita el SHA-256 del certificado de firma de EAS |
| Escritorio | `dnmusic://`, que registra el instalador (`protocols` en `electron-builder.yml`) y, para la AppImage que no instala nada, `setAsDefaultProtocolClient` en el arranque |

En el escritorio el link **no se abre con `loadURL`**: eso recarga el bundle
entero y corta la música. El proceso principal manda la ruta por IPC y navega
expo-router, igual que un toque adentro de la app. En Windows y Linux el primer
link llega en `process.argv`, antes de que exista la ventana, así que
`EntregaDeEnlaces` lo guarda hasta que haya a quién dárselo.

## Compartir una canción: una hoja, no dos filas de menú

El menú tenía **dos** filas de compartir: «Compartir», que abría la hoja del
sistema con el link, y «Compartir historia», que se quedaba unos segundos
pensando y de golpe abría **otra** hoja del sistema con una imagen que nadie
había visto. Que la imagen saliera linda o rota se descubría recién en
Instagram, con la historia ya a medio publicar.

Ahora hay **una** fila —«Compartir»— y abre `app/compartir.tsx`: una hoja que
mide su contenido (`fitToContents` en iOS, modal centrado en la compu) con la
tarjeta a la vista y las tres salidas debajo, como filas de una lista agrupada:

| Fila | Qué hace |
| --- | --- |
| Compartir la historia | La imagen de 1080×1920 a la hoja del sistema. En la web la descarga |
| Compartir el link | `compartirCancion`: publica la tarjeta y ofrece el link |
| Copiar el link | Al portapapeles, sin pasar por ninguna hoja |

La previa **es el mismo componente** que se fotografía (`ui/TarjetaHistoria`),
encogido con `transform`: lo que se ve es exactamente lo que sale. La canción
viaja por `state/compartir` y no por la URL, como en «Agregar a una lista»:
tiene diez campos y pasarla en la ruta la vuelve ilegible.

## La tarjeta de la historia

Mide 1080×1920 y se dibuja dos veces —una vista de React Native que el teléfono
fotografía y un canvas en la web—, pero sus medidas viven **una sola vez** en
`ui/tarjetaHistoria.ts`. Mientras estaban adentro de cada dibujo, cambiar el
diseño era cambiarlo dos veces y descubrir en la cuarta captura que no
coincidían.

La regla que la ordena es la de toda la app: **todo apoyado en el mismo margen,
a la izquierda**. La versión anterior centraba absolutamente todo —rótulo,
tapa, título, artista, barra, sello— y una columna de seis cosas centradas no
tiene composición: tiene simetría, que es otra cosa.

Se fueron dos piezas:

- **«AHORA SUENA» en versalitas espaciadas**, por lo mismo que se fueron de los
  botones (ver [el sistema de diseño](DESIGN.md)): Apple no grita en ningún
  control, y un rótulo así arriba de todo se lee como una plantilla gratuita.
- **La barra de reproducción falsa**, con su perilla y sus dos relojes
  inventados a un 38% de la canción. Decía «esto es música» diciendo una
  mentira —esa canción no está en ese segundo—, y la app tiene una regla sobre
  eso: nunca mostrar un estado que no es.

En su lugar entró el **código escaneable**, que es lo que arregla el problema
que este mismo documento marcaba: la historia era linda y no llevaba a ningún
lado. El código codifica `/cancion/<videoId>`, así que la foto vuelve a ser un
link — es para lo que existen los códigos de Spotify. La tarjeta se publica
antes de armar la imagen, no en paralelo: quien escanea llega en segundos, y
una tarjeta publicada después de que alguien llegó no sirve de nada.

El fondo es la portada desenfocada, con el color de la tapa por encima cuando
se lo puede leer (`lib/colorPortada`) y un velo más oscuro arriba y abajo, como
la viñeta de la portada de un disco. Sin carátula, la tapa muestra el sello de
la app apagado en vez de un cuadrado negro.
# Revisión de enlaces — 22 de septiembre de 2026

Los enlaces nuevos de canciones, listas, Jams y perfiles se generan con
`https://dnmusic-production-c3f4.up.railway.app`. El host retirado de Vercel
sólo se reconoce como entrada histórica en mensajes/deep links; no se publica
en las asociaciones nativas ni se usa para crear invitaciones nuevas.
Reconocer un enlace histórico dentro de la app no mantiene vivo el sitio viejo
si alguien lo abre directamente en un navegador.
En la comprobación del 22/09 el sitio de Vercel todavía respondió 200 y conservó
una URL canónica de Vercel, sin redirigir a Railway. La redirección del hosting
antiguo es una tarea de infraestructura separada de estos cambios de código.

En escritorio, `recibirArgumentos` entrega la ruta ya validada sin intentar
interpretarla como otra URL. El proceso principal espera el aviso `enlace:listo`
del main frame propio, enviado después de registrar el oyente del router; así
no se pierde el enlace que inició la aplicación. Las recargas vuelven a esperar
ese aviso. Esto tiene pruebas de arranque, segunda instancia y handshake.

Auth, descargas y carátulas públicas admiten el gateway de producción
`envoy-production-2fb6.up.railway.app`, no cualquier dominio Railway. El
empaquetado verifica que el export contenga un origen de Auth/Storage reconocido
antes de crear los instaladores. No basta con tener la variable en el runner.

La comprobación HTTP de producción verificó las cuatro rutas compartibles y
sus URLs canónicas, y el JSON AASA de iOS sin redirección. No equivale a probar
una Jam activa entre dos dispositivos. Android sigue pendiente del certificado
de firma y de publicar `assetlinks.json`: hoy esa ruta devuelve el shell HTML,
no una asociación Android válida. No declarar verificación automática completa.
