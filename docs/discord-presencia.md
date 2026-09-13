# Música en Discord en PC

DMusic usa el IPC de la app de escritorio de Discord. No necesita un token
personal ni agrega una conexión OAuth como la integración especial de Spotify.
El usuario habilita compartir por cuenta y dispositivo desde Ajustes → Discord.
El identificador público de la aplicación DMusic es `1548502947623739552`.

Se envían título, artista, carátula pública, duración y posición. El tipo es
Listening (2) y el estado breve usa el artista (status_display_type 1).
El botón abre la canción pública. No se envían audio privado, tokens ni
identificadores de cuenta. El nombre de la cuenta de Discord detectada en READY
se muestra sólo en la PC; el protocolo de control remoto lo excluye.

La música personal puede proceder de otra máquina de la misma cuenta mientras
la escucha siga vigente. En Jam se comparte únicamente el audio que realmente
suena en esta PC; controlar la salida de otra persona no anuncia escucha local.
Pausar, salir de la cuenta o desactivar la integración retira la actividad.

## Diagnóstico en Windows

- Abrir ambas apps con la misma sesión de Windows y permisos equivalentes.
- Pulsar Conectar Discord. READY confirma comunicación; no publicación.
- Reproducir música. “Canción enviada a Discord” requiere el ACK de SET_ACTIVITY.
- Si otros no la ven, revisar Privacidad de actividad, actividad por aplicación
  y estado Invisible en Discord. El ACK no confirma visibilidad para amigos.
- Revisar la cuenta de Discord que muestra DMusic. Reintentar conexión vuelve
  a abrir el canal incluso si el anterior decía conectado.
- Los rechazos conservan códigos numéricos seguros; los errores de permisos
  de Windows se distinguen de Discord cerrado. No se muestran respuestas crudas.
- Un fallo de guardado se informa por separado y no bloquea la música de una
  conexión aceptada en esta sesión. El permiso remoto provisional conserva su
  cancelación si la operación no llega a confirmarse.

Los cambios del transporte requieren una nueva compilación de la app instalada;
recargar la web o localhost no actualiza el proceso principal de Electron.

Fuentes: [RPC](https://docs.discord.com/developers/topics/rpc),
[actividad](https://docs.discord.com/developers/events/gateway-events#activity-object),
[visibilidad](https://support.discord.com/hc/en-us/articles/7931156448919-Activity-Sharing-on-Discord-FAQ).
