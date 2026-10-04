# Compilar Android en GitHub Actions

El workflow **Android — compilar** tiene dos modos:

- Al cambiar código nativo en una rama `codex/**`, verifica TypeScript, pruebas
  Android y compilación Gradle de un APK debug. No necesita credenciales EAS.
- Al iniciarlo manualmente, ejecuta `eas build --local` en Ubuntu y deja un
  binario firmado para descargar. Usa la configuración y la firma guardadas en
  EAS, pero no consume builds de EAS Cloud.

## Compilación manual

1. Subí a GitHub el commit que querés compilar. La acción no incluye cambios
   que sigan solamente en tu computadora.
2. Abrí **Actions → Android — compilar → Run workflow** y elegí la rama y el
   perfil:
   - `development`: APK con cliente de desarrollo. Necesita Metro y, para el
     servicio local, `adb reverse` o una URL accesible desde el dispositivo.
   - `preview` (predeterminado): APK autónomo, instalable en Android.
   - `production`: AAB firmado para Google Play; no se instala directamente.
3. Descargá `dnmusic-android-<perfil>-<ejecución>` desde **Artifacts**. Se
   conserva siete días. Si GitHub no puede guardar el artifact, la acción
   guarda el binario en un **borrador de Release** del repositorio y muestra el
   enlace en su resumen. Es un borrador: no publica una versión.

El workflow no envía el AAB a Google Play. El perfil `production` usa el
`versionCode` remoto de EAS y lo incrementa para cada intento de compilación,
incluso cuando la compilación falla después de reservarlo.

## Preparación una sola vez

En **Settings → Secrets and variables → Actions**, agregá `EXPO_TOKEN` de la
cuenta Expo que tiene acceso al proyecto `@niihuel/flora` y a las credenciales
Android. No se necesita una clave de Google Play para **compilar**; esa clave
sería necesaria para automatizar un envío a Play, que esta acción no hace.

Antes del primer build no interactivo, prepará el keystore de firma en EAS
desde una terminal autenticada:

```bash
npx eas-cli credentials --platform android
```

El workflow usa `--freeze-credentials`: si no encuentra la firma existente,
falla sin crearla ni modificarla. Si ya publicaste una versión en Google Play,
verificá que el `versionCode` remoto de EAS sea igual o mayor que el último
publicado. Podés configurarlo con `eas build:version:set` antes de compilar
`production`.

El runner `ubuntu-24.04` trae Android SDK, NDK y JDK 17. `npm ci` instala las
dependencias y aplica los parches nativos antes de EAS. Los valores públicos de
la app están en `eas.json`; `.env.local` no se carga en Actions.

## Referencias

- [EAS Build local](https://docs.expo.dev/build-reference/local-builds/)
- [Perfiles EAS y tipos de artifact](https://docs.expo.dev/build/eas-json/)
- [Versionado remoto](https://docs.expo.dev/build-reference/app-versions/)
- [Tokens Expo para CI](https://docs.expo.dev/accounts/programmatic-access/)
- [Software del runner Ubuntu 24.04](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)
