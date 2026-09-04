# El perfil

Un perfil es **una imagen de fondo, una identidad y un mosaico de vitrinas**.
La forma viene de Steam —bloques que quien lo arma elige y ordena, apoyados
sobre el arte que eligió— y la parte viva, de Airbuds: lo que está escuchando
ahora, y lo que le dejaron.

## Dónde está cada cosa

| Archivo | Qué hace |
| --- | --- |
| `app/profile/index.tsx` | Tu perfil, como lo ve cualquiera — y el **modo de edición** del mosaico |
| `app/profile/editar/index.tsx` | La identidad: foto, nombre, línea, fondo, marco |
| `app/profile/agregar.tsx` | La hoja del «+»: qué pieza sumar |
| `app/profile/vitrina.tsx` | El editor de una pieza: vista previa, tema, imagen de fondo |
| `app/profile/elegir.tsx` | El buscador que elige la canción, el artista o el álbum |
| `app/profile/tema.tsx` | La hoja del tema, de una pieza o del perfil entero |
| `app/perfil/[usuario].tsx` | El de otra persona |
| `app/perfil/encuadrar.tsx` | Encuadrar la foto o el fondo |
| `src/ui/PerfilPublico.tsx` | `FondoPerfil`, `Identidad`, `Vitrinas`, `Resumen` |
| `src/ui/Vitrina.tsx` | Una vitrina, de cualquier tipo, con su tema y sus controles |
| `src/lib/tema.ts` | Los temas: presets, paleta y qué color de texto va sobre cada fondo |
| `src/state/vitrinaBorrador.ts` | La pieza a medio armar, compartida entre las pantallas del editor |
| `src/ui/Encuadre.tsx` | La cuenta del encuadre, en un solo lugar |
| `src/ui/Reacciones.tsx` | La escucha con emojis, y la pared |

## Mirar y armar son dos modos de la misma pantalla

**El perfil se ve como lo ve cualquiera**: sin cruces ni lápices encima. Es lo
que te deja mirar lo que muestra tu perfil sin la interfaz de armarlo delante.

**Armar es un modo de esa misma pantalla**, el «modo de edición» del Space de
Airbuds. Se entra manteniendo apretada cualquier pieza —como los widgets del
iPhone— o desde «Editar perfil → Armar el mosaico», y se sale con «Hecho». Las
piezas tiemblan apenas, y cada una muestra sus controles en las esquinas: el
«−» que la saca (con un «¿seguro?»), el lápiz que la abre y la manija de abajo
a la derecha que se arrastra para cambiarle el tamaño. La tarjeta entera es lo
que se agarra para reordenar. Abajo flota la barra: el tema del perfil, el «+»
y «Hecho».

Se arma **sobre el perfil y no en una pantalla aparte** porque cómo queda una
pieza depende de lo que tiene alrededor: el fondo, el tema, las vecinas. La
identidad —foto, nombre, línea, fondo— sigue teniendo su pantalla en «Editar
perfil».

## Reciente y Space

En el teléfono el perfil tiene dos pestañas debajo de la identidad, las de
Airbuds: **«Space»** es el mosaico, y **«Reciente»** es lo vivo —lo que está
sonando en su casa (solo para contactos, en el ajeno), la pared de reacciones,
los minutos y el artista más escuchado, y las listas publicadas—. Abre en
Space si el mosaico tiene piezas y en Reciente si no: un perfil nuevo no puede
abrir en un cartel vacío. Mientras no se sabe la cuenta no se dibuja ninguna,
para que la pestaña no salte. Armando el mosaico manda Space y las pestañas
se esconden detrás del chip «Modo de edición»; el lápiz de «Editar perfil»
queda como redondel a la derecha de la píldora. En escritorio no hay
pestañas: las dos columnas ya son las dos pestañas lado a lado —el mosaico a
la izquierda, Reciente y el resumen a la derecha—. Vive en
`src/ui/PestanasPerfil.tsx`.

## El fondo

Con una imagen elegida, la **primera pantalla es del fondo**: el contenido
arranca a ~2/5 del alto (`alturaDeHeroe`) y scrollea por encima de la imagen
quieta. Sin fondo, arranque compacto — el aire sería un hueco muerto sobre un
degradado plano.

El velo son tres capas y el paño parejo es la más floja (0.34). Estaba en 0.62 y
se comía la imagen; bajarlo a secas dejaría sin contraste al texto que flota
fuera de una tarjeta, así que lo que se baja en el medio se compensa en los dos
bordes, que es donde ese texto vive.

