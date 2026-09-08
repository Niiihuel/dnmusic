import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import type { AudioPlayer } from 'expo-audio'
import { RemoteCommands } from '../../modules/remote-commands'
import {
  pausePlayback,
  playNext,
  playPrevious,
  resumePlayback,
  seekToMs,
  stopPlayback,
} from './playback'

/**
 * Los controles de afuera de la app: pantalla bloqueada, auriculares, el auto.
 *
 * Es la diferencia entre poner música para manejar y tener que desbloquear el
 * teléfono para pasar de tema.
 *
 * expo-audio ya sabe publicar la ficha (título, artista, carátula) y lo hace
 * con `setActiveForLockScreen`. Lo que **no** trae son los botones de anterior
 * y siguiente: no registra `nextTrackCommand` ni `previousTrackCommand`, y
 * desde JavaScript no hay forma de agregarlos. Eso lo aporta nuestro módulo
 * `remote-commands`, que solo avisa cuál se tocó — la cola sigue siendo la
 * única que decide qué suena.
 *
 * En web el equivalente es `mediaSession`, que sí deja registrar todo desde
 * JavaScript. El último que registra gana, así que basta con hacerlo después.
 */

type Handler = (details: { seekTime?: number | null }) => void

/** Lo que usamos de `navigator.mediaSession`, sin depender de los tipos del DOM. */
type MediaSession = {
  setActionHandler: (action: string, handler: Handler | null) => void
}

function mediaSession(): MediaSession | null {
  if (Platform.OS !== 'web') return null
  const nav = globalThis.navigator as { mediaSession?: MediaSession } | undefined
  return nav?.mediaSession ?? null
}

export type LockScreenTrack = {
  title: string
  artist: string
  /** Lista de la que salió; va donde iría el álbum. */
  collection: string
  /** Absoluta: la carátula la descarga el sistema operativo, no la app. */
  artworkUrl: string | null
}

const LOCK_SCREEN_OPTIONS = {
  isLiveStream: false,
  showSeekForward: false,
  showSeekBackward: false,
} as const

function publicarFicha(player: AudioPlayer, track: LockScreenTrack): void {
  player.setActiveForLockScreen(
    true,
    {
      title: track.title,
      artist: track.artist,
      albumTitle: track.collection,
      artworkUrl: track.artworkUrl ?? undefined,
    },
    LOCK_SCREEN_OPTIONS,
  )
}

export function useLockScreen(
  player: AudioPlayer,
  track: LockScreenTrack | null,
  appActiva = true,
) {
  const { title, artist, collection, artworkUrl } = track ?? {}
  const estabaActiva = useRef(appActiva)

  useEffect(() => {
    if (!title) return

    /*
     * Todo esto se apoya en APIs que dependen de la plataforma y del navegador:
     * Safari viejo no trae mediaSession, y `setActionHandler` tira si le pasás
     * una acción que no conoce. Nada de esto vale romper la reproducción, así
     * que va todo defendido.
     */
    try {
      publicarFicha(player, {
        title,
        artist: artist ?? '',
        collection: collection ?? '',
        artworkUrl: artworkUrl ?? null,
      })
    } catch {
      // Sin ficha en la pantalla bloqueada, pero sonando.
    }

    /*
     * Los botones que expo-audio no pone. Sin el módulo en el binario —web, o
     * un build viejo— esto no hace nada y los botones simplemente no aparecen.
     */
    const remoto = RemoteCommands
    remoto?.start()
    const siguiente = remoto?.addListener('onNext', playNext)
    const anterior = remoto?.addListener('onPrevious', playPrevious)

    const session = mediaSession()
    if (session) {
      const on = (action: string, handler: Handler | null) => {
        try {
          session.setActionHandler(action, handler)
        } catch {
          // El navegador no conoce esa acción: no se dibuja el botón y ya.
        }
      }
      on('play', resumePlayback)
      on('pause', pausePlayback)
      on('stop', stopPlayback)
      on('nexttrack', playNext)
      on('previoustrack', playPrevious)
      on('seekto', (details) => {
        if (details.seekTime != null) seekToMs(details.seekTime * 1000)
      })
    }

    return () => {
      siguiente?.remove()
      anterior?.remove()
      remoto?.stop()
      try {
        player.setActiveForLockScreen(false)
      } catch {
        // Ya estaba liberado.
      }
    }
  }, [player, title, artist, collection, artworkUrl])

  /*
   * Si otro audio tomó Control Center mientras DMusic estaba pausado, iOS
   * conserva el AVPlayer pero reemplaza su ficha. Al volver al frente se
   * publica la misma ficha otra vez, sin cambiar la fuente ni ordenar play().
   */
  useEffect(() => {
    const volvio = !estabaActiva.current && appActiva
    estabaActiva.current = appActiva
    if (!volvio || !title) return
    try {
      publicarFicha(player, {
        title,
        artist: artist ?? '',
        collection: collection ?? '',
        artworkUrl: artworkUrl ?? null,
      })
      RemoteCommands?.start()
    } catch {
      // El audio sigue disponible aunque el sistema rechace la ficha.
    }
  }, [appActiva, player, title, artist, collection, artworkUrl])
}
