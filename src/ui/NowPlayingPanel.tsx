import { useEffect, useState } from 'react'
import { Image, ScrollView, Text, View } from 'react-native'
import { artworkSource } from '../lib/artwork'
import { fetchArtist, type ArtistInfo } from '../services/music'
import {
  useManualPlaying,
  useNowPlayingView,
  usePlaybackOriginName,
  usePlaybackTrack,
  useWantPlay,
} from '../state/playback'
import { ArtistCard } from './ArtistCard'
import { LyricsView } from './LyricsView'
import { SongDisc } from './SongDisc'
import { Panel } from './Panel'
import { AnimatedSidebarTitle } from './SidebarMotion'
import { ICON_COLOR, IconCollapseRight, IconMusic } from './icons'

/**
 * Lo que está sonando, en el panel de la derecha.
 *
 * Es el equivalente del panel de Spotify: la carátula grande, el tema, y quién
 * es el que canta. Ocupa el lugar que en el modo conversación tiene el detalle
 * del mensaje — al lado de una lista, lo que sirve es esto.
 *
 * La ficha del artista se pide por el id de canal que guarda la canción. Las
 * que se agregaron antes de que se guardara ese dato no lo tienen: ahí se
 * muestra la carátula y el nombre, que es lo que sabemos, sin hueco ni error.
 */
export function NowPlayingPanel({
  showCollapse,
  onCollapse,
}: {
  showCollapse: boolean
  onCollapse: () => void
}) {
  const track = usePlaybackTrack()
  const playing = useWantPlay()
  const listName = usePlaybackOriginName()
  // Lo encolado a mano no salió de ninguna lista: decir el nombre de la que
  // sonaba antes sería mentir sobre de dónde vino.
  const fromQueue = useManualPlaying()
  const view = useNowPlayingView()
  const [artist, setArtist] = useState<{ id: string; info: ArtistInfo | null } | null>(null)

  const artistId = track?.artistId ?? null
  // Igual que en el resto de la app, la respuesta se guarda junto a la clave que
  // se consultó: así "cargando" es "lo que tengo no es de este artista", y una
  // respuesta que llega tarde nunca se muestra bajo el artista equivocado.
  const loadingArtist = artistId !== null && artist?.id !== artistId

  useEffect(() => {
    if (!artistId || artist?.id === artistId) return
    const controller = new AbortController()
    fetchArtist(artistId, controller.signal).then((info) => setArtist({ id: artistId, info }))
    return () => controller.abort()
  }, [artistId, artist])

  const artwork = track ? artworkSource(track.artworkPath, track.artworkUrl, 640) : null

  return (
    <Panel className="flex-1">
      <View className="flex-row items-center justify-between gap-4 px-4 pb-2 pt-4">
        <AnimatedSidebarTitle
          visible={showCollapse}
          label="Contraer el panel"
          icon={<IconCollapseRight size={17} color={ICON_COLOR.muted} />}
          onPress={onCollapse}
          alignIconToFirstLine
        >
          <View className="min-w-0 flex-row items-center gap-2">
            <View className="min-w-0 gap-0.5">
              <Text className="text-foreground text-lg font-bold" numberOfLines={1}>
                {track ? track.title : 'Sonando'}
              </Text>
              <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                {!track
                  ? 'Nada por ahora'
                  : view === 'lyrics'
                    ? 'Letra'
                    : view === 'disc'
                      ? 'Sonando'
                      : fromQueue
                        ? 'En la cola'
                        : /* Sin lista detrás —una canción suelta de la
                             búsqueda, o una lista que se borró mientras
                             sonaba— decir «Tu lista» sería inventar una. */
                          listName || 'Sonando'}
              </Text>
            </View>
          </View>
        </AnimatedSidebarTitle>
      </View>

      {!track ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-muted">
            <IconMusic size={22} color={ICON_COLOR.muted} />
          </View>
          <Text className="text-foreground text-center text-[15px] font-semibold">
            Nada sonando
          </Text>
          <Text className="text-muted-foreground text-center text-[13px] leading-5">
            Poné una canción y acá vas a ver la carátula y de quién es.
          </Text>
        </View>
      ) : view === 'disc' ? (
        <View className="flex-1 items-center justify-center gap-5 px-6">
          <SongDisc
            artworkUrl={track.artworkUrl}
            artworkPath={track.artworkPath}
            title={track.title}
            playing={playing}
            size={240}
          />
          <View className="gap-1">
            <Text className="text-foreground text-center text-lg font-bold" numberOfLines={2}>
              {track.title}
            </Text>
            <Text className="text-muted-foreground text-center text-[13px]" numberOfLines={1}>
              {track.artist}
            </Text>
          </View>
        </View>
      ) : view === 'lyrics' ? (
        <LyricsView track={track} />
      ) : (
        <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-4 px-4 pb-5">
          {artwork ? (
            <Image
              source={{ uri: artwork }}
              className="w-full rounded-xl bg-card"
              style={{ aspectRatio: 1 }}
            />
          ) : (
            <View className="w-full items-center justify-center rounded-xl bg-card" style={{ aspectRatio: 1 }}>
              <IconMusic size={32} color={ICON_COLOR.muted} />
            </View>
          )}

          <View className="gap-1">
            <Text className="text-foreground text-xl font-bold" numberOfLines={2}>
              {track.title}
            </Text>
            <Text className="text-muted-foreground text-[14px]" numberOfLines={1}>
              {track.artist}
            </Text>
          </View>

          {/* La tarjeta ya trae su propio «Sobre el artista» sobre la foto, así
              que no lleva rótulo arriba: serían dos títulos para lo mismo. */}
          {artistId ? (
            <ArtistCard
              artist={artist?.id === artistId ? artist.info : null}
              loading={loadingArtist}
            />
          ) : null}
        </ScrollView>
      )}
    </Panel>
  )
}

