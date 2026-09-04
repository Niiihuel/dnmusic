import { useEffect, useState, type ReactNode } from 'react'
import { Image, Pressable, Text, View, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Circle, Defs, Line, RadialGradient, Rect, Stop } from 'react-native-svg'
import { runOnJS, type SharedValue } from 'react-native-reanimated'
import { artworkSource } from '../lib/artwork'
import { useColorPortada } from '../lib/colorPortada'
import { coloresDe, temaEfectivo, type ColoresVitrina, type Degradado, type Tema } from '../lib/tema'
import type { SongSnippet } from '../models/message'
import {
  ilustracionUrl,
  listMiniaturas,
  tapaDe,
  type Miniaturas,
  type Showcase,
  type ShowcaseAlbum,
  type ShowcaseArtista,
  type ShowcaseEstilo,
  type ShowcaseImagen,
  type ShowcaseLetra,
} from '../services/showcases'
import type { Playlist } from '../services/playlists'
import type { ReaccionesVitrina } from '../services/reacciones'
import { Onda, ONDA_PENDIENTE, usePicos } from './Onda'
import { estiloEncuadrado } from './Encuadre'
import { Glass, HAY_VIDRIO } from './Glass'
import { PlaylistCover } from './PlaylistCover'
import { formatClock } from './SeekBar'
import {
  ICON_COLOR,
  IconLock,
  IconLyrics,
  IconMinus,
  IconMusic,
  IconPause,
  IconGrilla,
  IconPencil,
  IconPlay,
} from './icons'

/**
 * Una vitrina del perfil.
 *
 * Es la unidad de la que está hecho un perfil, tomada de Steam: bloques
 * autocontenidos que quien lo arma elige y ordena. Todos comparten la misma
 * superficie —vidrio en iOS, gris sólido en el resto— para que la grilla se lea
 * como una sola cosa y no como cuatro componentes distintos apilados.
 *
 * Salvo que la persona la haya vestido: con un **tema** la superficie es de
 * ese color y el texto se acomoda para leerse encima; con una **imagen de
 * fondo** la foto va detrás con un velo. Es la parte de Airbuds que hace que
 * dos perfiles no se vean iguales (ver `lib/tema`). Lo que cambia entre tipos
 * es qué hay adentro, nunca el marco.
 */
/** Hacia dónde se arrastró la manija de tamaño. */
export type Redimension = 'ancho' | 'angosto' | 'alto' | 'bajo'

/** Cuánto hay que arrastrar la manija para que cuente como cambio de tamaño. */
const UMBRAL_REDIMENSION = 22

