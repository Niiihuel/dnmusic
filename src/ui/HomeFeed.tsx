import { superficieInteractivaWeb, artworkInteractivoWeb } from './estadoControl'
import { BotonSuperficie } from './BotonSuperficie'
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
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
  anclasPersonales,
  mezclasPersonales,
  proximasRecomendadas,
  tandaDeMix,
  type ArtistaEscuchado,
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
import { PlaylistCover } from './PlaylistCover'
import { useColapso } from './useColapso'
import { MantenerApretado, Menu, type MenuItem } from './Menu'
import { Panel } from './Panel'
import { ScrollArea } from './ScrollArea'
import { BotonVolver } from './BotonVolver'
import { VacioError } from './Vacio'
import { EstadoTapa } from './CoverState'
import { Skeleton } from './Skeleton'
import {
  ICON_COLOR,
  IconChevronRight,
  IconHeart,
  IconMusic,
  IconPause,
  IconPlay,
  IconWave,
} from './icons'

/**
 * Desde qué ancho el inicio se dibuja con las medidas de la compu.
 *
 * Es el mismo corte que el resto del escritorio (`ESCRITORIO_PX` de Ajustes):
 * a partir de ahí las tapas crecen un poco, como en Música para Mac, donde
 * la fila tiene espacio de sobra y una tapa de teléfono queda chica.
 */
const ESCRITORIO_PX = 780
/** El hueco entre tapas de la grilla. Es el `gap-4` de su contenedor. */
const GRID_GAP = 16
/** Cuántas canciones apiladas por columna, como en Apple Music. */
const ROWS = 4
/** Qué secciones son un chart: llevan el puesto adelante, como Apple Music. */
const ES_CHART = /trending|tendencia|éxitos|exitos|\btop\b|charts?/i
/** Medida deseable de una tarjeta de género; la grilla la recalcula. */
const GENERO_W = 260
/** Proporción apaisada, como las tarjetas de género de Apple Music. */
const GENERO_RATIO = 0.58
/** Lado de la cara de un artista en su fila. Más chico que una tapa: es un redondel. */
const ARTISTA_LADO = 140
/** El id de origen con que la radio personal entra a la cola. */
const ORIGEN_RADIO = 'radio-personal'
/** Cuántas tarjetas grandes lleva «Sugerencias destacadas», como mucho. */
const MAX_DESTACADAS = 6

/**
 * Las medidas del inicio, por ancho de ventana.
 *
 * Son las de la portada de Apple Music: las tapas cuadradas de las filas
 * (dos enteras y el asomo de la tercera en un teléfono), y la tarjeta alta
 * de «Sugerencias destacadas», que es la única que no es cuadrada — una
 * vertical de tres por cuatro con el texto adentro. En la compu todo crece
 * un poco porque hay lugar; la proporción es la misma.
 */
function useMedidas() {
  const { width } = useWindowDimensions()
  const grande = width >= ESCRITORIO_PX
  const lado = grande ? 184 : 160
  const destacadaW = grande ? 280 : 250
  return { grande, lado, destacadaW, destacadaH: Math.round(destacadaW * 1.32) }
}

