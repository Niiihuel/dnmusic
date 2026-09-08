import { FlatList, Pressable, View } from 'react-native'
import { artworkSource } from '../lib/artwork'
import type { PlaylistTrack } from '../services/playlists'
import { alternarMeGusta, useMeGusta, useMeGustaCargado } from '../state/gustos'
import {
  playQueue,
  togglePlayback,
  usePlaybackOriginId,
  usePlaybackTrack,
  useWantPlay,
} from '../state/playback'
import { usePiso, useTecho } from '../state/shell'
import { useColapso } from './useColapso'
import { CollectionHeader, CollectionTitle, useCoverSize } from './CollectionHeader'
import { Panel } from './Panel'
import { SkeletonList } from './Skeleton'
import { formatLength } from './SeekBar'
import { TrackColumnHeader, TrackRow } from './TrackRow'
import { Menu, type MenuItem } from './Menu'
import { BotonAleatorio } from './Transport'
import { Vacio } from './Vacio'
import {
  ICON_COLOR,
  IconHeart,
  IconHeartFilled,
  IconPause,
  IconPlay,
} from './icons'

/**
 * «Tus me gusta»: todas las canciones con corazón, como la lista homónima de
 * Spotify.
 *
 * No es una playlist —no tiene fila en `playlists` ni se edita como una— sino
 * la cara visible de la tabla `me_gusta`: marcar y desmarcar desde cualquier
 * reproductor la actualiza sola, porque las filas salen del mismo estado que
 * alimenta los corazones. Por eso tampoco hay «quitar de la lista»: quitar ES
 * desmarcar.
 */

/** El id de origen con que esta colección entra a la cola. No es una lista de
 *  verdad, así que quien abre «ver la lista» tiene que reconocerlo. */
export const ORIGEN_GUSTOS = 'gustos'

export function MeGustaView({
  onSearch,
  menuFor,
}: {
  /** Manda al buscador cuando todavía no hay nada marcado. */
  onSearch?: () => void
  /** Las opciones de siempre de una canción (agregar a una lista, ir al
   *  artista…); la de desmarcar se suma acá. */
  menuFor?: (track: PlaylistTrack) => MenuItem[]
}) {
  const canciones = useMeGusta()
  const cargado = useMeGustaCargado()
  const soundingTrack = usePlaybackTrack()
  const soundingPlay = useWantPlay()
  const originId = usePlaybackOriginId()
  const piso = usePiso(16)
  const techo = useTecho()
  const colapso = useColapso()
  const cover = useCoverSize()

  const total = canciones.length
  const totalMs = canciones.reduce((sum, t) => sum + t.durationMs, 0)
  /* Suena esta colección: el botón grande pausa/sigue en vez de reiniciarla. */
  const mine = originId === ORIGEN_GUSTOS

  function play(at: number) {
    const track = canciones[at]
    if (!track) return
    /* La que suena, venga de donde venga: tocarla pausa o sigue, como en las
       listas — reencolar la colección la reiniciaría sin aviso. */
    if (soundingTrack?.videoId === track.videoId) {
      togglePlayback()
      return
    }
    playQueue(canciones, at, { id: ORIGEN_GUSTOS, name: 'Tus me gusta' })
  }

  const opcionesDe = (track: PlaylistTrack): MenuItem[] => [
    ...(menuFor?.(track) ?? []),
    {
      label: 'Quitar de tus me gusta',
      onPress: () => alternarMeGusta(track),
      destructive: true,
      sfSymbol: 'heart.slash' as const,
    },
  ]

  return (
    <Panel className="flex-1">
      <View className="min-h-0 flex-1">
        <FlatList
          data={canciones}
          keyExtractor={(t) => t.videoId}
          className="min-h-0 flex-1"
          contentContainerClassName="gap-1"
          contentContainerStyle={{ paddingTop: techo, paddingBottom: piso }}
          {...colapso}
          ListHeaderComponent={
            <View>
              <CollectionHeader
                kind="Colección"
                title={<CollectionTitle>Tus me gusta</CollectionTitle>}
                meta={`${total} ${total === 1 ? 'canción' : 'canciones'}${
                  totalMs > 0 ? ` · ${formatLength(totalMs)}` : ''
                }`}
                image={
                  /* La tapa es el corazón sobre un gris de superficie: sin
                     color de marca no hay degradado violeta que valga — el
                     glifo blanco ES la identidad (docs/DESIGN.md). */
                  <View
                    className="items-center justify-center rounded-lg bg-muted"
                    style={{ width: cover, height: cover }}
                  >
                    <IconHeartFilled size={Math.round(cover * 0.42)} color={ICON_COLOR.foreground} />
                  </View>
                }
                actions={
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        mine && soundingPlay ? 'Pausar' : 'Reproducir tus me gusta'
                      }
                      onPress={() => {
                        if (mine) togglePlayback()
                        else if (total > 0) play(0)
                      }}
                      disabled={total === 0}
                      className={`h-14 w-14 items-center justify-center rounded-full ${
                        total === 0 ? 'bg-muted' : 'bg-primary active:opacity-80'
                      }`}
                    >
                      {mine && soundingPlay ? (
                        <IconPause
                          size={20}
                          color={total === 0 ? ICON_COLOR.muted : ICON_COLOR.onPrimary}
                        />
                      ) : (
                        <IconPlay
                          size={20}
                          color={total === 0 ? ICON_COLOR.muted : ICON_COLOR.onPrimary}
                        />
                      )}
                    </Pressable>
                    {/* Lineal o aleatorio, como en cualquier colección: el
                        mismo botón y el mismo lenguaje que en una lista. */}
                    <BotonAleatorio size={19} lado={44} disabled={total === 0} />
                  </>
                }
              />
              {total > 0 ? <TrackColumnHeader /> : null}
            </View>
          }
          ListEmptyComponent={
            !cargado ? (
              <View className="px-6">
                <SkeletonList rows={5} />
              </View>
            ) : (
              <Vacio
                compacto
                icono={<IconHeart size={20} color={ICON_COLOR.muted} />}
                titulo="Todavía no marcaste nada"
                detalle="Tocá el corazón del reproductor y la canción queda guardada acá."
                accion={onSearch ? { rotulo: 'Buscá una canción', onPress: onSearch } : undefined}
              />
            )
          }
          renderItem={({ item, index }) => {
            const esta = soundingTrack?.videoId === item.videoId
            return (
              <TrackRow
                index={index}
                title={item.title}
                artist={item.artist}
                artwork={artworkSource(item.artworkPath, item.artworkUrl, 96)}
                durationMs={item.durationMs}
                sounding={esta}
                playing={esta && soundingPlay}
                onPlay={() => play(index)}
                /* La misma lista por los dos caminos, como en el resto de la
                   app: el gesto y el botón no pueden ofrecer cosas distintas. */
                menu={opcionesDe(item)}
                /*
                 * Los tres puntos **faltaban**: estas filas armaban su menú y
                 * no había forma de abrirlo en ningún lado —ni botón, ni gesto—
                 * así que «ir al artista» o «quitar de tus me gusta» existían
                 * sin puerta. Es la misma fila que en una lista; ofrece lo mismo.
                 */
                trailing={
                  <Menu
                    items={opcionesDe(item)}
                    label={`Opciones de ${item.title}`}
                    size={14}
                  />
                }
              />
            )
          }}
        />
      </View>
    </Panel>
  )
}
