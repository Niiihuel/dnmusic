# Plan de producto y ejecución: ecualizador musical y mixes de playlists

Fecha de investigación: 24 de septiembre de 2026. Estado: implementación local avanzada; falta validar en dispositivos y desplegar.

## Estado de ejecución

Este documento conserva el objetivo completo y el punto de partida original. La implementación actual en el repositorio cubre:

- **Ajustes:** EQ musical global de diez bandas con presets personales y comparación A/B; transición global Normal, Sin pausa o Crossfade. La categoría Reproducción y su búsqueda describen estas opciones y dirigen a «Mixear» para cada playlist.
- **Playlists:** perfil tonal publicado de diez bandas, preamp, presets como punto de partida y bypass personal; múltiples variantes de Mix, selección individual, visibilidad para colaboradores, publicación por el dueño, transiciones por pareja y copia con IDs remapeados. La lista muestra la transición elegida y el BPM medido: una cifra sin marca si existe una rejilla fiable, `≈` si solo hay una estimación de tempo. Las acciones de cada tema viven en su menú.
- **Editor:** página completa en PC y móvil; barra lateral plegable y redimensionable en PC; selector compacto de versión/par en móvil para priorizar ambas ondas. Muestra portadas y BPM por pareja, vista general más onda ampliada del cruce con energía real de graves, medios y agudos, beats/compases medidos, cues arrastrables y numéricos, y 1/2/4/8/16 compases cuando son fiables y caben en el cruce. Las pestañas Volumen/Ecualizador/Filtro usan el componente Liquid Glass de la app. Cada deck tiene curvas editables de hasta 16 puntos: tocar para añadir, arrastrar en tiempo y valor, eliminar o introducir cifras; los cambios alimentan la preescucha y el plan de reproducción. Incluye presets de EQ/filtro temporal accesibles junto a las ondas, preescucha de dos canciones, comparación sin transición, deshacer/rehacer por gesto y diálogo propio al salir con cambios sin guardar. Si otra sesión guarda el mismo par, se ofrece guardar los cambios en una copia del Mix. Auto usa análisis PCM conservador; sugerir orden usa BPM y energía con vista previa y aplicación atómica.
- **Motor:** dos decks estables, plan del par real, precedencia Mix → transición global, EQ personal + perfil de playlist, cancelación ante seek/cambio de cola, entrega única y omisión de Jam/espejo. iOS usa Swift y DSP PCM; web programa volumen/EQ/filtro con Web Audio; Android programa cues y volumen en ExoPlayer y procesa EQ/filtro por deck en PCM16/Float32 de Media3. El parche de `expo-audio` se compila desde fuente en Android.
- **Backend:** migraciones de Mix y reordenamiento con RLS/revisiones, aplicadas y verificadas en Supabase local; `/analysis` mide onda y energía de tres bandas, silencio, estimación de BPM por ventanas aun sin beatgrid y grilla solo con confianza suficiente, además de LUFS integrado y pico real cuando FFmpeg puede medirlos. La caché v5 invalida el detector anterior. `/peaks` ofrece tramos PCM de alta resolución para el editor, incluidos audios propios tras comprobar acceso a la ruta exacta. Cachea por fuente/versión y limita el trabajo pesado concurrente. El servicio local se reconstruyó y respondió sano. Pruebas SQL, JavaScript, DSP portátil, Kotlin y exportación web pasaron localmente.

**Pendiente para cerrar el objetivo completo:** desplegar las migraciones y el servicio de análisis fuera del entorno local; compilar y escuchar en iPhone/Android reales (en especial pantalla bloqueada, Bluetooth, pausa, interrupciones, latencia de DSP Android y true peak); limitador maestro de pico y normalización LUFS sobre la medición ya disponible; detección fiable de tonalidad, edición manual de beatgrid, sincronización offline de borradores/presets y cola/metadatos de handoff totalmente nativos. «Sugerir orden» compara ritmo y energía, sin afirmar compatibilidad tonal. El editor aún no tiene ajuste de velocidad con preservación de tono ni sincronización de beats forzada, por lo que la diferencia de BPM se presenta como guía y no como garantía de empalme. El Mix no se activa por defecto hasta completar QA física.

