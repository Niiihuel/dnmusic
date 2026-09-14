# Acciones de mensajes

Cada burbuja comparte un único menú entre pulsación larga nativa en iOS, clic derecho en escritorio y botón de opciones accesible con teclado/VoiceOver. La pulsación larga usa `UIContextMenuInteraction` a través de `MantenerApretado` y `MenuContextualColeccion`, como las canciones de las listas. Los Pressable interiores de iOS suprimen su pulsación corta al mantener apretado.

Las acciones son ver, reproducir/pausar fragmento, copiar, editar texto y eliminar para todos. Editar/eliminar aparecen sólo para mensajes propios sin eliminar; las invitaciones de Jam no ofrecen edición de su protocolo. No hay reacciones ni respuestas persistidas nuevas. La edición mantiene el adjunto y tiene un borrador independiente del compositor. En teléfonos, ocupa el campo de escritura del chat con cancelar, texto multilínea y confirmar; el hilo permanece visible y el compositor sigue al teclado. Al cancelar o confirmar reaparecen el texto y la canción que estuvieran pendientes de enviar. Un error conserva el texto editado para reintentar y un guardado en curso bloquea nuevas confirmaciones. En escritorio se mantiene el diálogo de edición. El borrado pide confirmación y limpia texto y `song` (incluidos audio, carátula y letra adjuntos a ese mensaje), dejando «Mensaje eliminado». No borra el archivo compartido de música de Storage, que puede pertenecer también a otras bibliotecas o mensajes.

## Backend y despliegue

La migración `supabase/migrations/20260924000000_message_actions.sql` quedó aplicada y registrada el 13 de septiembre de 2026 en el proyecto Supabase vinculado y en la base local. Para otros entornos, aplicarla antes de distribuir el cliente. Agrega `edited_at`/`deleted_at`, `edit_message(pair, message, text, expected_text)` y `delete_message(pair, message)`.

Las RPC comprueban sesión aprobada, pertenencia al chat y autor, y bloquean la fila durante la modificación. No se amplía el permiso UPDATE directo del autor. El trigger conserva identidad y fecha de envío, impide cambiar adjuntos al editar y reserva recibos al receptor; tampoco permite falsificarlos al insertar. Una edición concurrente produce un error recuperable y las repeticiones de la misma operación son idempotentes. El borrado usa UPDATE para conservar filtrado y autorización realtime por chat.

El cliente espera confirmación del servidor. Con un backend anterior puede seguir leyendo mensajes, pero muestra un error al intentar las nuevas acciones. Realtime y respuestas RPC se fusionan sin retroceder la revisión de edición ni perder recibos; se conserva la precisión de microsegundos del servidor. Al incorporarse al canal y al reconectarse se relee el estado, protegiendo los eventos recibidos mientras corre el SELECT.

## Validación

- `node --test tests/message-actions.test.mjs`: acciones por autor, borrador/errores/doble envío, confirmación, backend antiguo, convergencia RPC/realtime, primera suscripción y microsegundos.
- `RUN_MESSAGE_DB_TESTS=1 node --test tests/message-actions-db.test.mjs`: aplica migración y pruebas de permisos reales en un contenedor PostgreSQL 17 efímero, sin puertos ni volúmenes existentes. Requiere la imagen `postgres:17` disponible. El runner elimina el contenedor al terminar.
- TypeScript y ESLint enfocado pasan. Falta verificación física del gesto, preview, VoiceOver y teclado en iPhone; Linux no ejecuta UIKit.

Referencias: [Apple: menús contextuales](https://developer.apple.com/documentation/uikit/adding-context-menus-in-your-app), [UIContextMenuInteraction](https://developer.apple.com/documentation/uikit/uicontextmenuinteraction), [Supabase: Postgres Changes y limitaciones de DELETE](https://supabase.com/docs/guides/realtime/postgres-changes).
