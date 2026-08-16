import { Pressable, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ANCHO_HOJA, Hoja, useHojaModal } from '../../src/ui/Hoja'
import { usePiso } from '../../src/state/shell'
import { ICON_COLOR, IconMusic, IconUsers } from '../../src/ui/icons'

/**
 * Qué clase de lista querés: la primera hoja de crear una.
 *
 * Antes el «+» creaba «Mi lista #N» y te dejaba adentro, sin preguntar nada. Era
 * lo que hacía Spotify entonces y estaba bien mientras hubo una sola clase de
 * lista — el nombre se arregla después, y ahorrarse un formulario para llegar
 * antes al buscador es una buena idea.
 *
 * Deja de estarlo cuando hay dos clases que **no se pueden cambiar de una a la
 * otra sin pensarlo**: una lista colaborativa se comparte con gente y esa
 * decisión no es un nombre, es a quién dejás entrar. Preguntar una vez al
 * principio cuesta un toque; adivinar mal cuesta una lista que alguien más
 * está editando.
 *
 * Dos opciones y no cinco: mezclas y fusiones no existen todavía, y el Jam vive
 * en el reproductor —es escuchar juntos ahora, no guardar algo juntos—, así que
 * ponerlo acá lo escondería en el menú equivocado.
 */
export default function NuevaLista() {
  const router = useRouter()
  const piso = usePiso(24)
  /* En el modal el reproductor queda afuera: la reserva del piso sobra. */
  const modal = useHojaModal()
  /* El nombre sugerido lo calcula la pantalla principal, que ya tiene la
     biblioteca en memoria: pedirla de nuevo acá sería un viaje a la red para
     escribir un número. */
  const { sugerido } = useLocalSearchParams<{ sugerido?: string }>()

  const elegir = (colaborativa: boolean) => {
    /*
     * `replace` y no `push`: nombrar es el paso siguiente de esto mismo, no una
     * hoja arriba. Con `push`, cerrar la de nombre te devolvería acá a elegir de
     * nuevo — y ya elegiste.
     */
    router.replace({
      pathname: '/lista/nombre',
      params: { sugerido: sugerido ?? '', colaborativa: colaborativa ? '1' : '' },
    })
  }

  return (
    <Hoja medida="contenido">
      {/* ScrollView y no View, como `jam/opciones`: es la forma con la que el
          `fitToContents` de iOS mide bien la hoja en esta app. */}
      <ScrollView
        /* `flexGrow` y no `flex-1`: dentro del modal compacto —que mide su
           contenido— un flex con base cero colapsa; con grow, en la sábana
           llena el hueco y en el modal mide lo que hay. */
        className="bg-background"
        style={{ flexGrow: 1 }}
        contentContainerClassName="px-3 pt-6"
        /*
         * El ancho se corta en el escritorio. En el teléfono la hoja mide lo
         * que mide la pantalla y esto no hace nada, pero en una ventana de 1280
         * las dos filas se estiraban de borde a borde: el título quedaba a la
         * izquierda del todo y el texto a un metro, leyéndose como dos cosas
         * sueltas en vez de una fila. Mismo recurso que `MAX_W` en `lista/[id]`.
         */
        contentContainerStyle={{
          paddingBottom: modal ? 16 : piso,
          maxWidth: ANCHO_HOJA,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <Opcion
          icono={<IconMusic size={20} color={ICON_COLOR.foreground} />}
          titulo="Lista"
          detalle="Armá una lista con las canciones que quieras"
          onPress={() => elegir(false)}
        />
        <Opcion
          icono={<IconUsers size={20} color={ICON_COLOR.foreground} />}
          titulo="Lista colaborativa"
          detalle="Armala con tus personas favoritas: todos suman canciones"
          onPress={() => elegir(true)}
        />
      </ScrollView>
    </Hoja>
  )
}

/**
 * Una opción de la hoja.
 *
 * El ícono va en un círculo `muted` y no suelto sobre el fondo: es lo que le da
 * a las dos filas el mismo ancho de arranque para el texto, y sin él los
 * títulos quedarían alineados con íconos de distinto ancho — la fila se lee
 * torcida aunque el texto esté derecho.
 */
function Opcion({
  icono,
  titulo,
  detalle,
  onPress,
}: {
  icono: React.ReactNode
  titulo: string
  detalle: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titulo}
      onPress={onPress}
      className="flex-row items-center gap-4 rounded-2xl px-3 py-3.5 active:bg-muted"
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-muted">{icono}</View>
      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-[15px] font-semibold">{titulo}</Text>
        <Text className="text-muted-foreground text-[12px] leading-4" numberOfLines={2}>
          {detalle}
        </Text>
      </View>
    </Pressable>
  )
}
