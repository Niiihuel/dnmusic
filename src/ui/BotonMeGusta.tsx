import { useRef, useState } from 'react'
import { ActivityIndicator, Pressable } from 'react-native'
import { avisar } from '../state/aviso'
import type { PlaylistTrack } from '../services/playlists'
import { alternarMeGusta, useEsGustada } from '../state/gustos'
import { ICON_COLOR, IconHeart, IconHeartFilled } from './icons'
import { useConTooltip } from './Tooltip'

/**
 * El corazón: marcar la canción que suena como me gusta.
 *
 * Es un solo componente porque aparece en varios reproductores —la pantalla
 * Sonando del teléfono, la píldora del escritorio— y el estado tiene que ser
 * el mismo en todos: el corazón es de la **canción** (por `videoId`), no del
 * botón que tocaste.
 *
 * Monocromo como todo lo demás (ver docs/DESIGN.md): marcado es el corazón
 * **relleno en blanco** —el acento, como cualquier estado activo—; sin marcar
 * es el contorno en gris de estado inactivo. Nada de rojo: acá el color no
 * existe.
 */
export function BotonMeGusta({
  track,
  size = 22,
  lado = 44,
  resolver,
}: {
  track: PlaylistTrack | null
  /** Tamaño del glifo. */
  size?: number
  /** Lado del área de toque, cuadrada y redonda como los demás controles. */
  lado?: number
  /** Un álbum puede guardar un me gusta antes de haber reproducido el audio. */
  resolver?: () => Promise<PlaylistTrack>
}) {
  const gustada = useEsGustada(track?.videoId)
  const [ocupado, setOcupado] = useState(false)
  const guardando = useRef(false)
  /* Antes del `return null`: los hooks no se llaman a medias. */
  const tip = useConTooltip(gustada ? 'Quitar de tus me gusta' : 'Me gusta')
  if (!track) return null
  async function alternar() {
    if (!track || guardando.current) return
    if (gustada || !resolver) { alternarMeGusta(track); return }
    guardando.current = true
    setOcupado(true)
    try {
      alternarMeGusta(await resolver())
    } catch {
      avisar('No se pudo guardar el me gusta.', true)
    } finally {
      guardando.current = false
      setOcupado(false)
    }
  }
  return (
    <Pressable
      {...tip.gestos}
      accessibilityRole="button"
      accessibilityLabel={gustada ? 'Quitar de tus me gusta' : 'Me gusta'}
      accessibilityState={{ selected: gustada, busy: ocupado, disabled: ocupado }}
      disabled={ocupado}
      onPress={() => void alternar()}
      className="items-center justify-center rounded-full active:opacity-60"
      style={{ width: lado, height: lado }}
      hitSlop={4}
    >
      {ocupado ? <ActivityIndicator size="small" color={ICON_COLOR.muted} /> : gustada ? (
        <IconHeartFilled size={size} color={ICON_COLOR.foreground} />
      ) : (
        <IconHeart size={size} color={ICON_COLOR.muted} />
      )}
    </Pressable>
  )
}
