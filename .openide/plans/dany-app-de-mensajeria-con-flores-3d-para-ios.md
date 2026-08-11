---
title: Dany — App de mensajería con flores 3D para iOS
status: completado
planModel: 
execProvider: zhipu-coding
execModel: 
created: 2026-08-06T19:56:47.620Z
---

# Dany — App de mensajería íntima con flores 3D (iOS nativo)

## Contexto y decisiones

**Qué es.** Una app privada para **dos personas** (vos y ella) que están a distancia. Es una mensajería íntima donde **cada mensaje se envía como una flor**: al escribir, elegís la flor (tulipán u orquídea + color/variante); cuando ella abre el mensaje, la flor **florece con una animación 3D fotorrealista** y revela el texto. Funciona en ambos sentidos: ella también puede mandarte mensajes eligiendo su flor. Las flores leídas quedan como un "jardín" para releer cuando quieran.

**Decisiones confirmadas:**
- **Stack:** Swift + **SwiftUI**, iOS 16+ mínimo. Solo iPhone.
- **3D fotorrealista:** **RealityKit + SceneKit** con modelos **USDZ** de tulipán/orquídea (materiales PBR). Animación capullo→flor.
- **Backend:** **Firebase Firestore** (mensajes en tiempo real), **Firebase Auth** (los 2 usuarios).
- **Distribución:** **TestFlight** (tenés cuenta Apple Developer de $99/año).
- **CI:** **GitHub Actions** en runner **macOS** (vos estás en Linux, sin Mac). `fastlane` para firma + subida.

**Decisión sobre el concepto (cambio respecto a la idea original):** descartamos el modelo "fecha de desbloqueo futuro". Ahora es **mensajería bidireccional en tiempo real** con flor por mensaje. Opcionalmente (bonus, fuera del MVP) se puede añadir "envío programado" para flores que lleguen en una fecha especial.

**Nombre tentativo:** "Dany" (el workspace). Cambiable.

### Stack recomendado (resumen)
| Capa | Tecnología | Por qué |
|------|-----------|---------|
| App | Swift + SwiftUI | Nativo, máxima calidad de animación, solo iOS |
| 3D | RealityKit + SceneKit + USDZ PBR | Fotorrealismo, nativo Apple, sin dependencias |
| Backend | Firebase Firestore + Auth | Tiempo real, gratis, ideal para 2 usuarios |
| Assets 3D | Modelos USDZ (comprados/encargados) | El cuello de botella — ver "Riesgos" |
| CI/CD | GitHub Actions (macOS) + fastlane | Compilar iOS sin Mac local |
| Distribución | TestFlight | Llega a su iPhone sin App Store pública |

## El desafío central: iterar animaciones 3D desde Linux

Vos estás en Linux y **no podés correr Xcode localmente**. Esto es lo que más fricción genera, así que el plan lo ataca de frente:

1. **No depender de Xcode para diseñar la animación.** La floración (capullo→flor) se prototipa fuera de Xcode:
   - Previsualizar modelos USDZ en **Quick Look web** (model-viewer / Apple Reality Converter) y ajustar mirando renders.
   - La animación se define como **keyframes/morph en el archivo USDZ** (hecha por el modelador) o como **secuencia de transformaciones** que SwiftUI/RealityKit ejecuta por código (esto sí lo podés escribir y probar por CI).
2. **Obtener los modelos 3D hechos (no modelarlos vos):**
   - Opción A: **comprar** modelos de tulipán y orquídea en Sketchfab/CGTrader (filtrar por licencia comercial y que incluyan USDZ o GLB convertible con `usdzconvert`).
   - Opción B: **encargar** a un modelador 3D (Fiverr) un par de modelos "capullo" + "flor abierta" con **morph targets** o animación de apertura incluida. ~$40–150 por modelo.
