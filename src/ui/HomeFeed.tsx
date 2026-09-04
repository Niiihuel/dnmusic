import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { artworkSource, artworkUrlAtSize } from '../lib/artwork'
import {
  fetchArtist,
  fetchGenero,
  fetchGeneros,
  fetchHome,
  fetchHomeGeneros,
  proxiedImage,
  type Genero,
  type HomeItem,
  type HomeSection,
} from '../services/music'
import { FadingRow } from './FadingScroll'
import {
  playQueue,
  togglePlayback,
  usePlaybackOriginId,
  usePlaybackTrack,
  useWantPlay,
} from '../state/playback'
import { abrirLista, usePiso, useTecho } from '../state/shell'
import {
  mezclasPersonales,
  proximasRecomendadas,
  tandaDeMix,
  type MixPersonal,
} from '../services/recomendaciones'
import { listPlaylists, type Playlist, type PlaylistTrack } from '../services/playlists'
import {
  artistasRecientes,
  origenesRecientes,
  ultimasEscuchas,
  type ArtistaReciente,
  type EscuchaReciente,
  type OrigenReciente,
} from '../services/plays'
import { listarSemillas, type Semilla } from '../services/semillas'
import { useMyProfile } from '../state/session'
import { PlaylistCover } from './PlaylistCover'
import { useColapso } from './useColapso'
import { Menu, type MenuItem } from './Menu'
import { Panel } from './Panel'
import { VacioError } from './Vacio'
import { EstadoTapa } from './CoverState'
import { Skeleton } from './Skeleton'
import { ICON_COLOR, IconBack, IconChevronRight, IconHeart, IconMusic, IconPause, IconPlay, IconWave } from './icons'

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
  onOpenArtist,
  onOpenGustos,
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
  /** La ficha de un artista: «Tus artistas» y «Porque escuchaste…» llevan ahí. */
  onOpenArtist?: (artistId: string, nombre: string) => void
  /** «Tus me gusta», desde la grilla de accesos. */
  onOpenGustos?: () => void
  onPlaySong: (item: HomeItem) => void
  menuForSong: (item: HomeItem) => MenuItem[]
  pendingId: string | null
}) {
  /*
   * Todo lo que dibuja la portada, **de una sola vez**.
   *
   * Antes cada fila pedía lo suyo y aparecía cuando llegaba: la portada
   * primero, los géneros unos segundos después, «Hecho para vos» al final —
   * la pantalla se armaba a saltos y las tapas de los mixes llegaban vacías.
   * Ahora hay una sola espera, con un esqueleto, y después la portada entera.
   * Lo que no llegó a tiempo se dibuja igual sin esa fila; nada aparece tarde.
   */
  const { inicio, recargar } = useInicio()
  /* Lo que ocupan el reproductor y las pestañas, más el respiro de siempre. */
  const piso = usePiso(24)
  /* Y lo que flota arriba —reloj y encabezado—, con el respiro que ya tenía
     (`pt-6`). Al desplazar, las tapas pasan por detrás del velo. */
  const techo = useTecho(24)
  /* Bajando, la cáscara se pliega; subiendo, vuelve. Ver `useColapso`. */
  const colapso = useColapso()

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
          generos={inicio?.generos ?? null}
          onBack={() => onOpenSection(null)}
          onOpen={onOpenGenero}
        />
      </Panel>
    )
  }

  const abierta = inicio?.sections.find((s) => s.title === openSection) ?? null

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
        {/*
         * El home tiene dos mitades independientes: **lo tuyo** —«Hecho para
         * vos» y las filas de tus géneros— y **la portada** de YouTube Music.
         * La primera no depende de la segunda: antes, cuando la portada no
         * llegaba, se comía también lo tuyo con un cartel de error a pantalla
         * completa. Ahora lo tuyo se muestra igual, y la portada que falla es a
         * lo sumo un renglón chico —o nada, si tenés con qué llenar el inicio.
         */}
        {inicio === null ? (
          <Loading />
        ) : (
          <>
            {/*
             * El inicio es de cada persona, como el de Spotify: arranca con
             * el saludo y **lo que usás** —las colecciones que sonaron
             * últimamente en una grilla, y las canciones donde te quedaste—,
             * después lo hecho para vos, tus artistas y lo que se desprende
             * de ellos, y recién al final la portada de YouTube Music, que
             * es la misma para todo el mundo. Cada sección se calla si no
             * tiene con qué: una cuenta nueva ve el saludo y la portada.
             */}
            <Saludo />
            <AccesosRapidos
              origenes={inicio.origenes}
              listas={inicio.listas}
              onOpenGustos={onOpenGustos}
            />
            <SeguirEscuchando
              escuchas={inicio.escuchas}
              onPlaySong={onPlaySong}
              menuForSong={menuForSong}
              pendingId={pendingId}
            />
            {/* «Hecho para vos» habla de quién sos, y va antes de lo que habla
                del mundo. */}
            <ParaVos
              radio={inicio.radio}
              mixes={inicio.mixes}
              onPlaySong={onPlaySong}
              menuForSong={menuForSong}
              pendingId={pendingId}
            />
            <TusArtistas artistas={inicio.artistas} onOpenArtist={onOpenArtist} />
            <PorqueEscuchaste
              ancla={inicio.artistas[0] ?? null}
              items={inicio.porque}
              onOpenArtist={onOpenArtist}
              onOpenAlbum={onOpenAlbum}
            />
            {/* Lo tuyo: una fila de listas por cada género que elegiste. Tocar
                «ver todo» abre la página del género, reconstruida desde la
                semilla. */}
            {inicio.misGeneros.map((section) => (
              <Section
                key={`mio-${section.title}`}
                section={section}
                onOpen={() => {
                  const semilla = inicio.semillas.find(
                    (s: Semilla) => s.kind === 'genero' && s.name === section.title,
                  )
                  if (semilla && onOpenGenero)
                    onOpenGenero({ params: semilla.ref, name: semilla.name, artworkUrl: semilla.artworkUrl })
                }}
                onOpenAlbum={onOpenAlbum}
                onOpenPlaylist={onOpenPlaylist}
                onPlaySong={onPlaySong}
                menuForSong={menuForSong}
                pendingId={pendingId}
              />
            ))}
            {/* La portada que no llegó solo grita si no hay nada más para
                mostrar; con filas propias arriba, se calla. */}
            {inicio.sections.length === 0 && !inicio.misGeneros.length ? (
              <VacioError
                icono={<IconMusic size={22} color={ICON_COLOR.muted} />}
                titulo="La portada no llegó"
                detalle="No pude traer las novedades. Tus listas siguen donde siempre."
                onReintentar={recargar}
              />
            ) : null}
            {inicio.sections.map((section, i) => (
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
                {i === 0 && inicio.generos.length && onOpenGenero && onOpenGeneros ? (
                  <GenerosRow generos={inicio.generos} onOpen={onOpenGenero} onVerTodo={onOpenGeneros} />
                ) : null}
              </Fragment>
            ))}
          </>
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

/* ── Hecho para vos ───────────────────────────────────────────────────────── */

/** El id de origen con que la radio personal entra a la cola. */
const ORIGEN_RADIO = 'radio-personal'

/**
 * La fila que habla de **vos**, ahora en tres capas.
 *
 * · **Tu radio**: una tarjeta grande que arranca la tanda del motor — anclas
 *   del historial, tus corazones, tus listas y tus semillas, con su mitad de
 *   exploración. Es la puerta grande al algoritmo propio.
 * · **Tus mixes**: un mix por artista que pesa en tu biblioteca (corazones +
 *   listas, ver `mezclasPersonales`). Tocarlo suena la radio anclada solo en
 *   ese artista — «todo suyo y lo cercano a él», sin pasar por la búsqueda.
 * · **La tanda**: las canciones concretas del motor, como siempre.
 *
 * Si el motor no tiene nada que decir —cuenta sin corazones, sin listas, sin
 * escucha y sin red— la fila entera no aparece: la portada vuelve a ser la
 * vidriera de YouTube, que es lo que era.
 *
 * No se recarga al volver a la portada: se pide una vez por montado y listo,
 * porque cada pieza cuesta varios pedidos al catálogo y esto no es más que
 * un aperitivo de la radio.
 */
function ParaVos({
  radio,
  mixes,
  onPlaySong,
  menuForSong,
  pendingId,
}: {
  /** La tanda de tu radio, ya cargada con el resto del inicio. */
  radio: PlaylistTrack[]
  mixes: MixPersonal[]
  onPlaySong: (item: HomeItem) => void
  menuForSong: (item: HomeItem) => MenuItem[]
  pendingId: string | null
}) {
  const soundingTrack = usePlaybackTrack()
  const wantPlay = useWantPlay()
  const originId = usePlaybackOriginId()

  if (!radio.length && !mixes.length) return null

  const sonandoRadio = originId === ORIGEN_RADIO && !!soundingTrack
  const tocarRadio = () => {
    /* Ya es tu cola: tocarla pausa o sigue, como cualquier colección. */
    if (sonandoRadio) {
      togglePlayback()
      return
    }
    if (radio.length) playQueue(radio, 0, { id: ORIGEN_RADIO, name: 'Tu radio' })
  }

  const itemsTanda: HomeItem[] | null = radio.length
    ? radio.map((t) => ({
        kind: 'song' as const,
        id: t.videoId,
        title: t.title,
        subtitle: t.artist,
        artworkUrl: t.artworkUrl ?? '',
        artistId: t.artistId,
        year: null,
      }))
    : null

  const taparMix = (mix: MixPersonal) => {
    void tandaDeMix({ artist_id: mix.artist_id, artist: mix.artist, ms: 1 }).then((tanda) => {
      if (tanda.length)
        playQueue(tanda, 0, { id: `mix:${mix.artist_id}`, name: `Mix de ${mix.artist}` })
    })
  }

  return (
    <View className="gap-3">
      <Text className="px-6 text-foreground text-[19px] font-bold">Hecho para vos</Text>
      {/* Radio y mixes comparten carrusel: la tarjeta grande abre la fila y
          los mixes la siguen, como el hero + tiles de Apple Music. */}
      <FadingRow gap={16} padding={24}>
        {radio.length ? (
          <TarjetaRadio
            tapa={radio[0].artworkUrl ?? ''}
            sonando={sonandoRadio}
            playing={wantPlay}
            onPress={tocarRadio}
          />
        ) : null}
        {mixes.map((mix) => (
          <TarjetaMix key={mix.artist_id} mix={mix} onPress={() => taparMix(mix)} />
        ))}
      </FadingRow>
      {itemsTanda ? (
        <FadingRow gap={16} padding={24}>
          <SongColumns
            items={itemsTanda}
            onPlay={onPlaySong}
            menuFor={menuForSong}
            pendingId={pendingId}
          />
        </FadingRow>
      ) : null}
    </View>
  )
}

/** Lado de la tarjeta de radio: la misma medida que la vidriera. */
const RADIO_LADO = CARD_GRANDE

/**
 * La tarjeta de Tu radio: la tapa de la primera canción, el botón encima.
 *
 * El color lo trae la imagen y el velo oscuro garantiza la lectura, igual que
 * en las tarjetas de género; el botón centrado dice sin palabras que acá se
 * toca para escuchar, no para abrir nada.
 */
function TarjetaRadio({
  tapa,
  sonando,
  playing,
  onPress,
}: {
  tapa: string
  /** Esta cola es la que está sonando ahora mismo. */
  sonando: boolean
  playing: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sonando && playing ? 'Pausar tu radio' : 'Reproducir tu radio'}
      onPress={onPress}
      className="gap-2 active:opacity-80"
      style={{ width: RADIO_LADO }}
    >
      <View
        className="overflow-hidden rounded-lg bg-card"
        style={{ width: RADIO_LADO, height: RADIO_LADO }}
      >
        {tapa ? (
          <Image
            source={{ uri: proxiedImage(artworkUrlAtSize(tapa, 400)) }}
            style={{ width: RADIO_LADO, height: RADIO_LADO }}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <IconMusic size={26} color={ICON_COLOR.muted} />
          </View>
        )}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0.78)']}
          locations={[0.35, 0.62, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View className="absolute inset-0 items-center justify-center">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-black/45">
            {sonando && playing ? (
              <IconPause size={24} color="#fff" />
            ) : (
              <View style={{ paddingLeft: 3 }}>
                <IconPlay size={24} color="#fff" />
              </View>
            )}
          </View>
        </View>
        <Text
          numberOfLines={1}
          className="absolute bottom-2.5 left-3 right-3 text-foreground text-[15px] font-bold"
          style={{ textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 6 }}
        >
          Tu radio
        </Text>
      </View>
      <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
        según tus me gusta y tus listas
      </Text>
    </Pressable>
  )
}

/**
 * Un mix de artista, con la forma de las tarjetas de álbum.
 *
 * Se distingue de un disco en el título («Mix de …») y en el comportamiento:
 * tocarlo no abre página alguna, pone la cola a sonar — el mix es un destino
 * audible, no una pantalla más que atravesar.
 */
function TarjetaMix({ mix, onPress }: { mix: MixPersonal; onPress: () => void }) {
  return (
    <Card item={{
      kind: 'playlist',
      id: `mix:${mix.artist_id}`,
      title: `Mix de ${mix.artist}`,
      subtitle: mix.artist,
      artworkUrl: mix.artworkUrl,
      artistId: null,
      year: null,
    }} width={CARD} onPress={onPress} />
  )
}

/* ── Lo tuyo: el inicio que sale del historial ────────────────────────────── */

type Inicio = {
  sections: HomeSection[]
  generos: Genero[]
  semillas: Semilla[]
  misGeneros: HomeSection[]
  escuchas: EscuchaReciente[]
  origenes: OrigenReciente[]
  artistas: ArtistaReciente[]
  /** Tus listas, para resolver los orígenes que son una lista propia. */
  listas: Playlist[]
  radio: PlaylistTrack[]
  mixes: MixPersonal[]
  /** Lo que se desprende de tu artista más escuchado. */
  porque: HomeItem[]
}

/** Cuánto se espera, como mucho, a que llegue todo. Después va lo que haya. */
const ESPERA_MS = 12_000

/** Una promesa, o vacío si tarda de más o falla: nada frena la portada. */
function oVacio<T>(p: Promise<T>, vacio: T): Promise<T> {
  return Promise.race([
    p.catch(() => vacio),
    new Promise<T>((resolve) => setTimeout(() => resolve(vacio), ESPERA_MS)),
  ])
}

/**
 * Todo lo que dibuja el inicio, leído junto.
 *
 * Son nueve pedidos —la portada, los géneros, las semillas y sus filas, tu
 * historial en tres vistas, tus listas, la radio y los mixes, y los parecidos
 * de tu artista más escuchado— que antes llegaban cada uno por su lado y hoy
 * salen en paralelo y se entregan de una sola vez. `null` mientras no está
 * todo; después, la portada entera. Lo que falló o tardó de más llega vacío y
 * su fila no se dibuja: el historial es un lujo, la portada un adorno, y
 * ninguno de los dos puede dejar la pantalla en blanco.
 */
function useInicio(): { inicio: Inicio | null; recargar: () => void } {
  const [inicio, setInicio] = useState<Inicio | null>(null)
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    let vivo = true
    void (async () => {
      const [sections, generos, semillas, escuchas, origenes, artistas, listas, radio, mixes] =
        await Promise.all([
          oVacio(fetchHome(), []),
          oVacio(fetchGeneros(), []),
          oVacio(listarSemillas(), []),
          oVacio(ultimasEscuchas(12), []),
          oVacio(origenesRecientes(8), []),
          oVacio(artistasRecientes(8), []),
          oVacio(listPlaylists(), []),
          oVacio(proximasRecomendadas(), []),
          oVacio(mezclasPersonales(6), []),
        ])
      /* Dos pedidos dependen de lo anterior: las filas de los géneros
         elegidos y los parecidos del artista más escuchado. Van juntos. */
      const soloGeneros = semillas.filter((s) => s.kind === 'genero')
      const ancla = artistas[0]
      const [misGeneros, ficha] = await Promise.all([
        soloGeneros.length ? oVacio(fetchHomeGeneros(soloGeneros), []) : Promise.resolve([]),
        ancla ? oVacio(fetchArtist(ancla.artistId), null) : Promise.resolve(null),
      ])
      const porque = ficha ? (ficha.relacionados.length ? ficha.relacionados : ficha.albums).slice(0, 12) : []
      if (!vivo) return
      setInicio({
        sections,
        generos,
        semillas,
        misGeneros,
        escuchas,
        origenes,
        artistas,
        listas,
        radio,
        mixes: conTapa(mixes, artistas, escuchas),
        porque,
      })
    })()
    return () => {
      vivo = false
    }
  }, [vuelta])

  /* Recargar vacía primero: así vuelve el esqueleto y no la portada vieja
     mientras llega la nueva. */
  const recargar = () => {
    setInicio(null)
    setVuelta((n) => n + 1)
  }
  return { inicio, recargar }
}

