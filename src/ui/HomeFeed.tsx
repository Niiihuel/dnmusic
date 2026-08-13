import { useEffect, useState } from 'react'
import { Image, Pressable, ScrollView, Text, View } from 'react-native'
import { artworkUrlAtSize } from '../lib/artwork'
import { fetchHome, proxiedImage, type HomeItem, type HomeSection } from '../services/music'
import { FadingRow } from './FadingScroll'
import { togglePlayback, usePlaybackTrack, useWantPlay } from '../state/playback'
import { usePiso, useTecho } from '../state/shell'
import { useColapso } from './useColapso'
import { Menu, type MenuItem } from './Menu'
import { Panel } from './Panel'
import { EstadoTapa } from './CoverState'
import { Skeleton } from './Skeleton'
import { ICON_COLOR, IconBack, IconChevronRight, IconMusic } from './icons'

/** Lado de una tapa en el carrusel, y el tamaño deseable en la grilla. */
const CARD = 168
/** El hueco entre tapas de la grilla. Es el `gap-4` de su contenedor. */
const GRID_GAP = 16
/** Cuántas canciones apiladas por columna, como en Apple Music. */
const ROWS = 4

/**
 * La portada del modo música: novedades, lo que suena, listas.
 *
 * Ocupa el panel del medio cuando no hay ninguna lista abierta. Antes ahí
 * había un cartel diciendo «elegí una lista», que es pedirle al que llega que
 * ya sepa qué quiere; esto le da algo para mirar.
 *
 * Todo sale de `/home`, que junta la portada de YouTube Music con su sección
 * de exploración. Cada sección viene armada por ellos, así que acá no se
 * inventa ningún criterio de recomendación — solo se dibuja.
 */
export function HomeFeed({
  section: openSection,
  onOpenSection,
  onOpenAlbum,
  onOpenPlaylist,
  onPlaySong,
  menuForSong,
  pendingId,
}: {
  /** Sección abierta a pantalla completa; null es la portada con carruseles. */
  section: string | null
  onOpenSection: (title: string | null) => void
  onOpenAlbum: (item: HomeItem) => void
  onOpenPlaylist: (item: HomeItem) => void
  onPlaySong: (item: HomeItem) => void
  menuForSong: (item: HomeItem) => MenuItem[]
  pendingId: string | null
}) {
  const [sections, setSections] = useState<HomeSection[] | null>(null)
  /* Lo que ocupan el reproductor y las pestañas, más el respiro de siempre. */
  const piso = usePiso(24)
  /* Y lo que flota arriba —reloj y encabezado—, con el respiro que ya tenía
     (`pt-6`). Al desplazar, las tapas pasan por detrás del velo. */
  const techo = useTecho(24)
  /* Bajando, la cáscara se pliega; subiendo, vuelve. Ver `useColapso`. */
  const colapso = useColapso()

  useEffect(() => {
    if (sections !== null) return
    const controller = new AbortController()
    fetchHome(controller.signal).then(setSections)
    return () => controller.abort()
  }, [sections])

  const abierta = sections?.find((s) => s.title === openSection) ?? null

  /*
   * Una sección abierta ocupa el panel entero, en grilla.
   *
   * Es lo que hace Apple Music con el `›` del título: el carrusel muestra lo
   * que entra, y si querés ver todo lo demás no tiene sentido seguir
   * desplazando de a una tapa.
   */
  if (abierta) {
    return (
      <Panel className="flex-1">
        <SectionPage
          section={abierta}
          onBack={() => onOpenSection(null)}
          onOpenAlbum={onOpenAlbum}
          onOpenPlaylist={onOpenPlaylist}
          onPlaySong={onPlaySong}
          menuForSong={menuForSong}
          pendingId={pendingId}
        />
      </Panel>
    )
  }

  return (
    <Panel className="flex-1">
      <ScrollView
        className="min-h-0 flex-1"
        contentContainerClassName="gap-7"
        contentContainerStyle={{ paddingTop: techo, paddingBottom: piso }}
        {...colapso}
      >
        {sections === null ? (
          <Loading />
        ) : sections.length === 0 ? (
          <View className="items-center gap-3 px-8 py-16">
            <IconMusic size={24} color={ICON_COLOR.muted} />
            <Text className="text-muted-foreground text-center text-sm leading-5">
              No pude traer las novedades. Tus listas están a la izquierda.
            </Text>
          </View>
        ) : (
          sections.map((section) => (
            <Section
              key={section.title}
              section={section}
              onOpen={() => onOpenSection(section.title)}
              onOpenAlbum={onOpenAlbum}
              onOpenPlaylist={onOpenPlaylist}
              onPlaySong={onPlaySong}
              menuForSong={menuForSong}
              pendingId={pendingId}
            />
          ))
        )}
      </ScrollView>
    </Panel>
  )
}

