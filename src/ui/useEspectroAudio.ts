import { useEffect } from 'react'
import type { AudioPlayer } from 'expo-audio'
import { Platform } from 'react-native'
import { crearAnalizador } from '../lib/espectro'
import { publicarEspectro } from '../state/espectro'

/** Una sola captura por reproductor, limitada a 20 actualizaciones por segundo. */
export function useEspectroAudio(
  player: AudioPlayer,
  videoId: string | undefined,
  activo: boolean,
) {
  useEffect(() => {
    publicarEspectro(null, null)
    if (!activo || !videoId || (Platform.OS !== 'web' && !player.isAudioSamplingSupported)) return
    const analizar = crearAnalizador()
    let ultima = 0
    let subscription: { remove(): void } | undefined
    try {
      subscription = player.addListener('audioSampleUpdate', (sample) => {
        const ahora = Date.now()
        if (ahora - ultima < 50) return
        ultima = ahora
        publicarEspectro(videoId, analizar(sample.channels))
      })
      player.setAudioSamplingEnabled(true)
    } catch {
      // Plataformas sin acceso a PCM mantienen un indicador estático.
      subscription?.remove()
      subscription = undefined
    }
    return () => {
      subscription?.remove()
      try {
        player.setAudioSamplingEnabled(false)
      } catch {
        /* Reproductor liberado. */
      }
      publicarEspectro(null, null)
    }
  }, [player, videoId, activo])
}
