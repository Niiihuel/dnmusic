# Dany 🌷🪷

App de mensajería íntima para dos personas a distancia. Cada mensaje se envía
como una **flor** (tulipán u orquídea, que elegís al escribir); al abrirlo, la
flor **florece con una animación 3D fotorrealista** y revela el texto. Funciona
en ambos sentidos, en tiempo real. Las flores leídas quedan como un "jardín"
para releer cuando quieran.

> Un regalito hecho con cariño. 💛

## Stack

| Capa        | Tecnología                                  |
|-------------|---------------------------------------------|
| App         | Swift + SwiftUI (iOS 16+, solo iPhone)       |
| 3D          | RealityKit + SceneKit + modelos USDZ (PBR)   |
| Animación MVP | Lottie (floración de prueba)               |
| Backend     | Firebase Firestore (tiempo real) + Firebase Auth |
| CI/CD       | GitHub Actions (runner macOS) + fastlane     |
| Distribución| TestFlight                                   |

## Estructura

```
DanyApp/                 App iOS
  App/                   Entry point + estado global
  Features/              Auth, Garden (historial), FlowerViewer, Composer
  Models/                FlowerType, FlowerMessage
  Services/              AuthService, FirestoreService
  Resources/             Modelos 3D (.usdz), sonidos, Assets
  Support/               Info.plist, GoogleService-Info.plist
firebase/                Reglas e índices de Firestore
fastlane/                Firma + subida a TestFlight
.github/workflows/       CI: build + TestFlight
docs/                    ASSETS-3D.md, CI-SETUP.md
project.yml              Definición del proyecto (XcodeGen)
```

## Requisitos para compilar

Como desarrollamos desde **Linux** (sin Mac), el proyecto se define con
**XcodeGen** (`project.yml`) y se compila en el CI de GitHub Actions. Si tenés
acceso a una Mac, también podés compilarlo ahí.

### Compilar en Mac local (opcional)

```bash
brew install xcodegen
xcodegen generate           # genera DanyApp.xcodeproj
open DanyApp.xcodeproj      # abrí en Xcode y pulsá Run (⌘R)
```

### Compilar vía CI (la vía principal, sin Mac)

1. Configurá Firebase y los secretos de firma (ver `docs/CI-SETUP.md`).
2. Hacé `git push` a `main` (o creá un tag `v*`).
3. El workflow compila y sube a TestFlight automáticamente.

## Puesta en marcha (checklist)

1. **Firebase** — Creá un proyecto en [console.firebase.google.com](https://console.firebase.google.com),
   habilitá **Authentication** (Email/Password) y **Firestore** (modo producción).
   Descargá `GoogleService-Info.plist` y ponelo en `DanyApp/Support/`.
   Deployá las reglas e índices:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```
2. **Usuarios** — En Authentication creá los 2 usuarios (vos y ella).
3. **Par** — En Firestore creá el documento `pairs/{pairId}` con los dos `uid`:
   ```json
   { "memberUids": ["UID_TUYO", "UID_DE_ELLA"] }
   ```
4. **CI/CD** — Seguí `docs/CI-SETUP.md` (certificados Apple + secrets de GitHub).
5. **Assets 3D** — Conseguí/encargá los modelos USDZ (`docs/ASSETS-3D.md`).
6. **Animación MVP** — Colocá los `.json` de Lottie en `DanyApp/Resources/Anim/`
   (`docs/ANIMATIONS.md`) para tener floración antes del 3D.
7. **Icono de la app** — Agregá un PNG `1024×1024` llamado `AppIcon-1024.png` en
   `DanyApp/Resources/Assets.xcassets/AppIcon.appiconset/` (editá su `Contents.json`
   agregando `"filename"`) y regenerá el proyecto.

## Licencia

Privado. Solo para uso personal de las dos personas.