3. **CI rápido de feedback visual:** un workflow que compile y suba a TestFlight en cada push te deja ver el resultado en tu iPhone en ~10��15 min. Para iteración fina de animación, considerar un **Mac cloud de pago por uso** (MacStadium ~$50/mes o Codemagic) solo durante la fase de pulido.
4. **Fallback de realismo si el 3D demora:** arrancar con una floración **Lottie** o **video pre-renderizado** para tener la app 100% funcional, e ir reemplazando por 3D fotorrealista modelo por modelo. Así nunca te bloquea la entrega.

## Estructura del repositorio (nuevo, desde cero)

```
dany/
├── DanyApp/                          # Proyecto Xcode (app iOS)
│   ├── DanyApp.xcodeproj             # (generado; gestionado por CI/xcconfig)
│   ├── App/
│   │   ├── DanyApp.swift             # Entry point + inyección de dependencias
│   │   └── AppState.swift            # Estado global (auth, usuario actual)
│   ├── Features/
│   ���   ├── Garden/                   # Lista/historial de mensajes (el "jardín")
│   │   │   ├── GardenView.swift
│   │   │   └── GardenViewModel.swift
│   │   ├── FlowerViewer/             # Vista de flor floreciendo + mensaje
│   │   │   ├── FlowerViewerView.swift
│   │   │   └── FlowerScene.swift     # Escena RealityKit de la floración
│   │   ├── Composer/                 # Escribir + elegir flor
│   │   │   ├── ComposerView.swift
│   │   │   └── FlowerPicker.swift
│   │   └── Auth/
│   │       └── AuthView.swift        # Login (2 usuarios)
│   ├── Models/
│   │   ├── FlowerMessage.swift       # Modelo del mensaje/flor
│   │   └── FlowerType.swift          # Enum tulipán/orquídea + variantes
│   ├── Services/
│   │   ├── FirestoreService.swift    # CRUD + listeners en tiempo real
│   │   ├── AuthService.swift         # Firebase Auth
│   │   └── FlowerAnimationService.swift # Selección de animación por flor
│   ├── Resources/
│   │   ├── Models/                   # .usdz (tulipán, orquídea, capullos)
│   │   └── Sounds/                   # (opcional) sonido sutil de floración
│   └── Support/
│       ├── Info.plist
│       └── GoogleService-Info.plist  # (NO commitear el real; ver CI)
├── firebase/
│   ├── firestore.rules               # Reglas de seguridad (solo los 2 usuarios)
│   └── firestore.indexes.json
├── fastlane/
│   ├── Fastfile                      # Lanes: build, sign, upload TestFlight
│   └── Matchfile                     # Gestión de certificados
├── .github/
│   └── workflows/
│       ├── ios-build.yml             # Build + TestFlight en macOS runner
│       └── ci-checks.yml             # (opcional) swift format/lint
├── docs/
│   ├── ASSETS-3D.md                  # Cómo conseguir/producir los modelos USDZ
│   └── CI-SETUP.md                   # Secrets y configuración de firma
├── .gitignore
└── README.md
```

## Modelo de datos (Firestore)

```
users/{uid}                  # 2 documentos
  - name, role (par "dany"), createdAt

pairs/{pairId}               # el vínculo entre los 2 (único, fijo)
  - memberUids: [uidA, uidB]

pairs/{pairId}/messages/{messageId}
  - senderUid: string
  - flowerType: "tulipan" | "orquidea"
  - flowerVariant: string        # color/especie, mapea a un modelo 3D
  - text: string
  - createdAt: timestamp
  - openedAt: timestamp | null   # cuándo el receptor la abrió (dispara floración)
  - readAt: timestamp | null
```
- **Tiempo real:** `addSnapshotListener` sobre `messages` ordenado por `createdAt` → llegada instantánea de mensajes nuevos.
- **Reglas de seguridad:** lectura/escritura solo para los 2 `uid` del par. Nadie más entra.
- **Auth:** los 2 usuarios creados a mano en Firebase (email/password o enlace mágico). La app loguea por email fijo; no hay registro abierto.

## Plan de animaciones (priorizado)

