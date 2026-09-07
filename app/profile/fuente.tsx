import { useState } from 'react'
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { useRouter } from 'expo-router'
import { estiloDeFuente, FUENTES } from '../../src/lib/fuentes'
import { Hoja, useHojaModal, usePisoHoja } from '../../src/ui/Hoja'
import { ICON_COLOR, IconCheck } from '../../src/ui/icons'
import { CabeceraEdicionPerfil } from '../../src/ui/EditorDeCampo'
import { TarjetaPerfil } from '../../src/ui/TarjetaPerfil'

import { actualizarPerfilEdicion, useIniciarPerfilEdicion, usePerfilEdicion } from '../../src/state/perfilEdicion'

/** La elección vive en un borrador hasta guardar; la tarjeta muestra el resultado real. */
export default function ElegirFuente() {
  const router = useRouter()
  const piso = usePisoHoja(24)
  const modal = useHojaModal()
  const { height } = useWindowDimensions()
  const perfil = useIniciarPerfilEdicion()
  const { ocupado: guardando } = usePerfilEdicion()
  const elegida = perfil?.fuente ?? null
  const [ancho, setAncho] = useState(0)
  const cerrar = () => router.dismissTo('/profile/editar')
  const setBorrador = (fuente: string | null) => actualizarPerfilEdicion({ fuente })
  const muestra = perfil?.displayName || perfil?.username || 'Tu música, tu espacio'
  const perfilVistaPrevia = perfil ? { ...perfil, fuente: elegida } : null
  const columnas = ancho >= 740

  return (
    <Hoja medida="llena" anchoMaximo={940} onCerrar={cerrar}>
      <View
        className="bg-background"
        // La ruta nativa usa fitToContents: necesita alto explícito para alojar el scroll.
        style={Platform.OS === 'web' ? { flex: 1 } : { height: Math.min(720, Math.round(height * 0.82)) }}
        onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
      >
        <CabeceraEdicionPerfil
          titulo="Tipografía"
          ocupado={guardando}
          onCancelar={cerrar}
          rotuloVolver="Listo"
        />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: (modal ? 24 : piso) }}
        >
          <View style={{ flexDirection: columnas ? 'row' : 'column', gap: 28, alignItems: columnas ? 'flex-start' : 'stretch' }}>
            <View style={{ width: columnas ? 340 : '100%', maxWidth: 380, alignSelf: columnas ? 'flex-start' : 'center', gap: 8 }}>
              <Text className="text-foreground text-[17px] font-semibold">Vista previa</Text>
              <View style={{ paddingHorizontal: 16, paddingVertical: 24 }}>
                {perfilVistaPrevia ? <TarjetaPerfil perfil={perfilVistaPrevia} animado={false} /> : (
                  <Text className="text-muted-foreground text-[15px]">Cargando tu perfil…</Text>
                )}
              </View>
            </View>
            <View style={{ flex: columnas ? 1 : undefined, minWidth: 0, gap: 16 }}>
              <Text className="text-muted-foreground text-[15px] leading-5">
                La fuente se aplica a tu nombre, biografía, canciones y mosaico.
              </Text>
              <View className="overflow-hidden rounded-2xl bg-card">
                <Opcion
                  nombre="Del sistema" detalle="La de toda la app" muestra={muestra}
                  estilo={null} elegida={elegida === null} desactivada={guardando || !perfil}
                  onPress={() => setBorrador(null)}
                />
                {FUENTES.map((f) => (
                  <Opcion
                    key={f.id} nombre={f.nombre} detalle={f.detalle} muestra={muestra}
                    estilo={estiloDeFuente(f.id, 20)} elegida={elegida === f.id}
                    desactivada={guardando || !perfil} onPress={() => setBorrador(f.id)}
                  />
                ))}
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </Hoja>
  )
}

function Opcion({ nombre, detalle, muestra, estilo, elegida, desactivada, onPress }: {
  nombre: string
  detalle: string
  muestra: string
  estilo: ReturnType<typeof estiloDeFuente>
  elegida: boolean
  desactivada: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`Fuente ${nombre}. ${detalle}`}
      accessibilityState={{ checked: elegida, disabled: desactivada }}
      disabled={desactivada}
      onPress={onPress}
      className={`min-h-11 flex-row items-center gap-3 px-4 py-3 ${elegida ? 'bg-muted' : 'active:bg-muted'}`}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-foreground text-[20px] font-bold" numberOfLines={1} style={estilo}>{muestra}</Text>
        <Text className="text-muted-foreground text-[13px]">{nombre} · {detalle}</Text>
      </View>
      {elegida ? <IconCheck size={16} color={ICON_COLOR.foreground} /> : null}
    </Pressable>
  )
}
