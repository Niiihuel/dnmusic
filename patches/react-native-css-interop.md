# react-native-css-interop 0.2.6

El parser de `box-shadow` continúa accidentalmente al caso `aspect-ratio` y
aborta Metro con `Cannot read properties of undefined (reading '0')` cuando
el CSS contiene una sombra válida. Esto impide el bundle de producción iOS.

El parche devuelve el resultado de `parseBoxShadow` en el fuente y el JavaScript
compilado. Conserva las advertencias de sombras no compatibles, sin tratar de
reproducir estilos exclusivos de escritorio en nativo. `postinstall` lo aplica
mediante patch-package. Revisarlo o retirarlo al actualizar NativeWind.

`tests/native-css-build.test.mjs` ejecuta el conversor real con sombras simples,
múltiples y proporciones de imagen para comprobar la regresión.
