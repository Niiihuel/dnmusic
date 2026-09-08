import { AIRE_CELDA_MOSAICO as AIRE_CELDA, objetivoResizeMosaico } from './mosaicoResize'
import { MarcoContenidoDiscord } from './DiscordCosmeticos'
import { usePiezaDiscord } from '../services/discordCatalogo'
import type { MosaicoPerfil } from './useMosaicoPerfil'
import { TECLADO_FISICO } from '../lib/teclado'
import { TextoPerfil as Text } from './FuentePerfil'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { Modal, Pressable, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector, State } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  LinearTransition,
  ReduceMotion,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Image as ExpoImage } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import {
  anchosDe,
  countShowcases,
  esVideo,
  ilustracionUrl,
  listShowcases,
  siguienteAncho,
  type Showcase,
  type ShowcaseAncho,
} from '../services/showcases'
import type { Tema } from '../lib/tema'
import { listPlaylists, listPublicPlaylists, type Playlist } from '../services/playlists'
import {
  reaccionarAVitrina,
  reaccionesDeVitrinas,
  type ReaccionesVitrina,
} from '../services/reacciones'
import { useSnippetPlayer } from '../state/player'
import { avisar } from '../state/aviso'
import { mensajeError } from '../lib/mensajeError'
import { fetchStats, type EstadisticasPerfil } from '../services/plays'
import { useMyProfile } from '../state/session'
import type { Encuadre } from '../services/profile'
import { Avatar } from './Avatar'
import { Glass } from './Glass'
import { IconRedimensionar } from './icons'
import { estiloEncuadrado } from './Encuadre'
import { aireDelMarco, Marco } from './Marco'
import { Confirmar } from './Confirmar'
import { EfectoPerfil } from './DecoracionImagen'
import { PlacaDeNombre } from './Placas'
import { EMOJIS } from './Reacciones'
import { Vitrina } from './Vitrina'
import { useRouter } from 'expo-router'
import { abrirArtista } from '../state/shell'

/**
 * El fondo del perfil: la imagen entera, detrás de todo.
 *
 * Es el fondo de Steam. No una banda arriba con el contenido abajo sobre negro,
 * sino la imagen ocupando la pantalla completa y las vitrinas apoyadas encima,
 * dejándola pasar. De ahí sale la segunda función, que es la que lo justifica
 * técnicamente: **es la única pantalla de la app donde el vidrio tiene una foto
 * que difuminar**. En el resto lo que pasa por detrás son listas sobre gris.
 *
 * Se queda quieto mientras el contenido se desplaza: está fuera del `ScrollView`
 * a propósito. Un fondo que acompaña al scroll es un encabezado largo; uno que
 * se queda es un fondo.
 *
 * Acepta lo que se pueda subir: una imagen, un GIF —que `Image` anima solo en
 * iOS y en web— o un clip, que va mudo y en repetición. Nunca una tapa de
 * canción: eso era un cuadrado de 640px estirado a pantalla, que sin desenfocar
 * se pixelaba y desenfocado no era una elección de nadie.
 */
/**
 * Si esta ruta es un fondo de verdad — subido por la persona — o nada.
 *
 * Solo cuentan las rutas con carpeta (`<uid>/<ts>.gif`). Las planas
 * (`<videoId>.jpg`) son tapas de canción de cuando el fondo se elegía así; se
 * ignoran en vez de dibujarse mal. Lo usan `FondoPerfil` para decidir qué
 * dibujar y las pantallas para decidir cuánto aire darle (ver `alturaDeHeroe`).
 */
export function hayFondo(bannerPath: string | null | undefined): boolean {
  return !!bannerPath?.includes('/')
}

/**
 * Dónde arranca el contenido del perfil, medido desde arriba.
 *
 * Con un fondo elegido, la primera pantalla le pertenece: el contenido empieza
 * a ~2/5 del alto, la identidad queda apoyada en el borde de esa zona y todo lo
 * demás **scrollea por encima de la imagen** — que es exactamente cómo Steam
 * trata el arte del perfil. Antes el contenido arrancaba a 24–72px del techo y
 * el fondo se veía solo en las rendijas entre tarjetas: elegir una imagen no
 * cambiaba casi nada de lo que se veía.
 *
 * Sin fondo no hay nada que apreciar y el aire sería un hueco muerto: se usa el
 * arranque compacto de siempre, que viaja como `compacto` porque cada pantalla
 * tiene el suyo (safe area en el teléfono, el botón flotante en escritorio).
 */
export function alturaDeHeroe(
  altoVentana: number,
  bannerPath: string | null | undefined,
  compacto: number,
): number {
  if (!hayFondo(bannerPath)) return compacto
  return Math.max(compacto, Math.round(altoVentana * 0.38))
}

export function FondoPerfil({
  bannerPath,
  encuadre = null,
  efecto = null,
  animado = true,
}: {
  bannerPath: string | null
  /** Cómo mirar el fondo. Solo se aplica a imágenes: un clip va tal cual. */
  encuadre?: Encuadre | null
  /** El efecto animado encima del fondo, arriba. Ver `ui/DecoracionImagen`. */
  efecto?: string | null
  animado?: boolean
}) {
  const ruta = hayFondo(bannerPath) ? bannerPath! : null
  const uri = ruta ? ilustracionUrl(ruta) : null
  const clip = ruta ? esVideo(ruta) : false

  /*
   * Sin imagen, la banda se dibuja igual.
   *
   * Antes esto devolvía `null`, y el resultado era que un perfil recién hecho
   * —que es justo el que nadie eligió todavía cómo se ve— no tenía encabezado en
   * absoluto: el nombre quedaba flotando contra el negro del panel, y en
   * escritorio eso deja la mitad de arriba de la pantalla muerta.
   *
   * El reemplazo es un escalón de luminancia, no un color: `muted` bajando a
   * `background`, que es la misma separación que usa el resto de la app.
   */
  if (!uri) {
    return (
      <View pointerEvents="none" className="absolute inset-x-0 top-0 h-[300px]">
        <LinearGradient
          /* `muted` (#1F1F1F) → `background` (#121212). */
          colors={['rgb(31,31,31)', 'rgb(24,24,24)', 'rgb(18,18,18)']}
          locations={[0, 0.6, 1]}
          style={{ flex: 1 }}
        />
        <EfectoPerfil id={efecto} alto={300} animado={animado} />
      </View>
    )
  }

  return (
    <View pointerEvents="none" className="absolute inset-0">
      {clip ? (
        <FondoClip uri={uri} animado={animado} />
      ) : (
        <FondoImagen uri={uri} encuadre={encuadre} animado={animado} />
      )}

      {/*
       * El velo: un paño parejo que baja el brillo general —el texto tiene que
       * leerse sobre cualquier imagen, incluida una blanca— y dos degradados que
       * cierran arriba y abajo contra el fondo de la app.
       *
       * Ninguna de las tres capas llega a opaca. Si tapara del todo, las
       * vitrinas de vidrio quedarían difuminando un gris plano y el fondo
       * dejaría de servir para lo único que lo justifica.
       *
       * **El paño parejo es el más flojo de los tres, y esa es la idea.** Estaba
       * en 0.62 y se comía la imagen: el fondo que alguien eligió llegaba como
       * una mancha oscura detrás de todo. Pero bajarlo a secas dejaría sin
       * contraste al texto que flota **fuera** de una tarjeta —el nombre arriba,
       * el encabezado de las listas abajo—, así que lo que se baja en el medio
       * se compensa en los dos bordes, que es justo donde ese texto vive.
       *
       * Repartido así, la parte de la imagen que queda al descubierto es la del
       * medio, donde no hay texto suelto: las tarjetas que la cruzan son de
       * vidrio y traen su propio contraste. El fondo se ve, y lo que hay que
       * leer se lee.
       */}
      <View className="absolute inset-0" style={{ backgroundColor: 'rgba(18,18,18,0.34)' }} />
      <LinearGradient
        colors={['rgba(18,18,18,0.80)', 'rgba(18,18,18,0.15)', 'rgba(18,18,18,0)']}
        locations={[0, 0.65, 1]}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 260 }}
      />
      <LinearGradient
        colors={['rgba(18,18,18,0)', 'rgba(18,18,18,0.35)', 'rgba(18,18,18,0.88)']}
        locations={[0, 0.45, 1]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 300 }}
      />
      {/* El efecto va sobre el velo, no debajo: es lo que hay que ver. */}
      <EfectoPerfil id={efecto} alto={320} animado={animado} />
    </View>
  )
}