## El encuadre: no es un recorte

La foto y el fondo se **encuadran**, no se recortan. La imagen sube entera y lo
que se guarda son tres números —`{x, y, escala}`— que dicen cómo mirarla; la
máscara la recorta al dibujar.

**Por qué:** recortar de verdad re-codifica, y eso aplasta los GIF. El editor de
iOS devuelve un JPG de un cuadro, así que una foto de perfil animada se subía
bien y llegaba quieta sin que nada avisara. Con encuadre, un GIF sigue animado y
cambiar el encuadre después no vuelve a tocar el archivo.

`escala` 1 y sin corrimiento es exactamente «cubrir y centrar», que es como se
dibujaba antes: **ningún perfil que ya existe se movió**.

Dos detalles que cuestan una tarde si no están escritos:

- **El corrimiento va en fracciones del lado, no en píxeles.** Así el encuadre
  elegido en un recuadro de 470 sirve igual para el redondel de 32 de una fila.
- **Se aplica dentro de `Avatar`**, no en cada pantalla. Ese componente dibuja
  la foto en toda la app; si se aplicara afuera, cada lugar tendría que
  acordarse y la misma foto se vería distinta según dónde aparezca.
- **Para borrar un encuadre se manda un texto, no `null`.** PostgREST traduce el
  null de JSON a `NULL` de SQL, con lo cual «borralo» y «no lo toques» llegarían
  idénticos.
- **Hay botones de acercar además del pellizco.** Con un mouse el pellizco no
  existe, y con escala 1 no hay nada que arrastrar —la imagen ocupa justo el
  recuadro—, así que sin los botones la pantalla no hacía nada en escritorio.

**La rotación es un número más del encuadre, no un archivo nuevo.** Airbuds
abre un recorte con rotación después de elegir la foto; acá se abre la misma
pantalla de encuadre —también para la imagen de una pieza y para su fondo, que
trabajan sobre el borrador y no sobre la base— con un cuarto de vuelta para
cada lado y un dial fino de ±45° que se imanta a cero. Lo que se guarda es
`rotacion` en grados, opcional: ausente vale 0, así ningún encuadre existente
cambió y no hubo migración. `estiloEncuadrado` la aplica con un `rotate` sobre
la caja ya agrandada y corrida, y sigue siendo la única cuenta. Girar obliga a
acercar para que no asomen las esquinas (`escalaQueCubre`:
`|cos θ| + |sin θ|·(largo/corto)`; nada para el redondel de la foto, que un
cuadrado girado sigue cubriendo), y como esa escala mínima depende de la
proporción del recuadro, quien dibuja uno apaisado le pasa el alto a
`estiloEncuadrado` en vez de pisar `height` por su cuenta. El tope del arrastre
se calcula en el marco de la imagen (se gira el corrimiento −θ, se acota en un
rectángulo derecho, se vuelve a girar) y es exacto para cualquier ángulo.
«Centrar» borra también la rotación.

## El mosaico

Las vitrinas son **una sola secuencia ordenada**; las filas se derivan al
dibujar. `entero` y `grande` ocupan su fila, dos `mitad` seguidas la comparten,
y una `mitad` suelta al final queda a media fila en vez de estirarse — así se ve
elegida y no sobrante.

Guardar las filas en la base sería guardar dos veces la misma información, y a
la primera que alguien cambia un tamaño quedan desincronizadas.

**Tres tamaños, el modelo de los widgets de iOS**: `mitad` (1×1), `entero`
(2×1) y `grande` (2×2 — la fila entera con el doble de presencia; una imagen se
vuelve casi cuadrada, un verso crece). Tres cerrados y no una grilla libre: con
tamaños arbitrarios cada perfil necesita su propio criterio de qué entra en una
fila, y lo que se gana en libertad se pierde en que ningún perfil se ve bien
sin trabajarlo. El chip de la tarjeta (1×1 → 2×1 → 2×2) los cicla.

**Se reordena arrastrando la manija**, en el editor. La física es la de la cola
(`EncoladaArrastrable`) adaptada a dos dimensiones: la celda agarrada sigue al
puntero apenas agrandada, las demás se apagan un poco —con alturas variables y
filas de a dos, la corrida en vivo miente más de lo que ayuda— y al soltar cae
en la celda cuyo centro quede más cerca. Las medidas se toman al **empezar**
cada arrastre (`measureInWindow`), así el scroll previo no las deja viejas; y
mientras se arrastra, el scroll del editor se congela.

