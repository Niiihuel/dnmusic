# Migración de la interfaz de iOS a componentes nativos

Revisión del 12 de septiembre de 2026. Los controles migrados están integrados
y comprobados en JavaScript. El cierre sigue **pendiente del build y la prueba
en iPhone**: empaquetar JavaScript no acredita compilación Swift.

## Arquitectura elegida

Continuar con Expo Router, servicios y stores compartidos, e implementar las
superficies iOS con SwiftUI/Expo UI o UIKit cuando el control lo requiera.
Los módulos locales de `modules/` están escritos en Swift. `media-controls`
añade filas multimedia, barra de pestañas y superficies interactivas UIKit.
La lógica de `app/` y `src/ui/` conserva servicios y stores compartidos.

Expo UI hospeda vistas SwiftUI reales mediante `Host`/`UIHostingController`,
con integración por componente. Permite una migración gradual sin duplicar
Supabase, reproducción, sincronización de dispositivos ni lógica de Jam.
[Guía oficial de Expo](https://docs.expo.dev/guides/expo-ui-swift-ui/).

Esto no convierte toda la aplicación en un proyecto Swift independiente.
Tampoco hay que confundir React Native con HTML: sus vistas iOS ya usan UIKit;
aquí se sustituye la composición de controles en React Native por controles
SwiftUI del sistema.

## Inventario revisado

| Área | Implementación actual | Estado / trabajo pendiente |
| --- | --- | --- |
| Ruta de audio / AirPlay | `modules/audio-route/ios/AudioRouteModule.swift` | Swift existente; verificar selección de salida en dispositivo |
| Comandos de pantalla bloqueada | `modules/remote-commands/ios/RemoteCommandsModule.swift` | Swift existente; verificar con app en segundo plano |
| Exclusión del backup | `modules/backup-exclusion/ios/BackupExclusionModule.swift` | Swift existente |
| Menús | `MenuNativo.ios.tsx`, `modules/native-menu` | SwiftUI/Swift existentes; conservar fallback para binarios anteriores |
| Búsqueda/menú de colecciones | `modules/collection-controls` | UIKit en Swift; no envolver filas en ciclos de medición RN/SwiftUI |
| Confirmaciones | `Confirmar.ios.tsx` | Alert del sistema existente |
| Segmentado | `Segmentado.ios.tsx` | Picker SwiftUI existente |
| Interruptores | `Interruptor.ios.tsx` | Toggle SwiftUI existente |
| Editor del chat | `CampoMensaje.ios.tsx` | TextField vertical SwiftUI existente |
| Volver | `BotonVolver.ios.tsx` | Button SwiftUI; cabeceras y acciones con SF Symbols mediante IconButton |
| Acceso con Google | `GoogleOAuthButton.ios.tsx`, `GoogleOAuthFeedback.ios.tsx` | Variantes iOS; cabecera y notas SwiftUI, entrada única con Google |
| Lista agrupada | `ListaAgrupada.ios.tsx` | List/Section existentes, ahora utilizados por el selector de compartir |
| Botones de formulario | `Button.ios.tsx` | **Añadido:** Button/ProgressView nativos, estados ocupado/deshabilitado y alternativa anterior a iOS 26 |
| Buscador compartido | `SearchField.ios.tsx` | **Añadido:** TextField, lupa, limpiar y progreso SwiftUI; foco/blur compartidos con web |
| Posición y volumen | `SeekBar.ios.tsx` | **Añadido:** Slider SwiftUI; seek al soltar, volumen durante arrastre y cambios de VoiceOver |
| Progreso de transferencias | `Progreso.ios.tsx` | **Añadido:** ProgressView determinado SwiftUI |
| Configuración | `app/ajustes/index.tsx`, `Ajustes.ios.tsx` | List/Section nativos, filas, menús, interruptores y confirmaciones; conserva Cuenta, Google y administración |
| Formularios | `EntradaTexto.ios.tsx`, `Field.ios.tsx`, editores e importación | TextField/SecureField, foco/blur/clear, submit, autocompletado y edición multilineal |
| Navegación y reproductor | `TabBar.ios.tsx`, `AppDrawer.ios.tsx`, `EncabezadoHoja.ios.tsx`, `Transport.ios.tsx`, `IconButton.ios.tsx` | UITabBar, menú lateral List, cabeceras y transporte SwiftUI; estado y rutas compartidos |
| Colecciones / descargas / contactos | `TrackRow.ios.tsx`, `PlaylistView.tsx`, `ColaBody.tsx`, ajustes de descargas/bloqueados, `FilaCuenta.ios.tsx` | Filas UIKit, biblioteca con mosaicos de portadas; descargas List; contactos y solicitudes con acciones nativas |
| Bandeja de Chats | `ContenidoChats.ios.tsx` | Encabezado, filas de conversación, fechas, no leídos, solicitudes y cargas en SwiftUI; `FlatList` conserva virtualización/scroll y los avatares usan el componente compartido mediante `RNHostView` |
| Chat y Jam | `Social.ios.tsx`, `FilaSocial.ios.tsx`, `JamPanel.tsx`, `MandarJamAmigo.tsx`, editor y tarjetas | Acciones, invitaciones, radios y selección nativas; tarjetas y ondas conservan composición específica |
| Perfil y edición visual | `SelectorPestanasPerfil.ios.tsx`, `SelectorCatalogo.ios.tsx`, `EstudioPerfil.tsx`, `Encuadre.tsx`, rutas de perfil | Picker/Menu/List, herramientas, campos y guardar/cancelar nativos; mosaico, fotos, vídeo y gestos conservan el editor especializado |
| Inicio / artistas / favoritos / alta inicial | `BotonSuperficie.ios.tsx`, `IconButton.ios.tsx`, HomeFeed, ArtistPage, MeGusta, onboarding | Botones UIKit para superficies visuales y SwiftUI para acciones; tarjetas y navegación conservan datos/estado |
| Diálogos y estados vacíos | `SelectorDispositivos.ios.tsx`, `Traspaso.ios.tsx`, `NovedadesAlAbrir.ios.tsx`, `Vacio.ios.tsx` | ActionSheetIOS/Alert y textos/acciones SwiftUI; cancelación y callbacks antiguos comprobados |
| Audio, red y backend | `MotorAudio.tsx`, `src/services/`, `src/state/` | No son controles de interfaz; no necesitan una reescritura a Swift para usar SwiftUI |

Una variante `.ios.tsx` cuenta como migrada en código, no como aprobada
visualmente. La tabla agrupa superficies relacionadas; no significa que cada
archivo de un grupo ya use exclusivamente SwiftUI.

## Alcance del cierre

La migración cambia los controles interactivos de los módulos a SwiftUI/UIKit,
no reescribe Expo Router, Supabase o los stores en Swift. Los archivos sin sufijo
`.ios` también consumen primitivas con resolución por plataforma. Por eso contar
archivos TypeScript o etiquetas View no mide por sí solo el avance.

Se conservan contenedores y listas virtualizadas de React Native, composición de
portadas/tarjetas, vídeo, letras sincronizadas, animaciones y gestos de mosaico,
arrastre y pulsación sostenida. Esas superficies no equivalen a controles
SwiftUI completos. Los menús del sistema y las superficies UIKit alojan el
contenido gráfico cuando corresponde, sin mover su medición a SwiftUI.

**Cierre pendiente:** compilación Swift/CocoaPods y prueba en iPhone de las nuevas
vistas. Las pruebas unitarias y el exportado de Hermes no sustituyen ese paso.
También sigue pendiente la prueba real de OAuth y chat con dos cuentas.

Para los controles flexibles se declara el ancho del Host y se usa medición
vertical únicamente cuando el contenido debe determinar la altura. En las
listas se reserva un panel con altura definida. La documentación explica por
qué `matchContents` horizontal puede colapsar un Slider o ProgressView.
[Host](https://docs.expo.dev/versions/latest/sdk/ui/swift-ui/host/).

El Slider conserva la separación entre cambio de valor y fin de edición:
reproducir no debe encadenar saltos durante un arrastre, pero el volumen sí debe
responder en vivo. Los tipos y eventos se comprobaron también contra el código
Swift/TypeScript de `@expo/ui` instalado, versión 57.0.18.
[Slider](https://docs.expo.dev/versions/latest/sdk/ui/swift-ui/slider/).

## Compartir música dentro de la app

`Compartir → Enviar por chat → contacto` envía un adjunto `kind: 'track'` en
la columna JSON `messages.song`. El modelo lo expone como `sharedSong` y deja
`message.song` exclusivamente para los fragmentos anteriores. No requiere
migración SQL. RLS y las restricciones de contactos/bloqueos siguen siendo las
del chat existente.

El selector lee conversaciones existentes, filtra por nombre/usuario y
muestra carga, error, reintento y confirmación por destinatario. Impide doble
toque y reenvío al mismo contacto mientras permanece abierta esa hoja. No
crea solicitudes de contacto implícitas.

Se guardan metadatos, identificador y rutas relativas de Storage; no el audio
ni URLs firmadas. Compartir no necesita resolver ni publicar la canción.
La tarjeta usa `playQueue`/`togglePlayback`: la resolución del audio, la cola,
el Jam y el traspaso siguen pasando por los controles existentes. El audio
continúa al salir del chat. La tarjeta aparece en conversación, bandeja,
inspector y detalle de mensaje. Un cliente anterior conserva al menos el texto
con título y artista, pero no dibuja el nuevo adjunto.

Este flujo cubre enviar a contactos dentro de dnmusic. Recibir contenido desde
el menú Compartir de otras aplicaciones sería una función diferente que exige
un flujo de entrada y, según la integración elegida, una extensión de iOS.

## Comprobaciones y límites

- Integración ampliada: 487 pruebas de `tests/` aprobadas, TypeScript y ESLint
  sin errores ni advertencias. ESLint se ejecutó sin caché al cerrar.
- Pruebas nuevas de serialización, fragmentos anteriores, adjuntos inválidos,
  errores de envío, búsqueda de contactos y bloqueo de doble toque.
- Pruebas de callbacks SwiftUI: arrastre, seek al finalizar, volumen en vivo,
  ajuste accesible, foco programático y limpiar búsqueda.
- Exportación Metro/Hermes para iOS y exportación para web completadas después
  de integrar las nuevas variantes. Autolinking reconoce `MediaControlsModule`.
- Login web revisado visualmente: una sola acción Google; `/sign-up` vuelve a
  `/sign-in`, sin campos de contraseña ni enlace a registro separado.
- No se enviaron mensajes reales ni se publicaron builds.

**Falta validar en iOS:** compilación Swift/CocoaPods, teclado, VoiceOver,
texto grande, contraste de botones ocupados, dispositivos estrechos, cancelación
por gesto del Slider y fluidez de sus actualizaciones. El control nativo recibe
la posición publicada por React; la shared value de alta frecuencia queda fuera
de esta primera variante.

También falta la prueba de integración con dos cuentas: enviar/recibir por
Realtime, reproducir un tema sin resolver, volver a abrir el mensaje, compartir
una canción propia y comprobar el rechazo si se bloquea el contacto entre la
carga de la lista y el envío.

Este host no tiene Xcode ni simulador. El siguiente paso de validación del
binario es el perfil `preview` de EAS descrito en [BUILD-IOS.md](BUILD-IOS.md).

## Perfil y superficies sociales: integración de controles nativos

En iOS, `Social.ios.tsx` hospeda acciones SwiftUI con bloqueo durante envíos y
confirmaciones, estado seleccionado y nombres accesibles independientes del
texto visible (por ejemplo, los emojis). `FilaSocial.ios.tsx` dibuja el texto,
la selección y las acciones de filas en SwiftUI. No añade un `List` dentro de
los scrolls existentes: avatares, portadas y fondos permanecen en la composición
multimedia y las filas de texto miden únicamente su altura.

- **Perfil:** el selector Reciente/Space es un `Picker` segmentado. La barra de
  cambios conserva su posición, medición y reserva inferior, con acciones
  SwiftUI. Las herramientas del mosaico usan `IconButton`; continúan delegando
  guardar/restablecer en el editor global.
- **Editar perfil:** navegación de secciones iOS, subir/cambiar/encuadrar/quitar
  foto, vista previa de audio y acciones de subspaces usan controles nativos.
  La navegación web conserva sus filas de 30 px. La selección tipográfica
  iOS muestra la fuente real mediante `fontFamily` en el texto SwiftUI.
- **Tema, vitrina y recorte:** acabados, confirmación y cancelación, zoom,
  rotación y centrado usan acciones nativas. Los textos del borrador usan
  `EntradaTexto`, incluidos título de subspace, encabezados, letra y texto.
  Las hojas siguen actualizando el mismo borrador, sin persistir por separado.
- **Probador:** los filtros pequeños usan menús nativos. El selector de
  colecciones extenso abre una presentación `pageSheet`, con buscador y un
  único `List` SwiftUI que ocupa su panel; conserva filtro sin tildes,
  selección, cancelar y volver al catálogo. Las acciones para alternar vista
  previa, quitar una pieza y desplegar la combinación también son nativas.
- **Jam:** código de entrada, opciones de escucha, invitaciones por chat,
  copiar código, mostrar QR, expulsar participantes y controles de reproducción
  o eliminación de cola se conectan a los mismos callbacks mediante SwiftUI.
- **Chat:** el compositor conserva destinatario, portadas y fragmentos; las
  acciones para cambiar destinatario/canción son filas nativas. Se migran los
  controles de reproducción en burbuja, tarjeta, inspector y detalle, además
  de la selección de presentación y frase. `sharedSong` y el reproductor
  principal continúan pasando por sus componentes y stores existentes.
- **Reacciones:** los emojis conservan bloqueo durante envío y selección; las
  listas de autores, reintento y paginación usan acciones nativas. El trigger
  con pulsación larga y propagación controlada, y las áreas de cierre/anclaje,
  conservan sus gestos para no activar accidentalmente la música de la pieza.
  La oferta posterior a una captura también usa botones nativos.

Las portadas, vídeos, ondas, cosméticos animados, selección visual de colores,
mosaicos y los gestos simultáneos de recorte/reordenación continúan siendo
superficies multimedia React Native/UIKit. Esto evita reemplazar funcionalidad
especializada por controles sin equivalente directo; no equivale a que todos
sus píxeles estén dibujados en SwiftUI. Las colecciones visuales conservan su
virtualización y su estado de edición.

Se añaden comprobaciones de callbacks nativos para impedir acciones ocupadas,
selección nula/inválida del perfil y búsqueda/selección/cierre del catálogo.
Las pruebas de borradores, navegación del editor, probador y mosaico siguen
comprobando que cerrar o cambiar de sección no guarda ni pierde cambios.
La revisión visual, VoiceOver, teclado y compilación Swift siguen requiriendo
el binario iOS; una exportación JavaScript no sustituye esa validación.

## Estado del build de prueba

El proyecto configurado es **@niihuel/flora** en EAS
(`00b92a9e-b7f1-4c0f-b26d-62681d3236a1`). El intento de ejecutar el perfil
`preview` fue rechazado por la revisión automática de permisos antes de iniciar
el proceso: subir el código a EAS necesita autorización explícita. No se
inició ningún build ni se transfirieron archivos.

`.easignore` conserva las exclusiones de Git y además excluye backend,
escritorio, Supabase, documentación, tests y estado de herramientas. El inventario
local contiene 426 archivos (aproximadamente 6 MB), incluidos código del cliente,
assets, lockfile y módulos Swift. Excluye archivos `.env` privados y certificados.
Este inventario no es un build compilado.

Una vez autorizada esa transferencia, la validación prevista es:

```sh
EXPO_NO_DOTENV=1 eas build --profile preview --platform ios --non-interactive --freeze-credentials --no-wait --json
```

No incluye `--auto-submit` ni modifica las credenciales de firma. Si el perfil
requiere aprovisionamiento inicial, habrá que resolver ese requisito antes de
instalar en un iPhone.


### Revisión de contactos y conversaciones (12 de septiembre de 2026)

La revisión encontró que las filas principales de Chats todavía dibujaban nombre,
fecha, vista previa y contador mediante `View`/`Text`, aunque el toque ya pasaba por
un control Swift. Se extrajeron a `ContenidoChats` con variantes por plataforma:
en iOS el contenido y las acciones son `Button`, `HStack`, `VStack` y `Text` de
SwiftUI a través de Expo UI. Los tamaños de texto usan estilos semánticos y la
altura se mide por contenido; no leídos y selección se anuncian con VoiceOver.
Las acciones de aceptar y rechazar son botones independientes de al menos 44 puntos.

La búsqueda de personas y el selector de destinatario ya resolvían a
`FilaCuenta.ios.tsx`; compartir una canción utiliza `ListaAgrupada.ios.tsx`.
Los avatares conservan carga/fallback de la app dentro de `RNHostView` y la bandeja
conserva `FlatList`, necesario para su virtualización y el scroll que controla la
barra inferior. No se presenta esta implementación como una pantalla íntegramente
escrita en Swift ni como un `List` nativo completo.

`tests/chats-swiftui.test.mjs` verifica callbacks, selección, no leídos, objetivos
táctiles y las variantes de iOS/escritorio. También se verifican la navegación y
los destinatarios de solicitudes. La exportación iOS verifica el bundle JavaScript;
queda la comprobación visual en un build de iPhone con Expo UI instalado, especialmente
con Texto Más Grande y VoiceOver.
