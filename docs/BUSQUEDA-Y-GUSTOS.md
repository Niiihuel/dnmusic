# Buscadores, gustos e inicio

Los cambios de presentación son compartidos por iOS y escritorio. No cambian el ranking ni los parámetros que abren cada género.

## Búsqueda

- iOS usa `SearchField.ios.tsx`: controles SwiftUI, una cápsula `glassEffect(.regular)` cuando está disponible y fondo sólido sólo como respaldo. Ajustes, colecciones y el editor de música del perfil usan el mismo campo.
- PC mantiene el vidrio CSS de `Glass`, la densidad compacta y el foco de teclado. Limpiar devuelve el foco al campo, también en iOS.
- No superponer un fondo opaco ni recortar el material después de aplicar el vidrio.
- La lupa entra a `SearchExplore` sin foco: categorías en español, dos columnas en teléfono y tres/cuatro según el ancho real del panel de PC. El campo persiste al pie del teléfono; en PC está en la barra lateral, junto a la nueva entrada Buscar.
- El foco muestra recientes; una consulta muestra resultados. No hay selector de catálogo/biblioteca. Las canciones llevan portada y «Canción · artista»; los artistas, foto circular y navegación. Las acciones conservan el menú compartido.
- `recientes.v2` guarda entidades seleccionadas y migra consultas de v1. No persiste URLs de reproducción; escrituras seriales y revisión de hidratación protegen Borrar frente a respuestas tardías.

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

## Preparación de las próximas canciones

`usePrecargaCola` conserva la ventana limitada (hasta cinco en Wi-Fi según duración, dos con datos autorizados), el disco acotado y la prioridad del audio actual. Ahora la resolución/firma se adelanta a la descarga completa: las primeras dos candidatas pueden prepararse en paralelo en Wi-Fi; con datos hay una resolución en vuelo. Se guarda su URL temporal en memoria antes de esperar el disco. Las descargas siguen seriales; en iOS sólo se calienta el próximo item local. No se abre un buffer extra si falta espacio ni se cambia la fuente que ya suena. El arranque de precarga espera 400 ms de reproducción estable y se cancela al pausar, perder red permitida o cambiar la cola.

Esto reduce el trabajo que queda al terminar la canción, también bloqueado, pero no garantiza continuidad sin red ni resuelve restricciones del proveedor. Se conserva la sesión de audio de fondo y la ventana nativa finita de transición ya existente. No se mantiene la pantalla despierta ni se reproduce silencio para eludir la suspensión. Referencias: [Audio en segundo plano de Expo](https://docs.expo.dev/versions/latest/sdk/audio/) y [tiempo de ejecución adicional de UIKit](https://developer.apple.com/documentation/uikit/extending-your-app-s-background-execution-time).

Las pruebas simulan resoluciones lentas, cancelaciones y diez cambios de tema sin evento de foreground. Falta comprobar en iPhone real varios cambios con bloqueo, Wi-Fi/datos, saltos rápidos y precarga desactivada; una simulación de hooks no verifica la política de suspensión de iOS.
