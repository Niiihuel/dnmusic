import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const jsx = (type, props) => ({ type, props })
const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText

function moduleAt(path, dependencies = {}) {
  const exports = {}
  new Function('exports', 'require', transpile(readFileSync(path, 'utf8')))(exports, (name) => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name in dependencies) return dependencies[name]
    throw Error(`Falta el doble de ${name}`)
  })
  return exports
}

const nodos = (n) =>
  !n || typeof n !== 'object'
    ? []
    : Array.isArray(n)
      ? n.flatMap(nodos)
      : [n, ...nodos(n.props?.children)]

const geometria = moduleAt('src/ui/tarjetaHistoria.ts')

test('la tarjeta es una historia de 9:16 con todo apoyado en el mismo margen', () => {
  assert.equal(geometria.ANCHO / geometria.ALTO, 1080 / 1920)
  // La tapa define el margen, y el texto y el código se apoyan en el mismo borde.
  assert.equal(geometria.TAPA, geometria.ANCHO - geometria.MARGEN * 2)
  assert.ok(geometria.TITULO_Y > geometria.TAPA_Y + geometria.TAPA, 'el texto va debajo de la tapa')
  assert.equal(geometria.QR_Y + geometria.QR_LADO + geometria.MARGEN, geometria.ALTO)
  assert.ok(
    geometria.TITULO_Y + geometria.TITULO_INTERLINEA * 2 + geometria.ARTISTA_TAM < geometria.QR_Y,
    'dos líneas de título y el artista tienen que entrar sin pisar el código',
  )
})

test('no queda nada de la tarjeta vieja: ni versalitas gritadas ni barra falsa', () => {
  const fuentes = [
    readFileSync('src/ui/tarjetaHistoria.ts', 'utf8'),
    readFileSync('src/ui/TarjetaHistoria.tsx', 'utf8'),
    readFileSync('src/ui/CompartirHistoria.tsx', 'utf8'),
  ]
  for (const fuente of fuentes) {
    // El rótulo iba dentro de comillas; en los comentarios sí se lo puede nombrar.
    assert.doesNotMatch(fuente, /['"`]AHORA SUENA['"`]/)
    assert.doesNotMatch(fuente, /\bAVANCE\b/, 'la barra de reproducción inventada se fue')
  }
})

test('el código escaneable sale del link de la canción y es una matriz cuadrada', () => {
  const { matrizQR } = moduleAt('src/lib/codigoQR.ts', { qrcode: require('qrcode') })
  const m = matrizQR('https://dnmusic-app.vercel.app/cancion/abc123')
  assert.ok(m && m.lado >= 21)
  assert.equal(m.puntos.length, m.lado * m.lado)
  assert.ok(m.puntos.some(Boolean) && m.puntos.some((p) => !p))
  // Un texto imposible no puede tirar: la tarjeta se dibuja igual, sin código.
  assert.equal(matrizQR(''), null)
})

/**
 * La hoja de compartir.
 *
 * Lo que hay que sostener es que la previa **sea la misma tarjeta** que se
 * manda: si algún día se dibujara aparte, la previa empezaría a mentir.
 */
function hoja(track) {
  const componentes = Object.fromEntries(
    ['View', 'Text', 'Hoja', 'EncabezadoHoja', 'BotonHoja', 'GrupoAjustes', 'FilaAccion', 'Vacio', 'TarjetaHistoria'].map(
      (k) => [k, k],
    ),
  )
  const estados = []
  let cursor = 0
  const compartidos = []
  const exports = moduleAt('app/compartir.tsx', {
    react: {
      useState(inicial) {
        const i = cursor++
        if (!(i in estados)) estados[i] = typeof inicial === 'function' ? inicial() : inicial
        return [estados[i], (v) => { estados[i] = typeof v === 'function' ? v(estados[i]) : v }]
      },
    },
    'react-native': { Text: 'Text', View: 'View', useWindowDimensions: () => ({ height: 900 }) },
    'expo-router': { useRouter: () => ({ push: () => {} }) },
    '../src/lib/volver': { volver: () => {} },
    '../src/lib/compartir': {
      linkDe: (que, id) => `https://dnmusic-app.vercel.app/${que}/${id}`,
      compartirCancion: async (t) => compartidos.push(['link', t.videoId]),
    },
    '../src/lib/portapapeles': { copiarAlPortapapeles: async () => true },
    '../src/lib/colorPortada': { useColorPortada: () => '#334455' },
    '../src/state/compartir': { cancionACompartir: () => track, soltarCancionACompartir: () => {} },
    '../src/state/aviso': { avisar: () => {} },
    '../src/ui/Hoja': { Hoja: 'Hoja', usePisoHoja: () => 24 },
    '../src/ui/EncabezadoHoja': { BotonHoja: 'BotonHoja', EncabezadoHoja: 'EncabezadoHoja' },
    '../src/ui/Ajustes': { FilaAccion: 'FilaAccion', GrupoAjustes: 'GrupoAjustes' },
    '../src/ui/Vacio': { Vacio: 'Vacio' },
    '../src/ui/icons': { ICON_COLOR: { muted: '#aaa' }, IconCopiar: 'C', IconImage: 'I', IconMusic: 'M', IconShare: 'S' },
    '../src/ui/TarjetaHistoria': { TarjetaHistoria: 'TarjetaHistoria' },
    '../src/ui/CompartirHistoria': {
      compartirHistoria: (t) => compartidos.push(['historia', t.videoId]),
      datosDeTarjeta: (t, tinte) => ({ titulo: t.title, artista: t.artist, arte: null, enlace: 'x', tinte }),
    },
    '../src/ui/tarjetaHistoria': geometria,
    '../src/ui/Glass': { ES_WEB: false },
    ...componentes,
  })
  return {
    compartidos,
    render() {
      cursor = 0
      return nodos(exports.default({}))
    },
  }
}

const cancion = { id: 'a', videoId: 'v1', title: 'No One Noticed', artist: 'The Marías', artworkUrl: 'u', artworkPath: null, durationMs: 237000 }

test('la hoja muestra la misma tarjeta que se manda y ofrece las tres salidas', () => {
  const h = hoja(cancion)
  const ui = h.render()
  assert.equal(ui.filter((n) => n.type === 'TarjetaHistoria').length, 1, 'la previa es la tarjeta de verdad')
  const filas = ui.filter((n) => n.type === 'FilaAccion').map((n) => n.props.rotulo)
  assert.deepEqual(filas, ['Compartir la historia', 'Compartir el link', 'Copiar el link'])
})

test('la previa se achica con transform: la tarjeta conserva su tamaño real', () => {
  const h = hoja(cancion)
  const caja = h.render().find((n) => n.props?.style?.transform)
  assert.equal(caja.props.style.width, geometria.ANCHO)
  assert.equal(caja.props.style.height, geometria.ALTO)
  const escala = caja.props.style.transform[0].scale
  assert.ok(escala > 0 && escala < 1)
})

test('cada salida hace lo suyo y cierra; sin canción, la hoja lo dice', () => {
  const h = hoja(cancion)
  const fila = (rotulo) => h.render().find((n) => n.type === 'FilaAccion' && n.props.rotulo === rotulo)
  fila('Compartir la historia').props.onPress()
  assert.deepEqual(h.compartidos, [['historia', 'v1']])

  const vacia = hoja(null)
  const ui = vacia.render()
  assert.equal(ui.filter((n) => n.type === 'FilaAccion').length, 0)
  assert.ok(ui.some((n) => n.type === 'Vacio'))
})
