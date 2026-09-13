import { BotonSuperficie } from './BotonSuperficie'
import { IconButton } from './IconButton'
import { useEffect, useRef, useState } from 'react'
import { Image, Text, View } from 'react-native'
import { sugerenciasParaLista } from '../services/recomendaciones'
import type { PlaylistTrack } from '../services/playlists'
import { proxiedImage, type TrackResult } from '../services/music'
import { artworkUrlAtSize } from '../lib/artwork'
import { togglePlayback, usePlaybackTrack, useWantPlay } from '../state/playback'
import { EstadoTapa } from './CoverState'
import { SkeletonList } from './Skeleton'
import { estadoControlWeb } from './estadoControl'
import { ICON_COLOR, IconMusic, IconPlus } from './icons'

/**
 * Canciones recomendadas, al pie de una lista — como en Spotify.
 *
 * El ancla es la lista misma: sus artistas y los relacionados de esos artistas
 * (ver `sugerenciasParaLista`). No mira el historial de escucha, porque la
 * sección promete «según las canciones de esta lista» y tiene que ser cierto.
 *
 * Tocar una fila la reproduce —escuchar antes de decidir es lo primero que uno
 * quiere hacer con una sugerencia— y el «+» la suma al final de la lista.
 * «Actualizar» trae una tanda nueva: las ya mostradas quedan vetadas en la
 * sesión para que el botón traiga caras nuevas y no rebaraje las mismas seis.
 */
