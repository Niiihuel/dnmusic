# YouTube: 403 durante la descarga y búsquedas

## Qué significa el error de la captura

`googlevideo respondió 403 al rango 1048576` significa que se recibió el primer
MiB y el CDN rechazó la siguiente solicitud. No es un error del buscador ni
prueba suficiente de que la IP esté bloqueada permanentemente.

BgUtils documenta una etapa que admite 1–2 MB antes de exigir un PO token válido.
El síntoma es compatible con ese mecanismo, aunque por sí solo no demuestra
si el problema es el token, el cliente, la sesión o una restricción del video.
Generar un token, su longitud y la ausencia de un fallback no demuestran que
el CDN vaya a aceptarlo.

Fuentes consultadas el 4 de septiembre de 2026:

- [BgUtils: generación de tokens y StreamProtectionStatus](https://github.com/LuanRT/BgUtils#when-to-use-a-po-token).
- [yt-dlp: PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide).
- [Electron: WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view).

## Cambios

- Electron genera los tokens en Chromium con una sesión independiente en memoria.
  El proceso Node recibe el mismo User-Agent y pide tokens por IPC. La vista
  no tiene preload, Node ni permisos; no recibe credenciales de dnmusic.
- La atestación usa conexión directa, igual que el fetch de Node del resolutor.
  Esto no configura ni modifica proxies del sistema o de la ventana principal.
- Los rangos se descargan en serie, se valida su tamaño y total, y una respuesta
  truncada nunca se aporta a Storage. Un 403 no se reintenta sobre la misma URL.
  403/429 pausan el proceso al menos un minuto; `Retry-After` puede alargarlo.
- Los pedidos duplicados de audio comparten resolución y subida. Las descargas
  de distintos videos esperan su turno.
- Las búsquedas y la navegación del catálogo tienen una sesión sin reproductor
  ni BotGuard. Las búsquedas de canciones y artistas comparten solicitudes
  idénticas en curso y resultados durante cinco minutos, con un máximo de 200
  resultados de consulta por tipo y proceso. En serverless no es un límite
  global entre instancias. La app conserva hasta 100 consultas por un minuto.
- Se mantiene el debounce que ya tenían las pantallas. Los resultados cacheados
  no se entregan a una búsqueda que ya fue cancelada.

## Verificación

```sh
npm test --prefix desktop
npm test --prefix server
npm run typecheck
```

Para probar el recorrido contra YouTube sin subir audio ni iniciar sesión en
el servicio de dnmusic:

```sh
cd desktop
npm run diagnostico:youtube -- nhys3nF4ZDU
```

El comando usa un perfil temporal, descarga a memoria y muestra cliente,
formato, cantidad de bytes y duración declarada. Necesita poder iniciar Electron
con las bibliotecas gráficas del sistema. No muestra tokens ni URLs firmadas.
Es una prueba de extracción y descarga; no ejercita el aporte a Storage ni la
reproducción completa de la interfaz.

En esta sesión, la búsqueda real devolvió `nhys3nF4ZDU` para **Reflections — The
Neighbourhood**. El diagnóstico descargó **3.951.534 bytes** en AAC (`YTMUSIC`,
itag 140), con duración declarada de **244.000 ms**, superando el punto de fallo
de la captura. No se subieron archivos al servidor.

Otro video de prueba (`aqz-KE-bpKQ`) recibió 403 a los 2 MiB. Por eso estos cambios
no equivalen a una garantía de ausencia de bloqueos. Esa prueba también mostró
fallos de inicialización de EGL en el entorno; no se aisló cuánto influyeron.
La aceptación debe verificarse con el video y la conexión donde ocurre el error.

El servidor y el motor móvil conservan sus resolutores de audio actuales; el
cambio de proveedor y política de descarga de este arreglo corresponde a Electron.
Los cambios de búsqueda se aplican a todos los clientes al desplegar el servidor.
Para que lleguen al escritorio instalado hay que reconstruir el bundle web y
el instalador siguiendo el proceso normal del proyecto.

## Diagnóstico ampliado

Desde `desktop/`, usá `npm run diagnostico:youtube -- --help` para ver todas las
opciones. También podés consultar la ayuda sin iniciar Electron:
`node scripts/diagnostico-youtube.cjs --help` (después de compilar).

| Modo | Comprueba | Descarga audio |
| --- | --- | --- |
| `entorno` | Versiones de Electron, Chromium y Node; estado de funciones GPU | No; tampoco consulta YouTube |
| `buscar` | Búsqueda directa desde esta computadora sin reproductor ni tokens | No |
| `token` | Generación de un token para un video | No; no demuestra aceptación del CDN |
| `formatos` | Cliente, disponibilidad de AAC, descifrado y preparación de URL | No |
| `descarga` | Todos los bloques, tamaño total y SHA-256 | Sí, solo a memoria |

Ejemplos independientes; elegí el que corresponda al fallo que investigás:

```sh
npm run diagnostico:youtube -- --modo entorno --json entorno.json
npm run diagnostico:youtube -- --modo buscar --consulta "The Neighbourhood Reflections" --json busqueda.json
npm run diagnostico:youtube -- nhys3nF4ZDU --modo token --json token.json
npm run diagnostico:youtube -- nhys3nF4ZDU --modo formatos --cliente YTMUSIC --json formatos.json
npm run diagnostico:youtube -- nhys3nF4ZDU --cliente YTMUSIC --json descarga.json
```

También se aceptan URLs `youtube.com/watch`, `youtu.be`, `shorts` y `embed`.
`--cliente` fuerza una sola opción y desactiva la selección automática para esa
prueba. Los clientes disponibles son YTMUSIC, MWEB, TV, TV_SIMPLY y WEB_EMBEDDED.
No todos ofrecen formatos utilizables para todos los videos.

Los clientes Android/iOS se retiraron del resolutor de escritorio: una
atestación web no es válida para esas plataformas, según la
[guía de PO tokens](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide#technical-details).
Los formatos con DRM se descartan. El token por video se reutiliza entre
`/player` y la descarga, y un fallo de generación interrumpe el intento.

Para investigar el tamaño de bloque y verificar el archivo:

```sh
npm run diagnostico:youtube -- nhys3nF4ZDU --cliente YTMUSIC --chunk-kib 512 --timeout 120 --ffprobe /ruta/al/ffprobe --json audio-validado.json
```

`--chunk-kib` admite 64–4096 KiB; el valor habitual sigue siendo 1024. Cambiarlo
sirve para comparar el punto de corte; no corrige por sí mismo una atestación
rechazada. `--timeout` fija un plazo total de 5–300 segundos. Ctrl+C cancela la
prueba. `--ffprobe` es opcional: requiere un ejecutable instalado y comprueba
que los streams sean AAC y que la duración difiera como máximo siete segundos
de la declarada. El archivo temporal se elimina al finalizar.

Los informes JSON incluyen configuración, versiones, tiempos por etapa,
intentos y respuestas de rangos, resultado o error clasificado. No contienen
PO tokens, cookies, URLs firmadas ni mensajes arbitrarios de dependencias.
Sí conservan la consulta de búsqueda y los títulos devueltos. Un informe
existente no se sobrescribe: elegí otro nombre para el siguiente intento.

Comparar informes guardados no hace solicitudes nuevas:

```sh
npm run comparar:youtube -- descarga.json audio-validado.json
```

La comparación muestra modo, cliente, segundos, bytes, rangos, reintentos,
punto de fallo, códec validado y SHA-256. Para atribuir una diferencia a un
cambio, mantené constantes video, conexión y cliente; la carga del servicio
y el estado del caché también pueden cambiar. El diagnóstico no inicia
bucles de pruebas ni cambia de cliente automáticamente después de un 403.

Durante la revisión se verificó nuevamente `nhys3nF4ZDU` con YTMUSIC:
**3.951.534 bytes**, cuatro respuestas HTTP 206, sin reintentos, AAC validado por
ffprobe y **244.013 ms** de duración medida (13 ms de diferencia). El SHA-256
fue `92c734086a63a96fecae6c5848a84d494b2bc1644e484bb45a8ea97d52b36fcf`.
Los informes locales se pueden guardar en `desktop/diagnosticos/`, ignorado
por Git.

La revisión también corrigió el timeout del evaluador de JavaScript: ahora
la invocación del código de descifrado queda dentro del plazo de `node:vm`.
Los rangos admiten cancelación y respetan `Retry-After` también en errores 5xx;
una espera de más de 30 segundos devuelve el error y pausa la cola.
