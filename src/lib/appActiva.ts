import { useEffect, useState } from 'react'
import { AppState } from 'react-native'

/**
 * Si la app está a la vista.
 *
 * Existe por una razón concreta y cara: **esta app no se suspende al pasar a
 * segundo plano**. Pide el modo de audio de fondo para que la música siga con la
 * pantalla bloqueada, y el precio es que iOS la deja corriendo — con su
 * JavaScript, sus temporizadores y sus `requestAnimationFrame` girando igual que
 * si la estuvieras mirando.
 *
 * El código asumía lo contrario. Había cuatro bucles de posición sobre
 * `requestAnimationFrame`, y un comentario afirmando que «el sistema congela
 * `requestAnimationFrame` apenas la app deja de estar a la vista». Con audio de
 * fondo, no. El sistema mismo lo dictaminó al matar el proceso:
 *
 *     Event:        cpu usage
 *     Action taken: Process killed
 *     CPU:          48 seconds cpu time over 50 seconds (97% cpu average),
 *                   exceeding limit of 80% cpu over 60 seconds
 *
 * Ese es el límite que iOS aplica a una app de fondo: 80% de CPU sostenido
 * durante 60 segundos y te mata. Se veía como «dejo la música sonando y al rato
 * la app se cerró sola».
 *
 * La regla que sale de ahí, y que vale para cualquier bucle que se agregue
 * después: **nada que solo alimente píxeles debe correr con la pantalla
 * apagada.** La posición que se ve en la pantalla bloqueada no la dibuja esta
 * app —la publica el sistema desde `MPNowPlayingInfoCenter`, que expo-audio
 * mantiene del lado nativo— así que estos bucles no sostienen nada cuando no hay
 * nadie mirando.
 *
 * Lo que sí tiene que seguir vivo en segundo plano es el audio y los avisos del
 * reproductor (`playbackStatusUpdate`), que son nativos y no cuestan CPU de JS:
 * por eso el encadenado de una canción con la siguiente sigue funcionando con el
 * teléfono guardado.
 */
export function useAppActiva(): boolean {
  const [activa, setActiva] = useState(() => AppState.currentState === 'active')

  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      setActiva(estado === 'active')
    })
    return () => sub.remove()
  }, [])

  return activa
}