/**
 * El inicio: lo tuyo primero, la portada después.
 *
 * Es el «Inicio» de Apple Music en iOS 26, con la anatomía de allá y el
 * criterio de acá: arriba las **sugerencias destacadas**, tarjetas altas que
 * dicen *por qué* están —«Porque escuchaste X», «Porque elegiste rock»—,
 * después lo escuchado recientemente, lo hecho para vos, tus artistas y lo
 * que se desprende de ellos, y recién al final lo que YouTube Music publica
 * para todo el mundo, con las tendencias adelante. Cada fila se calla si no
 * tiene con qué: una cuenta nueva ve el título y la portada.
 *
 * Nada de acá es una tarjeta con borde: son estantes —título y una fila que
 * se desplaza—, que es como Apple arma las pantallas de contenido. Las
 * cajas agrupadas quedan para los formularios (Ajustes, Editar perfil).
 *
 * Toda la recomendación propia sale de `services/recomendaciones`: el
 * inicio no inventa criterios, los muestra y los explica.
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
  /** «Tus me gusta», desde lo escuchado recientemente. */
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
  const { grande } = useMedidas()

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

  /* La portada de YouTube, en dos: los charts primero —«Tendencias» es lo
     que uno espera ver arriba— y el resto en el orden en que ellos lo mandan. */
  const tendencias = inicio?.sections.filter((s) => ES_CHART.test(s.title)) ?? []
  const resto = inicio?.sections.filter((s) => !ES_CHART.test(s.title)) ?? []

  return (
    <Panel className="flex-1">
      <ScrollArea
        className="min-h-0 flex-1"
        contentContainerClassName="gap-8"
        contentContainerStyle={{ paddingTop: techo, paddingBottom: piso }}
        {...colapso}
      >
        {/* El título grande de la pantalla, como «Inicio» en Apple Music: en
            el teléfono a la medida del título de una pestaña, en la compu a
            la del título del panel. */}
        <Text
          className={`px-6 text-foreground font-bold tracking-[-0.4px] ${
            grande ? 'text-title1' : 'text-large-title'
          }`}
        >
          Inicio
        </Text>

        {inicio === null ? (
          <Loading />
        ) : (
          <>
            <Destacadas
              inicio={inicio}
              onOpenAlbum={onOpenAlbum}
              onOpenPlaylist={onOpenPlaylist}
              onOpenArtist={onOpenArtist}
            />
            <EscuchadoRecientemente
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
            <HechoParaVos radio={inicio.radio} mixes={inicio.mixes} anclas={inicio.anclas} />
            <Recomendadas
              radio={inicio.radio}
              anclas={inicio.anclas}
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
            {/* Lo tuyo: una fila de listas por cada género que elegiste. El
                título dice por qué está —«Rock para vos»— y «ver todo» abre
                la página del género, reconstruida desde la semilla. */}
            {inicio.misGeneros.map((section) => (
              <Section
                key={`mio-${section.title}`}
                section={section}
                titulo={`${section.title} para vos`}
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
            {tendencias.map((section, index) => (
              <Section
                key={`chart-${section.title}-${section.items[0]?.id ?? index}`}
                section={section}
                titulo={/^trending$/i.test(section.title) ? 'Tendencias' : section.title}
                onOpen={() => onOpenSection(section.title)}
                onOpenAlbum={onOpenAlbum}
                onOpenPlaylist={onOpenPlaylist}
                onPlaySong={onPlaySong}
                menuForSong={menuForSong}
                pendingId={pendingId}
              />
            ))}
            {/* La portada que no llegó solo grita si no hay nada más para
                mostrar; con filas propias arriba, se calla. Y mientras viene
                —se pasó del tope— un esqueleto abajo, no un error. */}
            {inicio.portadaPendiente ? (
              <Loading filas={1} sinDestacadas />
            ) : inicio.sections.length === 0 && !inicio.misGeneros.length && !hayLoTuyo(inicio) ? (
              <VacioError
                icono={<IconMusic size={22} color={ICON_COLOR.muted} />}
                titulo="La portada no llegó"
                detalle="No pude traer las novedades. Tus listas siguen donde siempre."
                onReintentar={recargar}
              />
            ) : null}
            {resto.map((section, i) => (
              <Fragment key={`section-${section.title}-${section.items[0]?.id ?? i}`}>
                <Section
                  section={section}
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
      </ScrollArea>
    </Panel>
  )
}

/* ── El estante ───────────────────────────────────────────────────────────── */

/**
 * El título de un estante, como en Apple Music: negrita, con el chevron que
 * anuncia que abre la sección entera, y debajo —solo cuando hace falta— una
 * línea apagada que dice **de dónde sale** lo que sigue.
 */
function Encabezado({
  titulo,
  detalle,
  onPress,
}: {
  titulo: string
  detalle?: string | null
  onPress?: () => void
}) {
  const texto = (
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="flex-row items-center gap-1.5">
        <Text className="shrink text-foreground text-title3 font-bold" numberOfLines={1}>
          {titulo}
        </Text>
        {onPress ? <IconChevronRight size={17} color={ICON_COLOR.muted} /> : null}
      </View>
      {detalle ? (
        <Text className="text-muted-foreground text-footnote" numberOfLines={1}>
          {detalle}
        </Text>
      ) : null}
    </View>
  )
  if (!onPress) return <View className="px-6">{texto}</View>
  return (
    <BotonSuperficie
      accessibilityRole="button"
      accessibilityLabel={`Ver todo: ${titulo}`}
      onPress={onPress}
      className="flex-row items-center self-start px-6 active:opacity-70"
    >
      {texto}
    </BotonSuperficie>
  )
}

function Section({
  section,
  titulo,
  onOpen,
  onOpenAlbum,
  onOpenPlaylist,
  onPlaySong,
  menuForSong,
  pendingId,
}: {
  section: HomeSection
  /** Con otro título que el de la sección: «Rock para vos» sobre «Rock». */
  titulo?: string
  onOpen: () => void
  onOpenAlbum: (item: HomeItem) => void
  onOpenPlaylist: (item: HomeItem) => void
  onPlaySong: (item: HomeItem) => void
  menuForSong: (item: HomeItem) => MenuItem[]
  pendingId: string | null
}) {
  const songs = section.items.every((item) => item.kind === 'song')
  const { lado } = useMedidas()

  return (
    <View className="gap-3">
      <Encabezado titulo={titulo ?? section.title} onPress={onOpen} />
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
              width={lado}
              onPress={() => (item.kind === 'album' ? onOpenAlbum(item) : onOpenPlaylist(item))}
            />
          ))
        )}
      </FadingRow>
    </View>
  )
}

/**
 * Tapa cuadrada con su título debajo: álbumes y listas.
 *
 * Es la unidad de casi todo el inicio. La tapa se separa del fondo por su
 * propia imagen y nada más: sin borde, sin caja, como en Apple Music.
 */
function Card({
  item,
  onPress,
  width,
}: {
  item: HomeItem
  onPress: () => void
  /** En la grilla lo decide la fila; en el carrusel es la medida de la fila. */
  width: number
}) {
  return (
    <TarjetaCuadrada
      lado={width}
      label={item.title}
      titulo={item.title}
      detalle={item.subtitle}
      onPress={onPress}
      tapa={
        item.artworkUrl ? (
          <Image
            source={{ uri: proxiedImage(artworkUrlAtSize(item.artworkUrl, 400)) }}
            style={{ width, height: width }}
          />
        ) : null
      }
    />
  )
}

/**
 * La tapa cuadrada genérica: lo que va adentro lo pone quien la usa —una
 * carátula, el collage de una lista, un corazón— y el texto debajo es
 * siempre igual: título en negrita, detalle apagado.
 */
function TarjetaCuadrada({
  lado,
  label,
  titulo,
  detalle,
  tapa,
  onPress,
}: {
  lado: number
  label: string
  titulo: string
  detalle?: string | null
  tapa: ReactNode
  onPress: () => void
}) {
  const [over, setOver] = useState(false)
  return (
    <BotonSuperficie
      {...superficieInteractivaWeb('card')}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
      style={{ width: lado }}
      className="gap-2"
    >
      <View {...artworkInteractivoWeb()}
        className="items-center justify-center overflow-hidden rounded-lg bg-card"
        style={{ width: lado, height: lado, opacity: Platform.OS === 'web' ? 1 : over ? 0.8 : 1 }}
      >
        {tapa ?? <IconMusic size={26} color={ICON_COLOR.muted} />}
      </View>
      <View className="gap-0.5">
        <Text className="text-foreground text-subheadline font-semibold" numberOfLines={2}>
          {titulo}
        </Text>
        {detalle ? (
          <Text className="text-muted-foreground text-footnote" numberOfLines={1}>
            {detalle}
          </Text>
        ) : null}
      </View>
    </BotonSuperficie>
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

  const fila = (
    <View {...superficieInteractivaWeb('row')}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
      className={`flex-row items-center gap-3 rounded-lg p-1.5 ${Platform.OS !== 'web' && over ? 'bg-muted' : ''}`}
    >
      <BotonSuperficie
        accessibilityRole="button"
        accessibilityLabel={isCurrent && wantPlay ? `Pausar ${item.title}` : `Reproducir ${item.title}`}
        /* Si ya es la que suena, tocarla pausa o sigue. Antes volvía a
           resolverla y arrancaba de cero, y no había forma de pausar desde
           acá: había que ir hasta la barra de abajo. */
        onPress={() => (isCurrent ? togglePlayback() : onPlay())}
        delayLongPress={500}
        accessibilityHint="Mantené apretado para ver las opciones"
        className="min-w-0 flex-1 flex-row items-center gap-3"
      >
        {/* El puesto, apagado y tabular: el número acompaña, la tapa manda. */}
        {puesto !== undefined ? (
          <Text className="w-6 text-center text-muted-foreground text-subheadline font-semibold tabular-nums">
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
          <Text className="text-foreground text-subheadline" numberOfLines={1}>
            {item.title}
          </Text>
          {item.subtitle ? (
            <Text className="text-muted-foreground text-footnote" numberOfLines={1}>
              {item.subtitle}
            </Text>
          ) : null}
        </View>
      </BotonSuperficie>

      {/* Los tres puntos siguen disponibles para abrir las mismas opciones con un toque. */}
      <View className="w-8 items-center">
        <Menu items={menu} label={`Opciones de ${item.title}`} size={14} />
      </View>
    </View>
  )
  return Platform.OS === 'ios' && menu.length
    ? <MantenerApretado items={menu} preview={{ title: item.title, subtitle: item.subtitle, artwork: item.artworkUrl ? proxiedImage(item.artworkUrl) : undefined }}>{fila}</MantenerApretado>
    : fila
}

/* ── Sugerencias destacadas ───────────────────────────────────────────────── */

/** Una tarjeta alta de la vidriera: qué es, por qué está y a dónde lleva. */
type Destacada = {
  id: string
  /** La razón, arriba del título: «Porque escuchaste X», «Hecho para vos». */
  motivo: string
  titulo: string
  /** Una línea más, debajo del título: qué vas a encontrar. */
  detalle: string
  tapa: string | null
  /** Esta tarjeta pone algo a sonar en vez de abrir una página. */
  suena?: boolean
  onPress: () => void
}

/**
 * «Sugerencias destacadas para vos»: la vidriera del inicio.
 *
 * Es la primera fila del Inicio de Apple Music: tarjetas altas con la imagen
 * a sangre y el texto encima —la razón en chico, el título en negrita, una
 * línea de detalle—. Acá cada tarjeta es una salida del motor propio, y la
 * razón es literal: tu radio (según tus artistas), tu mix más pesado, lo que
 * se desprende de tu artista más escuchado, la lista del género que
 * elegiste, y una novedad de la portada. Sin motor —cuenta nueva, sin
 * portada— la fila no aparece.
 */
function Destacadas({
  inicio,
  onOpenAlbum,
  onOpenPlaylist,
  onOpenArtist,
}: {
  inicio: Inicio
  onOpenAlbum: (item: HomeItem) => void
  onOpenPlaylist: (item: HomeItem) => void
  onOpenArtist?: (artistId: string, nombre: string) => void
}) {
  const { destacadaW, destacadaH } = useMedidas()
  const soundingTrack = usePlaybackTrack()
  const wantPlay = useWantPlay()
  const originId = usePlaybackOriginId()

  const abrir = (item: HomeItem) => {
    if (item.kind === 'artist') onOpenArtist?.(item.id, item.title)
    else if (item.kind === 'album') onOpenAlbum(item)
    else onOpenPlaylist(item)
  }

  const tarjetas: Destacada[] = []

  if (inicio.radio.length) {
    const sonando = originId === ORIGEN_RADIO && !!soundingTrack
    tarjetas.push({
      id: 'radio',
      motivo: 'Hecho para vos',
      titulo: 'Tu radio',
      detalle: segunAnclas(inicio.anclas),
      tapa: inicio.radio[0].artworkUrl ?? null,
      suena: true,
      onPress: () =>
        sonando ? togglePlayback() : playQueue(inicio.radio, 0, { id: ORIGEN_RADIO, name: 'Tu radio' }),
    })
  }

  const ancla = inicio.artistas[0]
  const pariente = inicio.porque[0]
  if (ancla && pariente) {
    tarjetas.push({
      id: `porque:${pariente.id}`,
      motivo: `Porque escuchaste ${ancla.nombre}`,
      titulo: pariente.title,
      detalle:
        pariente.kind === 'artist'
          ? 'Lo escucha la misma gente que a tu artista'
          : pariente.subtitle || 'Un disco suyo',
      tapa: pariente.artworkUrl || null,
      onPress: () => abrir(pariente),
    })
  }

  for (const mix of inicio.mixes.slice(0, 2)) {
    tarjetas.push({
      id: `mix:${mix.artist_id}`,
      motivo: 'Mix de artista',
      titulo: `Mix de ${mix.artist}`,
      detalle: 'Todo suyo y lo que escucha su gente',
      tapa: mix.artworkUrl || null,
      suena: true,
      onPress: () => tocarMix(mix, originId === `mix:${mix.artist_id}` && !!soundingTrack),
    })
  }

  const genero = inicio.misGeneros[0]
  const deGenero = genero?.items.find((i) => i.kind === 'playlist' || i.kind === 'album')
  if (genero && deGenero) {
    tarjetas.push({
      id: `genero:${deGenero.id}`,
      motivo: `Porque elegiste ${genero.title}`,
      titulo: deGenero.title,
      detalle: deGenero.subtitle || genero.title,
      tapa: deGenero.artworkUrl || null,
      onPress: () => abrir(deGenero),
    })
  }

  const novedad = inicio.sections.find((s) => !ES_CHART.test(s.title))
  const deNovedad = novedad?.items.find((i) => i.kind === 'playlist' || i.kind === 'album')
  if (novedad && deNovedad) {
    tarjetas.push({
      id: `novedad:${deNovedad.id}`,
      motivo: novedad.title,
      titulo: deNovedad.title,
      detalle: deNovedad.subtitle || 'Lo nuevo de la portada',
      tapa: deNovedad.artworkUrl || null,
      onPress: () => abrir(deNovedad),
    })
  }

  if (!tarjetas.length) return null

  return (
    <View className="gap-3">
      <Encabezado titulo="Sugerencias destacadas para vos" />
      <FadingRow gap={16} padding={24}>
        {tarjetas.slice(0, MAX_DESTACADAS).map((t) => (
          <TarjetaDestacada
            key={t.id}
            tarjeta={t}
            ancho={destacadaW}
            alto={destacadaH}
            sonando={
              t.id === 'radio'
                ? originId === ORIGEN_RADIO && !!soundingTrack && wantPlay
                : originId === t.id && !!soundingTrack && wantPlay
            }
          />
        ))}
      </FadingRow>
    </View>
  )
}

/**
 * La tarjeta alta: la imagen a sangre, un velo abajo y el texto encima.
 *
 * Es la tarjeta de «Sugerencias destacadas» de Apple Music traducida al
 * sistema de acá: sin color de marca, el color lo trae la tapa y el velo
 * garantiza que el texto se lea sobre cualquiera. Cuando la tarjeta pone algo
 * a sonar, lleva el redondel de reproducir abajo a la derecha, que es lo que
 * la distingue de una que abre una página.
 */
function TarjetaDestacada({
  tarjeta,
  ancho,
  alto,
  sonando,
}: {
  tarjeta: Destacada
  ancho: number
  alto: number
  /** Ya es la cola que suena: el redondel muestra pausa. */
  sonando: boolean
}) {
  const [over, setOver] = useState(false)
  return (
    <BotonSuperficie
      {...superficieInteractivaWeb('card')}
      accessibilityRole="button"
      accessibilityLabel={`${tarjeta.motivo}: ${tarjeta.titulo}`}
      onPress={tarjeta.onPress}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
      className="overflow-hidden rounded-2xl bg-card active:opacity-90"
      style={{ width: ancho, height: alto }}
    >
      {tarjeta.tapa ? (
        <Image {...artworkInteractivoWeb()}
          source={{ uri: proxiedImage(artworkUrlAtSize(tarjeta.tapa, 640)) }}
          resizeMode="cover"
          style={[StyleSheet.absoluteFill, { opacity: Platform.OS === 'web' ? 1 : over ? 0.85 : 1 }]}
        />
      ) : (
        <View className="flex-1 items-center justify-center">
          <IconMusic size={30} color={ICON_COLOR.muted} />
        </View>
      )}
      {/* El velo: tres paradas para que no se vea la línea, y más alto que en
          una tapa chica porque acá hay tres renglones que leer. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.86)']}
        locations={[0.4, 0.62, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View className="absolute inset-x-0 bottom-0 flex-row items-end gap-3 p-4">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text
            className="text-caption1 font-semibold"
            numberOfLines={1}
            style={{ color: 'rgba(255,255,255,0.72)' }}
          >
            {tarjeta.motivo}
          </Text>
          <Text
            className="text-title3 font-bold"
            numberOfLines={2}
            style={{ color: '#fff', textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6 }}
          >
            {tarjeta.titulo}
          </Text>
          <Text
            className="text-footnote leading-[17px]"
            numberOfLines={2}
            style={{ color: 'rgba(255,255,255,0.8)' }}
          >
            {tarjeta.detalle}
          </Text>
        </View>
        {tarjeta.suena ? <RedondelDePlay sonando={sonando} /> : null}
      </View>
    </BotonSuperficie>
  )
}

/** El redondel de reproducir sobre una tapa: blanco pleno, el único acento. */
function RedondelDePlay({ sonando, lado = 40 }: { sonando: boolean; lado?: number }) {
  return (
    <View
      className="items-center justify-center rounded-full bg-primary"
      style={{ width: lado, height: lado }}
    >
      {sonando ? (
        <IconPause size={Math.round(lado * 0.42)} color={ICON_COLOR.onPrimary} />
      ) : (
        <View style={{ paddingLeft: 2 }}>
          <IconPlay size={Math.round(lado * 0.42)} color={ICON_COLOR.onPrimary} />
        </View>
      )}
    </View>
  )
}

/* ── Escuchado recientemente ──────────────────────────────────────────────── */

/**
 * «Escuchado recientemente»: las colecciones que **usás**, como cuadrados.
 *
 * Son las de la fila de Apple Music, y la regla es la de siempre: no son las
 * listas que tenés sino las que sonaron últimamente, del historial. Entran tus
 * listas, tus mixes, la radio y tus me gusta, cada una con su tapa y su tipo
 * debajo. Antes era la grilla de losas de Spotify —tapa chica y nombre al
 * lado, en cajas—; Apple no encierra nada: la tapa cuadrada y el texto abajo.
 */
function EscuchadoRecientemente({
  origenes,
  listas,
  onOpenGustos,
}: {
  origenes: OrigenReciente[] | null
  listas: Playlist[] | null
  onOpenGustos?: () => void
}) {
  const { lado } = useMedidas()
  if (!origenes?.length) return null

  const tarjetas: ReactNode[] = []
  for (const o of origenes) {
    if (tarjetas.length >= 10) break
    if (o.id === 'gustos') {
      if (!onOpenGustos) continue
      tarjetas.push(
        <TarjetaCuadrada
          key={o.id}
          lado={lado}
          label="Tus me gusta"
          titulo="Tus me gusta"
          detalle="Lo que marcaste"
          onPress={onOpenGustos}
          tapa={<IconHeart size={Math.round(lado * 0.28)} color={ICON_COLOR.foreground} />}
        />,
      )
      continue
    }
    const lista = listas?.find((l) => l.id === o.id)
    if (lista) {
      tarjetas.push(
        <TarjetaCuadrada
          key={o.id}
          lado={lado}
          label={lista.name}
          titulo={lista.name}
          detalle="Lista"
          onPress={() => abrirLista(lista.id)}
          tapa={<PlaylistCover covers={lista.covers} coverPath={lista.coverPath} size={lado} />}
        />,
      )
      continue
    }
    const tapaUri = artworkSource(o.artworkPath, o.artworkUrl, 400)
    const tapa = tapaUri ? (
      <Image source={{ uri: tapaUri }} style={{ width: lado, height: lado }} />
    ) : (
      <IconWave size={Math.round(lado * 0.24)} color={ICON_COLOR.muted} />
    )
    if (o.id.startsWith('mix:')) {
      const artistId = o.id.slice(4)
      const artista = o.nombre.replace(/^Mix de /, '')
      tarjetas.push(
        <TarjetaCuadrada
          key={o.id}
          lado={lado}
          label={o.nombre || 'Mix'}
          titulo={o.nombre || 'Mix'}
          detalle="Mix"
          tapa={tapa}
          onPress={() => tocarMix({ artist_id: artistId, artist: artista, artworkUrl: tapaUri ?? '' }, false)}
        />,
      )
    } else if (o.id === ORIGEN_RADIO) {
      tarjetas.push(
        <TarjetaCuadrada
          key={o.id}
          lado={lado}
          label="Tu radio"
          titulo="Tu radio"
          detalle="Radio"
          tapa={tapa}
          onPress={() => {
            void proximasRecomendadas().then(
              (tanda) => tanda.length && playQueue(tanda, 0, { id: ORIGEN_RADIO, name: 'Tu radio' }),
            )
          }}
        />,
      )
    }
    /* Otros orígenes —una lista que ya borraste, algo de otra versión— no
       tienen a dónde llevar y no se ofrecen. */
  }
  if (!tarjetas.length) return null

  return (
    <View className="gap-3">
      <Encabezado titulo="Escuchado recientemente" />
      <FadingRow gap={16} padding={24}>
        {tarjetas}
      </FadingRow>
    </View>
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
      <Encabezado titulo="Seguir escuchando" />
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

/* ── Hecho para vos ───────────────────────────────────────────────────────── */

/** Pone a sonar el mix de un artista; si ya suena, pausa o sigue. */
function tocarMix(mix: MixPersonal, yaSuena: boolean) {
  if (yaSuena) {
    togglePlayback()
    return
  }
  void tandaDeMix({ artist_id: mix.artist_id, artist: mix.artist, ms: 1 }).then((tanda) => {
    if (tanda.length) playQueue(tanda, 0, { id: `mix:${mix.artist_id}`, name: `Mix de ${mix.artist}` })
  })
}

/** «A, B y C» — los nombres de tus primeras anclas, para decir de dónde sale algo. */
function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/** La razón de la radio y la tanda: los tres artistas que más pesan en vos. */
function segunAnclas(anclas: ArtistaEscuchado[]): string {
  const nombres = anclas.slice(0, 3).map((a) => a.artist)
  return nombres.length ? `Según ${enumerar(nombres)}` : 'Según tus me gusta y tus listas'
}

/**
 * «Hecho para vos»: tu radio y tus mixes, como los mixes de Apple Music.
 *
 * Tapas cuadradas con el nombre **adentro**, abajo a la izquierda sobre el
 * velo, y el redondel de reproducir: se distinguen de un disco en que tocarlas
 * no abre nada, pone la cola a sonar. Debajo, en apagado, de dónde sale cada
 * una. Los mixes son los artistas que más pesan en tu biblioteca
 * (`mezclasPersonales`); la radio, el motor entero.
 */
function HechoParaVos({
  radio,
  mixes,
  anclas,
}: {
  radio: PlaylistTrack[]
  mixes: MixPersonal[]
  anclas: ArtistaEscuchado[]
}) {
  const soundingTrack = usePlaybackTrack()
  const wantPlay = useWantPlay()
  const originId = usePlaybackOriginId()
  const { lado } = useMedidas()

  if (!radio.length && !mixes.length) return null

  const sonandoRadio = originId === ORIGEN_RADIO && !!soundingTrack

  return (
    <View className="gap-3">
      <Encabezado titulo="Hecho para vos" />
      <FadingRow gap={16} padding={24}>
        {radio.length ? (
          <TarjetaConNombre
            lado={lado}
            tapa={radio[0].artworkUrl ?? ''}
            nombre="Tu radio"
            detalle={segunAnclas(anclas)}
            sonando={sonandoRadio && wantPlay}
            onPress={() =>
              sonandoRadio ? togglePlayback() : playQueue(radio, 0, { id: ORIGEN_RADIO, name: 'Tu radio' })
            }
          />
        ) : null}
        {mixes.map((mix) => {
          const suena = originId === `mix:${mix.artist_id}` && !!soundingTrack
          return (
            <TarjetaConNombre
              key={mix.artist_id}
              lado={lado}
              tapa={mix.artworkUrl}
              nombre={`Mix de ${mix.artist}`}
              detalle="Por tus me gusta y tus listas"
              sonando={suena && wantPlay}
              onPress={() => tocarMix(mix, suena)}
            />
          )
        })}
      </FadingRow>
    </View>
  )
}

/**
 * Una tapa con el nombre adentro: la radio y los mixes.
 *
 * El color lo trae la imagen y el velo oscuro garantiza la lectura, igual que
 * en las tarjetas de género; el redondel dice sin palabras que acá se toca
 * para escuchar, no para abrir nada.
 */
function TarjetaConNombre({
  lado,
  tapa,
  nombre,
  detalle,
  sonando,
  onPress,
}: {
  lado: number
  tapa: string
  nombre: string
  detalle: string
  /** Esta cola es la que está sonando ahora mismo, y no en pausa. */
  sonando: boolean
  onPress: () => void
}) {
  const [over, setOver] = useState(false)
  return (
    <BotonSuperficie
      {...superficieInteractivaWeb('card')}
      accessibilityRole="button"
      accessibilityLabel={sonando ? `Pausar ${nombre}` : `Reproducir ${nombre}`}
      onPress={onPress}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
      className="gap-2 active:opacity-80"
      style={{ width: lado }}
    >
      <View {...artworkInteractivoWeb()}
        className="items-center justify-center overflow-hidden rounded-lg bg-card"
        style={{ width: lado, height: lado }}
      >
        {tapa ? (
          <Image
            source={{ uri: proxiedImage(artworkUrlAtSize(tapa, 400)) }}
            style={{ width: lado, height: lado, opacity: Platform.OS === 'web' ? 1 : over ? 0.85 : 1 }}
          />
        ) : (
          <IconMusic size={26} color={ICON_COLOR.muted} />
        )}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.8)']}
          locations={[0.35, 0.62, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View className="absolute inset-x-0 bottom-0 flex-row items-end gap-2 p-3">
          <Text
            numberOfLines={2}
            className="min-w-0 flex-1 text-callout font-bold leading-[19px]"
            style={{ color: '#fff', textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 6 }}
          >
            {nombre}
          </Text>
          <RedondelDePlay sonando={sonando} lado={34} />
        </View>
      </View>
      <Text className="text-muted-foreground text-footnote" numberOfLines={1}>
        {detalle}
      </Text>
    </BotonSuperficie>
  )
}

/**
 * «Recomendadas para vos»: la tanda concreta del motor, canción por canción.
 *
 * Es la misma cola que arranca «Tu radio», mostrada como las columnas de
 * canciones de Apple Music para que se pueda ir de a una. El renglón debajo
 * del título dice de dónde sale: tus tres anclas más pesadas y lo que
 * escucha la gente que las escucha, que es exactamente cómo se armó.
 */
function Recomendadas({
  radio,
  anclas,
  onPlaySong,
  menuForSong,
  pendingId,
}: {
  radio: PlaylistTrack[]
  anclas: ArtistaEscuchado[]
  onPlaySong: (item: HomeItem) => void
  menuForSong: (item: HomeItem) => MenuItem[]
  pendingId: string | null
}) {
  if (!radio.length) return null
  const items: HomeItem[] = radio.map((t) => ({
    kind: 'song' as const,
    id: t.videoId,
    title: t.title,
    subtitle: t.artist,
    artworkUrl: t.artworkUrl ?? '',
    artistId: t.artistId,
    year: null,
  }))
  const nombres = anclas.slice(0, 3).map((a) => a.artist)
  return (
    <View className="gap-3">
      <Encabezado
        titulo="Recomendadas para vos"
        detalle={
          nombres.length
            ? `Según ${enumerar(nombres)}, y lo que escucha su gente`
            : 'Según tus me gusta y tus listas'
        }
      />
      <FadingRow gap={16} padding={24}>
        <SongColumns items={items} onPlay={onPlaySong} menuFor={menuForSong} pendingId={pendingId} />
      </FadingRow>
    </View>
  )
}

/* ── Artistas ─────────────────────────────────────────────────────────────── */

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
    <MantenerApretado items={onPress ? [{ label: 'Ir al artista', sfSymbol: 'music.microphone', onPress }] : []}
      preview={{ title: nombre, subtitle: 'Artista', artwork: tapa ? proxiedImage(tapa) : undefined }} onPreviewPress={onPress}>
    <BotonSuperficie
      {...superficieInteractivaWeb('card')}
      accessibilityRole="button"
      accessibilityLabel={nombre}
      onPress={onPress}
      disabled={!onPress}
      className="items-center gap-2 active:opacity-80"
      style={{ width: ARTISTA_LADO }}
    >
      <View {...artworkInteractivoWeb()}
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
      <Text className="text-center text-foreground text-subheadline font-semibold" numberOfLines={2}>
        {nombre}
      </Text>
    </BotonSuperficie>
    </MantenerApretado>
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
      <Encabezado titulo="Tus artistas" detalle="Los que más escuchaste últimamente" />
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
  const { lado } = useMedidas()
  if (!ancla || !items.length) return null

  return (
    <View className="gap-3">
      <Encabezado
        titulo={`Porque escuchaste ${ancla.nombre}`}
        detalle="Lo que escucha la misma gente"
      />
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
            <Card key={item.id} item={item} width={lado} onPress={() => onOpenAlbum(item)} />
          ),
        )}
      </FadingRow>
    </View>
  )
}

/* ── Géneros ──────────────────────────────────────────────────────────────── */

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
    <BotonSuperficie
      {...superficieInteractivaWeb('card')}
      accessibilityRole="button"
      accessibilityLabel={genero.name}
      onPress={onPress}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
      style={{ width }}
      className="active:opacity-80"
    >
      <View {...artworkInteractivoWeb()} className="overflow-hidden rounded-lg bg-card" style={{ width, height: alto }}>
        {genero.artworkUrl ? (
          <Image
            source={{ uri: proxiedImage(artworkUrlAtSize(genero.artworkUrl, 400)) }}
            resizeMode="cover"
            style={{ width, height: alto, opacity: Platform.OS === 'web' ? 1 : over ? 0.75 : 1 }}
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
          className="absolute bottom-2.5 left-3 right-3 text-foreground text-subheadline font-bold"
          style={{ textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 6 }}
        >
          {genero.name}
        </Text>
      </View>
    </BotonSuperficie>
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
      <Encabezado titulo="Géneros y momentos" onPress={onVerTodo} />
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
    <ScrollArea
      className="min-h-0 flex-1"
      contentContainerClassName="px-6"
      contentContainerStyle={{ paddingTop: techo, paddingBottom: piso }}
      {...colapso}
    >
      <CabeceraDePagina titulo="Géneros y momentos" onBack={onBack} />

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
    </ScrollArea>
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
  const { lado } = useMedidas()

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
     * las tapas.
     */
    return (
      <ScrollArea
        className="min-h-0 flex-1"
        contentContainerClassName="px-6"
        contentContainerStyle={{ paddingTop: techo, paddingBottom: piso }}
      >
        <CabeceraDePagina titulo={genero.name} onBack={onBack} />
        <View className="flex-row flex-wrap gap-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <View key={i} className="gap-2">
              <Skeleton width={lado} height={lado} radius={8} />
              <Skeleton width={lado * 0.7} height={13} />
            </View>
          ))}
        </View>
      </ScrollArea>
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

/** La cabecera de una página apilada del inicio: la flecha y el título. */
function CabeceraDePagina({
  titulo,
  detalle,
  onBack,
}: {
  titulo: string
  detalle?: string
  onBack: () => void
}) {
  return (
    <View className="flex-row items-center gap-3 pb-4">
      <BotonVolver label="Volver a la portada" onPress={onBack} />
      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-title2 font-bold" numberOfLines={1}>
          {titulo}
        </Text>
        {detalle ? <Text className="text-muted-foreground text-caption1">{detalle}</Text> : null}
      </View>
    </View>
  )
}

/** Si el inicio tiene algo propio que mostrar: con eso, la portada que falta no es un error. */
function hayLoTuyo(i: Inicio): boolean {
  return (
    i.escuchas.length > 0 ||
    i.origenes.length > 0 ||
    i.artistas.length > 0 ||
    i.radio.length > 0 ||
    i.mixes.length > 0
  )
}

function Loading({ filas = 2, sinDestacadas = false }: { filas?: number; sinDestacadas?: boolean }) {
  const { lado, destacadaW, destacadaH } = useMedidas()
  return (
    <View className="gap-8">
      {/* Calca la fila de arriba: las tarjetas altas de la vidriera. */}
      {sinDestacadas ? null : (
        <View className="gap-3">
          <View className="px-6">
            <Skeleton width={260} height={20} />
          </View>
          <View className="flex-row gap-4 px-6">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width={destacadaW} height={destacadaH} radius={16} />
            ))}
          </View>
        </View>
      )}
      {Array.from({ length: filas }, (_, row) => row).map((row) => (
        <View key={row} className="gap-3">
          <View className="px-6">
            <Skeleton width={200} height={20} />
          </View>
          <View className="flex-row gap-4 px-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i} className="gap-2">
                <Skeleton width={lado} height={lado} radius={8} />
                <Skeleton width={lado * 0.8} height={13} />
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
  const { lado: deseable } = useMedidas()

  /*
   * Cuántas tapas por fila, y cuánto mide cada una.
   *
   * El lado de la fila es el tamaño *deseable* de una tapa. Con eso se
   * calcula cuántas entran —nunca menos de dos, o en un teléfono angosto
   * quedaría una sola gigante por fila— y recién ahí se reparte el ancho
   * sobrante entre ellas, descontando los huecos.
   */
  const [ancho, setAncho] = useState(0)
  const columnas = Math.max(2, Math.floor((ancho + GRID_GAP) / (deseable + GRID_GAP)))
  const lado = ancho > 0 ? (ancho - GRID_GAP * (columnas - 1)) / columnas : deseable

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
    <ScrollArea
      className="min-h-0 flex-1"
      contentContainerClassName="px-6"
      contentContainerStyle={{ paddingTop: techo, paddingBottom: piso }}
      {...colapso}
    >
      <CabeceraDePagina
        titulo={section.title}
        detalle={`${section.items.length} ${section.items.length === 1 ? 'cosa' : 'cosas'}`}
        onBack={onBack}
      />

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
           * Grilla que **llena la fila**: el ancho de la tapa no es un número
           * puesto a mano, es lo que queda de dividir la fila entre las que
           * entran. Se mide el contenedor en vez de la ventana porque en
           * escritorio esto vive adentro de un panel que no la ocupa entera.
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
    </ScrollArea>
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
  /** Tus anclas, de más a menos peso: con ellas el inicio dice «según X, Y y Z». */
  anclas: ArtistaEscuchado[]
  /** Lo que se desprende de tu artista más escuchado. */
  porque: HomeItem[]
  /**
   * La portada de YouTube todavía viene: se pasó del tope y se dibuja el
   * resto sin ella. Cuando llegue se suma abajo, que es donde va y donde
   * sumarla no mueve nada de lo que ya se está mirando.
   */
  portadaPendiente: boolean
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
 * Son diez pedidos —la portada, los géneros, las semillas y sus filas, tu
 * historial en tres vistas, tus listas, la radio, los mixes, tus anclas y
 * los parecidos de tu artista más escuchado— que salen en paralelo y se
 * entregan de una sola vez. `null` mientras no está todo; después, la
 * portada entera. Lo que falló o tardó de más llega vacío y su fila no se
 * dibuja: el historial es un lujo, la portada un adorno, y ninguno de los
 * dos puede dejar la pantalla en blanco.
 */
function useInicio(): { inicio: Inicio | null; recargar: () => void } {
  const [inicio, setInicio] = useState<Inicio | null>(null)
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    let vivo = true
    void (async () => {
      /*
       * La portada se pide con los demás pero se espera aparte: es lo que más
       * tarda —el servicio en frío puede pasar los doce segundos— y lo único
       * que puede llegar después sin que se note, porque va al final. Si se
       * pasa del tope, el inicio sale sin ella y ella se suma cuando llega.
       */
      let portadaLlego = false
      const portada = fetchHome()
        .catch(() => [] as HomeSection[])
        .then((secs) => {
          portadaLlego = true
          return secs
        })
      const [sections, generos, semillas, escuchas, origenes, artistas, listas, radio, mixes, anclas] =
        await Promise.all([
          oVacio(portada, []),
          oVacio(fetchGeneros(), []),
          oVacio(listarSemillas(), []),
          oVacio(ultimasEscuchas(12), []),
          oVacio(origenesRecientes(8), []),
          oVacio(artistasRecientes(8), []),
          oVacio(listPlaylists(), []),
          oVacio(proximasRecomendadas(), []),
          oVacio(mezclasPersonales(6), []),
          oVacio(anclasPersonales(), []),
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
        mixes: conTapa(mixes, artistas, escuchas, radio),
        anclas,
        porque,
        portadaPendiente: !portadaLlego,
      })
      if (!portadaLlego) {
        void portada.then((secs) => {
          if (vivo) setInicio((prev) => (prev ? { ...prev, sections: secs, portadaPendiente: false } : prev))
        })
      }
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
 * corazones y tus listas; si esas filas no la guardaron —son viejas, o el
 * artista entró solo por tiempo escuchado— no hay ninguna. El historial sí
 * la tiene —guarda la tapa de cada escucha—, y si tampoco, la tanda de la
 * radio: viene del catálogo con carátula fresca y casi siempre trae una
 * canción del mismo artista. Un mix sin tapa era el cuadrado gris que se
 * veía antes.
 */
function conTapa(
  mixes: MixPersonal[],
  artistas: ArtistaReciente[],
  escuchas: EscuchaReciente[],
  radio: PlaylistTrack[],
): MixPersonal[] {
  return mixes.map((m) => {
    if (m.artworkUrl) return m
    const del =
      artistas.find((a) => a.artistId === m.artist_id) ??
      escuchas.find((e) => e.artistId === m.artist_id)
    const tapa =
      (del ? artworkSource(del.artworkPath, del.artworkUrl, 400) : null) ??
      radio.find((t) => t.artistId === m.artist_id && t.artworkUrl)?.artworkUrl ??
      null
    return tapa ? { ...m, artworkUrl: tapa } : m
  })
}
