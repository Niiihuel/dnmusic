import { BotonSuperficie } from './BotonSuperficie'
import { Text } from 'react-native'
import { useRouter } from 'expo-router'
import { abrirArtista } from '../state/shell'
import { TECLADO_FISICO } from '../lib/teclado'

/** Nombre navegable sólo cuando conocemos el id real del artista. */
export function EnlaceArtista({ id, nombre, size = 14 }: { id?: string | null; nombre: string; size?: number }) {
  const router = useRouter()
  const texto = <Text numberOfLines={1} className="text-muted-foreground" style={{ fontSize: size }}>{nombre}</Text>
  if (!id) return texto
  return <BotonSuperficie accessibilityRole="link" accessibilityLabel={`Ver artista: ${nombre}`}
    onPress={() => { abrirArtista(id, nombre); router.dismissTo('/') }}
    className="min-w-0 self-start justify-center rounded active:opacity-70 hover:bg-white/5"
    style={{ maxWidth: '100%', minHeight: TECLADO_FISICO ? 20 : 44 }}>
    {texto}
  </BotonSuperficie>
}
