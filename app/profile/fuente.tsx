import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { estiloDeFuente, FUENTES } from '../../src/lib/fuentes'
import { volver } from '../../src/lib/volver'
import { usePiso } from '../../src/state/shell'
import { useMyProfile, setMyProfile } from '../../src/state/session'
import { saveMyProfile } from '../../src/services/profile'
import { avisar } from '../../src/state/aviso'
import { mensajeError } from '../../src/lib/mensajeError'
import { ANCHO_HOJA, Hoja, useHojaModal } from '../../src/ui/Hoja'
import { ICON_COLOR, IconCheck } from '../../src/ui/icons'

/** Vista previa local; se publica en todo el perfil al aplicar. */
export default function ElegirFuente() {
  const router = useRouter()
  const piso = usePiso(24)
  const modal = useHojaModal()
  const perfil = useMyProfile()
  const [elegida, setElegida] = useState<string | null>(perfil?.fuente ?? null)
  const [guardando, setGuardando] = useState(false)
  const muestra = perfil?.displayName || perfil?.username || 'Tu música, tu espacio'
  const elegir = setElegida
  function cancelar() {
    if (!guardando) volver(router, '/profile')
  }
  async function guardar() {
    if (guardando) return
    setGuardando(true)
    try {
      setMyProfile(await saveMyProfile({ fuente: elegida }))
      avisar('Tipografía aplicada a todo tu perfil')
      volver(router, '/profile')
    } catch (e) {
      avisar(mensajeError(e), true)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Hoja medida="contenido">
      <ScrollView
        className="bg-background"
        style={{ flexGrow: 1 }}
        contentContainerClassName="gap-4 px-5 pt-6"
        contentContainerStyle={{
          paddingBottom: modal ? 24 : piso,
          maxWidth: ANCHO_HOJA,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <View className="items-center gap-1">
          <Text className="text-foreground text-[17px] font-bold">La tipografía de tu perfil</Text>
          <Text className="text-muted-foreground text-center text-[12px] leading-4">
            Una misma fuente para tu nombre, biografía, canciones y mosaico.
          </Text>
        </View>

        <View className="overflow-hidden rounded-2xl bg-card">
          <Opcion
            nombre="Del sistema"
            detalle="La de toda la app"
            muestra={muestra || 'Del sistema'}
            estilo={null}
            elegida={elegida === null}
            onPress={() => elegir(null)}
          />
          {FUENTES.map((f) => (
            <Opcion
              key={f.id}
              nombre={f.nombre}
              detalle={f.detalle}
              muestra={muestra || f.nombre}
              estilo={estiloDeFuente(f.id, 20)}
              elegida={elegida === f.id}
              onPress={() => elegir(f.id)}
            />
          ))}
        </View>

        <View className="flex-row items-center justify-between gap-3">
          <Pressable
            accessibilityRole="button"
            onPress={cancelar}
            className="h-11 items-center justify-center rounded-full bg-muted px-5 active:opacity-80"
          >
            <Text className="text-foreground text-[14px] font-semibold">Cancelar</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={guardando}
            onPress={() => void guardar()}
            className="h-11 min-w-[120px] items-center justify-center rounded-full bg-primary px-6 active:opacity-80"
          >
            <Text className="text-primary-foreground text-[14px] font-bold">
              {guardando ? 'Guardando…' : 'Aplicar al perfil'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </Hoja>
  )
}

/** Una fila: lo tuyo escrito en esa fuente, y el nombre chiquito abajo. */
function Opcion({
  nombre,
  detalle,
  muestra,
  estilo,
  elegida,
  onPress,
}: {
  nombre: string
  detalle: string
  muestra: string
  estilo: ReturnType<typeof estiloDeFuente>
  elegida: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Fuente ${nombre}`}
      accessibilityState={{ selected: elegida }}
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3 ${elegida ? 'bg-muted' : 'active:bg-muted'}`}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-foreground text-[20px] font-bold" numberOfLines={1} style={estilo}>
          {muestra}
        </Text>
        <Text className="text-muted-foreground text-[12px]">
          {nombre} · {detalle}
        </Text>
      </View>
      {elegida ? <IconCheck size={16} color={ICON_COLOR.foreground} /> : null}
    </Pressable>
  )
}
