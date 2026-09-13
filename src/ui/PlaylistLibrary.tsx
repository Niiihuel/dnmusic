import { BotonSuperficie } from './BotonSuperficie'
import { NativeMediaRow } from '../../modules/media-controls'
import { artworkSource } from '../lib/artwork'
import { coverUrl } from '../services/playlists'
import { useState } from 'react'
import { FlatList, Platform, Text, useWindowDimensions, View } from 'react-native'
import type { Playlist } from '../services/playlists'
import { useCuantosMeGusta } from '../state/gustos'
import { useWantPlay } from '../state/playback'
import { usePiso, useTecho } from '../state/shell'
import { useColapso } from './useColapso'
import { Panel } from './Panel'
import { ScrollArea } from './ScrollArea'
import { PlayingBars } from './PlayingBars'
import { PlaylistCover } from './PlaylistCover'
import { SkeletonList } from './Skeleton'
import { AnimatedSidebarTitle } from './SidebarMotion'
import { IconButton } from './IconButton'
import { Vacio } from './Vacio'
import { MantenerApretado, Menu, type MenuItem } from './Menu'
import { useClicDerecho } from './useClicDerecho'
import {
  ICON_COLOR,
  IconCollapseRight,
  IconDownload,
  IconGlobe,
  IconHeartFilled,
  IconMusic,
  IconPlus,
} from './icons'

/**
 * Tus listas, en el panel de la derecha.
 *
 * Es el equivalente de la biblioteca de Spotify: la lista de listas queda
 * siempre a mano mientras el centro muestra la que estás mirando, así cambiar
 * de una a otra no es navegar a ningún lado.
 */
