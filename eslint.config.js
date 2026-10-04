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
    files: ['tests/**/*.mjs'],
    languageOptions: { globals: { Buffer: 'readonly', process: 'readonly' } },
  },
  {
    // Artefactos generados y exportaciones locales ajenas al código fuente.
    ignores: [
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