/**
 * Los mixes con tapa, sí o sí.
 *
 * `mezclasPersonales` toma la primera carátula que encuentra entre tus
 * corazones y tus listas; si el artista entró solo por tiempo escuchado, no
 * hay ninguna. El historial sí la tiene —guarda la tapa de cada escucha— y de
 * ahí se completa. Un mix sin tapa era el cuadrado gris que se veía antes.
 */
function conTapa(
  mixes: MixPersonal[],
  artistas: ArtistaReciente[],
  escuchas: EscuchaReciente[],
): MixPersonal[] {
  return mixes.map((m) => {
    if (m.artworkUrl) return m
    const del =
      artistas.find((a) => a.artistId === m.artist_id) ??
      escuchas.find((e) => e.artistId === m.artist_id)
    const tapa = del ? artworkSource(del.artworkPath, del.artworkUrl, 400) : null
    return tapa ? { ...m, artworkUrl: tapa } : m
  })
}

/**
 * El saludo, por la hora: es lo primero que dice el inicio de Spotify, y es la
 * forma más barata de que la pantalla sea de alguien y no de todos. Con el
 * nombre visible si lo puso; si no, a secas.
 */
function Saludo() {
  const perfil = useMyProfile()
  const hora = new Date().getHours()
  const saludo = hora < 6 ? 'Buenas noches' : hora < 13 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'
  const nombre = perfil?.displayName?.trim()
  return (
    <Text className="px-6 text-foreground text-[26px] font-bold">
      {nombre ? `${saludo}, ${nombre.split(' ')[0]}` : saludo}
    </Text>
  )
}

