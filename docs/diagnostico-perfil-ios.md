# Cierre del perfil en iOS · 5 de septiembre de 2026

Confirmado por USB en un iPhone con iOS 26.6.1 y el build 16 de TestFlight.
Se copiaron los informes de dnmusic conservando los originales en el teléfono.
Los registros completos y los datos del dispositivo quedan fuera del repositorio.

El informe de las 00:26:46 muestra `EXC_CRASH / SIGABRT`, originado en
`RCTExceptionsManager reportFatal`. El registro en vivo de las 00:26:59 aporta
la causa de JavaScript:

```text
Unhandled JS Exception: TypeError: Cannot read property 'layout' of null
    at PestanasPerfil
```

`PestanasPerfil.onLayout` leía `e.nativeEvent.layout` dentro del actualizador
funcional de `setSitios`. React puede ejecutar ese actualizador después de que
Fabric libere el evento. El renderer de React Native 0.86.2 instalado mantiene
el reciclado de eventos: `SyntheticEvent.destructor` pone `nativeEvent` en null.
El cambio anterior de las capturas del worklet no resolvía este error.

La corrección copia `x` y `width` durante `onLayout` y solo captura esos números
en el actualizador. No conserva eventos ni usa un valor por defecto que oculte
el fallo. La prueba `tests/perfil-layout.test.mjs` ejecuta el manejador real,
libera el evento y luego aplica la actualización: falla con el código del build
16 y pasa con la corrección. También comprueba nuevas medidas y la omisión de
renders cuando no cambian.

Fuentes: [reciclado de eventos en React Native](https://legacy.reactjs.org/docs/legacy-event-pooling.html),
[obtención de informes de Apple](https://developer.apple.com/documentation/xcode/acquiring-crash-reports-and-diagnostic-logs).

## Menús de iOS

`MenuNativo.ios.tsx` usa `Menu` para un toque y `ContextMenu` para la pulsación
larga. SwiftUI administra la presentación, los símbolos, los submenús y la
respuesta háptica. Los selectores usan `Toggle` para la marca de selección.
Los disparadores React Native se integran con `RNHostView`; las filas reciben
un ancho explícito medido por Yoga para no depender de tamaños intrínsecos
circulares. No se montan copias invisibles de las canciones para medirlas.

El archivo `MenuNativo.tsx` mantiene el menú propio en web y Android. Los
formularios y catálogos con vistas previas conservan sus pantallas de edición.

Referencias de Expo: [ContextMenu](https://docs.expo.dev/versions/latest/sdk/ui/swift-ui/contextmenu/),
[RNHostView](https://docs.expo.dev/versions/latest/sdk/ui/swift-ui/rnhostview/),
[Host](https://docs.expo.dev/versions/latest/sdk/ui/swift-ui/host/).

La compilación y la prueba de regresión no sustituyen la comprobación final
del nuevo binario en el teléfono, incluidos el scroll, el toque corto y la
apertura de menús junto a los extremos de la pantalla.
