# Sistema de diseño

La referencia de interacción es **Apple HIG**, adaptada a DMusic en PC e iOS.
La interfaz conserva una paleta acromática; portadas, fondos y cosméticos
aportan color. El blanco destaca la acción principal.

## Estándar de interacción: Apple HIG

La edición de perfil, la búsqueda y los flujos sociales siguen las Human
Interface Guidelines de Apple, conservando la paleta acromática de DMusic.
Estas convenciones rigen las pantallas nuevas y sus adaptaciones:

- **Una anatomía social compartida.** `Social.tsx` aporta `CabeceraSocial`,
  `AccionSocial` y `SeccionSocial` para chat, detalle, fragmentos y Jam. Títulos
  de 17 px, cuerpo de 15 px, metadatos de 13 px y acciones en oración normal.
  Las superficies agrupadas tienen radio de 16 px. Cada nivel de contenido
  necesita una jerarquía clara; evitar envolver una tarjeta compartida en
  varias tarjetas adicionales.
- **El link compartido tiene su propia anatomía.** Quien llega desde afuera no
  viene navegando: primero tiene que resolver si esto le interesa, y recién
  después la puerta. `ui/Aterrizaje` pone la tapa grande y centrada con el
  degradado de su color, el título de 22 px y el artista de 15 px debajo, y una
  sola acción principal —entrar— con «Abrir en la app» como secundaria en
  `muted`. La tapa se despega por sombra, nunca por borde. La versión incrustable
  (`/embed/…`) repite los mismos tokens escritos a mano: no puede traer el
  bundle. Ver [los links compartidos](COMPARTIR.md).
- **PC y iOS comparten el flujo, no el ancho.** Los formularios breves se
  presentan centrados en PC; la navegación extensa puede usar barras laterales.
  En iOS se usan hojas y contenido apilado. Los controles táctiles tienen
  al menos 44 px. El buscador lateral usa `SearchField density="compact"`:
  34 px con mouse y 44 px con puntero táctil. El texto puede reducir su ancho;
  limpiar y cargar conservan espacio propio.
- **Acciones proporcionadas.** `AccionSocial` ocupa su contenido en PC. El
  ancho completo se reserva a una acción móvil que lo necesite (`expandida`).
  Una acción principal por paso; opciones secundarias en un menú visible de
  Opciones, no en varias filas de botones. Los submenús agrupan duración y
  presentación del fragmento. `MenuNativo` usa SwiftUI en iOS.
- **Una convención de hoja.** `CabeceraSocial` delega en `EncabezadoHoja`:
  cerrar a la izquierda, título de 17 px y resumen debajo, acción a la derecha.
  Todos los controles tienen un área de 44 px. `Hoja` limita ancho y alto en
  escritorio y usa `Modal` en web para foco, Escape y capas apiladas; en iOS
  presenta el `formSheet` del sistema. La altura compacta depende del contenido.
  No se simula un tirador de arrastre en web si no existe el gesto.
  `Confirmar.ios` usa el alert nativo; el resto conserva el diálogo accesible.
- **El scroll forma parte del contenido.** `ScrollArea` conserva el scroll
  nativo en iOS. En web superpone un indicador semitransparente, arrastrable y
  operable con teclado, sin reservar un carril ni cambiar el degradado. El
  fondo vive detrás del viewport. `usePiso` reserva dentro de la lista el
  espacio necesario para alcanzar sus últimos controles. Dentro de una hoja,
  `usePisoHoja` reserva sólo el área segura: el reproductor queda detrás.
- **El perfil es un fondo continuo.** El fondo y el efecto animado se
  dibujan detrás del área visible, independientes de la altura del mosaico.
  Avatar y placa conservan sus decoraciones. El marco de tarjeta de Discord
  se aplica únicamente a Estadísticas, con su proporción original y espacio
  reservado para los adornos. La vista previa Perfil usa esta composición;
  Tarjeta conserva la composición compacta original.