export function Vitrina({
  showcase,
  temaGlobal = null,
  estilo,
  playlists,
  esMio,
  playing,
  sonando,
  posicionMs,
  transcurridoMs,
  onTogglePlay,
  onSeek,
  onOpenPlaylist,
  editando = false,
  onRemove,
  onEditar,
  onRedimensionar,
  onAncho,
  onAbrirSubspace,
  reacciones,
  recarga = 0,
}: {
  showcase: Showcase
  /** El tema del perfil, que esta vitrina hereda si no tiene el suyo. */
  temaGlobal?: Tema | null
  /**
   * Lo que le dejaron a esta pieza, agrupado por emoji, y cuál es la de quien
   * mira. Se dibuja como chips sobre el borde de abajo; sin ninguna, nada.
   * Las pide `Vitrinas` para el mosaico entero y las reparte.
   */
  reacciones?: ReaccionesVitrina | null
  /**
   * Un estilo que pisa al de la vitrina. Lo usa la vista previa del editor,
   * que dibuja la vitrina con el tema a medio elegir sin tocar la de verdad.
   */
  estilo?: ShowcaseEstilo
  /** Para resolver la vitrina de lista, que guarda solo el id. */
  playlists: Playlist[] | null
  /**
   * El perfil es de quien está mirando.
   *
   * Solo lo usa la vitrina de lista, y para decidir qué decir cuando el id no
   * aparece: en el tuyo es que la borraste, en el de otro es que no es pública.
   */
  esMio: boolean
  /** Esta vitrina es la que está sonando. */
  playing: boolean
  /**
   * Esta vitrina es la cargada en el reproductor, suene o esté en pausa.
   *
   * Distinto de `playing`: al pausar, la onda tiene que seguir mostrando dónde
   * quedó. Si se vaciara, no habría forma de saberlo.
   */
  sonando?: boolean
  /** Posición del reproductor de fragmentos. Ver `Onda`. */
  posicionMs?: SharedValue<number>
  /**
   * La misma posición como número, para el reloj.
   *
   * El reloj muestra segundos, así que no necesita el valor por cuadro: le
   * alcanza con el del estado, que refresca varias veces por segundo.
   */
  transcurridoMs?: number
  onTogglePlay: (id: string, song: SongSnippet) => void
  /** Mover la reproducción arrastrando la onda. Sin esto, la onda no se toca. */
  onSeek?: (id: string, song: SongSnippet, fraccion: number) => void
  onOpenPlaylist: (playlistId: string) => void
  /**
   * El modo de edición: los controles en las esquinas y el contenido quieto.
   *
   * Es el modo de «reordenar» de la pantalla de inicio del iPhone: la tarjeta
   * deja de reaccionar a sus toques —no se reproduce nada— y pasa a ser una
   * pieza que se agarra, se saca, se edita y se estira.
   */
  editando?: boolean
  /** Sacarla. Va en el «−» de arriba a la izquierda. */
  onRemove?: (id: string) => void
  /** Abrir su editor. Va en el lápiz de arriba a la derecha. */
  onEditar?: (showcase: Showcase) => void
  /** Se arrastró la manija de abajo a la derecha hacia algún lado. */
  onRedimensionar?: (direccion: Redimension) => void
  /** Tocar la manija sin arrastrar: pasar al tamaño siguiente. */
  onAncho?: () => void
  /**
   * Tocar un sub-space, mirando: abrir su mosaico a pantalla completa.
   *
   * Es de la tarjeta entera y no de un botón: la pieza es una puerta. Sin
   * esto —la vista previa del editor— la tarjeta no hace nada al tocarla.
   */
  onAbrirSubspace?: (showcase: Showcase) => void
  /**
   * Sube cuando el mosaico se relee. Solo lo mira el sub-space, que pide lo
   * que tiene adentro por su cuenta: la tarjeta queda montada entre una
   * lectura y otra —misma pieza, misma clave— y sin esto la vista previa
   * seguía mostrando la cuenta vieja después de armar adentro y volver.
   */
  recarga?: number
}) {
  const vestido = estilo ?? showcase.estilo
  const tema = temaEfectivo(vestido.tema, temaGlobal)

  /*
   * El color de la tapa se lee solo si el tema lo pide: leerlo cuesta un
   * canvas en web y un módulo nativo en iOS, y la mayoría de las vitrinas no
   * lo va a usar. Con `null` el hook no hace nada.
   */
  const tapa = tema?.id === 'tapa' ? tapaDe(showcase) : null
  const colorTapa = useColorPortada(tapa)
  const c = coloresDe(tema, colorTapa)

  /*
   * Con una imagen detrás, el texto va **siempre en blanco** sobre un velo
   * oscuro: la foto puede ser cualquiera y el tema de color no tiene forma de
   * saber si abajo hay un cielo claro o una noche. El velo y el blanco se leen
   * sobre las dos.
   */
  const fondoImagen = vestido.fondo
  const colores: ColoresVitrina = fondoImagen
    ? { fondo: c.fondo ?? 'rgb(24,24,24)', texto: '#FFFFFF', secundario: 'rgba(255,255,255,0.75)', claro: false }
    : c

  const grande = showcase.ancho === 'grande'

  /* Un espacio no es una tarjeta: es aire. En edición se dibuja apenas, para
     poder agarrarlo. */
  if (showcase.kind === 'espaciador') {
    return (
      <View style={{ position: 'relative' }}>
        <View
          className={editando ? 'items-center justify-center rounded-2xl' : ''}
          style={{
            height: grande ? 96 : 40,
            backgroundColor: editando ? 'rgba(255,255,255,0.06)' : 'transparent',
          }}
        >
          {editando ? (
            <Text className="text-muted-foreground text-[10px] font-semibold uppercase tracking-[1.2px]">
              Espacio
            </Text>
          ) : null}
        </View>
        {editando ? (
          <Controles
            onRemove={onRemove ? () => onRemove(showcase.id) : undefined}
            onEditar={undefined}
            onRedimensionar={onRedimensionar}
            onAncho={onAncho}
          />
        ) : null}
      </View>
    )
  }

  const esEncabezado = showcase.kind === 'encabezado'

  return (
    <View style={{ position: 'relative' }}>
      <Superficie
        colores={colores}
        fondo={fondoImagen}
        radius={esEncabezado ? 999 : 16}
      >
        {/*
         * El relleno según el tipo.
         *
         * Una **imagen es la tarjeta**: fuera de edición va a sangre, sin borde
         * de relleno — es lo que hace de una foto una pieza y no una foto dentro
         * de una caja. El resto lleva un respiro parejo, corto: la tarjeta
         * minimalista es la que muestra contenido, no marco.
         *
         * En edición el contenido no se toca: los controles flotan en las
         * esquinas y la tarjeta entera es lo que se agarra.
         */}
        <View
          pointerEvents={editando ? 'none' : 'auto'}
          className={showcase.kind === 'imagen' ? 'p-0' : esEncabezado ? 'px-5 py-3.5' : 'p-3'}
        >
          {showcase.kind === 'texto' ? (
            <Text
              className={grande ? 'text-[19px] leading-7' : 'text-[15px] leading-6'}
              style={{ color: colores.texto }}
            >
              {showcase.texto}
            </Text>
          ) : esEncabezado ? (
            <Text
              className="text-center text-[15px] font-bold"
              numberOfLines={1}
              style={{ color: colores.texto }}
            >
              {showcase.titulo}
            </Text>
          ) : showcase.kind === 'lista' ? (
            <VitrinaLista
              playlistId={showcase.playlistId}
              playlists={playlists}
              esMio={esMio}
              c={colores}
              onOpen={onOpenPlaylist}
            />
          ) : showcase.kind === 'imagen' ? (
            <VitrinaImagen imagen={showcase.imagen} grande={grande} />
          ) : showcase.kind === 'artista' ? (
            <VitrinaArtista artista={showcase.artista} c={colores} mitad={showcase.ancho === 'mitad'} />
          ) : showcase.kind === 'album' ? (
            <VitrinaAlbum album={showcase.album} c={colores} mitad={showcase.ancho === 'mitad'} />
          ) : showcase.kind === 'letra' ? (
            <VitrinaLetra letra={showcase.letra} c={colores} grande={grande} />
          ) : showcase.kind === 'subspace' ? (
            <VitrinaSubspace
              showcase={showcase}
              c={colores}
              recarga={recarga}
              onAbrir={onAbrirSubspace ? () => onAbrirSubspace(showcase) : undefined}
            />
          ) : (
            <VitrinaCancion
              showcase={showcase}
              c={colores}
              playing={playing}
              sonando={sonando ?? playing}
              posicionMs={posicionMs}
              transcurridoMs={transcurridoMs}
              onTogglePlay={onTogglePlay}
              onSeek={onSeek}
            />
          )}
        </View>
      </Superficie>

      {editando ? (
        <Controles
          onRemove={onRemove ? () => onRemove(showcase.id) : undefined}
          onEditar={onEditar ? () => onEditar(showcase) : undefined}
          onRedimensionar={onRedimensionar}
          onAncho={onAncho}
        />
      ) : reacciones ? (
        <ChipsDeReacciones reacciones={reacciones} c={colores} />
      ) : null}
    </View>
  )
}

