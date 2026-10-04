# Análisis musical v1

`GET /analysis?audioPath=<ruta>` analiza un archivo ya guardado en el bucket
privado `songs`. Requiere la misma sesión aprobada que `/peaks`. El servidor
comprueba la lectura de **esa ruta exacta** con el JWT de la persona antes de
abrir el resultado cacheado. No acepta URLs ni rutas de caché enviadas por el
cliente. El servicio cliente es `pedirAnalisisMusical` en
`src/services/analisisMusical.ts`.

La respuesta lleva `version: 1`, `audioPath`, `sourceVersion` (huella opaca),
`durationMs` y:

- `waveform.rms`: 256 valores de RMS normalizados al tramo más fuerte;
  `bucketMs` indica el ancho temporal aproximado de cada valor.
- `waveform.bands`: `low`, `mid` y `high`, 256 amplitudes de energía PCM por
  banda (0–160, 160–1000 y >1000 Hz), con la misma escala y tiempo que `rms`.
  Son datos para colorear la onda, no una inferencia de BPM ni tonalidad.
- `energy.meanRms`, `peakRms` y `dynamicsDb`: amplitud lineal y diferencia en dB
  entre el RMS máximo de una ventana de 20 ms y el RMS medio de la pista. **No**
  son LUFS ni true peak.
- `loudness`: `integratedLufs` y `truePeakDbtp` medidos sobre la primera pista
  de audio con sus canales originales. Es `null` si FFmpeg falla, vence el tiempo
  o devuelve valores no finitos. La clave sigue siendo `version: 1` para clientes
  existentes; el campo es opcional en el tipo cliente para tolerar respuestas
  anteriores. No se cambia ni se guarda audio normalizado.
- `silence`: fin de silencio inicial, inicio de silencio final y regiones de al
  menos 250 ms. El umbral combina −48 dBFS aproximados con el RMS de la pista;
  una cola de reverb débil puede clasificarse como silencio.
- `tempo`: `bpm`, `minBpm`, `maxBpm`, `confidence`, `varying` y
  `alternateBpm`. El BPM central y su rango se miden en ventanas de 30 s del
  PCM cuando hay periodicidad y suficiente acuerdo entre ventanas. Puede existir
  aunque `rhythm` sea `null`: en ese caso es una **estimación aproximada sin
  posiciones de beats**. `varying` indica que las ventanas discrepan más del
  2 %; no distingue un cambio real de tempo de incertidumbre de medición.
  `alternateBpm` muestra una lectura mitad/doble solo si también hay evidencia
  de autocorrelación. `confidence` es una puntuación heurística, no probabilidad.
  Si los ataques son insuficientes, irregulares o incompatibles entre secciones,
  `tempo` queda `null`.
- `rhythm`: BPM, confianza heurística (0..1) y tiempos de beats, solo cuando los
  ataques forman una grilla regular clara. `meter: 4` y `barMs` aparecen solo
  cuando hay un acento dominante cada cuatro pulsos. Si falta esa evidencia,
  el compás queda `null`; si el pulso es ambiguo, **todo** `rhythm` queda `null`.

No se devuelve tonalidad: este algoritmo no hace estimación armónica. El BPM
puede tener ambigüedad de mitad/doble tiempo; la confianza no es una
probabilidad calibrada. La grilla tolera variaciones leves pero no garantiza
downbeats ni exactitud en música con síncopas, rubato o intros sin percusión. Para esas
pistas, el editor de mixes debe permitir colocar marcadores manuales. No se
deben publicar transiciones automáticas a compás basándose en `rhythm:null`.

`ffprobe` limita el trabajo a archivos de hasta 20 minutos y 80 MiB. Una pasada
de `ffmpeg` decodifica mono a 8 kHz para onda, energía, silencios y ritmo. Otra
pasada usa `loudnorm` con `dual_mono=true` para obtener `input_i` e `input_tp`
del audio original; la salida normalizada se descarta. La medición de true peak
usa el sobremuestreo interno de FFmpeg a 192 kHz, por lo que es una estimación
del pico entre muestras y depende del decodificador y de la versión de FFmpeg.
`loudnorm` informa centésimas de dB, pero esos decimales no son una garantía de
precisión auditiva ni un limitador de picos. La opción `dual_mono` compensa un
archivo mono destinado a reproducción estéreo y no altera uno multicanal.

