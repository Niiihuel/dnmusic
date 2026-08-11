import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Panel } from '../src/ui/Panel'
import { FilaInterruptor, GrupoAjustes } from '../src/ui/Ajustes'
import { ICON_COLOR, IconBack, IconDisc, IconShuffle } from '../src/ui/icons'
import { setAutoplay, useAjustes } from '../src/state/ajustes'
import { toggleShuffle, usePlaybackState } from '../src/state/playback'
import { usePiso } from '../src/state/shell'
import { volver } from '../src/lib/volver'

/** Debajo de esto la app es pestañas y el contenido va de borde a borde. */
const SHELL_PX = 780
/** Tope del contenido en escritorio, como en el resto de las pantallas. */
const CAP = 672

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
  const { shuffle } = usePlaybackState()
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
                <FilaInterruptor
                  rotulo="Seguir al terminar la lista"
                  detalle="Cuando se acaban tus canciones, sigue con recomendaciones a partir de lo que más escuchás."
                  icono={<IconDisc size={17} color={ICON_COLOR.muted} />}
                  activo={autoplay}
                  onCambiar={setAutoplay}
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
