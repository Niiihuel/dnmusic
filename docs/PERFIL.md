# El perfil

Un perfil es **una imagen de fondo, una identidad y un mosaico de vitrinas**.
La forma viene de Steam —bloques que quien lo arma elige y ordena, apoyados
sobre el arte que eligió— y la parte viva, de Airbuds: lo que está escuchando
ahora, y lo que le dejaron.

## Dónde está cada cosa

| Archivo | Qué hace |
| --- | --- |
| `app/profile/index.tsx` | Tu perfil, como lo ve cualquiera — y el **modo de edición** del mosaico |
| `app/profile/editar/index.tsx` | La identidad: foto, nombre, línea, fondo, marco — lista agrupada en el teléfono, barra lateral con secciones en la compu |
| `src/ui/EditorDeCampo.tsx` | El campo de texto del perfil con su validación: pantalla apilada en el teléfono, fila de Ajustes del Sistema en la compu (`FilaCampo`) |
| `app/perfil/encuadrar.tsx` | Encuadrar la foto, el fondo o la imagen de una pieza; con `que=fondo-nuevo` encuadra el fondo recién elegido y lo sube al confirmar, con barra de progreso |
| `src/state/fondoPendiente.ts` | El fondo elegido que espera encuadre antes de subir |
| `src/ui/Progreso.tsx` | La barra de progreso determinada, para lo que se sube |
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
piezas tiemblan apenas, y cada una muestra sus controles: el «−» arriba a la
izquierda que la saca (con un «¿seguro?»), el lápiz arriba a la derecha que la
abre —dos discos del fondo de la app, medio afuera de la esquina, como los
widgets del iPhone— y **el asa** abajo a la derecha, que se arrastra para
cambiarle el tamaño: una banda punteada sigue al dedo con el tamaño crudo y la
pieza salta al tamaño que ese rectángulo implica (media fila, la fila entera,
el doble de alto); tocarla sin arrastrar pasa al tamaño siguiente. La tarjeta
entera es lo que se agarra para reordenar. Abajo flota la barra: el tema del
perfil, el «+» y «Hecho».

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

**Se reordena arrastrando la pieza entera**, armando, con la mecánica de
react-grid-layout: la pieza agarrada sigue al puntero apenas agrandada y por
encima, y su **hueco** —un rectángulo punteado de su tamaño— se mueve en vivo
a la celda sobre la que está, corriendo a las demás con su animación de
layout. Al soltar no pasa nada nuevo: la pieza ya está donde el hueco decía, y
recién ahí se guarda el orden. El destino se decide en el hilo de la interfaz
con las medidas que cada celda informa por `onLayout` (en coordenadas del
mosaico, el mismo sistema en que se mueve el dedo): la celda cuyo centro quede
más cerca del centro de la pieza. Cada reacomodo marca las medidas como viejas
hasta que las celdas vuelven a medirse, para no decidir dos veces con los
mismos números. La pieza agarrada no anima su layout —cuando su hueco salta,
ella salta con él y la compensación `origen − rect actual` la deja quieta bajo
el dedo—; las demás sí. Mientras se arrastra, el scroll del editor se congela.
Todo vive en `CeldaDeMosaico` (`src/ui/PerfilPublico.tsx`).

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

**La fuente** es la otra mitad de vestir una pieza de texto —encabezado,
texto, letras y el título de un sub-space—: `estilo.fuente`, con seis
tipografías de Google Fonts empaquetadas en la app (`src/lib/fuentes.ts`):
Revista (serif), Redonda, Máquina (mono), Manuscrita, Cartel (condensada) y
Retro. Una sola variante por familia, importada por archivo y no por el
índice del paquete, para que el bundle no arrastre todos los pesos; y con
`fontWeight: 'normal'` a la fuerza, porque el archivo ya es del peso que se
ve y pedir negrita encima haría caer a iOS a la del sistema. Se cargan una
vez en la raíz sin bloquear el arranque. La hoja de elegir escribe **lo que
uno puso** en cada fuente, no un texto de muestra.

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

La hoja arranca como todas las de la app (`EncabezadoHoja`): cerrar a la
izquierda, el título, y **guardar a la derecha** como marca; «Cómo se muestra»
es un control segmentado —el del sistema en iOS— y no chips. La vista previa
es **la misma `Vitrina`** del perfil alimentada con el borrador, así que lo
que se ve es lo que queda. Las piezas de texto —encabezado,
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

