import { FilaSocial } from '../../src/ui/FilaSocial'
import { useState } from 'react'
import { FlatList, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { estiloDeFuente, FUENTES, type Fuente } from '../../src/lib/fuentes'
import { Hoja, useHojaModal, usePisoHoja } from '../../src/ui/Hoja'
import { ICON_COLOR, IconCheck } from '../../src/ui/icons'
import { CabeceraEdicionPerfil } from '../../src/ui/EditorDeCampo'
import { TarjetaPerfil } from '../../src/ui/TarjetaPerfil'
import { BotonHoja } from '../../src/ui/EncabezadoHoja'
import { estadoControlWeb } from '../../src/ui/estadoControl'

import { actualizarPerfilEdicion, useIniciarPerfilEdicion, usePerfilEdicion } from '../../src/state/perfilEdicion'

const OPCIONES: (Fuente | null)[] = [null, ...FUENTES]

/** La elección vive en un borrador hasta guardar; la tarjeta muestra el resultado real. */
export default function ElegirFuente() {
  const router = useRouter()
  const piso = usePisoHoja(24)
  const modal = useHojaModal()
  const perfil = useIniciarPerfilEdicion()
  const { ocupado: guardando } = usePerfilEdicion()
  const elegida = perfil?.fuente ?? null
  const [ancho, setAncho] = useState(0)
  const cerrar = () => router.dismissTo('/profile/editar')
  const setBorrador = (fuente: string | null) => actualizarPerfilEdicion({ fuente })
  const muestra = perfil?.displayName || perfil?.username || 'Tu música, tu espacio'
  const perfilVistaPrevia = perfil ? { ...perfil, fuente: elegida } : null
  const columnas = ancho >= 740

  // Una sola superficie desplazable, hija directa de la hoja UIKit. La cabecera
  // la mide el navegador nativo; no depende del alto de la preview ni de CSS.
  if (Platform.OS === 'ios') return <>
    <Stack.Screen options={{
      headerShown: true, title: 'Tipografía', headerBackVisible: false,
      headerTintColor: '#fff', headerStyle: { backgroundColor: '#121212' },
      headerShadowVisible: false,
      headerLeft: () => <BotonHoja tipo="cerrar" label="Cerrar tipografía" onPress={cerrar} disabled={guardando} />,
    }} />
    <FlatList
      testID="fuentes-ios"
      collapsable={false}
      style={{ flex: 1, backgroundColor: '#121212' }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: piso }}
      contentInsetAdjustmentBehavior="automatic"
      data={OPCIONES}
      extraData={{ elegida, guardando, muestra }}
      keyExtractor={item => item?.id ?? 'sistema'}
      ListHeaderComponent={<View style={{ gap: 12, paddingBottom: 24 }}>
        <Text style={{ color: '#b3b3b3', fontSize: 13 }}>Vista previa</Text>
        <View style={{ padding: 20, borderRadius: 18, backgroundColor: '#1c1c1e', gap: 8 }}>
          <Text style={[{ color: '#fff', fontSize: 28 }, estiloDeFuente(elegida, 28)]}>{muestra}</Text>
          {perfil?.username ? <Text style={[{ color: '#c7c7cc', fontSize: 15 }, estiloDeFuente(elegida, 15)]}>@{perfil.username}</Text> : null}
          <Text style={[{ color: '#c7c7cc', fontSize: 17 }, estiloDeFuente(elegida, 17)]}>Tu música, tu espacio. Así se ve lo que compartís.</Text>
        </View>
        <Text style={{ color: '#b3b3b3', fontSize: 13, lineHeight: 19 }}>Se aplica a todo tu perfil y sus piezas. Guardá los cambios al volver al editor.</Text>
      </View>}
      renderItem={({ item }) => <Opcion
        nombre={item?.nombre ?? 'Del sistema'} detalle={item?.detalle ?? 'La de toda la app'} muestra={muestra}
        estilo={estiloDeFuente(item?.id, 20)} elegida={elegida === (item?.id ?? null)}
        desactivada={guardando || !perfil} onPress={() => setBorrador(item?.id ?? null)}
      />}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#262628', marginLeft: 16 }} />}
    />
  </>

  return (
    <Hoja medida="llena" anchoMaximo={940} onCerrar={cerrar}>
      <View
        className="bg-background"
        collapsable={false}
        style={{ flex: 1 }}
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
              <Text className="text-foreground text-body font-semibold">Vista previa</Text>
              <View style={{ paddingHorizontal: 16, paddingVertical: 24 }}>
                {perfilVistaPrevia ? <TarjetaPerfil perfil={perfilVistaPrevia} animado={false} /> : (
                  <Text className="text-muted-foreground text-subheadline">Cargando tu perfil…</Text>
                )}
              </View>
            </View>
            <View style={{ flex: columnas ? 1 : undefined, minWidth: 0, gap: 16 }}>
              <Text className="text-muted-foreground text-subheadline">
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
  if (Platform.OS === 'ios') return <FilaSocial titulo={muestra} detalle={`${nombre} · ${detalle}`} fontFamily={estilo?.fontFamily}
    label={`Fuente ${nombre}. ${detalle}`} selected={elegida} disabled={desactivada} onPress={onPress} />
  return (
    <Pressable
      {...estadoControlWeb('none')}
      accessibilityRole="radio"
      accessibilityLabel={`Fuente ${nombre}. ${detalle}`}
      accessibilityState={{ checked: elegida, disabled: desactivada }}
      disabled={desactivada}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
        backgroundColor: elegida || pressed ? '#28282a' : '#1c1c1e' })}
    >
      <View style={{ minWidth: 0, flex: 1, gap: 4 }}>
        <Text numberOfLines={1} style={[{ color: '#fff', fontSize: 20, fontWeight: '600' }, estilo]}>{muestra}</Text>
        <Text style={{ color: '#b3b3b3', fontSize: 13 }}>{nombre} · {detalle}</Text>
      </View>
      {elegida ? <IconCheck size={16} color={ICON_COLOR.foreground} /> : null}
    </Pressable>
  )
}