function Section({
  section,
  onOpen,
  onOpenAlbum,
  onOpenPlaylist,
  onPlaySong,
  menuForSong,
  pendingId,
}: {
  section: HomeSection
  onOpen: () => void
  onOpenAlbum: (item: HomeItem) => void
  onOpenPlaylist: (item: HomeItem) => void
  onPlaySong: (item: HomeItem) => void
  menuForSong: (item: HomeItem) => MenuItem[]
  pendingId: string | null
}) {
  const songs = section.items.every((item) => item.kind === 'song')

  return (
    <View className="gap-3">
      {/* El título es el botón que abre la sección entera, con el chevron
          que lo anuncia — igual que en Apple Music. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ver todo: ${section.title}`}
        onPress={onOpen}
        className="flex-row items-center gap-1.5 self-start px-6 active:opacity-70"
      >
        <Text className="text-foreground text-[19px] font-bold">{section.title}</Text>
        <IconChevronRight size={17} color={ICON_COLOR.muted} />
      </Pressable>
      {/*
       * Una fila desplazable por sección, como en Apple Music: los costados se
       * desvanecen en vez de cortarse contra el borde del panel, y con el
       * cursor encima aparecen las flechas para moverla.
       */}
      <FadingRow gap={16} padding={24}>
        {songs ? (
          <SongColumns
            items={section.items}
            onPlay={onPlaySong}
            menuFor={menuForSong}
            pendingId={pendingId}
          />
        ) : (
          section.items.map((item) => (
            <Card
              key={item.id}
              item={item}
              onPress={() => (item.kind === 'album' ? onOpenAlbum(item) : onOpenPlaylist(item))}
            />
          ))
        )}
      </FadingRow>
    </View>
  )
}

