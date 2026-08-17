import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Panel } from '../../src/ui/Panel'
import { GrupoAjustes } from '../../src/ui/Ajustes'
import { ICON_COLOR, IconBack } from '../../src/ui/icons'
import { NOVEDADES } from '../../src/lib/novedades'
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

/** El estado del actualizador, como lo publica desktop/src/actualizador.ts. */
type EstadoActualizacion =
  | { fase: 'inactivo' }
  | { fase: 'buscando' }
  | { fase: 'sin-novedad' }
  | { fase: 'esperando-silencio'; version: string }
  | { fase: 'bajando'; version: string; porcentaje: number }
  | { fase: 'lista'; version: string }
  | { fase: 'error'; mensaje: string }

/*
 * El puente del preload, tipado estructural como en `lib/notificarEscritorio`:
 * la app no importa nada de `desktop/` — si el puente no está, no estamos en
 * la app de escritorio y la sección entera no se dibuja.
 */
type PuenteEscritorio = {
  version?: () => Promise<string>
  actualizacion?: {
    estado: () => Promise<EstadoActualizacion>
    buscar: () => void
    instalar: () => void
    alCambiar: (escuchar: (estado: EstadoActualizacion) => void) => () => void
  }
}

function puente(): PuenteEscritorio | undefined {
  return (globalThis as { dnmusicEscritorio?: PuenteEscritorio }).dnmusicEscritorio
}

/** Qué contar de cada fase, en una frase. */
function fraseDelEstado(estado: EstadoActualizacion, version: string): string {
  switch (estado.fase) {
    case 'buscando':
      return 'Buscando…'
    case 'sin-novedad':
      return `Estás al día (${version}).`
    case 'esperando-silencio':
      return `Hay una versión nueva (${estado.version}); se baja cuando pares la música.`
    case 'bajando':
      return `Bajando la ${estado.version}… ${Math.round(estado.porcentaje)}%`
    case 'lista':
      return `La ${estado.version} está lista: se instala al cerrar la app.`
    case 'error':
      return 'No se pudo buscar. Probá de nuevo en un rato.'
    default:
      return version ? `Versión ${version}` : ''
  }
}

function Actualizador() {
  const [estado, setEstado] = useState<EstadoActualizacion>({ fase: 'inactivo' })
  const [version, setVersion] = useState('')

  useEffect(() => {
    const p = puente()
    if (!p?.actualizacion) return
    void p.version?.().then(setVersion)
    void p.actualizacion.estado().then(setEstado)
    return p.actualizacion.alCambiar(setEstado)
  }, [])

  const p = puente()
  if (!p?.actualizacion) return null

  const ocupado = estado.fase === 'buscando' || estado.fase === 'bajando'
  const lista = estado.fase === 'lista'

  return (
    <GrupoAjustes titulo="Tu versión">
      <View className="gap-3 px-4 py-3.5">
        <Text className="text-foreground text-[13px] leading-5">
          {fraseDelEstado(estado, version)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={lista ? 'Reiniciar e instalar' : 'Buscar actualizaciones'}
          disabled={ocupado}
          onPress={() => (lista ? p.actualizacion?.instalar() : p.actualizacion?.buscar())}
          className={`self-start rounded-full px-4 py-2 ${
            ocupado ? 'bg-muted' : 'bg-primary active:opacity-80'
          }`}
        >
          <Text className="text-primary-foreground text-[13px] font-semibold">
            {lista ? 'Reiniciar e instalar' : ocupado ? 'En eso…' : 'Buscar actualizaciones'}
          </Text>
        </Pressable>
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
      className={`flex-1 ${suelto ? 'bg-background' : 'bg-canvas'}`}
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
