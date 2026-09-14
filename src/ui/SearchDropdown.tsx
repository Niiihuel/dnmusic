import { superficieInteractivaWeb } from './estadoControl'
import { ScrollArea } from './ScrollArea'
import { ES_WEB, vidrioCss } from './Glass'
import { useState } from 'react'
import { Image, Platform, Pressable, Text, View } from 'react-native'
import { togglePlayback, usePlaybackCargada, usePlaybackTrack, useWantPlay } from '../state/playback'
import { useKeyboardH, usePiso } from '../state/shell'
import { MantenerApretado, Menu, type MenuItem } from './Menu'
import { useClicDerecho } from './useClicDerecho'
import { EstadoTapa } from './CoverState'
import { SkeletonList } from './Skeleton'
import { ICON_COLOR, IconMusic, IconPlus, IconUser } from './icons'
import { proxiedImage, type ArtistResult, type TrackResult } from '../services/music'
import { artworkUrlAtSize } from '../lib/artwork'

const MAX_H = 420

type Props = {
  visible: boolean
  loading: boolean
  results: TrackResult[]
  /**
   * Los artistas que coinciden, arriba de las canciones.
   *
   * Van primero y no mezclados: quien escribe el nombre de una banda suele
   * querer la banda, y tenerla que buscar entre veinte temas sería empezar por
   * el final. Vacío cuando quien usa esto no tiene a dónde llevarlos.
   */
  artists?: ArtistResult[]
  onOpenArtist?: (artist: ArtistResult) => void
  error: string | null
  onSelect: (track: TrackResult) => void
  /** Dentro de una página de búsqueda, en vez de flotando bajo el campo. */
  embedded?: boolean
  /**
   * El «+» de cada fila: sumar sin elegir nada. Va cuando hay un destino
   * obvio —la lista que estás mirando—; si no lo hay, no se dibuja.
   */
  quickAddLabel?: string
  onQuickAdd?: (track: TrackResult) => void
  /** Reproducir sin guardar en ningún lado. Aparece sobre la carátula. */
  onPlay?: (track: TrackResult) => void
  /**
   * Tocar la fila **siempre elige**, aunque sea la canción que está sonando.
   *
   * Por defecto, tocar la que suena pausa o sigue — tiene sentido donde elegir
   * es reproducir. Pero en los buscadores que existen para *otra cosa* —fijar
   * un fragmento en el perfil, adjuntar una canción a un mensaje— ese atajo
   * bloqueaba justo el caso más común: querer agregar lo que estás escuchando.
   * La fila solo ofrecía pausar y no había forma de seguir el flujo.
   */
  alwaysSelect?: boolean
  /**
   * Margen de arriba del contenido, solo embebida.
   *
   * Lo pasa la pantalla cuyo encabezado flota (la portada del teléfono): las
   * filas corren hasta el borde y pasan por detrás del velo, y el hueco para
   * arrancar a la vista se reserva adentro — el mismo trato que el piso. Las
   * pantallas apiladas, con su cabecera en el flujo, no lo mandan.
   */
  topInset?: number
  /** Canción que se está resolviendo, para mostrarla ocupada. */
  pendingId?: string | null
  /** Las opciones de los tres puntos. Sin esto, la fila no los muestra. */
  menuFor?: (track: TrackResult) => MenuItem[]
}

/**
 * Panel de resultados que cuelga del campo de búsqueda.
 *
 * Va posicionado absoluto sobre el contenido en vez de empujarlo: así el campo
 * no se mueve al aparecer los resultados, que es lo que hace que buscar se
 * sienta instantáneo. El contenedor padre necesita `z-index` y NO puede tener
 * `overflow: hidden`, o el panel queda recortado.
 *
 * Mientras carga se muestran filas de esqueleto con la misma altura que las
 * reales, para que la lista no salte de tamaño cuando llegan los datos.
 */
