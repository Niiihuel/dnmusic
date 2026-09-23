// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    files: ['desktop/**/*.cjs'],
    languageOptions: { globals: { Buffer: 'readonly', __dirname: 'readonly' } },
  },
  {
    // Las pruebas corren en Node, no en la app: sus globales son las de Node.
    files: ['tests/**/*.mjs'],
    languageOptions: { globals: { Buffer: 'readonly', process: 'readonly' } },
  },
  {
    // Salida generada: el bundle web, el compilado del servicio de música, la
    // caché de expo-router, lo que Supabase deja al levantar los contenedores y
    // lo que el escritorio copia y empaqueta.
    ignores: [
      // Canvases generados por el editor, con un runtime externo al proyecto.
      ".openide/canvases/**",
      "dist/*",
      "server/dist/*",
      ".expo/*",
      ".railway-config-pull-*/**",
      "supabase/.temp/*",
      "desktop/dist/*",
      "desktop/web/*",
      "desktop/build/*",
      "desktop/release/*",
    ],
  }
]);