- **Un borrador para toda la edición del perfil.** Identidad, medios,
  privacidad, cosméticos, tipografía, tema y mosaico comparten la sesión de
  `perfilEdicion` y `mosaicoEdicion`. Las hojas eligen y vuelven; no guardan.
  Sólo Editar perfil presenta `BarraCambiosPerfil` con Restablecer y Guardar
  cambios. Su material usa `Glass`, con reserva de altura y área segura.
  Al salir del editor completo se ofrece conservar o descartar el borrador.
  El toolbar del mosaico agrupa herramientas y agregar piezas; no confirma.
- **En Configuración todo es una fila.** Campos, valores y acciones se arman
  con `FilaTexto`, `FilaDato` y `FilaAccion`, y lo que salió mal va al pie de su
  bloque (`GrupoAjustes.error`). El campo alto con etiqueta en versalitas y el
  botón ancho son el vocabulario del **formulario de acceso**, donde hay una
  sola acción por pantalla; adentro de una lista agrupada rompen el ritmo y
  gritan. Ver [Configuración](AJUSTES.md).
- **En PC la ventana es de la app, no del sistema.** El escritorio apaga la
  barra de título y conserva únicamente los botones del sistema, teñidos con la
  paleta. **El cromo va encima del layout, nunca adentro**: la app llega hasta el
  borde de arriba y los botones flotan; reservarles una fila deja una banda
  muerta cruzando la ventana. El arrastre lo declara `CabeceraLateral` con
  `dn-arrastrar` y sus controles se salen con `dn-no-arrastrar`. Ver
  [el escritorio](ESCRITORIO.md).
- **La navegación comparte una convención.** Inicio y Editar perfil usan
  `CabeceraLateral` y filas con iconos sin cajas decorativas. Las columnas
  se pueden plegar independientemente. Atrás y Adelante flotan sobre el
  degradado del contenido; no hay una franja global separada. El probador
  tiene previa plegable en escritorio y un paso separado en teléfono.
- **Estados vivos, con datos.** Nunca mostrar «En línea» sin presencia real.
  La escucha del contacto se relee cada tres segundos mientras el perfil
  está enfocado; se suspende en segundo plano. El reproductor publica un
  latido cada veinte segundos y una escucha sin actualizar durante 65 segundos
  deja de presentarse como actual. Las reacciones muestran sus autores al
  pasar el cursor o dar foco en PC, y al tocar en teléfono.
- **Movimiento y foco.** Las piezas del catálogo se animan al pasar el cursor
  o enfocarlas con teclado; las listas cargan progresivamente. Se respeta
  Reducir movimiento y se detienen las animaciones al dejar de usarlas. El
  foco de teclado es visible y acromático.

