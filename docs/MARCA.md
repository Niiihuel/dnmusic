# Marca de dnmusic

El original entregado es `assets/branding/dnmusic-source.png`; se conserva sin modificar.
`python3 scripts/generar-iconos.py` (Pillow) produce las variantes usadas por Expo,
la pantalla de inicio animada, el login, las novedades, la web instalada y Electron.

- iOS: PNG de 1024 px opaco, sin esquinas dibujadas; el sistema aplica su máscara.
- Android: fondo, primer plano y silueta monocromática separados, dentro de la zona segura circular. Las notificaciones usan una silueta blanca transparente.
- Web: favicon, iconos de 192/512 px, variante maskable y Apple Touch de 180 px.
- Windows: ICO multirresolución (16–256 px) para el ejecutable, instalador y accesos directos; Linux usa PNG. `desktop/scripts/traer-web.mjs` copia ambos al empaquetar. La ventana usa el PNG del export web.

El recorte mide el dibujo visible, lo centra y conserva sus proporciones. Los
márgenes adicionales de Android y maskable protegen el dibujo del recorte del sistema.
No cambian los identificadores de aplicación ni las cuentas existentes.

Los iconos nativos y el splash requieren una nueva compilación/instalación de la app.
Los archivos generados se versionan: el build habitual no necesita Pillow.
