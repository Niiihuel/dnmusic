# Assets 3D: tulipán y orquídea (USDZ fotorrealista)

Este es el **objetivo de calidad visual** de la app: que al abrir un mensaje la
flor **florezca en 3D fotorrealista**. El código que la muestra ya está listo
(`SceneKitFlowerView` en `DanyApp/Features/FlowerViewer/FlowerScene.swift`, vía
SceneKit + `SceneView`, compatible iOS 16). Solo falta conseguir **los modelos**.

> Importante: arrancá con Lottie (`ANIMATIONS.md`) para no bloquear la entrega.
> Cuando tengas el USDZ de una flor, colocalo y `FlowerAnimationService` lo
> **prioriza automáticamente** sobre el Lottie. No tocás el resto de la app.

## Dónde van los modelos

```
DanyApp/Resources/Models/
    tulipanRosa.usdz
    tulipanAmarillo.usdz
    tulipanBlanco.usdz
    orquideaBlanca.usdz
    orquideaMorada.usdz
    orquideaRosa.usdz
```

El nombre debe coincidir con el `assetName` de cada variante (`FlowerType.swift`).

## Especificación de cada modelo

| Aspecto | Requisito |
|---------|-----------|
| Formato | **USDZ** (Apple USDZ o convertido con `usdzconvert` desde `.usd`/`.gltf`/`.fbx`). |
| Estado | **Flor abierta** (la transición capullo→flor se logra con morph/scale, ver abajo). |
| Materiales | **PBR** (metalness/roughness/baseColor/normales) para fotorrealismo. |
| Texturas | < 2048px, comprimidas (ASTC). Peso total **< 8–12 MB por flor**. |
| Escala | Cuadrante de cámara ajustado a `SceneView` (la app permite orbitar con el dedo). |
| Licencia | **Comercial** (si se compra) o libre de uso. Guardá el comprobante/licencia. |

## Cómo conseguirlos (no los modele vos)

### Opción A — Comprar (más rápido)
- **Sketchfab** / **CGTrader** / **TurboSquid**: buscá "tulip", "orchid",
  "flower bloom". Filtros: licencia comercial + formato GLB/USD/FBX.
- Si viene en **GLB/FBX**, convertí a USDZ en Mac con:
  ```bash
  xcrun usdzconvert tulipanRosa.gltf -o tulipanRosa.usdz
  ```
  o usá la web [Reality Converter](https://developer.apple.com/augmented-reality/quick-look/).

### Opción B — Encargar (mejor resultado y con animación de floración)
En **Fiverr** / **Upwork**, pedile a un modelador:
> "Modelo 3D de un tulipán/orquídea realista en USDZ, con **morph target** (blend
> shape) desde **capullo cerrado** a **flor totalmente abierta**. Materiales PBR,
> texturas ≤ 2K, optimizado para móvil (< 10 MB). Entregar .usdz + .blend/.glb."

Presupuesto orientativo: **USD 40–150 por flor**. Pedí que incluya el morph.

## Floración (capillo→flor) en la app

1. **Si el USDZ trae morph/blend shape** (mejor): en `SceneKitFlowerView`, animá
   el `SCNMorpher` de `weight 0` (capullo) a `1` (abierto) con un
   `CABasicAnimation`/`SCNAction.customAction` cuando `bloomed == true`.
2. **Si solo hay un modelo de flor abierta**: usá la animación de
   `scaleEffect` + `opacity` ya implementada como aproximación (crece y aparece).
   Funciona y se ve bonito, aunque menos "botánico".

La conexión `bloomed` ya está lista en `FlowerViewerView`; solo agregás la lógica
del `SCNMorpher` dentro de `SceneKitFlowerView`.

## Checklist de aceptación de un modelo

- [ ] Abre en Quick Look (Mac: Finder → espacio → previsualiza).
- [ ] Se ve realista (iluminación PBR correcta, no plástico).
- [ ] Peso < 12 MB.
- [ ] Nombre exacto: `<variant>.usdz`.
- [ ] Licencia comercial guardada.
- [ ] Carga en la app sin warnings (`SCNScene(url:)` no tira errores).

## Previsualizar sin compilar

Podés abrir cualquier `.usdz` en la web con
[Google `<model-viewer>`](https://modelviewer.dev/) o el visor de Sketchfab,
para ajustar antes de integrarlo y no gastar builds de CI.
