import { useEffect, useState } from 'react'
import { Pressable, Text, useWindowDimensions, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Panel } from '../../../src/ui/Panel'
import { BuscadorFlotante } from '../../../src/ui/FloatingSearch'
import { SearchDropdown } from '../../../src/ui/SearchDropdown'
import { ICON_COLOR, IconBack, IconMusic } from '../../../src/ui/icons'
import { searchMusic, type TrackResult } from '../../../src/services/music'
import { useKeyboardH, usePiso } from '../../../src/state/shell'
import {
  abrirBusqueda,
  cerrarBusqueda,
  registerBusquedaHandler,
  setTermino,
  useTermino,
} from '../../../src/state/busqueda'
import { proponerRecorte } from '../../../src/state/recorte'
import { volver } from '../../../src/lib/volver'

const DEBOUNCE_MS = 250
/** Alto del buscador flotante más su respiro. */
const ALTO_BUSCADOR = 68
/** Debajo de esto la app es pestañas y la cáscara dibuja el campo. Ver `Panel`. */
const SHELL_PX = 780
/** Tope de los resultados en escritorio, igual que en el editor de fragmento. */
const CAP = 672

/**
 * Buscar música para el perfil.
 *
 * Es el buscador de siempre, con **otro destino**: tocar un resultado lo fija
 * como vitrina en vez de reproducirlo. Vive acá y no en el flujo de mensajes
 * porque son dos intenciones distintas — antes se colaba un «fijar en mi
 * perfil» en la pantalla de adjuntar una canción a un mensaje, que es de las
 * cosas que hacen leer dos botones para hacer uno.
 *
 * Fijar la canción entera es un toque. Para fijar solo un pedazo está el botón
 * de recortar, que abre el mismo editor de fragmento con el destino puesto en el
 * perfil.
 */
