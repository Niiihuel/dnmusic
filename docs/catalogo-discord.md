# Catálogo Discord para DMusic

La app incluye metadatos locales de las cuatro clases de cosméticos. El servicio no consulta Discord, GitHub, Supabase ni un backend y no requiere tokens. Las imágenes y los vídeos se cargan del CDN autorizado por el usuario. El catálogo es un snapshot, no una promesa de cobertura de todo lo publicado por Discord.

## Fuente y cobertura

Fuente: [aamiaa/discord-api-diff, collectibles.json](https://github.com/aamiaa/discord-api-diff/blob/main/collectibles.json), descargada desde [raw.githubusercontent.com](https://raw.githubusercontent.com/aamiaa/discord-api-diff/main/collectibles.json).

Snapshot del **27 de agosto de 2026**. SHA-256 del archivo fuente: `69bf425e5213732a83f350117b346e1ba47096fa15b8802efb98cf1fef37eac1`.

| Categoría | Tipo del servicio | SKUs únicos |
| --- | --- | ---: |
| Decoración de avatar | `marco` | 704 |
| Efecto de perfil | `efecto` | 369 |
| Placa del nombre | `placa` | 279 |
| Marco exterior del perfil | `marcoPerfil` | 55 |
| Paquete | `PaqueteDiscord` | 256 |
| Colección | `ColeccionDiscord` | 101 |

El JSON generado ocupa 1.133.219 bytes (205.482 bytes con gzip). No contiene precios, monedas, datos de compra ni credenciales. Conserva nombres originales, referencias CDN, capas, posiciones y tiempos. `actualizado` es la fecha declarada del snapshot upstream; `sha256` permite comprobar exactamente qué archivo se importó.

**Faltan recursos de 9 efectos en la fuente**: Ocean Flowers, DoodleBob Takeover, NiCe pRoFiLE, Handsome Squidward, Plankton Splat, KARINA, GISELLE, WINTER y NINGNING. Sus metadatos permanecen, con `disponible: false` y `motivoNoDisponible`. Esto afecta a 10 paquetes, también marcados `disponible: false`. No se inventan URLs ni se aplica solo una parte del paquete. Una actualización que complete esas referencias los habilitará al normalizar.

Los metadatos funcionan sin conexión una vez disponible el bundle local. En web, si Metro divide el import dinámico en un chunk, ese chunk debe haberse descargado/cacheado para abrirlo offline. Los recursos multimedia necesitan conexión o caché del renderizador; este trabajo no descarga todo el CDN.

## Usar el editor de perfil

Abrí **Editar perfil → Personalizar perfil**. Elegí Discord o DMusic y propias, un tipo de pieza y, si querés, una colección. La búsqueda acepta diferencias de mayúsculas y acentos. El catálogo muestra una tanda inicial de 30 piezas y agrega más al acercarte al final; no hace falta guardar para seguir explorando.

Tocar una pieza o un paquete cambia el borrador y la vista previa. En escritorio la vista previa se puede plegar para ampliar el catálogo; en una pantalla angosta, el botón del ojo abre la vista previa y «Volver al catálogo» permite seguir eligiendo. «Tarjeta» muestra la composición compacta y «Perfil» la composición con fondo global y marco en Estadísticas. «Ver original» compara con el perfil guardado, «Repetir efecto» reinicia la reproducción y pausa/reproducir controla los cosméticos de la vista previa. En la galería, el movimiento se activa al pasar el mouse o dar foco con el teclado a una pieza.

**Guardar cambios**, en Editar perfil, aplica todas las secciones juntas; **Restablecer** recupera el perfil guardado. Volver desde una hoja conserva sus elecciones en el borrador global. Al intentar salir con un borrador pendiente, «Cancelar» en la confirmación conserva la edición y «Descartar» sale sin aplicarla. Si falla el guardado, el borrador y el mensaje de error permanecen para reintentar. Subir una decoración transfiere el archivo, pero incorporarla al perfil sigue requiriendo guardar.

### Diferencias visibles respecto de Discord

- **Marcos exteriores estáticos:** DMusic compone las capas PNG del marco y conserva sus bordes y proporciones. Actualmente no reproduce la animación del marco exterior; pasar el mouse, reanudar o repetir el efecto no lo convierte en un marco animado. Esto es independiente de la decoración animada del avatar y de los efectos del perfil. El renderer utiliza las rutas públicas `/collectibles-shop/<SKU>/<capa>/static`.
- **Placas en iOS:** muestran su imagen estática y su paleta, incluso si está activado el movimiento. No se crea un reproductor de vídeo para la placa en iOS. En web y Android pueden reproducirse; si falla el vídeo se conserva la imagen estática.
- **Recursos faltantes:** las piezas marcadas «Sin recursos disponibles» permanecen visibles pero no se pueden seleccionar. Los paquetes incompletos tampoco se aplican parcialmente.
- **Movimiento y conexión:** las preferencias de movimiento reducido y el estado de la aplicación pueden mantener quietos los cosméticos Discord. Las imágenes todavía no cacheadas pueden faltar sin conexión, aunque el nombre y los metadatos estén disponibles.

## Convención de cambios pendientes: BarraCambiosPerfil

Montar `src/ui/BarraCambiosPerfil.tsx` únicamente en Editar perfil. El componente usa `Glass`; `perfilEdicion` y `mosaicoEdicion` conservan cambios entre secciones y hojas. La página central valida y persiste, mientras las hojas sólo eligen y vuelven. Las nuevas piezas reservan un UUID estable y usan upsert al reintentar; una respuesta perdida no duplica piezas. El patch del perfil y las operaciones del mosaico no forman una transacción única: cada respuesta confirmada actualiza su base, y un fallo conserva sólo lo pendiente.

1. Inicializar el borrador desde el perfil y calcular `visible` comparando campos normalizados (`null` frente a ausencia). Probar una pieza no llama a `saveMyProfile`.
2. Pasar `ocupado` durante el guardado o la subida. Los callbacks deben tener además un bloqueo síncrono (`useRef`) para impedir dos operaciones antes del siguiente render. `puedeGuardar` expresa las demás validaciones del formulario.
3. `onGuardar` valida la selección completa y envía **un patch con todos los campos modificados**. La cadena vacía quita una decoración; omitir un campo conserva su valor. Después de una respuesta exitosa, actualizar sesión y borrador desde el perfil devuelto.
4. `onRestablecer` recupera el perfil guardado y limpia `error`. Ante un fallo de persistencia, mantener el borrador y mostrar el error; no anunciar éxito ni cerrar la edición.
5. Combinar la barra con `useSalidaConCambios(hayCambios, ocupado)`. La confirmación debe reenviar la acción original de navegación, incluidos sus metadatos, para continuar la salida solicitada. En web, `beforeunload` protege recarga/cierre y sus listeners se eliminan al quedar limpio o desmontar.
6. Reservar al pie del contenido la altura entregada por `onAltura`, más la separación necesaria. `abajo` expresa la distancia al borde del contenedor e incluye reproductor/safe area cuando corresponda. Para formularios embebidos, `flotante={false}` la coloca en el flujo normal.

`BarraCambiosPerfil` no guarda, no confirma descartes ni decide la navegación por sí sola. No agregar otro botón de guardado que eluda estas condiciones.

## Verificar la integración

Desde la raíz, sin instalar dependencias ni modificar pruebas de otros agentes:

```sh
npm run typecheck
node --test tests/discord-catalogo.test.mjs tests/discord-render.test.mjs
./node_modules/.bin/eslint src/ui/TarjetaPerfil.tsx src/ui/PerfilPublico.tsx tests/discord-catalogo.test.mjs
```

Los tests del catálogo cubren referencias, variantes, paquetes, caché/reintento y rechazo de entradas corruptas. También ejecutan las funciones reales de cabecera para comprobar fuente y propagación de `animado` hasta marco y placa, y el guard de salida para comprobar cancelación, acción original, estado ocupado y limpieza de listeners. Los tests de render existentes cubren reloj, capas, hover, accesibilidad, vídeo e iOS. Los dobles de hooks/componentes usados en estas pruebas no sustituyen una comprobación en navegador y dispositivo.

Comprobaciones manuales recomendadas:

- En escritorio y móvil, recorrer más de 30 piezas y después cambiar tipo, colección y búsqueda. Debe volver al principio y permitir continuar hasta el final, sin duplicados ni quedarse cargando. Comprobar colecciones compartidas como Anime, Fantasy y Dungeons & Dragons; el selector debe considerar también `coleccionIds`.
- Probar mouse y foco por teclado, salir durante la precarga y volver a entrar. La secuencia no debe arrancar después de abandonar una pieza. Verificar ambas vistas del probador, pausa/reanudación y una fuente personalizada, con y sin marco exterior o efecto Discord.
- En iOS, comprobar que la placa permanece estática y que la música continúa. En web/Android, probar una placa con vídeo y una carga fallida.
- Con un marco de gran desborde, como Rose Filigree, comprobar que no tape pestañas, botones ni texto en varios anchos. El espacio necesario depende de las medidas del marco.
- Seleccionar un paquete, quitar una pieza, restablecer y guardar. Reabrir el perfil y consultarlo desde otra sesión para verificar lo persistido; revisar que foto, biografía y los cosméticos no editados no cambien.
- Elegir cosméticos, volver, cambiar tipografía e identidad y comprobar que una sola barra confirma todo. En el editor principal, con cambios pendientes, probar atrás, Escape, gesto nativo y recarga. Cancelar debe conservar el borrador; descartar debe ejecutar una única salida. Durante guardado, impedir una segunda operación. Ante error, conservar la selección para reintentar.

Para verificar la base, usar una **DB local de pruebas con las migraciones aplicadas** y ejecutar el archivo existente `supabase/tests/catalogo_discord.sql` con `psql -v ON_ERROR_STOP=1`. El archivo abre una transacción y termina con `rollback`; esta revisión no ejecutó acciones contra una cuenta o base remota.

La revisión independiente reprodujo el avance 30→60 y el reinicio al buscar, y detectó que el selector de colecciones omitía membresías secundarias. Ese caso requiere un test del selector completo con una pieza cuyo único vínculo a una colección esté en `coleccionIds`; un test del normalizador por sí solo no lo cubre.

## Actualizar

Node y dependencias existentes; no se instala nada. Ejecutar desde la raíz del proyecto:

```sh
# Validar la fuente pública sin modificar el snapshot.
node scripts/decoraciones/importar-discord.mjs --fecha 2026-08-27 --comprobar

# Descargar, validar y reemplazar el JSON local.
node scripts/decoraciones/importar-discord.mjs --fecha 2026-08-27

# Importación reproducible/offline a partir de un archivo descargado.
node scripts/decoraciones/importar-discord.mjs --fecha 2026-08-27 --archivo /tmp/collectibles.json

node --test tests/discord-catalogo.test.mjs
```

Usar la fecha correspondiente al nuevo snapshot cuando cambie upstream. Se exige explícitamente para no confundir una descarga reciente con datos recientes. El importador imprime cantidades, hash, tamaño y destino. La validación termina antes de escribir; el reemplazo usa un temporal y `rename` en el mismo directorio.

Un descenso de cantidades respecto del snapshot existente (o del mínimo conocido en la primera importación) y una fecha que retrocede provocan un error. `--permitir-reduccion` permite un recorte/retroceso intencional después de revisar la fuente; no desactiva las validaciones estructurales. Al actualizar la cobertura, revisar las expectativas históricas del test del snapshot (cantidades y efectos sin recursos). `--ayuda` muestra las opciones.

## Contrato para UI y persistencia

Todos los IDs de pieza, paquete y colección son `discord:<SKU>`. El SKU es un snowflake decimal conservado como texto; nunca convertirlo a `number`. Los IDs de las capas son los snowflakes originales sin prefijo.

```ts
import {
  esDiscord, cargarCatalogoDiscord, useCatalogoDiscord,
  usePiezaDiscord, piezaDiscordDe, seleccionPaqueteDiscord,
} from '../services/discordCatalogo'

const { catalogo, cargando, error, reintentar } = useCatalogoDiscord(editorAbierto)
const pieza = usePiezaDiscord(idGuardado)
// Lookup sin cargar ni hacer peticiones; null si no existe o todavía no se cargó.
const enCache = piezaDiscordDe(idGuardado)
```

`cargarCatalogoDiscord()` usa import dinámico del JSON, valida el snapshot una vez y comparte la misma promesa entre llamadas concurrentes. Un error se muestra en `error`; no queda una promesa rechazada en caché. `reintentar()` vuelve a cargar y limpia el error al tener éxito. Los hooks inician la carga en un efecto, fuera del render. `usePiezaDiscord` carga solo para IDs Discord válidos; un ID propio, nulo o malformado no inicia una importación. Una pieza no disponible sigue siendo consultable para mostrar su nombre y el motivo; el renderizador debe comprobar `disponible !== false`.

Extensiones opcionales al contrato inicial:

- Pieza: `coleccionIds` conserva otras colecciones/promociones del mismo SKU; `etiqueta` sirve como descripción accesible; `videoSrc` contiene el vídeo de una placa; `animationType` conserva el dato upstream; `disponible` y `motivoNoDisponible` describen recursos faltantes.
- Paquete: `alternativas` conserva varias piezas del mismo tipo; `fondoPreview` conserva el fondo de la miniatura; `disponible` indica que no hay una combinación completa aplicable.
- Catálogo: `sha256` identifica el archivo fuente.

Cada ítem de un producto genera una pieza por su propio SKU. Los duplicados equivalentes se unen, las referencias parciales se completan con apariciones posteriores y los conflictos entre recursos del mismo SKU se rechazan. No se usa únicamente `items[0]`. Los grupos de variantes (`type: 2000`) conservan todos sus ítems como piezas seleccionables. Los créditos Nitro (`type: 3000`) se omiten porque no son cosméticos.

### Aplicación atómica de paquetes

`piezas` contiene una elección por tipo. Dos paquetes del snapshot tienen dos marcos de perfil diferentes: Spider-Man's Web Bundle y Symbiote Bundle. `alternativas.marcoPerfil` conserva ambos y la primera opción es la predeterminada.

```ts
await cargarCatalogoDiscord()
const seleccion = seleccionPaqueteDiscord(paqueteId, { marcoPerfil: marcoElegido })
if (seleccion) {
  // Convertir los tipos a los campos propios del editor y hacer UN setState/update.
  // No aplicar miembro por miembro antes de validar todo.
}
```

Omitir el segundo argumento para usar las elecciones predeterminadas. El resolutor devuelve una copia de la selección o `null` si el catálogo no está cargado, el paquete no existe, falta un recurso o la elección no pertenece al paquete. Revisa **todos** los miembros antes de devolver el resultado y no modifica el catálogo ni escribe el perfil. Los tipos ausentes del paquete no se incluyen en la selección; el integrador decide conservarlos o limpiarlos dentro de la misma actualización.

### Recursos y renderizado

- `marco`: `asset` es el hash original. `preview` es la imagen animada y `staticPreview` la versión estática. Se priorizan URLs explícitas de `assets`; cuando faltan, se utiliza la ruta de avatar decorations del CDN.
- `placa`: `asset` conserva la ruta `nameplates/.../`; `staticPreview` apunta a `static.png` y `videoSrc` a `asset.webm` cuando no hay URLs explícitas. `preview` utiliza la imagen animada explícita o la estática. Las rutas se codifican por segmento para conservar caracteres Unicode. `palette` es el nombre de la paleta, no un color CSS.
- `efecto`: `efectos` conserva cada capa, su orden `zIndex`, medidas, posición y tiempos **en milisegundos**. `randomizedSources` se normaliza a URLs de texto. `staticPreview` solo se asigna cuando existe `staticFrameSrc`: `reducedMotionSrc` puede seguir siendo animado y no se anuncia como imagen estática. Las dimensiones de los efectos pertenecen al lienzo original; el renderizador debe escalarlas de forma coherente.
- `marcoPerfil`: `capas` conserva IDs, `staple`/`rail`/`border`, `front`/`back`, anclaje y `responsive`, además de `innerWidth` y los desbordes. La fuente no proporciona URLs de capa ni miniaturas para estos marcos; el contrato entrega los IDs y medidas para el renderizador. No se inventa una miniatura de perfil usando el banner de la colección.

Solo se aceptan URLs HTTPS en `cdn.discordapp.com` y `media.discordapp.net`, sin credenciales, puertos alternativos ni fragmentos. Las rutas de assets no admiten traversal. El importador y el servicio comprueban SKUs, tipos, números finitos, fuentes aleatorias y referencias de paquetes. Un formato nuevo incompatible falla con error visible para permitir su adaptación.

## Archivos y límites del subtask

- `src/services/discordCatalogo.ts`: tipos, validación cliente, carga, hooks, índice y selección atómica.
- `src/data/discord-catalogo.json`: snapshot compacto.
- `scripts/decoraciones/importar-discord.mjs`: descarga/importación actualizable y reemplazo seguro.
- `scripts/decoraciones/discord-normalizar.mjs`: normalización pura y validación upstream.
- `tests/discord-catalogo.test.mjs`: normalización, variantes, duplicados, corrupción, paquetes y servicio.
- `docs/catalogo-discord.md`: este contrato e instrucciones.

El subtask inicial del catálogo no modificó UI ni persistencia. En la revisión posterior se corrigió, por pedido del integrador, la propagación de pausa y fuente en `CabeceraPerfil` y únicamente la región `Identidad`/`FotoDeHeroe` de `PerfilPublico.tsx`. Se agregaron regresiones al archivo de pruebas propio; las pruebas de render y SQL de otros agentes solo se consultaron.
