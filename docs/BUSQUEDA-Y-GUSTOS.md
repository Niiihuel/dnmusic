# Buscadores, gustos e inicio

Los cambios son compartidos por iOS y escritorio. No cambian el ranking, la reproducción ni los parámetros que abren cada género.

## Búsqueda

- iOS usa `SearchField.ios.tsx`: controles SwiftUI, una cápsula `glassEffect(.regular)` cuando está disponible y fondo sólido sólo como respaldo. Ajustes, colecciones y el editor de música del perfil usan el mismo campo.
- PC mantiene el vidrio CSS de `Glass`, la densidad compacta y el foco de teclado. Limpiar devuelve el foco al campo, también en iOS.
- No superponer un fondo opaco ni recortar el material después de aplicar el vidrio.

Referencia: [Applying Liquid Glass to custom views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views). El vidrio se aplica a controles; las tarjetas de contenido no lo necesitan.

## Géneros y textos

- `catalogoEditorial.ts` adapta nombres reconocidos, separa géneros de momentos y conserva las referencias opacas originales. Las categorías no reconocidas no se promocionan; las elecciones antiguas siguen visibles al editar gustos.
- `TarjetaGenero` dibuja arte propio, no la portada de una playlist del proveedor. La selección usa contraste, texto accesible y una marca, no sólo color.
- El registro adapta columnas a teléfonos angostos y limita a 760 px el contenido en PC. Ambos pasos conservan las elecciones al volver.
- Los títulos de sección y etiquetas técnicas del inicio tienen presentación en español. Los títulos propios de canciones, artistas y discos no se traducen. Sólo se adaptan patrones editoriales conocidos de listas.
- Las fotos de artistas sugeridos se conservan; los resultados de búsqueda se asocian a su consulta para no mostrar resultados anteriores durante la carga.

## Verificación

Pruebas de catálogo/referencias, tamaños de tarjeta, navegación y conservación de gustos, errores/reintentos, selección de artistas, foco/limpieza y respaldo sin Liquid Glass. TypeScript, ESLint y exportación Metro de iOS/web. Inspección de las tarjetas compartidas en navegador a ancho móvil y escritorio; no equivale a una prueba del material nativo en iPhone.

Estos cambios requieren publicación para llegar a las aplicaciones instaladas. Una exportación Metro no es un IPA ni un instalador de escritorio.
