# Discord desde iOS y escritorio

DMusic de escritorio publica Rich Presence mediante la sesión abierta de Discord en esa computadora. Puede mostrar tanto reproducción local como la escucha del teléfono sincronizada con la misma cuenta de DMusic. El Application ID público es `1548502947623739552`.

## Control mediante PC

Los ajustes de Discord también se muestran en el teléfono y el navegador. Enumeran únicamente PCs que anuncian el puente de Discord y su estado real, a través del canal privado `escucha:<uid>`. La presencia genérica de una computadora no se interpreta como conexión con Discord.

Cada equipo tiene acciones explícitas para conectar, reintentar o desconectar. El estado distingue búsqueda, conexión sin canción, publicación y fallo. Abrir la pantalla no concede permiso para compartir. La cuenta de Discord utilizada es la que está abierta en la PC elegida.

Ambos dispositivos necesitan esta versión de DMusic para ofrecer el control remoto. Una PC anterior puede seguir publicando música del teléfono desde sus propios ajustes, pero no aparecerá como destino de control remoto.

La conexión remota confirma la operación del proceso de escritorio; un ACK del transporte de Supabase no prueba que Discord haya aceptado la configuración. Reconexiones, sesión de cuenta, caducidad de solicitudes y cancelaciones deben preservar esta distinción. No se envían tokens, identidad de Discord ni el historial de canciones en los mensajes de control. Una activación remota es provisional hasta recibir confirmación y no se persiste antes de ella; si la PC queda aislada, el permiso provisional vence a los 35 segundos. Perder la confirmación final produce un resultado incierto y obliga a consultar la presencia actual: no se informa una desconexión que no fue confirmada, ni se promete revocación instantánea sin red.

## Conexión directa del iPhone

Esta entrega no incluye Discord Social SDK para iOS ni un vínculo OAuth directo. Un botón que abre Discord por sí solo no publica Rich Presence. La integración directa requiere:

1. Habilitar el Social SDK para DMusic en el Developer Portal y obtener el paquete oficial con `discord_partner_sdk.xcframework`.
2. Registrar `discord-1548502947623739552:/authorize/callback` y configurar los esquemas de retorno y consulta en iOS.
3. Integrar el SDK nativo en el módulo Expo y la compilación de GitHub Actions.
4. Implementar autorización con PKCE, almacenamiento seguro, renovación y revocación. Pedir únicamente `openid sdk.social_layer_presence` para la presencia; no hacen falta mensajes ni voz.
5. Publicar desde eventos de reproducción y probar cambios de canción con pantalla bloqueada, interrupciones y pérdida de red.

El portal agrupa Social SDK bajo Juegos y su formulario está orientado a ellos. La descripción de DMusic debe seguir siendo una aplicación de música. La compatibilidad técnica no acredita la habilitación de esta aplicación: no se debe declarar un juego ficticio para obtenerla.

## Fuentes oficiales

- [Social SDK: plataformas móviles](https://docs.discord.com/developers/discord-social-sdk/core-concepts/mobile).
- [Habilitar y descargar el SDK](https://docs.discord.com/developers/discord-social-sdk/getting-started/using-c%2B%2B).
- [Vinculación móvil y PKCE](https://docs.discord.com/developers/discord-social-sdk/development-guides/account-linking-on-mobile).
- [Scopes de OAuth](https://docs.discord.com/developers/discord-social-sdk/core-concepts/oauth2-scopes).
- [Rich Presence](https://docs.discord.com/developers/discord-social-sdk/development-guides/setting-rich-presence).
- [Apple: reproducción multimedia](https://developer.apple.com/documentation/avfoundation/configuring-your-app-for-media-playback).
