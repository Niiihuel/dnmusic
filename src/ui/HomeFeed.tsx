import { Fragment, useEffect, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { artworkUrlAtSize } from '../lib/artwork'
import {
  fetchGenero,
  fetchGeneros,
  fetchHome,
  proxiedImage,
  type Genero,
  type HomeItem,
  type HomeSection,
} from '../services/music'
import { FadingRow } from './FadingScroll'
import { togglePlayback, usePlaybackTrack, useWantPlay } from '../state/playback'
import { usePiso, useTecho } from '../state/shell'
import { useColapso } from './useColapso'
import { Menu, type MenuItem } from './Menu'
import { Panel } from './Panel'
import { VacioError } from './Vacio'
import { EstadoTapa } from './CoverState'
import { Skeleton } from './Skeleton'
import { ICON_COLOR, IconBack, IconChevronRight, IconMusic } from './icons'

/** Lado de una tapa en el carrusel, y el tamaño deseable en la grilla. */
const CARD = 168
/** La primera sección lleva tapas más grandes: es la vidriera de la portada,
 *  como el «Latest» de Apple Music, que agranda justo lo más nuevo. */
const CARD_GRANDE = 214
/** Qué secciones son un chart: llevan el puesto adelante, como Apple Music. */
const ES_CHART = /trending|éxitos|exitos|\btop\b|charts?/i
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
  genero = null,
  generosAbiertos = false,
  onOpenSection,
  onOpenGenero,
  onOpenGeneros,
  onOpenAlbum,
  onOpenPlaylist,
  onPlaySong,
  menuForSong,
  pendingId,
}: {
  /** Sección abierta a pantalla completa; null es la portada con carruseles. */
  section: string | null
  /** Un género abierto: su página, con las listas y álbumes de la categoría. */
  genero?: { params: string; name: string } | null
  /** La grilla con todos los géneros, a pantalla completa. */
  generosAbiertos?: boolean
  onOpenSection: (title: string | null) => void
  onOpenGenero?: (genero: Genero) => void
  onOpenGeneros?: () => void
  onOpenAlbum: (item: HomeItem) => void
  onOpenPlaylist: (item: HomeItem) => void
  onPlaySong: (item: HomeItem) => void
  menuForSong: (item: HomeItem) => MenuItem[]
  pendingId: string | null
}) {
  const [sections, setSections] = useState<HomeSection[] | null>(null)
  /* Los géneros, aparte de las secciones: salen de otra ruta y llegan después
     — la primera vez el servidor arma las tapas y tarda unos segundos. */
  const [generos, setGeneros] = useState<Genero[] | null>(null)
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

  useEffect(() => {
    if (generos !== null) return
    const controller = new AbortController()
    /* Un pedido abortado —el efecto se rehízo por otro render— devuelve `[]`,
       y grabarlo dejaría la fila escondida para siempre: solo cuenta la
       respuesta que llegó entera. Con `generos` todavía en null, el próximo
       render lo vuelve a pedir. */
    fetchGeneros(controller.signal).then((g) => {
      if (!controller.signal.aborted) setGeneros(g)
    })
    return () => controller.abort()
  }, [generos])

  /* La página de un género, encima de todo: es una parada del historial. */
  if (genero) {
    return (
      <Panel className="flex-1">
        <GeneroPage
          genero={genero}
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

  if (generosAbiertos && onOpenGenero) {
    return (
      <Panel className="flex-1">
        <GenerosPage
          generos={generos}
          onBack={() => onOpenSection(null)}
          onOpen={onOpenGenero}
        />
      </Panel>
    )
  }

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
          /* Sin conexión lo dice como tal, con reintento; cualquier otra falla
             también tiene salida. Volver a null dispara el efecto de nuevo. */
          <VacioError
            icono={<IconMusic size={22} color={ICON_COLOR.muted} />}
            titulo="La portada no llegó"
            detalle="No pude traer las novedades. Tus listas siguen donde siempre."
            onReintentar={() => setSections(null)}
          />
        ) : (
          sections.map((section, i) => (
            <Fragment key={section.title}>
              <Section
                section={section}
                /* La primera sección es la vidriera: tapas más grandes. */
                destacada={i === 0}
                onOpen={() => onOpenSection(section.title)}
                onOpenAlbum={onOpenAlbum}
                onOpenPlaylist={onOpenPlaylist}
                onPlaySong={onPlaySong}
                menuForSong={menuForSong}
                pendingId={pendingId}
              />
              {/* Los géneros van después del primer carrusel, como el
                  «Explorar por género» de Apple Music: arriba lo nuevo, y
                  enseguida el mapa para el que no busca nada puntual. */}
              {i === 0 && generos?.length && onOpenGenero && onOpenGeneros ? (
                <GenerosRow generos={generos} onOpen={onOpenGenero} onVerTodo={onOpenGeneros} />
              ) : null}
            </Fragment>
          ))
        )}
      </ScrollView>
    </Panel>
  )
}