**Las tarjetas muestran contenido, no marco.** El relleno es corto (12px), y
una **imagen fuera de edición va a sangre**: sin borde de relleno, la foto es
la pieza y no una foto dentro de una caja.

| Tipo | De dónde se fija |
| --- | --- |
| `cancion` | Del «+» del mosaico, o del menú de la canción |
| `fragmento` | Del menú de la canción (el recorte) |
| `lista` | Del menú de la lista |
| `artista`, `album` | Del «+», o del menú de su ficha |
| `letra` | Del «+» (se escribe el verso) o de la letra de la canción |
| `texto`, `imagen` | Del «+» |
| `encabezado`, `espaciador` | Del «+»: son piezas de composición, no de música |

## Las piezas se visten

Cada vitrina tiene un **estilo** aparte de su contenido (`estilo` en la base,
`ShowcaseEstilo` en el cliente): un tema y una imagen de fondo. Van en una
columna propia y no adentro del payload porque cambian por caminos distintos —
elegir otra canción no toca el tema, y al revés.

**El tema es un catálogo propio** (`src/lib/tema.ts`), no una librería: cuatro
familias —básicos, lisos, degradados, con textura— más «de la tapa» en dos
modos (el color de la carátula tal cual, o fundido hacia la noche como hace
Spotify) y «Personalizar». La hoja los muestra en una fila por familia, cada
muestra dibujada con la misma `Superficie` de la tarjeta, así lo que se ve es
lo que queda.

**La regla que sostiene el catálogo: ningún fondo vive en la banda del
medio.** Un color con luminancia relativa entre ~0,18 y ~0,45 se lee mal con
blanco y regular con negro. Los presets son los tonos 200/300 y 800/900 de
Tailwind v4 (texto negro ≥10:1, texto blanco ≥7:1) y la paleta de
«Personalizar» son los 300 y 800: la fila de arriba siempre con negro, la de
abajo siempre con blanco. La paleta anterior tenía seis casillas del tono 400
con blanco a 2,5:1. Los degradados llevan **las dos paradas del mismo lado**
—uno que cruza de claro a oscuro no tiene ningún texto posible— y el texto se
decide por la peor parada, no por el promedio. Las texturas (rayas, puntos,
halo) se dibujan con SVG en el color del texto con alfa baja, así sirven sobre
cualquier base; sin grano, que en la versión instalada de `react-native-svg`
solo existe en web.

**El perfil tiene su tema**, guardado en `profiles.tema`, y **las piezas lo
heredan** mientras no elijan el suyo: `tema: null` en una pieza no es «vidrio»,
es «sin opinión». Es lo que hace que el botón de la paleta en la barra vista al
mosaico entero de una vez.

**La imagen de fondo** va detrás con un velo oscuro y el texto en blanco, sea
cual sea el tema (con foto no se dibujan ni el degradado ni la textura): la foto puede ser cualquiera y el velo se lee sobre todas.
Sale de la galería o de la cámara (`pickImage({ desdeCamara })`).

**Sobre el color y `docs/DESIGN.md`:** la interfaz sigue acromática —hojas,
botones y barras del editor están en grises—. Lo que se pinta es el perfil de
cada quien, que es contenido suyo como su foto o su fondo: la misma regla por
la que la tapa de una lista tiñe su cabecera.

## El editor de una pieza

Trabaja sobre un **borrador** (`state/vitrinaBorrador`): la hoja del «+», el
editor, el buscador y la hoja del tema tocan la misma pieza a medio hacer, y
como son rutas distintas no se la pueden pasar por props. Nada llega a la base
hasta «Agregar al mosaico» / «Guardar»; editar una existente arranca copiándola
al borrador.

La vista previa es **la misma `Vitrina`** del perfil alimentada con el
borrador, así que lo que se ve es lo que queda. Las piezas de texto —encabezado,
texto, letras— se escriben encima de la vista previa: la tarjeta es el campo.
Elegir un tema desde la hoja cambia el borrador al toque y la vista previa se
pinta detrás; cancelar devuelve el que había.

El buscador (`elegir.tsx`) muestra **lo último que escuchaste** mientras el
campo está vacío (del historial `plays`, que solo su dueño lee), y los álbumes
salen de las canciones halladas, uno por id. Una canción se resuelve al
elegirla —la vitrina necesita el camino del audio para sonar sola—; para
firmar un verso alcanza con el título.

