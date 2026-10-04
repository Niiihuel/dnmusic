const apple = require('./src/ui/apple.json')
const android = require('./src/ui/android-design.json')
const plugin = require('tailwindcss/plugin')

/**
 * `largeTitle` → `large-title`, que es como se escribe una clase.
 *
 * Corta **solo** en la mayúscula, nunca en el dígito: `caption1` es
 * `text-caption1` y no `text-caption-1`. Partirlo también en el número dejó
 * cinco clases —los tres títulos y los dos caption— con un nombre que nadie
 * escribía, así que 146 textos caían al tamaño por defecto del navegador sin
 * que fallara nada. La prueba de al lado ahora fija los once nombres a mano
 * justamente por eso: derivarlos con esta misma función no probaba nada.
 */
const claseTexto = (nombre) => nombre.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // El tema lo maneja html[data-theme] (mismo criterio que zuno), no la media
  // query del sistema. Con darkMode 'media' NativeWind tira al intentar fijar
  // el color scheme desde JS.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Tokens resueltos desde las CSS variables de global.css.
        // Criterio de docs/DESIGN.md: superficies neutras, un solo acento.
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        background: 'rgb(var(--color-background) / <alpha-value>)',
        foreground: 'rgb(var(--color-foreground) / <alpha-value>)',
        card: 'rgb(var(--color-card) / <alpha-value>)',
        'card-foreground': 'rgb(var(--color-card-foreground) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        'muted-foreground': 'rgb(var(--color-muted-foreground) / <alpha-value>)',
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        'primary-foreground': 'rgb(var(--color-primary-foreground) / <alpha-value>)',
        secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
        'secondary-foreground': 'rgb(var(--color-secondary-foreground) / <alpha-value>)',
        destructive: 'rgb(var(--color-destructive) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        ring: 'rgb(var(--color-ring) / <alpha-value>)',
      },
      /*
       * Los once estilos de texto de iOS, con su interlineado y su tracking.
       *
       * Salen de `src/ui/apple.json` para no tener la escala escrita dos veces:
       * los `Animated.*` no pueden usar `className` (ver la trampa de NativeWind
       * en docs/DESIGN.md) y la leen desde `src/ui/tipografia.ts`, del mismo
       * archivo.
       *
       * El tracking es la parte que no estaba y la que más se nota: SF trae una
       * tabla óptica por tamaño —positiva en los títulos, negativa en el
       * cuerpo— y sin ella los títulos se leen sueltos y el cuerpo apretado.
       */
      fontSize: Object.fromEntries(
        Object.entries(apple.texto)
          .filter(([nombre]) => !nombre.startsWith('_'))
          .map(([nombre, e]) => [
            claseTexto(nombre),
            [`${e.size}px`, { lineHeight: `${e.leading}px`, letterSpacing: `${e.tracking}px` }],
          ]),
      ),
      /*
       * Los radios de Apple, nombrados por la pieza y no por un tamaño: el
       * sistema no tiene una rampa geométrica, le asigna un radio a cada cosa.
       * `card` y `pill` se conservan **con su valor de siempre**: los usa media
       * app, y cambiarlos acá repintaría cada tarjeta de la app de refilón. Los
       * radios de Apple entran con nombre propio y se aplican pieza por pieza.
       */
      borderRadius: {
        ...Object.fromEntries(
          Object.entries(apple.radio)
            .filter(([nombre]) => !nombre.startsWith('_'))
            .map(([nombre, valor]) => [nombre, `${valor}px`]),
        ),
        card: '20px',
        pill: '999px',
      },
    },
  },
  plugins: [plugin(({ addUtilities }) => {
    // La misma clase semántica adopta las medidas Android sólo en esa plataforma.
    const roles = { largeTitle: 'title', title1: 'title', title2: 'section', title3: 'section', headline: 'section', body: 'body', callout: 'body', subheadline: 'body', footnote: 'body', caption1: 'caption', caption2: 'caption' }
    addUtilities({ '@media (display-mode: android)': Object.fromEntries(
      Object.entries(roles).map(([name, role]) => {
        const t = android.type[role]
        return [`.text-${claseTexto(name)}`, {
          fontSize: `${t.fontSize}px`, lineHeight: `${t.lineHeight}px`, letterSpacing: `${t.letterSpacing}px`, fontFamily: t.fontFamily, fontWeight: t.fontWeight,
        }]
      }),
    ) })
  })],
}
