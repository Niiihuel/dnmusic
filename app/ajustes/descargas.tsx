import { FlatList, Image, Pressable, Text, useWindowDimensions, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Panel } from '../../src/ui/Panel'
import { GrupoAjustes, FilaInterruptor } from '../../src/ui/Ajustes'
import { FilaSostener } from '../../src/ui/Mantener'
import { artworkSource } from '../../src/lib/artwork'
import {
  ICON_COLOR,
  IconBack,
  IconClose,
  IconMusic,
  IconTrash,
  IconWifi,
} from '../../src/ui/icons'
import {
  borrarTodo,
  cuantasListas,
  cuantasPendientes,
  espacioUsado,
  formatoBytes,
  quitarDescarga,
  reanudarDescargas,
  useDescargas,
  type Descarga,
} from '../../src/state/descargas'
import { setSoloWifi, useAjustes } from '../../src/state/ajustes'
import { avisar } from '../../src/state/aviso'
import { usePiso } from '../../src/state/shell'
import { volver } from '../../src/lib/volver'

/** Debajo de esto la app es pestañas y el contenido va de borde a borde. */
const SHELL_PX = 780
/** Tope del contenido en escritorio, como en el resto de las pantallas. */
const CAP = 672

/**
 * Las descargas, una por una.
 *
 * Es la sub-pantalla que le faltaba a Ajustes: la fila del índice decía cuánto
 * ocupaban todas juntas y ofrecía borrarlas todas juntas — **verlas** no se
 * podía, y sin ver no se puede elegir. Acá está cada canción con su carátula,
 * su peso y su estado, y una cruz para sacar solo esa: recuperar espacio deja
 * de ser todo o nada.
 *
 * Acá tampoco se baja nada: eso se hace desde la lista o desde la canción, que
 * es donde uno está cuando decide que la quiere tener. Esta pantalla es el
 * inventario.
 *
 * Sacar una descarga no pide confirmación —volver a bajarla es un toque, es un
 * cambio de opinión, no una pérdida—; borrarlas **todas** sí se sostiene.
 */
