import { ScrollArea as ScrollView } from '../../src/ui/ScrollArea'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import QRCode from 'react-native-qrcode-svg'
import { invitarAlJam, linkDeJam } from '../../src/lib/invitarJam'
import { copiarAlPortapapeles } from '../../src/lib/portapapeles'
import { avisar } from '../../src/state/aviso'
import { volver } from '../../src/lib/volver'
import { expulsarMiembro, useJam, useMiembrosJam, useMiIdJam, usePresentesJam, useSoyHostJam } from '../../src/state/jam'
import { Avatar } from '../../src/ui/Avatar'
import { ES_WEB } from '../../src/ui/Glass'
import { Hoja, useHojaModal, usePisoHoja } from '../../src/ui/Hoja'
import { AccionSocial, CabeceraSocial, SeccionSocial } from '../../src/ui/Social'
import { ICON_COLOR, IconClose } from '../../src/ui/icons'
import { MandarJamAmigo } from '../../src/ui/MandarJamAmigo'

export default function PersonasJam() {
  const router = useRouter()
  const jam = useJam()
  const miembros = useMiembrosJam()
  const presentes = usePresentesJam()
  const soyHost = useSoyHostJam()
  const miId = useMiIdJam()
  const piso = usePisoHoja(24)
  const modal = useHojaModal()
  const [qr, setQr] = useState(false)
  const enVivo = new Set(presentes)
  const cerrar = () => volver(router, '/jam')

  return <Hoja anchoMaximo={560}><KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <CabeceraSocial titulo="Personas e invitación" detalle={jam ? `${miembros.length} participantes` : 'El Jam terminó'} onCerrar={cerrar} />
    {!jam ? <View className="flex-1 items-center justify-center px-6"><Text className="text-muted-foreground text-[15px]">Volvé a Jam para iniciar una nueva sesión.</Text></View> : <ScrollView keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 20, paddingBottom: modal ? 24 : piso, gap: 24 }}>
      <View className="gap-3">
        <Text className="text-muted-foreground text-[15px] leading-6">Compartí la invitación para sumar a tus amigos a la misma cola.</Text>
        <AccionSocial label={ES_WEB ? 'Copiar enlace de invitación' : 'Compartir invitación'} onPress={() => void invitarAlJam(jam.code)} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Copiar código ${jam.code}`} onPress={() => void copiarAlPortapapeles(jam.code).then(ok => avisar(ok ? 'Código copiado' : `Código: ${jam.code}`))}
          className="min-h-11 flex-row items-center justify-between rounded-2xl bg-card px-4 py-3">
          <View className="gap-1"><Text className="text-muted-foreground text-[12px]">Código del Jam</Text><Text className="text-foreground text-[19px] font-semibold tracking-[3px]">{jam.code}</Text></View>
          <Text className="text-foreground text-[14px] font-semibold">Copiar</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: qr }} onPress={() => setQr(!qr)} className="min-h-11 items-center justify-center">
          <Text className="text-foreground text-[14px]">{qr ? 'Ocultar código QR' : 'Mostrar código QR'}</Text>
        </Pressable>
        {qr ? <View className="items-center gap-3"><View className="rounded-2xl bg-white p-5"><QRCode value={linkDeJam(jam.code)} size={164} backgroundColor="#fff" color="#121212" /></View><Text className="text-muted-foreground text-[13px]">Escanealo con la cámara para abrir la invitación.</Text></View> : null}
      </View>
      <MandarJamAmigo code={jam.code} />
      <SeccionSocial titulo="En este Jam">
        {miembros.map(m => <View key={m.userId} className="flex-row items-center gap-3 px-4 py-3">
          <Avatar name={m.displayName || m.username} path={m.avatarPath} size={40} />
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-foreground text-[15px] font-semibold" numberOfLines={1}>{m.displayName?.trim() || `@${m.username}`}{m.userId === miId ? ' (vos)' : ''}</Text>
            <Text className="text-muted-foreground text-[13px]">{m.rol === 'host' ? 'Anfitrión' : 'Invitado'} · {enVivo.has(m.userId) ? 'En línea' : 'Sin conexión'}</Text>
          </View>
          {soyHost && m.userId !== miId ? <Pressable accessibilityRole="button" accessibilityLabel={`Sacar a ${m.username}`} onPress={() => expulsarMiembro(m.userId)} className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"><IconClose size={17} color={ICON_COLOR.muted} /></Pressable> : null}
        </View>)}
      </SeccionSocial>
    </ScrollView>}
  </KeyboardAvoidingView></Hoja>
}