Treinta y cuatro decoraciones dibujadas en SVG y animadas con Reanimated,
en siete familias: **Clásicos** (aro, pulso, órbita, trazos, destello, los ids
de siempre con el dibujo mejorado, más cromo), **Música** (vinilo,
ecualizador, ondas, notas), **Naturaleza** (llamas, pétalos, nubes, nieve,
luciérnagas, zarza, jardín), **Cielo** (estrellas, aureola, luna, planetas,
aurora, eclipse, astral), **Realeza** (corona, alas, laurel, reliquia),
**Fiesta** (confeti, corazones, burbujas, orejas de gato) y **Energía** (neón,
rayo). Lo compartido —geometría, tonos, primitivas y las tres formas de
moverse— vive en `src/ui/marcoBase.tsx`; los clásicos en `Marco.tsx` y los
diez **al estilo Discord** en `MarcosAnimados.tsx`: cosas que *pasan*
alrededor de la foto en bucles de dos a cuatro segundos (chispas que suben,
corazones que flotan, un neón que parpadea, orejas que dan un tirón), que es
lo que se miró de las decoraciones de Discord antes de dibujar.
Cero assets: la lección de decoprofile fue no depender de archivos ajenos. La
interfaz sigue acromática, pero el marco es contenido de la persona como su
foto o el tema de sus vitrinas, y por eso puede tener color con criterio: dos
o tres tonos por marco, de la misma escala 200/300 y 800 de Tailwind v4 que
`lib/tema`, y la mitad del catálogo en blanco, plata, humo y un dorado
apagado. El lienzo desborda a la foto 1,35× (los anillos viven en el 1,2× de
Discord y Steam; las alas, llamas y coronas usan el resto) y no la pisa; quien
apila el marco deja `overflow: visible` y puede reservar el aire con
`aireDelMarco`. Todo se mueve con `withRepeat`/`withTiming` en el hilo de UI,
nunca por cuadro, con a lo sumo una docena de nodos animados por marco. En la
base es solo un nombre (`profiles.marco`); uno desconocido se dibuja como
ninguno. Se elige en «Editar perfil → Marco de la foto», en la hoja de siempre
(cruz, título, tilde para aplicar): la vista previa animada arriba, píldoras
por familia, buscador, y la grilla con «Ninguno» como primera celda; la
elegida se marca por luminancia y un tilde, nunca por borde. Como en la
tienda de Discord, la grilla se ve quieta y se anima solo la elegida y, con
cursor, la que tiene el cursor encima.

Dos trampas de SVG en web que costaron una tarde: `strokeDashoffset` corre la
fase módulo el período del patrón —un hueco arbitrario hace aparecer un
segundo arco—, y el prop `origin` de react-native-svg se vuelve un
`transform-origin` que React rechaza; las formas rotadas van en `<G x y
rotation>`.

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

## El fondo: se encuadra antes de subir

Elegir un fondo ya no lo sube al toque. Una imagen o un GIF se deja esperando
(`state/fondoPendiente`) y se abre la pantalla de encuadre sobre el archivo
local; el tilde sube el archivo con `uploadIlustracionConProgreso` —una URL
firmada de subida y un `XMLHttpRequest`, porque storage-js no cuenta bytes— y
recién con la ruta en mano guarda el perfil con el encuadre. Mientras sube se
ve la barra debajo del recuadro. Un clip no se encuadra (el reproductor lo
dibuja a sangre): sube directo desde el editor, con la misma barra en el
bloque. El bloque del fondo muestra la **vista previa** con el mismo
`FondoPerfil` del perfil, velo incluido, y debajo las filas: cambiar,
encuadrar (solo una imagen) y quitar, que va última y sin flecha.

La pantalla de encuadre es una hoja de las de siempre: la cruz cancela (y
suelta el fondo pendiente), el tilde guarda, y abajo queda solo «Centrar».

## Decoraciones en imagen: marcos y efectos del catálogo

Además de los marcos dibujados, el perfil acepta **decoraciones en imagen
animada** (WebP, APNG, GIF): marcos que se apoyan sobre la foto y **efectos**
que se dibujan encima del fondo, arriba, como los «profile effects» de
Discord. Viven en la tabla `decoraciones` y en el bucket del mismo nombre
(migración `decoraciones`), y la app solo las lee: escribe el script
`scripts/decoraciones/importar.mjs`, con la service_role key, a partir de
`catalogo.json` y los archivos de `archivos/`. Cada fila trae su autor, su
licencia y su fuente, y la vidriera los muestra debajo de la vista previa —lo
que CC BY pide. Nunca un enlace a un CDN ajeno: la lección de decoprofile.

Un marco de imagen dice cómo se apoya: `escala` (el lado de la imagen en veces
el lado de la foto; 1,2 es un marco entero al estilo Discord, 0,5 una
insignia) y `posicion` (centro, arriba, arriba-derecha, arriba-izquierda,
abajo). `ui/Marco` lo dibuja cuando el id no es un marco dibujado
(`ui/DecoracionImagen`, con `expo-image`, porque un WebP animado en iOS solo se
mueve con este). El efecto se guarda en `profiles.efecto` y lo dibuja
`FondoPerfil` sobre el velo; se elige en «Editar perfil → Efecto del
perfil», que es la misma hoja del marco con `?tipo=efecto` y la vista previa
sobre tu fondo.

