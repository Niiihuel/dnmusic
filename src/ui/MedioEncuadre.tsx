import { useEffect } from 'react'
import { Image } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import { esVideo } from '../services/showcases'

type Props = { uri: string; onLoad: (width: number, height: number) => void; onError: () => void }

/** Mismo visor para foto, GIF y video; nunca recodifica el original. */
export function MedioEncuadre(props: Props) {
  if (esVideo(props.uri)) return <VideoEncuadre {...props} />
  return <Image source={{ uri: props.uri }} contentFit="cover" autoplay transition={0}
    style={{ width: '100%', height: '100%' }}
    onLoad={e => props.onLoad(e.source.width, e.source.height)} onError={props.onError} />
}

function VideoEncuadre({ uri, onLoad, onError }: Props) {
  const player = useVideoPlayer(uri, p => {
    p.muted = true
    p.audioMixingMode = 'mixWithOthers'
    p.showNowPlayingNotification = false
    // El encuadre trabaja con un fotograma estable, sin interrumpir la música.
    p.pause()
  })
  useEffect(() => {
    const medir = () => {
      const size = (player.videoTrack ?? player.availableVideoTracks[0])?.size
      if (size?.width && size.height) onLoad(size.width, size.height)
    }
    const estado = player.addListener('statusChange', e => { if (e.status === 'error') onError(); else if (e.status === 'readyToPlay') medir() })
    const fuente = player.addListener('sourceLoad', medir)
    medir()
    return () => { estado.remove(); fuente.remove() }
  }, [player, onLoad, onError])
  return <VideoView player={player} nativeControls={false} contentFit="cover" playsInline
    allowsVideoFrameAnalysis={false} surfaceType="textureView" style={{ width: '100%', height: '100%' }} />
}
