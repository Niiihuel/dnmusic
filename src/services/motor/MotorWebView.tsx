import { useEffect, useRef } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import type { WebView, WebViewMessageEvent } from 'react-native-webview'
import { LISTO, MOTOR_JS } from './pagina'
import { fijarUA } from './salida'

/**
 * El WebView invisible que atestigua y evalúa por la app.
 *
 * Es un componente por una razón sola: `react-native-webview` necesita estar
 * montado en el árbol para existir. Todo lo demás —quién le pide qué, y las
 * promesas que esperan respuesta— vive en el módulo, fuera de React, para que
 * cualquier parte de la app pueda llamar a `acunar()` sin recibirlo por props
 * ni por contexto. Mismo criterio que el resto del estado de la app.
 *
 * Se monta una sola vez, en la raíz, y se queda: rehacer el WebView tiraría el
 * integrity token de BotGuard, que cuesta unos segundos y vale doce horas.
 *
 * En web no existe. Ahí la app corre *dentro* de un navegador con CORS, que es
 * justamente lo que impide hablar con InnerTube desde una página; el navegador
 * sigue usando el `/resolve` del servidor.
 */

/*
 * `react-native-webview` se carga **a mano y sin reventar si no está**.
 *
 * Es una dependencia nativa nueva, y este archivo lo alcanza el layout: un
 * `import` normal convierte «esta versión no trae el motor» en «la app no
 * abre» —pantalla roja al arrancar— en cualquier development client o
 * TestFlight compilado antes de que esto existiera. Es el mismo motivo, y el
 * mismo patrón, que `src/state/descargas.ts`.
 *
 * El `require` va con la ruta escrita literal: Metro resuelve leyendo el
 * código, y con un nombre calculado no empaquetaría el módulo.
 */
type ModuloWebView = typeof import('react-native-webview')
let modWebView: ModuloWebView | null = null

if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modWebView = require('react-native-webview') as ModuloWebView
  } catch {
    /* Binario viejo. La app arranca igual y el teléfono sigue resolviendo por
       el servidor, como antes de que esto existiera. */
    modWebView = null
  }
}

/**
 * De dónde carga la página.
 *
 * 186 bytes de texto plano, pero con **origen https de verdad**, que es lo
 * único que importa: está medido que desde un origen opaco —un HTML suelto sin
 * sitio— BotGuard no arranca. Cargar `music.youtube.com` entero daría el mismo
 * origen y traería la aplicación completa de YouTube Music a un WebView oculto,
 * que en un teléfono es batería y datos por nada.
 */
const PAGINA = 'https://music.youtube.com/robots.txt'

/** Cuánto se espera a que el WebView cargue antes de darlo por perdido. */
const ESPERA_MS = 20_000

/**
 * Cuánto se espera una respuesta del WebView.
 *
 * Sin esto, un error que se comiera el `catch` de adentro deja la promesa
 * colgada **para siempre**, y como este camino corre después de que el servidor
 * ya falló, lo que ve quien tocó play es una ruedita que no termina nunca. El
 * desafío de BotGuard es lo más lento que puede pasar acá y tarda segundos;
 * cuarenta es un techo, no una expectativa.
 */
const RESPUESTA_MS = 40_000

type Pendiente = {
  resolver: (valor: unknown) => void
  rechazar: (razon: Error) => void
}

let webview: WebView | null = null
let siguienteId = 1
const pendientes = new Map<number, Pendiente>()

let listo = false
let avisarListo: (() => void) | null = null
let esperandoListo: Promise<void> | null = null

/** Se resuelve cuando el motor cargó; rechaza si no cargó a tiempo. */
function cuandoEsteListo(): Promise<void> {
  if (listo) return Promise.resolve()
  if (!esperandoListo) {
    esperandoListo = new Promise<void>((resolver, rechazar) => {
      avisarListo = resolver
      setTimeout(() => {
        /* Se suelta la promesa vencida además de rechazarla: una promesa
           rechazada queda rechazada, así que dejarla cacheada convertía «el
           WebView tardó más de la cuenta una vez» en «el motor no anda nunca
           más», incluso después de que cargara bien. */
        if (!listo) esperandoListo = null
        rechazar(new Error('el motor de a bordo no cargó'))
      }, ESPERA_MS)
    })
  }
  return esperandoListo
}

/** Si esta plataforma **y este binario** tienen motor de a bordo. */
export function hayMotor(): boolean {
  return modWebView !== null
}