/**
 * Lo que le dejaron a la pieza: «🔥 3 💜 1», apoyado sobre el borde de abajo.
 *
 * Es la burbuja de reacciones de Instagram: cuelga de la esquina inferior
 * izquierda, medio adentro y medio afuera de la tarjeta, así no le roba lugar
 * al contenido ni se confunde con él. Desborda 9px, menos que el hueco de la
 * grilla (12px), para no pisar la fila de abajo.
 *
 * Toma los colores del tema de la pieza y no los de la interfaz: la pieza es
 * contenido de su dueño, y un chip gris de la app sobre una tarjeta rosa se
 * vería pegado. El chip va del lado claro u oscuro de la tarjeta; **el tuyo se
 * invierte** —blanco sobre oscura, negro sobre clara— que es la marca de
 * «activo» de `docs/DESIGN.md`: el contraste, nunca un color.
 *
 * No se toca: el gesto de reaccionar es mantener apretada la pieza entera, y
 * un chip que atrapara el toque se lo robaría a la celda.
 */
function ChipsDeReacciones({ reacciones, c }: { reacciones: ReaccionesVitrina; c: ColoresVitrina }) {
  /* Las más dejadas primero; a igual cuenta, el orden en que se ofrecen. */
  const filas = Object.entries(reacciones.conteo)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
  if (!filas.length) return null

  const lectura = filas.map(([emoji, n]) => `${emoji} ${n}`).join(', ')

  return (
    <View
      pointerEvents="none"
      accessibilityLabel={`Reacciones: ${lectura}`}
      style={{ position: 'absolute', left: 10, bottom: -9, flexDirection: 'row', gap: 4, zIndex: 20 }}
    >
      {filas.map(([emoji, n]) => {
        const mia = reacciones.mia === emoji
        const fondo = mia
          ? c.claro
            ? '#121212'
            : '#FFFFFF'
          : c.claro
            ? 'rgba(255,255,255,0.92)'
            : 'rgba(34,34,34,0.92)'
        const texto = mia ? (c.claro ? '#FFFFFF' : '#121212') : c.texto
        return (
          <View
            key={emoji}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
              height: 22,
              paddingHorizontal: 7,
              borderRadius: 999,
              backgroundColor: fondo,
              boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
            }}
          >
            <Text style={{ fontSize: 12, lineHeight: 16 }}>{emoji}</Text>
            <Text
              style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', color: texto, fontVariant: ['tabular-nums'] }}
            >
              {n}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

/**
 * La superficie de una vitrina: vidrio, o el color del tema, con la imagen
 * de fondo debajo si la hay.
 *
 * Con tema, es un color sólido y no vidrio teñido: el material está pensado
 * para dejar pasar lo que tiene detrás, y una tarjeta que la persona pintó
 * de rosa tiene que ser rosa, no rosa-con-lo-que-haya-abajo.
 */
export function Superficie({
  colores,
  fondo,
  radius = 16,
  style,
  children,
}: {
  colores: ColoresVitrina
  fondo: ShowcaseImagen | null
  radius?: number
  style?: ViewStyle
  children: ReactNode
}) {
  const [caja, setCaja] = useState<{ w: number; h: number } | null>(null)
  /* Se mide solo si hace falta: la imagen encuadrada y la textura dibujada
     necesitan el tamaño; un color liso o un degradado, no. */
  const necesitaCaja = !!fondo || !!colores.patron
  const medir = (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = e.nativeEvent.layout
    setCaja((antes) => (antes?.w === width && antes.h === height ? antes : { w: width, h: height }))
  }

  const capaFondo = fondo ? (
    <View pointerEvents="none" style={LLENO}>
      {caja ? (
        <Image
          source={{ uri: ilustracionUrl(fondo.path) }}
          resizeMode="cover"
          /* Con el alto: la cuenta del encuadre sabe la proporción real de
             la tarjeta, que es lo que decide cuánto hay que acercar una
             imagen girada para que no asomen las esquinas. */
          style={estiloEncuadrado(caja.w, fondo.encuadre, caja.h)}
        />
      ) : null}
      {/* El velo: lo que hace que el texto se lea sobre cualquier foto. */}
      <View style={[LLENO, { backgroundColor: 'rgba(0,0,0,0.38)' }]} />
    </View>
  ) : null

  if (colores.fondo || fondo) {
    return (
      <View
        onLayout={necesitaCaja ? medir : undefined}
        style={[
          {
            borderRadius: radius,
            overflow: 'hidden',
            backgroundColor: colores.fondo ?? 'rgb(24,24,24)',
          },
          style,
        ]}
      >
        {/* Las capas, de abajo hacia arriba: el color liso, el degradado, la
            textura, la foto con su velo, el contenido. Con foto, degradado y
            textura no se dibujan: el velo y el blanco mandan. */}
        {colores.degradado && !fondo ? <CapaDegradado d={colores.degradado} /> : null}
        {colores.patron && caja && !fondo ? (
          <CapaPatron tipo={colores.patron.tipo} color={colores.patron.color} w={caja.w} h={caja.h} />
        ) : null}
        {capaFondo}
        {children}
      </View>
    )
  }

  return (
    <Glass radius={radius} style={[HAY_VIDRIO ? {} : { backgroundColor: 'rgb(24,24,24)' }, style ?? {}]}>
      {children}
    </Glass>
  )
}

const LLENO = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const

/** El degradado del tema, sobre el color liso. En web solo cuenta el ángulo. */
function CapaDegradado({ d }: { d: Degradado }) {
  return <LinearGradient pointerEvents="none" colors={d.colores} start={d.start} end={d.end} style={LLENO} />
}

/**
 * La textura del tema, dibujada a mano con SVG.
 *
 * Rayas y puntos se dibujan elemento por elemento y no con `Pattern`, que
 * en Android tiene historial de artefactos (react-native-svg #1764); son
 * unas decenas de nodos por tarjeta, dibujados una vez. El halo es un
 * degradado radial en una esquina: la «luz» del tema. Sin grano ni ruido:
 * `FeTurbulence` solo existe en web en la versión instalada.
 */
function CapaPatron({ tipo, color, w, h }: { tipo: 'rayas' | 'puntos' | 'halo'; color: string; w: number; h: number }) {
  if (tipo === 'halo') {
    return (
      <Svg pointerEvents="none" style={LLENO} width={w} height={h}>
        <Defs>
          <RadialGradient id="halo" cx="25%" cy="20%" r="70%">
            <Stop offset="0" stopColor={color} stopOpacity="1" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width={w} height={h} fill="url(#halo)" />
      </Svg>
    )
  }
  if (tipo === 'rayas') {
    const paso = 9
    const n = Math.ceil((w + h) / paso)
    return (
      <Svg pointerEvents="none" style={LLENO} width={w} height={h}>
        {Array.from({ length: n }, (_, i) => {
          const x = i * paso
          return <Line key={i} x1={x} y1={0} x2={x - h} y2={h} stroke={color} strokeWidth={1.5} />
        })}
      </Svg>
    )
  }
  const paso = 12
  const cols = Math.ceil(w / paso)
  const filas = Math.ceil(h / paso)
  return (
    <Svg pointerEvents="none" style={LLENO} width={w} height={h}>
      {Array.from({ length: cols * filas }, (_, i) => (
        <Circle key={i} cx={(i % cols) * paso + 6} cy={Math.floor(i / cols) * paso + 6} r={1.2} fill={color} />
      ))}
    </Svg>
  )
}

/**
 * Los controles del modo de edición, en las esquinas de la tarjeta.
 *
 * Son los del «Space» de Airbuds y los de los widgets del iPhone: el «−» que
 * saca arriba a la izquierda, el lápiz arriba a la derecha y, abajo a la
 * derecha, la manija que se arrastra para cambiar el tamaño. Desbordan la
 * tarjeta a propósito —viven en las esquinas, no adentro— así el contenido
 * no tiene que hacerles lugar.
 */
function Controles({
  onRemove,
  onEditar,
  onRedimensionar,
  onAncho,
}: {
  onRemove?: () => void
  onEditar?: () => void
  onRedimensionar?: (direccion: Redimension) => void
  onAncho?: () => void
}) {
  return (
    <>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sacar del perfil"
          onPress={onRemove}
          hitSlop={8}
          className="absolute items-center justify-center rounded-full active:opacity-60"
          style={[BOTON_ESQUINA, { top: -6, left: -6 }]}
        >
          <IconMinus size={13} color={ICON_COLOR.foreground} strokeWidth={2.5} />
        </Pressable>
      ) : null}
      {onEditar ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Editar esta vitrina"
          onPress={onEditar}
          hitSlop={8}
          className="absolute items-center justify-center rounded-full active:opacity-60"
          style={[BOTON_ESQUINA, { top: -6, right: -6 }]}
        >
          <IconPencil size={12} color={ICON_COLOR.foreground} />
        </Pressable>
      ) : null}
      {onRedimensionar || onAncho ? (
        <ManijaDeTamano onRedimensionar={onRedimensionar} onAncho={onAncho} />
      ) : null}
    </>
  )
}

/* Los botones de esquina: un disco gris oscuro con el trazo blanco, el mismo
   escalón de luminancia que separa cualquier superficie de esta app. */
/* Desbordan 6px y no más: con dos piezas a media fila, el lápiz de una y el
   «−» de la otra se encuentran en el hueco de la grilla, y con más vuelo se
   pisaban. */
const BOTON_ESQUINA: ViewStyle = {
  width: 24,
  height: 24,
  backgroundColor: 'rgb(58,58,58)',
  boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
  zIndex: 30,
}

/**
 * La manija de tamaño: el arco de abajo a la derecha, que se arrastra.
 *
 * Arrastrar hacia la derecha la ensancha (1×1 → 2×1), hacia abajo la hace
 * más alta (2×1 → 2×2), y en sentido contrario la achica. Un toque sin
 * arrastre pasa al tamaño siguiente, que es lo que hacía el chip de antes y
 * lo que un lector de pantalla puede accionar.
 */
function ManijaDeTamano({
  onRedimensionar,
  onAncho,
}: {
  onRedimensionar?: (direccion: Redimension) => void
  onAncho?: () => void
}) {
  const decidir = (dx: number, dy: number) => {
    if (!onRedimensionar) return
    if (Math.abs(dx) < UMBRAL_REDIMENSION && Math.abs(dy) < UMBRAL_REDIMENSION) return
    if (Math.abs(dx) >= Math.abs(dy)) onRedimensionar(dx > 0 ? 'ancho' : 'angosto')
    else onRedimensionar(dy > 0 ? 'alto' : 'bajo')
  }

  const arrastre = Gesture.Pan()
    .minDistance(6)
    .onEnd((e) => {
      runOnJS(decidir)(e.translationX, e.translationY)
    })
  const toque = Gesture.Tap().onEnd(() => {
    if (onAncho) runOnJS(onAncho)()
  })
  const gesto = Gesture.Race(arrastre, toque)

  return (
    <GestureDetector gesture={gesto}>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel="Cambiar el tamaño: arrastrá, o tocá para el siguiente"
        hitSlop={10}
        style={
          {
            position: 'absolute',
            right: -4,
            bottom: -4,
            width: 30,
            height: 30,
            zIndex: 30,
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            /* Solo web: el cursor de estirar. RN no lo tipa, RNW lo pasa. */
            cursor: 'nwse-resize',
          } as object
        }
      >
        {/* El arco: solo el borde de abajo y el de la derecha, redondeado en
            esa esquina. Es la forma de la manija de Airbuds, y se lee como
            «de acá se tira» sin necesitar un ícono. */}
        <View
          style={{
            width: 22,
            height: 22,
            borderRightWidth: 3.5,
            borderBottomWidth: 3.5,
            borderColor: '#FFFFFF',
            borderBottomRightRadius: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
          }}
        />
      </View>
    </GestureDetector>
  )
}

/**
 * Una imagen fijada.
 *
 * Se dibuja **con su encuadre**, el mismo mecanismo que la foto de perfil (ver
 * `src/ui/Encuadre.tsx`): la imagen sube entera y lo que se guarda es cómo
 * mirarla, así un GIF fijado sigue animado.
 *
 * Va apaisada y no cuadrada porque una vitrina vive en una fila junto a otras:
 * el 16:10 es lo que hace que una imagen y una canción a media columna tengan
 * más o menos el mismo peso visual, en vez de que la imagen sea el doble de
 * alta y rompa el renglón.
 */
function VitrinaImagen({ imagen, grande = false }: { imagen: ShowcaseImagen; grande?: boolean }) {
  const [caja, setCaja] = useState(0)
  const uri = ilustracionUrl(imagen.path)
  /* Grande es el 2×2: la banda se vuelve casi cuadrada y la imagen manda. */
  const razon = grande ? 0.92 : 0.62
  const alto = caja > 0 ? Math.round(caja * razon) : 0

  return (
    <View
      className="overflow-hidden rounded-xl bg-muted"
      style={alto ? { height: alto } : { aspectRatio: 1 / razon }}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width
        setCaja((antes) => (Math.abs(antes - w) < 1 ? antes : w))
      }}
    >
      {caja > 0 ? (
        <Image
          source={{ uri }}
          resizeMode="cover"
          style={estiloEncuadrado(caja, imagen.encuadre, alto)}
        />
      ) : null}
    </View>
  )
}