export function Sugerencias({
  playlistId,
  enLista,
  onAdd,
  onPlay,
  pendingId,
}: {
  playlistId: string
  /** Las canciones que ya están en la lista: son el ancla y el veto. */
  enLista: PlaylistTrack[]
  /** Sumar esta sugerencia a la lista. Resolver el audio es cosa de quien suma. */
  onAdd: (track: TrackResult) => void
  /** Escucharla sin guardarla en ningún lado. */
  onPlay: (track: TrackResult) => void
  /** Canción que se está resolviendo, para mostrarla ocupada. */
  pendingId: string | null
}) {
  /*
   * La tanda se guarda **junto al id de la lista que la produjo**: así «todavía
   * no cargó» es simplemente «lo que tengo no es de esta lista», sin resetear
   * desde un efecto. Mismo criterio que las canciones de `PlaylistView`.
   */
  const [tanda, setTanda] = useState<{ playlistId: string; items: TrackResult[] } | null>(null)
  const items = tanda?.playlistId === playlistId ? tanda.items : null
  const [cargando, setCargando] = useState(false)
  /*
   * Lo ya ofrecido en esta sesión, por lista. En una ref porque nadie lo
   * dibuja: solo evita que «Actualizar» repita. Si una tanda vuelve vacía —se
   * acabaron las caras nuevas— se vacía el veto, y la próxima vuelve a empezar.
   */
  const vistos = useRef<{ playlistId: string; ids: string[] }>({ playlistId, ids: [] })

  async function cargar() {
    if (cargando) return
    setCargando(true)
    if (vistos.current.playlistId !== playlistId) vistos.current = { playlistId, ids: [] }
    const nuevos = await sugerenciasParaLista(enLista, vistos.current.ids)
    if (nuevos.length) vistos.current.ids.push(...nuevos.map((t) => t.videoId))
    else vistos.current.ids = []
    setTanda({ playlistId, items: nuevos })
    setCargando(false)
  }

  /*
   * La primera tanda se pide sola al abrir la lista; las siguientes, a pedido.
   * `enLista.length` y no `enLista`: la referencia cambia en cada relectura y
   * repediría sugerencias al agregar una canción, que es justo cuando la tanda
   * visible ya se está achicando sola (ver el filtro de abajo).
   */
  useEffect(() => {
    if (items || !enLista.length) return
    /* Dentro de un temporizador y no en el cuerpo del efecto: prender el
       «cargando» acá sería un cambio de estado sincrónico que dispara otro
       dibujado al pedo — mismo criterio que el buscador del perfil. */
    const t = setTimeout(() => void cargar(), 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId, items, enLista.length])

  /* Lo que ya entró a la lista desaparece de las sugerencias al instante, sin
     esperar otra tanda: sugerir lo que ya está sería un «+» que no hace nada. */
  const yaAdentro = new Set(enLista.map((t) => t.videoId))
  const visibles = (items ?? []).filter((t) => !yaAdentro.has(t.videoId))

  /* Sin ancla —ninguna canción con artista identificado— no hay sección: un
     título sin filas debajo parece un error, no una carencia. */
  if (!cargando && !visibles.length) return null

  return (
    <View className="gap-3 pb-2 pt-10">
      <View className="gap-0.5 px-6">
        <Text className="text-foreground text-title3 font-bold">Canciones recomendadas</Text>
        <Text className="text-muted-foreground text-caption1">
          Sugerencias según las canciones de esta lista
        </Text>
      </View>

      {cargando ? (
        <View className="px-4">
          <SkeletonList rows={4} />
        </View>
      ) : (
        <View className="px-4">
          {visibles.map((track) => (
            <Fila
              key={track.videoId}
              track={track}
              busy={pendingId === track.videoId}
              onPlay={() => onPlay(track)}
              onAdd={() => onAdd(track)}
            />
          ))}
        </View>
      )}

      {/* La píldora de la casa, en gris: el blanco es el acento y acá la
          acción principal es la lista, no traer más sugerencias. */}
      <BotonSuperficie
        accessibilityRole="button"
        accessibilityLabel="Traer otras sugerencias"
        onPress={() => void cargar()}
        disabled={cargando}
        className="h-10 items-center justify-center self-center rounded-full bg-muted px-6 active:opacity-70"
      >
        <Text className="text-foreground text-footnote font-semibold">Actualizar</Text>
      </BotonSuperficie>
    </View>
  )
}

/**
 * Una sugerencia. La misma fila que un resultado de búsqueda —carátula que se
 * vuelve botón de reproducir, título y artista— con el «+» de sumar a la
 * derecha, sin círculo: el aro competiría con el único redondo del sistema.
 */
function Fila({
  track,
  busy,
  onPlay,
  onAdd,
}: {
  track: TrackResult
  busy: boolean
  onPlay: () => void
  onAdd: () => void
}) {
  const [over, setOver] = useState(false)
  const current = usePlaybackTrack()
  const wantPlay = useWantPlay()
  const isCurrent = current?.videoId === track.videoId

  return (
    <View className="flex-row items-center gap-1 rounded-lg pr-1">
      <BotonSuperficie
        {...estadoControlWeb('row')}
        accessibilityRole="button"
        accessibilityLabel={`Escuchar ${track.title}`}
        /* Si ya es la que suena, tocarla pausa o sigue, como en el buscador. */
        onPress={() => (isCurrent ? togglePlayback() : onPlay())}
        onPointerEnter={() => setOver(true)}
        onPointerLeave={() => setOver(false)}
        className={`min-w-0 flex-1 flex-row items-center gap-3 rounded-lg p-2 ${over ? 'bg-muted' : ''}`}
      >
        <View className="h-11 w-11 overflow-hidden rounded bg-muted">
          {track.artworkUrl ? (
            /* Por el proxy, como todas las tapas: sin CORS el navegador
               descarta la respuesta y queda el cuadrado vacío. */
            <Image
              source={{ uri: proxiedImage(artworkUrlAtSize(track.artworkUrl, 96)) }}
              className="h-11 w-11"
            />
          ) : (
            <View className="h-11 w-11 items-center justify-center">
              <IconMusic size={16} color={ICON_COLOR.muted} />
            </View>
          )}
          <EstadoTapa busy={busy} sounding={isCurrent} playing={wantPlay} hovered={over} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-foreground text-subheadline" numberOfLines={1}>
            {track.title}
          </Text>
          <Text className="text-muted-foreground text-caption1" numberOfLines={1}>
            {track.artist}
          </Text>
        </View>
      </BotonSuperficie>

      {/*
         * La espera se dice sobre la tapa (`EstadoTapa`) y acá el «+» solo se
         * apaga. Antes este botón se convertía en spinner también cuando lo que
         * estaba ocupado era **escuchar** la sugerencia —`busy` no distingue
         * cuál de las dos acciones se pidió— y tocar «escuchar» se veía como si
         * la app estuviera agregando la canción a la lista.
         */}
      <IconButton label={`Agregar ${track.title} a la lista`} symbol="plus" onPress={onAdd} disabled={busy} lado={44} size={17} icon={<IconPlus size={17} color={busy ? ICON_COLOR.muted : ICON_COLOR.foreground} />} />
    </View>
  )
}
