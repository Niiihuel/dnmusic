# Ecualizador y auditoría de interacción móvil

## Resumen ejecutivo

dnmusic incorpora un ecualizador gráfico de diez bandas, persistente por dispositivo y conectado al mismo reproductor que ya sostiene el audio en segundo plano. La pantalla está en **Configuración → Reproducción → Ecualizador**, permite activar o desactivar el procesamiento, elegir siete curvas y editar manualmente de 31 Hz a 16 kHz dentro de ±12 dB.

En iOS, una pantalla propia combina navegación/lista SwiftUI, presets visibles con check y una curva arrastrable alojada explícitamente en `RNHostView`. El selector de banda y el slider nativo ofrecen el mismo ajuste con VoiceOver, en dB y pasos de 0,5. La curva conserva márgenes para no cortar los extremos. No se introducen Views de React Native directamente en una Section de SwiftUI ni otro inset superior que recorte el material de navegación.

Referencia de interacción: Spotify documenta **Settings and privacy → Playback → Equalizer**, un interruptor, presets y puntos arrastrables. No documenta su implementación interna de DSP; las curvas de dnmusic son propias. Fuente: https://support.spotify.com/us/article/equalizer/

La interfaz y el estado son compartidos, pero el procesamiento no se simula en JavaScript:

| Plataforma | Implementación | Ruta de señal |
| --- | --- | --- |
| Android | Kotlin, `android.media.audiofx.Equalizer` | ExoPlayer → sesión de audio → efecto del sistema → salida |
| iOS | Swift para estado/ciclo de vida; callback DSP Objective-C/C por la ABI de MediaToolbox | AVPlayer → `MTAudioProcessingTap` → diez filtros peak → salida |
| PC | TypeScript, Web Audio API dentro de Chromium/Electron | `<audio>` → `MediaElementAudioSourceNode` → `GainNode` → diez `BiquadFilterNode` → destino |

La auditoría adicional corrige el cierre prematuro del buscador Android al aparecer el teclado, habilita GIF animados en avatar y vitrina, convierte el minirreproductor Android en una franja rectangular de ancho completo alineada con la barra de pestañas, acerca los avisos Material al reproductor y usa `ListItem`/`Surface`/`Switch` nativos en las filas de configuración Android.

## Arquitectura del ecualizador

### Una curva estable, tres motores reales

La app expone siempre las mismas frecuencias centrales: 31, 62, 125, 250, 500, 1.000, 2.000, 4.000, 8.000 y 16.000 Hz. El estado compartido limita cada valor a ±12 dB, valida que haya exactamente diez bandas y agrupa las escrituras durante el arrastre. Persiste al soltar, salir o pasar a background; no encola una escritura por frame. La carga tardía no pisa ediciones recientes y el nombre del preset se deriva de la curva real.

Los presets son curvas propias de la aplicación. No se guardan parámetros opacos del sistema porque Android no garantiza igual cantidad ni iguales centros de banda entre fabricantes: su API informa las bandas disponibles, su frecuencia central y el rango permitido en milibeles.[^1] La capa Kotlin interpola la curva de DMusic en escala logarítmica sobre esas bandas y limita el resultado al rango que devuelve el dispositivo.

El efecto Android se crea sobre el `audioSessionId` de ExoPlayer y se reconstruye cuando Media3 anuncia una sesión nueva. Al liberar el reproductor también se quitan el listener y el efecto. Esto evita aplicar la curva a otra aplicación y evita conservar un efecto apuntando a una sesión vencida. La documentación de Android desaconseja usar la sesión global 0 para insertar efectos; la implementación espera una sesión concreta del reproductor.[^1]

En iOS, `AudioPlayer.swift` conserva el estado de la curva y decide cuándo instalar el tap. `MTAudioProcessingTap` es la API de MediaToolbox destinada a procesar audio dentro de una mezcla de reproducción, y su callback `process` obtiene audio fuente para modificarlo antes de la salida.[^2][^3] Como esos callbacks tienen una ABI C y el proyecto ya integra `AudioTapProcessor` en Objective-C, el cálculo de muestras permanece en esa unidad nativa; la propiedad, el puente Expo y el ciclo de vida sí están en Swift. Cada canal mantiene su propio estado para diez biquads peak y vuelve a calcular coeficientes cuando cambia la curva o la frecuencia de muestreo.

