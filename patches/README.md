# expo-audio 57.0.3 / iOS y web

`expo-audio+57.0.3.patch` mantiene correcciones locales en cinco archivos del SDK.
Se aplica en `postinstall` con `--error-on-fail`. Los cambios Swift requieren
recompilar la app de iOS; una actualización JS no los incorpora. El cambio web
se incluye en el siguiente bundle web. Al actualizar Expo Audio, revisar el SDK
y retirar o adaptar el parche.

## Muestreo sin reiniciar el grafo

Conserva el tap del mismo `AVPlayerItem` al suspender el muestreo. La versión
original desmontaba el `audioMix` con cada `setAudioSamplingEnabled(false)`,
incluyendo las transiciones de AppState.

El callback comprueba `samplingEnabled` antes de construir arrays PCM o emitir
eventos JS. En segundo plano no ejecutamos FFT ni actualizamos barras. El tap
se libera al reemplazar la fuente o destruir el reproductor; su referencia al
item impide reutilizarlo en otra canción.

Los players persistentes (`keepAudioSessionActive`) preparan también el tap al
cargar una canción en segundo plano, antes del aviso de lista/play. Esto cubre
los items precargados que ya estaban listos al construir el player. Activar el
visual con ese player sonando sólo habilita la entrega de muestras: no instala
ni reinstala `audioMix`. Si el tap no pudo prepararse, se conserva el audio y
el indicador queda estático hasta una oportunidad sin reproducción activa.
Los eventos consecutivos de item/listo reutilizan el mismo tap.

Verificación en dispositivo: iniciar A, bloquear, pasar a B desde lock screen,
esperar unos segundos y abrir la app varias veces. Confirmar que B mantiene
posición/audio sin corte, tanto con caché local como con streaming y auriculares.
Las pruebas Linux comprueban parche y transporte JS; no miden cortes de AVPlayer.

## Errores terminales observables

Además de observar `item.status`, escucha
`AVPlayerItem.failedToPlayToEndTimeNotification`, como recomienda Apple para
fallos durante la reproducción. Filtra por el item actual y entrega el evento
en la cola principal. Quita el observer al cambiar de item/destruir el player.

`currentStatus()` conserva el error del item fallido en los eventos periódicos
hasta reemplazarlo. También informa `playbackState: failed`; así JS puede
reintentar la fuente sin interpretar primero el fallo como una pausa del
usuario. Una notificación tardía de la canción anterior no contamina la nueva.
Un stall/buffering temporal sigue siendo buffering, no fin ni fallo terminal.
El parche comunica errores; la política de reintentos está en MotorAudio.

## Ventana breve entre canciones en segundo plano

Al finalizar normalmente una canción sin loop, un player con
`keepAudioSessionActive` solicita tiempo de ejecución **antes** de emitir
`didJustFinish`, únicamente si UIApplication está en background. La tarea vive
en `AudioComponentRegistry`, porque el player terminado se libera cuando JS
crea el siguiente.

La ventana finaliza al sonar de verdad el siguiente player persistente
(`timeControlStatus == playing`), pausar, volver a foreground, destruir el
módulo, cumplirse 20 segundos o expirar el tiempo concedido por iOS. La pausa
nativa por interrupción también la cierra. No se renueva una ventana activa y
no se reproduce silencio para mantener vivo el proceso. iOS puede denegar o
acortar el tiempo solicitado. Es una ayuda para completar una transición, no
un mecanismo de ejecución permanente.

**Límite:** la cola sigue en JS. La próxima fuente debe estar resuelta/precargada;
una red lenta, suspensión previa a entregar el evento o una tarea denegada
pueden impedir el arranque. El puente cubre el fin natural, no implementa una
cola nativa ni promete reproducción sin separación audible. Migrar la cola a
AVQueuePlayer requiere conservar metadata de lock screen, mandos remotos,
repetición, shuffle, Jam, velocidad y renovación de URLs.

## Pausa explícita durante recuperación

`AudioPlayer.pause()` emite el marcador transitorio `didJustPause: true`, además
de cerrar la ventana de transición. Los mandos de pausa y alternar reproducción
de lock screen pasan por este método. Esto permite que MotorAudio cancele una
recuperación pendiente aunque el estado conserve el error de la fuente.
El marcador no se guarda en `currentStatus()` ni se emite desde teardown o fin
natural; es una extensión local del evento, no parte del tipo público de Expo.