/** Tapa cuadrada con su título debajo: álbumes y listas. */
function Card({
  item,
  onPress,
  width = CARD,
}: {
  item: HomeItem
  onPress: () => void
  /** En la grilla lo decide la fila; en el carrusel es la medida fija. */
  width?: number
}) {
  const [over, setOver] = useState(false)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={onPress}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
      style={{ width }}
      className="gap-2"
    >
      <View className="overflow-hidden rounded-lg bg-card" style={{ width, height: width }}>
        {item.artworkUrl ? (
          <Image
            source={{ uri: proxiedImage(artworkUrlAtSize(item.artworkUrl, 400)) }}
            style={{ width, height: width, opacity: over ? 0.75 : 1 }}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <IconMusic size={26} color={ICON_COLOR.muted} />
          </View>
        )}
      </View>
      <View className="gap-0.5">
        <Text className="text-foreground text-[13px] font-semibold" numberOfLines={2}>
          {item.title}
        </Text>
        {item.subtitle ? (
          <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
            {item.subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

/**
 * Canciones en columnas de cuatro que se desplazan de a bloques.
 *
 * Es la forma de Apple Music para «canciones nuevas destacadas»: apilar en
 * vertical y avanzar en horizontal aprovecha mucho mejor el ancho que una fila
 * sola de tapas gigantes.
 */
function SongColumns({
  items,
  onPlay,
  menuFor,
  pendingId,
}: {
  items: HomeItem[]
  onPlay: (item: HomeItem) => void
  menuFor: (item: HomeItem) => MenuItem[]
  pendingId: string | null
}) {
  const columns: HomeItem[][] = []
  for (let i = 0; i < items.length; i += ROWS) columns.push(items.slice(i, i + ROWS))

  return (
    <>
      {columns.map((column) => (
        <View key={column[0].id} style={{ width: 340 }} className="gap-1">
          {column.map((item) => (
            <SongRow
              key={item.id}
              item={item}
              onPlay={() => onPlay(item)}
              menu={menuFor(item)}
              busy={pendingId === item.id}
            />
          ))}
        </View>
      ))}
    </>
  )
}

function SongRow({
  item,
  onPlay,
  menu,
  busy,
}: {
  item: HomeItem
  onPlay: () => void
  menu: MenuItem[]
  busy: boolean
}) {
  const [over, setOver] = useState(false)
  const current = usePlaybackTrack()
  const wantPlay = useWantPlay()
  const isCurrent = current?.videoId === item.id

  return (
    <View
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
      className={`flex-row items-center gap-3 rounded-lg p-1.5 ${over ? 'bg-muted' : ''}`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isCurrent && wantPlay ? `Pausar ${item.title}` : `Reproducir ${item.title}`}
        /* Si ya es la que suena, tocarla pausa o sigue. Antes volvía a
           resolverla y arrancaba de cero, y no había forma de pausar desde
           acá: había que ir hasta la barra de abajo. */
        onPress={() => (isCurrent ? togglePlayback() : onPlay())}
        className="min-w-0 flex-1 flex-row items-center gap-3"
      >
        <View className="h-11 w-11 overflow-hidden rounded bg-card">
          {item.artworkUrl ? (
            <Image
              source={{ uri: proxiedImage(artworkUrlAtSize(item.artworkUrl, 96)) }}
              className="h-11 w-11"
            />
          ) : null}
          <EstadoTapa busy={busy} sounding={isCurrent} playing={wantPlay} hovered={over} size={14} />
        </View>

        <View className="min-w-0 flex-1">
          <Text className="text-foreground text-[13px]" numberOfLines={1}>
            {item.title}
          </Text>
          {item.subtitle ? (
            <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
              {item.subtitle}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {/*
       * Los tres puntos van **siempre**, no solo con el cursor encima.
       *
       * `over` es el hover: en el teléfono no existe, así que las opciones de
       * una canción de la portada —fijarla, usar su tapa de fondo, sumarla a
       * una lista— directamente no se podían abrir. Es el mismo bug que ya se
       * corrigió en los resultados de búsqueda, y con el mantener apretado
       * inerte (ver `MantenerApretado`), este botón es la única puerta.
       */}
      <View className="w-8 items-center">
        <Menu items={menu} label={`Opciones de ${item.title}`} size={14} />
      </View>
    </View>
  )
}

function Loading() {
  return (
    <View className="gap-7">
      {[0, 1].map((row) => (
        <View key={row} className="gap-3">
          <View className="px-6">
            <Skeleton width={200} height={19} />
          </View>
          <View className="flex-row gap-4 px-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i} className="gap-2">
                <Skeleton width={CARD} height={CARD} radius={8} />
                <Skeleton width={CARD * 0.8} height={13} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

/** Una sección a pantalla completa: todo lo que tiene, en grilla. */
function SectionPage({
  section,
  onBack,
  onOpenAlbum,
  onOpenPlaylist,
  onPlaySong,
  menuForSong,
  pendingId,
}: {
  section: HomeSection
  onBack: () => void
  onOpenAlbum: (item: HomeItem) => void
  onOpenPlaylist: (item: HomeItem) => void
  onPlaySong: (item: HomeItem) => void
  menuForSong: (item: HomeItem) => MenuItem[]
  pendingId: string | null
}) {
  const songs = section.items.every((item) => item.kind === 'song')
  const piso = usePiso(24)
  /* La cabecera de la sección arranca debajo del encabezado flotante. */
  const techo = useTecho(24)
  const colapso = useColapso()

  /*
   * Cuántas tapas por fila, y cuánto mide cada una.
   *
   * `CARD` deja de ser el ancho y pasa a ser lo que era en realidad: el tamaño
   * *deseable* de una tapa. Con eso se calcula cuántas entran —nunca menos de
   * dos, o en un teléfono angosto quedaría una sola gigante por fila— y recién
   * ahí se reparte el ancho sobrante entre ellas, descontando los huecos.
   */
  const [ancho, setAncho] = useState(0)
  const columnas = Math.max(2, Math.floor((ancho + GRID_GAP) / (CARD + GRID_GAP)))
  const lado = ancho > 0 ? (ancho - GRID_GAP * (columnas - 1)) / columnas : CARD

  return (
    <View className="min-h-0 flex-1">
      <View className="flex-row items-center gap-3 px-6 pb-4" style={{ paddingTop: techo }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver a la portada"
          onPress={onBack}
          className="h-9 w-9 items-center justify-center rounded-full bg-muted active:opacity-70"
        >
          <IconBack size={15} color={ICON_COLOR.muted} />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text className="text-foreground text-2xl font-bold" numberOfLines={1}>
            {section.title}
          </Text>
          <Text className="text-muted-foreground text-xs">
            {section.items.length} {section.items.length === 1 ? 'cosa' : 'cosas'}
          </Text>
        </View>
      </View>

      <ScrollView
        className="min-h-0 flex-1"
        contentContainerClassName="px-6"
        contentContainerStyle={{ paddingBottom: piso }}
        {...colapso}
      >
        {songs ? (
          <View className="gap-1">
            {section.items.map((item) => (
              <SongRow
                key={item.id}
                item={item}
                onPlay={() => onPlaySong(item)}
                menu={menuForSong(item)}
                busy={pendingId === item.id}
              />
            ))}
          </View>
        ) : (
          /*
           * Grilla que **llena la fila**.
           *
           * Antes las tapas tenían el ancho fijo del carrusel y el `flex-wrap`
           * decidía cuántas entraban: en el teléfono entraban dos y lo que
           * sobraba quedaba como una franja muerta contra el borde derecho,
           * más ancha cuanto más grande el teléfono. El ancho de la tapa no
           * puede ser un número puesto a mano — es lo que queda de dividir la
           * fila entre las que entran.
           *
           * Se mide el contenedor en vez de la ventana porque en escritorio
           * esto vive adentro de un panel que no la ocupa entera.
           */
          <View className="flex-row flex-wrap gap-4" onLayout={(e) => setAncho(e.nativeEvent.layout.width)}>
            {section.items.map((item) => (
              <Card
                key={item.id}
                item={item}
                width={lado}
                onPress={() => (item.kind === 'album' ? onOpenAlbum(item) : onOpenPlaylist(item))}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