export function SearchDropdown({
  visible,
  loading,
  results,
  artists = [],
  onOpenArtist,
  error,
  onSelect,
  embedded = false,
  quickAddLabel,
  onQuickAdd,
  onPlay,
  pendingId,
  menuFor,
  alwaysSelect = false,
  topInset = 0,
}: Props) {
  /*
   * Qué está sonando, para que el resultado que ya está puesto no ofrezca
   * reproducir de nuevo: sobre la carátula muestra las barras, y con el cursor
   * encima el botón de pausa. Es el mismo lenguaje que las filas de una lista.
   */
  const current = usePlaybackTrack()
  const wantPlay = useWantPlay()
  const cargada = usePlaybackCargada()
  /* Los resultados terminan justo antes del teclado: si siguen por debajo, los
     últimos quedan tapados y no hay forma de llegar a ellos sin cerrarlo. */
  const teclado = useKeyboardH()
  /* Lo que flota abajo, para que la tarjeta de resultados termine antes.
     Colgada del campo esto no se usa: ahí flota sobre una ventana grande y no
     llega nunca al borde de abajo. */
  const cascara = usePiso()
  if (!visible) return null

  return (
    <View
      {...(ES_WEB && !embedded ? { dataSet: { dnGlass: 'regular', dnGlassDropdown: 'true' } } : {})}
      /*
       * Embebida **no lleva tarjeta**.
       *
       * Antes era una caja opaca que terminaba arriba de lo que flota, para que
       * no se la viera cortada. Pero así es como lo hace Apple Music y tiene
       * más sentido: las filas sueltas sobre el fondo corren por debajo del
       * campo y del reproductor, y se leen difuminadas a través del vidrio. Lo
       * que se veía mal no era pasar por detrás — era que pasara por detrás
       * *una caja con bordes*. Sin bordes no hay nada que se corte.
       *
       * Colgada del campo sigue siendo tarjeta: ahí flota sobre una ventana
       * grande y necesita despegarse de lo que tapa.
       */
      className={
        embedded
          ? 'min-h-0 flex-1'
          : 'absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl bg-card'
      }
      style={
        embedded
          ? undefined
          : {
              maxHeight: MAX_H,
              ...(ES_WEB ? vidrioCss() : {}),
              // Sombra pesada: sobre casi negro, una sutil no se ve y el panel
              // parece pegado al fondo en vez de flotar.
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }
      }
    >
      {loading ? (
        <View className="p-2" style={{ marginTop: embedded ? topInset : 0 }}>
          <SkeletonList rows={6} />
        </View>
      ) : error ? (
        <View className="p-5" style={{ marginTop: embedded ? topInset : 0 }}>
          <Text className="text-muted-foreground text-center text-subheadline">{error}</Text>
        </View>
      ) : (
        <ScrollArea
          style={embedded ? { flex: 1, minHeight: 0 } : { maxHeight: MAX_H }}
          contentContainerClassName="p-2"
          /* El hueco se reserva adentro del contenido, no descontándole alto al
             contenedor: así se llega a la última fila y las de arriba pasan por
             debajo del material. Es la misma regla que el resto de las listas
             —ver `usePiso`— de la que esta tarjeta era la única excepción. */
          /* El estilo pisa el `p-2` de la clase en los lados que toca, así que
             el respiro de 8 se repone a mano junto al techo. */
          contentContainerStyle={{
            paddingTop: 8 + (embedded ? topInset : 0),
            paddingBottom: embedded ? cascara : 8 + teclado,
          }}
          keyboardShouldPersistTaps="handled"
          /* Arrastrar la lista cierra el teclado, como en Apple Music: al
             desplazar ya dejaste de escribir, y el teclado tapa media pantalla
             justo cuando querés mirar los resultados. */
          keyboardDismissMode="on-drag"
        >
          {onOpenArtist && artists.length
            ? artists.map((a) => (
                <ArtistHit key={a.id} artist={a} onPress={() => onOpenArtist(a)} />
              ))
            : null}

          {results.map((r) => (
            <ResultadoFila
              key={r.videoId}
              track={r}
              sounding={current?.videoId === r.videoId}
              playing={wantPlay}
              busy={pendingId === r.videoId || (current?.videoId === r.videoId && wantPlay && !cargada)}
              alwaysSelect={alwaysSelect}
              onSelect={onSelect}
              onQuickAdd={onQuickAdd}
              quickAddLabel={quickAddLabel}
              menuFor={menuFor}
            />
          ))}
        </ScrollArea>
      )}
    </View>
  )
}