/** Lo que una losa de la grilla puede abrir o poner a sonar. */
type Acceso = {
  id: string
  nombre: string
  tapa: ReactNode
  onPress: () => void
}

/**
 * La grilla de accesos: las colecciones que **usás**, dos por fila.
 *
 * Es la grilla de arriba del inicio de Spotify, y su regla es la misma: no son
 * las listas que tenés sino las que sonaron últimamente, del historial. Entran
 * tus listas, tus mixes y la radio; «Tus me gusta» va siempre primero porque
 * es la colección que todo el mundo tiene. Sin historial, la grilla es esa
 * sola losa —una fila de una— y no se dibuja: una grilla de uno no es grilla.
 */
function AccesosRapidos({
  origenes,
  listas,
  onOpenGustos,
}: {
  origenes: OrigenReciente[] | null
  listas: Playlist[] | null
  onOpenGustos?: () => void
}) {
  if (!origenes?.length) return null

  const accesos: Acceso[] = []
  if (onOpenGustos) {
    accesos.push({
      id: 'gustos',
      nombre: 'Tus me gusta',
      tapa: (
        <View className="h-14 w-14 items-center justify-center rounded-l-lg bg-muted">
          <IconHeart size={20} color={ICON_COLOR.foreground} />
        </View>
      ),
      onPress: onOpenGustos,
    })
  }
  for (const o of origenes) {
    if (accesos.length >= 6) break
    if (o.id === 'gustos') continue
    const lista = listas?.find((l) => l.id === o.id)
    if (lista) {
      accesos.push({
        id: o.id,
        nombre: lista.name,
        tapa: <PlaylistCover covers={lista.covers} coverPath={lista.coverPath} size={56} rounded="rounded-l-lg" />,
        onPress: () => abrirLista(lista.id),
      })
      continue
    }
    const tapaUri = artworkSource(o.artworkPath, o.artworkUrl, 128)
    const tapa = tapaUri ? (
      <Image source={{ uri: tapaUri }} className="h-14 w-14 rounded-l-lg bg-muted" />
    ) : (
      <View className="h-14 w-14 items-center justify-center rounded-l-lg bg-muted">
        <IconWave size={20} color={ICON_COLOR.muted} />
      </View>
    )
    if (o.id.startsWith('mix:')) {
      const artistId = o.id.slice(4)
      accesos.push({
        id: o.id,
        nombre: o.nombre || 'Mix',
        tapa,
        onPress: () => {
          void tandaDeMix({ artist_id: artistId, artist: o.nombre.replace(/^Mix de /, ''), ms: 1 }).then(
            (tanda) => tanda.length && playQueue(tanda, 0, { id: o.id, name: o.nombre }),
          )
        },
      })
    } else if (o.id === ORIGEN_RADIO) {
      accesos.push({
        id: o.id,
        nombre: 'Tu radio',
        tapa,
        onPress: () => {
          void proximasRecomendadas().then(
            (tanda) => tanda.length && playQueue(tanda, 0, { id: ORIGEN_RADIO, name: 'Tu radio' }),
          )
        },
      })
    }
    /* Otros orígenes —una lista que ya borraste, algo de otra versión— no
       tienen a dónde llevar y no se ofrecen. */
  }
  if (accesos.length < 2) return null

  return (
    <View className="flex-row flex-wrap gap-2 px-6">
      {accesos.map((a) => (
        <Losa key={a.id} acceso={a} />
      ))}
    </View>
  )
}