**La imagen volvió acotada.** Se había sacado en `0d02e94` porque «una imagen
subida es el fondo, no una tarjeta»: tenerla en los dos lados era la misma
imagen dos veces y la tarjeta ganaba por estar en el medio. Ahora el fondo tiene
su propia primera pantalla y esto es otra cosa — pero nace en **media fila** a
propósito, para no volver a competirle. Agrandarla se puede; hay que pedirlo.

En modo edición el contenido de una vitrina arranca más abajo: los controles
flotan arriba y a media fila se montaban sobre el texto.

## El marco de la foto

Cinco decoraciones dibujadas en SVG con animación (`src/ui/Marco.tsx`),
acromáticas, desbordando la foto con la regla del 1,2× de Discord y Steam. Cero
assets: la lección de decoprofile fue no depender de archivos ajenos. En la base
es solo un nombre (`profiles.marco`); uno desconocido se dibuja como ninguno.
Se elige en «Editar perfil → Marco de la foto», cada opción puesta sobre tu
propia foto.

## Lo que no hace

- **Un clip de fondo no se encuadra.** La pantalla de encuadre trabaja sobre una
  imagen quieta; con un video la fila no se ofrece.
- **No hay efectos de tarjeta completa** tipo Discord (el overlay animado sobre
  el perfil entero). Los marcos decoran la foto; la tarjeta entera queda para el
  fondo.

Para firmar un verso, el buscador se parte como en Airbuds: con algo escrito
aparecen los chips **Todo / Canciones / Artistas / Álbumes**. «Todo» muestra
hasta tres de cada sección bajo su rótulo, con «Ver más» cuando hay más; las
otras muestran su lista entera. Un verso puede firmarse con una canción
(`Artista — Título`), con un álbum (`Artista — Álbum`, con la tapa) o con un
artista solo, que deja `title` vacío y se dibuja como «Artista» a secas.

## Reaccionar a una pieza ajena

En el perfil de otro, **mantener apretada una vitrina** abre una fila de
emojis —los mismos seis de la escucha (`EMOJIS` en `src/ui/Reacciones.tsx`)—
anclada sobre la pieza, y tocar uno le deja una reacción. Es el gesto del
Space de Airbuds, y es a propósito el mismo apretón que en el perfil propio
entra a armar: «quiero hacer algo con esta pieza», y qué se puede hacer
depende de si es tuya. Cada persona deja **una** por pieza
(`reacciones_vitrina`, única por `(showcase_id, de)`): tocar el emoji que ya
dejaste lo saca, tocar otro lo reemplaza. Lo que se lee sobre cada pieza es la
cuenta por emoji —«🔥 3 💜 1»— como chips colgando del borde inferior
izquierdo, del lado claro u oscuro que le toque a su tema; la tuya va
invertida, que es la marca de «activo» de `docs/DESIGN.md`, sin color. El
dueño las ve en su perfil pero no puede reaccionar a lo suyo (la base lo
rechaza). Se piden de una vez para el mosaico entero (`reacciones_de_vitrinas`)
y se dibujan al toque, guardando después. La visibilidad es la de la vitrina.
Encabezados y espaciadores son composición, no piezas: no se les reacciona.

## El sub-space

Una pieza que adentro tiene otro mosaico: la pieza paga del Space de Airbuds,
acá una más. En el perfil es una tarjeta con el título, una grilla de 2×2 con
las tapas de sus primeras piezas y «N piezas»; tocarla abre
`/profile/subspace`, una pantalla apilada con el mismo `Vitrinas` del perfil
—piezas, temas, orden, reacciones y modo de edición idénticos—, con la barra
de armado sin el botón del tema (el tema es del perfil entero). **Es la misma
tabla con un padre**: `profile_showcases.parent_id` en null es el mosaico
principal, y las piezas de adentro son vitrinas comunes cuya `position` cuenta
dentro del padre. Un solo nivel, por un check de la base: un mosaico dentro de
una pieza dentro de una pieza es un laberinto, y la hoja del «+» no ofrece
«Sub-space» adentro de uno. El `parentId` viaja en el borrador y no por la
ruta, porque entre la hoja, el buscador y el editor hay tres pantallas.
Borrarlo borra lo de adentro (cascada) y el «¿seguro?» dice cuántas piezas se
lleva. El tema del dueño ajeno llega por `usuario` en la query —`profiles`
solo se lee por nombre—; sin él, las piezas heredan vidrio.