## 1. Resultado buscado

DMusic debe permitir ajustar **solo la música** en tres capas independientes:

1. **Ecualizador personal global:** modifica las canciones que reproduce DMusic en este dispositivo, vengan de una playlist, búsqueda, «Tus me gusta» o cola. No procesa mensajes de voz, audio de chat, video ni sonidos del sistema.
2. **Sonido de la playlist:** curva tonal opcional que caracteriza todas las canciones de esa playlist. Se guarda con la playlist, se puede escuchar antes de publicarla y el oyente puede ignorarla sin perder su ecualización personal.
3. **Mix de playlist:** una o varias versiones nombradas de la secuencia, cada una con ajustes generales y transiciones editables para cada pareja de canciones. El EQ de una transición solo actúa durante el solapamiento de esas dos canciones.

Además habrá ajustes musicales globales de **transición** (sin pausa, crossfade de duración fija o desactivado) para la reproducción que no tenga un Mix aplicable. Estos ajustes no son el ecualizador tonal.

### Qué muestran las cinco capturas

- La captura de la playlist muestra **Mixear**, metadatos de BPM/tonalidad y una fila de transición entre dos canciones.
- Las capturas del editor muestran formas de onda de salida y entrada, puntos de inicio, una ventana de **4 u 8 compases**, reproducción previa y curvas.
- La hoja «Ecualizador» de las capturas elige una **automatización de graves/medios/agudos durante la transición**. No es el EQ general de Ajustes.
- La captura marcada en rojo muestra un mix personalizado con ajustes separados de **Volumen**, **Ecualizador** y **Filtro**. Los nombres y presets de esa interfaz beta son referencias visuales, no un formato de datos que debamos copiar.

## 2. Referencia contrastada de Spotify

