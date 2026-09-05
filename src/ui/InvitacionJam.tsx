import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { invitacionEnTexto } from '../lib/invitacionJam'
import { copiarAlPortapapeles } from '../lib/portapapeles'
import { avisar } from '../state/aviso'
import { ICON_COLOR, IconMusic } from './icons'

/** No consulta cada Jam histórico: su vigencia se comprueba al abrirlo. */
export function InvitacionJam({ texto }: { texto: string }) {
  const router = useRouter()
  const invitacion = invitacionEnTexto(texto)
  if (!invitacion) return <Text className="text-foreground text-[15px] leading-6">{texto}</Text>
  const { codigo, texto: resto } = invitacion
  return (
    <View className="gap-3" style={{ width: '100%', maxWidth: 380 }}>
      {resto ? <Text className="text-foreground text-[15px] leading-6">{resto}</Text> : null}
      <View className="gap-4 rounded-2xl bg-background p-4">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
            <IconMusic size={19} color={ICON_COLOR.foreground} />
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-muted-foreground text-[10px] font-semibold uppercase tracking-[1.5px]">
              Invitación a un Jam
            </Text>
            <Text className="text-foreground text-[17px] font-bold">Escuchemos juntos</Text>
          </View>
        </View>
        <Text className="text-muted-foreground text-[12px] leading-5">
          Una misma música, estés donde estés.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ver invitación al Jam ${codigo}`}
          onPress={() => router.push(`/jam/${codigo}`)}
          className="min-h-11 items-center justify-center rounded-full bg-primary px-4 py-3 active:opacity-80"
        >
          <Text className="text-primary-foreground text-[13px] font-bold">Ver invitación →</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Copiar código ${codigo}`}
          onPress={() => {
            void copiarAlPortapapeles(codigo).then((ok) =>
              avisar(ok ? 'Código copiado' : `Código del Jam: ${codigo}`),
            )
          }}
          className="min-h-11 flex-row flex-wrap items-center justify-between gap-2 rounded-lg px-1 active:opacity-60"
        >
          <Text className="text-muted-foreground text-[11px]">Código · {codigo}</Text>
          <Text className="text-foreground text-[11px]">Copiar</Text>
        </Pressable>
      </View>
    </View>
  )
}
