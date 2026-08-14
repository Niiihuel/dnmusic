import { useEffect, useState, type ReactNode } from 'react'
import { Image, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useVideoPlayer, VideoView } from 'expo-video'
import {
  esVideo,
  ilustracionUrl,
  listShowcases,
  removeShowcase,
  reorderShowcases,
  type Showcase,
} from '../services/showcases'
import { listPlaylists, type Playlist } from '../services/playlists'
import { useSnippetPlayer } from '../state/player'
import { avisar } from '../state/aviso'
import { mensajeError } from '../lib/mensajeError'
import { fetchStats, type EstadisticasPerfil } from '../services/plays'
import { Avatar } from './Avatar'
import { Vitrina } from './Vitrina'

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
export function FondoPerfil({ bannerPath }: { bannerPath: string | null }) {
  /*
   * Solo cuentan las rutas con carpeta (`<uid>/<ts>.gif`), que son las imágenes
   * subidas. Las planas (`<videoId>.jpg`) son tapas de canción de cuando el
   * fondo se elegía así; se ignoran en vez de dibujarse mal.
   */
  const ruta = bannerPath?.includes('/') ? bannerPath : null
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
        <Image source={{ uri }} className="h-full w-full" resizeMode="cover" />
      )}

      {/*
       * El velo: un paño parejo que baja el brillo general —el texto tiene que
       * leerse sobre cualquier imagen, incluida una blanca— y dos degradados que
       * cierran arriba y abajo contra el fondo de la app.
       *
       * Ninguna de las tres capas llega a opaca. Si tapara del todo, las
       * vitrinas de vidrio quedarían difuminando un gris plano y el fondo
       * dejaría de servir para lo único que lo justifica.
       */}
      <View className="absolute inset-0" style={{ backgroundColor: 'rgba(18,18,18,0.62)' }} />
      <LinearGradient
        colors={['rgba(18,18,18,0.65)', 'rgba(18,18,18,0)']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 200 }}
      />
      <LinearGradient
        colors={['rgba(18,18,18,0)', 'rgba(18,18,18,0.75)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 220 }}
      />
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
  bio,
  centrado = false,
  banda = false,
  accion,
}: {
  nombre: string
  usuario: string
  avatarPath: string | null
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
        <Avatar name={nombre} path={avatarPath} size={112} />
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
      <Avatar name={nombre} path={avatarPath} size={centrado ? 96 : 84} />
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
}: {
  /** De quién son los números. Los agregados se piden por función. */
  ownerId: string
  listas: number | null
  canciones: number | null
  vitrinas: number
  desde: string | null
}) {
  const [stats, setStats] = useState<EstadisticasPerfil | null>(null)

  useEffect(() => {
    if (!ownerId) return
    let vivo = true
    fetchStats(ownerId)
      .then((e) => vivo && setStats(e))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [ownerId])

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
      <Dato rotulo="Minutos escuchados" valor={stats?.minutos ?? null} destacado />
      {stats?.artistaTop ? (
        <Dato
          rotulo="Más escuchado"
          valor={stats.artistaTop}
          detalle={`${stats.minutosArtistaTop} min`}
        />
      ) : null}
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
function Dato({
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
 */
export function Vitrinas({
  ownerId,
  recarga,
  onCambio,
  vacio,
  /** Solo en el perfil propio: sin esto no aparece la cruz de sacar. */
  propio = true,
}: {
  ownerId: string
  recarga: number
  onCambio: () => void
  /** Qué mostrar cuando no hay ninguna. */
  vacio?: ReactNode
  propio?: boolean
}) {
  const [vitrinas, setVitrinas] = useState<Showcase[] | null>(null)
  const [listas, setListas] = useState<Playlist[] | null>(null)
  const player = useSnippetPlayer()

  useEffect(() => {
    let vivo = true
    listShowcases(ownerId)
      .then((v) => vivo && setVitrinas(v))
      .catch(() => vivo && setVitrinas([]))
    return () => {
      vivo = false
    }
  }, [ownerId, recarga])

  /* Las listas se piden solo si alguna vitrina las necesita: la mayoría de los
     perfiles no va a tener una y sería una consulta al pedo. */
  const necesitaListas = (vitrinas ?? []).some((v) => v.kind === 'lista')
  useEffect(() => {
    if (!necesitaListas || listas !== null) return
    let vivo = true
    listPlaylists()
      .then((l) => vivo && setListas(l))
      .catch(() => vivo && setListas([]))
    return () => {
      vivo = false
    }
  }, [necesitaListas, listas])

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

  return (
    <View className="gap-3">
      {vitrinas.map((v, i) => (
        <Vitrina
          key={v.id}
          showcase={v}
          playlists={listas}
          playing={player.currentId === v.id && player.playing}
          sonando={player.currentId === v.id}
          posicionMs={player.posicionSV}
          transcurridoMs={player.positionMs}
          /*
           * Escuchar puede fallar —la URL del audio se firma en el momento— y
           * sin capturarlo quedaba una promesa rechazada suelta: en el teléfono
           * eso es un recuadro rojo a pantalla completa por no poder reproducir
           * una tarjeta. Se avisa y se sigue.
           */
          onTogglePlay={(id, song) => {
            player.toggle(id, song).catch((e: unknown) => avisar(mensajeError(e), true))
          }}
          onSeek={(id, song, fraccion) => {
            player.seek(id, song, fraccion).catch((e: unknown) => avisar(mensajeError(e), true))
          }}
          onOpenPlaylist={() => undefined}
          onRemove={
            propio
              ? (id) => {
                  removeShowcase(id)
                    .then(onCambio)
                    .catch((e: unknown) => avisar(mensajeError(e), true))
                }
              : undefined
          }
          /* En las puntas la flecha existe pero apagada: si desapareciera, los
             botones se correrían de lugar al mover una tarjeta. */
          onSubir={propio ? (i > 0 ? () => mover(i, i - 1) : null) : undefined}
          onBajar={propio ? (i < vitrinas.length - 1 ? () => mover(i, i + 1) : null) : undefined}
        />
      ))}
    </View>
  )
}

/** Cuántas vitrinas hay, para el resumen. Se cuenta aparte, sin dibujarlas. */
export function useCuantasVitrinas(ownerId: string, recarga: number) {
  const [n, setN] = useState(0)
  useEffect(() => {
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
