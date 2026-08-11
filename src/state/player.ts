import { useCallback, useEffect, useRef, useState } from 'react'
import { useAudioPlayer } from 'expo-audio'
import type { SongSnippet } from '../models/message'
import { headroomGain, signedUrl } from '../services/music'
import { pauseForSnippet, registerSnippetStopper } from './playback'
import { saltar } from '../lib/seek'

/** Mínimo entre dos saltos al mismo punto. Ver el loop de reproducción. */
const SEEK_RETRY_MS = 600

/**
 * Reproductor de fragmentos.
 *
 * Reproduce solo la ventana elegida del tema y vuelve a empezar al llegar al
 * final. La posición se lee con requestAnimationFrame y no con el status del
 * player: el status refresca a intervalos fijos y la letra se vería saltar.
 *
 * Las URLs de Storage se firman al momento de reproducir, no se guardan en el
 * mensaje: una URL firmada vence, y un mensaje se relee meses después.
 *
 * Es el otro reproductor de la app, aparte del de la barra de abajo. Se turnan:
 * empezar un fragmento pausa la lista, y arrancar la lista corta el fragmento.
 * Sonar los dos encimados no le sirve a nadie.
 */
export function useSnippetPlayer() {
  const [current, setCurrent] = useState<{ id: string; song: SongSnippet } | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [positionMs, setPositionMs] = useState(0)
  const raf = useRef<number | null>(null)
  const pendingPositionMs = useRef<number | null>(null)
  /** Cuándo se pidió el último salto, para no encimar saltos (ver el loop). */
  const seekAt = useRef(0)

  const player = useAudioPlayer(url ? { uri: url } : null)

  /*
   * Se atenúa lo justo para que el códec no distorsione al recortar contra el
   * fondo de escala. Los fragmentos viejos no traen su pico medido; para esos
   * `headroomGain` aplica un margen fijo que cubre lo observado.
  */
  useEffect(() => {
    // expo-audio expone el volumen como una propiedad mutable del reproductor.
    // eslint-disable-next-line react-hooks/immutability
    player.volume = headroomGain(current?.song.truePeak)
  }, [player, current])

  /*
   * Que alguien pidió escuchar el fragmento.
   *
   * El efecto de más abajo arranca la reproducción cuando llega la URL firmada,
   * y **solo** si hay un pedido pendiente. Sin esta marca, cualquier cosa que
   * volviera a correr el efecto —un re-render mientras escribís en el chat, por
   * ejemplo— pausaba la música de la cola y largaba el fragmento otra vez desde
   * su principio, sin que nadie hubiera tocado nada.
   */
  const pedido = useRef(false)

  const stop = useCallback(() => {
    player.pause()
    pendingPositionMs.current = null
    pedido.current = false
    setPlaying(false)
    setCurrent(null)
    setUrl(null)
  }, [player])

  // La barra de abajo necesita poder frenar esto antes de arrancar una lista.
  useEffect(() => registerSnippetStopper(stop), [stop])

  const toggle = useCallback(
    async (id: string, song: SongSnippet) => {
      if (current?.id === id) {
        if (playing) {
          player.pause()
          setPlaying(false)
        } else {
          /*
           * Se reanuda donde quedó, no siempre desde el principio.
           *
           * Si alguien arrastró la barra con la canción en pausa, arrancar de
           * cero le deshace el movimiento. Solo se vuelve al inicio cuando la
           * posición está fuera del fragmento, que es el caso de haber
           * terminado: ahí darle play es empezar de nuevo.
           */
          const inside = positionMs >= song.startMs && positionMs < song.startMs + song.durationMs
          const from = inside ? positionMs : song.startMs
          seekAt.current = performance.now()
          await player.seekTo(from / 1000)
          setPositionMs(from)
          pauseForSnippet()
          player.play()
          setPlaying(true)
        }
        return
      }
      player.pause()
      setPlaying(false)
      setPositionMs(song.startMs)
      pendingPositionMs.current = null
      pedido.current = true
      setCurrent({ id, song })
      setUrl(await signedUrl(song.path))
    },
    [current, playing, player, positionMs],
  )

  const seek = useCallback(
    async (id: string, song: SongSnippet, fraction: number) => {
      /*
       * Una fracción no finita llega más seguido de lo que parece: quien llama
       * la calcula dividiendo por el ancho de la barra, y ese ancho es 0 en el
       * primer cuadro, antes del layout. Sin este corte, el NaN viaja hasta
       * `currentTime` y el navegador tira una excepción que rompe el toque.
       */
      if (!Number.isFinite(fraction)) return
      const clampedFraction = Math.max(0, Math.min(1, fraction))
      const targetMs = song.startMs + song.durationMs * clampedFraction

      if (current?.id === id) {
        /*
         * Marcar el salto es lo que evita que el loop lo pise: hasta que el
         * salto termina, `currentTime` sigue devolviendo la posición vieja, que
         * puede estar fuera del fragmento — y el loop la "corregiría" mandando
         * la reproducción al principio, deshaciendo el arrastre recién hecho.
         */
        seekAt.current = performance.now()
        await player.seekTo(targetMs / 1000)
        setPositionMs(targetMs)
        return
      }

      player.pause()
      setPlaying(false)
      setPositionMs(targetMs)
      pendingPositionMs.current = targetMs
      pedido.current = true
      setCurrent({ id, song })
      setUrl(await signedUrl(song.path))
    },
    [current, player],
  )

  // Arrancar cuando la URL firmada ya está cargada en el player, y solo si
  // alguien lo pidió: este efecto no puede disparar audio por su cuenta.
  useEffect(() => {
    if (!url || !current || !pedido.current) return
    pedido.current = false
    let cancelled = false
    ;(async () => {
      const initialPositionMs = pendingPositionMs.current ?? current.song.startMs
      pendingPositionMs.current = null
      seekAt.current = performance.now()
      await player.seekTo(initialPositionMs / 1000)
      if (cancelled) return
      // Turno del fragmento: la lista se pausa donde esté.
      pauseForSnippet()
      player.play()
      setPlaying(true)
    })()
    return () => {
      cancelled = true
    }
  }, [url, current, player])

  useEffect(() => {
    if (!playing || !current) {
      if (raf.current) cancelAnimationFrame(raf.current)
      raf.current = null
      return
    }
    const { startMs, durationMs } = current.song
    const tick = () => {
      const ms = player.currentTime * 1000
      // Antes de que el audio esté listo la posición puede no ser un número, y
      // `NaN !== NaN` daba por bueno el salto una y otra vez.
      if (Number.isFinite(ms)) {
        if (ms >= startMs + durationMs) {
          /*
           * Al final del fragmento se para, no se vuelve a empezar.
           *
           * Antes volvía al principio para siempre: un mensaje abierto seguía
           * sonando en loop hasta que alguien lo frenara a mano. Se queda al
           * final y con la barra llena; volver a darle play arranca de nuevo
           * desde el inicio del fragmento, que de eso ya se ocupa `toggle`.
           */
          player.pause()
          setPlaying(false)
          setPositionMs(startMs + durationMs)
          return
        }

        if (ms < startMs - 250) {
          /*
           * Todavía no llegó al fragmento: el salto inicial puede tardar, y
           * hasta que termina `currentTime` sigue devolviendo el valor viejo.
           * Se pide UNA vez y se reintenta por tiempo — repetirlo por cuadro
           * encadenaba sesenta saltos por segundo, cada uno cancelando al
           * anterior y vaciando el búfer, y eso sonaba a estática.
           */
          const now = performance.now()
          if (now - seekAt.current > SEEK_RETRY_MS) {
            seekAt.current = now
            saltar(player, startMs / 1000)
          }
          setPositionMs(startMs)
        } else {
          seekAt.current = 0
          setPositionMs(ms)
        }
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [playing, current, player])

  return { currentId: current?.id ?? null, playing, positionMs, toggle, seek, stop }
}
