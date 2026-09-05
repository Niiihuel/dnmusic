# Jam: escuchar juntos

Una sesión temporal con cola compartida, como el Jam de Spotify. El que la crea
es el host; el resto entra con un link (`dnmusic-app.vercel.app/jam/CODIGO`) o
con el código, y elige **dónde escuchar**: en su dispositivo, sincronizado, o
en el del host usando el suyo de control remoto.

## Dónde está cada cosa

| Archivo | Qué hace |
| --- | --- |
| `supabase/migrations/20260812100000_jam.sql` | La verdad: tablas, RLS, todos los RPCs |
| `supabase/migrations/20260812150000_jam_mover.sql` | Reordenar la cola: `jam_mover`, midpoint sobre `posicion` |
| `supabase/migrations/20260908000000_jam_cola_prioridad.sql` | Lo pedido antes que lo sugerido: `automatica` y el `jam_agregar` nuevo |
| `src/services/jam.ts` | Los pedidos y el canal; parsers fila→tipo |
| `src/state/jam.ts` | La copia local: conexión, resync, permisos, volcado |
| `src/state/playback.ts` | `registerJam`, el puente; `jamAplicar`/`jamSoltar` |
| `src/ui/MotorAudio.tsx` | La sincronía: arranque diferido y corrección de deriva |
| `app/jam/index.tsx` | La hoja principal del teléfono: título, avatares, la fila |
| `app/jam/personas.tsx` | Invitar (link, código, QR) y quiénes están; se apila encima |
| `app/jam/opciones.tsx` | Permisos del host / salida del invitado; tercera hoja |
| `src/ui/ColaJam.tsx` | La fila compartida: lo que suena y lo que viene, arrastrable |
| `src/ui/BotonSostener.tsx` | Terminar sosteniendo: el botón que se llena |
| `src/lib/invitarJam.ts` | El link de invitación y el gesto de compartirlo, una sola vez |
| `src/ui/JamPanel.tsx` | Lo mismo en escritorio, como cara del panel derecho |
| `app/jam/[code].tsx` | La puerta del link: elegir dónde escuchar y entrar |
| `supabase/tests/jam.sql` | Las pruebas, contra el Docker local |

## Las decisiones que importan

**Postgres es la autoridad, y no hay otro camino.** Las tres tablas solo
tienen policy de `select`; toda escritura pasa por funciones `security
definer` que serializan con un advisory lock por Jam, validan quién y qué
permiso, y suben `revision`. Los clientes mandan **intents** («saltá»,
«pausá»), jamás estado. Dos personas saltando a la vez se aplican de a una, y
la segunda parte del resultado de la primera.

**La reproducción se guarda como intención, no como sonido.**
`posicion_ms` + `arrancado_en` (reloj del servidor). La posición real se
deriva: `posicion_ms + (ahora − arrancado_en)`. Nadie escribe la posición
periódicamente — solo los eventos: play, pausa, salto, cambio de tema. Cuatro
escrituras por canción, no cuatro por segundo.

**El desfasaje de reloj se mide, no se supone.** Cada `jam_estado` trae el
`now()` del servidor; contra el punto medio del viaje sale `offsetMs`, estilo
NTP. «Cuándo arrancó la canción» significa lo mismo en todos los dispositivos
aunque ningún reloj esté en hora.

**La deriva se corrige estirando el tiempo, no saltando.** Menos de 80ms se
ignora (es menos que un Bluetooth). Hasta 400ms, velocidad 1.04/0.96 con
corrección de tono — inaudible. Más, un `seekTo` con tolerancia cero. La
revisión periódica es un `setInterval` de 7 segundos, **jamás**
`requestAnimationFrame`: un bucle por cuadro es la forma exacta del que hizo
que iOS matara la app por CPU (ver `MotorAudio`). Entre revisiones, cada
evento del Jam dispara una corrección puntual.

**Los cambios de tema arrancan un pelo en el futuro.** `jam_tocar` fija
`arrancado_en = now() + 600ms`: todos reciben el evento, cargan, y arrancan en
el instante — no cada uno al enterarse. `jam_play` no: quien apretó ya está
sonando de forma optimista y correrle el instante lo dejaría adelantado para
siempre.

**Solo el host avanza al terminar una canción.** Si cada dispositivo avanzara
al llegar su reproductor al final, a la tercera canción el Jam sería un canon.
El invitado espera el evento. (Costo asumido: con el host sin señal justo al
final de un tema, la cola queda esperándolo.)

