# Diseño móvil de Android

La referencia está centralizada en `src/ui/android-design.json`. React Native
usa `androidDesign.ts`; Compose recibe los mismos tamaños y colores. Las
clases semánticas de Tailwind tienen overrides exclusivos para Android.

- Títulos: Inter Tight Semibold, 22/28, tracking −0.7.
- Secciones: Inter Tight Semibold, 19/24, tracking 0.6.
- Cuerpo y etiquetas: Inter Tight Regular, 14.5/18, tracking 0.3.
- Metadatos compactos: 12/16, tracking 0.3.
- Controles circulares: diámetro visible 38–46, área táctil mínima 48.
- Tarjetas: radios 12, 16 y 18 según profundidad; sombras superpuestas.
- Texto, texto secundario, iconos y divisores usan `text`, `muted`, `strong`
  y `track`. Los separadores internos son líneas de 1 dp.
- Las acciones principales se distinguen por luz interior y relieve suave.
  Evitar rellenar el botón de blanco o delinear todas las tarjetas.

`AndroidTheme.android.tsx` carga los dos archivos de Inter Tight antes de
montar los controles Compose y proporciona las variables semánticas a RN.
La plataforma resuelve una versión transparente de ese contenedor en iOS/web.
La tipografía elegida por una persona para su perfil conserva su prioridad.

Configuración usa categorías con detalle y captura Atrás sólo mientras hay
un detalle abierto. Buscar vuelve a las categorías; seleccionar un resultado
limpia la consulta y abre su detalle. Las acciones destructivas mantienen su
confirmación.

Verificación: exportación de producción Android, TypeScript, ESLint y pruebas
de campos, navegación y estados de acciones. La validación visual en un
teléfono debe incluir escala de fuente ampliada, teclado abierto, TalkBack,
listas vacías y con contenido. Las sombras interiores de React Native requieren
Android 10 o posterior; en versiones anteriores queda el fondo y la interacción.
