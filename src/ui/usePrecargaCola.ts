import { useEffect, useRef, useState } from 'react'
import type { AudioPlayer } from 'expo-audio'
import { Platform } from 'react-native'
import { prepararBuffer, liberarBuffer } from '../lib/prepararBuffer'
import type { PlaylistTrack } from '../services/playlists'
import { resolveSong, signedUrl } from '../services/music'
import { useAjustes, useAjustesCargados } from '../state/ajustes'
import { useRedPrecarga } from '../state/redPrecarga'
import { completarCancion, getPlaybackState } from '../state/playback'
import { HAY_DESCARGAS, prepararCache, priorizarReproduccion, protegerDescargas, rutaLocal } from '../state/descargas'

/** Trabaja después de que el audio empezó; una sola preparación a la vez. */
export function usePrecargaCola({ current, proximas, url, player, wantPlay, mudo, remember, olvidar }: {
  current: PlaylistTrack | null; proximas: PlaylistTrack[]; url: string | null
  player: AudioPlayer; wantPlay: boolean; mudo: boolean
  remember: (id: string, url: string) => void
  olvidar: (id: string, url: string) => void
}) {
  const { precargaAutomatica, precargaDatos } = useAjustes()
  const ajustesListos = useAjustesCargados()
  const red = useRedPrecarga(precargaDatos)
  const [estado, setEstado] = useState({ url: null as string | null, lista: false })
  const buffers = useRef(new Map<string, string>())
  const preparada = estado.url === url && estado.lista

  useEffect(() => {
    const sub = player.addListener('playbackStatusUpdate', status => {
      const lista = status.isLoaded && !status.isBuffering && status.playing
      setEstado(prev => prev.url === url && prev.lista === lista ? prev : { url, lista })
    })
    return () => sub.remove()
  }, [player, url])

  useEffect(() => {
    priorizarReproduccion(!mudo && wantPlay && !preparada)
    return () => priorizarReproduccion(false)
  }, [mudo, wantPlay, preparada])

  useEffect(() => {
    const protegidas = [current, ...proximas].filter((t): t is PlaylistTrack => !!t)
    protegerDescargas(protegidas.flatMap(t => [t.audioPath, `video:${t.videoId}`]).filter(Boolean))
    const ids = new Set(protegidas.map(t => t.id))
    for (const [id, uri] of buffers.current) {
      if (ids.has(id)) continue
      liberarBuffer(uri)
      olvidar(id, uri)
      buffers.current.delete(id)
    }
  }, [current, proximas, olvidar])

  useEffect(() => {
    if (!ajustesListos || !current || !precargaAutomatica || !red || mudo || !wantPlay || !preparada) return
    const abort = new AbortController()
    const sigue = () => !abort.signal.aborted
    const esActual = (id: string) => {
      const estado = getPlaybackState()
      return (estado.manual ?? estado.tracks[estado.index])?.id === id
    }
    const trabajar = async () => {
      for (const original of proximas) {
        if (!sigue()) return
        let track = original
        const buffer = buffers.current.get(track.id)
        if (buffer) { if (!esActual(track.id)) remember(track.id, buffer); continue }
        try {
          let remota: string | undefined
          if (!track.audioPath) {
            const song = await resolveSong({ ...track, album: '', albumId: null }, abort.signal)
            if (!sigue()) return
            track = { ...track, audioPath: song.path, artworkPath: song.artworkPath, durationMs: song.durationMs }
            remota = song.url
          }
          let local = rutaLocal(track.audioPath)
          if (!local && HAY_DESCARGAS) local = await prepararCache(track, abort.signal)
          if (!sigue()) return
          if (!local) {
            if (HAY_DESCARGAS || Platform.OS !== 'web') continue
            // Navegador sin disco offline: máximo los buffers de esta ventana.
            const uri = remota ?? await signedUrl(track.audioPath)
            if (!sigue()) return
            const buffer = await prepararBuffer(uri, abort.signal)
            if (!sigue()) { liberarBuffer(buffer); return }
            buffers.current.set(track.id, buffer)
            if (!esActual(track.id)) remember(track.id, buffer)
          }
          if (original.audioPath !== track.audioPath) completarCancion(track.videoId, {
            audioPath: track.audioPath, artworkPath: track.artworkPath, durationMs: track.durationMs,
          })
        } catch {
          // Una precarga fallida no borra canciones elegidas ni corta la cola.
          // Al tocarla, reproducción reintentará con su prioridad normal.
          if (!sigue()) return
        }
      }
    }
    // Dejar estabilizar el buffer antes de disputar ancho de banda.
    const timer = setTimeout(() => { void trabajar() }, 1200)
    return () => { clearTimeout(timer); abort.abort() }
  }, [current, proximas, ajustesListos, precargaAutomatica, red, mudo, wantPlay, preparada, remember])
}