Referencias: [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets),
[Menus](https://developer.apple.com/design/human-interface-guidelines/menus),
[Apple HIG](https://developer.apple.com/design/human-interface-guidelines/),
[Search fields](https://developer.apple.com/design/human-interface-guidelines/search-fields),
[Scroll views](https://developer.apple.com/design/human-interface-guidelines/scroll-views).

## Filosofía

Oscuridad inmersiva donde la interfaz desaparece y queda el contenido: la flor,
el mensaje, la letra. Las superficies se separan por **luminancia**, nunca por
bordes ni por tono.

## Color

### Oscuro (por defecto)

| Rol | Hex | Uso |
|-----|-----|-----|
| `background` | `#121212` | Fondo de la app, la capa más profunda |
| `card` | `#181818` | Tarjetas, contenedores |
| `muted` | `#1F1F1F` | Campos, botones secundarios, superficies interactivas |
| `muted-foreground` | `#B3B3B3` | Texto secundario, etiquetas, estados inactivos |
| `foreground` | `#FFFFFF` | Texto principal |
| `primary` | `#FFFFFF` | **El acento.** Acciones primarias y estados activos |
| `primary-foreground` | `#121212` | Texto sobre el acento |
| `border` | `#4D4D4D` | Bordes de botón sobre oscuro |

### Claro

| Rol | Hex |
|-----|-----|
| `background` | `#FFFFFF` |
| `card` | `#F5F5F5` |
| `muted` | `#EFEFEF` |
| `muted-foreground` | `#6A6A6A` |
| `foreground` | `#121212` |
| `primary` | `#121212` |
| `primary-foreground` | `#FFFFFF` |

El tema se cambia con `html[data-theme="light"]`, que voltea los mismos nombres
de token. Ningún componente necesita saber que existe un tema.

### Nota sobre los errores

Al ser todo gris, los errores **no se distinguen por color**: se apoyan en la
redacción y en la posición. Es una consecuencia asumida del pedido de que sea
monocromo. Si en algún momento molesta, alcanza con darle un tono al token
`destructive` sin tocar nada más.

## Tipografía

Las fuentes propias de Spotify (SpotifyMixUI / CircularSp) son licenciadas, así
que se usa la pila del sistema, que en iOS resuelve a **SF Pro** — la más cercana
en carácter a Circular.

| Rol | Tamaño | Peso |
|-----|--------|------|
| Título de pantalla | 24px | 700 |
| Encabezado | 18px | 600 |
| Cuerpo | 16px | 400 |
| Botón | 14px | 600, versalitas con `letter-spacing: 1.4px` |
| Etiqueta / metadato | 14px | 400 |
| Fino | 12px | 400 |

**Binario negrita/regular:** casi todo es 700 o 400. La jerarquía sale del
contraste de peso, no de la variedad de tamaños. Rango total 10–24px: esto es una
app, no una revista.

## Geometría

La identidad es **píldora y círculo**:

- Botones → `rounded-full` (píldora completa)
- Controles de reproducción → círculo (`50%`)
- Campo de búsqueda → píldora
- Tarjetas y contenedores → 8px
- Campos de texto multilínea → 8px

## Elevación

Sobre fondo casi negro, una sombra sutil es invisible. Tienen que ser pesadas:

| Nivel | Sombra |
|-------|--------|
| Tarjeta | `rgba(0,0,0,0.3) 0px 8px 8px` |
| Diálogo / modal | `rgba(0,0,0,0.5) 0px 8px 24px` |

## Reglas

**Sí:**
- Separar superficies por luminancia (`#121212` → `#181818` → `#1F1F1F`)
- Reservar el blanco puro para la acción primaria y el estado activo
- Píldora en todo botón, círculo en todo control de reproducción
- Versalitas con tracking amplio en las etiquetas de botón
- Tipografía compacta y densa

**No:**
- Introducir ningún color de marca — la paleta está completa con grises
- Usar blanco puro decorativamente: es el acento, y pierde fuerza si se reparte
- Dibujar bordes grises visibles: separar por fondo, no por línea
- Sombras sutiles: sobre negro no se ven
- Interlineados amplios

## Vidrio (iOS 26 y web)

En iOS 26 el reproductor y las pestañas son **Liquid Glass**, y **en web el
mismo material se dibuja con CSS**: `backdrop-filter: blur + saturate`, un
fondo translúcido y un filo de luz arriba en lugar de borde. En lo demás
—Android, iPhone anterior— caen al gris de siempre. Lo decide `HAY_VIDRIO`,
una vez, en `src/ui/Glass.tsx`; la receta CSS vive ahí mismo (`vidrioCss`).

En escritorio el vidrio trae su propia consecuencia de layout: **la barra del
reproductor flota** como tarjeta sobre los paneles —igual que la del teléfono—
en vez de apilarse al pie, y el hueco lo reservan las listas con `usePiso`,
como siempre.

El material **no es un color: es una lente**. Necesita algo por debajo que valga
la pena difuminar, y de ahí salen las tres reglas que ordenan el layout del
teléfono:

1. **El contenido corre hasta el borde de abajo.** El contenedor no se acorta
   el alto de la cáscara. Si el área midiera menos, no pasaría nada por detrás
   y el vidrio se vería como un gris más, con el costo de un efecto caro.
2. **El hueco se reserva adentro de cada lista**, como margen del contenido:
   `usePiso(extra)` da el alto medido de lo que flota abajo. Así llegás igual a
   la última fila, pero mientras desplazás las de arriba pasan por debajo del
   material.
3. **Nada opaco entre el contenido y el vidrio.** El degradado que funde la
   lista contra el borde solo se dibuja *sin* vidrio: con vidrio termina opaco
   justo donde está la tarjeta, y el material difuminaría un gris plano en vez
   del contenido.

Solo flota lo que se apoya sobre el contenido —la tarjeta del reproductor, las
pestañas, los redondeles del encabezado—. Los paneles son el fondo: ahí no hay
nada atrás y no llevan vidrio.

## Escritorio (macOS 26/27)

Con el reproductor en forma de píldora de Apple Music, el resto del escritorio
sigue el mismo lenguaje — el de macOS 27 (Golden Gate), que es el que documenta
la HIG de Liquid Glass y **corrige** al de Tahoe:

- **Las columnas van de borde a borde**, sin huecos, sin tarjetas redondeadas y
  sin sombras entre paneles (los sidebars flotantes de Tahoe se descartaron por
  eso mismo). La separación es un escalón de luminancia: los laterales
  —la barra de navegación, el inspector— en `canvas` (negro), el contenido del
  medio en `background`. Lo decide `tone` en `src/ui/Panel.tsx`.
- **La columna izquierda es la navegación**, no solo la biblioteca: la *source
  list* de Música en la Mac (`src/ui/BarraLateral.tsx`). Filas de 30 con el
  ícono de 16 y el rótulo de 13, secciones con rótulo en gris —Biblioteca,
  Listas con su «+»—, cada lista con su tapa chica, la elegida en `muted`, y al
  pie la configuración y la cuenta. Es la *navigation split view* de la HIG: a
  la izquierda a dónde ir, a la derecha lo que se mira; el encabezado queda para
  lo que es del contenido (atrás, adelante, inicio).
- **Estantes para el contenido, cajas para los formularios.** Es la regla de
  Apple y vale en el teléfono y más en la compu: las pantallas de contenido
  —Inicio, un artista, el perfil— son estantes (título en negrita y una fila
  de tapas que se desplaza) apoyados sobre el fondo, sin encerrar nada. Las
  listas agrupadas con placa —las «cards»— quedan para lo que es un
  formulario o una lista de controles: Ajustes, Editar perfil, una hoja. Una
  portada hecha de cajas se lee como un panel de control, no como música.
- **La cabecera de una hoja va pegada arriba y de ella cuelga un velo.**
  `EncabezadoHoja` es opaca y lleva debajo un degradado del fondo a nada;
  puesta como primer hijo del scroll con `stickyHeaderIndices={[0]}`, lo
  que se desplaza por debajo se apaga contra el velo en vez de cortarse
  contra el borde, y nunca tapa un botón. El scroll es la raíz de la hoja
  —no una vista con la cabecera y el scroll apilados— porque en iOS esa
  vista no tenía alto y el contenido se dibujaba debajo de la cabecera.
- **El buscador vive arriba de la barra lateral**, como en Música y en Mensajes
  para Mac, y no en el encabezado. En música la primera letra lleva el panel
  del medio a la pantalla de resultados —la misma del teléfono— y las
  siguientes solo cambian la consulta; en conversaciones filtra la lista y
  debajo muestra la gente nueva que coincide. Las pantallas con secciones
  —Configuración, Editar perfil— son la misma *split view*: la barra con las
  secciones y su placa, el detalle al lado, y los campos de texto editándose
  ahí mismo en vez de empujar una pantalla por campo.
- **Una pantalla es una sola superficie.** El `canvas` negro es *solo* de las
  columnas laterales del layout; una pantalla de detalle —Ajustes, una lista, un
  perfil, novedades— es una superficie continua en `background`, con su
  encabezado incluido. Antes esas pantallas ponían el `canvas` negro de fondo y
  el contenido en un panel `background`, así que el header quedaba flotando en un
  negro más oscuro que su propio contenido: un corte horizontal negro→gris que
  no separaba nada, solo ensuciaba. Es el criterio *base/elevated* de la HIG de
  Apple —la vista que llena la pantalla es el nivel base, el contenido se separa
  **elevándose** (las tarjetas y grupos en `card`), nunca hundiendo el fondo del
  header. La pantalla inmersiva de «Sonando» es la excepción y a propósito:
  negro pleno de borde a borde, sin nada que separar, como el *now playing* de
  Apple Music.
- **La barra de arriba es uniforme y está en el flujo**, no flotando sobre el
  contenido: es el cromo de la ventana, del mismo tono que los laterales.
- **El vidrio es solo de la capa de controles**: los redondeles del encabezado,
  el buscador y la píldora del reproductor. Los paneles son el fondo y no
  llevan material — la misma regla de siempre.
- **Radios contenidos y parejos**: la píldora del reproductor es la pieza más
  redondeada; los paneles no se redondean. Nada de vidrio sobre vidrio.

## Menús

La anatomía es la del menú contextual de iOS 26 (Apple Music):

- **Arriba, una fila de hasta cuatro acciones rápidas** —ícono arriba, rótulo
  abajo—: lo que se toca todo el tiempo y se entiende por el ícono (el corazón,
  encolar, compartir). En iOS es un `ControlGroup` adentro del menú y lo dibuja
  el sistema; en el nuestro, celdas parejas. Se marcan con `rapida: true`.
- **Después, la lista por grupos**, con un corte (`separadorAntes`) entre lo que
  hacés con la cosa, a dónde te lleva, y lo que la saca de acá. Los menús del
  sistema no separan ítem por ítem: separan grupos. Lo destructivo va al final
  y trae su corte solo.
- **Ícono a la izquierda y subtítulo en gris** cuando la fila lleva a algún
  lado: «Ir al álbum» dice debajo el nombre del disco, «Ver la lista» el de la
  lista. Así no hay que abrir para saber.
- Panel de vidrio, radio 20, filas de 44 (54 con subtítulo), sin bordes.

Una canción ofrece **el mismo menú en toda la app**: el buscador, una lista, el
top de un artista, la barra y «Sonando» arman la misma lista de filas (ver
`menuForTrack` en `app/index.tsx`); quien la muestra desde adentro de una lista
le suma abajo bajarla y quitarla. En el teléfono, «Agregar a una lista» abre la
hoja de elegir; en la compu, el submenú.

## Hojas

Toda hoja arranca igual: **cerrar a la izquierda, el título en el medio, la
acción a la derecha** (`EncabezadoHoja`), con una línea chica debajo del título
para el resumen vivo («3 canciones a “Mi lista”»). La marca de confirmar es un
redondel que está gris hasta que hay algo que confirmar, y se vuelve el blanco
del acento cuando lo hay; mientras guarda, la rueda ocupa su lugar sin mover
nada. Una hoja de tres opciones mide su contenido; una con buscador o teclado
va llena. Cerrar con algo a medio hacer pregunta antes de tirarlo.

## Letra

La pantalla de letra es la de Apple Music: **a la izquierda, en negrita
pareja**, la línea que suena en el primer quinto de la ventana —no al medio:
abajo tiene que entrar lo que **viene**, que es lo que uno lee— y las demás
retrocediendo. Las que vienen apagadas **y desenfocadas**, más cuanto más
lejos, como si estuvieran a otra distancia; las que ya pasaron, más apagadas
todavía.

Los grises están medidos de la pantalla de Apple Music y son **más bajos de lo
que uno pondría a ojo**: la línea siguiente está en 0.24 y de ahí para abajo,
contra el blanco pleno de la que suena. Ahí está el efecto: la línea que suena
no se destaca por brillar más, sino porque todo lo demás se corrió al fondo de
la pantalla. El 0.45 queda para la línea que la pantalla adelantó y todavía no
se canta: se lee entera, pero apagada.

**La unidad es el verso, no la palabra.** Hubo una versión que encendía la
línea palabra por palabra —el karaoke de Apple— repartiendo el verso por
sílabas, porque LRCLIB da el momento en que *empieza* cada línea y no el de
cada palabra. Andaba, pero se notaba: adentro de un verso el encendido a veces
iba rápido y a veces lento, según cómo hubiera cantado esa frase el que la
cantó. **Una letra que va apenas fuera de tiempo es peor que una que va por
verso y va bien**, así que se sacó, y con eso se fue toda la estimación: lo que
se dibuja sale siempre de un dato del archivo. Para volver al karaoke hace falta
el tiempo de cada palabra de verdad — el LRC «mejorado», que casi nadie publica,
o medirlo contra el audio.

**El salto es un resorte.** Medido cuadro a cuadro sobre la pantalla de Apple
Music: la columna arranca suave, agarra velocidad y aterriza largo —los últimos
píxeles tardan tanto como los primeros cincuenta—, unos cien píxeles en unos
600ms. Eso es lo que hace ver el movimiento como algo con peso en vez de un
corte. Va con un `dampingRatio` apenas por debajo de uno: pasa un poco de largo
y vuelve. Poco a propósito — con un rebote grande la letra se lee como un
juguete, y esto es texto para leer mientras suena.

**Y el cruce va aparte del movimiento.** La línea que sale pasa de blanca a
gris en unos 130ms —cuatro cuadros, medidos— mientras la columna sigue viajando
medio segundo más. Por eso la opacidad de cada línea sale de un foco **con
decimales** que viaja con su propio tiempo, y no del índice entero: atado al
índice, el cambio pasaba entero en el primer cuadro, antes de que la letra se
hubiera movido un píxel, y el resto del movimiento no acompañaba a nada.

**En los instrumentales largos la pantalla se adelanta**: la letra sube y deja
la próxima línea puesta, apagada, esperando su turno, en vez de mirar veinte
segundos de instrumental una línea que ya pasó. La cuenta se hace **desde la
línea que viene y no desde la que terminó** —cuándo dejó de cantarse un verso
habría que estimarlo; cuándo empieza el que sigue está en el archivo—: se
acomoda dos segundos y medio antes de que se cante, y solo si el hueco pasa de
siete segundos. Con versos pegados no se mueve nunca antes de tiempo.

Con la letra puesta, la pantalla es la letra: el encabezado se achica a una
miniatura con el nombre, la letra se funde contra el borde de arriba y contra
el de abajo, y los controles se dibujan encima, abajo, y se van solos a los
cuatro segundos hasta que se toca la letra.

**Es la misma pieza en el teléfono y en la compu.** `size="xl"` no es «la
pantalla del teléfono»: es **la letra como contenido principal**, y eso pasa
igual en el panel del medio del escritorio, donde la columna se topa a un ancho
de lectura pero el texto adentro va a la izquierda —la forma que toma Apple
Music en la Mac—. Los otros dos tamaños siguen centrados porque **acompañan a
otra cosa**: la onda del editor de fragmentos, la tarjeta de un mensaje. Ahí el
texto es un adorno, y por eso tampoco se adelantan: sin el apagado que
distingue a la línea que espera, adelantarse sería marcar como actual una línea
que todavía no cantó nadie.

Dos cosas que solo se ven en una ventana grande, y que el teléfono tapaba:

- **El desenfoque no vuelve a cero nunca.** Se cortaba a las ocho líneas
  —«están fuera de la ventana igual»—, y en el panel entran quince: la novena
  reaparecía nítida abajo de todo, como si volviera del fondo.
- **El fundido de los bordes lo pinta el color de quien la hospeda**, que se
  pasa por `fondo`. Con el negro puesto a mano, sobre el `background` del panel
  el fundido se leía como una franja **más oscura que el panel** — una sombra
  flotando en el medio de la nada. Es la regla de siempre: separar por
  luminancia, y nunca una capa que no sea de la superficie que hay debajo.

## Trampa: el reloj redibujando la lista entera

`Lyrics` se redibuja **diez veces por segundo**, porque mira la posición de la
canción. Las líneas son `memo`, así que en principio no debería importar — pero
recibían `onLayout`, `onPress` y `onLongPress` creados en cada pasada, y con
una prop nueva el `memo` no sirve de nada: se rehacían las cuarenta líneas, con
sus medidas y sus filtros, diez veces por segundo.

Medido en el navegador, eso trababa el hilo unos cien milisegundos cada vez y el
salto de verso salía a quince cuadros por segundo: se veía como un corte, no
como un movimiento. Lo que cambia va por `ref` y lo que se le pasa a la fila es
una función que no cambia nunca.

Vale para cualquier lista bajo un valor que corre: la barra, la onda, la cola.

## Trampa: medir fluidez en un navegador headless

El Chrome headless pinta **por software**, sin GPU, y una columna de cuarenta
párrafos con desenfoque le cuesta decenas de milisegundos por cuadro. Ahí
adentro cualquier animación se mide entrecortada, con o sin el efecto que uno
esté culpando — pasó buscando esto: sacar el desenfoque no cambió nada, y el
verdadero culpable eran los redibujados de arriba. Sirve para medir **qué
cambia** entre dos versiones, no para decidir si algo va fluido en el aparato de
alguien.

## Trampa: NativeWind y los componentes animados

**NativeWind no procesa `className` en componentes de Reanimated.** Un
`Animated.View className="bg-muted"` se renderiza sin fondo, y un
`Animated.Text className="text-foreground"` cae al color por defecto —negro—
sobre un fondo negro.

No falla ni avisa: simplemente el elemento se vuelve invisible. En este proyecto
apareció tres veces:

- La letra de la canción, que se veía negra sobre negro.
- Los bloques del skeleton, que no se veían en absoluto.
- El pulso de carga del buscador.

**Regla:** todo `Animated.*` lleva sus estilos por `style`, nunca por
`className`. Los colores literales que eso obliga a escribir van comentados con
el token del que salen.

## Trampa: `Image` con asset local en web

En web, react-native-web escribe el **tamaño intrínseco** de un asset
`require()` como estilo inline (`style="width: 1024px; height: 1024px"`), y el
estilo inline le gana a cualquier clase CSS. Un
`<Image source={require(...)} className="h-16 w-16" />` se ve bien en iOS y
gigante en el navegador — así apareció el logo de 1024px ocupando todo el login.

**Regla:** toda `Image` con `source={require(...)}` lleva su tamaño por
`style={{ width, height }}`, nunca por `className`. Las imágenes por URI no
sufren esto (el tamaño no se conoce al renderizar), pero seguir la misma regla
no cuesta nada.


## Hojas y regreso en iOS

El encabezado distingue volver a la pantalla anterior (chevron) de cerrar una
presentación modal (cruz). Ambos usan el control circular de 44 pt, un nombre
accesible y el mismo material de `BotonVolver`/`BotonHoja`. No se añade texto
visible «Volver» junto al icono en el diseño actual de iOS.
Referencia: [Apple HIG: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)
y [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets).

Las rutas con listas o contenido flexible (Spotify, recorte, tipografía) usan
`formSheet` con un detent explícito y raíz `collapsable={false}`. Reservar
`fitToContents` para contenido de altura natural: una raíz `flex: 1` no permite
al sistema deducir la altura intrínseca. El fondo de la hoja es opaco y sólo su
contenido se desplaza. En escritorio se conserva el modal centrado de `Hoja`.
Referencia: [Expo Router: Stack](https://docs.expo.dev/router/advanced/stack/).