Al comenzar una interrupción, un `AudioPlayer` persistente que no está sonando
también recibe esa pausa: puede estar esperando un reintento JS. Se limpia su
`wasPlaying` y no se incorpora al conjunto de reanudación del sistema. Los
players de precarga/previews sin `keepAudioSessionActive` conservan su conducta.

## Fin observable en web

El SDK sólo actualizaba MediaSession en `HTMLAudioElement.onended`. Ahora también
actualiza `playing` y emite estado con `didJustFinish: true` y `playing: false`,
incluso cuando no llega un último `timeupdate` o el navegador suspende los frames
de animación. Mantiene la actualización de MediaSession. Una pausa normal no
produce fin. Los eventos `timeupdate`/`pause` y `ended` pueden informar el mismo
fin; MotorAudio debe deduplicar la transición por reproducción.

**Límites web:** este parche no garantiza ejecución JS ni continuidad en Safari
con la app/pestaña suspendida. El SDK web no escucha `waiting`/`stalled`, devuelve
`isBuffering: false` y limita las emisiones de `timeupdate` por avance de
`currentTime`. No existe un pulso periódico de buffering mientras el tiempo no
avanza; este cambio sólo corrige la entrega del fin natural.

## Validación

`node --test tests/expo-audio-patch.test.mjs tests/expo-audio-web.test.mjs`
verifica reversión/reaplicación de los cinco archivos sin fuzz, los contratos
nativos de errores/ventana/pausa/interrupción y ejecuta el reproductor web del SDK
transpilado con un elemento de audio simulado. Cubre fin sin frames/timeupdate,
pausa antes de fin, señales duplicadas, otra reproducción y limpieza del handler.
Estas pruebas no ejecutan UIKit, AVFoundation ni un navegador real.

En un iPhone con el nuevo binario, pendiente de verificar:

1. Tres canciones locales: bloquear a 15 segundos del final y dejar que pasen
   dos límites de canción; repetir sin red para separar cola de resolución.
2. Repetir con streaming y la siguiente pista precargada, con ahorro de batería
   activado y después de más de cinco minutos bloqueado.
3. Cortar Wi-Fi durante el cambio, simular respuesta 403/URL vencida y fallo de
   stream a mitad: comprobar recuperación acotada, posición y ausencia de
   saltos dobles. El error viejo no debe aparecer en la nueva canción.
4. Pausar desde lock screen durante la transición, conectar/desconectar
   auriculares y recibir una llamada. Una pausa del usuario no debe reanudarse
   por un retry ni propagarse al resto del Jam.
5. Con Xcode/Console revisar la tarea `ExpoAudio playback transition`: debe
   cerrarse al arrancar/pausar/foreground y nunca superar su plazo de 20 segundos
   (o la expiración anterior de iOS). Sin siguiente canción también debe cerrar.
6. Alternar primer plano, multitarea y bloqueo mientras hay muestreo, y cambiar
   de canción. Comprobar audio, batería, metadata y controles de lock screen.

El repositorio no fija protección `.complete` para los audios. Expo FileSystem
mueve los temporales descargados a Documents; el nivel predeterminado de Apple
es `completeUntilFirstUserAuthentication`, que permite acceso tras el primer
desbloqueo y durante bloqueos posteriores. No se cambió la protección a `none`.
Para descartar archivos heredados con otro atributo, inspeccionar en dispositivo
`FileManager.attributesOfItem(...)[.protectionKey]` de un audio que falle.

Referencias: [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/),
[error de fin de reproducción](https://developer.apple.com/documentation/avfoundation/avplayeritem/failedtoplaytoendtimenotification),
[manejo de errores AVFoundation](https://developer.apple.com/videos/play/wwdc2017/514/),
[tiempo de ejecución en segundo plano](https://developer.apple.com/documentation/uikit/extending-your-app-s-background-execution-time),
[clases de protección de Apple](https://support.apple.com/guide/security/data-protection-classes-secb010e978a/web).