1. **MVP (fase que entrega valor ya):** floración con **Lottie o video pre-renderizado** de tulipán y orquídea abriéndose. Rápido, bonito, te deja probar toda la app de punta a punta.
2. **3D fotorrealista (objetivo):** reemplazar por **RealityKit + USDZ PBR**:
   - Modelo "capullo" y modelo "flor abierta" con **morph target** entre ambos → transición fluida y realista.
   - Iluminación HDR + materiales PBR para fotorrealismo.
   - Partículas sutiles (polen/brillo) y rotación de cámara lenta al abrir.
   - Por flor (tulipán/orquídea × 2-3 colores) para empezar.
3. **Pulido:** sonido ambiente sutil, hápticos al florecer, fondo (cielo/jardín).

## CI/CD — Compilar iOS sin Mac (GitHub Actions)

**Flujo `ios-build.yml`** (trigger: push a `main` o tag `v*`):
1. Job en `macos-latest`: checkout → instalar Swift/fastlane → descifrar `GoogleService-Info.plist` desde secret.
2. Restaurar certificados y provisioning profile vía **fastlane match** (guardados encriptados en el repo o en storage).
3. `xcodebuild archive` → `exportArchive` (IPA firmado para distribution).
4. Subir a TestFlight con `fastlane pilot` (o `xcrun altool`) usando **App Store Connect API key** (secret).

**Secrets necesarios en GitHub:**
- `APP_STORE_CONNECT_API_KEY` (clave de API, formato JSON/p8).
- `MATCH_PASSWORD` (para descifrar certificados).
- `GOOGLE_SERVICE_INFO_PLIST` (config de Firebase, base64).
- (o alternativamente p12 + password del cert de distribución).

**Atención minutos macOS:** runners macOS cuentan **x10** la cuota. En repos **público** los minutos son generosos; en privado del plan gratis (~2000 min → ~200 min macOS reales, ~15 builds/mes) puede no alcanzar para iteración intensiva. **Alternativa recomendada para empezar sin pagar:** **Codemagic** (500 min/mes gratis de macOS). Migrar a GitHub Actions cuando la app esté estable.

## Validación y revisión

- **Por fase:** cada fase termina con un build de TestFlight que se prueba en tu iPhone real (vos sos el primer tester; luego invitas a ella).
- **Checks automáticos:** `swift build` y `swift test` (tests unitarios de modelos y del `FirestoreService` mockeado) en cada push.
- **Validación de assets 3D:** checklist en `docs/ASSETS-3D.md` (licencia comercial, USDZ válido, morph target presente, peso < X MB).
- **Revisión de seguridad de Firestore:** auditar `firestore.rules` para confirmar que solo los 2 `uid` acceden.
- **Checkpoint de calidad visual:** screenshots/captura de la floración desde el iPhone para comparar contra la referencia de realismo buscada antes de dar por cerrada la fase 3D.

## Límites de commit

Commits **atómicos por fase/hito**, en Conventional Commits:
- `feat(app): scaffold proyecto Xcode + estructura SwiftUI`
- `feat(auth): login Firebase de los 2 usuarios`
- `feat(garden): lista de mensajes en tiempo real`
- `feat(flower): viewer con animación Lottie MVP`
- `feat(composer): escritura + selección de flor`
- `feat(3d): floración RealityKit USDZ (tulipán)`
- `feat(ci): build y subida a TestFlight`
- `docs(assets): guía de producción de modelos USDZ`

Nada de commitear `GoogleService-Info.plist` real, certificados, ni secrets.

## Riesgos y fuera de alcance

**Riesgos:**
- 🔴 **Assets 3D (mayor riesgo):** conseguir/producir tulipán y orquídea USDZ con morph de floración **bonito y fotorrealista** puede demorar o costar. *Mitigación:* MVP con Lottie/video para no bloquear; encargar a modelador; budget ~$100.
- 🟠 **Iteración desde Linux:** no poder correr Xcode frena el pulido fino de animación. *Mitigación:* feedback vía TestFlight en cada push; Mac cloud temporal en fase de pulido.
- 🟠 **Minutos de CI macOS:** pueden agotarse si iterás mucho. *Mitigación:* empezar con Codemagic gratis; repos público para minutos extra.
- 🟡 **Fotorrealismo vs rendimiento:** modelos PBR pesados pueden calentar/drenar batería. *Mitigación:* LOD, comprimir texturas, 2-3 flores activas máx.
- 🟡 **TestFlight expira builds a 90 días** (no la app instalada, pero hay que re-subir para nuevas instalaciones). *Mitigación:* mantener builds frescos.

