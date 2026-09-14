# Android nativo y pruebas en vivo

DMusic conserva su lógica de reproducción, biblioteca, chat, perfil, sesión y sincronización en React. Los adaptadores `.android.tsx` usan controles reales de Jetpack Compose mediante `@expo/ui`, igual que los `.ios.tsx` usan SwiftUI. El módulo local `modules/android-controls` está escrito en Kotlin y aporta semántica de TalkBack dentro del árbol Compose. Los controles mantienen la paleta oscura/blanca, las superficies redondeadas y la jerarquía de DMusic. Liquid Glass pertenece a Apple: Android usa componentes Material personalizados, no ejecuta SwiftUI ni el material de iOS.

## Qué instalar

- Android Studio, con SDK Platform **Android 16 / API 36**, SDK Build-Tools **35.0.0 y 36.0.0**, Platform-Tools (ADB), Android Emulator y una imagen **Google APIs x86_64 API 36** para esta PC Linux x86_64.
- **JDK 17** para Gradle. Kotlin, el plugin de Compose y Gradle se resuelven con el proyecto; no necesitan instalación manual.
- Para compilar también hacen falta NDK **27.1.12297006** y CMake **3.22.1** (el SDK Manager/Gradle los instala según el proyecto generado).
- Un emulador creado en Android Studio → Device Manager, o un teléfono con opciones de desarrollador y depuración USB. En el teléfono hay que autorizar la huella de esta computadora.

Estos números salen del catálogo de React Native instalado y de la compilación nativa comprobada en GitHub. No sustituirlos por versiones de preview del SDK. Se recomienda un emulador Pixel con Google APIs; un dispositivo físico evita el consumo de RAM del emulador.

## En esta computadora: NixOS

El diagnóstico inicial encontró KVM disponible, pero no Java, ADB ni SDK. `android-shell.nix` prepara Android Studio, JDK, SDK, NDK y emulador desde Nixpkgs, sin modificar la configuración del sistema. La configuración de Nixpkgs del archivo acepta la licencia del SDK de Android: revisá los términos antes de entrar al shell. La primera descarga es grande.

```bash
nix-shell android-shell.nix
npm run android:doctor
android-studio
```

Si Android Studio abre **SDK Components Setup** con las casillas deshabilitadas, pulsá **Cancel**: detectó el SDK inmutable de Nix y ya tiene los componentes declarados por el proyecto. No elijas un dispositivo remoto para probar localmente; en Device Manager usá un AVD local como `DMusic_Pixel_API_36`.

Dentro de Android Studio, usá el SDK que muestra `echo "$ANDROID_HOME"`. Ese SDK lo administra Nix; no intentes instalar paquetes escribiendo en `/nix/store`. Creá el dispositivo virtual en Device Manager con la imagen instalada y encendelo. Dejá el IDE abierto y usá otra terminal entrando también con `nix-shell android-shell.nix` para ejecutar los comandos de la app. Los datos del emulador quedan en tu usuario. Si tu canal de Nixpkgs todavía no contiene esos paquetes, actualizá el canal o usá Android Studio con un SDK administrado por vos; no cambies versiones de Gradle/NDK al azar.

## Primera instalación y ciclo de trabajo

Con el emulador abierto o el teléfono autorizado:

```bash
npm run android:run
```

Genera la carpeta Android, compila el cliente de desarrollo, lo instala y abre Metro. `android/` es salida de prebuild: los cambios nativos duraderos van en `modules/`, la configuración Expo y plugins, no en archivos generados.

Las siguientes sesiones, con ese cliente ya instalado:

```bash
npm run android:dev
```

Al guardar componentes o lógica JS/TS, Fast Refresh actualiza el dispositivo. Cambiar Kotlin, dependencias nativas o plugins exige volver a ejecutar `npm run android:run`. Esta app necesita su **cliente de desarrollo**, porque Expo Go no contiene los módulos locales de DMusic.

Los scripts usan las URLs públicas del perfil preview de EAS por defecto, sin imprimir credenciales. Para usar tu servidor de música local por USB:

```bash
npm run android:usb
EXPO_PUBLIC_MUSIC_API=http://127.0.0.1:8787 npm run android:dev
```

`android:usb` conecta los puertos 8081 (Metro) y 8787 (API) mediante ADB. Sin `adb reverse`, el localhost del emulador es el emulador: para acceder al host se usa `10.0.2.2`. En teléfono por Wi-Fi, usá la IP LAN de la PC y `npx expo start --dev-client --lan`.

## Alcance y verificación

Las variantes nativas cubren campos/formularios, chat, búsqueda, botones, reproducción/seek, switch, segmentos, progreso, navegación inferior, menús/pulsación larga, confirmaciones, acciones sociales y catálogo/guardado del perfil. Los callbacks y servicios actuales siguen compartidos. Las listas de contenido, carátulas y burbujas mantienen su layout React Native; no se reescribe el backend ni se sustituye el motor de audio.

- `node --test tests/android-*.test.mjs`: borradores/foco/teclado, límites, seek frente a volumen, menús, confirmaciones y estados ocupados.
- `npm run typecheck` y exportación `npx expo export --platform android`.
- El workflow **Android — desarrollo** (manual o al cambiar estos controles en ramas `codex/`) compila Kotlin y un APK debug para ARM64 (teléfono) y x86_64 (emulador). No publica en tiendas ni crea releases. Si GitHub no tiene cupo de artifacts, la descarga no estará disponible; el mismo APK se genera localmente en `android/app/build/outputs/apk/debug/app-debug.apk`.
- Prueba física pendiente: abrir sesión, reproducir música/fragmento, buscar, arrastrar seek, cambiar pestañas desde un editor, cancelar/guardar edición de mensaje, cambiar categoría/colección, abrir y cerrar menú con Atrás, confirmar/cancelar un borrado y usar TalkBack/texto grande. Verificar que mensajes/adjuntos/borradores se conserven.

Referencias: [Expo UI con Compose](https://docs.expo.dev/versions/v57.0.0/sdk/ui/jetpack-compose/), [Android Studio](https://developer.android.com/studio/install), [aceleración del emulador](https://developer.android.com/studio/run/emulator-acceleration), [clientes de desarrollo Expo](https://docs.expo.dev/develop/development-builds/introduction/).

La [compilación nativa comprobada](https://github.com/Niiihuel/dnmusic/actions/runs/34796250045) terminó correctamente: módulo Kotlin, dependencias C++ y APK debug para ARM64/x86_64. GitHub agotó el cupo de artifacts y no guardó la descarga; `npm run android:run` lo genera e instala localmente. El código nativo compilado coincide con el actual; las correcciones posteriores de controles se cargan desde Metro. TypeScript, ESLint, exportación Android y 741 pruebas de app aprobados (una omitida). Esto no sustituye la comprobación visual en dispositivo indicada arriba.
