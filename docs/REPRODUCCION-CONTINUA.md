# Reproducción continua y precarga

El motor global conserva la cola y prepara la siguiente fuente para continuar
al terminar una pista. Las listas propias y colaborativas usan el mismo flujo;
la propiedad de la lista no decide cómo avanza el audio.

## Transición y recuperación

- iOS mantiene la sesión de audio. Cuando la siguiente pista está cargada,
  programa un handoff nativo de duración cero: AVPlayer espera el final real y
  arranca la entrante antes de notificar a JS, sin solapamiento. Si no se pudo
  armar, conserva el fin natural y su recuperación en JS, con una ventana breve
  de trabajo en segundo plano. El parche y sus límites están en
  [patches/README.md](../patches/README.md).
- Web emite el final de la pista desde el evento del elemento de audio; la cola
  no depende de `requestAnimationFrame` ni adelanta el corte según metadatos.
- Repetir una canción, o una lista de un solo tema sin cola manual, usa el loop
  del reproductor. En Jam el servidor sigue decidiendo la cola.
- Errores de reproducción y esperas de buffer sin progreso durante 15 segundos
  activan hasta dos recuperaciones por pista/intención de reproducción. Renuevan
  la fuente y conservan la posición; en Jam usan el tiempo objetivo compartido.
- La apertura inicial permite tres intentos de firma, cada uno con plazo de
  cinco segundos. Pausar, cambiar de pista o desmontar cancela los resultados
  pendientes. Cancelar no interrumpe físicamente una petición de firma ya enviada.
- Las URLs HTTP recordadas expiran a los 50 minutos, conservando la que está en
  uso. Una descarga terminada durante la canción no reemplaza su fuente.
- Los eventos del reproductor actualizan progreso e historial aunque no haya
  cuadros de interfaz. Se excluyen saltos y huecos largos sin eventos; no se
  inventa tiempo escuchado mientras JS está suspendido.

## Preparación de la cola

La ventana sigue el mismo orden que la reproducción, incluyendo cola manual,
shuffle y repetición. Con disco y conexión amplia apunta a diez minutos, con
un mínimo de dos temas cuando existen y un máximo de cinco. Con datos móviles
permitidos, o navegador sin almacenamiento de audio, el máximo es dos.

El trabajo comienza tras audio estable y 1,2 segundos de margen. Es secuencial,
respeta el límite de caché, la preferencia de datos y los cambios de conexión,
y cede prioridad cuando la pista actual está cargando. En web se evita trabajo
especulativo si el navegador informa ahorro de datos o conexión 2G.

En iOS se prepara además el AVPlayerItem de la siguiente canción, incluyendo
su fuente de red cuando todavía no existe una copia local.
`preferredForwardBufferDuration: 30` es un objetivo del SDK, no una garantía de
30 segundos listos. El resto queda en disco. Android conserva la preparación
en disco y evita el preload del SDK que copiaría el archivo completo a RAM.

## Diagnóstico y recomendaciones

Configuración → Reproducción → Diagnóstico de audio conserva los últimos
30 eventos en este dispositivo. Permite copiar el informe o borrarlo. Registra
categorías de fallo y códigos conocidos, sin URLs, credenciales, títulos ni
usuarios. Un aviso recibido en segundo plano vuelve a disponer de su tiempo de
lectura al regresar a la app.

Las recomendaciones barajan y deduplican los candidatos de cada artista antes
de elegir, manteniendo el límite de dos por artista y los vetos del historial
y la cola. Corregir el tiempo de escucha en segundo plano también mejora los
datos que alimentan la personalización.

## Validación y límite pendiente

Las pruebas automatizadas cubren cancelación, agotamiento y conservación de
posición, eventos antiguos, escucha sin RAF, orden/prioridad de precarga,
privacidad del diagnóstico y aplicación del parche sobre el SDK instalado.
Se ejecutan con `npm run check`; la exportación de Expo verifica el bundle,
pero no compila ni ejecuta Swift.

El SDK web no informa esperas de buffering periódicas: allí se recuperan
los errores emitidos, pero el detector de 15 segundos no cubre un stall sin
eventos. El navegador también puede suspender JS según su política de energía.

Hace falta un nuevo binario iOS y probar la matriz de pantalla bloqueada del
README del parche. El par ya preparado puede avanzar nativamente, pero JS
todavía actualiza la cola, los metadatos y prepara el siguiente par. Una fuente
no resuelta o una suspensión antes de prepararla puede impedir ese avance.
No equivale a una cola autónoma completa en AVQueuePlayer ni promete separación
cero entre pistas. Comprobar el binario nuevo con pantalla bloqueada, lista
colaborativa, ausencia de red y ahorro de batería.
