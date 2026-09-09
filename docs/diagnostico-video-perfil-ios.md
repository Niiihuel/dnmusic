# Video como fondo de perfil en iOS · 9 de septiembre de 2026

Investigación de selección, subida y reproducción, sin dispositivo iOS conectado.
No se desplegó, no se modificaron cuentas ni se consultó el bucket remoto.
Se conservaron los cambios previos del editor y `perfilEdicion`.

## Evidencia y corrección

Versiones inspeccionadas en `node_modules`: `expo-image-picker` 57.0.8,
`expo-file-system` 57.0.2, `expo-video` 57.0.2 y React Native 0.86.2.

- **Permisos e iCloud.** `pickImage` dejaba el preset por defecto, `Passthrough`.
  El comentario que afirmaba que nunca se requiere permiso de Fotos era
  incompleto: Expo documenta una excepción para videos sin edición y con ese
  preset. En el Swift instalado, `MediaHandler.handleVideo` intenta copiar el
  recurso original mediante `PHAssetResourceManager`; su permiso de red viene
  de `shouldDownloadFromNetwork`, que por defecto es `false`. Con acceso al
  PHAsset y el original solo en iCloud, esa copia puede fallar antes de subir.
  Ahora, para selección con videos en iOS, se pide exportación
  `H264_1280x720` y se habilita descarga de red. La ruta de exportación usa
  `NSItemProvider`, copia el recurso temporal y entrega un MP4 con H.264/AAC.
  Evita depender del acceso al original y reduce el peso de un fondo de cámara.
  No exige permiso global de Fotos antes de abrir PHPicker. El preset afecta
  videos; se mantiene `allowsEditing: false` en el fondo, conservando los GIF.
  Referencias: [permisos de videos](https://docs.expo.dev/versions/latest/sdk/imagepicker/#invoke-permissions-for-videos)
  y [opciones del selector](https://docs.expo.dev/versions/latest/sdk/imagepicker/#imagepickeroptions).

- **Archivo local y MIME.** Antes se priorizaba `asset.fileName` y cualquier
  MIME de imagen/video del asset; si faltaban los metadatos, se podía etiquetar
  un video como JPEG. Ahora se prioriza la extensión reconocida de la copia
  local exportada, con metadatos como alternativa. Un video de formato
  indeterminado produce un error explícito. Se lee con `File.arrayBuffer()`
  en lugar del recorrido `fetch(file://)` → Blob → base64 de RN; se comprueba
  el límite de 25 MiB antes de cargar el archivo en JS y se rechazan archivos
  vacíos. Esta sustitución evita copias intermedias, pero no demuestra que
  `fetch` fuera la causa del caso reportado.
  Referencia: [FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/).

- **Subida y selección del render.** La ruta del objeto se construía desde el
  nombre recibido, aunque el MIME indicase video. Por ejemplo, nombre `Clip`
  con MIME `video/mp4` producía una extensión `.clip`, que `esVideo` no reconocía:
  un archivo subido correctamente terminaba en el renderer de imágenes.
  Ambas subidas ahora asignan `.mp4` o `.mov` según el MIME. Los bytes nativos
  siguen siendo ArrayBuffer y el PUT manda el Content-Type explícito.
  Se añaden rechazo de archivos vacíos y manejo de timeout/aborto; ninguno
  informa progreso final exitoso. `esVideo` ignora query y fragmento de URL.
  La migración local `20260811040000_medios_mas_grandes.sql` ya acepta
  `video/mp4`, `video/quicktime` y 26.214.400 bytes. **La consulta de lectura en
  `supabase_db_dany` confirmó esos MIME y ese límite en `showcases`, público.**
  `avatars` acepta solo imágenes, con 8 MiB. No hicieron falta cambios SQL;
  la configuración remota sigue sin verificar.

- **Reproducción.** El constructor instalado de `useVideoPlayer` ya carga
  asíncronamente y conserva el intento de reproducción mientras carga. No se
  atribuye el fallo a una carga síncrona ni a falta de `mixWithOthers`, que ya
  estaba configurado. Faltaba observar errores de AVPlayer: el componente
  ahora muestra un aviso si el estado es `error`, vuelve a reproducir cuando
  está listo y corresponde animarlo, y se pausa/reanuda con `useAppActiva`.
  Mantiene mute, loop, cover y mezcla de audio; deshabilita Now Playing para
  el fondo y análisis de cuadros. Una URI nueva monta un componente nuevo,
  sin arrastrar el estado de error anterior. `playsInline` cubre la variante
  web (no corrige por sí solo el VideoView nativo).
  Referencia: [Expo Video](https://docs.expo.dev/versions/latest/sdk/video/).

## Verificación y límites

`tests/perfil-video-ios.test.mjs` ejecuta el código TypeScript real con picker,
FileSystem, Storage/XHR y player simulados: 14 pruebas, incluidas selección →
subida → detección como video, MIME/extensión, cancelación, errores de lectura,
tamaño, PUT, progreso, timeout, aborto, estado nativo y cambio de URI.
Las mismas pruebas fallan sobre los tres archivos de HEAD anteriores al cambio.
Esto es evidencia de regresión de JS; no emula PhotoKit ni decodifica un video.

La ejecución conjunta con las regresiones del perfil, Discord, probador,
mosaico y vitrinas pasó 99/99. ESLint pasó en los tres archivos modificados.
La verificación integrada final pasó TypeScript del cliente y escritorio,
ESLint completo y 392 pruebas. Las exportaciones web e iOS también pasaron;
la exportación iOS comprueba el bundle JS, no compila código Swift.

En un iPhone queda por verificar: seleccionar con permiso de Fotos denegado y
limitado; un MOV/HEVC local; el mismo video disponible solo en iCloud con red y
sin red; cancelar; exceder 25 MiB después de exportar; previsualizar, guardar y
volver a abrir el perfil; abrirlo como visitante; bloquear/desbloquear con
música sonando. La exportación a 720p modifica calidad y tarda según el video;
no garantiza que todos los clips queden bajo el límite. Los objetos ya subidos
con extensiones incorrectas o codecs incompatibles deben volver a elegirse y
subirse: esta corrección no reescribe archivos existentes.
