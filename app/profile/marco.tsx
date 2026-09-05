import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { mensajeError } from '../../src/lib/mensajeError'
import { volver } from '../../src/lib/volver'
import { saveMyProfile } from '../../src/services/profile'
import { avisar } from '../../src/state/aviso'
import { setMyProfile, useMyProfile } from '../../src/state/session'
import { usePiso } from '../../src/state/shell'
import { Avatar } from '../../src/ui/Avatar'
import { Hoja, useHojaModal } from '../../src/ui/Hoja'
import { FAMILIAS_MARCO, Marco, MARCOS } from '../../src/ui/Marco'
import { COLECCION_MARCOS } from '../../src/ui/MarcosColeccion'
import { ICON_COLOR, IconBack, IconCheck } from '../../src/ui/icons'

export default function ElegirMarco() {
  const router = useRouter()
  const perfil = useMyProfile()
  const piso = usePiso(24)
  const modal = useHojaModal()
  const { width } = useWindowDimensions()
  const [seleccion, setSeleccion] = useState<string | null>(perfil?.marco ?? 'eclipse')
  const [familia, setFamilia] = useState('destacados')
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)
  const nombre = perfil?.displayName?.trim() || perfil?.username || 'Vos'
  const elegido = MARCOS.find((m) => m.id === seleccion)
  const tarjetas = MARCOS.filter(
    (m) =>
      (familia === 'todos' ||
        (familia === 'destacados'
          ? COLECCION_MARCOS.some((c) => c.id === m.id)
          : m.familia === familia)) &&
      m.nombre.toLocaleLowerCase().includes(busqueda.trim().toLocaleLowerCase()),
  )
  const columnas = width >= 900 ? 3 : 2
  async function guardar() {
    if (guardando) return
    setGuardando(true)
    try {
      setMyProfile(await saveMyProfile({ marco: seleccion ?? '' }))
      avisar(seleccion ? 'Marco aplicado a tu perfil' : 'Marco quitado')
    } catch (e) {
      avisar(mensajeError(e), true)
    } finally {
      setGuardando(false)
    }
  }
  const avatar = (marco: string | null, size: number, animado = false) => (
    <View style={{ width: size, height: size }}>
      <Avatar
        name={nombre}
        path={perfil?.avatarPath}
        size={size}
        encuadre={perfil?.avatarEncuadre}
      />
      <Marco marco={marco} size={size} animado={animado} />
    </View>
  )
  return (
    <Hoja anchoMaximo={1040}>
      <View className="flex-row items-center gap-3 bg-background px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver al perfil"
          onPress={() => volver(router, '/profile')}
          className="h-11 w-11 items-center justify-center rounded-full bg-card"
        >
          <IconBack size={18} color={ICON_COLOR.foreground} />
        </Pressable>
        <View className="flex-1 gap-0.5">
          <Text className="text-foreground text-[19px] font-bold">Marcos</Text>
          <Text className="text-muted-foreground text-[11px]">
            Un detalle que hace tuyo el perfil
          </Text>
        </View>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 24,
          gap: 20,
        }}
      >
        <LinearGradient
          colors={['#252936', '#181b25', '#151619']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 22, overflow: 'hidden', padding: 24 }}
        >
          <View className="flex-row flex-wrap items-center justify-between gap-6">
            <View style={{ flexGrow: 1, flexBasis: 210 }} className="gap-3">
              <Text
                style={{ color: '#b6becf' }}
                className="text-[10px] font-semibold uppercase tracking-[2px]"
              >
                Colección · Después de medianoche
              </Text>
              <Text className="text-foreground text-[28px] font-bold">
                Pequeños detalles.{'\n'}Otra presencia.
              </Text>
              <Text
                className="text-muted-foreground text-[13px] leading-5"
                style={{ maxWidth: 360 }}
              >
                Plata, órbitas y jardines nocturnos. Probá cada diseño sobre tu foto.
              </Text>
            </View>
            <View
              style={{ flexGrow: 1, flexBasis: 140, alignItems: 'center', paddingVertical: 20 }}
            >
              {avatar(seleccion, 110, true)}
              <Text className="mt-7 text-foreground text-[14px] font-semibold">
                {elegido?.nombre ?? 'Sin marco'}
              </Text>
              <Text className="mt-1 text-muted-foreground text-[11px]">
                Vista previa · @{perfil?.username}
              </Text>
            </View>
          </View>
        </LinearGradient>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {[
            { id: 'destacados', titulo: 'Destacados' },
            { id: 'todos', titulo: 'Todos' },
            ...FAMILIAS_MARCO,
          ].map((f) => (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              accessibilityState={{ selected: familia === f.id }}
              onPress={() => setFamilia(f.id)}
              className={
                familia === f.id
                  ? 'min-h-11 items-center justify-center rounded-full bg-primary px-4'
                  : 'min-h-11 items-center justify-center rounded-full bg-card px-4'
              }
            >
              <Text
                className={
                  familia === f.id
                    ? 'text-primary-foreground text-[12px] font-semibold'
                    : 'text-muted-foreground text-[12px]'
                }
              >
                {f.titulo}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <TextInput
          accessibilityLabel="Buscar marcos"
          placeholder="Buscar en esta colección"
          placeholderTextColor="#858585"
          value={busqueda}
          onChangeText={setBusqueda}
          className="min-h-11 rounded-xl bg-card px-4 text-foreground text-[13px]"
        />
        <View className="flex-row flex-wrap" style={{ gap: 12 }}>
          {tarjetas.map((m) => (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityLabel={`Probar marco ${m.nombre}`}
              accessibilityState={{ selected: seleccion === m.id }}
              onPress={() => setSeleccion(m.id)}
              disabled={guardando}
              style={{
                width: columnas === 3 ? '32%' : '48%',
                flexGrow: 1,
                borderRadius: 16,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: seleccion === m.id ? '#b0b6c1' : '#25262a',
                backgroundColor: '#18191d',
              }}
            >
              <LinearGradient
                colors={
                  m.familia === 'naturaleza'
                    ? ['#252e29', '#171d1a']
                    : m.familia === 'realeza'
                      ? ['#302b22', '#1e1b17']
                      : ['#252934', '#191a21']
                }
                style={{ height: 160, alignItems: 'center', justifyContent: 'center' }}
              >
                {avatar(m.id, 84)}
              </LinearGradient>
              <View className="gap-1 p-3">
                <View className="flex-row items-center justify-between gap-2">
                  <Text
                    className="text-foreground text-[13px] font-semibold"
                    numberOfLines={1}
                    style={{ flex: 1 }}
                  >
                    {m.nombre}
                  </Text>
                  {seleccion === m.id ? (
                    <IconCheck size={14} color={ICON_COLOR.foreground} />
                  ) : null}
                </View>
                <Text className="text-muted-foreground text-[11px]">
                  {FAMILIAS_MARCO.find((f) => f.id === m.familia)?.titulo} · Incluido
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
        {!tarjetas.length ? (
          <Text className="text-muted-foreground py-6 text-center text-[13px]">
            No hay marcos con ese nombre en esta colección.
          </Text>
        ) : null}
      </ScrollView>
      <View
        className="flex-row flex-wrap items-center justify-between gap-3 bg-card px-5 py-3"
        style={{ paddingBottom: modal ? 12 : piso }}
      >
        <Pressable
          accessibilityRole="button"
          disabled={guardando}
          onPress={() => setSeleccion(null)}
          className="min-h-11 justify-center px-2"
        >
          <Text className="text-muted-foreground text-[12px]">Sin marco</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: guardando || (perfil?.marco ?? null) === seleccion }}
          disabled={guardando || (perfil?.marco ?? null) === seleccion}
          onPress={() => void guardar()}
          className="min-h-11 flex-row items-center justify-center gap-2 rounded-full bg-primary px-6 active:opacity-80"
          style={{ opacity: (perfil?.marco ?? null) === seleccion ? 0.55 : 1 }}
        >
          {guardando ? <ActivityIndicator size="small" color="#121212" /> : null}
          <Text className="text-primary-foreground text-[13px] font-bold">
            {guardando
              ? 'Guardando…'
              : (perfil?.marco ?? null) === seleccion
                ? 'Aplicado'
                : seleccion
                  ? 'Usar este marco'
                  : 'Quitar marco'}
          </Text>
        </Pressable>
      </View>
    </Hoja>
  )
}