/**
 * Le pide algo al WebView y espera la respuesta.
 *
 * Va por `injectJavaScript` y vuelve por `postMessage`: es el único puente que
 * hay, y alcanza porque lo que cruza son strings y objetos planos. Los
 * argumentos viajan serializados —`JSON.stringify` dos veces, una para el
 * mensaje y otra para meterlo en el código inyectado— porque lo que se inyecta
 * es texto que el WebView evalúa.
 */
function pedir<T>(metodo: 'acunar' | 'evaluar', args: unknown[]): Promise<T> {
  return cuandoEsteListo().then(
    () =>
      new Promise<T>((resolver, rechazar) => {
        const vista = webview
        if (!vista) return rechazar(new Error('el motor de a bordo no está montado'))
        const id = siguienteId++
        pendientes.set(id, { resolver: resolver as (v: unknown) => void, rechazar })
        setTimeout(() => {
          if (!pendientes.delete(id)) return
          rechazar(new Error(`el motor no contestó a ${metodo}`))
        }, RESPUESTA_MS)
        vista.injectJavaScript(
          `window.__motor.correr(${id}, ${JSON.stringify(metodo)}, ${JSON.stringify(args)});true;`,
        )
      }),
  )
}

/**
 * Un PO token atado a `binding` — el visitorData para el token de sesión, el
 * id del video para el de media. La distinción no es cosmética: con el de
 * sesión en la URL de media, googlevideo sirve 1 MB y después corta con 403.
 */
export function acunar(binding: string): Promise<string> {
  return pedir<string>('acunar', [binding])
}

/** El evaluador de JS que Hermes no tiene. Contrato de `Platform.shim.eval`. */
export function evaluar(
  salida: string,
  entorno: Record<string, string | number | boolean | null | undefined>,
): Promise<Record<string, unknown>> {
  return pedir<Record<string, unknown>>('evaluar', [salida, entorno])
}

export function MotorWebView() {
  const ref = useRef<WebView>(null)

  useEffect(() => {
    webview = ref.current
    return () => {
      webview = null
      listo = false
      esperandoListo = null
      /* Nadie va a contestar las que quedaron esperando. */
      for (const [, p] of pendientes) p.rechazar(new Error('el motor se desmontó'))
      pendientes.clear()
    }
  }, [])

  if (!modWebView) return null
  const Vista = modWebView.WebView

  const alRecibir = (evento: WebViewMessageEvent) => {
    let mensaje: {
      tipo?: string
      id?: number
      valor?: unknown
      error?: string
      ua?: string
      bgutils?: string
    }
    try {
      mensaje = JSON.parse(evento.nativeEvent.data)
    } catch {
      return
    }

    if (mensaje.tipo === LISTO) {
      /* El UA del WebView es el que BotGuard acaba de ver: desde acá, todo lo
         que salga por el fetch nativo tiene que decir lo mismo. */
      if (mensaje.ua) fijarUA(mensaje.ua)
      listo = true
      esperandoListo = null
      avisarListo?.()
      console.log(`[motor] listo (bgutils ${mensaje.bgutils})`)
      return
    }

    if (mensaje.tipo === 'atestacion-degradada') {
      console.warn('[motor] BotGuard no confió en este WebView: los PO tokens pueden no valer')
      return
    }

    if (mensaje.tipo === 'respuesta' && typeof mensaje.id === 'number') {
      const pendiente = pendientes.get(mensaje.id)
      if (!pendiente) return
      pendientes.delete(mensaje.id)
      if (mensaje.error) pendiente.rechazar(new Error(mensaje.error))
      else pendiente.resolver(mensaje.valor)
    }
  }

  return (
    <View style={estilos.escondido} pointerEvents="none">
      <Vista
        ref={ref}
        source={{ uri: PAGINA }}
        injectedJavaScript={MOTOR_JS}
        onMessage={alRecibir}
        onError={() => console.warn('[motor] el WebView no pudo cargar la página')}
        /* Nada de esto tiene que ver con mostrar algo: es una pestaña de
           trabajo. Sin media, sin zoom, sin acordarse de nada entre sesiones. */
        mediaPlaybackRequiresUserAction
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
        incognito
        androidLayerType="software"
      />
    </View>
  )
}

const estilos = StyleSheet.create({
  /**
   * Fuera de pantalla y sin tamaño, pero **montado**.
   *
   * Con `display: none` iOS puede no llegar a ejecutar el JS de la página, que
   * es lo único que se le pide. Un punto de 1×1 corrido fuera de la vista
   * cuesta lo mismo visualmente y sí corre.
   */
  escondido: {
    position: 'absolute',
    width: 1,
    height: 1,
    left: -10,
    top: -10,
    opacity: 0,
  },
})
