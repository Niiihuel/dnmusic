# Controles de búsqueda y menú de colecciones (iOS)

Módulo local de Expo, sólo iOS. No requiere cambios en navegación, dependencias
ni `app/_layout.tsx`. Expo autolinking encuentra `CollectionControlsModule`.

## Comportamiento

- La lupa de playlist/álbum mantiene 44pt dentro de las acciones. Al abrir,
  aparece un `UISearchBar` de ancho disponible debajo de ellas, con limpiar,
  cancelar, teclado de búsqueda y filtrado por título/artista. Cancelar limpia
  el filtro y cierra el teclado; cambiar de colección reinicia la búsqueda.
- El filtro del álbum conserva el índice original y la cola completa.
- La pulsación larga instala `UIContextMenuInteraction` en el contenedor RN
  existente. La fila sigue siendo un único hijo medido por Yoga. No se mueve
  a un `RNHostView` ni se realimenta su alto desde SwiftUI. La vista auxiliar
  es absoluta y no recibe toques; la interacción pertenece a su padre.
- UIKit presenta el menú y su fondo de sistema. Highlight y dismiss usan el
  mismo `UITargetedPreview`, con esquinas de 8pt y fondo neutro explícito.
  No hay transformaciones, offsets, alturas fijas ni fondos azules aplicados
  a la fila desde JS. El desenfoque respeta los ajustes de accesibilidad iOS.
- Acciones, submenús, separadores, subtítulos, selección y deshabilitados
  conservan su significado. La apertura captura los callbacks para que un
  render posterior no cambie la acción seleccionada.

## Diagnóstico y límites

El buscador previo imponía una animación de 44 a 300pt dentro de las acciones,
sin condición de plataforma: el desborde/wrap se desprende directamente del
código. El álbum no tenía filtro local.

El menú previo envolvía la fila en `RNHostView matchContents` y devolvía el alto
desde `Host matchContents.vertical`. La nueva ruta elimina ese circuito de
medición y deja la preview en UIKit. No se reprodujo el salto en dispositivo:
la relación exacta con la transición de SwiftUI sigue siendo una hipótesis.
Tampoco se confirmó el origen exacto del azul; la preview ahora define un
fondo neutro en vez de heredar la presentación de SwiftUI.

Los binarios anteriores y Expo Go mantienen el menú SwiftUI de respaldo y
usan un campo RN independiente para buscar. **La corrección UIKit del menú
requiere recompilar iOS**; una actualización sólo de JS no la incorpora.

## Verificación

- `node --test tests/colecciones-ios.test.mjs tests/contactos-menu.test.mjs tests/media-ui.test.mjs tests/sidebar-search.test.mjs tests/fragment-menu.test.mjs`
- ESLint sobre los TS/TSX afectados.
- `expo-modules-autolinking resolve --platform apple --json` incluye este pod.
- No hay Xcode, `xcrun`, Swift ni simulador en el host Linux de implementación.
  Las pruebas JS no validan compilación Swift, gestos ni composición visual.

Pendiente en iPhone con un binario nuevo: probar a 320/390pt y en horizontal,
lista colaborativa, teclado abierto/cerrado, borrar/cancelar, cero resultados,
cambiar de colección y reproducir una fila filtrada. Mantener apretada la
primera, una intermedia y la última canción: verificar que las filas vecinas
no cambien de posición, que el fondo se difumine sin azul y que cancelar no
reproduzca. Verificar también tap normal, tres puntos, submenús, scroll,
VoiceOver, tamaño de texto grande y Reducir transparencia.

## Referencias oficiales

- [Apple: colocación y comportamiento de búsqueda](https://developer.apple.com/videos/play/wwdc2026/292/)
- [Apple: UISearchBar](https://developer.apple.com/documentation/uikit/uisearchbar)
- [Apple: UIContextMenuInteraction](https://developer.apple.com/documentation/uikit/uicontextmenuinteraction)
- [Apple: fondo de UIPreviewParameters](https://developer.apple.com/documentation/uikit/uipreviewparameters/backgroundcolor)
- [Expo: vistas nativas locales](https://docs.expo.dev/modules/native-view-tutorial/)
- [Expo: ContextMenu de SwiftUI](https://docs.expo.dev/versions/latest/sdk/ui/swift-ui/contextmenu/)
