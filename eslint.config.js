// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Salida generada: el bundle web, el compilado del servicio de música, la
    // caché de expo-router, lo que Supabase deja al levantar los contenedores y
    // lo que el escritorio copia y empaqueta.
    ignores: [
      "dist/*",
      "server/dist/*",
      ".expo/*",
      "supabase/.temp/*",
      "desktop/dist/*",
      "desktop/web/*",
      "desktop/build/*",
      "desktop/release/*",
    ],
  }
]);
