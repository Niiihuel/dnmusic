import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Panel } from '../src/ui/Panel'
import { FilaAjuste, FilaInterruptor, GrupoAjustes } from '../src/ui/Ajustes'
import {
  ICON_COLOR,
  IconBack,
  IconClock,
  IconDisc,
  IconRepeat,
  IconShuffle,
  IconTrash,
} from '../src/ui/icons'
import { setAutoplay, useAjustes } from '../src/state/ajustes'
import {
  programarApagado,
  toggleRepetir,
  toggleShuffle,
  usePlaybackState,
} from '../src/state/playback'
import { borrarHistorial } from '../src/services/plays'
import { avisar } from '../src/state/aviso'
import { mensajeError } from '../src/lib/mensajeError'
import { usePiso } from '../src/state/shell'
import { volver } from '../src/lib/volver'

/** Debajo de esto la app es pestañas y el contenido va de borde a borde. */
const SHELL_PX = 780
/** Tope del contenido en escritorio, como en el resto de las pantallas. */
const CAP = 672
/** Los cortes del temporizador. El 0 es «no apagar». */
const MINUTOS = [0, 15, 30, 60]

/**
 * Los ajustes de la app.
 *
 * Existe como pantalla propia y no como un bloque más adentro del editor de
 * perfil porque son cosas distintas: el editor cambia **quién sos** —lo que ve
 * la otra persona— y esto cambia **cómo suena la app para vos**. Meterlos
 * juntos obligaba a bajar por tu foto y tu biografía para llegar a una perilla
 * de reproducción.
 *
 * Reusa `GrupoAjustes` y `FilaInterruptor`, que ya existían para el editor: la
 * forma de una lista de ajustes en esta app está resuelta y no hay razón para
 * inventar otra.
 */
export default function Ajustes() {
  const router = useRouter()
  const { autoplay } = useAjustes()
  const { shuffle, repetir, dormirMin } = usePlaybackState()

  /*
   * Borrar pide confirmación **en la propia fila**, con dos toques.
   *
   * No es un `Alert.alert` porque `react-native-web` no lo implementa: en la web
   * el diálogo no aparecería y el borrado no se dispararía nunca. Un patrón que
   * funciona en una plataforma y falla en silencio en la otra es peor que no
   * tener confirmación.
   *
   * El primer toque arma y cambia el texto; el segundo borra. Se desarma solo a
   * los cinco segundos, para que un toque olvidado no quede esperando a que
   * alguien roce la pantalla más tarde.
   */
  const [armado, setArmado] = useState(false)
  useEffect(() => {
    if (!armado) return
    const id = setTimeout(() => setArmado(false), 5000)
    return () => clearTimeout(id)
  }, [armado])

  async function borrar() {
    if (!armado) {
      setArmado(true)
      return
    }
    setArmado(false)
    try {
      await borrarHistorial()
      avisar('Historial borrado')
    } catch (e) {
      avisar(`No se pudo borrar: ${mensajeError(e)}`, true)
    }
  }
  const suelto = useWindowDimensions().width < SHELL_PX
  const piso = usePiso(24)

  return (
    <SafeAreaView
      className={`flex-1 ${suelto ? 'bg-background' : 'bg-canvas'}`}
      edges={suelto ? ['top'] : ['top', 'bottom']}
    >
      <View className={`min-h-0 flex-1 ${suelto ? '' : 'gap-2 p-2'}`}>
        <View className="flex-row items-center gap-3 px-3 py-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={() => volver(router, '/')}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          >
            <IconBack size={19} color={ICON_COLOR.foreground} />
          </Pressable>
          <Text className="text-foreground text-[15px] font-semibold">Ajustes</Text>
        </View>

        <Panel className="flex-1">
          <ScrollView
            contentContainerClassName={`items-center ${suelto ? 'px-3 pt-3' : 'p-5'}`}
            contentContainerStyle={{ paddingBottom: piso }}
          >
            <View className="w-full gap-6" style={{ maxWidth: suelto ? undefined : CAP }}>
              <GrupoAjustes titulo="Reproducción">
                {/*
                 * El aleatorio también vive acá, además de en el menú del
                 * reproductor. No es duplicar por duplicar: en el menú lo
                 * prendés para *esta* lista mientras la escuchás, y acá lo ves
                 * junto a lo demás cuando venís a configurar. Es el mismo
                 * estado, así que no pueden desincronizarse.
                 */}
                <FilaInterruptor
                  rotulo="Aleatorio"
                  detalle="Baraja la lista una vez y la recorre entera, sin repetir."
                  icono={<IconShuffle size={17} color={ICON_COLOR.muted} />}
                  activo={shuffle !== null}
                  onCambiar={toggleShuffle}
                />
                {/*
                 * Repetir rota entre tres estados, así que es una fila que
                 * muestra el actual y no un interruptor: un switch solo sabe
                 * decir sí o no, y acá «la lista» y «esta canción» son cosas
                 * distintas que no se pueden expresar con dos posiciones.
                 */}
                <FilaAjuste
                  rotulo="Repetir"
                  valor={
                    repetir === 'lista'
                      ? 'La lista entera'
                      : repetir === 'una'
                        ? 'Esta canción'
                        : ''
                  }
                  vacio="No repetir"
                  icono={<IconRepeat size={17} color={ICON_COLOR.muted} />}
                  onPress={toggleRepetir}
                />
                <FilaInterruptor
                  rotulo="Seguir al terminar la lista"
                  detalle="Cuando se acaban tus canciones, sigue con recomendaciones a partir de lo que más escuchás."
                  icono={<IconDisc size={17} color={ICON_COLOR.muted} />}
                  activo={autoplay}
                  onCambiar={setAutoplay}
                  ultima
                />
              </GrupoAjustes>

              {/*
               * El temporizador va en su propio grupo y no con lo de arriba.
               *
               * Los de arriba son preferencias: quedan puestas. Esto es una
               * acción con efecto en el tiempo —se arma, corre y se apaga sola—
               * y mezclarla entre interruptores haría creer que también se
               * queda.
               */}
              <GrupoAjustes titulo="Temporizador">
                {MINUTOS.map((m, i) => (
                  <FilaAjuste
                    key={m}
                    rotulo={m === 0 ? 'No apagar' : `${m} minutos`}
                    valor={
                      (m === 0 && dormirMin === null) || dormirMin === m
                        ? 'Puesto'
                        : ''
                    }
                    vacio=""
                    icono={<IconClock size={17} color={ICON_COLOR.muted} />}
                    onPress={() => programarApagado(m === 0 ? null : m)}
                    ultima={i === MINUTOS.length - 1}
                  />
                ))}
              </GrupoAjustes>

              {/*
               * Borrar el historial no tiene vuelta, así que pide dos toques.
               * Va al final y separado: es lo único de esta pantalla que borra
               * algo, y lo único que le importa a las recomendaciones.
               */}
              <GrupoAjustes titulo="Tus datos">
                <FilaAjuste
                  rotulo={armado ? 'Tocá de nuevo para confirmar' : 'Borrar historial de escucha'}
                  valor={armado ? 'Esto no se puede deshacer' : ''}
                  vacio="Las recomendaciones vuelven a empezar de cero"
                  icono={<IconTrash size={17} color={ICON_COLOR.muted} />}
                  onPress={() => void borrar()}
                  ultima
                />
              </GrupoAjustes>
            </View>
          </ScrollView>
        </Panel>
      </View>
    </SafeAreaView>
  )
}
