import { BGUTILS_JS, BGUTILS_VERSION } from './bgutils.generado'

/**
 * El programa que corre **adentro** del WebView.
 *
 * El WebView del teléfono es un WKWebView: Safari de verdad. Eso lo vuelve el
 * único lugar de la app donde pueden pasar las dos cosas que YouTube exige y
 * que React Native no puede dar:
 *
 *   1. **Atestiguar.** BotGuard mira `window`, `document` y `navigator` para
 *      convencerse de que hay un navegador. Un runtime simulado no le alcanza:
 *      está medido acá que desde un origen opaco —un HTML suelto, sin sitio—
 *      la atestación ni siquiera arranca (`BgError: PMD:Undefined`). Por eso la
 *      página se carga desde `music.youtube.com/robots.txt`: 186 bytes, y lo
 *      que importa es que el documento tenga un origen https de verdad.
 *   2. **Evaluar.** Descifrar la URL de una canción exige correr un pedazo del
 *      reproductor de YouTube. La app corre en Hermes, que no tiene `eval` ni
 *      `new Function` — ahí se moría cualquier intento de resolver desde React
 *      Native puro.
 *
 * Lo que **no** hace es red: las llamadas a InnerTube y la descarga salen por
 * el `fetch` nativo de React Native, que no tiene CORS. El WebView solo
 * atestigua y evalúa, y lo que cruza el puente son strings y objetos planos.
 *
 * El contrato de `evaluar` es el mismo de `Platform.shim.eval` de youtubei.js
 * —entra `{ output, env }`, sale un objeto plano— y eso no es casualidad: es
 * exactamente lo que hace que se pueda delegar por mensajes.
 */

/** La marca con la que el motor avisa que terminó de cargar. */
export const LISTO = 'motor:listo'

/**
 * Cuánto vale un integrity token antes de rehacer el desafío.
 *
 * Google da ~12 h. El margen es para no usar uno recién muerto a mitad de una
 * canción.
 */
const TTL_POR_DEFECTO_S = 12 * 60 * 60
const MARGEN_MS = 5 * 60 * 1000

/**
 * La página, como un solo string para `injectedJavaScript`.
 *
 * Se arma en un template y no en un archivo `.js` aparte porque Metro empaqueta
 * para React Native, no para el documento del WebView; un string es lo único
 * que cruza sin pelearse con el bundler. `bgutils.generado.ts` lo produce
 * `scripts/armar-motor.mjs`.
 */
export const MOTOR_JS = `(function () {
  if (window.__motor) return true;
  ${BGUTILS_JS}

  var REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
  var acunador = null;

  function avisar(mensaje) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(mensaje));
  }

  async function conseguirAcunador() {
    if (acunador && Date.now() < acunador.vence) return acunador.minter;

    var desafio = await getChallenge({ requestKey: REQUEST_KEY, fetchFunction: fetch });
    var interprete = desafio.interpreterJavascript
      && desafio.interpreterJavascript.privateDoNotAccessOrElseSafeScriptWrappedValue;
    if (!interprete) throw new Error('BotGuard no devolvió intérprete');

    /* Como <script> y no con new Function: la VM se registra sola en window
       bajo challenge.globalName y espera ámbito de documento. */
    var etiqueta = desafio.interpreterHash || 'botguard';
    if (!document.getElementById(etiqueta)) {
      var s = document.createElement('script');
      s.id = etiqueta;
      s.textContent = interprete;
      document.head.appendChild(s);
    }

    var bg = await BotGuardClient.create({
      program: desafio.program,
      globalName: desafio.globalName,
      globalObject: window
    });

    var señales = [];
    var foto = await bg.snapshot({ webPoSignalOutput: señales });

    var res = await fetch(buildURL('GenerateIT'), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify([REQUEST_KEY, foto])
    });
    if (!res.ok) throw new Error('GenerateIT respondió ' + res.status);

    var cuerpo = await res.json();
    var integridad = cuerpo[0], ttl = cuerpo[1], reserva = cuerpo[3];
    if (!integridad) throw new Error('sin integrity token');
    /* El cuarto elemento es el «no te creo» de Google: devuelve un token que
       acuña PO tokens de aspecto normal y que rebotan río abajo. Se avisa, y
       quien llama decide si vale la pena intentar igual. */
    if (reserva) avisar({ tipo: 'atestacion-degradada' });

    var minter = await WebPoMinter.create({ integrityToken: integridad }, señales);
    acunador = {
      minter: minter,
      vence: Date.now() + Math.max(60000, (ttl || ${TTL_POR_DEFECTO_S}) * 1000 - ${MARGEN_MS})
    };
    return minter;
  }

  var metodos = {
    acunar: async function (binding) {
      var minter = await conseguirAcunador();
      return minter.mintAsWebsafeString(binding);
    },
    /* El contrato de Platform.shim.eval: el script emitido usa \`return\` de
       nivel superior, así que se evalúa como cuerpo de función. */
    evaluar: function (salida, entorno) {
      var nombres = Object.keys(entorno);
      var fabrica = new Function(nombres.join(','), salida);
      return fabrica.apply(null, nombres.map(function (n) { return entorno[n]; }));
    }
  };

  window.__motor = {
    correr: function (id, metodo, args) {
      Promise.resolve()
        .then(function () { return metodos[metodo].apply(null, args); })
        .then(function (valor) { avisar({ tipo: 'respuesta', id: id, valor: valor }); })
        .catch(function (e) { avisar({ tipo: 'respuesta', id: id, error: String(e && e.message || e) }); });
    }
  };

  avisar({ tipo: '${LISTO}', ua: navigator.userAgent, bgutils: '${BGUTILS_VERSION}' });
  return true;
})();
true;`
