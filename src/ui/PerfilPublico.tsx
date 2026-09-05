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
import { Image, Modal, Pressable, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector, State } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { useVideoPlayer, VideoView } from 'expo-video'
import {
  anchosDe,
  countShowcases,
  esVideo,
  ilustracionUrl,
  listShowcases,
  removeShowcase,
  reorderShowcases,
  setShowcaseAncho,
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
import { estiloEncuadrado } from './Encuadre'
import { aireDelMarco, Marco } from './Marco'
import { Confirmar } from './Confirmar'
import { EMOJIS } from './Reacciones'
import { Vitrina, type Redimension } from './Vitrina'

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
}: {
  bannerPath: string | null
  /** Cómo mirar el fondo. Solo se aplica a imágenes: un clip va tal cual. */
  encuadre?: Encuadre | null
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
      </View>
    )
  }

  return (
    <View pointerEvents="none" className="absolute inset-0">
      {clip ? (
        <FondoClip uri={uri} />
      ) : (
        <FondoImagen uri={uri} encuadre={encuadre} />
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
function FondoImagen({ uri, encuadre }: { uri: string; encuadre: Encuadre | null }) {
  const [caja, setCaja] = useState<{ w: number; h: number } | null>(null)

  if (!encuadre) {
    return <Image source={{ uri }} className="h-full w-full" resizeMode="cover" />
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
        <Image
          source={{ uri }}
          resizeMode="cover"
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
function FondoClip({ uri }: { uri: string }) {
  const video = useVideoPlayer(uri, (p) => {
    p.loop = true
    p.muted = true
    p.audioMixingMode = 'mixWithOthers'
    p.play()
  })

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
  bio,
  centrado = false,
  banda = false,
  accion,
}: {
  nombre: string
  usuario: string
  avatarPath: string | null
  /** Cómo mirar la foto. `null` = centrada, que es lo de siempre. */
  encuadre?: Encuadre | null
  /** El marco dibujado alrededor. Ver `ui/Marco`. */
  marco?: string | null
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
}) {
  if (banda) {
    return (
      <View className="flex-row items-center gap-5">
        <FotoDeHeroe
          nombre={nombre}
          avatarPath={avatarPath}
          encuadre={encuadre}
          marco={marco}
          size={136}
          aireADerecha
        />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-foreground text-[32px] font-bold" numberOfLines={1}>
            {nombre}
          </Text>
          <Text className="text-muted-foreground text-[14px]">@{usuario}</Text>
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
        size={centrado ? 120 : 96}
      />
      <View className={`gap-0.5 ${centrado ? 'items-center' : ''}`}>
        <Text className="text-foreground text-[26px] font-bold" numberOfLines={1}>
          {nombre}
        </Text>
        <Text className="text-muted-foreground text-[14px]">@{usuario}</Text>
      </View>
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
}) {
  /* El +8 cuenta el anillo de 4px de cada lado. */
  const lado = size + 8
  return (
    <View style={{ overflow: 'visible', marginRight: aireADerecha && marco ? aireDelMarco(lado) : 0 }}>
      <View className="rounded-full border-4 border-background">
        <Avatar name={nombre} path={avatarPath} size={size} encuadre={encuadre} />
      </View>
      {/* Por fuera y por encima, desbordando la foto. */}
      <Marco marco={marco} size={lado} />
    </View>
  )
}

/**
 * El resumen: los números del perfil.
 *
 * Es la columna derecha de Steam, y como la de Steam **no es una tarjeta**: son
 * bloques sueltos apoyados sobre el fondo, separados por aire. Encerrarlos en un
 * rectángulo gris los volvía un ladrillo compacto contra la imagen, y la imagen
 * dejaba de tener algo encima para pasar por detrás.
 *
 * Lleva solo lo que podemos afirmar: los minutos y el artista más escuchado
 * salen del historial de reproducciones; el resto se cuenta de la biblioteca. Un
 * número inventado en un perfil es peor que un número ausente, así que lo que no
 * se sabe todavía va con una raya.
 */
export function Resumen({
  ownerId,
  listas,
  canciones,
  vitrinas,
  desde,
  sinEscucha = false,
}: {
  /** De quién son los números. Los agregados se piden por función. */
  ownerId: string
  listas: number | null
  canciones: number | null
  vitrinas: number | null
  desde: string | null
  /**
   * Sin los minutos ni el artista: solo los números de la biblioteca.
   *
   * En el teléfono la pestaña «Reciente» ya abre con esos dos (ver
   * `ResumenCorto` en `ui/PestanasPerfil`), y repetirlos al pie de la misma
   * pestaña era mostrar el mismo dato dos veces en una pantalla.
   */
  sinEscucha?: boolean
}) {
  const [stats, setStats] = useState<EstadisticasPerfil | null>(null)

  useEffect(() => {
    if (!ownerId || sinEscucha) return
    let vivo = true
    fetchStats(ownerId)
      .then((e) => vivo && setStats(e))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [ownerId, sinEscucha])

  return (
    <View className="gap-7">
      {/*
       * Los minutos van primero: es el número que más dice de alguien en una
       * app de música. Recién debajo lo que tiene guardado.
       *
       * Mientras no haya nada escuchado se muestra igual, en cero — y eso es
       * honesto: cero minutos es un dato, no un dato faltante. La raya queda
       * para cuando de verdad no sabemos.
       */}
      {sinEscucha ? null : (
        <>
          <Dato rotulo="Minutos escuchados" valor={stats?.minutos ?? null} destacado />
          {stats?.artistaTop ? (
            <Dato
              rotulo="Más escuchado"
              valor={stats.artistaTop}
              detalle={`${stats.minutosArtistaTop} min`}
            />
          ) : null}
        </>
      )}
      <Dato rotulo="Listas" valor={listas} />
      <Dato rotulo="Canciones guardadas" valor={canciones} />
      <Dato rotulo="Vitrinas" valor={vitrinas} />
      <Dato rotulo="Acá desde" valor={desde ? mesYAno(desde) : null} />
    </View>
  )
}

/**
 * Un número del resumen: el rótulo arriba, el valor grande abajo.
 *
 * **Sin tarjeta.** Estos datos se apoyan directamente sobre el fondo del perfil,
 * que es lo que hace Steam en su columna derecha: encerrarlos en un rectángulo
 * gris los volvía un bloque compacto pegado contra la imagen, y la imagen dejaba
 * de tener algo encima para pasar por detrás. Lo que los separa es el aire entre
 * uno y otro, no un borde — la misma regla de docs/DESIGN.md.
 *
 * De ahí sale la sombra del texto: sin caja detrás, la legibilidad depende de la
 * imagen que haya puesto cada uno, y una foto clara se come un texto blanco. La
 * sombra no se ve como sombra; se ve como que el texto siempre se lee.
 */
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
}: {
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
  const [vitrinas, setVitrinas] = useState<Showcase[] | null>(null)
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
    listShowcases(ownerId, parentId)
      .then((v) => vivo && setVitrinas(v))
      .catch(() => vivo && setVitrinas([]))
    return () => {
      vivo = false
    }
  }, [ownerId, parentId, recarga])

  /*
   * Lo que le dejaron a cada pieza, en un solo viaje para el mosaico entero,
   * y la pieza que tiene la fila de emojis abierta encima (con su rectángulo
   * en la ventana, para anclarla). Se piden en el perfil propio también: ahí
   * se ven, solo que no se puede reaccionar. Si fallan no se dibuja ninguna,
   * que es lo mismo que si no hubiera — un perfil no se rompe por sus chips.
   */
  const [reacciones, setReacciones] = useState<Map<string, ReaccionesVitrina>>(() => new Map())
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
   * El agarre: lo que las celdas comparten para arrastrarse.
   *
   * Los valores del gesto viven en shared values —decenas de eventos por
   * segundo, un render por cada uno mataría la lista— y las medidas de las
   * celdas en refs: se toman **al empezar cada arrastre** con
   * `measureInWindow`, así el scroll previo no las deja viejas.
   */
  const activa = useSharedValue(-1)
  const dx = useSharedValue(0)
  const dy = useSharedValue(0)
  const refs = useRef(new Map<number, MedibleRef>())
  const rects = useRef(new Map<number, Rect>())

  const medir = useCallback(() => {
    rects.current.clear()
    refs.current.forEach((ref, i) => {
      ref?.measureInWindow?.((x, y, w, h) => rects.current.set(i, { x, y, w, h }))
    })
  }, [])

  /*
   * Dónde cayó: la celda cuyo centro quede más cerca del centro de la
   * arrastrada. Distancia y no contención porque entre celdas hay huecos de
   * grilla, y soltar en un hueco tiene que caer en la vecina más cercana, no
   * en la nada.
   */
  function soltar(desde: number, tx: number, ty: number) {
    // El gesto y el orden se actualizan juntos, sin volver primero al origen.
    activa.value = -1
    dx.value = 0
    dy.value = 0
    const propio = rects.current.get(desde)
    if (!propio) {
      onArrastre?.(false)
      return
    }
    const cx = propio.x + propio.w / 2 + tx
    const cy = propio.y + propio.h / 2 + ty
    let mejor = desde
    let distancia = Infinity
    rects.current.forEach((r, i) => {
      const d = (r.x + r.w / 2 - cx) ** 2 + (r.y + r.h / 2 - cy) ** 2
      if (d < distancia) {
        distancia = d
        mejor = i
      }
    })
    if (mejor !== desde) mover(desde, mejor)
    onArrastre?.(false)
  }

  function empezarArrastre() {
    medir()
    onArrastre?.(true)
  }

  const cancelarArrastre = () => onArrastre?.(false)

  const agarre: Agarre = {
    activa,
    dx,
    dy,
    refs,
    empezar: empezarArrastre,
    soltar,
    cancelar: cancelarArrastre,
  }

  if (vitrinas === null) return null
  if (!vitrinas.length) return <>{vacio}</>

  /*
   * Mover una es reescribir el orden de todas.
   *
   * Las posiciones son relativas entre sí, así que subir la tercera cambia
   * también el lugar de la segunda. Se manda la lista entera y no la que se
   * movió — es lo que espera `reorderShowcases`.
   *
   * Se reordena en pantalla al toque y se guarda después: esperar la respuesta
   * del servidor para mover una tarjeta hace que el botón se sienta roto.
   */
  function mover(desde: number, hacia: number) {
    if (!vitrinas || hacia < 0 || hacia >= vitrinas.length) return
    const proximo = [...vitrinas]
    const [sacada] = proximo.splice(desde, 1)
    proximo.splice(hacia, 0, sacada)
    setVitrinas(proximo)
    reorderShowcases(proximo.map((v) => v.id)).catch((e: unknown) => {
      /* Se vuelve a leer para que la pantalla no quede mostrando un orden que
         el servidor no aceptó. */
      onCambio()
      avisar(mensajeError(e), true)
    })
  }

  /**
   * Cambiar cuánto ocupa una: en pantalla al toque, en el servidor después.
   *
   * Igual que reordenar, y por lo mismo: esperar la respuesta para que la
   * tarjeta cambie de tamaño hace que el botón se sienta roto.
   */
  function cambiarAncho(id: string, ancho: ShowcaseAncho) {
    if (!vitrinas) return
    setVitrinas(vitrinas.map((v) => (v.id === id ? { ...v, ancho } : v)))
    setShowcaseAncho(id, ancho).catch((e: unknown) => {
      onCambio()
      avisar(mensajeError(e), true)
    })
  }

  /**
   * La manija se arrastró: hacia la derecha ensancha, hacia abajo agranda,
   * y en sentido contrario achica. Un paso por arrastre, dentro de lo que el
   * tipo admite —un encabezado no tiene «grande»—; si no hay a dónde ir, no
   * pasa nada.
   */
  function redimensionar(v: Showcase, direccion: Redimension) {
    const anchos = anchosDe(v.kind)
    const i = anchos.indexOf(v.ancho)
    const crece = direccion === 'ancho' || direccion === 'alto'
    const siguiente = anchos[i + (crece ? 1 : -1)]
    if (siguiente && siguiente !== v.ancho) cambiarAncho(v.id, siguiente)
  }

  function sacar(v: Showcase) {
    setPorSacar(null)
    removeShowcase(v.id)
      .then(onCambio)
      .catch((e: unknown) => avisar(mensajeError(e), true))
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
        ? 'Esta pieza se va del mosaico, y la pieza que tiene adentro se va con ella. No se deshace.'
        : `Esta pieza se va del mosaico, y las ${porSacar.hijas} piezas que tiene adentro se van con ella. No se deshace.`
      : 'Esta pieza se va del mosaico. Se puede volver a agregar, pero no se deshace.'

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
    })
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
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
      {vitrinas.map((v, i) => (
        <CeldaDeMosaico
          key={v.id}
          indice={i}
          mitad={v.ancho === 'mitad'}
          agarre={agarre}
          editando={editando}
          onApreton={apretonDe(v, i)}
        >
          <Vitrina
            showcase={v}
            temaGlobal={temaGlobal}
            playlists={listas}
            esMio={esMio}
            reacciones={reacciones.get(v.id) ?? null}
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
            onOpenPlaylist={() => undefined}
            onAbrirSubspace={editando ? undefined : onAbrirSubspace}
            recarga={recarga}
            editando={editando}
            onRemove={editando ? () => pedirSacar(v) : undefined}
            onEditar={editando ? onEditar : undefined}
            onRedimensionar={editando ? (d) => redimensionar(v, d) : undefined}
            onAncho={
              editando ? () => cambiarAncho(v.id, siguienteAncho(v.ancho, v.kind)) : undefined
            }
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

  let top: number
  let left: number
  if (rect) {
    const arriba = rect.y - FILA_ALTO - FILA_AIRE >= FILA_AIRE
    top = arriba ? rect.y - FILA_ALTO - FILA_AIRE : rect.y + rect.h + FILA_AIRE
    left = rect.x + rect.w / 2 - FILA_ANCHO / 2
  } else {
    top = height / 2 - FILA_ALTO / 2
    left = width / 2 - FILA_ANCHO / 2
  }
  left = Math.max(FILA_AIRE, Math.min(left, width - FILA_ANCHO - FILA_AIRE))
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
            style={{ width: FILA_ANCHO, height: FILA_ALTO, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
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
                    style={{ width: EMOJI_LADO, height: EMOJI_LADO }}
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

/** Lo que las celdas comparten para arrastrarse. Lo arma `Vitrinas`. */
type Agarre = {
  activa: SharedValue<number>
  dx: SharedValue<number>
  dy: SharedValue<number>
  refs: MutableRefObject<Map<number, MedibleRef>>
  empezar: () => void
  soltar: (desde: number, tx: number, ty: number) => void
  cancelar: () => void
}

/**
 * Una celda del mosaico que sabe seguir al dedo.
 *
 * La física es la de la cola (`EncoladaArrastrable`), adaptada a dos
 * dimensiones: la celda agarrada sigue al puntero apenas agrandada y por
 * encima, y las demás **se apagan un poco** en vez de correrse — con alturas
 * variables y filas de a dos, la corrida en vivo miente más de lo que ayuda, y
 * el reacomodo real se ve al soltar, animado por el re-render.
 *
 * Armando, **la tarjeta entera es la manija**: antes había un ícono de tres
 * líneas en la esquina, y era el único lugar de donde se podía tirar. Con el
 * contenido quieto (ver `Vitrina`), no hay toques que robar, y agarrar la
 * pieza de donde sea es lo que uno espera de un mosaico. Y tiembla apenas, como
 * los widgets del iPhone: es lo que dice «ahora se mueven».
 *
 * Mirando, la misma celda escucha el apretón largo: en el perfil propio entra
 * a armar, en el ajeno abre la fila de emojis. La celda no sabe cuál de las
 * dos es — solo avisa, y `Vitrinas` decide.
 */
function CeldaDeMosaico({
  indice,
  mitad,
  agarre,
  editando,
  onApreton,
  children,
}: {
  indice: number
  mitad: boolean
  agarre: Agarre
  editando: boolean
  /** Se mantuvo apretada, mirando. */
  onApreton?: () => void
  children: ReactNode
}) {
  /* eslint-disable react-hooks/immutability -- escribir `.value` es la API
     imperativa de un SharedValue; es el mismo gesto que `EncoladaArrastrable`
     en la cola, que el analizador acepta con otra forma de llegar al valor. */
  const estilo = useAnimatedStyle(() => {
    if (agarre.activa.value === indice) {
      return {
        transform: [
          { translateX: agarre.dx.value },
          { translateY: agarre.dy.value },
          { scale: 1.012 },
          { rotate: '0deg' },
        ],
        zIndex: 20,
        opacity: 1,
      }
    }
    return {
      transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }],
      zIndex: 0,
      opacity: withTiming(agarre.activa.value >= 0 ? 0.9 : 1, { duration: 160 }),
    }
  })

  const { activa, dx, dy, empezar, soltar, cancelar } = agarre

  /*
   * El arrastre, solo armando. En web agarra apenas se mueve el cursor (con
   * mouse no hay scroll que ceder); con dedo espera los 130ms de siempre.
   * Los botones de las esquinas siguen respondiendo al toque: un Pan no se
   * activa sin desplazamiento, y la manija de tamaño tiene el suyo, que
   * arranca antes y gana.
   */
  const arrastre = (
    TECLADO_FISICO ? Gesture.Pan().minDistance(12) : Gesture.Pan().activateAfterLongPress(220)
  )
    .enabled(editando)
    .onStart(() => {
      activa.value = indice
      dx.value = 0
      dy.value = 0
      runOnJS(empezar)()
    })
    .onUpdate((e) => {
      dx.value = e.translationX
      dy.value = e.translationY
    })
    .onEnd((e) => {
      runOnJS(soltar)(indice, e.translationX, e.translationY)
    })
    .onFinalize((e) => {
      if (e.state !== State.END) {
        activa.value = -1
        dx.value = 0
        dy.value = 0
        runOnJS(cancelar)()
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

  return (
    <Animated.View
      layout={LinearTransition.duration(180).reduceMotion(ReduceMotion.System)}
      style={{ width: mitad ? '50%' : '100%', padding: 6 }}
      ref={(r: unknown) => {
        agarre.refs.current.set(indice, r as MedibleRef)
      }}
    >
      <GestureDetector gesture={Gesture.Race(arrastre, apreton)}>
        <Animated.View
          style={[estilo, editando && TECLADO_FISICO ? ({ cursor: 'grab' } as object) : null]}
        >
          {children}
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
