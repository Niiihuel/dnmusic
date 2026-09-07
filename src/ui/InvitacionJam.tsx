import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { invitacionEnTexto } from '../lib/invitacionJam'
import { copiarAlPortapapeles } from '../lib/portapapeles'
import { avisar } from '../state/aviso'
import { ICON_COLOR, IconMusic, IconChevronRight } from './icons'

/** Una invitación se lee como contenido compartido; su vigencia se comprueba al abrir. */
export function InvitacionJam({ texto }: { texto: string }) {
  const router = useRouter()
  const invitacion = invitacionEnTexto(texto)
  if (!invitacion) return <Text className="text-foreground text-[15px] leading-6">{texto}</Text>
  const { codigo, texto: resto } = invitacion
  return <View className="gap-3" style={{ width: '100%', maxWidth: 400 }}>
    {resto ? <Text className="text-foreground text-[15px] leading-6">{resto}</Text> : null}
    <View className="overflow-hidden rounded-2xl bg-muted">
      <Pressable accessibilityRole="button" accessibilityLabel={`Ver invitación al Jam ${codigo}`} onPress={() => router.push(`/jam/${codigo}`)}
        className="flex-row items-center gap-3 p-4 active:opacity-70">
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-card"><IconMusic size={22} color={ICON_COLOR.foreground} /></View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-muted-foreground text-[12px]">Invitación a un Jam</Text>
          <Text className="text-foreground text-[17px] font-semibold">Escuchemos juntos</Text>
          <Text className="text-muted-foreground text-[13px]">Abrir invitación</Text>
        </View>
        <IconChevronRight size={18} color={ICON_COLOR.muted} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Copiar código ${codigo}`}
        onPress={() => { void copiarAlPortapapeles(codigo).then(ok => avisar(ok ? 'Código copiado' : `Código del Jam: ${codigo}`)) }}
        className="min-h-11 flex-row items-center justify-between gap-3 px-4 pb-2 active:opacity-70">
        <Text className="text-muted-foreground text-[13px]">{codigo}</Text><Text className="text-foreground text-[13px] font-semibold">Copiar código</Text>
      </Pressable>
    </View>
  </View>
}
