# Componentes de audio

Los controles de DMusic toman como referencia la composición de
[audiocn](https://github.com/audiocn/ui): etiqueta, valor con unidades, slider,
escala, ajuste fino y restablecimiento. La implementación se adapta a Expo y
React Native; no se instala otro motor ni se migra NativeWind/Tailwind.

## Parámetros

La familia `AudioParameter` (`src/ui/AudioParameter.tsx` y sus variantes de
plataforma) comparte el contrato entre web, SwiftUI y Compose:

- `value`, `min`, `max` y `step` siempre usan las unidades reales del parámetro.
- `format` describe el valor visible y accesible. `unit` acompaña la entrada
  numérica web; `inputScale={1000}` permite escribir segundos conservando
  callbacks en milisegundos.
- `onChange` recibe valores limitados y redondeados al paso de edición.
  `onCommit` permite guardar al terminar.
- `commitOnly` conserva la previsualización del slider durante el arrastre y
  cambia el borrador una vez al soltar. Mix usa este modo para que Deshacer
  revierta un gesto completo.
- `scale="log"` da una escala perceptual de frecuencia, conservando los
  callbacks, entradas numéricas y anuncios del lector de pantalla en Hz.
- `resetValue` agrega una acción explícita de restablecimiento. Las flechas
  cambian un paso; en web Shift + flecha cambia diez pasos.
- `compact` conserva el slider accesible en barras de reproducción angostas.

Los controles de volumen y transporte siguen el estado de reproducción
existente. iOS conserva el control de volumen del sistema. El ecualizador
ofrece diez faders en escritorio y una banda seleccionada con slider nativo
y ajuste de 0,5 dB en iOS/Android; los cambios respetan bloqueo de escucha
remota, presets personales y comparación A/B.

La carga de audio se puede pausar y los errores se muestran junto al transporte.
Silenciar y devolver el sonido conservan un único último nivel audible entre
el reproductor pequeño y el completo. Las ondas permiten buscar al soltar,
con vista previa de tiempo y teclado en web; el lector de pantalla anuncia
tiempos reales. Las flechas de posición avanzan cinco segundos y Home/End
van a los extremos. Los discos y portadas detienen sus animaciones al ocultar
la app o activar Reducir movimiento; el audio permanece en el motor global.

Mix mantiene los motores de preescucha, curvas, undo/redo y publicación.
Los parámetros se muestran en segundos, %, dB o Hz, sin reutilizar un control
de posición de canción para ganancias o filtros. La curva de playlist admite
−12…+12 dB por banda y −24…+6 dB en la salida. El filtro usa 20…20.000 Hz.

## Referencias y plataforma

Referencia examinada: audiocn/ui, commit
`199b0b83e9ea175006bb2d86b529a3287e1fc4f6`.

- [Parameter Slider](https://github.com/audiocn/ui/blob/main/components/ui/parameter-slider.tsx)
- [Fader](https://github.com/audiocn/ui/blob/main/components/ui/fader.tsx)
- [Audio Player / transporte](https://github.com/audiocn/ui/blob/main/components/ui/audio-player.tsx)
- [Volume Control](https://github.com/audiocn/ui/blob/main/components/ui/volume-control.tsx)
- [Motor propio](https://github.com/audiocn/ui/blob/main/content/docs/concepts/custom-engine.mdx)
- [Accesibilidad](https://github.com/audiocn/ui/blob/main/content/docs/concepts/accessibility.mdx)
- [Licencia MIT de audiocn](https://github.com/audiocn/ui/blob/main/license.md)

Los componentes originales dependen del DOM/Base UI/Tailwind 4; sus hooks de
audio usan HTMLAudioElement y Web Audio. DMusic usa implementaciones propias
de los controles con el motor expo-audio y módulos nativos actuales. No se
copia su hook de portapapeles: compartir conserva el puente de Electron,
expo-clipboard y el fallback web de DMusic.

## Validación

`npm run check` verifica tipos y suites de app, servicio y escritorio. Las
pruebas de parámetros, controles y teclado web se encuentran en `tests/`.
Las pruebas de componentes no sustituyen VoiceOver/TalkBack, gestos ni audición
con un binario nativo. Ver [reproducción continua](REPRODUCCION-CONTINUA.md) y
[parches](../patches/README.md) para la matriz de pantalla bloqueada.