function Section({
  section,
  destacada = false,
  onOpen,
  onOpenAlbum,
  onOpenPlaylist,
  onPlaySong,
  menuForSong,
  pendingId,
}: {
  section: HomeSection
  /** Con tapas más grandes: la primera sección de la portada. */
  destacada?: boolean
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
            /* Un chart lleva el puesto adelante, como el Top de Apple Music. */
            ranking={ES_CHART.test(section.title)}
          />
        ) : (
          section.items.map((item) => (
            <Card
              key={item.id}
              item={item}
              width={destacada ? CARD_GRANDE : CARD}
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
  ranking = false,
}: {
  items: HomeItem[]
  onPlay: (item: HomeItem) => void
  menuFor: (item: HomeItem) => MenuItem[]
  pendingId: string | null
  /** Numerado, como el Top de Apple Music: el puesto va adelante de la tapa. */
  ranking?: boolean
}) {
  const columns: HomeItem[][] = []
  for (let i = 0; i < items.length; i += ROWS) columns.push(items.slice(i, i + ROWS))

  return (
    <>
      {columns.map((column, c) => (
        <View key={column[0].id} style={{ width: 360 }} className="gap-1">
          {column.map((item, f) => (
            <SongRow
              key={item.id}
              item={item}
              onPlay={() => onPlay(item)}
              menu={menuFor(item)}
              busy={pendingId === item.id}
              puesto={ranking ? c * ROWS + f + 1 : undefined}
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
  puesto,
}: {
  item: HomeItem
  onPlay: () => void
  menu: MenuItem[]
  busy: boolean
  /** El lugar en el chart; sin él, la fila no lleva número. */
  puesto?: number
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
        {/* El puesto, apagado y tabular: el número acompaña, la tapa manda. */}
        {puesto !== undefined ? (
          <Text className="w-6 text-center text-muted-foreground text-[15px] font-semibold tabular-nums">
            {puesto}
          </Text>
        ) : null}
        <View className="h-14 w-14 overflow-hidden rounded-lg bg-card">
          {item.artworkUrl ? (
            <Image
              source={{ uri: proxiedImage(artworkUrlAtSize(item.artworkUrl, 128)) }}
              className="h-14 w-14"
            />
          ) : null}
          <EstadoTapa busy={busy} sounding={isCurrent} playing={wantPlay} hovered={over} size={15} />
        </View>

        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-foreground text-[14px]" numberOfLines={1}>
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

/* ── Géneros ──────────────────────────────────────────────────────────────── */

/** Medida deseable de una tarjeta de género; la grilla la recalcula. */
const GENERO_W = 260
/** Proporción apaisada, como las tarjetas de género de Apple Music. */
const GENERO_RATIO = 0.58

/**
 * La tarjeta de un género: la foto ocupa todo, el nombre abajo a la izquierda.
 *
 * Es la tarjeta de Apple Music traducida a este sistema: allá el color lo pone
 * la marca de cada género; acá la UI es acromática y **el color lo trae la
 * imagen** —la tapa de la primera lista del género—, con un degradado oscuro
 * abajo para que el nombre se lea sobre cualquier foto. Sin líneas ni bordes:
 * la tarjeta se separa del fondo por la foto misma.
 */
function GeneroCard({
  genero,
  onPress,
  width = GENERO_W,
}: {
  genero: Genero
  onPress: () => void
  width?: number
}) {
  const [over, setOver] = useState(false)
  const alto = Math.round(width * GENERO_RATIO)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={genero.name}
      onPress={onPress}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
      style={{ width }}
      className="active:opacity-80"
    >
      <View className="overflow-hidden rounded-lg bg-card" style={{ width, height: alto }}>
        {genero.artworkUrl ? (
          <Image
            source={{ uri: proxiedImage(artworkUrlAtSize(genero.artworkUrl, 400)) }}
            resizeMode="cover"
            style={{ width, height: alto, opacity: over ? 0.75 : 1 }}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <IconMusic size={22} color={ICON_COLOR.muted} />
          </View>
        )}
        {/* El velo de abajo: lo único que garantiza que el nombre se lea
            sobre una tapa clara. Tres paradas para que no se vea la línea. */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0.78)']}
          locations={[0.35, 0.62, 1]}
          style={StyleSheet.absoluteFill}
        />
        <Text
          numberOfLines={1}
          className="absolute bottom-2.5 left-3 right-3 text-foreground text-[15px] font-bold"
          style={{ textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 6 }}
        >
          {genero.name}
        </Text>
      </View>
    </Pressable>
  )
}

/** La fila de géneros de la portada, con su «ver todo» en el título. */
function GenerosRow({
  generos,
  onOpen,
  onVerTodo,
}: {
  generos: Genero[]
  onOpen: (genero: Genero) => void
  onVerTodo: () => void
}) {
  return (
    <View className="gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ver todos los géneros"
        onPress={onVerTodo}
        className="flex-row items-center gap-1.5 self-start px-6 active:opacity-70"
      >
        <Text className="text-foreground text-[19px] font-bold">Géneros y momentos</Text>
        <IconChevronRight size={17} color={ICON_COLOR.muted} />
      </Pressable>
      <FadingRow gap={16} padding={24}>
        {generos.map((genero) => (
          <GeneroCard key={genero.params} genero={genero} onPress={() => onOpen(genero)} />
        ))}
      </FadingRow>
    </View>
  )
}

/** Todos los géneros, en grilla a pantalla completa. */
function GenerosPage({
  generos,
  onBack,
  onOpen,
}: {
  generos: Genero[] | null
  onBack: () => void
  onOpen: (genero: Genero) => void
}) {
  const piso = usePiso(24)
  const techo = useTecho(24)
  const colapso = useColapso()
  /* El mismo reparto que la grilla de una sección: cuántas entran del ancho
     deseable, nunca menos de dos, y el sobrante repartido entre ellas. */
  const [ancho, setAncho] = useState(0)
  const columnas = Math.max(2, Math.floor((ancho + GRID_GAP) / (GENERO_W + GRID_GAP)))
  const lado = ancho > 0 ? (ancho - GRID_GAP * (columnas - 1)) / columnas : GENERO_W

  return (
    /* La cabecera adentro del scroll, como la de una sección: el contenido
       corre hasta el borde y se apaga contra el velo en vez de cortarse. */
    <ScrollView
      className="min-h-0 flex-1"
      contentContainerClassName="px-6"
      contentContainerStyle={{ paddingTop: techo, paddingBottom: piso }}
      {...colapso}
    >
      <View className="flex-row items-center gap-3 pb-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver a la portada"
          onPress={onBack}
          className="h-9 w-9 items-center justify-center rounded-full bg-muted active:opacity-70"
        >
          <IconBack size={15} color={ICON_COLOR.muted} />
        </Pressable>
        <Text className="text-foreground text-2xl font-bold" numberOfLines={1}>
          Géneros y momentos
        </Text>
      </View>

      {generos === null ? (
        <View className="flex-row flex-wrap gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} width={GENERO_W} height={GENERO_W * GENERO_RATIO} radius={8} />
          ))}
        </View>
      ) : (
        <View
          className="flex-row flex-wrap gap-4"
          onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
        >
          {generos.map((genero) => (
            <GeneroCard
              key={genero.params}
              genero={genero}
              width={lado}
              onPress={() => onOpen(genero)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  )
}

/**
 * La página de un género: sus listas y álbumes, en la grilla de una sección.
 *
 * Lo que llega se guarda junto a la categoría que se pidió — «cargando» es
 * «lo que tengo no es de este género», el mismo criterio del álbum y el
 * artista — y se dibuja con `SectionPage`, que ya sabe armar la grilla.
 */
function GeneroPage({
  genero,
  onBack,
  onOpenAlbum,
  onOpenPlaylist,
  onPlaySong,
  menuForSong,
  pendingId,
}: {
  genero: { params: string; name: string }
  onBack: () => void
  onOpenAlbum: (item: HomeItem) => void
  onOpenPlaylist: (item: HomeItem) => void
  onPlaySong: (item: HomeItem) => void
  menuForSong: (item: HomeItem) => MenuItem[]
  pendingId: string | null
}) {
  const [cargado, setCargado] = useState<{ params: string; items: HomeItem[] } | null>(null)
  const fresco = cargado?.params === genero.params
  const piso = usePiso(24)
  const techo = useTecho(24)

  useEffect(() => {
    if (fresco) return
    const controller = new AbortController()
    fetchGenero(genero.params, controller.signal).then((items) =>
      setCargado({ params: genero.params, items }),
    )
    return () => controller.abort()
  }, [genero.params, fresco])

  if (!fresco) {
    /*
     * El esqueleto calca la página que viene: la misma cabecera —la flecha y
     * el nombre, que ya se saben— y una grilla de cuadrados donde van a estar
     * las tapas. Antes se prestaba el esqueleto de la portada, sin techo:
     * quedaba pegado al reloj y con la forma de otra pantalla.
     */
    return (
      <ScrollView
        className="min-h-0 flex-1"
        contentContainerClassName="px-6"
        contentContainerStyle={{ paddingTop: techo, paddingBottom: piso }}
      >
        <View className="flex-row items-center gap-3 pb-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver a la portada"
            onPress={onBack}
            className="h-9 w-9 items-center justify-center rounded-full bg-muted active:opacity-70"
          >
            <IconBack size={15} color={ICON_COLOR.muted} />
          </Pressable>
          <Text className="text-foreground text-2xl font-bold" numberOfLines={1}>
            {genero.name}
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <View key={i} className="gap-2">
              <Skeleton width={CARD} height={CARD} radius={8} />
              <Skeleton width={CARD * 0.7} height={13} />
            </View>
          ))}
        </View>
      </ScrollView>
    )
  }

  /* Solo lo abrible como colección: las canciones y artistas sueltos que
     alguna categoría mezcla no tienen lugar en esta grilla de tapas. */
  const items = cargado.items.filter(
    (item) => item.kind === 'album' || item.kind === 'playlist',
  )

  return (
    <SectionPage
      section={{ title: genero.name, items }}
      onBack={onBack}
      onOpenAlbum={onOpenAlbum}
      onOpenPlaylist={onOpenPlaylist}
      onPlaySong={onPlaySong}
      menuForSong={menuForSong}
      pendingId={pendingId}
    />
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

  /* Un chart abierto conserva sus puestos: el número es parte de la sección. */
  const ranking = ES_CHART.test(section.title)

  return (
    /*
     * La cabecera va **adentro** del scroll, no fija arriba.
     *
     * Es la regla del encabezado flotante (`docs/DESIGN.md`): el contenido
     * corre hasta el borde y se apaga contra el velo del reloj, como en el
     * álbum y el artista. Con la cabecera fija afuera, las filas se cortaban
     * en seco contra su borde — la única línea dura de la app.
     */
    <ScrollView
      className="min-h-0 flex-1"
      contentContainerClassName="px-6"
      contentContainerStyle={{ paddingTop: techo, paddingBottom: piso }}
      {...colapso}
    >
      <View className="flex-row items-center gap-3 pb-4">
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

      {songs ? (
          <View className="gap-1">
            {section.items.map((item, i) => (
              <SongRow
                key={item.id}
                item={item}
                onPlay={() => onPlaySong(item)}
                menu={menuForSong(item)}
                busy={pendingId === item.id}
                puesto={ranking ? i + 1 : undefined}
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
  )
}
