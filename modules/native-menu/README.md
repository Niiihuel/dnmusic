# Menú del sistema al tocar (iOS)

Módulo local de Expo, sólo iOS. Expo autolinking encuentra `NativeMenuModule`
y arma el pod `NativeMenu`; no hay que tocar `app.json` ni la navegación.

## Qué resuelve

La app ya tenía dos menús nativos, pero de dos orígenes distintos: la pulsación
larga sobre una fila es `UIContextMenuInteraction` en UIKit
(`collection-controls`), y el disparador que se **toca** —los tres puntos de una
fila, «Opciones» en una cabecera— pasaba por el `Menu` de SwiftUI de `@expo/ui`.

Ese segundo camino obligaba a envolver el disparador en `RNHostView` para que
SwiftUI lo midiera y a devolverle el alto a Yoga: dos sistemas de medición
discutiendo por la misma fila, que es de donde salían los saltos de alto y los
recortes. Acá no hay nada que medir. La vista es una lámina transparente que RN
estira sobre el disparador que ya dibujó, y adentro sólo vive un `UIButton` sin
fondo con `showsMenuAsPrimaryAction`: RN dibuja, UIKit presenta.

## Comportamiento

- El menú se arma **al abrir**, con `UIDeferredMenuElement.uncached`, y la
  respuesta es síncrona: no hay ida al hilo de JS ni rueda de espera. En el
  mismo momento se avisa `onOpen`, que es cuando JS congela qué hace cada fila;
  un dibujado posterior no le cambia la acción a quien ya está eligiendo.
- Las opciones llegan con la misma forma que usa la pulsación larga y las
  traduce el mismo `prepararMenuContextual`: grupos `inline` para los cortes,
  un grupo `small` para la fila de acciones rápidas, subtítulos, selección,
  submenús de un nivel, destructivas y deshabilitadas.
- Sin `children`, el disparador lo dibuja el sistema: `symbol` es un SF Symbol
  con el peso y la métrica del teléfono, y su color va horneado en la imagen
  (`alwaysOriginal`) para que el gris de los tres puntos no tiña el menú.
  RN reserva el área táctil de 44pt.
- Con `items` vacío la lámina deja de recibir toques: un menú sin opciones no
  puede comerse el toque del disparador que tiene debajo.
- El menú se presenta en oscuro (`overrideUserInterfaceStyle`), como el resto.

## Límites

- Los disparadores compartidos siguen usando UIKit. El traductor del
  reproductor iOS ahora usa un `Menu` enteramente SwiftUI en un `Host` de
  dimensiones explícitas, sin alojar el disparador React Native ni devolver
  medidas entre sistemas. Los formularios nativos también conservan sus
  propios menús SwiftUI.
- La pulsación larga sigue en `collection-controls`. Los dos módulos arman el
  mismo `UIMenu` con código equivalente porque son pods separados y compartir
  Swift entre ellos costaría más que las treinta líneas repetidas; si aparece
  un tercer disparador, conviene unificarlos en éste.
- Los binarios anteriores y Expo Go no traen el módulo: `BotonMenuNativo` queda
  en `null` y el menú de SwiftUI sigue siendo el respaldo. **Requiere recompilar
  iOS**; una actualización sólo de JS no lo incorpora.

## Verificación

- `node --test tests/contactos-menu.test.mjs` cubre las dos rutas: con módulo y
  sin módulo, disparador propio y glifo del sistema, texto y pulsación larga,
  el reparto en grupos y que `onOpen` congele las acciones.
- `npx expo-modules-autolinking resolve --platform apple --json` incluye el pod.
- No hay Xcode, `xcrun`, Swift ni simulador en el host Linux de implementación:
  las pruebas JS no validan compilación Swift, gestos ni composición visual.

Pendiente en un iPhone con binario nuevo: abrir el menú desde una fila de
canción, desde la cabecera de una lista y desde el reproductor; comprobar que no
aparezca la rueda de espera del elemento diferido, que la fila de acciones
rápidas quede horizontal, que los subtítulos y el rojo de la destructiva se
vean, y que VoiceOver lea la etiqueta del disparador una sola vez.

## Referencias oficiales

- [Apple: UIMenu](https://developer.apple.com/documentation/uikit/uimenu)
- [Apple: showsMenuAsPrimaryAction](https://developer.apple.com/documentation/uikit/uibutton/showsmenuasprimaryaction)
- [Apple: UIDeferredMenuElement](https://developer.apple.com/documentation/uikit/uideferredmenuelement)
- [Apple: HIG — menús](https://developer.apple.com/design/human-interface-guidelines/menus)
- [Expo: vistas nativas locales](https://docs.expo.dev/modules/native-view-tutorial/)