En PC no corresponde inventar un módulo Win32, Cocoa o Linux distinto: DMusic reproduce dentro de Electron y su motor de plataforma es Chromium. Web Audio define un grafo modular para enrutar y transformar fuentes.[^4] `createMediaElementSource()` conecta el `<audio>` existente al grafo[^5] y cada banda usa un `BiquadFilterNode` de tipo `peaking`, que ofrece frecuencia, Q y ganancia.[^6] El grafo se reconstruye al cambiar de canción porque el nodo fuente pertenece al elemento multimedia con el que fue creado.

### Integración con la reproducción existente

`MotorAudio` crea un único `AudioPlayer` por fuente y aplica la curva solo después de restaurar la preferencia. El método se invoca de forma defensiva: una instalación antigua de la app que todavía no tenga el binario nativo actualizado seguirá reproduciendo sin ecualización en vez de cerrarse. Para oír el efecto en Android o iOS hace falta reconstruir el cliente nativo; una actualización solamente del bundle JavaScript no agrega símbolos Kotlin/Swift a un binario viejo.

El visualizador y el ecualizador comparten el mismo grafo sin duplicar la fuente. En web, el analizador queda después de los filtros. En iOS, el tap ya preparado entrega muestras al visualizador solo cuando este está activo, pero procesa el ecualizador aunque JavaScript esté suspendido. En Android, el efecto vive en la sesión de audio y continúa funcionando en background independientemente del render de React.

### Seguridad acústica y límites

El control está acotado a ±12 dB y los valores no finitos nunca llegan a los filtros. En iOS, `DNEqualizerDSP.h` conserva el historial de cada canal al mover una banda e interpola las ganancias con una constante de 20 ms. Calcula la respuesta combinada de las diez bandas en una grilla logarítmica y aplica preamplificación compensada con margen de 0,5 dB cuando hay realces. Esto puede bajar el nivel percibido: la pantalla lo explica. No se modifica el volumen del reproductor ni el del sistema.

El callback de audio usa `os_unfair_lock_trylock`: si la UI está escribiendo conserva la curva anterior hasta el próximo buffer, sin esperar. Sólo procesa PCM Float32 empaquetado válido y respeta los canales/tamaños reales de cada buffer. Las bandas por encima del límite de Nyquist se dejan neutras, no se acumulan en otra frecuencia. Al desactivar vuelve suavemente a identidad. La compensación reduce saturación, pero no sustituye pruebas con masters reales ni es un limitador de loudness/lookahead.

Las pruebas C ejecutan el DSP real con señales a 22,05/44,1/48/96 kHz: bypass, respuesta de frecuencia, aislamiento estéreo, continuidad de estado, ganancia combinada y entradas no finitas. Se ejecutan con `nix shell nixpkgs#gcc --command node --test tests/ecualizador-dsp.test.mjs`. Esto no valida UIKit/AVFoundation ni audición en un iPhone: hay que recompilar y comprobar reproducción, cambio de pista, fondo, auriculares, AirPlay y reanudación. Android conserva su motor anterior.

En PC, el `GainNode` previo a los filtros compensa la respuesta combinada con 1 dB de margen. Las ganancias usan automatización `AudioParam`; la atenuación se aplica más rápido y la recuperación de nivel más lento. Cambiar una banda ya no desconecta el grafo. Al apagar, las bandas vuelven a cero y el preamp a uno sin cortar la señal. La pantalla web ofrece la curva y diez sliders accesibles por teclado; se bloquea si el audio está en otro dispositivo o falta soporte. Las pruebas de `ecualizador-web-audio.test.mjs` verifican compensación, continuidad del grafo y limpieza al cambiar canción.

## Diagnóstico del buscador y el teclado Android

### Causa raíz

`BasicTextField` de Compose informaba `onFocusChanged(false)` durante el montaje, antes de resolver `autoFocus`. La fila superior interpretaba ese primer valor como un desenfoque real, desactivaba la búsqueda y desmontaba el campo. El resultado visible variaba según la velocidad del teléfono: teclado que parpadeaba, primera tecla perdida o buscador que se cerraba solo.

