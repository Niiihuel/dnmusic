import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { estiloDeFuente, FUENTES } from '../../src/lib/fuentes'
import { volver } from '../../src/lib/volver'
import { usePiso } from '../../src/state/shell'
import { actualizarBorrador, useBorrador } from '../../src/state/vitrinaBorrador'
import { ANCHO_HOJA, Hoja, useHojaModal } from '../../src/ui/Hoja'
import { ICON_COLOR, IconCheck } from '../../src/ui/icons'

/**
 * Elegir la tipografía de una pieza de texto.
 *
 * Cada opción se muestra **con el texto de la pieza**, escrito en esa
 * fuente: una tipografía se elige por cómo queda lo que uno escribió, no por
 * cómo queda «Lorem ipsum». Sin texto todavía, va el nombre de la fuente.
 * Tocar una la pone en el borrador al toque —la vista previa del editor está
 * detrás— y Cancelar devuelve la que había, como la hoja del tema.
 */
export default function ElegirFuente() {
  const router = useRouter()
  const piso = usePiso(24)
  const modal = useHojaModal()
  const borrador = useBorrador()

  const [inicial] = useState<string | null>(borrador?.estilo.fuente ?? null)
  const [elegida, setElegida] = useState<string | null>(inicial)

  const c = borrador?.contenido
  const muestra =
    (c?.kind === 'texto' ? c.texto : c?.kind === 'encabezado' ? c.titulo : c?.kind === 'letra' ? c.letra.texto : c?.kind === 'subspace' ? c.titulo : '')
      .trim()

  function elegir(id: string | null) {
    setElegida(id)
    actualizarBorrador((b) => ({ estilo: { ...b.estilo, fuente: id } }))
  }

  function cancelar() {
    actualizarBorrador((b) => ({ estilo: { ...b.estilo, fuente: inicial } }))
    volver(router, '/profile/vitrina')
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
          <Text className="text-foreground text-[17px] font-bold">La fuente de esta pieza</Text>
          <Text className="text-muted-foreground text-center text-[12px] leading-4">
            Cada una escribe lo tuyo a su manera.
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
            onPress={() => volver(router, '/profile/vitrina')}
            className="h-11 min-w-[120px] items-center justify-center rounded-full bg-primary px-6 active:opacity-80"
          >
            <Text className="text-primary-foreground text-[14px] font-bold">Listo</Text>
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