/** Una losa de la grilla: tapa a la izquierda, nombre al lado. Media fila. */
function Losa({ acceso }: { acceso: Acceso }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={acceso.nombre}
      onPress={acceso.onPress}
      className="h-14 flex-row items-center overflow-hidden rounded-lg bg-card active:opacity-80"
      style={{ width: '48.5%' }}
    >
      {acceso.tapa}
      <Text className="min-w-0 flex-1 px-3 text-foreground text-[13px] font-semibold" numberOfLines={2}>
        {acceso.nombre}
      </Text>
    </Pressable>
  )
}

/** De una escucha del historial a lo que dibuja la portada. */
function escuchaComoItem(e: EscuchaReciente): HomeItem {
  return {
    kind: 'song',
    id: e.videoId,
    title: e.title,
    subtitle: e.artist,
    artworkUrl: artworkSource(e.artworkPath, e.artworkUrl, 128) ?? '',
    artistId: e.artistId,
    year: null,
  }
}

/**
 * «Seguir escuchando»: lo último que sonó, sin repetir. Son las columnas de
 * canciones de la portada, alimentadas por tu historial y no por el de todos.
 */
function SeguirEscuchando({
  escuchas,
  onPlaySong,
  menuForSong,
  pendingId,
}: {
  escuchas: EscuchaReciente[] | null
  onPlaySong: (item: HomeItem) => void
  menuForSong: (item: HomeItem) => MenuItem[]
  pendingId: string | null
}) {
  if (!escuchas?.length) return null
  return (
    <View className="gap-3">
      <Text className="px-6 text-foreground text-[19px] font-bold">Seguir escuchando</Text>
      <FadingRow gap={16} padding={24}>
        <SongColumns
          items={escuchas.map(escuchaComoItem)}
          onPlay={onPlaySong}
          menuFor={menuForSong}
          pendingId={pendingId}
        />
      </FadingRow>
    </View>
  )
}