export default function BuscarParaPerfil() {
  const router = useRouter()
  const piso = usePiso(ALTO_BUSCADOR)
  const teclado = useKeyboardH()

  /*
   * Quién dibuja el campo depende del ancho, y **tiene que depender**.
   *
   * En el teléfono lo dibuja la cáscara: tener acá un `BuscadorFlotante` propio
   * mientras el layout seguía sacando el reproductor y las pestañas dejaba tres
   * barras apiladas, con el campo apoyado sobre la altura del reproductor en vez
   * de sobre el teclado.
   *
   * Pero la cáscara solo lo dibuja **si está flotante** —`app/_layout.tsx` mete
   * `SearchRow` detrás de `buscando && flotante`—, y en escritorio `flotante` es
   * falso. O sea que acá, en PC, no lo dibujaba nadie: la pantalla abría con el
   * cartel de «buscá algo para fijar» y ningún lugar donde escribir. Se entraba
   * a agregar música y no se podía agregar música.
   *
   * Con el mismo umbral que usa el layout, en escritorio el campo lo pone esta
   * pantalla, exactamente como ya lo hacía el editor de fragmento —que por eso
   * nunca tuvo el problema—. El término sigue viviendo en `state/busqueda` en
   * los dos casos, así que el resto de la pantalla no se entera de cuál de los
   * dos lo dibujó.
   */
  const suelto = useWindowDimensions().width < SHELL_PX
  const termino = useTermino()
  /* Solo lo usa el campo propio de escritorio: quién tiene el cursor. */
  const [escribiendo, setEscribiendo] = useState(false)
  /*
   * Los resultados se guardan **junto al término que los produjo**.
   *
   * Así «esto no es de lo que estás escribiendo» sale solo, sin tener que
   * vaciarlos desde un efecto — y una respuesta que llega tarde nunca se muestra
   * bajo otra búsqueda. Es el mismo criterio que el álbum, el artista y el
   * perfil ajeno.
   */
  const [hallado, setHallado] = useState<{ termino: string; tracks: TrackResult[] } | null>(null)
  const resultados = hallado?.termino === termino.trim() ? hallado.tracks : []
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* Se entra a buscar: el campo se abre al montar y se cierra al salir. */
  useEffect(() => {
    abrirBusqueda('Buscá una canción para fijar')
    registerBusquedaHandler(() => setError(null))
    return () => {
      registerBusquedaHandler(null)
      cerrarBusqueda()
    }
  }, [])

  useEffect(() => {
    const t = termino.trim()
    if (!t) return
    const controller = new AbortController()
    /* El «cargando» se prende adentro del temporizador y no acá: encenderlo en
       el cuerpo del efecto es un cambio de estado sincrónico que dispara otro
       dibujado al pedo, y además mostraría el esqueleto durante el rebote de
       las teclas, antes de que haya siquiera una consulta en curso. */
    const timer = setTimeout(() => {
      setCargando(true)
      searchMusic(t, controller.signal)
        .then(({ tracks }) => {
          setHallado({ termino: t, tracks })
          setError(tracks.length ? null : 'No encontré esa canción.')
          setCargando(false)
        })
        .catch((causa: unknown) => {
          if ((causa as Error).name === 'AbortError') return
          setError('No se pudo buscar.')
          setCargando(false)
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [termino])

  return (
    /* El negro puro es el de la ventana en escritorio, donde los paneles
       flotan; en el teléfono el fondo es el mismo del contenido. Sin el borde de
       abajo cuando el campo va acá: ese margen lo pone él. Ver `app/song.tsx`. */
    <SafeAreaView
      className={`flex-1 ${suelto ? 'bg-background' : 'bg-canvas'}`}
      edges={['top']}
    >
      <View className={`min-h-0 flex-1 ${suelto ? '' : 'gap-2 p-2'}`}>
        <View className="flex-row items-center gap-3 px-3 py-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={() => volver(router, '/profile/editar')}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          >
            <IconBack size={19} color={ICON_COLOR.foreground} />
          </Pressable>
          <Text className="text-foreground text-[15px] font-semibold">Agregar música</Text>
        </View>

        <Panel className="flex-1">
          {/*
           * Los resultados se topan y se centran.
           *
           * Es el mismo `max-w-2xl` del editor de fragmento. Sin tope, cada fila
           * se estiraba a todo el ancho del panel y la carátula quedaba a un
           * metro del título: una lista de búsqueda no mejora por ser más ancha.
           */}
          <View className={`min-h-0 flex-1 items-center ${suelto ? '' : 'p-5'}`}>
            <View className="min-h-0 w-full flex-1" style={{ maxWidth: suelto ? undefined : CAP }}>
              {termino.trim() ? (
                <SearchDropdown
                  visible
                  embedded
                  /* Este buscador elige, no reproduce: la que está sonando
                     también se tiene que poder fijar — es el caso más común. */
                  alwaysSelect
                  loading={cargando}
                  results={resultados}
                  error={error}
                  /*
                   * Tocar la fila —en cualquier lado— abre el recorte.
                   *
                   * Antes la fila fijaba la canción entera y el recorte estaba
                   * detrás de un «+» chico contra el borde derecho. Eran dos
                   * destinos distintos en la misma fila, y el más completo era
                   * el más difícil de acertar: en el teléfono el «+» es un
                   * blanco de 44px pegado al margen, y el gesto natural sobre un
                   * resultado es tocarlo en el medio.
                   *
                   * Fijar la canción entera no se pierde: es «Canción completa»
                   * en el selector de largo del recorte, que ya existía. O sea
                   * que el camino largo pasó a ser un toque más, y el corto dejó
                   * de necesitar puntería.
                   */
                  onSelect={(track) => {
                    proponerRecorte(track)
                    router.push('/song?destino=perfil')
                  }}
                />
              ) : (
                <View
                  className="flex-1 items-center justify-center gap-3 px-10"
                  style={{ paddingBottom: piso + teclado }}
                >
                  <IconMusic size={28} color={ICON_COLOR.muted} />
                  <Text className="text-foreground text-center text-[17px] font-semibold">
                    Buscá algo para fijar
                  </Text>
                  {/* El botón de «recortar un fragmento» que estaba acá se fue
                      con el «+»: ahora tocar cualquier resultado lleva
                      exactamente ahí, así que era una segunda puerta al mismo
                      lugar puesta donde todavía no hay nada que elegir. */}
                  <Text className="text-muted-foreground text-center text-[13px] leading-5">
                    Tocá un resultado y elegís qué parte va en tu perfil.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Panel>
      </View>

      {/* El campo de escritorio, hermano de todo lo demás y no hijo del panel:
          adentro se posicionaría contra el borde de *ese* contenedor y se le
          sumarían los márgenes. Es la misma razón por la que está acá afuera en
          el editor de fragmento. */}
      {suelto ? null : (
        <BuscadorFlotante
          value={termino}
          onChangeText={setTermino}
          placeholder="Buscá una canción para fijar"
          loading={cargando}
          activo={escribiendo}
          onActivoChange={setEscribiendo}
          /* Esta pantalla existe para buscar: el campo no se va nunca. */
          siempre
        />
      )}
    </SafeAreaView>
  )
}
