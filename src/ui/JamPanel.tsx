import { ScrollArea as ScrollView } from './ScrollArea'
import { useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { crearJamActual, salirDelJam, useConexionJam, useJam, useMiembrosJam, usePresentesJam, useSoyHostJam } from '../state/jam'
import { usePiso } from '../state/shell'
import { Avatar } from './Avatar'
import { ColaJam } from './ColaJam'
import { EntrarConCodigo } from './EntrarJam'
import { useHojaModal } from './Hoja'
import { AccionSocial } from './Social'
import { ICON_COLOR, IconChevronRight, IconUsers, IconShare, IconSliders } from './icons'

/** Panel y hoja comparten jerarquía, acciones y estados. Abrir no crea un Jam. */
export function JamBody({ enHoja = false }: { enHoja?: boolean }) {
  const router = useRouter()
  const jam = useJam()
  const miembros = useMiembrosJam()
  const presentes = usePresentesJam()
  const conexion = useConexionJam()
  const soyHost = useSoyHostJam()
  const modal = useHojaModal()
  const insets = useSafeAreaInsets()
  const piso = usePiso(16)
  const abajo = enHoja ? (modal ? 16 : insets.bottom + 16) : Math.max(piso, insets.bottom + 12)
  const [creando, setCreando] = useState(false)
  const creandoRef = useRef(false)
  const [arrastrando, setArrastrando] = useState(false)
  const host = miembros.find(m => m.rol === 'host')

  async function iniciar() {
    if (creandoRef.current) return
    creandoRef.current = true
    setCreando(true)
    try { await crearJamActual() }
    finally { creandoRef.current = false; setCreando(false) }
  }

  if (!jam) return <ScrollView className="flex-1" keyboardShouldPersistTaps="handled"
    contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: abajo + 24 }}>
    <View style={{ width: '100%', maxWidth: 360, alignSelf: 'center', gap: 20 }}>
      <View className="items-center gap-3">
        <View className="h-16 w-16 items-center justify-center rounded-2xl bg-muted"><IconUsers size={28} color={ICON_COLOR.foreground} /></View>
        <Text className="text-foreground text-center text-[22px] font-semibold">{conexion === 'conectando' ? 'Conectando…' : 'La música, en compañía'}</Text>
        <Text className="text-muted-foreground text-center text-[15px] leading-6">Escuchen lo mismo y armen una cola entre todos, desde sus dispositivos.</Text>
      </View>
      {conexion === 'conectando' ? <ActivityIndicator color={ICON_COLOR.foreground} /> : <View className="gap-3">
        <AccionSocial label="Iniciar un Jam" onPress={() => void iniciar()} busy={creando} />
        <EntrarConCodigo />
      </View>}
    </View>
  </ScrollView>

  return <View className="min-h-0 flex-1">
    <ScrollView className="min-h-0 flex-1" scrollEnabled={!arrastrando}
      contentContainerStyle={{ padding: 20, paddingBottom: abajo + 84, gap: 24 }}>
      <View className="gap-4">
        <Pressable accessibilityRole="button" accessibilityLabel="Ver participantes del Jam" onPress={() => router.push('/jam/personas')}
          className="min-h-11 flex-row items-center gap-3 rounded-2xl bg-card p-4 active:opacity-70">
          <View className="flex-row">
            {miembros.slice(0, 3).map((m, i) => <View key={m.userId} style={{ marginLeft: i ? -12 : 0 }} className="rounded-full border-2 border-card">
              <Avatar name={m.displayName || m.username} path={m.avatarPath} size={36} />
            </View>)}
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-foreground text-[16px] font-semibold" numberOfLines={1}>{host ? `Jam de ${host.displayName?.trim() || host.username}` : 'Tu Jam'}</Text>
            <Text className="text-muted-foreground text-[13px]">{presentes.length} en línea · {miembros.length} participantes</Text>
          </View><IconChevronRight size={16} color={ICON_COLOR.muted} />
        </Pressable>
        <View className="flex-row gap-3">
          <View className="flex-1"><AccionSocial label="Invitar" onPress={() => router.push('/jam/personas')} icono={<IconShare size={17} color={ICON_COLOR.onPrimary} />} /></View>
          <View className="flex-1"><AccionSocial label="Opciones" secundaria onPress={() => router.push('/jam/opciones')} icono={<IconSliders size={17} color={ICON_COLOR.foreground} />} /></View>
        </View>
      </View>
      <View className="gap-3">
        <Text accessibilityRole="header" className="text-foreground text-[17px] font-semibold">Cola compartida</Text>
        <ColaJam onArrastre={setArrastrando} />
      </View>
    </ScrollView>
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 20, right: 20, bottom: abajo }}>
      <AccionSocial label={soyHost ? 'Terminar el Jam' : 'Salir del Jam'} secundaria onPress={salirDelJam} />
    </View>
  </View>
}