/**
 * El fondo cuando es una imagen, con su encuadre.
 *
 * Necesita medirse a sí mismo porque el encuadre se expresa en fracciones del
 * recuadro y acá el recuadro es la pantalla entera: hasta que no se sabe cuánto
 * mide, no se puede saber cuánto correr la imagen. Sin encuadre no espera nada
 * —`cover` centrado es lo de siempre— así que el caso normal no paga el
 * compás de espera de la medición.
 */
function FondoImagen({ uri, encuadre, animado }: { uri: string; encuadre: Encuadre | null; animado: boolean }) {
  const [caja, setCaja] = useState<{ w: number; h: number } | null>(null)

  if (!encuadre) {
    return <ExpoImage source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" autoplay={animado} />
  }

  return (
    <View
      className="h-full w-full overflow-hidden"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        setCaja((antes) =>
          antes?.w === width && antes.h === height ? antes : { w: width, h: height },
        )
      }}
    >
      {caja ? (
        <ExpoImage
          source={{ uri }}
          contentFit="cover"
          autoplay={animado}
          /* Con el alto: el recuadro del fondo es apaisado y la cuenta del
             encuadre necesita la proporción real para saber cuánto acercar
             una imagen girada. */
          style={estiloEncuadrado(caja.w, encuadre, caja.h)}
        />
      ) : null}
    </View>
  )
}

/**
 * El clip de fondo, en su propio componente **para que el reproductor exista
 * solo cuando hay un clip**.
 *
 * Antes `FondoPerfil` creaba el `VideoPlayer` siempre —los hooks no pueden ser
 * condicionales— aunque el fondo fuera una imagen o no hubiera ninguno. En iOS
 * crear el primer reproductor nativo configura la sesión de audio del sistema,
 * y eso le pegaba un tirón de un segundo a la música al entrar al perfil por
 * primera vez. Acá el hook vive en un componente que solo se monta con clip.
 *
 * `mixWithOthers` es la otra mitad: el modo por defecto (`auto`) negocia la
 * sesión contra lo que ya suena, y un fondo mudo no tiene por qué tocarle el
 * audio a nadie.
 */
function FondoClip({ uri, animado }: { uri: string; animado: boolean }) {
  const video = useVideoPlayer(uri, (p) => {
    p.loop = true
    p.muted = true
    p.audioMixingMode = 'mixWithOthers'
    if (animado) p.play()
  })

  useEffect(() => {
    if (animado) video.play()
    else video.pause()
  }, [animado, video])

  return (
    <VideoView
      player={video}
      style={{ width: '100%', height: '100%' }}
      contentFit="cover"
      nativeControls={false}
    />
  )
}

/**
 * Quién sos: foto, nombre, usuario y tu línea.
 *
 * Sin tarjeta propia — se apoya sobre el fondo. Una tarjeta acá sería una caja
 * dentro de otra caja, y taparía justo la parte de la imagen que se eligió para
 * que se vea.
 */
export function Identidad({
  nombre,
  usuario,
  avatarPath,
  encuadre = null,
  marco = null,
  placa = null,
  bio,
  centrado = false,
  banda = false,
  accion,
  animado = true,
}: {
  nombre: string
  usuario: string
  avatarPath: string | null
  /** Cómo mirar la foto. `null` = centrada, que es lo de siempre. */
  encuadre?: Encuadre | null
  /** El marco dibujado alrededor. Ver `ui/Marco`. */
  marco?: string | null
  /** La placa detrás del nombre. Ver `ui/Placas`. */
  placa?: string | null
  bio: string
  /** En el teléfono va centrado; con dos columnas, alineado a la izquierda. */
  centrado?: boolean
  /**
   * En escritorio, la identidad se acuesta: foto a la izquierda, nombre al lado
   * y la acción contra el otro extremo.
   *
   * Apilada ocupaba ~350px de ancho y ~450px de alto contra el borde izquierdo,
   * y dejaba un hueco enorme hasta la columna del resumen. Acostada llena la
   * banda de punta a punta, que es lo que hace Steam y lo que hace que el
   * encabezado se lea como una franja y no como una esquina.
   */
  banda?: boolean
  /** Lo que va contra el borde derecho de la banda (el botón de editar). */
  accion?: ReactNode
  /** Pausa los cosméticos también en la cabecera sin tarjeta. */
  animado?: boolean
}) {
  if (banda) {
    return (
      <View className="flex-row items-center gap-5">
        <FotoDeHeroe
          nombre={nombre}
          avatarPath={avatarPath}
          encuadre={encuadre}
          marco={marco}
          animado={animado}
          size={136}
          aireADerecha
        />
        <View className="min-w-0 flex-1 items-start gap-1">
          <PlacaDeNombre id={placa} animado={animado}>
            <Text className="text-foreground text-[32px] font-bold" numberOfLines={1}>
              {nombre}
            </Text>
            <Text className="text-muted-foreground text-[14px] mt-1" numberOfLines={1}>@{usuario}</Text>
          </PlacaDeNombre>
          {bio.trim() ? (
            <Text className="text-foreground text-[15px] leading-6" numberOfLines={2}>
              {bio}
            </Text>
          ) : null}
        </View>
        {accion ? <View className="shrink-0">{accion}</View> : null}
      </View>
    )
  }

  return (
    <View className={`gap-3 ${centrado ? 'items-center' : ''}`}>
      <FotoDeHeroe
        nombre={nombre}
        avatarPath={avatarPath}
        encuadre={encuadre}
        marco={marco}
        animado={animado}
        size={centrado ? 120 : 96}
      />
      <PlacaDeNombre id={placa} animado={animado}>
        <View className={`gap-0.5 ${centrado ? 'items-center' : ''}`}>
          <Text className="text-foreground text-[26px] font-bold" numberOfLines={1}>
            {nombre}
          </Text>
          <Text className="text-muted-foreground text-[14px]" numberOfLines={1}>@{usuario}</Text>
        </View>
      </PlacaDeNombre>
      {bio.trim() ? (
        <Text
          className={`text-foreground text-[15px] leading-6 ${centrado ? 'text-center' : ''}`}
        >
          {bio}
        </Text>
      ) : null}
    </View>
  )
}