Las pasadas tienen límites de 20 s (`ffprobe`), 150 s (PCM) y 75 s (`loudnorm`);
esta última también se limita a un hilo de filtro/codec, 128 KiB de salida de
log y 20 minutos de audio. Si no puede completarse, se conservan las demás
mediciones y `loudness` es `null`. Una falla transitoria de medición no se
cachea, incluso si el PCM mono quedó a cero por cancelación entre canales. El
silencio que `loudnorm` confirma con niveles de entrada `-inf` sí admite
`loudness: null` en caché. Se admiten dos trabajos
distintos simultáneos por instancia; el exceso recibe HTTP 429 con
`Retry-After: 5`, mientras las peticiones de la misma huella comparten el
trabajo activo. Los aciertos de caché siguen disponibles durante esos dos
cálculos. Las lecturas simultáneas de caché se acotan a ocho huellas y se
comparten entre peticiones de la misma huella. El resultado cacheable se guarda en
`songs/analysis/v5/<sha256>.json`, con huella de ruta, versión y tamaño
del objeto. Reemplazar el audio cambia la clave. Esa caché se puede desalojar
antes que el audio cuando el bucket se llena. El análisis se vuelve a calcular
entonces. Si falla la reserva o la escritura de Storage, la respuesta entrega
el cálculo pero la siguiente petición deberá volver a calcularlo. No hace
falta una tabla ni una migración adicional.

El bucket `songs` debe aceptar `application/json` además de audio; eso ya lo
declara `20260903000000_ondas_en_el_bucket.sql`. Una base local iniciada antes
de esa migración puede calcular la onda y fallar silenciosamente al cachearla.
En contenedores Docker se usan los binarios de FFmpeg instalados por apt mediante
`FFMPEG_PATH` y `FFPROBE_PATH`: los ejecutables estáticos de npm pueden abortar
al abrir una URL firmada dentro de ese runtime. Vercel usa los estáticos porque
allí no está disponible apt.

El editor pide primero `/analysis`. Si este servicio falla y la canción tiene
un `videoId` de catálogo, `pedirOndaDeMix` puede mostrar los picos medidos por
`/peaks`; deja vacíos ritmo, silencios y LUFS. Las canciones propias requieren
su `audioPath` y un `/analysis` funcional: nunca se dibuja una onda sintética.

Los campos de entrada, `dual_mono`, `print_format` y el sobremuestreo están
descritos en la [documentación oficial de loudnorm](https://ffmpeg.org/ffmpeg-filters.html#loudnorm).
[EBU R 128](https://tech.ebu.ch/docs/r/r128.pdf) identifica LUFS con LKFS de
ITU-R BS.1770; esta API usa el nombre LUFS.

La autorización de Storage sigue sus políticas RLS: [acceso a Storage](https://supabase.com/docs/guides/storage/security/access-control)
y [metadatos `info()`](https://supabase.com/docs/reference/javascript/file-buckets-info).

## Onda detallada de una canción propia

`GET /peaks?audioPath=<ruta>&desdeMs=<entero>&durMs=<entero>&buckets=<entero>`
devuelve `{ peaks: number[], bands: { low, mid, high }, durationMs: number }`,
igual que la variante
existente con `videoId`. `desdeMs` empieza en cero, `durMs` admite de 250 a
30 000 ms y `buckets` de 40 a 600. El fin del tramo no puede superar cuatro
horas. `durationMs` es la duración que FFmpeg pudo decodificar realmente; puede
ser menor al tramo pedido cerca del final del archivo. Las barras son RMS
normalizado dentro del tramo, medido del PCM mono a 8 kHz.

La ruta acepta solo claves finales de audio que también acepta `/analysis`,
incluida `propias/<uuid>.<ext>`. Rechaza cuarentenas, rutas de caché y URLs. Cada
pedido comprueba la lectura exacta con el JWT del usuario **antes** de consultar
la caché en memoria; la URL firmada también se crea con ese JWT. Nunca se usa
`service_role` para autorizar o firmar el audio. El cálculo dura hasta 45 s,
mantiene a lo sumo dos rangos activos por instancia y responde 429 con
`Retry-After: 5` si se llenan los cupos. Las peticiones simultáneas del mismo
archivo, versión y tramo comparten cálculo. Solo se cachean resultados válidos
en memoria durante cinco minutos, con un máximo de 32 tramos; no se guarda una
copia permanente ni se registra la URL firmada.
