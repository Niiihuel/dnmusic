# Actividad de escucha, versión 1

`GET /api/v1/listening` devuelve exclusivamente la escucha de la cuenta autenticada. Requiere `Authorization: Bearer <access_token>` de Supabase, sesión vigente, aprobación de acceso actual y el opt-in `compartir_escucha` del perfil. No admite query parameters, UUIDs de otras personas ni credenciales en la URL. No requiere ni utiliza `service_role`. El handler no persiste, registra ni cachea el JWT; lo reenvía sólo a Auth y a los RPC de Supabase durante esa petición.

Respuesta cuando existe audio vigente:

```json
{
  "version": 1,
  "activity": {
    "title": "Canción",
    "artist": "Artista",
    "durationMs": 180000,
    "positionMs": 24000,
    "updatedAt": 1760000000000,
    "expiresAt": 1760000065000,
    "trackUrl": "https://music.youtube.com/watch?v=abcdefghijk"
  }
}
```

Sin consentimiento, en pausa, al terminar, con datos inconsistentes o vencidos: `200 {"version":1,"activity":null}`. No se distingue el motivo. La respuesta y los errores incluyen `Cache-Control: private, no-store, max-age=0`. Una aplicación consumidora debe retirar la actividad al recibir null, ante un error y al alcanzar `expiresAt`; debe volver a validar cada lectura, sin reutilizar respuestas de otra sesión.

Errores: `400` si hay parámetros, `401` sin sesión válida, `403` sin aprobación, `405` para otro método, `503` si falla una dependencia o vence el límite total de 8 segundos. El endpoint no devuelve mensajes internos del proveedor ni tokens. Usa `access_status`, `escucha_estado` y `escucha_de_contacto` como fuentes de verdad existentes. El snapshot privado sólo permite proyectar la posición; su cola, identificadores de cuenta/dispositivo y rutas de Storage nunca se devuelven. La lectura pública final vuelve a comprobar consentimiento y permisos. No requiere una migración nueva.

`src/services/actividadEscucha.ts` expone el contrato `ListeningActivity` y la función pura `actividadParaCompartir`. Su parámetro `autorizada` debe venir del consentimiento específico de la integración. El consentimiento para Discord es independiente del opt-in del perfil: la integración local utiliza el snapshot propio y su permiso local; esta API HTTP utiliza el opt-in del perfil.

`positionMs` representa la posición al crear el snapshot. `updatedAt` indica la antigüedad del latido, y `expiresAt` su vencimiento máximo de 65 segundos, acotado también al final conocido de la canción. Para calcular el inicio de una presencia externa se usa `ahora - positionMs`, nunca `updatedAt - positionMs`. El servidor normaliza el desfase de reloj con el RPC. Un cierre brusco puede permanecer visible hasta que vence el último latido; no se promete detección instantánea de desconexión física. Un nuevo latido sólo se publica cuando el motor confirma audio real.

El payload incluye únicamente texto acotado, duración/posición y fechas. `trackUrl` es opcional y se construye sólo para identificadores válidos de YouTube Music. `artworkUrl` es opcional y acepta exclusivamente HTTPS de los CDN públicos conocidos o el bucket público de carátulas, sin credenciales, query ni fragmento. No contiene IDs de cuenta/dispositivo, rutas privadas de audio ni URLs firmadas.

Las lecturas del perfil pasan un `AbortSignal`, invalidan respuestas de focos/sesiones anteriores y retiran el valor tras 10 segundos sin respuesta. Un lector que ignore cancelación no genera solicitudes concurrentes: espera que termine la anterior antes de reintentar. La integración debe dejar de consultar al perder foco/sesión o al desactivar su permiso.

Estos cambios son locales hasta desplegar la aplicación que contiene `api/v1/listening.ts`. No se ha desplegado el endpoint ni modificado la base remota.
