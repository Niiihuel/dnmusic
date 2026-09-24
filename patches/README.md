# expo-audio 57.0.3 / iOS, Android y web

`expo-audio+57.0.3.patch` mantiene correcciones locales del SDK y el DSP del ecualizador.
Se aplica en `postinstall` con `--error-on-fail`. Los cambios Swift requieren
recompilar la app de iOS; una actualización JS no los incorpora. El cambio web
se incluye en el siguiente bundle web. Metro importa `build/AudioPlayer.web.js`,
por lo que ese archivo compilado debe quedar en el parche junto con `src/`.
Vercel aplica solo las cuatro secciones de `build/` desde `patches-vercel/`.
Al actualizar Expo Audio, revisar el SDK y retirar o adaptar el parche.

## Ecualizador iOS

`DNEqualizerDSP.h` contiene diez biquads por canal, parámetros suavizados y
compensación de realces según la respuesta conjunta. Lo incorpora el mismo
`MTAudioProcessingTap` que usa el visualizador; no se reinicia el historial de
los filtros en cada movimiento. El callback no espera locks y valida PCM
Float32, canales y tamaño de buffers. Las muestras del visualizador respetan
los frames realmente entregados, también si llegan intercaladas en estéreo.

Prueba portable del DSP: `nix shell nixpkgs#gcc --command node --test tests/ecualizador-dsp.test.mjs`.
Además de esa prueba y de reinstalar el parche, hace falta una nueva build iOS
para verificar audio real y la pantalla nativa. Una OTA no incorpora este DSP.

## Crossfade nativo de dos pistas en iOS

`AudioPlayer.scheduleCrossfade(toPlayer, { durationSeconds, fromStartSeconds?, toStartSeconds?, volumeLaw?, volumeOut?, volumeIn?, eqSettings?, filterSettings? })`
devuelve `Promise<boolean>`. `false` significa que no quedó programada ninguna
transición y el motor debe usar su reproducción normal. Los dos players deben
estar cargados, el entrante aún sin reproducir y la pista saliente debe estar
al menos 30 ms antes del cue. Un cue entre 0 y 30 ms puede armarse durante
los primeros 50 ms de reproducción y empieza apenas el deck saliente realmente
suena; si el pedido llega más tarde devuelve `false` en vez de saltar la pista.
La duración nominal admitida es 0,25–30 s. Sin cues,
empieza `durationSeconds` antes del final de la saliente y desde el segundo cero
de la entrante. El método busca el cue entrante con tolerancia cero antes de
resolver; una cancelación o nueva selección durante ese seek invalida el pedido.

El cruce usa ley **lineal** por defecto o `volumeLaw: 'equal_power'`. Cada
`volumeOut`/`volumeIn` puede reemplazar su propia ley con 2–16 puntos
`{t, value}`: tiempo y ganancia lineal normalizados de 0 a 1, con tiempos
estrictamente crecientes. La salida exige extremos `(0,1)` y `(1,0)`; la
entrada `(0,0)` y `(1,1)`. El nativo interpola linealmente. Datos inválidos
devuelven `false`; las ganancias nunca suben de 1. `equal_power` puede requerir
más headroom al coincidir las canciones.

`eqSettings` y `filterSettings` aceptan el esquema persistido v1 de `MixEdge`.
El EQ tiene `enabled` y `out`/`in`, cada uno con curvas `low`, `mid`, `high`
en dB (−24 a +24). Low y high son shelves en 200 Hz y 5 kHz; mid es campana
en 1 kHz. El filtro tiene `enabled` y `out`/`in` opcionales, cada uno con
`kind: 'lowpass' | 'highpass'` y curva `cutoff` entre 20 y 20 000 Hz. Cada
curva tiene 2–16 puntos, tiempos crecientes y extremos `t=0`/`t=1`; los
valores se interpolan linealmente. Una versión o curva inválida devuelve
`false`. Son efectos **sólo de la transición**; se aplican después del EQ
global de diez bandas y se omiten fuera del solapamiento. El tap iOS calcula
headroom propio según la respuesta combinada de las tres bandas, y funde
entrada/salida del efecto durante 15 ms para evitar saltos al volver al EQ
global. La prueba DSP portable está en `tests/transition-dsp.test.mjs`.