/**
 * Un artista en el desplegable.
 *
 * Foto redonda y una sola línea: es lo que lo distingue de una canción de un
 * vistazo, sin necesidad de un rótulo que diga «artista».
 */
/**
 * Una fila de resultado.
 *
 * Vive como componente propio y no dibujada dentro del `map` por una razón
 * concreta: el click derecho necesita un estado por fila —dónde se abrió el
 * menú— y eso son hooks, que adentro de un bucle no se pueden llamar. De paso
 * el hover pasó a ser de la fila: antes lo guardaba el desplegable entero y
 * mover el mouse redibujaba **todas** las filas, que es el mismo problema que
 * ya se había arreglado en `TrackRow`.
 */
function ResultadoFila({
  track,
  sounding,
  playing,
  busy,
  alwaysSelect,
  onSelect,
  onQuickAdd,
  quickAddLabel,
  menuFor,
}: {
  track: TrackResult
  /** Es la que está puesta en el reproductor. */
  sounding: boolean
  playing: boolean
  /** Se está resolviendo el audio de esta. */
  busy: boolean
  alwaysSelect: boolean
  onSelect: (track: TrackResult) => void
  onQuickAdd?: (track: TrackResult) => void
  quickAddLabel?: string
  menuFor?: (track: TrackResult) => MenuItem[]
}) {
  const [over, setOver] = useState(false)
  const clic = useClicDerecho()
  /* Una sola vez: antes se armaba dos veces por fila —para los tres puntos y
     para el gesto— y con el click derecho serían tres. */
  const items = menuFor?.(track) ?? []

  const fila = (

      /*
       * La fila es un View y no un Pressable: adentro van más botones,
       * y un Pressable dentro de otro se convierte en web en un
       * <button> dentro de otro <button>. Lo tocable es la parte de la
       * izquierda, que ocupa todo lo que sobra.
       */
      <View
        {...clic.gestos}
        onPointerEnter={() => setOver(true)}
        onPointerLeave={() => setOver(false)}
        /*
         * El cursor se marca solo con el fondo, igual que en las filas
         * de una lista: `docs/DESIGN.md` pide separar superficies por
         * luminancia y nunca por bordes, y este desplegable no es una
         * excepción — la carátula, que se oscurece y muestra el play,
         * ya dice de sobra cuál fila se va a accionar.
         */
        {...superficieInteractivaWeb('row')}
        className={`flex-row items-center gap-1 rounded-lg pr-1 ${Platform.OS !== 'web' && over ? 'bg-muted' : ''}`}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={track.title}
          // Si ya es la que suena, tocarla pausa o sigue; no la
          // reinicia ni la vuelve a resolver. Salvo que este buscador
          // exista para elegir, no para escuchar — ver `alwaysSelect`.
          onPress={() => (sounding && !alwaysSelect ? togglePlayback() : onSelect(track))}
          onLongPress={Platform.OS === 'ios' && items.length ? () => {} : undefined}
          delayLongPress={500}
          accessibilityHint={items.length ? 'Mantené apretado para ver las opciones' : undefined}
          className="min-w-0 flex-1 flex-row items-center gap-3 rounded-lg p-2"
        >
          {/* La carátula se convierte en el botón de reproducir al
              pasar el cursor: escuchar antes de decidir es lo primero
              que uno quiere hacer con un resultado. */}
          <View className="h-11 w-11 overflow-hidden rounded bg-muted">
            {track.artworkUrl ? (
              /* Por nuestro proxy y no directo al CDN de Google: sin
                 CORS, Chrome descarta la respuesta entera (ORB) y la
                 fila queda con un cuadrado vacío. Es el mismo camino
                 que usan las tapas de la portada. */
              <Image
                source={{ uri: proxiedImage(artworkUrlAtSize(track.artworkUrl, 96)) }}
                className="h-11 w-11"
              />
            ) : (
              <View className="h-11 w-11 items-center justify-center">
                <IconMusic size={16} color={ICON_COLOR.muted} />
              </View>
            )}
            {/*
             * La capa vive siempre y se muestra por opacidad, nunca
             * montándose y desmontándose: si el nodo donde empezó la
             * pulsación desaparece antes de soltar, el navegador no
             * emite `click` y el toque se pierde.
             */}
            <EstadoTapa busy={busy} sounding={sounding} playing={playing} hovered={over} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-foreground text-subheadline" numberOfLines={1}>
              {track.title}
            </Text>
            <Text className="text-muted-foreground text-caption1" numberOfLines={1}>
              {track.artist}
            </Text>
          </View>
          <Text className="text-muted-foreground text-caption2 tabular-nums">
            {fmtDur(track.durationMs)}
          </Text>
        </Pressable>

        {/*
         * Los tres puntos, **siempre que haya menú**.
         *
         * Estaban detrás de `over`, que es el hover del cursor. En una
         * computadora se entiende: aparecen al apuntar la fila y no
         * ensucian la lista. En un teléfono no hay cursor — `over` solo
         * se prendía de rebote, con el dedo apoyado, y por eso los tres
         * puntos «a veces andaban y a veces no». Una acción que existe
         * no puede depender de un evento que en el teléfono no ocurre.
         *
         * El hueco se reserva igual cuando no hay menú, para que la
         * duración y el «+» de todas las filas queden en la misma
         * columna.
         */}
        <View className="w-9 items-center">
          {items.length ? (
            <Menu items={items} label={`Opciones de ${track.title}`} size={15} />
          ) : null}
        </View>
        {onQuickAdd ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={quickAddLabel ? `${quickAddLabel}: ${track.title}` : `Agregar ${track.title}`}
            onPress={() => onQuickAdd(track)}
            /* Sin círculo alrededor: es un ícono y nada más. El aro lo
               hacía competir con el botón de reproducir, que es el
               único redondo del sistema (ver docs/DESIGN.md). */
            className="h-9 w-9 items-center justify-center active:opacity-60"
          >
            <IconPlus size={17} color={ICON_COLOR.foreground} />
          </Pressable>
        ) : null}
      

        {/* El menú del click derecho: la misma lista que los tres puntos, sin
            botón propio. Ver `useClicDerecho`. */}
        {clic.punto && items.length ? (
          <Menu items={items} sinDisparador abiertoEn={clic.punto} onCerrarPunto={clic.cerrar} />
        ) : null}
      </View>
  )

  if (!items.length) return fila
  return <MantenerApretado items={items} preview={{ title: track.title, subtitle: track.artist, artwork: track.artworkUrl ? proxiedImage(track.artworkUrl) : undefined }}>{fila}</MantenerApretado>
}

