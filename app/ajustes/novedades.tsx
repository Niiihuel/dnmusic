import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Panel } from '../../src/ui/Panel'
import { GrupoAjustes } from '../../src/ui/Ajustes'
import { ICON_COLOR, IconBack } from '../../src/ui/icons'
import { NOVEDADES } from '../../src/lib/novedades'
import {
  buscarActualizacion,
  HAY_ACTUALIZADOR,
  instalarActualizacion,
  useActualizacion,
  type EstadoActualizacion,
  type NotasVersion,
} from '../../src/state/actualizacion'
import { usePiso } from '../../src/state/shell'
import { volver } from '../../src/lib/volver'

/** Debajo de esto la app es pestañas y el contenido va de borde a borde. */
const SHELL_PX = 780
/** Tope del contenido en escritorio, como en el resto de las pantallas. */
const CAP = 672

/**
 * Las novedades: qué cambió en cada versión, y —en el escritorio— el
 * actualizador a la vista.
 *
 * La lista sale del bundle (`src/lib/novedades.ts`), así que es la misma
 * pantalla en la web, la computadora y el teléfono, y no le pide nada a nadie.
 *
 * La parte de arriba solo existe adentro de la app de escritorio: ahí el
 * actualizador ya trabajaba solo —baja en silencio, instala al cerrar— pero no
 * tenía cara; lo único visible era una entrada de menú detrás de Alt. Acá se ve
 * en qué anda y se le puede pedir que busque ya.
 */