**La cola lleva la canción entera, desnormalizada.** El `id` de una canción de
lista es una fila de `playlist_tracks` — es del dueño y RLS no la muestra a
nadie más. Lo que un invitado necesita es el `audio_path`, que firma contra
Storage con su propia sesión. El `id` del ítem es del ítem: la misma canción
puede estar dos veces. La `posicion` es `numeric` para que reordenar — cuando
exista — sea `(a+b)/2` en una fila y no renumerar la cola.

**La cola del Jam entra al store de reproducción de siempre.** `state/jam`
la vuelca con `jamAplicar` y toda la interfaz —la barra, «Sonando», la letra—
funciona sin saber que es compartida. Lo que cambia es quién manda: cada
acción de `playback` le pregunta al puente (`registerJam`, el sexto puente del
proyecto). Mientras hay Jam, `guardar()` no persiste (la cola no es tuya),
el aleatorio y el repetir avisan que no, y `playQueue` pide salir primero.

**Encolar dentro de un Jam es agregarle al Jam.** El «Agregar a la cola» de
toda la app pasa por `enqueue`, y `enqueue` en un Jam llama a `jam_agregar`:
no hubo que tocar ni una pantalla.

**Lo pedido suena antes que lo sugerido.** El host rellena la cola con
recomendaciones cuando quedan pocas (`rellenarJamSiFalta`), y esas filas van
marcadas `automatica`. `jam_agregar` mete lo que pide una persona **después de
lo último pedido y antes de lo primero sugerido**; lo sugerido va al final.
Encolar tres canciones a mano es escucharlas las tres, en orden, y recién
después la radio del Jam — la misma regla que la cola de afuera. Tocar una
canción de una **lista** con el Jam andando (`jam_tocar_cola`) sigue la misma
regla: la tocada suena ya, y el resto de la lista entra como contexto
—`automatica`— detrás de lo pedido y antes de lo sugerido; antes metía la
lista entera por delante de todo. Las dos pantallas de cola lo muestran en dos
secciones («Lo que pidieron» / «Después · sigue el Jam»). Y un pedido despierta al Jam que quedó mudo en el final de la
cola: la huella de ese silencio es sin sonar, en cero, sin arranque y con la
actual siendo la última — las cuatro juntas, porque un Jam recién creado en
pausa cumple tres. La migración `jam_cola_prioridad` tiene la cuenta y
`supabase/tests/jam.sql` la prueba.

**El host que se va termina el Jam; el que se desconecta, no.** Salir es una
decisión y termina la sesión para todos (como Spotify). Perder la señal no:
el Jam vive en la base, no en la memoria de nadie, y muere solo a las 6 horas
de la última mutación (`expires_at`, corrido por cada una). Reconectarse es
`jam_estado` + reemplazo total del estado local — nunca se reproducen comandos
viejos; `revision` descarta lo rancio.

**La membresía sobrevive a la app.** `mi_jam()` al abrir sesión reengancha el
Jam que haya quedado. La presencia (el puntito) es aparte: la mantiene el
canal de Supabase y dice quién está conectado *ahora*.

**Permisos: tres columnas, defaults de Spotify.** Agregar, controlar
(play/pausa/posición) y saltar, todos prendidos; el host restringe desde el
sheet. Se chequean en SQL —la única verdad— y en el cliente solo para avisar
con palabras antes del viaje. Quitar no es permiso: el host quita cualquiera,
cada uno lo suyo, y lo que suena no lo quita nadie.

## El link

`https://dnmusic-app.vercel.app/jam/CODIGO` rutea en la web y abre la app en
iOS. Las tres piezas están puestas: `associatedDomains` en `app.json`, el
`apple-app-site-association` en `public/.well-known/` con el Team ID real
(`2K2U374CJC`, sacado del perfil de aprovisionamiento del build), y el header
`application/json` en `vercel.json` — Apple no acepta el archivo con otro tipo,
y sin extensión Vercel lo serviría como `text/plain`.

Para que funcione hace falta que **el deploy de Vercel tenga el AASA** y que la
app instalada sea de un build con el entitlement. iOS descarga el archivo al
instalar: si cambiás el AASA después, hay que reinstalar la app para que lo
relea.

Pendiente conocido: abrir un link de Jam deslogueado te deja en el login sin
volver al Jam después.

## Lo que no está, a propósito

- **Reordenar la cola** (la posición fraccionaria ya lo espera).
- **Migración de host**: si el host no vuelve, el Jam expira; no se hereda.
- **QR**: el link por Share alcanza para WhatsApp, que era el caso pedido.
- **Modo fiesta en la misma habitación**: dos parlantes en el mismo cuarto se
  oyen como eco con cualquier sincronía (Bluetooth mete 150–250ms que no se
  pueden medir). Para eso está «escuchar donde el host»: un solo emisor.