export function PlaylistLibrary({
  playlists,
  openId,
  soundingId,
  showCollapse,
  onCollapse,
  onOpen,
  onCreate,
  onOpenGustos,
  onImportar,
  menuFor,
  error,
}: {
  playlists: Playlist[] | null
  /** La que se está mirando en el centro. */
  openId: string | null
  /** La que está sonando, que puede no ser la que se mira. */
  soundingId: string | null
  /** Se muestra el botón de contraer: el panel está bajo el cursor. */
  showCollapse: boolean
  onCollapse: () => void
  onOpen: (playlist: Playlist) => void
  onCreate: () => Promise<void>
  /** Abre «Tus me gusta». Sin esto la fila fija no se dibuja. */
  onOpenGustos?: () => void
  /** Abre «Traer de Spotify». Sin esto la fila del pie no se dibuja. */
  onImportar?: () => void
  /**
   * Las acciones de una lista, para el click derecho sobre su fila.
   *
   * Las arma la pantalla porque dependen de cosas que la biblioteca no conoce
   * —a dónde navegar, cómo borrar, cómo compartir—. Sin esto, la fila no
   * ofrece menú y todo sigue como antes.
   */
  menuFor?: (playlist: Playlist) => MenuItem[]
  error: string | null
}) {
  const [busy, setBusy] = useState(false)
  const cuantosGustos = useCuantosMeGusta()
  /* En el teléfono esto es la pestaña «Listas» y llega hasta el borde: la
     última tiene que quedar arriba de lo que flota. */
  const piso = usePiso(12)
  /* Si además de estar puesta está sonando: las barras se mueven o se quedan
     quietas según eso. Ver el ecualizador de la fila, más abajo. */
  const suena = useWantPlay()
  /* Como pestaña del teléfono, el título arranca debajo del encabezado que
     flota, con el respiro que ya tenía (`pt-4`). En escritorio vale eso solo. */
  const techo = useTecho(16)
  /* Mismo criterio que las filas de canciones: con el dedo, las medidas de
     escritorio quedan apretadas. Ver `TrackRow`. */
  const suelto = useWindowDimensions().width < 780
  const colapso = useColapso()

  /*
   * Crear no pregunta nada.
   *
   * Antes había un formulario con su campo y su botón «Crear lista», y era
   * pedir un nombre en el único momento en que todavía no se sabe cuál. Ahora
   * el «+» crea y abre; el nombre se cambia después, desde la lista misma.
   */
  async function create() {
    if (busy) return
    setBusy(true)
    try {
      await onCreate()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel tone="lateral" className="flex-1">
      <View className="flex-row items-center justify-between gap-4 px-4 pb-2" style={{ paddingTop: techo }}>
        <AnimatedSidebarTitle
          visible={showCollapse}
          label="Contraer las listas"
          icon={<IconCollapseRight size={17} color={ICON_COLOR.muted} />}
          onPress={onCollapse}
          alignIconToFirstLine
        >
          <View className="gap-0.5">
            <Text className="text-foreground text-title3 font-bold" numberOfLines={1}>
              Tus listas
            </Text>
            <Text className="text-muted-foreground text-caption1" numberOfLines={1}>
              {playlists === null
                ? 'Cargando…'
                : `${playlists.length} ${playlists.length === 1 ? 'lista' : 'listas'}`}
            </Text>
          </View>
        </AnimatedSidebarTitle>
        <View className="flex-row items-center gap-1">
          {/* En vidrio como los redondeles del encabezado: es un control
              apoyado sobre el panel, y era el único que quedaba gris plano. */}
          <IconButton label="Nueva lista" symbol="plus" onPress={() => void create()} disabled={busy} busy={busy}
            disableWhileBusy variant="glass" size={15} icon={<IconPlus size={15} color={ICON_COLOR.foreground} />} />
        </View>
      </View>

      {error ? <Text className="px-4 pb-2 text-destructive text-caption1">{error}</Text> : null}

      {playlists === null ? (
        <View className="px-4">
          <SkeletonList rows={4} />
        </View>
      ) : (
        <FlatList
          renderScrollComponent={(props) => <ScrollArea {...props} />}
          data={playlists}
          keyExtractor={(p) => p.id}
          className="min-h-0 flex-1"
          contentContainerClassName="gap-0.5 px-2"
          contentContainerStyle={{ paddingBottom: piso }}
          {...colapso}
          /* «Tus me gusta» va fija arriba, como en Spotify: no es una lista
             tuya —no se renombra ni se borra— pero es de donde más se
             escucha, y enterrarla entre las listas la volvería invisible. */
          ListHeaderComponent={
            onOpenGustos ? (
              NativeMediaRow ? <NativeMediaRow title="Tus me gusta" subtitle={`${cuantosGustos} canciones`} symbol="heart.fill" label="Tus me gusta"
                onActivate={onOpenGustos} style={{ height: 76, width: '100%' }} /> : (
              <BotonSuperficie
                accessibilityRole="button"
                onPress={onOpenGustos}
                className={`flex-row items-center rounded-lg ${
                  suelto ? 'gap-3 p-2.5' : 'gap-3 p-2'
                } active:bg-card`}
              >
                <View
                  className="items-center justify-center rounded bg-muted"
                  style={{ width: suelto ? 60 : 48, height: suelto ? 60 : 48 }}
                >
                  <IconHeartFilled size={suelto ? 24 : 20} color={ICON_COLOR.foreground} />
                </View>
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text
                    className={`text-foreground ${suelto ? 'text-callout' : 'text-subheadline'}`}
                    numberOfLines={1}
                  >
                    Tus me gusta
                  </Text>
                  <Text
                    className={`text-muted-foreground ${suelto ? 'text-footnote' : 'text-caption1'}`}
                    numberOfLines={1}
                  >
                    Colección · {cuantosGustos} {cuantosGustos === 1 ? 'canción' : 'canciones'}
                  </Text>
                </View>
              </BotonSuperficie>
              )
            ) : null
          }
          ListEmptyComponent={
            <Vacio
              icono={<IconMusic size={22} color={ICON_COLOR.muted} />}
              titulo="Todavía no tenés listas"
              detalle="Creá la primera y sumale lo que quieras, o traete una de Spotify."
              accion={{ rotulo: 'Nueva lista', onPress: () => void onCreate() }}
            />
          }
          /*
           * Traer de Spotify va al pie y no arriba con el «+».
           *
           * Importar es algo que se hace una vez cada tanto —cuando alguien
           * llega a la app o se acuerda de una lista vieja— y no todos los días
           * como abrir una lista. Arriba competiría por atención con lo que sí
           * se usa siempre; acá aparece al terminar de mirar lo que hay, que es
           * exactamente cuando uno nota que le falta algo.
           */
          ListFooterComponent={
            onImportar ? (
              NativeMediaRow ? <NativeMediaRow title="Traer de Spotify" subtitle={'Se rearma con tu música'} symbol="square.and.arrow.down" label="Traer de Spotify"
                onActivate={onImportar} style={{ height: 76, width: '100%' }} /> : (
              <BotonSuperficie
                accessibilityRole="button"
                onPress={onImportar}
                className={`mt-1 flex-row items-center rounded-lg ${
                  suelto ? 'gap-3 p-2.5' : 'gap-3 p-2'
                } active:bg-card`}
              >
                <View
                  className="items-center justify-center rounded bg-muted"
                  style={{ width: suelto ? 60 : 48, height: suelto ? 60 : 48 }}
                >
                  <IconDownload size={suelto ? 20 : 17} color={ICON_COLOR.muted} />
                </View>
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text
                    className={`text-foreground ${suelto ? 'text-callout' : 'text-subheadline'}`}
                    numberOfLines={1}
                  >
                    Traer de Spotify
                  </Text>
                  <Text
                    className={`text-muted-foreground ${suelto ? 'text-footnote' : 'text-caption1'}`}
                    numberOfLines={1}
                  >
                    Se rearma con tu música
                  </Text>
                </View>
              </BotonSuperficie>
              )
            ) : null
          }
          renderItem={({ item }) => (
            <FilaLista
              playlist={item}
              abierta={item.id === openId}
              sonando={item.id === soundingId}
              playing={suena}
              suelto={suelto}
              onOpen={onOpen}
              menu={menuFor?.(item)}
            />
          )}
        />
      )}
    </Panel>
  )
}

/**
 * Las tapas solas, para la franja del panel contraído.
 *
 * Una lista se reconoce por su portada mucho antes que por su nombre —es el
 * mismo motivo por el que existe el mosaico de `PlaylistCover`—, así que
 * contraído se muestran las tapas y nada más: la franja pasa de ser un hueco
 * con un ícono a ser una versión reducida y honesta de lo que hay abajo.
 *
 * Van centradas en la franja y no pegadas a un borde: la franja es angosta y
 * cualquier alineación deja un margen visiblemente distinto de cada lado.
 */
export function PlaylistRail({ playlists }: { playlists: Playlist[] | null }) {
  if (!playlists?.length) return null
  return (
    <View className="items-center gap-2 px-2">
      {playlists.map((p) => (
        <PlaylistCover key={p.id} covers={p.covers} coverPath={p.coverPath} size={44} />
      ))}
    </View>
  )
}

/**
 * Una fila de la biblioteca.
 *
 * Componente propio y no dibujada dentro de `renderItem` porque el click
 * derecho necesita estado por fila —dónde se abrió el menú— y eso son hooks,
 * que en un bucle no se pueden llamar.
 *
 * El menú va **envolviendo** al `Pressable` y no adentro: un `Menu` dentro de
 * un `Pressable` termina en web como un `<button>` dentro de otro, que es
 * exactamente lo que evitan las filas del buscador y las de una lista.
 */
function FilaLista({
  playlist,
  abierta,
  sonando,
  playing,
  suelto,
  onOpen,
  menu,
}: {
  playlist: Playlist
  /** Es la que se está mirando en el centro. */
  abierta: boolean
  /** Es la que está sonando, que puede no ser la que se mira. */
  sonando: boolean
  playing: boolean
  suelto: boolean
  onOpen: (playlist: Playlist) => void
  /** Ya armado por quien tiene las acciones; sin esto no hay click derecho. */
  menu?: MenuItem[]
}) {
  const clic = useClicDerecho()
  const { fontScale } = useWindowDimensions()
  if (NativeMediaRow) {
    const ownCover = coverUrl(playlist.coverPath)
    const covers = ownCover ? [ownCover] : playlist.covers.map(c => c.startsWith('http') ? c : (artworkSource(c, null, 240) ?? ''))
    const row = <NativeMediaRow title={playlist.name}
      subtitle={`${playlist.visibilidad === 'publica' ? 'Pública · ' : ''}Lista · ${playlist.tracks} ${playlist.tracks === 1 ? 'canción' : 'canciones'}`}
      artworks={covers} selected={abierta} sounding={sonando} playing={playing}
      label={`Abrir ${playlist.name}, ${playlist.tracks} canciones${playlist.visibilidad === 'publica' ? ', lista pública' : ''}`}
      onActivate={() => onOpen(playlist)} style={{ height: Math.max(76, 42 * fontScale + 16), width: '100%' }} />
    return menu?.length ? <MantenerApretado items={menu}>{row}</MantenerApretado> : row
  }


  const fila = (
    <View {...clic.gestos}>
      <BotonSuperficie
        accessibilityRole="button"
        accessibilityState={{ selected: abierta }}
        onPress={() => onOpen(playlist)}
        onLongPress={Platform.OS === 'ios' && menu?.length ? () => {} : undefined}
        delayLongPress={500}
        accessibilityHint={menu?.length ? 'Mantené apretado para ver las opciones' : undefined}
        className={`flex-row items-center rounded-lg ${
          suelto ? 'gap-3 p-2.5' : 'gap-3 p-2'
        } ${abierta ? 'bg-muted' : 'active:bg-card'}`}
      >
        <PlaylistCover
          covers={playlist.covers}
          coverPath={playlist.coverPath}
          size={suelto ? 60 : 48}
        />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text
            /* El que suena va en blanco, que en este sistema es el
               acento — el equivalente del verde de Spotify. */
            className={`${suelto ? 'text-callout' : 'text-subheadline'} ${
              sonando
                ? 'text-foreground font-semibold'
                : 'text-foreground'
            }`}
            numberOfLines={1}
          >
            {playlist.name}
          </Text>
          <View className="flex-row items-center gap-1.5">
            {/* El mundito antes del texto: publicada es una condición
                de la lista, y saberlo de un vistazo en la biblioteca
                evita tener que abrirlas una por una para acordarse de
                cuál compartiste. */}
            {playlist.visibilidad === 'publica' ? (
              <IconGlobe size={11} color={ICON_COLOR.muted} />
            ) : null}
            <Text
              className={`text-muted-foreground min-w-0 shrink ${
                suelto ? 'text-footnote' : 'text-caption1'
              }`}
              numberOfLines={1}
            >
              Lista · {playlist.tracks} {playlist.tracks === 1 ? 'canción' : 'canciones'}
            </Text>
          </View>
        </View>
        {/* El ecualizador y no un punto: es la misma marca que ya usa
            la fila de una canción y la tapa del reproductor, y en una
            interfaz sin colores el movimiento es lo único que distingue
            «esto suena» de un rato para el otro. En pausa las barras se
            quedan quietas y bajas, así que sigue diciendo cuál es sin
            mentir que está sonando. Ver `PlayingBars`. */}
        {sonando ? <PlayingBars playing={playing} size={12} /> : null}
      </BotonSuperficie>
      {clic.punto && menu?.length ? (
        <Menu items={menu} sinDisparador abiertoEn={clic.punto} onCerrarPunto={clic.cerrar} />
      ) : null}
    </View>
  )
  return Platform.OS === 'ios' && menu?.length
    ? <MantenerApretado items={menu}>{fila}</MantenerApretado>
    : fila
}
