// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Salida generada: el bundle web, el compilado del servicio de música, la
    // caché de expo-router y lo que Supabase deja al levantar los contenedores.
    ignores: ["dist/*", "server/dist/*", ".expo/*", "supabase/.temp/*"],
  }
]);
