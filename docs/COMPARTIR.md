# Links compartidos: la canción, la lista, el Jam y el perfil

Los links presentan metadatos públicos antes de pedir acceso. Una cuenta
aprobada puede abrir el contenido; ver la tarjeta no autoriza audio ni acceso
a una colección privada.

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
la primera entrega la app y la segunda una tarjeta HTML sin bundle. Es la división que hace
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

En Railway, el shell se lee de `WEB_DIST_DIR/index.html`, generado durante el
build del contenedor. El adaptador conserva una lectura por HTTP de
`/index.html` para entornos sin `WEB_DIST_DIR`, evitando depender de un artefacto
ausente al empaquetar una función. Se cachea por instancia.

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
| Android | `intentFilters` en `app.json`, con `autoVerify`, y perfiles APK/AAB en `eas.json`. Falta publicar `assetlinks.json` con el SHA-256 del certificado de firma para completar la asociación verificada |
| Escritorio | `dnmusic://`, que registra el instalador (`protocols` en `electron-builder.yml`) y, para la AppImage que no instala nada, `setAsDefaultProtocolClient` en el arranque |

En el escritorio el link **no se abre con `loadURL`**: eso recarga el bundle
entero y corta la música. El proceso principal manda la ruta por IPC y navega
expo-router, igual que un toque adentro de la app. En Windows y Linux el primer
link llega en `process.argv`, antes de que exista la ventana, así que
`EntregaDeEnlaces` lo guarda hasta que haya a quién dárselo.

## Compartir una canción

La fila «Compartir» abre `app/compartir.tsx`: una hoja que
mide su contenido (`fitToContents` en iOS, modal centrado en la compu) con la
card musical a la vista y las cuatro acciones debajo. El título y el artista
aparecen una sola vez, dentro de la tarjeta. La previa es pasiva: abrir el menú
no cambia la reproducción. «Crear historia» abre una segunda vista con la
imagen, un botón para compartir o descargar y una salida para volver.
El contenido se desplaza cuando la ventana es baja o el texto grande:

| Fila | Qué hace |
| --- | --- |
| Enviar por chat | La canción completa a un contacto, con reproducción global |
| Compartir el link | `compartirCancion`: publica la tarjeta y ofrece el link |
| Copiar el link | Al portapapeles, sin pasar por ninguna hoja |
| Crear historia | Abre la previa de 1080×1920. Su botón la envía a la hoja del sistema o la descarga en web |

La previa **es el mismo componente** que se fotografía (`ui/TarjetaHistoria`),
encogido con `transform`: lo que se ve es exactamente lo que sale. La canción
viaja por `state/compartir` y no por la URL, como en «Agregar a una lista»:
tiene diez campos y pasarla en la ruta la vuelve ilegible.

## Card musical en chat, compartir y enlace