/** Lado de la cara de un artista en su fila. Más chico que una tapa: es un redondel. */
const ARTISTA_LADO = 140

/** Un artista en una fila: la cara redonda y el nombre debajo, centrado. */
function TarjetaArtista({
  nombre,
  tapa,
  onPress,
}: {
  nombre: string
  tapa: string | null
  onPress?: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={nombre}
      onPress={onPress}
      disabled={!onPress}
      className="items-center gap-2 active:opacity-80"
      style={{ width: ARTISTA_LADO }}
    >
      <View
        className="items-center justify-center overflow-hidden bg-card"
        style={{ width: ARTISTA_LADO, height: ARTISTA_LADO, borderRadius: ARTISTA_LADO / 2 }}
      >
        {tapa ? (
          <Image
            source={{ uri: proxiedImage(artworkUrlAtSize(tapa, 320)) }}
            style={{ width: ARTISTA_LADO, height: ARTISTA_LADO }}
          />
        ) : (
          <IconMusic size={26} color={ICON_COLOR.muted} />
        )}
      </View>
      <Text className="text-center text-foreground text-[13px] font-semibold" numberOfLines={2}>
        {nombre}
      </Text>
    </Pressable>
  )
}

/**
 * «Tus artistas»: los que más sonaron en tu historial reciente, por tiempo
 * real. La cara es la tapa de la canción suya que más escuchaste — es la que
 * le conocés, y no depende de que la foto del canal esté en caché.
 */
