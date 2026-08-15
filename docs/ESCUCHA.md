# Escucha: una sola música para todos tus dispositivos

La cuenta abierta en varios aparatos es, para la música, **una sola escucha**
— el modelo de Spotify Connect. El aparato que reproduce es el **dueño** y
publica lo que hace; los demás son **espejos**: la barra muestra la misma
canción, en el mismo segundo, con el rótulo «Sonando en “Computadora”». Tocar
el transporte en un espejo es el **traspaso**: si allá está sonando, un modal
pregunta si traer la música acá o dejarla donde está; si allá está en pausa o
el aparato se cerró, se toma en silencio — retomar lo tuyo no interrumpe a
nadie. Al confirmar, este aparato arranca en el segundo por el que iba y el
otro se calla solo.

De paso mata el bug que motivó todo: abrir el teléfono ya no muestra la cola
vieja del disco — la escucha del servidor es más nueva y gana.

## Dónde está cada cosa

| Archivo | Qué hace |
| --- | --- |
| `supabase/migrations/20260814200000_escucha.sql` | La verdad: `escuchas`, `escucha_colas`, `escucha_publicar`, `escucha_estado` |
| `src/services/escucha.ts` | El pedido y el canal (fila + presencia); parsers fila→tipo |
| `src/state/escucha.ts` | El cerebro local: publicar, espejar, retener, traspasar |
| `src/lib/dispositivo.ts` | Quién es este aparato: id opaco persistido + nombre legible |
| `src/state/playback.ts` | `registerEscucha` (el puente), `escuchaAplicar`/`escuchaTransporte`/`escuchaSoltar`, las intercepciones |
| `src/ui/MotorAudio.tsx` | El silencio del espejo: `mudo = silencioso ∨ espejo`, y la memoria de retomar en blanco |
| `src/ui/Traspaso.tsx` | El modal: «Reproducir acá» / «Seguir allá»; montado en el layout como `Aviso` |
| `src/ui/NowPlayingBar.tsx` | El rótulo «Sonando en “X”» en la línea del artista |
| `supabase/tests/escucha.sql` | Las pruebas, contra el Docker local |

## Las decisiones que importan

**Es el modelo del Jam, puertas adentro de la cuenta.** Una fila por usuario
(`escuchas`), sin policy de escritura: el único camino es `escucha_publicar`,
`security definer`, con un advisory lock por usuario y una `revision` que sube
en cada publicación. La posición se guarda como intención —`posicion_ms` +
`arrancado_en` del reloj del servidor— y se deriva; nadie escribe la posición
periódicamente.

**La revisión es la llave del traspaso.** El dueño publica con su `device_id`
y no se le mira la revisión: su reproductor ES la verdad. Otro dispositivo
solo puede reclamar la fila con la **revisión al día** — la tiene, porque los
espejos viven suscriptos. Un dueño destronado que publica tarde trae una
revisión vieja y rebota («La música quedó en otro dispositivo»), en vez de
pisarle la música al que acaba de tomarla.

**La fila liviana viaja, la cola pesada se pide.** `escuchas` está en la
publicación de realtime (REPLICA IDENTITY FULL, con la canción actual
desnormalizada adentro); `escucha_colas` guarda el estado completo del
reproductor (`tracks`, `index`, `upNext`, `manual`, `origin`) tal cual, opaco,
y no viaja por el canal. El índice queda **afuera** de la firma de la cola a
propósito: avanzar dentro de la lista no reenvía cientos de canciones — el
espejo reconcilia el índice contra la canción de la fila liviana.

**La presencia distingue «suena» de «quedó diciendo que sonaba».** Cada
aparato se anuncia en el canal (`escucha:{uid}`, key = deviceId). Si el dueño
desaparece sin despedirse, la fila queda en `suena = true` para siempre; la
presencia convierte eso en una pausa congelada en el segundo en que se fue, y
el próximo play toma la escucha sin preguntar. Hasta la primera sincronización
de presencia se asume presente: la duda no puede arrancar audio local por
encima de una escucha que sí suena.

**El espejo se vuelca al store de reproducción**, como el control remoto del
Jam: toda la interfaz —barra, cola, letra, Sonando— dibuja la escucha remota
sin saberlo. El motor calla (`espejo` deja la fuente en null, ni se firma), un
ticker de un segundo deriva la posición, y `guardar()`/`restorePlayback` no
tocan el disco mientras se espeja. El botón de la barra en un espejo es UNA
pregunta —`togglePlayback` va a `resumePlayback`, que retiene y pregunta— sin
importar el ícono: pausar algo que no suena acá no significa nada.

**Publicar es un diff con dead-reckoning.** El dueño se suscribe a su propio
store y publica solo cuando cambió algo que importa: la canción, el
play/pausa, la forma de la cola, o una deriva de más de 3 s contra la posición
esperada (eso ES un seek). Debounce de 300 ms; el volcado remoto marca
`aplicandoRemoto` para no publicarse a sí mismo en eco.

**Con un Jam andando, la escucha personal se calla.** La cola del Jam no es
tuya: el publicador manda `track = null` (cierra la fila para tus otros
aparatos) y el espejo se suspende hasta que el Jam termine.

## Pendiente

- La migración está aplicada y registrada en el ledger **en el Docker local y
  en el hosted** (2026-08-14, por Management API).
- No hay control remoto (pausar/saltar el otro aparato sin traer la música):
  el modal solo ofrece el traspaso. Si algún día se quiere, el camino es que
  cualquier dispositivo publique intents de transporte y el dueño los obedezca
  por el canal.
- El nombre del dispositivo es genérico («Computadora», «iPhone»); con
  `expo-device` podría ser «iPhone de Nihuel».

## Reaccionar a lo que escucha otro

La escucha que existe para el traspaso entre dispositivos es, además, lo más
vivo que tiene un perfil: si un contacto está escuchando algo ahora, se le puede
dejar un emoji y le queda en el perfil. Es la idea de Airbuds, apoyada sobre la
fila que ya estaba — no hay un segundo lugar donde se anote qué suena.

| Archivo | Qué hace |
| --- | --- |
| `supabase/migrations/20260816000000_reacciones_escucha.sql` | `escucha_de_contacto`, `reaccionar_escucha`, `reacciones_de` |
| `src/services/reacciones.ts` | Los tres pedidos y sus tipos |
| `src/ui/Reacciones.tsx` | La escucha con los emojis, y la pared del perfil |
| `supabase/tests/reacciones_escucha.sql` | Las pruebas |

**La canción la elige el servidor, no el cliente.** `reaccionar_escucha` lee
`escuchas` en ese instante y congela la canción en la fila. Si el emoji viniera
con una canción adjunta, cualquiera podría inventarle a otro una reacción sobre
algo que nunca escuchó — y el perfil dejaría de ser un registro para pasar a ser
un tablón.

**Y se queda congelada.** La reacción guarda la canción de su momento, no un
puntero a la escucha: por eso sigue significando algo dentro de un mes, cuando
esa persona hace rato que escucha otra cosa. Es la misma decisión que toman las
canciones de una lista (`playlists.sql`) y los fragmentos de un mensaje.

**Solo entre contactos.** `escucha_de_contacto` devuelve cero filas si no
comparten un par — y también si no hay nada sonando. Que las dos respuestas se
vean iguales es a propósito: si se distinguieran, esto serviría para averiguar
quién tiene a quién agregado.

**La fila cruda sigue siendo privada.** `escuchas` conserva su policy `own
escucha`: lo que se abre es una ventana por RPC con la canción y si suena. La
posición, el aparato y la revisión son mecánica del traspaso y no le importan a
nadie más.