El arreglo conserva dos datos separados: foco actual y si el campo llegó a recibir foco alguna vez. El `false` inicial se ignora; después del primer `true`, un `false` sí se propaga y cierra normalmente. También se mantiene un buffer nativo de texto y selección para que un render JavaScript atrasado no reemplace teclas más recientes de Compose. El IME sigue exponiendo la acción Buscar, desactiva autocorrección y conserva foco al limpiar.

Esta solución sigue el modelo de foco explícito de Compose: un componente enfocable participa en el orden y los cambios de foco deben tratarse como estado de interacción, no como señal de montaje.[^7] Expo UI presenta `TextField`/`BasicTextField` como componentes Jetpack Compose reales, no equivalentes visuales dibujados por React Native.[^8]

### Casos cubiertos

- El falso desenfoque de montaje no cierra la búsqueda.
- `true → false` después del foco sí notifica el desenfoque.
- El botón del teclado dispara una sola búsqueda.
- Limpiar conserva el campo activo.
- Un valor externo nuevo actualiza texto y selección.
- Un evento JavaScript atrasado no borra el texto nativo más reciente.
- Campos multilinea conservan Enter como salto de línea en lugar de submit.

## GIF y multimedia de perfil

`react-native` `Image` no era la ruta adecuada para garantizar decodificación animada uniforme en todos los destinos. Avatar y piezas de imagen de la vitrina usan ahora `expo-image`, con `autoplay`, clave de reciclaje por URI, transición desactivada y caché memoria-disco. Expo Image declara soporte para GIF animado y caché de disco/memoria en Android, iOS y web.[^9] El fallback de iniciales se conserva cuando la URL falla, y el encuadre sigue aplicándose sobre cada frame.

Los fondos de perfil que son video siguen en su reproductor nativo; el cambio solo afecta imágenes y GIF. La clave de reciclaje impide que una celda reutilizada muestre temporalmente el GIF de la persona anterior.

## Minirreproductor, alertas y tablas Android

### Franja multimedia

En Android, la barra de navegación ya era una superficie rectangular Material. El minirreproductor redondeado y con márgenes parecía una pieza de otro sistema y dejaba aire lateral. Ahora ocupa el 100 % del ancho, tiene radio 0, progreso de borde a borde y comparte el color de superficie con la navegación. Los dos botones circulares laterales y el modo plegado quedan reservados para las plataformas con diseño flotante/vidrio.

El alto reportado a las listas incluye siempre reproductor, pestañas e inset inferior en Android. Esto evita que la última canción quede tapada y hace que los avisos puedan calcular su piso real.

### Alertas

El `SnackbarHost` Material se mantiene por encima del contenido, pero el margen pasa a 4 px sobre el piso multimedia, con 8 px laterales y un host de 52 px. No se agregó padding ficticio al layout: la alerta es una capa absoluta y por eso no empuja listas ni deja un hueco cuando desaparece. Android recomienda que los componentes Material administren insets y que las barras/snackbars se ubiquen respecto de las superficies del scaffold.[^10][^11]

### Editor de perfil

Las filas navegables y los interruptores Android ahora se materializan con `Surface`, `ListItem` y `Switch` de Jetpack Compose. Conservan los iconos React Native mediante `RNHostView`, los estados deshabilitado/destructivo, el valor actual, el badge y las descripciones de accesibilidad. El contenedor agrupado continúa siendo compartido para no cambiar la estructura del editor en iOS y PC.

## Validación realizada

| Comprobación | Resultado |
| --- | --- |
| TypeScript (`tsc --noEmit`) | Correcto |
| Expo lint | Correcto |
| Exportación web de producción | Correcta; Metro generó el bundle y la PWA |
| Bundles JavaScript Android e iOS | Correctos; Metro/Hermes resolvió las variantes de cada plataforma |
| Suite Node de app + escritorio | 893 casos: 891 correctos, 1 omitido y 1 fallo de CSS/hover web fuera de estos cambios (`tests/controles-web.test.mjs`) |
| Pruebas dirigidas EQ, motor, búsqueda, GIF, perfil y superficies | Correctas |
| Reversión y reaplicación de `patch-package` | Correcta con fuzz 0 |
| Compilación Android nativa local | Pendiente: el host no tiene JDK 17, Android SDK 36, Build Tools ni NDK |
| Compilación iOS nativa local | Pendiente: requiere macOS/Xcode; el host actual es Linux |