/**
 * La foto del perfil, más grande y con su anillo.
 *
 * El anillo es del color del fondo de la app y no un borde decorativo: es lo
 * que hacen Steam (`border: 4px solid var(--bg-primary)`) y Discord con su
 * tarjeta, y existe por una razón óptica — la foto flota **sobre la imagen que
 * eligió la persona**, y sin un corte del color de la superficie los bordes de
 * las dos imágenes se funden. El anillo la despega de cualquier fondo sin
 * meterle un color nuevo a la pantalla.
 *
 * Vive en su propio componente porque acá es donde se cuelga el marco
 * decorativo (un marco desborda a la foto, no la pisa; ver `ui/Marco`). Se
 * dibuja alrededor de esto sin tocar a nadie más, y por eso la caja deja
 * `overflow: visible` a propósito: las alas y las llamas viven por fuera.
 */
function FotoDeHeroe({
  nombre,
  avatarPath,
  encuadre,
  marco,
  size,
  aireADerecha = false,
  animado = true,
}: {
  nombre: string
  avatarPath: string | null
  encuadre: Encuadre | null
  marco?: string | null
  size: number
  /**
   * Reservar a la derecha lo que el marco desborda. En la banda de escritorio
   * la foto tiene el nombre pegado al lado, y sin este margen la punta de un
   * ala se le metía encima; apilada, el marco flota sobre el fondo y no hace
   * falta correr nada.
   */
  aireADerecha?: boolean
  animado?: boolean
}) {
  /* El +8 cuenta el anillo de 4px de cada lado. */
  const lado = size + 8
  return (
    <View style={{ overflow: 'visible', marginRight: aireADerecha && marco ? aireDelMarco(lado) : 0 }}>
      <View className="rounded-full border-4 border-background">
        <Avatar name={nombre} path={avatarPath} size={size} encuadre={encuadre} />
      </View>
      {/* Por fuera y por encima, desbordando la foto. */}
      <Marco marco={marco} size={lado} animado={animado} />
    </View>
  )
}

/** Estadísticas reales. Los conteos privados se omiten en el perfil público.
 * Sólo este bloque recibe el marco Discord, a escala de tarjeta vertical.
 */
export function Resumen({ ownerId, listas, canciones, vitrinas = null, desde, sinEscucha = false, marcoPerfil, animado = true }: {
  ownerId: string
  listas?: number | null
  canciones?: number | null
  vitrinas?: number | null
  desde: string | null
  sinEscucha?: boolean
  marcoPerfil?: string | null
  animado?: boolean
}) {
  const [resultado, setResultado] = useState<{ ownerId: string; stats: EstadisticasPerfil | null } | null>(null)
  const stats = resultado?.ownerId === ownerId ? resultado.stats : null
  const pieza = usePiezaDiscord(marcoPerfil ?? '')
  const enmarcado = pieza?.tipo === 'marcoPerfil' && pieza.disponible !== false
  useEffect(() => {
    if (!ownerId || sinEscucha) return
    let vivo = true
    fetchStats(ownerId)
      .then(stats => { if (vivo) setResultado({ ownerId, stats }) })
      .catch(() => undefined)
    return () => { vivo = false }
  }, [ownerId, sinEscucha])

  return <View testID="estadisticas-perfil" style={{ width: '100%', maxWidth: 360, alignSelf: 'center', paddingBottom: enmarcado ? 16 : 0 }}>
    <MarcoContenidoDiscord id={marcoPerfil} animado={animado}>
      <View style={{ gap: 24, ...(enmarcado ? { padding: 22, borderRadius: 16, backgroundColor: 'rgba(20,20,24,0.92)', minHeight: 380 } : {}) }}>
        <Text accessibilityRole="header" style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>Estadísticas</Text>
        {sinEscucha ? null : <>
          <Dato rotulo="Minutos escuchados" valor={stats?.minutos ?? null} destacado />
          {stats?.artistaTop ? <Dato rotulo="Más escuchado" valor={stats.artistaTop} detalle={`${stats.minutosArtistaTop} min`} /> : null}
        </>}
        {listas !== undefined ? <Dato rotulo="Listas" valor={listas} /> : null}
        {canciones !== undefined ? <Dato rotulo="Canciones guardadas" valor={canciones} /> : null}
        <Dato rotulo="Vitrinas" valor={vitrinas} />
        <Dato rotulo="Acá desde" valor={desde ? mesYAno(desde) : null} />
      </View>
    </MarcoContenidoDiscord>
  </View>
}