/** Megabytes, para poder decir «42 de 137 MB» y no solo un porcentaje. */
function mb(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`
}

/** Qué contar de cada fase, en una frase. */
function fraseDelEstado(estado: EstadoActualizacion): string {
  switch (estado.fase) {
    case 'buscando':
      return 'Buscando…'
    case 'sin-novedad':
      return `Estás al día. Versión ${estado.version}.`
    case 'esperando-silencio':
      return `Hay una versión nueva; se baja cuando pares la música.`
    case 'bajando':
      return estado.total
        ? `Bajando… ${mb(estado.bajados)} de ${mb(estado.total)}`
        : 'Bajando…'
    case 'lista':
      return 'Lista para instalar. Si no hacés nada, se instala sola al cerrar la app.'
    case 'error':
      return 'No se pudo buscar. Probá de nuevo en un rato.'
    case 'apagado':
      return `Acá no se actualiza sola: ${estado.motivo}.`
    default:
      return estado.version ? `Versión ${estado.version}` : ''
  }
}

/** La versión que viene, si hay alguna en camino. */
function versionEnCamino(estado: EstadoActualizacion): string | null {
  return estado.fase === 'esperando-silencio' || estado.fase === 'bajando' || estado.fase === 'lista'
    ? estado.version
    : null
}

function notasEnCamino(estado: EstadoActualizacion): NotasVersion | null {
  return estado.fase === 'esperando-silencio' || estado.fase === 'bajando' || estado.fase === 'lista'
    ? estado.notas
    : null
}

/**
 * La barra de progreso.
 *
 * Sin color, como todo (`docs/DESIGN.md`): el riel es la superficie
 * interactiva y lo que avanza es el blanco, que es el acento. Píldora, como
 * cualquier otra cosa de la app.
 */
function Barra({ porcentaje }: { porcentaje: number }) {
  return (
    <View className="h-1 w-full overflow-hidden rounded-full bg-muted">
      <View
        className="h-full rounded-full bg-primary"
        style={{ width: `${Math.max(2, Math.min(100, porcentaje))}%` }}
      />
    </View>
  )
}

function Actualizador() {
  const estado = useActualizacion()

  if (!HAY_ACTUALIZADOR) return null

  const ocupado = estado.fase === 'buscando' || estado.fase === 'bajando'
  const lista = estado.fase === 'lista'
  const enCamino = versionEnCamino(estado)
  const notas = notasEnCamino(estado)

  return (
    <GrupoAjustes titulo="Tu versión">
      <View className="gap-3 px-4 py-3.5">
        {enCamino ? (
          <Text className="text-foreground text-[15px] font-semibold">
            Versión {enCamino} {lista ? 'lista' : 'en camino'}
          </Text>
        ) : null}

        <Text className="text-muted-foreground text-[13px] leading-5">
          {fraseDelEstado(estado)}
        </Text>

        {estado.fase === 'bajando' ? <Barra porcentaje={estado.porcentaje} /> : null}

        {/*
          Qué trae, antes de instalarla.
          Sale del propio feed de actualización (`latest.yml` lleva las notas del
          release), que es la única fuente posible: las novedades del bundle
          llegan hasta la versión que estás corriendo, no hasta la que viene.
        */}
        {notas && notas.cambios.length ? (
          <View className="gap-2 rounded-2xl bg-muted p-3.5">
            {notas.titulo ? (
              <Text className="text-foreground text-[13px] font-semibold">{notas.titulo}</Text>
            ) : null}
            {notas.cambios.map((cambio) => (
              <View key={cambio} className="flex-row gap-2.5">
                <Text className="text-muted-foreground text-[13px] leading-5">·</Text>
                <Text className="flex-1 text-muted-foreground text-[13px] leading-5">{cambio}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {estado.fase === 'apagado' ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={lista ? 'Reiniciar e instalar' : 'Buscar actualizaciones'}
            disabled={ocupado}
            onPress={lista ? instalarActualizacion : buscarActualizacion}
            className={`self-start rounded-full px-4 py-2 ${
              ocupado ? 'bg-muted' : 'bg-primary active:opacity-80'
            }`}
          >
            <Text
              className={`text-[13px] font-semibold ${
                ocupado ? 'text-muted-foreground' : 'text-primary-foreground'
              }`}
            >
              {lista ? 'Reiniciar e instalar' : ocupado ? 'En eso…' : 'Buscar actualizaciones'}
            </Text>
          </Pressable>
        )}
      </View>
    </GrupoAjustes>
  )
}

export default function Novedades() {
  const router = useRouter()
  const suelto = useWindowDimensions().width < SHELL_PX
  const piso = usePiso(24)

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={suelto ? ['top'] : ['top', 'bottom']}
    >
      <View className={`min-h-0 flex-1 ${suelto ? '' : 'gap-2 p-2'}`}>
        <View className="flex-row items-center gap-3 px-3 py-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={() => volver(router, '/ajustes')}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          >
            <IconBack size={19} color={ICON_COLOR.foreground} />
          </Pressable>
          <Text className="text-foreground text-[15px] font-semibold">Novedades</Text>
        </View>

        <Panel className="flex-1">
          <ScrollView
            contentContainerClassName={`items-center ${suelto ? 'px-3 pt-3' : 'p-5'}`}
            contentContainerStyle={{ paddingBottom: piso }}
          >
            <View className="w-full gap-6" style={{ maxWidth: suelto ? undefined : CAP }}>
              <Actualizador />

              {NOVEDADES.map((novedad) => (
                <View key={novedad.version} className="gap-2">
                  <View className="flex-row items-baseline justify-between px-4">
                    <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
                      {novedad.fecha}
                    </Text>
                    <Text className="text-muted-foreground text-[11px]">{novedad.version}</Text>
                  </View>
                  <View className="gap-3 rounded-2xl bg-card p-4">
                    <Text className="text-foreground text-[15px] font-semibold">
                      {novedad.titulo}
                    </Text>
                    <View className="gap-2">
                      {novedad.cambios.map((cambio) => (
                        <View key={cambio} className="flex-row gap-2.5">
                          <Text className="text-muted-foreground text-[13px] leading-5">·</Text>
                          <Text className="flex-1 text-muted-foreground text-[13px] leading-5">
                            {cambio}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </Panel>
      </View>
    </SafeAreaView>
  )
}