/** El hueco de una tapa que no está, del color que pida el tema. */
function HuecoDeTapa({ c, size, redondo = false }: { c: ColoresVitrina; size: number; redondo?: boolean }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: redondo ? size / 2 : 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.claro ? 'rgba(18,18,18,0.08)' : 'rgba(255,255,255,0.08)',
      }}
    >
      <IconMusic size={Math.round(size * 0.36)} color={c.secundario} />
    </View>
  )
}

/**
 * Un artista fijado: su cara y su nombre.
 *
 * A media fila la foto va **grande y arriba**, con el nombre debajo — es la
 * pieza cuadrada de Airbuds, donde la cara es lo que se ve de lejos. A fila
 * entera se acuesta: cara a la izquierda, nombre al lado.
 *
 * La foto va redonda porque así se dibujan los artistas en toda la app (el
 * buscador, la ficha): un artista es una cara, un álbum es una tapa cuadrada —
 * la forma es lo que los distingue de un vistazo, antes de leer nada.
 */
function VitrinaArtista({ artista, c, mitad }: { artista: ShowcaseArtista; c: ColoresVitrina; mitad: boolean }) {
  const lado = mitad ? 72 : 56
  const foto = artista.fotoUrl ? (
    <Image
      source={{ uri: artista.fotoUrl }}
      style={{ width: lado, height: lado, borderRadius: lado / 2 }}
    />
  ) : (
    <HuecoDeTapa c={c} size={lado} redondo />
  )

  if (mitad) {
    return (
      <View className="gap-3">
        {foto}
        <View className="gap-0.5">
          <Text className="text-[10px] font-semibold uppercase tracking-[1.2px]" style={{ color: c.secundario }}>
            Artista
          </Text>
          <Text className="text-[15px] font-bold" numberOfLines={2} style={{ color: c.texto }}>
            {artista.nombre}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View className="flex-row items-center gap-3">
      {foto}
      <View className="min-w-0 flex-1">
        <Text className="text-[10px] font-semibold uppercase tracking-[1.2px]" style={{ color: c.secundario }}>
          Artista
        </Text>
        <Text className="text-[15px] font-bold" numberOfLines={1} style={{ color: c.texto }}>
          {artista.nombre}
        </Text>
      </View>
    </View>
  )
}

/** Un álbum fijado: la tapa, el título y de quién es. Misma regla que el artista. */
function VitrinaAlbum({ album, c, mitad }: { album: ShowcaseAlbum; c: ColoresVitrina; mitad: boolean }) {
  const lado = mitad ? 72 : 56
  const tapa = album.tapaUrl ? (
    <Image source={{ uri: album.tapaUrl }} style={{ width: lado, height: lado, borderRadius: 10 }} />
  ) : (
    <HuecoDeTapa c={c} size={lado} />
  )
  const textos = (
    <>
      <Text className="text-[10px] font-semibold uppercase tracking-[1.2px]" style={{ color: c.secundario }}>
        Álbum
      </Text>
      <Text className="text-[15px] font-bold" numberOfLines={mitad ? 2 : 1} style={{ color: c.texto }}>
        {album.titulo}
      </Text>
      <Text className="text-[12px]" numberOfLines={1} style={{ color: c.secundario }}>
        {album.artista}
      </Text>
    </>
  )

  if (mitad) {
    return (
      <View className="gap-3">
        {tapa}
        <View className="gap-0.5">{textos}</View>
      </View>
    )
  }

  return (
    <View className="flex-row items-center gap-3">
      {tapa}
      <View className="min-w-0 flex-1">{textos}</View>
    </View>
  )
}

/**
 * Las tapas de lo que un sub-space tiene adentro, mientras llegan.
 *
 * Se piden por la tarjeta y no por el mosaico entero porque son de una pieza
 * sola —la mayoría de los perfiles no va a tener ninguna— y porque la vista
 * previa del editor las necesita también, donde no hay mosaico que las pida.
 * Con `null` (una pieza que todavía no existe) no se pide nada y la grilla
 * queda vacía: es lo que se ve al crear un sub-space.
 */
export function useMiniaturas(parentId: string | null, recarga = 0): Miniaturas | null {
  const [miniaturas, setMiniaturas] = useState<Miniaturas | null>(null)
  useEffect(() => {
    if (!parentId) return
    let vivo = true
    listMiniaturas(parentId)
      .then((m) => vivo && setMiniaturas(m))
      .catch(() => vivo && setMiniaturas(SIN_PIEZAS))
    return () => {
      vivo = false
    }
  }, [parentId, recarga])
  return parentId ? miniaturas : SIN_PIEZAS
}

const SIN_PIEZAS: Miniaturas = { tapas: [], cuantas: 0 }

/**
 * La grilla de 2×2 con las tapas de un sub-space.
 *
 * Cuatro casilleros siempre, aunque falten tapas: lo que la tarjeta muestra
 * es «acá adentro hay un mosaico», y un mosaico se lee por su grilla. Los
 * huecos van en el translúcido del tema, como la tapa que falta en una
 * canción, así la grilla se ve completa sobre cualquier color.
 */
export function GrillaDeMiniaturas({ tapas, c, lado }: { tapas: string[]; c: ColoresVitrina; lado: number }) {
  /* Dos columnas con 4 de aire: cada tapa es la mitad del lado menos el hueco. */
  const celda = (lado - 4) / 2
  const hueco = c.claro ? 'rgba(18,18,18,0.08)' : 'rgba(255,255,255,0.08)'
  return (
    <View style={{ width: lado, height: lado, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
      {Array.from({ length: 4 }, (_, i) => {
        const tapa = tapas[i]
        return tapa ? (
          <Image key={i} source={{ uri: tapa }} style={{ width: celda, height: celda, borderRadius: 8 }} />
        ) : (
          <View key={i} style={{ width: celda, height: celda, borderRadius: 8, backgroundColor: hueco }} />
        )
      })}
    </View>
  )
}

/** «N piezas», para la tarjeta y para el editor. */
export function rotuloDePiezas(n: number): string {
  return `${n} ${n === 1 ? 'pieza' : 'piezas'}`
}

/**
 * Un sub-space: la puerta a un mosaico que vive adentro de la pieza.
 *
 * Es la pieza paga del Space de Airbuds. La tarjeta muestra el título y una
 * grilla chica con las tapas de sus primeras piezas —lo justo para saber que
 * adentro hay algo y de qué color es— y tocarla abre el mosaico entero en su
 * pantalla. A media fila la grilla va arriba, grande, y el título debajo: es
 * la pieza cuadrada; a fila entera se acuesta, con la grilla a la izquierda.
 *
 * Toda la tarjeta es el botón. Mirando, el contenido de la vitrina recibe
 * los toques (`pointerEvents`), y armando no: ahí la pieza se agarra.
 */
function VitrinaSubspace({
  showcase,
  c,
  recarga,
  onAbrir,
}: {
  showcase: Extract<Showcase, { kind: 'subspace' }>
  c: ColoresVitrina
  recarga: number
  onAbrir?: () => void
}) {
  const mitad = showcase.ancho === 'mitad'
  const grande = showcase.ancho === 'grande'
  const miniaturas = useMiniaturas(showcase.id === 'borrador' ? null : showcase.id, recarga)
  const tapas = miniaturas?.tapas ?? []
  const cuantas = miniaturas?.cuantas ?? 0

  const textos = (
    <View className={mitad ? 'gap-0.5' : 'min-w-0 flex-1 gap-0.5'}>
      <View className="flex-row items-center gap-1.5">
        <IconGrilla size={11} color={c.secundario} />
        <Text className="text-[10px] font-semibold uppercase tracking-[1.2px]" style={{ color: c.secundario }}>
          Sub-space
        </Text>
      </View>
      <Text className="text-[15px] font-bold" numberOfLines={mitad ? 2 : 1} style={{ color: c.texto }}>
        {showcase.titulo}
      </Text>
      <Text className="text-[12px]" numberOfLines={1} style={{ color: c.secundario }}>
        {miniaturas ? rotuloDePiezas(cuantas) : ' '}
      </Text>
    </View>
  )

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${showcase.titulo}`}
      onPress={onAbrir}
      disabled={!onAbrir}
      className={mitad ? 'gap-3 active:opacity-70' : 'flex-row items-center gap-3.5 active:opacity-70'}
    >
      {mitad ? (
        <Grilla tapas={tapas} c={c} />
      ) : (
        <GrillaDeMiniaturas tapas={tapas} c={c} lado={grande ? 132 : 84} />
      )}
      {textos}
    </Pressable>
  )
}

/* A media fila la grilla ocupa todo el ancho de la tarjeta: se mide y se
   dibuja cuadrada sobre esa medida, como la imagen fijada. */
function Grilla({ tapas, c }: { tapas: string[]; c: ColoresVitrina }) {
  const [lado, setLado] = useState(0)
  return (
    <View
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width
        setLado((antes) => (Math.abs(antes - w) < 1 ? antes : w))
      }}
      style={{ width: '100%', aspectRatio: 1 }}
    >
      {lado > 0 ? <GrillaDeMiniaturas tapas={tapas} c={c} lado={lado} /> : null}
    </View>
  )
}

/**
 * Un verso fijado.
 *
 * Se dibuja como cita y no como tarjeta de canción: lo que se fijó son las
 * palabras. La canción firma abajo, chiquita — es la fuente, no el punto. Si
 * hay tapa, va arriba y chica, como la de la pieza de letras de Airbuds.
 */
function VitrinaLetra({ letra, c, grande = false }: { letra: ShowcaseLetra; c: ColoresVitrina; grande?: boolean }) {
  return (
    <View className={grande ? 'gap-4 py-4' : 'gap-3'}>
      <View className="flex-row items-center justify-between">
        {letra.artworkUrl ? (
          <Image source={{ uri: letra.artworkUrl }} style={{ width: 36, height: 36, borderRadius: 6 }} />
        ) : (
          <View />
        )}
        <IconLyrics size={15} color={c.secundario} />
      </View>
      <Text
        className={`font-semibold italic ${grande ? 'text-[24px] leading-9' : 'text-[17px] leading-6'}`}
        style={{ color: c.texto }}
      >
        “{letra.texto}”
      </Text>
      {letra.title || letra.artist ? (
        <Text className="text-[11px]" numberOfLines={1} style={{ color: c.secundario }}>
          {[letra.artist, letra.title].filter(Boolean).join(' — ')}
        </Text>
      ) : null}
    </View>
  )
}

/**
 * Una canción fijada, o un fragmento.
 *
 * La diferencia entre las dos no es de forma sino de qué suena: la canción
 * entera arranca de cero, el fragmento del recorte que elegiste. Por eso
 * comparten el dibujo y solo cambia el rótulo.
 */
function VitrinaCancion({
  showcase,
  c,
  playing,
  sonando,
  posicionMs,
  transcurridoMs = 0,
  onTogglePlay,
  onSeek,
}: {
  showcase: Extract<Showcase, { kind: 'cancion' | 'fragmento' }>
  c: ColoresVitrina
  playing: boolean
  sonando: boolean
  posicionMs?: SharedValue<number>
  transcurridoMs?: number
  onTogglePlay: (id: string, song: SongSnippet) => void
  onSeek?: (id: string, song: SongSnippet, fraccion: number) => void
}) {
  const cancion = showcase.cancion
  const tapa = artworkSource(cancion.artworkPath ?? undefined, cancion.artworkUrl, 320)
  const esFragmento = showcase.kind === 'fragmento'
  const mitad = showcase.ancho === 'mitad'

  /* Lo que entiende el reproductor de fragmentos, que ya existe y es el mismo
     que suena en el chat. Una canción entera es un recorte que empieza en cero
     y dura todo. */
  const song: SongSnippet = {
    videoId: cancion.videoId,
    title: cancion.title,
    artist: cancion.artist,
    artworkUrl: cancion.artworkUrl,
    artworkPath: cancion.artworkPath ?? undefined,
    path: cancion.audioPath,
    startMs: cancion.startMs ?? 0,
    durationMs:
      esFragmento && cancion.startMs !== undefined && cancion.endMs !== undefined
        ? cancion.endMs - cancion.startMs
        : cancion.durationMs,
  }

  /* La onda es la del tramo que suena: el recorte en un fragmento, el tema
     entero en una canción fijada. */
  const picos = usePicos(cancion.videoId, { desdeMs: song.startMs, durMs: song.durationMs })

  /* Lo que va sonando **de este pedazo**: la posición viene en tiempo de la
     canción entera, y un fragmento que empieza en 1:04 tiene que decir 0:00. */
  const transcurrido = sonando
    ? Math.max(0, Math.min(song.durationMs, transcurridoMs - song.startMs))
    : 0

  /*
   * El play: de vidrio sobre vidrio, y un disco del color opuesto sobre un
   * tema. Sobre una tarjeta clara el disco es oscuro y sobre una oscura es
   * blanco — sigue siendo lo más contrastado de la tarjeta, que es lo que un
   * botón principal necesita, sin meter un color que el tema no eligió.
   */
  const play = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pausar' : `Escuchar ${cancion.title}`}
      onPress={() => onTogglePlay(showcase.id, song)}
      className="active:opacity-80"
    >
      {c.fondo ? (
        <View
          style={{
            width: mitad ? 40 : 48,
            height: mitad ? 40 : 48,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.claro ? '#121212' : '#FFFFFF',
          }}
        >
          {playing ? (
            <IconPause size={mitad ? 14 : 17} color={c.claro ? '#FFFFFF' : '#121212'} />
          ) : (
            <IconPlay size={mitad ? 14 : 17} color={c.claro ? '#FFFFFF' : '#121212'} />
          )}
        </View>
      ) : HAY_VIDRIO ? (
        <Glass radius={999} style={{ width: mitad ? 40 : 48, height: mitad ? 40 : 48 }}>
          <View className="h-full w-full items-center justify-center">
            {playing ? (
              <IconPause size={mitad ? 14 : 17} color={ICON_COLOR.foreground} />
            ) : (
              <IconPlay size={mitad ? 14 : 17} color={ICON_COLOR.foreground} />
            )}
          </View>
        </Glass>
      ) : (
        <View
          className="items-center justify-center rounded-full bg-primary"
          style={{ width: mitad ? 40 : 48, height: mitad ? 40 : 48 }}
        >
          {playing ? (
            <IconPause size={mitad ? 14 : 17} color={ICON_COLOR.onPrimary} />
          ) : (
            <IconPlay size={mitad ? 14 : 17} color={ICON_COLOR.onPrimary} />
          )}
        </View>
      )}
    </Pressable>
  )

  /*
   * A media fila la tapa manda: va arriba, grande, con el play encima de su
   * esquina — la pieza de canción de Airbuds. La onda no entra en ese ancho y
   * no se dibuja; a fila entera vuelve, con el reloj.
   */
  if (mitad) {
    return (
      <View className="gap-3">
        <View>
          {tapa ? (
            <Image source={{ uri: tapa }} style={{ width: 84, height: 84, borderRadius: 12 }} />
          ) : (
            <HuecoDeTapa c={c} size={84} />
          )}
          <View style={{ position: 'absolute', right: 0, top: 0 }}>
            <IconMusic size={16} color={c.secundario} />
          </View>
        </View>
        <View className="flex-row items-end gap-2">
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-[15px] font-bold" numberOfLines={2} style={{ color: c.texto }}>
              {cancion.title}
            </Text>
            <Text className="text-[12px]" numberOfLines={1} style={{ color: c.secundario }}>
              {cancion.artist}
            </Text>
          </View>
          {play}
        </View>
      </View>
    )
  }

  return (
    <View className="gap-3">
      <Text className="text-[11px] font-semibold uppercase tracking-[1.2px]" style={{ color: c.secundario }}>
        {esFragmento ? 'Un fragmento' : 'En repeat'}
      </Text>

      <View className="flex-row items-center gap-3.5">
        {tapa ? (
          <Image source={{ uri: tapa }} style={{ width: 68, height: 68, borderRadius: 12 }} />
        ) : (
          <HuecoDeTapa c={c} size={68} />
        )}

        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-[17px] font-semibold" numberOfLines={1} style={{ color: c.texto }}>
            {cancion.title}
          </Text>
          <Text className="text-[13px]" numberOfLines={1} style={{ color: c.secundario }}>
            {cancion.artist}
          </Text>
        </View>

        {play}
      </View>

      {/*
        Mientras la onda no llegó, un riel y nada más: ocupa el mismo alto,
        así que nada salta cuando la onda entra, y no finge ser una forma que
        no conoce.
      */}
      {picos ? (
        <Onda
          picos={picos}
          posicionMs={posicionMs}
          desdeMs={song.startMs}
          duracionMs={song.durationMs}
          activa={sonando}
          onSeek={onSeek ? (f) => onSeek(showcase.id, song, f) : undefined}
          height={40}
          etiqueta={cancion.title}
        />
      ) : (
        <View className="justify-center" style={{ height: 40 }}>
          <View className="h-[3px] w-full rounded-full" style={{ backgroundColor: ONDA_PENDIENTE }} />
        </View>
      )}

      {/* El reloj, debajo de la onda: lo que va sonando sobre el total. */}
      <View className="-mt-1 flex-row justify-end gap-1">
        <Text className="text-[11px] tabular-nums" style={{ color: c.texto }}>
          {formatClock(transcurrido)}
        </Text>
        <Text className="text-[11px] tabular-nums" style={{ color: c.secundario }}>
          / {formatClock(song.durationMs)}
        </Text>
      </View>
    </View>
  )
}

function VitrinaLista({
  playlistId,
  playlists,
  esMio,
  c,
  onOpen,
}: {
  playlistId: string
  playlists: Playlist[] | null
  esMio: boolean
  c: ColoresVitrina
  onOpen: (playlistId: string) => void
}) {
  const lista = playlists?.find((p) => p.id === playlistId) ?? null

  // Mientras la biblioteca no llegó no se dice nada.
  if (!playlists) return null
  /*
   * No apareció, y qué significa eso depende de quién mira.
   *
   * En **tu** perfil la lista se busca en tu biblioteca entera, así que no
   * estar quiere decir que la borraste después de fijarla: se dice, en vez de
   * dejar un hueco mudo.
   *
   * En el de **otro** se buscó entre sus listas públicas, así que no estar
   * quiere decir que esa lista es privada — y ahí no se dibuja nada. Un cartel
   * diciendo «no existe» sería mentira, y uno diciendo «es privada» avisaría
   * de algo que su dueño decidió no mostrar.
   */
  if (!lista) {
    if (!esMio) return null
    return (
      <Text className="text-[13px]" style={{ color: c.secundario }}>
        Esta lista ya no existe.
      </Text>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${lista.name}`}
      onPress={() => onOpen(lista.id)}
      className="gap-3 active:opacity-70"
    >
      <View className="flex-row items-center gap-2">
        <Text className="text-[11px] font-semibold uppercase tracking-[1.2px]" style={{ color: c.secundario }}>
          Su lista
        </Text>
        {/* Fijaste una privada: la ves vos y nadie más. Sin esta marca, el
            perfil se veía lleno para vos y vacío para el resto sin que nada
            lo explicara. */}
        {esMio && lista.visibilidad === 'privada' ? (
          <View
            className="flex-row items-center gap-1 rounded-full px-2 py-0.5"
            style={{ backgroundColor: c.claro ? 'rgba(18,18,18,0.08)' : 'rgba(255,255,255,0.1)' }}
          >
            <IconLock size={9} color={c.secundario} />
            <Text className="text-[10px] uppercase tracking-[1.2px]" style={{ color: c.secundario }}>
              Solo vos
            </Text>
          </View>
        ) : null}
      </View>
      <View className="flex-row items-center gap-3">
        <PlaylistCover covers={lista.covers} coverPath={lista.coverPath} size={64} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-[16px] font-semibold" numberOfLines={1} style={{ color: c.texto }}>
            {lista.name}
          </Text>
          <Text className="text-[13px]" style={{ color: c.secundario }}>
            {lista.tracks} {lista.tracks === 1 ? 'canción' : 'canciones'}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}
