# expo-audio 57.0.3 / iOS

`expo-audio+57.0.3.patch` conserva el tap del mismo `AVPlayerItem` cuando se
suspende el muestreo. La implementación original desmontaba el `audioMix` con
cada `setAudioSamplingEnabled(false)`, incluyendo las transiciones de AppState.

El callback existente comprueba `samplingEnabled` antes de construir los arrays
de PCM o emitir eventos hacia JavaScript. En segundo plano no ejecutamos FFT ni
actualizamos las barras. El tap se libera al reemplazar la fuente o destruir el
reproductor; su referencia al item impide reutilizarlo en otra canción.

El parche se aplica en `postinstall` y falla explícitamente si deja de aplicar.
Requiere recompilar la app de iOS; no se distribuye mediante un despliegue web.
Al actualizar Expo Audio, revisar su implementación y retirar o adaptar el parche.

Validación en dispositivo pendiente: reproducir, abrir multitarea, volver,
bloquear/desbloquear y pasar a la canción siguiente en segundo plano. La
compilación no demuestra por sí sola que desaparezca un corte audible.

Referencias: [AppState de RN 0.86](https://reactnative.dev/docs/0.86/appstate),
[Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/).
