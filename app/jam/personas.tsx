import { IconButton } from '../../src/ui/IconButton'
import { ScrollArea as ScrollView } from '../../src/ui/ScrollArea'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native'
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
    {!jam ? <View className="flex-1 items-center justify-center px-6"><Text className="text-muted-foreground text-subheadline">Volvé a Jam para iniciar una nueva sesión.</Text></View> : <ScrollView keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 20, paddingBottom: modal ? 24 : piso, gap: 24 }}>
      <View className="gap-3">
        <Text className="text-muted-foreground text-subheadline leading-6">Compartí la invitación para sumar a tus amigos a la misma cola.</Text>
        <AccionSocial label={ES_WEB ? 'Copiar enlace de invitación' : 'Compartir invitación'} onPress={() => void invitarAlJam(jam.code)} />
        <AccionSocial label={`Copiar código ${jam.code}`} secundaria onPress={() => void copiarAlPortapapeles(jam.code).then(ok => avisar(ok ? 'Código copiado' : `Código: ${jam.code}`))} />
        <AccionSocial label={qr ? 'Ocultar código QR' : 'Mostrar código QR'} secundaria onPress={() => setQr(!qr)} />
        {qr ? <View className="items-center gap-3"><View className="rounded-2xl bg-white p-5"><QRCode value={linkDeJam(jam.code)} size={164} backgroundColor="#fff" color="#121212" /></View><Text className="text-muted-foreground text-footnote">Escanealo con la cámara para abrir la invitación.</Text></View> : null}
      </View>
      <MandarJamAmigo code={jam.code} />
      <SeccionSocial titulo="En este Jam">
        {miembros.map(m => <View key={m.userId} className="flex-row items-center gap-3 px-4 py-3">
          <Avatar name={m.displayName || m.username} path={m.avatarPath} size={40} />
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-foreground text-subheadline font-semibold" numberOfLines={1}>{m.displayName?.trim() || `@${m.username}`}{m.userId === miId ? ' (vos)' : ''}</Text>
            <Text className="text-muted-foreground text-footnote">{m.rol === 'host' ? 'Anfitrión' : 'Invitado'} · {enVivo.has(m.userId) ? 'En línea' : 'Sin conexión'}</Text>
          </View>
          {soyHost && m.userId !== miId ? <IconButton label={`Sacar a ${m.username}`} symbol="person.fill.xmark" onPress={() => expulsarMiembro(m.userId)} icon={<IconClose size={17} color={ICON_COLOR.muted} />} /> : null}
        </View>)}
      </SeccionSocial>
    </ScrollView>}
  </KeyboardAvoidingView></Hoja>
}
