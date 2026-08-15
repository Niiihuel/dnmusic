import { Image, View } from 'react-native'
import { artworkSource } from '../lib/artwork'
import { coverUrl } from '../services/playlists'
import { ICON_COLOR, IconMusic } from './icons'

/**
 * La portada de una lista.
 *
 * Tres estados, en orden de preferencia: la foto que se puso, el mosaico con
 * las carátulas de las primeras cuatro canciones, o el ícono. El mosaico es lo
 * que hace que una lista recién armada ya se vea como algo — es lo que hacen
 * Spotify y Apple Music, y por lo mismo: una lista se reconoce por sus tapas
 * mucho antes que por su nombre.
 */
export function PlaylistCover({
  covers,
  coverPath,
  size,
  rounded = 'rounded-lg',
}: {
  covers: string[]
  coverPath: string | null
  size: number
  rounded?: string
}) {
  const own = coverUrl(coverPath)

  if (own) {
    return (
      <Image source={{ uri: own }} className={`bg-muted ${rounded}`} style={{ width: size, height: size }} />
    )
  }

  if (covers.length === 0) {
    return (
      <View
        className={`items-center justify-center bg-muted ${rounded}`}
        style={{ width: size, height: size }}
      >
        <IconMusic size={Math.round(size * 0.34)} color={ICON_COLOR.muted} />
      </View>
    )
  }

  /*
   * El mosaico recién a partir de cuatro tapas.
   *
   * Con dos o tres, la cuadrícula deja huecos negros y la portada se ve rota,
   * no minimalista. Spotify hace lo mismo: hasta que hay cuatro, manda la
   * primera carátula sola.
   */
  const cell = covers.length < 4 ? size : size / 2
  return (
    <View
      className={`flex-row flex-wrap overflow-hidden bg-muted ${rounded}`}
      style={{ width: size, height: size }}
    >
      {covers.slice(0, covers.length < 4 ? 1 : 4).map((c, i) => (
        <Image
          /*
           * La posición, y no la carátula.
           *
           * Cuatro canciones del mismo disco tienen la **misma** tapa, y con la
           * URL de llave React avisaba por consola que había hijos repetidos —y
           * podía omitir cuadros del mosaico. Pasa siempre que se importa un
           * álbum entero; el orden acá es fijo, así que el índice alcanza.
           */
          key={i}
          /* Llegan como ruta de Storage o como URL suelta, según de dónde haya
             salido la carátula; se resuelven igual que en cualquier otro lado:
             nuestra copia primero. */
          source={{ uri: c.startsWith('http') ? c : (artworkSource(c, null, 240) ?? '') }}
          style={{ width: cell, height: cell }}
        />
      ))}
    </View>
  )
}
