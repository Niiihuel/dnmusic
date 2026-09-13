# Ajustes nativos de iOS tras las capturas de 1.15.0

Esta revisión cubre los problemas reportados en reproductor, letra, navegación, perfil, listas y chats. La captura de Apple Music sirve como referencia de jerarquía y distribución del espacio. El código y las pruebas se revisaron en Linux; este documento **no confirma una validación visual en iPhone** ni sustituye la compilación de Xcode y la comprobación física.

## Referencias y decisiones

Se consultaron las páginas oficiales pertinentes a estas pantallas, además del código de la versión instalada de `@expo/ui`. No se afirma haber revisado toda la documentación de Apple.

| Área | Referencia oficial | Aplicación a DMusic |
| --- | --- | --- |
| Jerarquía, dimensiones y áreas seguras | [Apple: Layout](https://developer.apple.com/design/human-interface-guidelines/layout) | Separar cabecera, contenido desplazable y controles; considerar Dynamic Island, llamada activa, rotación y tamaños de texto. |
| Desplazamiento y bordes | [Apple: Scroll views](https://developer.apple.com/design/human-interface-guidelines/scroll-views) | Evitar desplazamientos verticales anidados y reservar espacio de contenido para barras. Los efectos de borde de desplazamiento separan la cabecera del contenido. |
| Vidrio y contenido | [Apple: Materials](https://developer.apple.com/design/human-interface-guidelines/materials) | Reservar Liquid Glass para navegación y controles. El contenido, las tarjetas musicales y los formularios mantienen su propia superficie legible. |
| Barras superiores | [Apple: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars) | Mantener pocas acciones, títulos breves y controles estándar; evitar capas opacas que tapen los efectos del sistema. |
| Formularios | [Apple: Form](https://developer.apple.com/documentation/swiftui/form) | `Form` y `Section` organizan los controles de edición con la presentación agrupada de iOS. |
| Navegación de edición | [Apple: NavigationStack](https://developer.apple.com/documentation/swiftui/navigationstack) | Las secciones del perfil usan destinos y regreso nativos; volver de una sección conserva el borrador. |
| Pestañas | [Apple: Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) | Navegar entre áreas, conservar estado y usar SF Symbols. La preferencia explícita del usuario es mostrar sólo iconos: se conservan los nombres accesibles. Apple recomienda normalmente etiquetas visibles; su ocultación aquí es una decisión de producto, no una exigencia de HIG. |
| Reproducción | [Apple: Playing audio](https://developer.apple.com/design/human-interface-guidelines/playing-audio) | Mantener transporte, progreso y salida de audio accesibles con la letra abierta. |
| Volumen del dispositivo | [Apple: MPVolumeView](https://developer.apple.com/documentation/mediaplayer/mpvolumeview) | Ajustar el volumen real de iOS, también cuando cambia con botones físicos. Apple indica que volumen y rutas no se verifican en Simulator: requieren un dispositivo. |
| Salida de audio | [Apple: AVRoutePickerView](https://developer.apple.com/documentation/avkit/avroutepickerview) | Usar selector del sistema para AirPlay; asignarle restricciones de tamaño, sin depender de un frame inicial de cero. |
| Volumen del reproductor | [Apple: AVPlayer.volume](https://developer.apple.com/documentation/avfoundation/avplayer/volume) | Distinguir el volumen interno de una instancia del volumen de salida del dispositivo. |
| Acciones contextuales | [Apple: Context menus](https://developer.apple.com/design/human-interface-guidelines/context-menus) | Preservar acciones relevantes y accesibles fuera de gestos ocultos; mantener el rol destructivo donde corresponde. |
| Puente con SwiftUI | [Expo: SwiftUI](https://docs.expo.dev/guides/expo-ui-swift-ui/), [Expo: Host](https://docs.expo.dev/versions/v57.0.0/sdk/ui/swift-ui/host/) | Un `Host` de pantalla administra el formulario y su área segura; los hosts de controles embebidos no vuelven a sumar insets. |
| Presentación del reproductor | [Expo Router: Stack](https://docs.expo.dev/router/advanced/stack/) | Presentación de pantalla completa en iOS, sin un gesto de arrastre de RN alrededor del texto de la letra. |
| Filtros compatibles | [React Native: filter](https://reactnative.dev/docs/view-style-props#filter) | No aplicar `blur` como filtro RN en iOS, donde ese filtro no está soportado. |

## Editor de perfil

`src/ui/EditorPerfilNativo.ios.tsx` contiene la presentación iOS. `app/profile/editar/index.tsx` conserva las operaciones y el borrador compartido para todas las plataformas.

- Inicio con identidad y avatar, entrada a vista previa y grupos de personalización.
- Destinos nativos para Identidad, Fondo, Apariencia, Quién lo ve, Mosaico y Vista previa.
- Campos `TextField`, interruptores `Toggle`, acciones `Button`, progreso `ProgressView` y confirmación `ConfirmationDialog` dentro de `Form`/`Section`.
- La barra de navegación muestra Guardar; la raíz usa Listo para volver al perfil. Los destinos internos reciben el regreso y el gesto de `NavigationStack`.
- La API de `Toolbar.Content` disponible no expone `ToolbarItem` con posición explícita. No se presupone que `role="cancel"` coloque un control a la izquierda.
- Editar un campo por URL y buscar música para el perfil también disponen de pantalla SwiftUI. El buscador de música tiene un único campo dentro de su formulario y abre el editor de fragmentos al elegir una canción.
- Los interruptores activos usan verde, manteniendo su texto y estado accesible.
- El estado nativo de los campos se sincroniza con el borrador. La normalización del usuario también actualiza el texto visible, incluso cuando normalizar produce el valor anterior.

### Guardado, regreso y recursos

`useSalidaConCambios` sigue interceptando la salida de la ruta: Listo no descarta silenciosamente. Volver de una sección nativa sólo modifica el camino de `NavigationStack`, manteniendo montado el controlador de edición.

`guardarCambios` conserva el bloqueo `enVuelo`, la validación de usuario y mosaico, el guardado del perfil y después el de sus piezas. Un error conserva el borrador pendiente; una subida tardía se verifica contra el propietario. Los medios temporales conservan la limpieza existente. No se escribe la cuenta al tocar cada interruptor o navegar por secciones.

El `Host` de pantalla no usa `ignoreSafeArea="all"` y no está envuelto en otro `SafeAreaView`/`KeyboardAvoidingView` de RN: SwiftUI administra las áreas de contenedor y teclado. `piso` reserva el espacio de las barras del shell. Los campos usan `useNativeState`, cuyo objeto nativo se libera automáticamente al desmontar mediante la implementación instalada de Expo; no se añadió otro controlador de presentación manual.

Los avatares, GIF, fondos de video, encuadres y decoraciones continúan usando el contenido compartido a través de `RNHostView`. La tarjeta de vista previa tiene un ancho explícito y altura de contenido; el fondo hospedado recibe un marco nativo de altura definida. Esto evita pedir simultáneamente a SwiftUI y Yoga que determinen una dimensión a partir de la otra.

## Reproductor, letra, listas y chats

Cambios integrados por área, sujetos a la validación física siguiente:

- Reproductor iOS de pantalla completa; el gesto que podía cerrar la vista al desplazar la letra deja de envolver el reproductor.
- Letra, progreso, transporte, volumen y acciones inferiores ocupan regiones independientes. La traducción usa una acción compacta y no se monta encima del texto. Se retira el ocultamiento automático de controles que alteraba la composición durante la lectura.
- El selector de salida tiene restricciones de tamaño explícitas y el volumen corresponde a `MPVolumeView`.
- Las listas conservan carátulas elegidas por el usuario o generadas desde canciones; las portadas y acciones conservan el significado del contenido y la biblioteca de Android/web.
- Cabecera de chats y listado tienen alturas independientes; abrir el teclado reduce el espacio del hilo y mantiene visible la cabecera.
- El composer mide su contenido, conserva la carátula del adjunto y presenta una acción de quitar con área táctil suficiente.
- La búsqueda de fragmentos mantiene el encabezado y cierra el teclado al elegir. El detalle no reserva el espacio de un miniplayer que no está visible; la nota completa es desplazable y las acciones inferiores se redistribuyen.

## Validación física pendiente

Usar un iPhone con iOS 26 y el build que contenga esta revisión, además de un dispositivo con la versión mínima soportada cuando esté disponible. Repetir con tamaño de letra normal y de accesibilidad, y con Reducir movimiento/Reducir transparencia. Las capturas reportadas muestran una llamada activa: repetir también en ese estado.

| Captura / flujo | Qué comprobar | Resultado esperado |
| --- | --- | --- |
| Reproductor y letra | Abrir/cerrar letra 20 veces, arrastrarla lenta y rápidamente, cambiar de canción, abrir traducción y regresar de cola | La pantalla no se cierra ni vuelve a abrir sola; letra, título, portada y traducción se mantienen en sus regiones. |
| Cabecera del reproductor | Abrir con reproducción local, reproducción desde otro equipo, canción pausada, títulos y artista extensos, y llamada activa | El estado de dispositivo no desplaza controles fuera de pantalla ni se superpone al encabezado. |
| Pantalla completa | Abrir desde miniplayer y volver mediante el control visible | Ocupa la pantalla prevista, sin comportarse como un drawer con altura variable. |
| Acciones inferiores | Letra, escuchar en, AirPlay, cola, volumen y transporte | Áreas táctiles separadas y alineadas; los controles no quedan sobre texto ni bajo el indicador de inicio. |
| Audio del sistema | Usar botones físicos, arrastrar volumen, conectar auriculares y abrir AirPlay con una ruta disponible | El volumen y la ruta reflejan iOS. No validar este punto sólo con un simulador. |
| Ajustes | Activar/desactivar cada switch, desplazar el formulario hasta ambos extremos | Activo verde, inactivo distinguible; no hay thumb blanco sobre pista blanca ni controles superpuestos. |
| Regreso y cabeceras | Abrir ajustes, editor, selección de fuente, fragmento y chat; probar botón y gesto de regreso | Un único símbolo, centrado y sin líneas cruzadas; el contenido pasa por el efecto de borde apropiado sin tapar el título. |
| Pestañas | Cambiar repetidamente entre Inicio/Listas/Chats/Perfil y abrir/cerrar búsqueda | Sólo iconos visibles según la preferencia del usuario, áreas táctiles independientes, nombres correctos en VoiceOver y estado conservado. |
| Editor: identidad | Cambiar nombre, usuario válido/ocupado, bio larga; abrir teclado y volver de sección | Validación visible, campos sin recortes; Guardar habilitado sólo cuando corresponde y borrador intacto al navegar. |
| Editor: medios | Subir/cambiar/quitar foto y fondo, GIF y video, encuadrar y regresar | Vista previa fiel, progreso legible, errores recuperables; cancelar no borra medios guardados. |
| Editor: estilo y mosaico | Cambiar fuente/decoraciones/privacidad y piezas, ver previa, restablecer, guardar con red normal y fallida | Los cambios se acumulan; restablecer recupera lo guardado; una falla conserva lo pendiente y permite reintentar. |
| Editor: salida | Tocar Listo con cambios; cancelar y después confirmar descarte. Repetir tras guardar y con subida en curso | Confirmación consistente; nunca se descarta por un regreso interno; durante operaciones no se duplica el guardado. |
| Biblioteca | Lista con portada propia, portada de una canción, mosaico de canciones, portada fallida y lista vacía | Se usa la portada correspondiente; SF Symbol sólo como respaldo coherente, sin reemplazar arte existente. |
| Lista de chats | Con cero, uno y muchos contactos; desplazar hasta el primero y tocar nuevo chat | El listado no tapa la acción superior y conserva avatar, nombre, fecha y no leídos. |
| Composer | Abrir/cerrar teclado, escribir varias líneas, agregar y quitar fragmento, rotar si la app lo permite | Placeholder y texto dentro del campo, X visible y centrada, adjunto sin cortar; hilo y teclado no invaden la cabecera. |
| Detalle de fragmento | Recibir y enviar fragmentos y canciones completas; abrir nota larga, letra, traducción y cerrar | Encabezado completo, nota desplazable, tiempos legibles, controles inferiores sin solaparse. |
| Ciclo de vida | Abrir/cerrar editor, reproductor y fragmentos repetidamente; bloquear/desbloquear durante reproducción | No quedan teclados, menús o vistas superpuestos ni se reproducen animaciones pertenecientes a una pantalla cerrada. |

## Alcance conservado

Los archivos compartidos de Android/web y los respaldos necesarios para el port de Android permanecen. Se retiran únicamente ramas iOS reemplazadas y comportamiento obsoleto confirmado. Tener `RNHostView` para contenido artístico o una implementación compartida para otra plataforma no significa que ese código esté muerto.

Las pruebas automáticas incluyen el store real del borrador, su serialización y eventos de controles nativos conectados a ese store. Los tests de JSX verifican contratos y acciones; no prueban píxeles, áreas seguras reales, animaciones de UIKit, consumo de memoria en el dispositivo ni la interacción de AirPlay. La validación de esos puntos queda registrada en la tabla anterior.

## Verificación automatizada de esta revisión

- 635 pruebas de la app aprobadas; TypeScript y ESLint sin errores.
- Exportaciones de producción iOS y Android completas.
- Compilación y firma iOS en macOS: [GitHub Actions](https://github.com/Niiihuel/dnmusic/actions/runs/34739300812), código `9898f38`. El resultado del compilador debe verificarse antes de distribuir.
- [PR #2](https://github.com/Niiihuel/dnmusic/pull/2). No se ha comprobado aún la composición visual con este binario en un iPhone.
