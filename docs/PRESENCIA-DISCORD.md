# Música de DMusic en Discord

## Qué está implementado

La app de escritorio publica Rich Presence mediante el IPC local del cliente de
Discord. Usa el estado real del motor o la escucha vigente de otro dispositivo de
la misma cuenta (por ejemplo, el iPhone). No envía URLs del audio, JWT, identificadores
de cuenta ni rutas privadas. Canción, artista, posición y carátula pública se
normalizan en `src/services/actividadEscucha.ts`.

El permiso es independiente de «Mostrar escucha en mi perfil», está desactivado por
defecto y se guarda por cuenta y dispositivo. Se retira la actividad al pausar,
quedarse sin música vigente, desactivar el permiso o cerrar sesión. El proceso
principal también vence la actividad aunque el renderer se congele o cierre.
No se afirma que Discord publicó la actividad hasta recibir su confirmación.

El Application ID público de DMusic, `1548502947623739552`, viene configurado
por defecto. La pantalla ya no solicita un ID a los usuarios.
En Configuración → Discord, «Conectar Discord» activa la integración y comprueba
el cliente local incluso sin música. «Reintentar conexión» vuelve a buscarlo;
«Desconectar Discord» retira el permiso y cancela las reconexiones. Para escuchar desde el iPhone y mostrarlo a través
del PC, ambas sesiones de DMusic deben pertenecer a la misma cuenta, y DMusic y
Discord deben permanecer abiertos en el PC. El navegador por sí solo no tiene el
puente IPC de la app de escritorio.

## Verificación y uso

El usuario proporcionó el Application ID `1548502947623739552`. Ya está integrado
como valor predeterminado, con el permiso de compartir desactivado. Se comprobó
un handshake `READY` con Discord real en Linux sin publicar música. La publicación
y su visibilidad en el perfil deben comprobarse reproduciendo una canción.

1. Compilar o actualizar DMusic de escritorio con este cambio.
2. Abrir Discord con sesión iniciada y tocar «Conectar Discord»
   en Configuración → Discord. El ID ya viene cargado; no se necesita Client Secret
   ni token de bot para esta integración por IPC.
3. Probar reproducir, pausar, cambiar de tema, cambiar a iPhone, cerrar la sesión de
   DMusic y cerrar Discord. Verificar retiro de presencia al perder vigencia.

Discord decide cómo se presenta la actividad según sus preferencias de privacidad
y el cliente. «Mostrando tu música» significa que respondió al comando; no prueba
qué ve una tercera persona en su cuenta.

## iOS: publicación directa

Discord admite iOS 15.1 o superior. La publicación directa desde el iPhone requiere
vinculación de cuenta, Discord Social SDK habilitado en el Portal, el SDK nativo y
el redirect `discord-APPLICATION_ID:/authorize/callback`. El SDK oficial tiene
interfaz C++: una futura integración con nuestros módulos Swift requiere el puente
correspondiente y compilación/validación con Xcode.

Eso **no está integrado** en este cambio: todavía falta configurar el Social SDK
en el Portal e integrar el SDK nativo y la vinculación de cuenta. La API común y el snapshot propio ya están disponibles para
ese adaptador; no se incluye un botón de vinculación que simule una conexión.
El audio en segundo plano debe seguir funcionando independientemente de Discord.

## API y pruebas

El endpoint autenticado y versionado está documentado en [API-ESCUCHA.md](API-ESCUCHA.md).
Sirve sólo la escucha de la cuenta del token y requiere su opt-in de perfil;
el adaptador local de Discord aplica su propio consentimiento explícito.

`tests/discord-presencia.test.mjs` cubre consentimiento, cambios de cuenta,
configuración inválida y retiro al pausar. `tests/escucha-transferencia.test.mjs`
comprueba el snapshot local real y remoto vigente. Las pruebas en `desktop/tests`
ejercitan el protocolo IPC, confirmaciones, expiración y desconexión; no sustituyen
la prueba con una Discord Application real. Las exportaciones Expo no compilan Swift.

## Fuentes oficiales verificadas

- [Rich Presence](https://docs.discord.com/developers/discord-social-sdk/development-guides/setting-rich-presence)
- [ActivityAssets: imágenes alojadas o externas](https://discord.com/developers/docs/social-sdk/classdiscordpp_1_1ActivityAssets.html)
- [Compatibilidad de plataformas](https://docs.discord.com/developers/discord-social-sdk/core-concepts/platform-compatibility)
- [Requisitos de móvil y vinculación obligatoria en iOS](https://docs.discord.com/developers/discord-social-sdk/core-concepts/mobile)

## Conexión y actividad

`ready` confirma el handshake de Discord y `published` confirma un `SET_ACTIVITY`
con música. Al pausar o vencer el snapshot se envía `activity: null` inmediatamente,
aunque haya un ACK pendiente; el socket sigue conectado. El ACK de una canción
anterior nunca confirma el retiro. Al revocar o cerrar sesión se cierra el socket
y se cancelan los reintentos. Si Discord se cierra, se vuelve a buscar cada 15 s
mientras el permiso continúe activo, incluso sin música.

El sidebar y la acción usan el [símbolo oficial](https://discord.com/branding),
incluido localmente con su trazado y color originales, sin dependencias de red.
