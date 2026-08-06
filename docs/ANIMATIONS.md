# Animaciones de floración (MVP con Lottie)

Esta fase usa **Lottie** para tener una floración bonita de inmediato, mientras
llega el 3D fotorrealista (ver `ASSETS-3D.md`). El código que reproduce Lottie ya
está implementado (`LottieFlowerView` en `DanyApp/Features/FlowerViewer/FlowerScene.swift`).
Solo tenés que **colocar los archivos `.json` de Lottie** con el nombre correcto.

## Dónde van los archivos

```
DanyApp/Resources/Anim/
    tulipanRosa.json
    tulipanAmarillo.json
    tulipanBlanco.json
    orquideaBlanca.json
    orquideaMorada.json
    orquideaRosa.json
```

El nombre del archivo **debe coincidir exactamente** con el `assetName` de cada
variante (ver `FlowerType.swift`). Si un archivo no existe, esa flor degrada a
emoji automáticamente (no se rompe).

## Cómo conseguir las animaciones

### Opción rápida (recomendada para arrancar)
1. Entrá a [LottieFiles](https://lottiefiles.com) y buscá "flower bloom", "tulip",
   "orchid", "lotus bloom".
2. Descargá animaciones en formato **JSON (Lottie)** con licencia que permita uso.
3. Renombralas a los nombres de arriba (`tulipanRosa.json`, etc.).
4. No hace falta que sean perfectas: sirven para probar toda la app de punta a punta.

### Opción a medida (mayor calidad y control)
Animá la floración vos mismo en **After Effects** (o pedíselo a un diseñador en
Fiverr) y exportala con el plugin **LottieFiles (Bodymovin)**:
- La animación debe ir de **capullo cerrado (frame 0)** a **flor abierta (frame final)**.
- La app la reproduce una sola vez de principio a fin al abrir el mensaje.
- Mantené un peso razonable (< 300 KB por flor).

## Por qué Lottie primero

- Es vectorial y liviana: perfecto para iterar la app sin depender del 3D.
- Se ve bien en cualquier iPhone y no consume batería como el render 3D.
- Una vez validada la experiencia con ella, reemplazá flor por flor por el 3D
  fotorrealista (`ASSETS-3D.md`) sin tocar el resto de la app: `FlowerAnimationService`
  detecta automáticamente si existe el `.usdz` y lo prioriza sobre el `.json`.