El único test general que permanece rojo comprueba en Chrome el color de hover de una fila web y apunta a cambios ya presentes en `global.css`. No intervienen los archivos modificados por esta funcionalidad. La prueba llegó a pasar en una ejecución aislada y falló en las corridas completas posteriores; se registra como incidencia web separada, no como aprobación falsa de toda la suite.

El build nativo no debe darse por aprobado hasta completar la siguiente matriz en hardware o emulador con salida audible:

1. Android AOSP/Pixel y al menos un fabricante con ecualizador distinto: activar/desactivar, mover cada extremo, cambiar canción, background, Bluetooth y volver de una llamada.
2. iPhone físico: streaming y descarga local, pantalla bloqueada, cambio de ruta altavoz/auriculares/AirPlay, interrupción y diez minutos con curva extrema para revisar CPU y glitches.
3. Windows, macOS y Linux en Electron: dos canciones consecutivas, URL remota con CORS, archivo offline, suspensión/reanudación y visualizador simultáneo.
4. Android con Gboard: abrir/cerrar búsqueda repetidamente, escribir rápido, composición con tildes, limpiar, tecla Buscar y volver desde resultados.
5. Perfil: GIF grande y pequeño, scroll rápido que recicle celdas, volver del editor, caché fría y modo sin conexión.
6. Accesibilidad: TalkBack sobre filas Material, switch, sliders y acciones; tamaño de fuente grande y navegación por teclado en PC.

## Archivos principales

- Estado, presets y persistencia: `src/state/ecualizador.ts`.
- Pantalla de control: `app/ajustes/ecualizador.tsx`.
- Aplicación sobre el motor: `src/ui/MotorAudio.tsx`.
- Kotlin, Swift/MediaToolbox y Web Audio reproducibles: `patches/expo-audio+57.0.3.patch`.
- Foco de búsqueda: `src/ui/SearchField.android.tsx`.
- Imágenes animadas: `src/ui/Avatar.tsx` y `src/ui/Vitrina.tsx`.
- Barra y avisos: `src/ui/Cascara.tsx`, `src/ui/NowPlayingBar.tsx` y `src/ui/Aviso.android.tsx`.
- Tablas Material: `src/ui/Ajustes.android.tsx`.
- Cobertura nueva: `tests/ecualizador.test.mjs` y casos ampliados de Android/motor.

## Fuentes

[^1]: Android Developers, [Equalizer](https://developer.android.com/reference/android/media/audiofx/Equalizer).
[^2]: Apple Developer Documentation, [MTAudioProcessingTap](https://developer.apple.com/documentation/MediaToolbox/MTAudioProcessingTap).
[^3]: Apple Developer Documentation, [MTAudioProcessingTapCallbacks.process](https://developer.apple.com/documentation/mediatoolbox/mtaudioprocessingtapcallbacks/process).
[^4]: MDN Web Docs, [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API).
[^5]: MDN Web Docs, [AudioContext.createMediaElementSource()](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource).
[^6]: MDN Web Docs, [BiquadFilterNode](https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode).
[^7]: Android Developers, [Change focus behavior](https://developer.android.com/develop/ui/compose/touch-input/focus/change-focus-behavior).
[^8]: Expo Documentation, [TextField (Jetpack Compose)](https://docs.expo.dev/versions/latest/sdk/ui/jetpack-compose/textfield/).
[^9]: Expo Documentation, [Image](https://docs.expo.dev/versions/latest/sdk/image/).
[^10]: Android Developers, [Material 3 insets](https://developer.android.com/develop/ui/compose/system/material-insets).
[^11]: Android Developers, [Snackbar](https://developer.android.com/develop/ui/compose/components/snackbar).