/** Una cifra con su rótulo, legible también sobre el fondo sin marco. */
export function Dato({
  rotulo,
  valor,
  detalle,
  destacado = false,
}: {
  rotulo: string
  valor: number | string | null
  /** Un segundo dato al costado del valor, más chico. */
  detalle?: string
  /** El primero va más grande: es la cabeza de la columna. */
  destacado?: boolean
}) {
  const sombra = { textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 8 } as const

  return (
    <View className="gap-1">
      <Text
        className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]"
        style={sombra}
      >
        {rotulo}
      </Text>
      <View className="flex-row items-baseline gap-2">
        {/* Mientras no se sabe va una raya y no un cero: cero es un dato, «no lo
            sé todavía» es otra cosa. */}
        <Text
          className={`text-foreground font-semibold tabular-nums ${
            destacado ? 'text-[34px] leading-[38px]' : 'text-[22px] leading-[26px]'
          }`}
          numberOfLines={1}
          style={sombra}
        >
          {valor === null ? '—' : valor}
        </Text>
        {detalle ? (
          <Text className="text-muted-foreground text-[13px] tabular-nums" style={sombra}>
            {detalle}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function mesYAno(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es', { month: 'long', year: 'numeric' })
}

/**
 * La grilla de vitrinas.
 *
 * Una columna siempre: en el teléfono porque no entra otra cosa, y en
 * escritorio porque la segunda columna ya la ocupa el resumen. Es el reparto de
 * Steam — las vitrinas mandan, los números acompañan.
 *
 * Tiene dos modos, y son los del «Space» de Airbuds. Mirando, las tarjetas
 * responden a lo suyo: se escucha una canción, se abre una lista. **Armando**
 * —`editando`— la tarjeta entera pasa a ser una pieza: se arrastra para
 * reordenar, el «−» la saca, el lápiz la abre y la manija de la esquina la
 * estira. Es el modo de reordenar de la pantalla de inicio del iPhone, y como
 * ahí, en el perfil propio se entra manteniendo apretada cualquier pieza.
 *
 * En el perfil de **otro** el mismo apretón hace otra cosa: abre la fila de
 * emojis para dejarle una reacción a esa pieza (`reaccionable`). Es el gesto
 * del Space de Airbuds, y es el mismo gesto a propósito — mantener apretada
 * una pieza es «quiero hacer algo con esta», y qué se puede hacer depende de
 * si es tuya.
 */
export function Vitrinas({
  ownerId,
  parentId = null,
  recarga,
  onCambio,
  vacio,
  editando = false,
  temaGlobal = null,
  onEditar,
  onEntrarEdicion,
  onArrastre,
  reaccionable = false,
  onAbrirSubspace,
  borrador,
}: {
  borrador?: MosaicoPerfil
  ownerId: string
  /**
   * Qué mosaico: el principal del perfil (`null`) o el de adentro de un
   * sub-space. Todo lo demás —el orden, el tamaño, las reacciones, el modo de
   * edición— es igual en los dos; es lo que hace que un sub-space sea un
   * mosaico de verdad y no una versión chica.
   */
  parentId?: string | null
  recarga: number
  onCambio: () => void
  /** Qué mostrar cuando no hay ninguna. */
  vacio?: ReactNode
  /** Con los controles puestos. Solo en el perfil propio. */
  editando?: boolean
  /** El tema del perfil, que heredan las vitrinas sin tema propio. */
  temaGlobal?: Tema | null
  /** El lápiz de una tarjeta: abrir su editor. */
  onEditar?: (showcase: Showcase) => void
  /**
   * Mantener apretada una tarjeta, mirando: entrar a armar.
   *
   * Solo lo pasa el perfil propio — en el de otro no hay nada que armar.
   */
  onEntrarEdicion?: () => void
  /**
   * Un arrastre empezó o terminó: la pantalla que scrollea lo necesita para
   * congelarse — un ScrollView vivo abajo del dedo se pelea con el gesto.
   */
  onArrastre?: (activo: boolean) => void
  /**
   * Mantener apretada una pieza abre la fila de emojis para reaccionarle.
   *
   * Lo pasa el perfil ajeno. En el propio no tiene efecto aunque venga: a las
   * piezas de uno no se les reacciona, y ahí el apretón ya entra a armar.
   */
  reaccionable?: boolean
  /** Tocar un sub-space, mirando: abrir su mosaico. Lo pasan los dos perfiles. */
  onAbrirSubspace?: (showcase: Showcase) => void
}) {
  const router = useRouter()
  const [lectura, setLectura] = useState<Showcase[] | null>(null)
  const vitrinas = borrador ? borrador.vitrinas : lectura
  const setVitrinas = borrador ? borrador.editar : setLectura
  const tieneBorrador = !!borrador
  const puedeEditar = editando && !!borrador && !borrador.guardando
  const [listas, setListas] = useState<Playlist[] | null>(null)
  /*
   * La que está por sacarse, esperando el «¿seguro?», y cuántas piezas tiene
   * adentro si es un sub-space: se van con ella (la base las borra en
   * cascada) y el diálogo tiene que decirlo. `null` mientras se cuentan.
   */
  const [porSacar, setPorSacar] = useState<{ v: Showcase; hijas: number | null } | null>(null)
  const player = useSnippetPlayer()

  useEffect(() => {
    let vivo = true
    if (tieneBorrador) return
    listShowcases(ownerId, parentId)
      .then((v) => vivo && setLectura(v))
      .catch(() => vivo && setLectura([]))
    return () => {
      vivo = false
    }
  }, [ownerId, parentId, recarga, tieneBorrador])

  /*
   * Lo que le dejaron a cada pieza, en un solo viaje para el mosaico entero,
   * y la pieza que tiene la fila de emojis abierta encima (con su rectángulo
   * en la ventana, para anclarla). Se piden en el perfil propio también: ahí
   * se ven, solo que no se puede reaccionar. Si fallan no se dibuja ninguna,
   * que es lo mismo que si no hubiera — un perfil no se rompe por sus chips.
   */
  const [reacciones, setReacciones] = useState<Map<string, ReaccionesVitrina>>(() => new Map())
  const reaccionesEnviando = useRef(new Set<string>())
  const [abierta, setAbierta] = useState<{ showcase: Showcase; rect: Rect | null } | null>(null)

  useEffect(() => {
    let vivo = true
    reaccionesDeVitrinas(ownerId)
      .then((m) => vivo && setReacciones(m))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [ownerId, recarga])

  /*
   * Las listas se piden solo si alguna vitrina las necesita: la mayoría de los
   * perfiles no va a tener una y sería una consulta al pedo.
   *
   * **De quién se piden depende de si el perfil es tuyo**, y eso se decide
   * comparando el dueño con la sesión — no con `editando`, que significa otra
   * cosa: si se dibujan los controles. Son dos preguntas distintas y
   * confundirlas costó un bug feo: tu propio perfil se mira sin controles a
   * propósito, para verse como lo ve cualquiera, así que tus vitrinas se
   * resolvían contra tus listas **públicas** y una lista privada fijada decía
   * «esta lista ya no existe» en tu propia cara.
   *
   * En el perfil de otro se piden sus públicas, que es lo único que hay
   * derecho a ver. Una privada fijada simplemente no se dibuja para el
   * visitante (ver `VitrinaLista`): fijar algo privado la deja para vos.
   */
  const yo = useMyProfile()
  const esMio = !!yo && yo.userId === ownerId
  const necesitaListas = (vitrinas ?? []).some((v) => v.kind === 'lista')
  useEffect(() => {
    if (!necesitaListas || listas !== null) return
    let vivo = true
    const pedido = esMio ? listPlaylists() : listPublicPlaylists(ownerId)
    pedido.then((l) => vivo && setListas(l)).catch(() => vivo && setListas([]))
    return () => {
      vivo = false
    }
  }, [necesitaListas, listas, esMio, ownerId])

  /*
   * El agarre: lo que las celdas comparten para arrastrarse y estirarse.
   *
   * Los valores del gesto viven en shared values —decenas de eventos por
   * segundo, un render por cada uno mataría la lista— y las medidas de las
   * celdas también: cada celda informa su `onLayout` (en coordenadas del
   * mosaico, que es el mismo sistema en el que se mueve el dedo) y el worklet
   * del arrastre las lee para decidir **en vivo** sobre qué celda está la
   * pieza. Es la mecánica de react-grid-layout: mientras arrastrás, el hueco
   * donde va a caer se corre con vos y las demás piezas se acomodan alrededor;
   * al soltar, la pieza ya está donde la ves.
   */
  const activa = useSharedValue(-1)
  const dx = useSharedValue(0)
  const dy = useSharedValue(0)
  /** La celda agarrada, tal como estaba al empezar: de ahí sale a dónde va la
   *  pieza que sigue al dedo aunque su hueco ya se haya movido. */
  const origen = useSharedValue<Rect>({ x: 0, y: 0, w: 0, h: 0 })
  const rects = useSharedValue<Rect[]>([])
  /** Hubo un reacomodo y las medidas todavía son las viejas: no se decide con ellas. */
  const pendiente = useSharedValue(false)
  /** El estirado: qué celda, y el rectángulo de la banda que sigue al dedo. */
  const estirando = useSharedValue(-1)
  const anchoMosaico = useSharedValue(0)
  const refs = useRef(new Map<number, MedibleRef>())
  const rectsRef = useRef<Rect[]>([])
  /* Lo que se ve, siempre a mano para los callbacks del gesto: un `useState`
     leído desde un closure viejo mostraría el orden de antes de arrastrar. */
  const vitrinasRef = useRef<Showcase[] | null>(null)
  useEffect(() => {
    vitrinasRef.current = vitrinas
  }, [vitrinas])
  const ordenInicial = useRef<Showcase[] | null>(null)
  const tamanoInicial = useRef<{ id: string; ancho: ShowcaseAncho } | null>(null)

  const onLayoutCelda = useCallback(
    (i: number, r: Rect) => {
      rectsRef.current[i] = r
      // eslint-disable-next-line react-hooks/immutability -- API de un SharedValue
      rects.value = [...rectsRef.current]
    },
    [rects],
  )

  /**
   * Mover una es reescribir el orden de todas, **en pantalla al toque**.
   *
   * Durante el arrastre esto corre cada vez que la pieza cruza a otra celda:
   * el orden cambia, las demás se corren (con su animación de layout) y el
   * hueco aparece donde va a caer. El servidor recibe los cambios al pulsar
   * Guardar. Las medidas quedan marcadas como viejas hasta que las celdas
   * vuelvan a medirse: decidir el próximo destino con las de antes hacía que
   * la pieza fuera y volviera entre dos huecos.
   */
  const moverA = useCallback(
    (desde: number, hacia: number) => {
      setVitrinas((prev) => {
        if (!prev || hacia < 0 || hacia >= prev.length || desde === hacia) return prev
        const proximo = [...prev]
        const [sacada] = proximo.splice(desde, 1)
        proximo.splice(hacia, 0, sacada)
        return proximo
      })
      // eslint-disable-next-line react-hooks/immutability -- API de un SharedValue
      pendiente.value = true
      setTimeout(() => {
        pendiente.value = false
      }, 90)
    },
    [pendiente, setVitrinas],
  )

  const empezar = useCallback(
    (i: number) => {
      ordenInicial.current = vitrinasRef.current
      onArrastre?.(true)
    },
    [onArrastre],
  )

  /** Soltar conserva el borrador; sólo Guardar cambios persiste. */
  const soltar = useCallback(() => {
    ordenInicial.current = null
    onArrastre?.(false)
  }, [onArrastre])

  /** El gesto se cortó: vuelve el orden de antes de agarrar. */
  const cancelar = useCallback(() => {
    const inicial = ordenInicial.current
    ordenInicial.current = null
    if (inicial) setVitrinas(inicial)
    onArrastre?.(false)
  }, [onArrastre, setVitrinas])

  /**
   * Cambiar cuánto ocupa una: en pantalla al toque, en el servidor después.
   *
   * Igual que reordenar, y por lo mismo: esperar la respuesta para que la
   * tarjeta cambie de tamaño hace que el botón se sienta roto.
   */
  const cambiarAncho = useCallback((id: string, ancho: ShowcaseAncho) => {
    setVitrinas(actual => actual?.map(v => v.id === id ? { ...v, ancho } : v) ?? null)
  }, [setVitrinas])

  /*
   * El estirado elige entre los tamaños admitidos. Pieza y contorno cambian
   * juntos; al soltar queda en el borrador y al cancelar vuelve al inicio.
   */
  const empezarEstirar = useCallback(
    (i: number) => {
      const v = vitrinasRef.current?.[i]
      if (v) tamanoInicial.current = { id: v.id, ancho: v.ancho }
      onArrastre?.(true)
    },
    [onArrastre],
  )
  const estirarA = useCallback((i: number, cols: number, filas: number) => {
    setVitrinas(actual => {
      const v = actual?.[i]
      if (!actual || !v) return actual
      const deseado: ShowcaseAncho = cols >= 2 && filas >= 2 && anchosDe(v.kind).includes('grande')
        ? 'grande' : cols >= 2 ? 'entero' : 'mitad'
      return v.ancho === deseado ? actual : actual.map(x => x.id === v.id ? { ...x, ancho: deseado } : x)
    })
  }, [setVitrinas])
  const soltarEstirar = useCallback(() => {
    tamanoInicial.current = null
    onArrastre?.(false)
  }, [onArrastre])
  const cancelarEstirar = useCallback(() => {
    const inicial = tamanoInicial.current
    tamanoInicial.current = null
    if (inicial) setVitrinas(actual => actual?.map(v => v.id === inicial.id ? { ...v, ancho: inicial.ancho } : v) ?? null)
    onArrastre?.(false)
  }, [onArrastre, setVitrinas])
  /** Tocar el asa sin arrastrar: el tamaño siguiente. Es la puerta del teclado y del toque corto. */
  const tocarAsa = useCallback((i: number) => {
    const v = vitrinasRef.current?.[i]
    if (v) cambiarAncho(v.id, siguienteAncho(v.ancho, v.kind))
  }, [cambiarAncho])

  const agarre: Agarre = {
    activa,
    dx,
    dy,
    origen,
    rects,
    pendiente,
    estirando,
    anchoMosaico,
    refs,
    onLayoutCelda,
    empezar,
    moverA,
    soltar,
    cancelar,
    empezarEstirar,
    estirarA,
    soltarEstirar,
    cancelarEstirar,
    tocarAsa,
  }

  if (vitrinas === null) return null
  if (!vitrinas.length) return <>{vacio}</>

  function sacar(v: Showcase) {
    setPorSacar(null)
    setVitrinas(actual => actual?.filter(pieza => pieza.id !== v.id) ?? null)
  }

  /** El «−»: se pregunta antes, y en un sub-space se cuenta qué se lleva. */
  function pedirSacar(v: Showcase) {
    if (v.kind !== 'subspace') {
      setPorSacar({ v, hijas: 0 })
      return
    }
    setPorSacar({ v, hijas: null })
    countShowcases(ownerId, v.id)
      .then((n) => setPorSacar((actual) => (actual?.v.id === v.id ? { v, hijas: n } : actual)))
      .catch(() => setPorSacar((actual) => (actual?.v.id === v.id ? { v, hijas: 0 } : actual)))
  }

  /* Lo que dice el diálogo: con piezas adentro, que se van también. */
  const mensajeDeSacar =
    porSacar && porSacar.hijas
      ? porSacar.hijas === 1
        ? 'Esta pieza se va del mosaico, y la pieza que tiene adentro se va con ella. Se eliminará al guardar; hasta entonces podés restablecer.'
        : `Esta pieza se va del mosaico, y las ${porSacar.hijas} piezas que tiene adentro se van con ella. Se eliminará al guardar; hasta entonces podés restablecer.`
      : porSacar?.v.kind === 'subspace'
        ? 'Este sub-space y todo su contenido se eliminarán al guardar; hasta entonces podés restablecer.'
        : 'Esta pieza se va del mosaico. Se eliminará al guardar; hasta entonces podés restablecer.'

  /*
   * Reaccionar: en pantalla al toque, en el servidor después.
   *
   * El mismo criterio que reordenar y que cambiar el tamaño: esperar la
   * respuesta para que aparezca el chip hace que el gesto se sienta roto. Se
   * recalcula la cuenta a mano —se resta la que tenías, se suma la nueva— y si
   * el servidor dice que no, se vuelve a lo que había y se avisa.
   *
   * Tocar el emoji que ya dejaste lo saca: es el toggle de cualquier
   * reacción, y sin él no habría forma de arrepentirse.
   */
  function reaccionar(v: Showcase, emoji: string) {
    if (reaccionesEnviando.current.has(v.id)) return
    reaccionesEnviando.current.add(v.id)
    setAbierta(null)
    const antes = reacciones.get(v.id) ?? { conteo: {}, mia: null }
    const proximo = antes.mia === emoji ? null : emoji
    const conteo = { ...antes.conteo }
    if (antes.mia) {
      const n = (conteo[antes.mia] ?? 1) - 1
      if (n > 0) conteo[antes.mia] = n
      else delete conteo[antes.mia]
    }
    if (proximo) conteo[proximo] = (conteo[proximo] ?? 0) + 1
    setReacciones((m) => new Map(m).set(v.id, { conteo, mia: proximo }))
    reaccionarAVitrina(v.id, proximo).catch((e: unknown) => {
      setReacciones((m) => new Map(m).set(v.id, antes))
      avisar(mensajeError(e), true)
    }).finally(() => reaccionesEnviando.current.delete(v.id))
  }

  /* Solo lo que muestra algo se reacciona: un título de sección o un espacio
     son composición del mosaico, no una pieza a la que decirle 🔥. */
  const sePuedeReaccionar = reaccionable && !esMio
  function apretonDe(v: Showcase, i: number): (() => void) | undefined {
    if (onEntrarEdicion) return onEntrarEdicion
    if (!sePuedeReaccionar || v.kind === 'espaciador' || v.kind === 'encabezado') return undefined
    /* La celda se mide en ese instante —el scroll previo la deja en cualquier
       lado— con la misma ref que usa el arrastre. Sin medida, la fila se abre
       igual, centrada. */
    return () => {
      const ref = refs.current.get(i)
      if (ref?.measureInWindow) {
        ref.measureInWindow((x, y, w, h) => setAbierta({ showcase: v, rect: { x, y, w, h } }))
      } else {
        setAbierta({ showcase: v, rect: null })
      }
    }
  }

  /*
   * De la lista ordenada al mosaico.
   *
   * Las vitrinas siguen siendo **una sola secuencia** —ese es su orden y es lo
   * que se reordena—; las filas se derivan al dibujar. Guardar filas en la base
   * sería guardar dos veces la misma información, y a la primera que alguien
   * cambia un ancho quedan desincronizadas.
   *
   * La regla es simple: una `entero` ocupa su propia fila, y dos `mitad`
   * seguidas comparten una. Una `mitad` suelta al final queda a media fila en
   * vez de estirarse, que es lo que la hace verse elegida y no sobrante.
   */
  /* Grande y entero ocupan su fila; solo dos mitades vecinas comparten una. */

  return (
    /* Las celdas mantienen su identidad al cambiar de fila: el layout puede
       animarse sin desmontar reproductores ni volver a pedir imágenes. */
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}
      onLayout={(e) => {
        anchoMosaico.value = e.nativeEvent.layout.width
      }}
    >
      {vitrinas.map((v, i) => (
        <CeldaDeMosaico
          key={v.id}
          indice={i}
          mitad={v.ancho === 'mitad'}
          filas={v.ancho === 'grande' ? 2 : 1}
          agarre={agarre}
          editando={puedeEditar}
          onApreton={apretonDe(v, i)}
        >
          <Vitrina
            showcase={v}
            temaGlobal={temaGlobal}
            playlists={listas}
            esMio={esMio}
            reacciones={reacciones.get(v.id) ?? null}
            onAgregarReaccion={sePuedeReaccionar && !puedeEditar && !borrador ? apretonDe(v, i) : undefined}
            playing={player.currentId === v.id && player.playing}
            sonando={player.currentId === v.id}
            posicionMs={player.posicionSV}
            transcurridoMs={player.positionMs}
            /*
             * Escuchar puede fallar —la URL del audio se firma en el
             * momento— y sin capturarlo quedaba una promesa rechazada
             * suelta: en el teléfono eso es un recuadro rojo a pantalla
             * completa por no poder reproducir una tarjeta. Se avisa y se
             * sigue.
             */
            onTogglePlay={(id, song) => {
              player.toggle(id, song).catch((e: unknown) => avisar(mensajeError(e), true))
            }}
            onSeek={(id, song, fraccion) => {
              player.seek(id, song, fraccion).catch((e: unknown) => avisar(mensajeError(e), true))
            }}
            onOpenPlaylist={editando || borrador ? undefined : (id) => router.push(`/lista/${id}`)}
            onOpenArtist={editando || borrador ? undefined : (id, nombre) => { abrirArtista(id, nombre); router.dismissTo('/') }}
            onAbrirSubspace={puedeEditar || borrador?.guardando ? undefined : onAbrirSubspace}
            recarga={recarga}
            editando={puedeEditar}
            onRemove={puedeEditar ? () => pedirSacar(v) : undefined}
            onEditar={puedeEditar ? onEditar : undefined}
          />
        </CeldaDeMosaico>
      ))}

      <Confirmar
        visible={porSacar !== null}
        titulo={porSacar?.v.kind === 'subspace' ? 'Sacar el sub-space' : 'Sacar del perfil'}
        mensaje={mensajeDeSacar}
        rotulo="Sacar"
        onCancelar={() => setPorSacar(null)}
        onConfirmar={() => porSacar && sacar(porSacar.v)}
      />

      {abierta ? (
        <FilaDeEmojis
          rect={abierta.rect}
          mia={reacciones.get(abierta.showcase.id)?.mia ?? null}
          onElegir={(emoji) => reaccionar(abierta.showcase, emoji)}
          onCerrar={() => setAbierta(null)}
        />
      ) : null}
    </View>
  )
}

/* La fila de emojis: seis discos de 44 con 4 de aire, y 6 de relleno. */
const EMOJI_LADO = 44
const FILA_ALTO = EMOJI_LADO + 12
const FILA_ANCHO = EMOJIS.length * EMOJI_LADO + (EMOJIS.length - 1) * 4 + 12
const FILA_AIRE = 8

/**
 * La fila de emojis que se abre sobre una pieza ajena al mantenerla apretada.
 *
 * Es la de Airbuds y la de cualquier chat: una píldora de vidrio anclada a la
 * pieza —arriba si hay lugar, abajo si no— con los mismos seis emojis de la
 * escucha. El que ya dejaste va marcado con el disco blanco, que es como esta
 * app dice «activo» sin color; tocarlo lo saca.
 *
 * Va en un `Modal` por lo mismo que el `Popover`: los paneles recortan lo que
 * se sale de ellos, y una fila que asoma por encima de una pieza al borde del
 * panel quedaría cortada. El Modal dibuja encima de todo y las coordenadas
 * medidas en la ventana son justo las suyas. Tocar afuera cierra.
 *
 * Sin rectángulo —una celda que no se pudo medir— la fila se centra en la
 * pantalla: peor que anclada, mejor que no abrirse.
 */
function FilaDeEmojis({
  rect,
  mia,
  onElegir,
  onCerrar,
}: {
  rect: Rect | null
  mia: string | null
  onElegir: (emoji: string) => void
  onCerrar: () => void
}) {
  const { width, height } = useWindowDimensions()

  const anchoFila = Math.min(FILA_ANCHO, width - FILA_AIRE * 2)
  const ladoEmoji = Math.min(EMOJI_LADO, (anchoFila - 12) / EMOJIS.length - 4)
  let top: number
  let left: number
  if (rect) {
    const arriba = rect.y - FILA_ALTO - FILA_AIRE >= FILA_AIRE
    top = arriba ? rect.y - FILA_ALTO - FILA_AIRE : rect.y + rect.h + FILA_AIRE
    left = rect.x + rect.w / 2 - anchoFila / 2
  } else {
    top = height / 2 - FILA_ALTO / 2
    left = width / 2 - anchoFila / 2
  }
  left = Math.max(FILA_AIRE, Math.min(left, width - anchoFila - FILA_AIRE))
  top = Math.max(FILA_AIRE, Math.min(top, height - FILA_ALTO - FILA_AIRE))

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCerrar}>
      {/* El fondo que cierra va como hermano de la fila y no envolviéndola:
          en web, un Pressable adentro de otro es un <button> dentro de un
          <button>. Mismo arreglo que el Popover. */}
      <View className="flex-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar la fila de reacciones"
          onPress={onCerrar}
          className="absolute inset-0"
        />
        <View style={{ position: 'absolute', top, left }}>
          <Glass
            radius={FILA_ALTO / 2}
            style={{ width: anchoFila, height: FILA_ALTO, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
          >
            <View className="flex-1 flex-row items-center justify-center" style={{ gap: 4 }}>
              {EMOJIS.map((emoji) => {
                const marcado = mia === emoji
                return (
                  <Pressable
                    key={emoji}
                    accessibilityRole="button"
                    accessibilityLabel={marcado ? `Sacar tu ${emoji}` : `Reaccionar con ${emoji}`}
                    accessibilityState={{ selected: marcado }}
                    onPress={() => onElegir(emoji)}
                    className={`items-center justify-center rounded-full ${
                      marcado ? 'bg-primary' : 'active:bg-muted'
                    }`}
                    style={{ width: ladoEmoji, height: EMOJI_LADO }}
                  >
                    <Text style={{ fontSize: 22, lineHeight: 28 }}>{emoji}</Text>
                  </Pressable>
                )
              })}
            </View>
          </Glass>
        </View>
      </View>
    </Modal>
  )
}

/** Lo que sabe medirse en la ventana: la ref de una celda. */
type MedibleRef = {
  measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void
} | null

type Rect = { x: number; y: number; w: number; h: number }

/** Lo que las celdas comparten para arrastrarse y estirarse. Lo arma `Vitrinas`. */
type Agarre = {
  activa: SharedValue<number>
  dx: SharedValue<number>
  dy: SharedValue<number>
  origen: SharedValue<Rect>
  rects: SharedValue<Rect[]>
  pendiente: SharedValue<boolean>
  estirando: SharedValue<number>
  anchoMosaico: SharedValue<number>
  refs: MutableRefObject<Map<number, MedibleRef>>
  onLayoutCelda: (i: number, r: Rect) => void
  empezar: (i: number) => void
  moverA: (desde: number, hacia: number) => void
  soltar: () => void
  cancelar: () => void
  empezarEstirar: (i: number) => void
  estirarA: (i: number, cols: number, filas: number) => void
  soltarEstirar: () => void
  cancelarEstirar: () => void
  tocarAsa: (i: number) => void
}

/**
 * Una celda del mosaico que sabe seguir al dedo, **y decir dónde va a caer**.
 *
 * Es la mecánica de react-grid-layout traída al mosaico: la pieza agarrada
 * sigue al puntero apenas agrandada y por encima, y su **hueco** —un
 * rectángulo punteado del tamaño de la pieza— se mueve en vivo a la celda
 * sobre la que está, corriendo a las demás con su animación de layout. Al
 * soltar no pasa nada nuevo: la pieza ya está donde el hueco decía. Antes las
 * demás solo se apagaban y el reacomodo se veía recién al soltar, que es
 * exactamente lo que hace dudar antes de soltar.
 *
 * El destino se decide en el hilo de la interfaz con las medidas de las celdas
 * (`rects`, que cada una informa por `onLayout` en coordenadas del mosaico):
 * la celda cuyo centro quede más cerca del centro de la pieza arrastrada.
 * Cada reacomodo marca las medidas como viejas hasta que las celdas vuelven a
 * medirse, para no decidir dos veces con los mismos números.
 *
 * La pieza agarrada **no anima su layout**: cuando su hueco salta a otro
 * lugar, la celda salta con él y la compensación (`origen − rect actual`) la
 * deja quieta debajo del dedo. Las demás sí animan, que es lo que se ve
 * acomodarse.
 *
 * **Estirar** es el asa de abajo a la derecha: el contorno marca la medida
 * real elegida entre media fila, fila entera y grande. El contenido se
 * redistribuye dentro de esa misma caja; tocar el asa pasa al siguiente.
 *
 * Armando, **la tarjeta entera es la manija**. Mirando, la misma celda escucha
 * el apretón largo: en el perfil propio entra a armar, en el ajeno abre la fila
 * de emojis. La celda no sabe cuál de las dos es — solo avisa.
 */
function CeldaDeMosaico({
  indice,
  mitad,
  filas,
  agarre,
  editando,
  onApreton,
  children,
}: {
  indice: number
  mitad: boolean
  /** Cuántas filas ocupa hoy: 2 en «grande», 1 en el resto. */
  filas: number
  agarre: Agarre
  editando: boolean
  /** Se mantuvo apretada, mirando. */
  onApreton?: () => void
  children: ReactNode
}) {
  // El worklet solo recibe SharedValues. `agarre` también contiene refs a
  // vistas nativas que deben permanecer en el runtime de React.
  const {
    activa,
    dx,
    dy,
    origen,
    rects,
    pendiente,
    estirando,
    anchoMosaico,
    empezar,
    moverA,
    soltar,
    cancelar,
    empezarEstirar,
    estirarA,
    soltarEstirar,
    cancelarEstirar,
    tocarAsa,
  } = agarre
  /* eslint-disable react-hooks/immutability -- escribir `.value` es la API
     imperativa de un SharedValue; es el mismo gesto que `EncoladaArrastrable`
     en la cola, que el analizador acepta con otra forma de llegar al valor. */
  const estilo = useAnimatedStyle(() => {
    if (activa.value === indice) {
      const o = origen.value
      const r = rects.value[indice] ?? o
      return {
        transform: [
          { translateX: dx.value + o.x - r.x },
          { translateY: dy.value + o.y - r.y },
          { scale: 1.03 },
        ],
        zIndex: 30,
        opacity: 1,
      }
    }
    return {
      transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }],
      zIndex: estirando.value === indice ? 20 : 0,
      opacity: withTiming(activa.value >= 0 ? 0.92 : 1, { duration: 160 }),
    }
  })
  /* El hueco: se ve solo bajo la pieza agarrada, que ya no está ahí. */
  const hueco = useAnimatedStyle(() => ({
    opacity: withTiming(activa.value === indice ? 1 : 0, { duration: 120 }),
  }))
  // El contorno usa los bordes reales del contenido, no un rectángulo libre
  // que promete una medida distinta de las tres que admite el mosaico.
  const bandaEstilo = useAnimatedStyle(() => ({ opacity: estirando.value === indice ? 1 : 0 }))
  const inicioResize = useSharedValue({ w: 0, h: 0, mosaico: 0, filas: 1 })
  const ultimoDestino = useSharedValue({ cols: 0, filas: 0 })

  /*
   * El arrastre, solo armando. En web agarra apenas se mueve el cursor (con
   * mouse no hay scroll que ceder); con dedo espera los 220ms de siempre.
   * Los botones de las esquinas siguen respondiendo al toque: un Pan no se
   * activa sin desplazamiento, y el asa de tamaño tiene el suyo, que como
   * gesto hijo gana.
   */
  const arrastre = (
    TECLADO_FISICO ? Gesture.Pan().minDistance(12) : Gesture.Pan().activateAfterLongPress(220)
  )
    .enabled(editando)
    .onStart(() => {
      const r = rects.value[indice]
      if (r) origen.value = r
      activa.value = indice
      dx.value = 0
      dy.value = 0
      pendiente.value = false
      runOnJS(empezar)(indice)
    })
    .onUpdate((e) => {
      dx.value = e.translationX
      dy.value = e.translationY
      if (pendiente.value) return
      /*
       * Dónde caería: la celda cuyo centro quede más cerca del centro de la
       * pieza. Distancia y no contención porque entre celdas hay huecos, y
       * soltar en un hueco tiene que caer en la vecina más cercana. Si es
       * otra que la de ahora, el orden cambia **ya**.
       */
      const o = origen.value
      const cx = o.x + o.w / 2 + e.translationX
      const cy = o.y + o.h / 2 + e.translationY
      const rs = rects.value
      let mejor = -1
      let distancia = Infinity
      for (let i = 0; i < rs.length; i++) {
        const r = rs[i]
        if (!r) continue
        const d = (r.x + r.w / 2 - cx) ** 2 + (r.y + r.h / 2 - cy) ** 2
        if (d < distancia) {
          distancia = d
          mejor = i
        }
      }
      if (mejor >= 0 && mejor !== activa.value) {
        const desde = activa.value
        activa.value = mejor
        pendiente.value = true
        runOnJS(moverA)(desde, mejor)
      }
    })
    .onEnd(() => {
      activa.value = -1
      dx.value = 0
      dy.value = 0
      runOnJS(soltar)()
    })
    .onFinalize((e) => {
      if (e.state !== State.END) {
        activa.value = -1
        dx.value = 0
        dy.value = 0
        runOnJS(cancelar)()
      }
    })

  /* Sólo se cruza a JS al cambiar de tamaño discreto. El gesto conserva su
   * base aunque la tarjeta cambie de ancho, altura o posición en el mosaico. */
  const asa = Gesture.Pan()
    .enabled(editando)
    .minDistance(4)
    .onStart(() => {
      const r = rects.value[indice]
      if (!r) return
      inicioResize.value = { w: r.w, h: r.h, mosaico: anchoMosaico.value, filas }
      ultimoDestino.value = { cols: mitad ? 1 : 2, filas }
      estirando.value = indice
      runOnJS(empezarEstirar)(indice)
    })
    .onUpdate((e) => {
      if (estirando.value !== indice) return
      const destino = objetivoResizeMosaico(inicioResize.value, e.translationX, e.translationY)
      if (destino.cols !== ultimoDestino.value.cols || destino.filas !== ultimoDestino.value.filas) {
        ultimoDestino.value = destino
        runOnJS(estirarA)(indice, destino.cols, destino.filas)
      }
    })
    .onEnd(() => {
      estirando.value = -1
      runOnJS(soltarEstirar)()
    })
    .onFinalize((e) => {
      if (e.state !== State.END) {
        estirando.value = -1
        runOnJS(cancelarEstirar)()
      }
    })
  /* eslint-enable react-hooks/immutability */

  /* Mirando: mantener apretado avisa. Los 500ms son los del sistema, y los
     10px de tolerancia le ceden el paso al scroll. */
  const apretar = onApreton ?? (() => undefined)
  const apreton = Gesture.LongPress()
    .enabled(!editando && !!onApreton)
    .minDuration(500)
    .maxDistance(10)
    .onStart(() => {
      runOnJS(apretar)()
    })

  /*
   * La pieza agarrada no anima su layout (ver arriba); las demás sí. Se lee
   * del estado de React y no del shared value porque `layout` es una prop de
   * montaje: cambia con el render, que es cuando el orden cambió.
   */
  const [agarrada, setAgarrada] = useState(false)
  useAnimatedReaction(
    () => activa.value === indice || estirando.value === indice,
    (ahora, antes) => {
      if (ahora !== antes) runOnJS(setAgarrada)(ahora)
    },
    [indice],
  )

  return (
    <Animated.View
      /* La transición se acorta a nada en vez de sacarse: cambiar la prop
         `layout` de una transición a ninguna rehace la vista en web y el
         gesto que la estaba arrastrando se pierde en el acto. */
      layout={LinearTransition.duration(agarrada ? 1 : 180).reduceMotion(ReduceMotion.System)}
      testID="celda-mosaico"
      style={{ width: mitad ? '50%' : '100%', minWidth: 0, padding: AIRE_CELDA }}
      onLayout={(e) => {
        const { x, y, width, height } = e.nativeEvent.layout
        agarre.onLayoutCelda(indice, { x, y, w: width, h: height })
      }}
      ref={(r: unknown) => {
        agarre.refs.current.set(indice, r as MedibleRef)
      }}
    >
      {/* El hueco donde va a caer: punteado, del tamaño de la celda, detrás
          de la pieza. Es el placeholder de react-grid-layout dicho en este
          sistema — sin color, solo un trazo a media luz sobre el fondo. */}
      {editando ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: AIRE_CELDA,
              right: AIRE_CELDA,
              top: AIRE_CELDA,
              bottom: AIRE_CELDA,
              borderRadius: 16,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: 'rgba(255,255,255,0.35)',
              backgroundColor: 'rgba(255,255,255,0.05)',
            },
            hueco,
          ]}
        />
      ) : null}
      <GestureDetector gesture={Gesture.Race(arrastre, apreton)}>
        <Animated.View
          style={[
            { width: '100%', minWidth: 0 },
            estilo,
            /* Armando, el texto de la pieza no se selecciona: arrastrar con el
               mouse sobre una palabra elegía el texto en vez de mover la pieza. */
            editando ? ({ userSelect: 'none' } as object) : null,
            editando && TECLADO_FISICO ? ({ cursor: 'grab' } as object) : null,
          ]}
        >
          {children}
          {editando ? (
            <>
              {/* El contorno comparte exactamente la caja de la pieza. */}
              <Animated.View
                testID="contorno-resize-mosaico"
                pointerEvents="none"
                style={[
                  {
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                    borderRadius: 16,
                    borderWidth: 1.5,
                    borderStyle: 'dashed',
                    borderColor: 'rgba(255,255,255,0.55)',
                    backgroundColor: 'rgba(255,255,255,0.06)',
                  },
                  bandaEstilo,
                ]}
              />
              <GestureDetector gesture={asa}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cambiar el tamaño"
                  accessibilityHint="Arrastrá para elegir el tamaño, o tocá para pasar al siguiente"
                  onPress={() => tocarAsa(indice)}
                  hitSlop={8}
                  style={[
                    {
                      position: 'absolute',
                      right: -4,
                      bottom: -4,
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(18,18,18,0.94)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
                    },
                    TECLADO_FISICO ? ({ cursor: 'nwse-resize' } as object) : null,
                  ]}
                >
                  <IconRedimensionar size={13} color="#FFFFFF" />
                </Pressable>
              </GestureDetector>
            </>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  )
}

/**
 * Cuántas vitrinas hay, para el resumen y para la pestaña con la que abre el
 * perfil. Se cuenta aparte, sin dibujarlas.
 *
 * `null` mientras no llegó: la pestaña por defecto es «Space» si hay piezas y
 * «Reciente» si no, y con un cero que también significara «cargando» el perfil
 * abriría siempre en «Reciente» y saltaría a «Space» medio segundo después.
 */
export function useCuantasVitrinas(ownerId: string, recarga: number): number | null {
  const [n, setN] = useState<number | null>(null)
  useEffect(() => {
    if (!ownerId) return
    let vivo = true
    listShowcases(ownerId)
      .then((v) => vivo && setN(v.length))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [ownerId, recarga])
  return n
}
