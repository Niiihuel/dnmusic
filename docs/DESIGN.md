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

## Vidrio (iOS 26)

En iOS 26 el reproductor y las pestañas son **Liquid Glass**; en todo lo demás
—web, Android, iPhone anterior— caen al gris de siempre. Lo decide
`HAY_VIDRIO`, una vez, en `src/ui/Glass.tsx`.

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