Spotify documenta un [EQ de reproducción](https://support.spotify.com/es/article/equalizer/) con interruptor, presets y ajuste manual en iOS, Android y ordenador. También documenta [Crossfade, Automix y reproducción sin pausas](https://support.spotify.com/es/article/tracks-transitions/) como ajustes de transición generales. Son controles distintos.

Su [Mix de playlists](https://support.spotify.com/es/article/mixed-playlists/) aplica Auto al activar la función, muestra BPM y tonalidad, permite editar la transición de cada pareja con volumen, EQ de tres rangos y filtros pasa-bajo/pasa-alto, y conserva las transiciones al apagar y volver a encender Mix. La edición requiere conexión. El producto se ofrece en móvil y ordenador; las listas colaborativas admiten edición por colaboradores. Bluetooth mantiene las transiciones y Spotify Connect reproduce la lista normal. El [anuncio de lanzamiento](https://newsroom.spotify.com/2025-08-19/mix-your-favorite-playlists-seamlessly-by-adding-your-own-transitions/) confirma onda, datos de beats, presets y curvas. [Smart Reorder](https://newsroom.spotify.com/2026-02-25/smart-reorder-playlist-mixing/) reordena según BPM y tonalidad.

La [normalización de volumen](https://support.spotify.com/us-es/article/volume-normalization/) también es un ajuste de reproducción separado. No encontré EQ tonal persistente por playlist en la documentación de Spotify; sigue propuesto en una [idea de su comunidad](https://community.spotify.com/t5/Live-Ideas/Add-a-equalizer-config-in-playlist/idi-p/7424208). El perfil tonal por playlist y varios mixes guardados serían mejoras propias de DMusic. Esta conclusión es una inferencia de documentación pública, no una afirmación sobre la implementación interna de Spotify.

La referencia de [Waveform de ElevenLabs](https://ui.elevenlabs.io/docs/components/waveform) usa Canvas, adapta su densidad al ancho y separa los datos de audio de `currentTime`/`onSeek`. [Live Waveform](https://ui.elevenlabs.io/docs/components/live-waveform) captura micrófono y [Bar Visualizer](https://ui.elevenlabs.io/docs/components/bar-visualizer) consume un `MediaStream` para un medidor de frecuencias: ninguno reemplaza la línea de tiempo de dos canciones. En DMusic conservamos PCM real, paths SVG memorizados y gestos Reanimated que funcionan también en iOS/Android; durante la preescucha movemos solo los cursores con el tiempo real de cada deck. Dos decks estables evitan volver a descargar audio al mover un cue. La onda de detalle conserva la escala de intensidad de la vista general cuando hay suficientes muestras para compararlas y evita dibujar intensidad inventada si faltan.

## 3. Punto de partida en DMusic antes de esta implementación

- **EQ musical:** ya hay diez bandas de 31 Hz a 16 kHz, ±12 dB, siete presets y persistencia local en `src/state/ecualizador.ts`, con UI iOS/Android/web y DSP por plataforma en el parche de `expo-audio`. Faltan presets personales nombrados, preamplificación visible, comparar A/B, perfil por playlist y reglas de composición.
- **Reproducción:** `src/ui/MotorAudio.tsx` usa un `useAudioPlayer` para la canción actual, precarga URLs y controla cola, volumen, Jam, segundo plano y pantalla bloqueada. Faltan dos pistas simultáneas, automatización por pista y entrega de control sin duplicar el avance ni perder metadatos.
- **Playlists:** `src/ui/PlaylistView.tsx` muestra la lista; `src/services/playlists.ts` y `playlist_tracks` guardan ID estable de fila, orden, duración, ruta y `true_peak`. Faltan configuración de Mix, variantes, transición por pareja, selección/publicación y permisos.
- **Análisis:** `/peaks` produce una onda de amplitud para dibujar. Faltan BPM con confianza, beats/downbeats, compás, tonalidad, energía por bandas, silencios, LUFS y waveform útil para el editor.

El EQ actual es **real**, no un mockup. El mayor trabajo de las capturas es crear un **motor de mezcla de dos fuentes**. `expo-audio` puede facilitar reproducción continua, pero su API de playlist no entrega por sí sola las dos ganancias, filtros y curvas independientes que necesita este editor. [Documentación de Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/).

## 4. Comportamiento de producto

### 4.1 Ajustes globales de música

- Mantener el EQ de diez bandas. Añadir presets personales: crear desde la curva actual, nombrar, duplicar, renombrar y borrar. Guardar la selección activa **por dispositivo**; sincronizar la biblioteca de presets con la cuenta si se habilita ese servicio.
- Mostrar preamplificación/headroom y un indicador de posible saturación. El control «Comparar» alterna temporalmente procesado y señal original sin cambiar el interruptor ni perder la curva. Restablecer afecta únicamente la curva en edición.
- Agregar «Transiciones entre canciones»: Apagado, sin pausa o crossfade global con duración en segundos. Agregar normalización de volumen como control independiente cuando se midan LUFS/true peak; no presentar un control que todavía no procese audio.
- Aplicar el EQ global solo a la salida musical local. Si la música suena en otro dispositivo, la UI muestra cuál debe ajustarse. Los mensajes de audio y cualquier otro reproductor quedan fuera de este grafo.

### 4.2 Sonido de una playlist

- Fila «Sonido de esta playlist» desde la cabecera/menú de la playlist. Estado inicial: **Usar sonido original**. Se puede elegir un preset, copiar la curva global como punto de partida o ajustar diez bandas; queda claro si el cambio será compartido.
- La curva de playlist es una decisión creativa **del autor**, mientras que el EQ global es una preferencia de escucha **del dispositivo**. La señal musical pasa primero por el perfil de playlist y, al final, por el EQ personal. Mostrar ambas capas en la UI. Usar headroom conjunto: no sumar decibeles a ciegas.
- El propietario puede publicar la curva compartida. Quien escucha dispone de «Respetar sonido de playlists» y de un bypass para esa playlist; su EQ personal sigue activo. Los colaboradores pueden proponer cambios, pero la publicación predeterminada corresponde al propietario para evitar sorpresas a todos los oyentes.
- El perfil se aplica cuando la pista procede de esa playlist. Si una canción se abre desde búsqueda o se encola manualmente fuera de ella, se usa solo el EQ personal.

### 4.3 Mixes de una playlist

- Botón principal **Mixear** en la cabecera cuando hay al menos dos canciones. Activarlo ofrece «Auto» y abre la vista de secuencia; apagarlo conserva los mixes. La lista normal sigue disponible.
- Permitir varios mixes nombrados por playlist: **Nuevo desde Auto**, **Duplicar**, **Renombrar**, **Editar**, **Eliminar** y **Publicar como predeterminado**. Cada persona puede elegir el mix que quiere escuchar o desactivarlo para sí. Publicar uno no borra los otros.
- La vista muestra BPM, tonalidad y confianza del análisis cuando existe; cada unión de canciones presenta un resumen como «Auto · 4 compases» o «Personalizada». El usuario puede entrar directamente desde esa fila.
- El propietario elige el mix publicado. Colaboradores pueden crear y editar sus variantes según permisos; un cambio concurrente usa revisión/versionado y ofrece guardar copia cuando hubo conflicto.
- Para una playlist compartida, copiar la playlist puede copiar también sus mixes publicados como nuevas entidades; nunca se conservan referencias a IDs de filas de la playlist original.

### 4.4 Editor por pareja de canciones

- Cabecera con canción que sale y canción que entra, navegación anterior/siguiente, **Escuchar**, **Comparar original**, **Deshacer/Rehacer**, **Restablecer transición** y **Guardar**. Guardar es explícito; al salir con cambios se ofrece conservar borrador o descartarlo.
- Dos ondas con zoom accesible, rejilla de beats y compases, posición de reproducción, puntos de salida/entrada arrastrables y lectura de duración tanto en **compases** como en **segundos**. Opciones iniciales de 1, 2, 4 y 8 compases; duración libre en segundos cuando no hay beatgrid confiable.
- Presets funcionales: **Auto**, **Fade**, **Crescendo**, **Fusión** y **Sin transición**. Cada preset genera valores/curvas editables; al modificarlo se rotula «Personalizada». Los presets son identificadores versionados, no nombres traducidos guardados en la base.
- Volumen: curvas separadas de salida y entrada, puntos editables, opción lineal o de potencia constante. EQ de transición: automatización de graves, medios y agudos por pista. Filtros: paso bajo y paso alto con frecuencia/corte y curva. Todos tienen bypass independiente.
- La vista previa usa el **mismo plan ejecutable** que la reproducción final. Las curvas dibujadas nunca son solo decoración. Mostrar un aviso útil si falta la fuente entrante o el análisis; permitir un fade simple como alternativa.

### 4.5 Auto y orden inteligente

- Auto analiza intro/outro, silencio, beats, energía, BPM y tonalidad. Elige puntos y longitud, reduce choque de graves y nivela ambas pistas; no estira el tempo de forma oculta. Si la confianza es baja, usa crossfade por segundos sin prometer sincronización musical.
- «Sugerir orden» calcula una propuesta por BPM, tonalidad y energía; muestra **antes/después** y pide aplicar. No modifica una playlist automáticamente. Los cambios de orden invalidan la aplicación de transiciones de pares que ya no son adyacentes, sin borrar sus datos.
- Edición manual de beatgrid/cue para corregir detecciones fallidas. El ajuste fino de tempo con conservación de tono queda para una etapa posterior tras medir calidad audible y CPU en dispositivos modestos.

### 4.6 Composición de las pantallas

- **Ajustes → Reproducción → Ecualizador:** interruptor y nombre de la curva arriba, gráfica de diez bandas y valor en dB, presets personales debajo, acciones Comparar/Restablecer y explicación de que afecta solo música. Los ajustes de transición y normalización viven en filas separadas de Reproducción. Se aprovechan las pantallas existentes, sin crear una segunda ruta de EQ global.
- **Playlist:** botón Mixear junto a reproducir; cuando hay un mix seleccionado, muestra su nombre y estado. Un menú «Mixes» permite cambiar versión, crear o duplicar. La fila entre canciones es una acción real con resumen de preset/duración; la lista continúa legible sin abrir el editor.
- **Editor móvil:** barra con cerrar, nombre del par y Guardar; zona central de ambas ondas con zoom y controles de cue; botón Escuchar persistente; tira horizontal de presets; secciones desplegables Volumen, EQ y Filtro con alternativa numérica al gesto. iOS usa una hoja acorde al sistema; Android conserva la misma jerarquía con componentes propios.
- **Editor de escritorio/web:** ondas más anchas y panel de parámetros al costado, atajos para reproducir/pausar, mover un beat, deshacer/rehacer y guardar. Cualquier parámetro se puede editar con teclado y lector de pantalla; no se depende del color de las curvas para distinguir pista saliente y entrante.
- Respetar la paleta acromática, tamaño táctil y convenciones de hojas de `docs/DESIGN.md`. El editor Mix reserva azul/naranja/violeta para la energía espectral medida de graves, medios y agudos; conserva envolvente de amplitud, contraste y etiquetas textuales. No aplica esos colores al resto de la interfaz ni los inventa si falta análisis.

## 5. Reglas de reproducción y precedencia

1. Solo una pista del **motor musical** puede activar estas reglas. Audio de mensajes, videos y sonidos de interfaz no entra en ellas.
2. En una canción: `audio original → nivelación/headroom por pista → perfil tonal de playlist, si corresponde → DSP temporal de transición, si está solapando → ganancia del deck → suma de decks → EQ personal global → protección final de pico → volumen del usuario → salida`.
3. Para escoger transición: ajuste manual del **par real de filas** en el mix seleccionado; si no hay, Auto/preset de ese mix; si no hay mix, transición musical global; si está apagada, fin normal o sin pausa según ajuste. El EQ personal no se sustituye por el EQ temporal.
4. El par real lo decide la cola en ese momento. `shuffle`, `upNext`, repetición, recomendaciones y Jam pueden alterarlo. Un ajuste manual solo se aplica si coinciden **ambos ID de fila**, la playlist de origen y la revisión de cola; en otro caso se recalcula o se usa el fallback.
5. Un salto manual, seek fuera de la ventana, cambio de playlist o fallo de la siguiente fuente cancela el plan pendiente. El handoff de A a B confirma el avance **una sola vez**. Pausa y reanudación congelan/continúan ambos decks de forma coherente.
6. `repeat one` no mezcla la pista consigo misma. Las canciones en `upNext` externas a la playlist usan la regla global; la radio recomendada no hereda el mix de la playlist anterior. En Jam, el host decide el avance; el oyente espejo no aplica DSP local a un audio que no reproduce.
7. El EQ global activo sigue siendo personal y local. Si el dispositivo no soporta alguna técnica, la UI informa el modo real y cae a una transición simple o a reproducción normal; nunca muestra curvas avanzadas mientras suena algo distinto.

## 6. Arquitectura y persistencia

### Motor de dos decks

- Extraer de `MotorAudio.tsx` una fachada única para UI, cola, controles del sistema e historial. Por dentro, `DeckController` mantiene A y B estables y estados `preparar → listo → solapar → entregar → liberar`, con un `TransitionPlan` inmutable por `queueRevision + fromTrackRowId + toTrackRowId`.
- Ampliar `PlaybackOrigin` para distinguir playlist propia, playlist abierta por enlace, favoritos y reproducción suelta. Hoy la ruta pública `app/lista/[id].tsx` arranca con `origin: null`; sin corregirla no podría aplicar con seguridad su mix ni su perfil tonal.
- Preparar URL firmada y fuente local del siguiente tema con la precarga existente. Programar las ganancias y filtros **en el reloj de audio**, no con renders o timers JS. La web puede usar [Web Audio y AudioParam](https://webaudio.github.io/web-audio-api/) sobre dos fuentes; comprobar CORS y rechazos de `play()`.
- Para iOS, probar primero una transición audible con el teléfono bloqueado y la app en segundo plano. La cola actual vive en JS; si iOS la suspende, un crossfade orquestado solo desde React no será fiable. El resultado de esta prueba decide cuánto scheduler/cola hay que llevar al módulo nativo. Android requiere prueba equivalente con Media3 y rutas de audio cambiantes.
- El EQ actual se aplica por reproductor. La cadena ideal coloca el EQ personal tras sumar los decks; si la plataforma no lo permite, aplicarlo igual a ambos decks y medir diferencia/headroom. Para filtros/EQ paramétricos iguales entre plataformas, Android puede necesitar DSP PCM propio en lugar del ecualizador del fabricante. Esto puede afectar audio offload y batería: medirlo antes de fijar la implementación.

### Datos sugeridos

- `user_audio_preferences`: transición global, normalización y preferencias de escucha sincronizables. El EQ activo sigue local; los presets personales pueden sincronizarse aparte.
- `playlist_sound_profiles`: curva tonal compartida, estado publicado, autor y revisión. Una por playlist; el oyente puede omitirla localmente.
- `playlist_mixes`: muchas variantes por playlist con ID, nombre, creador, visibilidad, preset/duración general, versión y estado. La playlist apunta al mix publicado por defecto.
- `playlist_mix_edges`: una transición por `mix_id + from_playlist_track_id + to_playlist_track_id`, con cues, duración, curvas normalizadas, versión de preset y modo Auto/manual. Se guardan ID estables de fila, nunca índices de la lista.
- `user_playlist_mix_choices`: selección o bypass personal, separado del mix publicado.
- `music_analysis`: análisis por huella de audio y versión del algoritmo, con BPM/confianza, beats/downbeats, compás, tonalidad/confianza, silencios, energía por bandas, LUFS, true peak y datos reducidos de onda.

Crear migraciones Supabase con RLS: dueño y colaboradores autorizados escriben borradores según rol; el dueño publica; quien puede leer la playlist puede leer el mix publicado; los mixes privados solo los ve su creador. Al borrar una pista, se eliminan sus transiciones mediante FK; al reordenar, las de pares que dejan de ser vecinos quedan inactivas y vuelven a funcionar si el par se recompone. Guardar JSON de curvas con esquema/versionado y límites numéricos validados en cliente y servidor.

El análisis se hace **en servidor** sobre el audio completo. `/peaks` es una onda normalizada para dibujo y no basta para BPM, tonalidad o LUFS. Calcular beatgrid y tonalidad con una biblioteca cuya licencia sea compatible; [Essentia](https://essentia.upf.edu/licensing_information.html) exige revisar su licencia antes de incorporarla. Para niveles, usar mediciones según [ITU BS.1770](https://www.itu.int/rec/R-REC-BS.1770-5-202311-I) / [EBU R128](https://tech.ebu.ch/publications/r128). Cachear por contenido+versión, no por título de canción.

## 7. Entregas en orden

- **Fase 0 — Prueba técnica:** dos pistas solapadas con fade de cuatro segundos en web, Android e iOS bloqueado; pausa, salto y entrega de control correctos. Se avanza al editor cuando se demuestra audio real y estabilidad de fondo.
- **Fase 1 — Fundaciones:** fachada de reproducción, dos decks, `TransitionPlan`, fallback, mediciones, pruebas de cola y ajustes globales de transición. Se cierra cuando el motor reproduce exactamente el plan declarado.
- **Fase 2 — EQ musical 2.0:** presets personales, A/B, headroom, perfil tonal opcional por playlist y preferencias de escucha. Se cierra cuando no altera mensajes ni otras fuentes y no satura al combinar capas.
- **Fase 3 — Mix de playlist básico:** esquema 1:N, crear/duplicar/seleccionar/publicar mixes, botón Mixear, filas de transición, presets simples y editor de cues/volumen con vista previa. Se cierra cuando guardar, reabrir y compartir conservan el resultado audible.
- **Fase 4 — Mix musical avanzado:** análisis BPM/beatgrid/tonalidad/energía, ondas por bandas, EQ y filtros automatizados, Auto y sugerir orden con confirmación. Se cierra tras evaluar calidad y fallback con canciones reales de varios géneros.
- **Fase 5 — Robustez y alcance:** colaboración con revisiones, descarga y edición offline con sincronización posterior, accesibilidad, web/escritorio y optimización de CPU/batería. Se cierra con la matriz de regresión aprobada en dispositivos reales.

El modelo de múltiples mixes y la precedencia se definen desde la fase 1, aunque la UI de variantes aparezca en la fase 3. Esto evita una migración destructiva desde un diseño de «un solo mix por playlist».

## 8. Criterios de aceptación y pruebas

- **Alcance:** al cambiar EQ global, se oye el cambio en música de playlist, búsqueda, favoritos y cola; un mensaje de voz simultáneo no cambia. Apagar el EQ recupera sonido original sin borrar su curva.
- **Persistencia:** presets personales, perfil publicado, variantes de mix, transiciones manuales y bypass sobreviven a cerrar/reabrir; otro dispositivo recibe lo compartido, conserva su EQ personal.
- **Fidelidad:** el audio coincide con las curvas visibles; no hay salto brusco, silencio ni clipping audible al pasar A→B. Medir la salida capturada, incluyendo true peak y el instante de handoff, con material fuerte y silencioso.
- **Cola:** transición correcta con orden normal, aleatorio, `upNext`, repetir una/lista, seek, pausa, saltos rápidos, radio, lista modificada durante reproducción, URL vencida y canción entrante que falla. Nunca se cuenta o avanza dos veces.
- **Plataformas:** prueba real en iPhone bloqueado/segundo plano e interrupciones, Android con cambio de auriculares/Bluetooth, web con CORS y Electron. Verificar pantalla bloqueada, controles remotos, historial, Jam, dispositivo espejo y descargas.
- **Datos/permisos:** RLS impide editar un mix ajeno sin permiso; conflictos de colaboración no pisan cambios; borrar/reordenar pistas no aplica una transición al par equivocado; importación/copia no deja referencias cruzadas.
- **Accesibilidad:** controles de al menos 44 px en móvil, etiquetas de valor y unidad, edición con teclado en web, contraste y alternativa numérica a arrastrar curvas, reducción de movimiento.

## 9. Decisiones ya cerradas y riesgos por resolver con la fase 0

- Cerrado por producto: **solo música**; EQ global personal; perfil tonal opcional por playlist; automatización temporal por pareja; varios mixes por playlist.
- Riesgo principal: la reproducción actual de un solo player y una cola en JS no garantizan mezclas en segundo plano. La prueba de iOS bloqueado es la puerta técnica del proyecto.
- Riesgo de análisis: BPM solo no define «4 compases»; se necesitan beats, downbeats, compás y confianza. Auto debe fallar hacia un fade sencillo.
- Riesgo de sonido: dos pistas y varias capas de EQ pueden saturar. Normalización, headroom y medición forman parte del motor, no solo de los ajustes visuales.
- Riesgo de integración: imports de playlists de Spotify traen canciones, pero no sus curvas de Mix mediante la API pública. DNMusic debe analizar su propio audio y guardar sus propios mixes.
