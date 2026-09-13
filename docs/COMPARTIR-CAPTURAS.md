# Capturas y compartir canciones

En iOS, una captura en Inicio, Listas, Buscar o el reproductor ofrece una tarjeta de la canción en un aviso SwiftUI. La acción **Compartir** abre la hoja de iOS con un PNG generado por dnmusic; el sistema decide qué aplicaciones compatibles aparecen. La captura original sigue bajo el control de iOS. No se lee Fotos ni se manda contenido automáticamente.

El aviso dura ocho segundos. No aparece en chats, perfiles, ajustes, menús abiertos ni con el teclado, y se retira al salir de la pantalla o dejar la app inactiva. En el reproductor se presenta debajo de su encabezado completo; en las pantallas principales queda sobre las pestañas y el minirreproductor. Conserva la canción del momento de la captura aunque cambie la reproducción.

La preparación de la tarjeta y la hoja nativa admiten una sola solicitud. Se espera la carátula con un límite de doce segundos, se comprueba la cuenta aprobada antes y después de los pasos asíncronos y se cancela al cambiar de cuenta. Al cerrar la hoja se libera el archivo temporal. Capturar no muestra la hoja del sistema por sí solo.

La variante Android conserva su aviso y la misma acción manual; un binario sin el módulo de detección sigue ofreciendo compartir desde el menú. Web conserva la descarga de la tarjeta y no registra capturas. No se agregan permisos: versiones anteriores de Android pueden requerir permisos para detectar capturas, por lo que allí se conserva el compartir manual.

## Fuentes oficiales

- [Apple: userDidTakeScreenshotNotification](https://developer.apple.com/documentation/UIKit/UIApplication/userDidTakeScreenshotNotification): se publica después de la captura y no contiene `userInfo`; no entrega el archivo original.
- [Apple: UIActivityViewController](https://developer.apple.com/documentation/uikit/uiactivityviewcontroller): presentación nativa para contenido que proporciona la app.
- [Expo ScreenCapture](https://docs.expo.dev/versions/latest/sdk/screen-capture/): listener de capturas, compatibilidad y permisos por plataforma.
- [Expo Sharing](https://docs.expo.dev/versions/latest/sdk/sharing/): compartir archivos locales mediante la interfaz del sistema.

## Validación

`tests/captura-compartir.test.mjs` cubre consentimiento explícito, eventos repetidos, caducidad, exclusión de contextos privados, teclado, AppState, cambio de cuenta, acceso revocado, carga de imagen, desmontaje, deduplicación y liberación del PNG. El chequeo de tipos usa las APIs de Expo UI instaladas. La posición final, VoiceOver y la presentación real de la hoja requieren validación en iPhone con la nueva compilación; no se validaron visualmente desde Linux.
