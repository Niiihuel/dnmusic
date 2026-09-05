# Ajustes y actualizaciones

`app/ajustes/index.tsx` agrupa escucha, experiencia y cuenta. La búsqueda ignora
acentos y filtra dentro de la categoría seleccionada. Las tarjetas pasan a dos
columnas cuando el contenido tiene al menos 760 px disponibles.

Las preferencias viven en `src/state/ajustes.ts`, en AsyncStorage bajo
`ajustes:v1`. Son del dispositivo y se conservan al cerrar sesión. Las
instalaciones anteriores mantienen autoplay y Wi-Fi, y reciben los valores por
defecto para las opciones nuevas:

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