export default function Descargas() {
  const router = useRouter()
  const { soloWifi } = useAjustes()
  const { items, esperandoWifi } = useDescargas()

  const bajadas = cuantasListas(items)
  const pendientes = cuantasPendientes(items)
  const ocupado = espacioUsado(items)
  /* Por título, para poder buscar con el ojo: el orden de bajada no le dice
     nada a quien vino a hacer lugar. */
  const lista = Object.values(items).sort((a, b) =>
    a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }),
  )

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
            accessibilityLabel="Volver a Ajustes"
            onPress={() => volver(router, '/ajustes')}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          >
            <IconBack size={19} color={ICON_COLOR.foreground} />
          </Pressable>
          <View className="min-w-0 flex-1">
            <Text className="text-foreground text-[15px] font-semibold">Descargas</Text>
          </View>
          {bajadas > 0 ? (
            <Text className="text-muted-foreground text-[13px]">
              {bajadas} {bajadas === 1 ? 'canción' : 'canciones'} · {formatoBytes(ocupado)}
            </Text>
          ) : null}
        </View>

        <Panel className="flex-1">
          <FlatList
            data={lista}
            keyExtractor={(d) => d.audioPath}
            contentContainerClassName={`${suelto ? 'px-3 pt-3' : 'p-5'}`}
            contentContainerStyle={{ paddingBottom: piso }}
            ListHeaderComponent={
              <View className="items-center pb-6">
                <View className="w-full" style={{ maxWidth: suelto ? undefined : CAP }}>
                  <GrupoAjustes>
                    {/*
                     * El detalle cambia según lo que esté pasando de verdad.
                     *
                     * Con la cola frenada por datos móviles, un texto fijo
                     * dejaría la app pareciendo colgada: canciones marcadas que
                     * no bajan nunca y ninguna explicación en pantalla. Acá dice
                     * qué está esperando y el interruptor es lo que lo destraba.
                     */}
                    <FilaInterruptor
                      rotulo="Descargar solo con Wi-Fi"
                      detalle={
                        esperandoWifi
                          ? `${pendientes} ${pendientes === 1 ? 'canción esperando' : 'canciones esperando'} a que haya Wi-Fi. Apagalo para bajarlas con datos.`
                          : 'Un disco son decenas de megas. Apagalo si tenés datos de sobra.'
                      }
                      icono={<IconWifi size={17} color={ICON_COLOR.muted} />}
                      activo={soloWifi}
                      onCambiar={(v) => {
                        setSoloWifi(v)
                        /* Apagarlo tiene que destrabar lo que quedó esperando: el
                           bucle de descargas se cortó y nadie lo despierta solo. */
                        if (!v) reanudarDescargas()
                      }}
                      ultima
                    />
                  </GrupoAjustes>
                </View>
              </View>
            }
            renderItem={({ item }) => (
              <View className="w-full items-center">
                <View className="w-full" style={{ maxWidth: suelto ? undefined : CAP }}>
                  <Fila item={item} esperandoWifi={esperandoWifi} />
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View className="items-center gap-3 px-8 py-12">
                <IconMusic size={22} color={ICON_COLOR.muted} />
                <Text className="text-muted-foreground text-center text-[13px] leading-5">
                  Nada bajado todavía. Se descarga desde una lista o desde la
                  canción, con «Descargar» en su menú.
                </Text>
              </View>
            }
            ListFooterComponent={
              bajadas > 0 ? (
                <View className="items-center pt-8">
                  <View className="w-full" style={{ maxWidth: suelto ? undefined : CAP }}>
                    <GrupoAjustes>
                      <FilaSostener
                        rotulo="Borrar todas las descargas"
                        detalle={`Libera ${formatoBytes(ocupado)}. Se pueden volver a bajar.`}
                        icono={<IconTrash size={17} color={ICON_COLOR.muted} />}
                        onCompletar={() => {
                          borrarTodo()
                          avisar('Descargas borradas')
                        }}
                        ultima
                      />
                    </GrupoAjustes>
                  </View>
                </View>
              ) : null
            }
          />
        </Panel>
      </View>
    </SafeAreaView>
  )
}

/**
 * Una canción bajada: carátula, título y quién canta, y a la derecha su peso
 * —o en qué anda, si todavía viene en camino— con la cruz para sacarla.
 *
 * La carátula sale de `artworkSource`, que prefiere la copia local: es la
 * misma imagen que ya está en el teléfono, así que esta lista se dibuja sin
 * pedirle nada a la red — como corresponde a una pantalla que existe para el
 * modo avión.
 */
function Fila({ item, esperandoWifi }: { item: Descarga; esperandoWifi: boolean }) {
  const arte = artworkSource(item.artworkPath, null, 96)
  const estado =
    item.estado === 'lista'
      ? formatoBytes(item.bytes)
      : item.estado === 'bajando'
        ? `${Math.round(item.progreso * 100)} %`
        : esperandoWifi
          ? 'Esperando Wi-Fi'
          : 'En cola'

  return (
    <View className="flex-row items-center gap-3 rounded-lg py-1.5 pr-1">
      <View className="h-11 w-11 items-center justify-center overflow-hidden rounded bg-muted">
        {arte ? (
          <Image source={{ uri: arte }} className="h-11 w-11" />
        ) : (
          <IconMusic size={16} color={ICON_COLOR.muted} />
        )}
      </View>

      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-[14px]" numberOfLines={1}>
          {item.title}
        </Text>
        <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
          {item.artist}
        </Text>
      </View>

      <Text className="shrink-0 text-muted-foreground text-[12px]">{estado}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          item.estado === 'lista'
            ? `Quitar la descarga de ${item.title}`
            : `Cancelar la descarga de ${item.title}`
        }
        onPress={() => quitarDescarga(item.audioPath)}
        className="h-11 w-11 items-center justify-center active:opacity-60"
      >
        <IconClose size={15} color={ICON_COLOR.muted} />
      </Pressable>
    </View>
  )
}
