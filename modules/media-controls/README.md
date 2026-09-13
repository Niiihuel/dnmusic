# Controles multimedia de iOS

Módulo local Swift/UIKit con cuatro vistas; no almacena audio, sesión ni colas.

- `MediaTrackView`: UIButton con carátula, título/subtítulo Dynamic Type y
  estado real de preparación/reproducción. Admite mosaico de cuatro carátulas,
  selección y deshabilitado. Cancela descargas de imágenes al cambiar de dato,
  usa caché y descarta respuestas de una generación anterior.
- `MediaTabBarView`: UITabBar auténtico con Inicio, Listas, Chats, Perfil y
  Buscar (item de búsqueda del sistema), selección y badge de mensajes con
  recuento accesible. La selección confirmada desde React es idempotente: no
  reinicia el estado de UIKit tras cada toque. Emite el destino; Expo Router
  conserva la pila. En iOS 26 no impone blur, fondo ni indicador personalizado;
  UIKit controla su material, interacción y preferencias de accesibilidad.
- `MediaMiniPlayerView`: superficie SwiftUI con título/artista Dynamic Type,
  portada remota o local, estado de dispositivo y botones nativos para abrir,
  cambiar dispositivo, pausar/reproducir y siguiente. Pausa sigue disponible
  mientras carga; siguiente/anterior respetan sus permisos. El menú contextual
  y acciones de VoiceOver permiten anterior y opciones completas. En iOS 26
  usa `glassEffect` real; versiones anteriores usan material SwiftUI y Reducir
  transparencia usa fondo del sistema. Respeta Reducir movimiento. Un
  UIHostingController contenido en el controlador React recibe un marco de
  Yoga; no mide ni hospeda hijos RN ni crea un reproductor de audio.
- `MediaActionView`: UIButton para contenido visual compuesto por React Native.
  Yoga define su rectángulo y UIKit procesa toque, pulsación larga, resaltado y
  accesibilidad. No hospeda hijos RN ni devuelve dimensiones al layout. Usar
  `BotonSuperficie` únicamente cuando su contenido no contiene otros controles.

`TrackRow.ios` conecta las filas en colecciones, álbumes y cola; la biblioteca
conecta también sus filas y mosaicos. `TabBar.ios` conecta la barra del sistema.
La virtualización, reordenación de cola, portadas personalizadas y animaciones
siguen en la composición RN existente. No es una reescritura total de esas
pantallas en SwiftUI.

El módulo es opcional para binarios anteriores: preservan la implementación
compartida. Un build iOS nuevo es necesario para usar estas vistas. Compilar y
comprobar en iPhone: safe area de la barra, texto grande, VoiceOver, cancelación
por scroll, menú contextual frente a pulsación larga y mosaicos con red lenta.
El empaquetado JavaScript y las pruebas de callbacks no verifican Swift/UIKit.


## Alcance de Liquid Glass

La barra **ya era UITabBar antes de este ajuste**. El cambio retira su
`UIBlurEffect.systemChromeMaterialDark` forzado y reserva más altura en iOS 26
(72 puntos, ampliables con Dynamic Type). Es una barra independiente conectada
al router existente; no se ha añadido un segundo UITabBarController con rutas
vacías. Buscar conserva la navegación compartida.

No se promete la búsqueda separada/expandible de `UISearchTab`, minimización
automática por scroll ni la fusión con `UITabAccessory`: esos comportamientos
requieren que UITabBarController sea dueño del contenedor y su contenido.
El movimiento de selección por toque sigue siendo el del UITabBar del sistema;
no se simula mediante un indicador RN o un resorte propio. Comprobar su aspecto
exacto en un binario compilado con SDK iOS 26 o posterior.

El módulo anuncia `miniPlayerVersion: 1`. El bridge sólo solicita la nueva vista
cuando ese dato existe: un binario anterior puede tener MediaControls instalado
sin registrar todavía la mini barra y seguirá usando el componente de respaldo.

Contrato `NativeMiniPlayer`: title, subtitle, artwork opcional, playing, busy,
canNext, canPrevious, deviceLabel, remote y eventos onOpen/onPlayPause/onNext/
onPrevious/onDevices/onOptions. La composición React reserva un alto mínimo
64 y lo amplía con fontScale. La lógica de permisos/Jam sigue en los callbacks.

Validación pendiente en iPhone: selección/reselección/volver desde perfil,
Buscar, badges 0/1/100, VoiceOver, texto grande, Reducir transparencia/movimiento,
pausar cargando, siguiente deshabilitado, menú contextual/cierre sin activar la
portada subyacente y cambio rápido de portada con audio offline. Los tests JS
verifican bridge/callbacks; no equivalen a compilar Swift ni a una prueba visual.

Fuentes oficiales: [adoptar Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass),
[UIKit y el diseño iOS 26](https://developer.apple.com/videos/play/wwdc2025/284/),
[glassEffect](https://developer.apple.com/documentation/swiftui/view/glasseffect(_:in:)),
[acciones accesibles](https://developer.apple.com/documentation/swiftui/view/accessibilityaction(named:_:)).
