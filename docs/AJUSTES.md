# Configuración y actualizaciones

`app/ajustes/index.tsx` es Configuración con la anatomía del sistema en las dos
plataformas, armada desde **una sola lista de categorías** (`categorias`):

- **Teléfono — Configuración de iOS.** El título grande, el bloque de la cuenta
  arriba (la cara, el nombre, y «Novedades» como segunda fila con el globito de
  lo que falta leer), y debajo los bloques de filas sin títulos de sección: placa
  de ícono, rótulo de 17, valor en gris a la derecha, chevron o interruptor. Lo
  que un bloque necesita explicar va en su **pie** (`GrupoAjustes.pie`), no como
  subtítulo de la fila. El buscador **flota abajo**, como en iOS 26, y con el
  teclado abierto se apoya sobre él. Elegir entre varios (el temporizador) es
  una fila con menú (`FilaOpciones`), el del sistema en el iPhone.
- **Compu — Ajustes del Sistema de macOS.** Una *navigation split view*: la barra
  lateral (280 px, tono `canvas`) con el buscador, la cuenta y la lista de
  categorías con su placa; a la derecha el detalle de la elegida, con sus
  bloques a 640 px como mucho. Buscando, el detalle muestra todas las
  categorías que coinciden, con su rótulo.

Las piezas (`src/ui/Ajustes.tsx`) tienen las medidas del sistema —fila de 52,
placa de 30 con radio 8, bloque con radio 22— porque es el único lugar donde la
app se parece a los Ajustes del teléfono a propósito. **Todo lo que pase por
Configuración se arma con ellas**, incluidas las secciones que antes eran
formularios: `FilaTexto` es un campo (rótulo a la izquierda, lo escrito a la
derecha), `FilaDato` un valor que no lleva a ningún lado, `FilaAccion` algo que
se hace acá mismo, y `GrupoAjustes.error` es donde va lo que salió mal — al pie
del bloque, en lugar de su pie, no en un cartel suelto entre los campos.

Lo que **no** va acá adentro es el vocabulario del formulario de acceso: el
campo alto de `Field`, con la etiqueta encima y en versalitas, y los botones
anchos de `Button`. Ahí son correctos —una sola acción por pantalla, que ocupa
el ancho porque no compite con nada—; adentro de una lista agrupada cada campo
mide el doble que una fila, la etiqueta gritada no se parece a nada del sistema
y el referente no usa versalitas en ningún control. «Actualizaciones» y «Acceso
con Google» eran así y se pasaron a filas. La búsqueda ignora acentos
y esconde las categorías que no coinciden; sin coincidencias, un vacío con la
salida de volver a ver todo.

Las preferencias viven en `src/state/ajustes.ts`, en AsyncStorage bajo
`ajustes:v1`. Son del dispositivo y se conservan al cerrar sesión. El modo de
reproducción vive con la cola, se conserva entre sesiones y ofrece orden,
aleatorio dentro de la colección y descubrimiento, que intercala una sugerencia
cada tres temas y continúa como radio al final. Las recomendaciones combinan
los artistas de la colección con el historial, los corazones, las listas y las
afinidades de género del catálogo. Las instalaciones anteriores mantienen
Wi-Fi y reciben los valores por defecto para las opciones nuevas:

- **Ayudas al pasar el cursor:** controla los tooltips del mouse. El foco de
  teclado sigue mostrando el nombre de los controles.
- **Novedades al abrir:** muestra una sola vez el resumen de la versión; no
  oculta el historial en Ajustes. El modal espera a que se lean las preferencias.
- **Avisar cuando esté lista:** controla el aviso flotante del escritorio. No
  desactiva la búsqueda, la descarga ni la instalación al cerrar.

El temporizador es una acción de la sesión, no una preferencia persistente.
Muestra los minutos restantes, permite reprogramar y ofrece Cancelar mientras
está activo. Descargas y Wi-Fi aparecen únicamente donde hay almacenamiento
sin conexión.

`src/ui/Actualizador.tsx` muestra los estados del proceso principal de Electron.
Las búsquedas repetidas no reemplazan una descarga en curso, en espera o lista.
La descarga automática espera al silencio; **Descargar ahora** la inicia de
forma explícita aunque haya audio. Ese control solo aparece si el preload
expone `actualizacion.descargar`, para tolerar puentes de versiones anteriores.
Reiniciar e instalar sigue siendo una acción explícita; cerrar la app también
instala lo que ya está descargado.

`NovedadesAlAbrir` muestra hasta tres cambios de la última versión y lleva al
historial completo. Las versiones anteriores se despliegan a pedido. Las notas
del bundle y del release salen de `src/lib/novedades.json`; el número del
instalador lo fija el tag `escritorio-vX.Y.Z` en el workflow.

Las regresiones del actualizador se verifican con `npm test` en `desktop/`:
conservación del estado listo, descarga manual, pausa breve y sostenida,
reintento tras error y búsquedas concurrentes.