function ArtistHit({ artist, onPress }: { artist: ArtistResult; onPress: () => void }) {
  const [over, setOver] = useState(false)
  /* Por el proxy y no directo: las fotos de artista viven en `yt3`, que
     responde sin CORS y deja el hueco en blanco (ver `proxiedImage`). */
  const photo = artist.photoUrl ? proxiedImage(artworkUrlAtSize(artist.photoUrl, 96)) : ''
  return (
    <MantenerApretado items={[{ label: 'Ir al artista', sfSymbol: 'music.microphone', onPress }]}
      preview={{ title: artist.name, subtitle: 'Artista', artwork: photo }} onPreviewPress={onPress}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ir a ${artist.name}`}
      onPress={onPress}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
      {...superficieInteractivaWeb('row')}
      className={`flex-row items-center gap-3 rounded-lg p-2 ${Platform.OS !== 'web' && over ? 'bg-muted' : ''}`}
    >
      {photo ? (
        <Image source={{ uri: photo }} className="h-11 w-11 rounded-full bg-muted" />
      ) : (
        <View className="h-11 w-11 items-center justify-center rounded-full bg-muted">
          <IconUser size={16} color={ICON_COLOR.muted} />
        </View>
      )}
      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-subheadline" numberOfLines={1}>
          {artist.name}
        </Text>
        <Text className="text-muted-foreground text-caption1" numberOfLines={1}>
          Artista
        </Text>
      </View>
    </Pressable>
    </MantenerApretado>
  )
}

function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