`ui/TarjetaMusica` adapta la [card de Spell UI](https://spell.sh/docs/spotify-card)
a React Native y web (atribución MIT en `docs/licenses/spell-ui.txt`). La card
tiene un ancho máximo de 325 y un alto mínimo de 112, ampliable con texto grande
nativo. No tiene borde exterior: portada, fondo oscuro desenfocado y vinilo al
pasar el cursor, enfocar o reproducir. La columna de texto tiene ancho explícito,
alineación izquierda, hasta dos líneas de título y una de artista; los textos
que exceden ese espacio usan puntos suspensivos y mantienen su etiqueta accesible.
Una portada que falla tiene respaldo. Respeta Reducir movimiento y detiene
sus animaciones cuando la app pasa a segundo plano.

`ui/CancionCompartida` conecta la portada al motor global de DMusic. Pulsarla
reproduce, pausa o cancela la carga de esa canción; salir del chat conserva el
audio. El título abre el reproductor de la canción actual o su página de enlace.
La página aprobada usa la misma card y deja que `MotorAudio` resuelva el audio,
para que la carga tenga los mismos controles que el resto de la app. Sin cuenta
aprobada, la card muestra los metadatos públicos y la puerta de acceso.

El chat muestra la tarjeta sin una segunda burbuja ni el rótulo automático
repetido. Las dedicatorias y los textos editados se conservan; hora y recibos
quedan debajo. `messageDisplayText` sólo cambia la presentación: el texto
guardado sigue disponible para notificaciones, copia y clientes anteriores.

La previa social de 1200 × 630 y el iframe de 152 px adaptan esa composición.
El iframe sólo abre DMusic; no crea otra sesión de reproducción. La imagen de
historia de 1080 × 1920 mantiene su diseño y su propia previa.

Al pegar un enlace en WhatsApp o Discord, la página entrega título, artista
e imagen mediante [Open Graph](https://ogp.me/). Cada plataforma decide cómo
presentar esos datos: la imagen representa nuestra tarjeta; sus controles y
animaciones funcionan dentro de dnmusic. La URL conserva el dominio actual de
Railway. Usar un dominio propio requiere conectarlo al hosting y actualizar
los orígenes de enlaces y las asociaciones nativas; cambiar los metadatos
por sí solo no cambia la dirección.

## Portapapeles

`src/lib/portapapeles.ts` confirma si la escritura se realizó:

- Electron usa `dnmusicEscritorio.portapapeles.copiar` por IPC y escribe desde
  el proceso principal con la API nativa. Funciona tanto en Windows como Linux;
  los permisos de Chromium para `app://` no sustituyen ese puente.
- Web intenta `navigator.clipboard.writeText` y conserva un textarea como
  respaldo, restaurando el foco al terminar.
- iOS/Android usan `expo-clipboard`. Si falta el módulo o falla, el helper
  devuelve `false` y el llamador puede ofrecer la hoja de compartir.

Copiar y compartir una canción inician la escritura dentro del gesto, antes
de esperar la publicación de metadatos. Una red lenta o un RPC fallido no
impide copiar; compartir espera ese intento antes de abrir la hoja del sistema.
No se anuncia «copiado» cuando la escritura falló.

Pruebas: `tests/portapapeles.test.mjs`,
`desktop/tests/portapapeles-ipc.test.cjs`, `tests/compartir-enlaces.test.mjs`,
`tests/tarjeta-musica.test.mjs` y `tests/tarjeta-musica-integracion.test.mjs`.

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
## Orígenes y compatibilidad de enlaces

Los enlaces nuevos de canciones, listas, Jams y perfiles se generan con
`https://dnmusic-production-c3f4.up.railway.app`. El host retirado de Vercel
sólo se reconoce como entrada histórica en mensajes/deep links; no se publica
en las asociaciones nativas ni se usa para crear invitaciones nuevas.
Reconocer un enlace histórico dentro de la app no mantiene vivo el sitio viejo
si alguien lo abre directamente en un navegador.
Retirar o redirigir el hosting antiguo es una tarea de infraestructura separada
del reconocimiento de enlaces en el código. Ver [repositorio](REPOSITORIO.md).

En escritorio, `recibirArgumentos` entrega la ruta ya validada sin intentar
interpretarla como otra URL. El proceso principal espera el aviso `enlace:listo`
del main frame propio, enviado después de registrar el oyente del router; así
no se pierde el enlace que inició la aplicación. Las recargas vuelven a esperar
ese aviso. Esto tiene pruebas de arranque, segunda instancia y handshake.

Auth, descargas y carátulas públicas admiten el gateway de producción
`envoy-production-2fb6.up.railway.app`, no cualquier dominio Railway. El
empaquetado verifica que el export contenga un origen de Auth/Storage reconocido
antes de crear los instaladores. No basta con tener la variable en el runner.

Al desplegar, verificar las cuatro rutas compartibles, sus URLs canónicas y
el JSON AASA de iOS sin redirección. Eso no equivale a probar una Jam activa
entre dispositivos. Android sigue pendiente de publicar `assetlinks.json`;
recibir el shell HTML no constituye una asociación Android válida.