function TusArtistas({
  artistas,
  onOpenArtist,
}: {
  artistas: ArtistaReciente[] | null
  onOpenArtist?: (artistId: string, nombre: string) => void
}) {
  if (!artistas?.length) return null
  return (
    <View className="gap-3">
      <Text className="px-6 text-foreground text-[19px] font-bold">Tus artistas</Text>
      <FadingRow gap={16} padding={24}>
        {artistas.map((a) => (
          <TarjetaArtista
            key={a.artistId}
            nombre={a.nombre}
            tapa={artworkSource(a.artworkPath, a.artworkUrl, 320)}
            onPress={onOpenArtist ? () => onOpenArtist(a.artistId, a.nombre) : undefined}
          />
        ))}
      </FadingRow>
    </View>
  )
}

/**
 * «Porque escuchaste X»: los artistas parecidos a tu más escuchado.
 *
 * Es la segunda capa de la radio (ver `services/recomendaciones`) puesta como
 * fila: el ancla sale de tu historial y los parecidos los publica YouTube en
 * la ficha del artista como «Fans might also like». Ninguna inferencia propia,
 * ningún dato tuyo afuera. Si la ficha no trae parecidos, van sus discos.
 */
function PorqueEscuchaste({
  ancla,
  items,
  onOpenArtist,
  onOpenAlbum,
}: {
  ancla: ArtistaReciente | null
  /** Los parecidos, ya cargados con el resto del inicio. */
  items: HomeItem[]
  onOpenArtist?: (artistId: string, nombre: string) => void
  onOpenAlbum: (item: HomeItem) => void
}) {
  if (!ancla || !items.length) return null

  return (
    <View className="gap-3">
      <Text className="px-6 text-foreground text-[19px] font-bold" numberOfLines={1}>
        Porque escuchaste {ancla.nombre}
      </Text>
      <FadingRow gap={16} padding={24}>
        {items.map((item) =>
          item.kind === 'artist' ? (
            <TarjetaArtista
              key={item.id}
              nombre={item.title}
              tapa={item.artworkUrl || null}
              onPress={onOpenArtist ? () => onOpenArtist(item.id, item.title) : undefined}
            />
          ) : (
            <Card key={item.id} item={item} onPress={() => onOpenAlbum(item)} />
          ),
        )}
      </FadingRow>
    </View>
  )
}