Un observador de límite de tiempo nativo inicia el segundo
`AVPlayer`; sólo cuando realmente entra en estado `playing` arranca la curva.
Un observador periódico de 100 ms comprueba el tiempo real del item si iOS
omite un límite; [Apple advierte que los callbacks de límite no están
garantizados](https://developer.apple.com/documentation/avfoundation/avplayer/addboundarytimeobserver%28fortimes%3Aqueue%3Ausing%3A%29).
Ambos taps multiplican el PCM por su propia envolvente después del EQ; no
sobrescriben `player.volume`, que sigue conteniendo volumen del usuario y
headroom de la canción. Los parámetros de curva usan el tiempo de medios del
item, por lo que pausa/reanudación no consumen la duración del fade. El deck
entrante queda en cero hasta que comienza el solapamiento. Si no arranca en
1,5 s, falla durante el cruce o no queda tiempo suficiente, el cruce se cancela
y sigue la canción saliente.

Al completar, el nativo pausa la saliente y emite **una sola vez**
`playbackStatusUpdate` con `didJustCrossfade: true`; no emite `didJustFinish`
por ese handoff. JS debe avanzar la cola a la pista que ya suena y actualizar
metadatos de lock screen. `cancelCrossfade()` cancela el pedido o el cruce,
detiene la entrante si la arrancó y deja la saliente en su reproducción normal.
Pausar congela ambas; un seek, reemplazo, liberación o fin natural cancela el
cruce. El control `player.volume` mantiene su función durante todas esas rutas.

Prueba portable: `node --test tests/crossfade-dsp.test.mjs` con un compilador C,
o `nix shell nixpkgs#gcc --command node --test tests/crossfade-dsp.test.mjs`.
Prueba iOS necesaria: compilar un binario nuevo, precargar dos audios locales,
programar cuatro segundos de cruce, bloquear el teléfono antes del cue y
escuchar ambos audios con auriculares. Repetir con streaming, pausa/reanudación,
seek fuera de la ventana, salto manual, desconexión de red e interrupción
telefónica. Verificar un único avance y metadatos correctos tras el handoff.
Las pruebas Linux verifican matemática y que el parche se aplica; **no**
certifican que `AVPlayer` entregue callbacks/tap a tiempo con iOS bloqueado.
Tampoco hay cola ni metadatos de la pista entrante en nativo: si JS no procesa
el evento de handoff, el audio entrante puede seguir sonando con la ficha vieja
hasta que JS vuelva. Esa condición requiere la prueba física antes de habilitar
el crossfade por defecto.

## Crossfade Android

Android implementa el mismo contrato de dos `AudioPlayer` para cues, leyes de
volumen, curvas personalizadas, cancelación y `didJustCrossfade`. Un scheduler
en el hilo principal consulta el tiempo de medios cada 20 ms durante el
solapamiento y multiplica la ganancia por el volumen base del usuario. La
entrada permanece en silencio hasta estar lista. Un cue en cero puede armarse
con ambos players preparados antes de `play()` y posición saliente hasta 50 ms;
el scheduler espera a que ésta realmente suene. Los demás cues conservan 250 ms
de margen para armar el cruce.

`eqSettings` y `filterSettings` v1 se aplican en un `AudioProcessor` de Media3
por deck, antes del `AudioTrack`: tres biquads y un paso bajo/alto opcional,
interpolados por posición de cada muestra PCM. El efecto entra y sale con una
mezcla seca/húmeda de 15 ms; el preamp reserva margen según la respuesta
temporal del EQ. El volumen sigue su automatización de 20 ms en ExoPlayer.
Android desactiva audio offload y passthrough en estos players para mantener
la ruta decodificada; esto puede aumentar consumo de CPU/batería. El procesador
admite PCM intercalado de 16 bits o Float32 con 1–8 canales. Si Media3 entrega
otro formato, `scheduleCrossfade` devuelve `false` cuando se piden efectos y
el adaptador debe informar que no puede reproducirlos, sin convertir ese mix
en un cruce de sólo volumen. El EQ global Android sigue en el `AudioEffect`
de la sesión y su headroom combinado requiere escucha real.

El módulo compiló con Media3 1.9.0 y pasaron ocho pruebas Kotlin, incluidas
curvas de volumen, respuesta de EQ/filtros, límites y procesamiento de PCM16/Float32.
`package.json` usa `expo.autolinking.buildFromSource: ["expo-audio"]` para que
EAS/Gradle compile el Kotlin del parche en lugar del AAR precompilado. Falta
probar en dispositivos Android: MP3/AAC local y streaming, cues 0 y 0,25 s,
auriculares, pantalla bloqueada, pausa/seek/cancelación, buffer/reconexión,
formatos no admitidos y continuidad del EQ global. La compilación y pruebas
JVM no miden latencia ni mezcla audible del `AudioTrack` físico.

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
con la app/pestaña suspendida. Fuera de un crossfade, el SDK web aún devuelve
`isBuffering: false` y limita las emisiones de `timeupdate` por avance de
`currentTime`. Los eventos `waiting`/`stalled` sólo cancelan un cruce activo;
no hay todavía un pulso periódico de buffering para el reproductor normal.

## Crossfade con Web Audio

El reproductor web implementa el mismo `scheduleCrossfade` y `cancelCrossfade`
que iOS. Cada media element pasa por un `GainNode` después de su EQ. El nodo
usa `AudioParam.setValueAtTime` y `linearRampToValueAtTime` para programar la
curva completa en el reloj del `AudioContext`; no hay un intervalo JS que vaya
reescribiendo la ganancia. La ley `equal_power` se aproxima con 64 segmentos y
los puntos personalizados se interpolan entre sus tiempos exactos. El volumen
base de `player.volume` se conserva. Pausar mantiene la ganancia y reanudar
programa el tramo restante; seek, reemplazo, stall, error y cancelación sueltan
el cruce y dejan sonando la pista saliente.

El segundo `<audio>` todavía debe arrancarse con un callback JS al alcanzar
su cue. El evento `didJustCrossfade` también se entrega desde JS una vez que
el medio saliente cruza el fin de la ventana. Una pestaña completamente
suspendida puede demorar esos callbacks aunque la automatización de ganancia
ya esté programada. Ante falta de Web Audio, contexto suspendido, fuente sin
CORS configurado o grafo no utilizable, la promesa devuelve `false` para que
el adaptador use su reproducción de respaldo. [La especificación de Web Audio](https://webaudio.github.io/web-audio-api/)
define el reloj de `AudioParam` y exige silencio en `MediaElementAudioSourceNode`
para fuentes marcadas como CORS-cross-origin; tener `crossOrigin` configurado
y la fuente cargada es el requisito observable antes de conectar el grafo.

`node --test tests/expo-audio-crossfade-web.test.mjs` verifica la programación
de ambas ganancias, curvas, cues, pausa, cancelación, stall, CORS y entrega
única con media elements y `AudioContext` simulados. El esquema v1 instala
una rama temporal de tres `BiquadFilterNode`, un low/high-pass opcional y
mezcla dry/wet de 15 ms. Sus parámetros se automatizan con `AudioParam`;
el preamp temporal reserva una cota conservadora para cualquier realce de
bandas, multiplicada por el headroom del EQ global. La rama se desconecta al
finalizar y el EQ global conserva sus parámetros. Falta probar audio real
en Chrome, Safari y Firefox, incluida una pestaña en segundo plano.

## Validación

`node --test tests/expo-audio-patch.test.mjs tests/expo-audio-web.test.mjs`
verifica reversión/reaplicación de los archivos del parche sin fuzz, los contratos
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
