import { useEffect, useState } from 'react'
import { AppState, Platform, Pressable, Text, View } from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import { IconPlay } from './icons'

/** El reproductor sólo se monta por pedido explícito y nunca toma el audio de la música. */
export function VideoVersion(props: { url: string; descripcion: string; onError: () => void }) {
  const [reproducir, setReproducir] = useState(false)
  useEffect(() => {
    const app = AppState.addEventListener('change', estado => { if (estado !== 'active') setReproducir(false) })
    const doc = Platform.OS === 'web' && typeof document !== 'undefined' ? document : undefined
    const ocultar = () => { if (doc?.hidden) setReproducir(false) }
    doc?.addEventListener('visibilitychange', ocultar)
    return () => { app.remove(); doc?.removeEventListener('visibilitychange', ocultar) }
  }, [])
  if (reproducir) return <View style={{ gap: 8 }}><Reproductor {...props} /><Pressable accessibilityRole="button" onPress={() => setReproducir(false)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: '#b3b3b3' }}>Cerrar video</Text></Pressable></View>
  return <Pressable accessibilityRole="button" accessibilityLabel={`Ver video sin sonido: ${props.descripcion}`} onPress={() => setReproducir(true)} style={{ minHeight: 150, borderRadius: 14, backgroundColor: '#101010', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
    <IconPlay size={25} /><Text style={{ color: '#b3b3b3' }}>Ver la novedad · Sin sonido</Text>
  </Pressable>
}
function Reproductor({ url, descripcion, onError }: { url: string; descripcion: string; onError: () => void }) {
  const player = useVideoPlayer(url, p => { p.muted = true; p.audioMixingMode = 'mixWithOthers'; p.showNowPlayingNotification = false; p.play() })
  useEffect(() => {
    const listener = player.addListener('statusChange', ({ status }) => { if (status === 'error') onError() })
    return () => listener.remove()
  }, [player, onError])
  return <VideoView player={player} accessibilityLabel={descripcion} nativeControls={false} contentFit="contain" style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 14 }} />
}
