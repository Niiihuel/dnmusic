# El motor de a bordo del teléfono

Cómo hace un iPhone para bajar una canción de YouTube Music **sin pasar por el
servidor**.

## Por qué existe

YouTube le niega el audio a las IPs de datacenter: a la del servidor le contesta
`Sign in to confirm you're not a bot` mientras cualquier IP de casa resuelve sin
drama. La salida que había era comunitaria — la app de escritorio baja el tema
con la IP de esa compu y lo aporta al bucket, y a partir de ahí le suena a
todos.

Eso deja afuera a quien **solo tiene un teléfono**: hasta que alguien prendiera
una compu, el catálogo estaba a la vista pero mudo para cualquier canción que
nadie hubiera pisado antes. Este motor es que el teléfono deje de esperar a
nadie: resuelve con su propia IP y, de paso, aporta como el escritorio.

## Los dos muros, y la única pieza que los tira

Un resolutor en React Native puro no existe, y no por falta de ganas:

1. **El PO token.** googlevideo sirve el primer megabyte de una sesión sin
   atestiguar y corta el resto con 403 — también desde una IP residencial; está
   medido en `desktop/src/resolutor.ts`. Acuñarlo exige correr BotGuard, que
   mira `window`, `document` y `navigator` para convencerse de que hay un
   navegador.
2. **Descifrar la URL.** Hay que evaluar un pedazo del reproductor de YouTube, y
   la app corre en Hermes, que no tiene `eval` ni `new Function`. El shim de
   React Native de youtubei.js lo dice con todas las letras: *«To decipher URLs,
   you must provide your own JavaScript evaluator»*.

Las dos las tira lo mismo: **un WKWebView**, que es Safari de verdad. Es la
misma idea de zuno —que es Tauri por exactamente este motivo— y deja al teléfono
en mejor posición que al servidor: nosotros le pedimos a BotGuard que certifique
un navegador mostrándole jsdom; el teléfono le muestra uno real.

## El reparto

| Quién | Qué hace | Por qué él |
| --- | --- | --- |
| El WebView | Atestigua ante BotGuard y evalúa JS | Es el único navegador de verdad que hay |
| React Native | **Toda** la red: InnerTube y la descarga | Su `fetch` es nativo y no tiene CORS |
| El servidor | Verifica y guarda el aporte | El bucket es de todos; nada entra sin ffprobe |

Lo que cruza el puente son strings y objetos planos, y eso no es una comodidad:
es lo que hace que se pueda delegar. El contrato de `evaluar` es literalmente el
de `Platform.shim.eval` de youtubei.js —entra `{ output, env }` de primitivas,
sale un objeto plano—, así que el evaluador puede vivir del otro lado de un
`postMessage` sin que youtubei.js se entere.

## Dónde está cada cosa

| Archivo | Qué hace |
| --- | --- |
| `src/services/motor/MotorWebView.tsx` | El WebView de 1×1 y el puente de promesas |
| `src/services/motor/pagina.ts` | El programa que corre adentro del WebView |
| `src/services/motor/bgutils.generado.ts` | bgutils-js aplanado (**generado**, no editar) |
| `src/services/motor/resolutorABordo.ts` | La resolución: espejo del escritorio |
| `src/services/motor/salida.ts` | El host de YouTube Music y el User-Agent |
| `src/services/motor/*.web.ts(x)` | Los stubs que dejan todo esto fuera del bundle web |
| `scripts/armar-motor.mjs` | Arma `bgutils.generado.ts` (`npm run motor`) |

## Detalles que costaron una medición

**La página se carga desde `music.youtube.com/robots.txt`.** No por capricho:
está medido que desde un **origen opaco** —un HTML suelto sin sitio, que es lo
que da un WebView sin `baseUrl`— BotGuard ni siquiera arranca
(`BgError: PMD:Undefined`). Necesita un origen https de verdad; cualquiera sirve,
no tiene que ser YouTube. `robots.txt` son 186 bytes, contra la aplicación
entera de YouTube Music en un WebView oculto.

**El User-Agent sale del WebView, no de una constante.** En el servidor lo
fijamos a mano porque no hay ningún navegador al que copiarle; acá sí lo hay, y
tiene que ser el mismo en las tres puntas — BotGuard certifica al navegador que
ve, y si el `/player` y la descarga dicen ser otro cliente, la atestación no ata
nada. El WebView lo informa al arrancar y `salida.ts` lo guarda.

**bgutils va aplanado a mano y no con un bundler.** Son 20 KB en seis archivos
con imports relativos y sin un solo `export default`: concatenar en orden y
sacar los `import`/`export` alcanza, y el resultado se puede leer. Metro no
sirve acá — empaqueta para React Native, no para el documento del WebView.

**Todo se carga con `require` opcional.** `react-native-webview` es una
dependencia nativa nueva: un `import` normal convierte «esta versión no trae el
motor» en «la app no abre» en cualquier TestFlight compilado antes. Mismo patrón
que `src/state/descargas.ts`. Si falta, `hayResolutorABordo()` da falso y el
teléfono sigue usando el `/resolve` del servidor, como siempre.

**El aporte se sube por archivo.** El `fetch` de React Native no manda un
`Uint8Array` como cuerpo, y pasar cinco megas a base64 por el puente es memoria
y tiempo por nada: `expo-file-system` sube el archivo desde el lado nativo.

## Lo que está medido, y con qué

Con un Chrome de verdad haciendo de WebView, desde una máquina de desarrollo:

- el `MOTOR_JS` de producción corre entero: avisa listo con su UA, `evaluar`
  cumple el contrato de `Platform.shim.eval`, y `acunar` tarda ~2,6 s la primera
  vez y 0 s la segunda (el minter queda cacheado);
- anda desde un documento `text/plain`, que es lo que sirve `robots.txt`;
- desde un **origen opaco** no anda (`BgError: PMD:Undefined`) — de ahí que la
  página se cargue desde un sitio y no de un HTML suelto;
- `isBrowser()` da verdadero, así que bgutils no pisa el User-Agent y queda el
  del WebView.

**La reja del megabyte, que es la que importa.** googlevideo sirve el primer MiB
de una sesión sin atestiguar y corta el resto con 403, así que un solo rango de
100 KB a partir del byte 2.000.000 contesta la pregunta entera sin bajar una
canción. Dos corridas, con el orden y los videos cruzados entre las ramas:

| Acuñador | Byte 2.000.000 |
| --- | --- |
| Navegador (lo que usa el teléfono) | **206, sirve los bytes** |
| jsdom (lo que usa el servidor) | **403** |

Dos cosas salen de ahí. La primera es que el diseño de este motor funciona. La
segunda es incómoda y vale para el servidor: **que BotGuard acuñe sin devolver
token de reserva no significa que vayan a honrar lo acuñado.** La atestación de
jsdom es mediblemente más débil que la de un navegador, y parte de lo que
veníamos cargándole a la reputación de la IP era esto. Un servidor con Chrome
headless en vez de jsdom es una mejora con evidencia atrás, aunque no arregla el
`LOGIN_REQUIRED` del `/player`, que sí es de la IP.

## Lo que falta probar

Lo específico del dispositivo, que **no se puede verificar sin un iPhone**: que
WKWebView ejecute el script inyectado sobre `robots.txt`, y que el aporte suba
con `expo-file-system`. Es lo primero que hay que mirar en el primer build de
EAS; si el motor arranca, la consola dice `[motor] listo (bgutils 4.0.3)`.