**Lo que hay y lo que no.** No existe un paquete abierto de decoraciones al
estilo Discord: los repositorios que las «ofrecen» son copias de los
activos de Discord y de sus artistas, y las de Decor son de cada creador. Lo
abierto y con licencia clara es Google Noto Animated Emoji (CC BY 4.0), con
lo que arranca el catálogo en imagen: quince insignias chicas apoyadas en la
foto, bajadas con `bajar-noto.mjs`. Como efectos de banda entera los emoji
quedaban genéricos, así que los efectos se dibujan en la app. Para sumar
propias o de otra fuente libre (LottieFiles exporta a GIF bajo su Lottie
Simple License; Kenney publica sprites CC0), alcanza con dejar el archivo en
`archivos/`, agregar la entrada al catálogo y correr el importador.

## Colecciones temáticas

La vidriera se recorre **por colecciones**, como la tienda de Discord: cada
una (`src/ui/colecciones.ts`) tiene nombre, lema y sus piezas —marcos y
efectos— que comparten paleta y manera de moverse. Arcade (menta y lila,
todo a saltos: Píxeles, Invasor, Corazones de 8 bits, y la Lluvia de
píxeles), Gótico (plata sobre humo: Murciélagos, Telaraña, Velas, y la
Bandada), Después de medianoche, Neón y tormenta, Cosmos, Fiesta, Bosque de
noche, Sala de máquinas, La corte y Clásicos. Las piezas nuevas de Arcade y
Gótico están en `src/ui/MarcosTematicos.tsx`.

Los **efectos del perfil** (`src/ui/EfectosDibujados.tsx`) son partículas que
cruzan la banda de arriba del fondo —nevada, lluvia de confeti, luciérnagas,
estrellas fugaces, lluvia, lluvia de píxeles, bandada— con a lo sumo veinte
nodos animados, repartidas por la razón áurea para que no formen columnas.
El id va en `profiles.efecto` y lo dibuja `FondoPerfil` sobre el velo.

**La tienda** (`app/profile/marco.tsx`) tiene la anatomía de la tienda de
Discord. La portada: un **hero** de la colección destacada —el efecto de la
colección corriendo sobre el tinte de su paleta, el logo en la tipografía de
la colección (`fuente` en `colecciones.ts`, de las del perfil), el lema y la
flecha para pasar a la siguiente— con el estante de sus piezas montado sobre
el borde de abajo; debajo, un **banner por colección** (logo, lema y una
composición de muestra: la foto con el marco, la banda con el efecto, la
placa con tu nombre) que abre la colección; y al pie «Encontrá tu estilo» con
«Explorar todo». Una colección es su hero y sus estantes por clase. Una
**pieza** es tu tarjeta de perfil con la pieza puesta, de qué colección es,
y «Aplicar», que guarda al toque (y «Quitar» si es la que tenés) — como en
Discord, se prueba y se aplica desde la pieza, no desde un tilde general.
«Explorar todo» es Marcos / Efectos / Placas, el buscador, «Lo tuyo» (la que
tenés puesta y «Subir la tuya») y la grilla. Las tarjetas de pieza son las de
Discord: la placa oscura con la muestra arriba, el nombre y una línea chica;
la que tenés puesta lleva el tilde. Las filas del editor abren la tienda en
«Explorar todo» con la pestaña que corresponde (`?tipo=`).

**Subir la tuya.** Además del catálogo, cada persona puede subir su propio
archivo (PNG, WebP, GIF o APNG) como marco o como efecto: va a su carpeta
del bucket `showcases` con `uploadIlustracionConProgreso` —la barra se ve en
la celda— y el perfil guarda `imagen:<ruta>` en `marco` o `efecto`
(`PREFIJO_PROPIA` en `services/decoraciones`; la migración
`decoraciones_propias` subió el tope de esas columnas a 200 caracteres). Se
dibuja con lo mismo que el catálogo: un marco entero al estilo Discord,
centrado y 1,2× la foto, o un efecto que cubre la banda. Lo que cada uno sube
es suyo, igual que su foto: la app no reparte activos de nadie.

## Placas de nombre

La tercera pieza de la tienda, como las «nameplates» de Discord: una franja
redondeada **detrás del nombre** (`src/ui/Placas.tsx`), con el tinte diluido
de su colección, un patrón quieto que dice de cuál es —píxeles, estrellas,
puntos, rayas, barras, luces, niebla— y un brillo que la recorre de a ratos,
el único nodo animado. Nueve placas, una por colección (`placas` en
`colecciones.ts`). El id va en `profiles.placa` (migración
`placa_de_nombre`) y la dibuja `Identidad` envolviendo nombre y usuario, en
las dos formas del perfil; la tarjeta de la tienda la muestra igual. Se
elige en la pestaña «Placas» de Decoraciones, también desde «Editar perfil →
Placa de nombre».

