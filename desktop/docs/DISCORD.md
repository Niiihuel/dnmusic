# Discord Rich Presence en escritorio

El cliente Electron implementa Discord IPC local en `src/discord-presence.ts`, con registro IPC seguro en `src/discord-ipc.ts` y un puente limitado en `src/preload.ts`. Publica actividad **Listening (2)** con título, artista, progreso, carátula pública opcional y botón a la canción. La UI y la selección de escucha autorizada viven en la app compartida, fuera de `desktop/`.

La integración queda desactivada de forma predeterminada. No se ha registrado una aplicación ni se ha inventado una Application ID. El usuario todavía no tiene una aplicación Discord; la publicación real y la validación visual quedan pendientes de ese ID.

## Activación

1. Crear una aplicación propia en el [Developer Portal](https://discord.com/developers/applications) y elegir su nombre público: Discord usa esa identidad para la actividad.
2. Copiar **Application ID** de General Information. Es un identificador público. No copiar Client Secret, Bot Token ni credenciales.
3. Abrir el cliente Discord de escritorio e iniciar sesión en él. En Discord, permitir compartir la actividad en sus ajustes de privacidad de actividad; la presentación final depende también de esos ajustes.
4. En los ajustes Discord de dnmusic, introducir Application ID y habilitar explícitamente compartir la escucha. La UI guarda el consentimiento; main comienza desactivado en cada arranque y sólo recibe configuración mediante el puente propio.
5. Reproducir audio y comprobar que aparece la canción correcta en otro perfil/cliente Discord. Pausar, cambiar canción, buscar otra posición, cerrar sesión y desactivar la opción: comprobar retirada y actualización. Probar también Discord cerrado y abierto posteriormente.

Este alcance no requiere bot, secreto, token ni intercambio OAuth. No añade lectura de mensajes, amigos, acceso a servidores ni invitaciones Jam. Discord documenta [Rich Presence sin autenticación](https://docs.discord.com/developers/discord-social-sdk/development-guides/setting-rich-presence#rich-presence-without-authentication) mediante su cliente local y una Application ID válida.

## Contrato del renderer

```ts
window.dnmusicEscritorio.discord.estado(): Promise<EstadoDiscord>
window.dnmusicEscritorio.discord.configurar({ enabled, applicationId }): Promise<EstadoDiscord>
window.dnmusicEscritorio.discord.publicar(activity | null): Promise<EstadoDiscord>
window.dnmusicEscritorio.discord.alCambiar(callback): () => void
```

`EstadoDiscord` contiene `{enabled, applicationId, status, error?}`. Los estados son `disabled`, `unconfigured`, `disconnected`, `connecting`, `ready`, `published`, `error`. **Published requiere respuesta ACK con el nonce del comando**; abrir el socket no cuenta como publicación confirmada. No garantiza que otro usuario vea la actividad si los ajustes de Discord la ocultan.

`ListeningActivity` contiene `{title, artist, durationMs, positionMs, updatedAt, expiresAt, trackUrl?, artworkUrl?}`. El renderer debe suministrar únicamente una escucha confirmada, vigente y autorizada. `positionMs` es la posición al generar el snapshot; `updatedAt` mide frescura y no se usa como origen del progreso. Los timestamps enviados son segundos Unix calculados desde el reloj actual menos la posición. No se envían rutas de audio, URLs firmadas, tokens ni identificadores de usuario/dispositivo.

El proceso principal valida nuevamente tipo, rangos, frescura máxima de 65 segundos y URLs públicas. La caducidad también se limita al final conocido de la canción. Una posición al final retira la actividad; artista vacío muestra “Artista desconocido”. Carátulas: CDN permitidos por el normalizador compartido y el bucket público `artwork` de Supabase; sin query, fragmento ni credenciales. Se omiten imágenes de más de 300 caracteres, límite de [ActivityAssets.LargeImage](https://discord.com/developers/docs/social-sdk/classdiscordpp_1_1ActivityAssets.html). El botón sólo acepta `https://music.youtube.com/watch?v=` con un ID de vídeo válido de 11 caracteres.

`publicar(null)` retira la presencia y cierra la conexión inmediatamente. También se limpia en expiración, navegación completa, caída del renderer, cierre de ventana y salida. El opt-out cancela reconexiones. Tras pausa la siguiente reproducción abre otra conexión, evitando que un ACK o una publicación encolada de la canción anterior reaparezca. El cierre envía `SET_ACTIVITY` con `activity: null` cuando ya existía sesión READY, seguido de fin de socket; si Discord desapareció, el cierre de conexión es la limpieza disponible.

## Transporte y límites

Se implementa el [protocolo oficial RPC sobre IPC](https://docs.discord.com/developers/topics/rpc): rutas locales conocidas `discord-ipc-0` a `discord-ipc-9`, handshake v1, framing little-endian, payloads fragmentados, ping/pong y `SET_ACTIVITY`. En Unix se elige el prefijo de las variables de entorno según el orden documentado; en Windows se usan named pipes. No se exponen rutas o comandos RPC arbitrarios al renderer, y sólo el mainFrame propio `app://dnmusic` puede invocar las tres operaciones.

Las actualizaciones se agrupan con intervalo de 15 segundos, una petición pendiente a la vez y timeout ACK de 10 segundos. La retirada no espera ese intervalo. La búsqueda de socket tiene timeout por ruta, y reintento cada 15 segundos sólo mientras existe una actividad vigente. Los errores no afectan el audio y se muestran sin incluir payloads de Discord. Una instalación Discord aislada en Flatpak/Snap puede no exponer su socket en las rutas estándar; no se cambian permisos ni se exploran rutas privadas para saltar ese aislamiento.

Se eligió IPC porque Electron ya dispone de Node y el alcance pedido aquí es Rich Presence local. Discord recomienda Social SDK para integraciones sociales nuevas y más amplias. **No significa que iOS carezca de soporte**: la [tabla oficial de plataformas](https://docs.discord.com/developers/discord-social-sdk/core-concepts/platform-compatibility) incluye iOS GA. La [integración móvil](https://docs.discord.com/developers/discord-social-sdk/core-concepts/mobile) requiere SDK nativo, configuración de aplicación/Portal, account linking y callback OAuth con PKCE. Para iOS siguen pendientes descargar/integrar ese SDK, disponer de Application ID, registrar `discord-APP_ID:/authorize/callback`, enlazar cuenta y validar con Xcode/dispositivo. El puente IPC de Electron no implementa esas piezas móviles.

## Verificación

`npm --prefix desktop test` compila TypeScript y ejecuta la suite, incluyendo `tests/discord-presence.test.cjs`: framing fragmentado, límites, privacidad, TTL y fin de canción, opt-in, ACK, errores, reintentos, pausa y callbacks viejos, filtro de origen, preload sandbox y prueba con servidor IPC local real.

La prueba de socket usa un servidor de protocolo simulado y un ID sintético aislado de producción. No equivale a una prueba con Discord. La verificación con cliente real, Application ID propia y privacidad de cuenta queda pendiente, al igual que la matriz de Windows/macOS/Linux y el acceso a sockets en paquetes aislados.