**Fuera de alcance (MVP):** fotos/audio en mensajes, AR (poner la flor en el mundo real), app para Android, panel web de administración (la mensajería es desde la app, no hace falta), envío programado (bonus futuro), multi-flor personalizable en profundidad.

## Tareas

### Fase 0 — Setup y andamiaje
- [x] Crear el proyecto Xcode (SwiftUI, iOS 16+) — estructura de carpetas del plan
- [x] Inicializar repo git + `.gitignore` (ignorar `GoogleService-Info.plist`, DerivedData, etc.)
- [ ] Crear cuenta/proyecto **Firebase**, habilitar Auth y Firestore
- [x] Definir `firestore.rules` (solo los 2 uid) y `firestore.indexes.json`
- [ ] Crear los 2 usuarios en Firebase Auth
- [x] `README.md` con descripción del proyecto y cómo correrlo

### Fase 1 — Mensajería funcional (sin floración real todavía)
- [x] `AuthService`: login de los 2 usuarios
- [x] `FirestoreService`: enviar mensaje + `addSnapshotListener` en tiempo real
- [x] `FlowerType` enum (tulipán/orquídea + variantes) y `FlowerMessage` modelo
- [x] `GardenView`: lista/historial de mensajes (orden cronológico)
- [x] `ComposerView`: escribir texto + elegir flor (placeholder visual)
- [x] `FlowerViewerView`: abrir mensaje (animación placeholder simple por ahora)
- [ ] App navegable de punta a punta en simulador/device

### Fase 2 — Floración MVP (Lottie o video)
- [ ] Conseguir/crear animación Lottie (o video) de tulipán floreciendo
- [ ] Conseguir/crear animación Lottie (o video) de orquídea floreciendo
- [x] Integrar floración en `FlowerViewerView` (capullo→flor al abrir)
- [ ] Primer build a TestFlight y prueba en iPhone real

### Fase 3 — CI/CD a TestFlight
- [ ] Generar App ID + certificado de distribución + provisioning en Apple Developer
- [ ] Configurar **fastlane match** (certificados encriptados)
- [x] Workflow `ios-build.yml` (macOS runner → archive → firmar → subir TestFlight)
- [ ] Configurar secrets en GitHub (API key, MATCH_PASSWORD, GoogleService plist)
- [x] `docs/CI-SETUP.md` con el procedimiento completo
- [ ] Build automático verde y visible en TestFlight

### Fase 4 — 3D fotorrealista (objetivo de calidad)
- [x] `docs/ASSETS-3D.md`: especificación de modelos (tulipán/orquídea, capullo+abierto, morph, PBR, USDZ)
- [ ] Conseguir/encargar modelo USDZ de **tulipán** con morph de floración
- [ ] Conseguir/encargar modelo USDZ de **orquídea** con morph de floración
- [x] `FlowerScene.swift`: escena 3D (SceneKit SceneView, cámara, iluminación) — RealityKit `RealityView` requeriría iOS 18, por eso SceneKit en iOS 16
- [ ] Conectar morph capullo→flor al abrir el mensaje
- [ ] Reemplazar Lottie MVP por RealityKit en `FlowerViewerView`
- [ ] Pulido: hápticos, sonido sutil, rotación de cámara, fondo

### Fase 5 — Pulido y entrega a ella
- [x] Variantes de color por flor (2-3)
- [x] Estados vacíos y onboarding mínimo para ella
- [x] Icono de app + launch screen (rosa/jardín, on-brand)
- [ ] Pruebas finales en iPhone de ella (invitación TestFlight)
- [ ] Captura de referencia de realismo; ajustes finales de animación
- [ ] Commit/tag de release `v1.0`
