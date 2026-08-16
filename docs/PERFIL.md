# El perfil

Un perfil es **una imagen de fondo, una identidad y un mosaico de vitrinas**.
La forma viene de Steam —bloques que quien lo arma elige y ordena, apoyados
sobre el arte que eligió— y la parte viva, de Airbuds: lo que está escuchando
ahora, y lo que le dejaron.

## Dónde está cada cosa

| Archivo | Qué hace |
| --- | --- |
| `app/profile/index.tsx` | Tu perfil, **como lo ve cualquiera** |
| `app/profile/editar/index.tsx` | Donde se arma: identidad, fondo, vitrinas |
| `app/perfil/[usuario].tsx` | El de otra persona |
| `app/perfil/encuadrar.tsx` | Encuadrar la foto o el fondo |
| `src/ui/PerfilPublico.tsx` | `FondoPerfil`, `Identidad`, `Vitrinas`, `Resumen` |
| `src/ui/Vitrina.tsx` | Una vitrina, de cualquier tipo |
| `src/ui/Encuadre.tsx` | La cuenta del encuadre, en un solo lugar |
| `src/ui/Reacciones.tsx` | La escucha con emojis, y la pared |

## Las dos pantallas tienen un trabajo cada una

**El perfil se ve como lo ve cualquiera**: sin cruces ni flechas encima. Por eso
`app/profile/index.tsx` pasa `propio={false}` aunque el perfil sea tuyo — no es
un descuido, es lo que te deja mirar lo que muestra tu perfil sin la interfaz
de armarlo delante.

**Editar perfil es donde se arma.** Ahí aparecen los controles de cada vitrina:
subir, bajar, cambiar el ancho, sacar.

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

## El mosaico

Las vitrinas son **una sola secuencia ordenada**; las filas se derivan al
dibujar. Una `entero` ocupa su fila, dos `mitad` seguidas la comparten, y una
`mitad` suelta al final queda a media fila en vez de estirarse — así se ve
elegida y no sobrante.

Guardar las filas en la base sería guardar dos veces la misma información, y a
la primera que alguien cambia un ancho quedan desincronizadas.

Dos anchos y no una grilla libre: con anchos arbitrarios cada perfil necesita su
propio criterio de qué entra en una fila, y lo que se gana en libertad se pierde
en que ningún perfil se ve bien sin trabajarlo.

| Tipo | De dónde se fija |
| --- | --- |
| `cancion`, `fragmento` | Del menú de la canción |
| `lista` | Del menú de la lista |
| `texto` | De «Editar perfil → Agregar» |
| `imagen` | De «Editar perfil → Sumar imagen» |

**La imagen volvió acotada.** Se había sacado en `0d02e94` porque «una imagen
subida es el fondo, no una tarjeta»: tenerla en los dos lados era la misma
imagen dos veces y la tarjeta ganaba por estar en el medio. Ahora el fondo tiene
su propia primera pantalla y esto es otra cosa — pero nace en **media fila** a
propósito, para no volver a competirle. Agrandarla se puede; hay que pedirlo.

En modo edición el contenido de una vitrina arranca más abajo (`pt-12`): los
controles flotan arriba a la derecha y a media fila se montaban sobre el texto.

## Lo que no hace

- **No se arrastra para reordenar.** Se sube y se baja con flechas. El arrastre
  entre plataformas es bastante más maquinaria y las flechas ya ordenan.
- **No hay marcos ni efectos** tipo Discord. Si alguna vez van, el enchufe es
  `FotoDeHeroe` y la regla es la de las referencias: un marco **desborda** a la
  foto (1,2× su lado), no la pisa.
- **Un clip de fondo no se encuadra.** La pantalla de encuadre trabaja sobre una
  imagen quieta; con un video la fila no se ofrece.
