# Módulos nativos de dnmusic

Expo descubre estos módulos locales mediante `nativeModulesDir: ./modules`
en `package.json`. Los cambios Swift/Kotlin y los nuevos módulos requieren
compilar e instalar otro binario; un export o una actualización JS no los
incorporan. Expo Go no sirve para validarlos.

| Módulo | Plataforma | Responsabilidad |
| --- | --- | --- |
| [media-controls](media-controls/README.md) | iOS | Filas, UITabBar, minirreproductor y superficies de acción |
| [collection-controls](collection-controls/README.md) | iOS | Buscador de colección y menú por pulsación larga |
| [native-menu](native-menu/README.md) | iOS | Menú UIKit al tocar el disparador |
| `remote-commands` | iOS | Anterior/siguiente desde MPRemoteCommandCenter |
| `audio-route` | iOS | Selector AirPlay y volumen del sistema |
| `backup-exclusion` | iOS | Excluir la carpeta de audio de las copias de iCloud |
| `android-controls` | Android | Modificadores Compose de TalkBack e insets |

Los bridges opcionales conservan el respaldo compartido o devuelven `null`/`false`
cuando el módulo no está en un binario anterior. Los módulos de UI emiten
acciones hacia React: no crean otra cola ni otra sesión de reproducción.
`remote-commands` complementa los comandos de reproducción de expo-audio.
`backup-exclusion` no borra ni impide reproducir descargas si falta.

Los controles de parámetros usan SwiftUI/Compose a través de `@expo/ui`;
el DSP y el avance de pistas se mantienen en
[el parche de expo-audio](../patches/README.md), no en estos módulos de UI.

## Validación

```bash
npx expo-modules-autolinking resolve --platform apple --json
npx expo-modules-autolinking resolve --platform android --json
```

Los tests de `tests/` comprueban contratos de bridges, permisos y callbacks.
Los workflows [iOS](../docs/BUILD-IOS-GITHUB.md) y
[Android](../docs/BUILD-ANDROID-GITHUB.md) compilan el código nativo.
Gestos, VoiceOver/TalkBack, texto grande, permisos y reproducción en segundo
plano también deben verificarse en un dispositivo con el binario nuevo.
