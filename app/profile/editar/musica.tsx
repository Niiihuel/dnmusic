import { useEffect, useState } from 'react'
import { Pressable, Text, useWindowDimensions, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Panel } from '../../../src/ui/Panel'
import { SearchDropdown } from '../../../src/ui/SearchDropdown'
import { SearchField } from '../../../src/ui/SearchField'
import { ICON_COLOR, IconBack, IconMusic } from '../../../src/ui/icons'
import { resolveSong, searchMusic, type TrackResult } from '../../../src/services/music'
import { saveMyProfile } from '../../../src/services/profile'
import { setMyProfile } from '../../../src/state/session'
import { avisar } from '../../../src/state/aviso'
import { mensajeError } from '../../../src/lib/mensajeError'
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
   * Dos destinos, un buscador: sin nada, tocar un resultado abre el recorte
   * para fijarlo; con `destino=fondo`, tocar un resultado usa su tapa como
   * fondo del perfil. Es la misma acción que «Usar su tapa de fondo» de los
   * tres puntos — esta puerta existe para que la fila «Fondo» del editor lleve
   * a algún lado en vez de quedarse muda.
   */
  const { destino } = useLocalSearchParams<{ destino?: string }>()
  const paraFondo = destino === 'fondo'
  const [poniendoFondo, setPoniendoFondo] = useState(false)

  async function elegirFondo(track: TrackResult) {
    if (poniendoFondo) return
    setPoniendoFondo(true)
    try {
      /* Se resuelve para tener NUESTRA copia de la tapa: las URLs de YouTube
         vencen y un perfil no puede quedarse sin fondo por un enlace muerto. */
      const song = await resolveSong(track)
      if (!song.artworkPath) {
        avisar('Esa canción no tiene tapa para usar de fondo.', true)
        return
      }
      setMyProfile(await saveMyProfile({ bannerPath: song.artworkPath }))
      avisar('Fondo puesto')
      volver(router, '/profile/editar')
    } catch (e) {
      avisar(`No se pudo poner el fondo: ${mensajeError(e)}`, true)
    } finally {
      setPoniendoFondo(false)
    }
  }

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
    abrirBusqueda(paraFondo ? 'Buscá la canción de tu fondo' : 'Buscá una canción para fijar')
    registerBusquedaHandler(() => setError(null))
    return () => {
      registerBusquedaHandler(null)
      cerrarBusqueda()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <Text className="text-foreground text-[15px] font-semibold">
            {paraFondo ? 'Elegir fondo' : 'Agregar música'}
          </Text>
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
              {/*
               * En escritorio el campo va **arriba**, primero en la columna.
               *
               * Flotaba al pie porque esa es la receta del teléfono —el campo
               * cerca del pulgar, apoyado en el teclado— pero en una ventana
               * grande no hay pulgar: la mirada arranca arriba, y el campo al
               * fondo de la pantalla era lo último que se encontraba. En el
               * teléfono lo sigue dibujando la cáscara, abajo, como siempre.
               */}
              {suelto ? null : (
                <View className="pb-4">
                  <SearchField
                    value={termino}
                    onChangeText={setTermino}
                    placeholder={
                      paraFondo ? 'Buscá la canción de tu fondo' : 'Buscá una canción para fijar'
                    }
                    loading={cargando || poniendoFondo}
                    autoFocus
                  />
                </View>
              )}
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
                    if (paraFondo) {
                      void elegirFondo(track)
                      return
                    }
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
                    {paraFondo ? 'Buscá la canción de tu fondo' : 'Buscá algo para fijar'}
                  </Text>
                  {/* El botón de «recortar un fragmento» que estaba acá se fue
                      con el «+»: ahora tocar cualquier resultado lleva
                      exactamente ahí, así que era una segunda puerta al mismo
                      lugar puesta donde todavía no hay nada que elegir. */}
                  <Text className="text-muted-foreground text-center text-[13px] leading-5">
                    {paraFondo
                      ? 'Tocá un resultado y su tapa queda de fondo en tu perfil.'
                      : 'Tocá un resultado y elegís qué parte va en tu perfil.'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Panel>
      </View>

    </SafeAreaView>
  )
}
