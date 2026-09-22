import { useEffect, useRef, useState } from 'react'
import type { AudioPlayer } from 'expo-audio'
import { Platform } from 'react-native'
import { prepararBuffer, liberarBuffer } from '../lib/prepararBuffer'
import type { PlaylistTrack } from '../services/playlists'
import { resolveSong, signedUrl } from '../services/music'
import { useAjustes, useAjustesCargados } from '../state/ajustes'
import { useTipoRedPrecarga } from '../state/redPrecarga'
import { ventanaPrecarga } from '../lib/politicaPrecarga'
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
  const red = useTipoRedPrecarga(precargaDatos)
  const [estado, setEstado] = useState({ url: null as string | null, lista: false })
  const buffers = useRef(new Map<string, string>())
  const fallos = useRef(new Map<string, number>())
  const [propietario] = useState(() => Symbol('precarga'))
  const ventana = ventanaPrecarga(proximas, red, HAY_DESCARGAS)
  const claveVentana = JSON.stringify(ventana.map(t => [t.id, t.videoId]))
  const habilitada = ajustesListos && precargaAutomatica && !mudo
  const protegidas = [current, ...(habilitada ? ventana : [])].filter((t): t is PlaylistTrack => !!t)
  const claveProteccion = JSON.stringify(protegidas.flatMap(t => [t.audioPath, `video:${t.videoId}`]).filter(Boolean))
  const idsProtegidos = JSON.stringify(protegidas.map(t => t.id))
  const datos = useRef({ ventana, remember, olvidar })
  useEffect(() => { datos.current = { ventana, remember, olvidar } })
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
    protegerDescargas(JSON.parse(claveProteccion), propietario)
    const ids = new Set<string>(JSON.parse(idsProtegidos))
    for (const id of fallos.current.keys()) if (!ids.has(id)) fallos.current.delete(id)
    for (const [id, uri] of buffers.current) {
      if (ids.has(id)) continue
      liberarBuffer(uri)
      datos.current.olvidar(id, uri)
      buffers.current.delete(id)
    }
  }, [claveProteccion, idsProtegidos, propietario])

  useEffect(() => {
    const retenidos = buffers.current
    return () => {
      protegerDescargas([], propietario)
      for (const [id, uri] of retenidos) { liberarBuffer(uri); datos.current.olvidar(id, uri) }
      retenidos.clear()
    }
  }, [propietario])

  useEffect(() => {
    if (!habilitada || !current?.id || red === 'no' || !wantPlay || !preparada) return
    const abort = new AbortController()
    const sigue = () => !abort.signal.aborted
    const esActual = (id: string) => {
      const estado = getPlaybackState()
      return (estado.manual ?? estado.tracks[estado.index])?.id === id
    }
    let timer: ReturnType<typeof setTimeout>
    const trabajar = async () => {
      for (const [posicion, original] of datos.current.ventana.entries()) {
        if (!sigue()) return
        let track = original
        const buffer = buffers.current.get(track.id)
        if (buffer) { if (!esActual(track.id)) datos.current.remember(track.id, buffer); continue }
        if ((fallos.current.get(track.id) ?? 0) >= 2) continue
        try {
          let remota: string | undefined
          if (!track.audioPath) {
            const song = await resolveSong({ ...track, album: '', albumId: null }, abort.signal)
            if (!sigue()) return
            track = { ...track, audioPath: song.path, artworkPath: song.artworkPath, durationMs: song.durationMs || track.durationMs }
            remota = song.url
            completarCancion(track.videoId, {
              audioPath: track.audioPath, artworkPath: track.artworkPath, durationMs: track.durationMs,
            })
          }
          let local = rutaLocal(track.audioPath)
          if (!local && HAY_DESCARGAS) local = await prepararCache(track, abort.signal)
          if (!sigue()) return
          if (local && Platform.OS === 'ios' && posicion === 0) {
            // El siguiente AVPlayerItem se prepara mientras el actual mantiene viva
            // la sesión; entregar su URI antes del fin evita firmar bajo bloqueo.
            if (!esActual(track.id)) datos.current.remember(track.id, local)
            const buffer = await prepararBuffer(local, abort.signal)
            if (!sigue()) { liberarBuffer(buffer); return }
            buffers.current.set(track.id, buffer)
          }
          if (!local) {
            if (HAY_DESCARGAS || Platform.OS !== 'web') continue
            // Navegador sin disco offline: máximo los buffers de esta ventana.
            const uri = remota ?? await signedUrl(track.audioPath)
            if (!sigue()) return
            const buffer = await prepararBuffer(uri, abort.signal)
            if (!sigue()) { liberarBuffer(buffer); return }
            buffers.current.set(track.id, buffer)
            if (!esActual(track.id)) datos.current.remember(track.id, buffer)
          }
          fallos.current.delete(track.id)
        } catch {
          // Una precarga fallida no borra canciones elegidas ni corta la cola.
          // Al tocarla, reproducción reintentará con su prioridad normal.
          if (!sigue()) return
          // Dos oportunidades por ventana, sin bucles al cambiar metadata o estado.
          fallos.current.set(track.id, (fallos.current.get(track.id) ?? 0) + 1)
        }
      }
      if (sigue() && datos.current.ventana.some(t => fallos.current.get(t.id) === 1)) {
        timer = setTimeout(() => { void trabajar() }, 2000)
      }
    }
    // Dejar estabilizar el buffer antes de disputar ancho de banda.
    timer = setTimeout(() => { void trabajar() }, 1200)
    return () => { clearTimeout(timer); abort.abort() }
  }, [current?.id, claveVentana, habilitada, red, wantPlay, preparada])
}
