# Sistema de diseño

Basado en el de Spotify, con **una desviación deliberada: es completamente
acromático**. Ni verde, ni rosa, ni ningún color de marca — solo blanco, negro y
escalas de gris.

Esto no contradice a Spotify, lo lleva al extremo. Su propio principio dice *"la
carátula aporta todo el color; la UI se mantiene acromática"*. Acá no hay
carátulas dominando la pantalla, así que la UI se queda sola en su escala de
grises y **el acento pasa a ser el blanco**: lo más brillante de la pantalla es
la acción principal.

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
acción a la derecha** (`EncabezadoHoja`), con una línea chica encima del título
para el resumen vivo («3 canciones a “Mi lista”»). La marca de confirmar es un
redondel que está gris hasta que hay algo que confirmar, y se vuelve el blanco
del acento cuando lo hay; mientras guarda, la rueda ocupa su lugar sin mover
nada. Una hoja de tres opciones mide su contenido; una con buscador o teclado
va llena. Cerrar con algo a medio hacer pregunta antes de tirarlo.

## Letra

La pantalla de letra es la de Apple Music: **a la izquierda, en negrita
pareja**, la línea que suena arriba del medio de la ventana y las demás
retrocediendo — las que ya pasaron apagadas, las que vienen apagadas **y
desenfocadas**, más cuanto más lejos, como si estuvieran a otra distancia. La
que suena se enciende **palabra por palabra**: LRCLIB trae el tiempo de cada
línea y no de cada palabra, así que el reparto se estima por letras entre el
principio de la línea y el de la siguiente; sigue la canción lo suficiente
para acompañar. Con la letra puesta, la pantalla es la letra: el encabezado se
achica a una miniatura con el nombre, y los controles se dibujan encima, abajo,
y se van solos a los cuatro segundos hasta que se toca la letra. Todo esto es
`size="xl"` de `Lyrics`; los otros dos tamaños siguen centrados porque
acompañan a otra cosa.

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
