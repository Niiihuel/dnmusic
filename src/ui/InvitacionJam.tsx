import { Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { invitacionEnTexto } from '../lib/invitacionJam'
import { copiarAlPortapapeles } from '../lib/portapapeles'
import { avisar } from '../state/aviso'
import { FilaSocial } from './FilaSocial'

/** Una invitación se lee como contenido compartido; su vigencia se comprueba al abrir. */
export function InvitacionJam({ texto }: { texto: string }) {
  const router = useRouter()
  const invitacion = invitacionEnTexto(texto)
  if (!invitacion) return <Text className="text-foreground text-subheadline leading-6">{texto}</Text>
  const { codigo, texto: resto } = invitacion
  return <View className="gap-3" style={{ width: '100%', maxWidth: 400 }}>
    {resto ? <Text className="text-foreground text-subheadline leading-6">{resto}</Text> : null}
    <View className="overflow-hidden rounded-2xl bg-muted">
      <FilaSocial titulo="Escuchemos juntos" detalle="Invitación a un Jam" valor="Abrir invitación"
        label={`Ver invitación al Jam ${codigo}`} onPress={() => router.push(`/jam/${codigo}`)} />
      <FilaSocial titulo={codigo} valor="Copiar código" label={`Copiar código ${codigo}`}
        onPress={() => { void copiarAlPortapapeles(codigo).then(ok => avisar(ok ? 'Código copiado' : `Código del Jam: ${codigo}`)) }} />
    </View>
  </View>
}
