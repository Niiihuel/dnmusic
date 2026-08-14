import { useEffect, useState, type ReactNode } from 'react'
import { Image, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { artworkSource } from '../lib/artwork'
import {
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
import { Glass, HAY_VIDRIO } from './Glass'
import { Vitrina } from './Vitrina'

/**
 * El fondo del perfil, a sangre.
 *
 * Es lo que Steam pone detrás de todo, y acá cumple una función extra: es la
 * **única pantalla de la app donde el vidrio tiene una foto que difuminar**. En
 * el resto lo que pasa por detrás son listas sobre gris; acá hay una imagen, y
 * el material recién ahí se ve como lo que es.
 *
 * La imagen sale de una carátula, no de un selector de color. `docs/DESIGN.md`
 * reserva el color para las tapas y deja la interfaz en grises: personalizás con
 * la música que mostrás.
 *
 * El velo va en dos tramos y **no llega a opaco arriba**: si tapara del todo,
 * las vitrinas de vidrio quedarían difuminando un gris plano —el mismo error que
 * cometimos con el degradado detrás de las pestañas— y el fondo dejaría de
 * servir para lo único que lo justifica.
 */
export function FondoPerfil({ bannerPath }: { bannerPath: string | null }) {
  /*
   * Dos clases de fondo, distinguidas por la forma de la ruta.
   *
   * Las tapas viven en el bucket `artwork`, planas (`<videoId>.jpg`); las
   * ilustraciones subidas viven en `showcases`, bajo la carpeta de su dueño
   * (`<uid>/<ts>.png`) — la barra dice cuál es. Y se dibujan distinto a
   * propósito: la tapa va desenfocada porque es un cuadrado chico estirado a
   * banda —nítida se pixela—; la ilustración va **nítida**, que es el punto de
   * haberla subido: es el fondo de Steam, elegido pixel por pixel.
   */
  const esIlustracion = bannerPath?.includes('/') ?? false
  const tapa = bannerPath
    ? esIlustracion
      ? ilustracionUrl(bannerPath)
      : artworkSource(bannerPath, '', 640)
    : null

  /*
   * Sin tapa, la banda se dibuja igual.
   *
   * Antes esto devolvía `null`, y el resultado era que un perfil recién hecho
   * —que es justo el que nadie eligió todavía cómo se ve— no tenía encabezado en
   * absoluto: el nombre quedaba flotando contra el negro del panel, y en
   * escritorio eso deja la mitad de arriba de la pantalla muerta.
   *
   * El reemplazo es un escalón de luminancia, no un color: `muted` bajando a
   * `background`, que es la misma separación que usa el resto de la app. Da la
   * banda que ordena el encabezado sin inventar un tono que `docs/DESIGN.md`
   * reserva para las tapas.
   */
  if (!tapa) {
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
    <View pointerEvents="none" className="absolute inset-x-0 top-0 h-[420px]">
      <Image
        source={{ uri: tapa }}
        className="h-full w-full"
        resizeMode="cover"
        blurRadius={esIlustracion ? 0 : 18}
      />
      {/*
       * Dos capas: una pareja que baja el brillo general para que el texto se
       * lea sobre cualquier tapa, y un degradado que funde el borde de abajo
       * con el fondo de la app para que no se vea dónde termina la foto.
       */}
      <View className="absolute inset-0" style={{ backgroundColor: 'rgba(18,18,18,0.45)' }} />
      <LinearGradient
        colors={['rgba(18,18,18,0.25)', 'rgba(18,18,18,0.8)', 'rgb(18,18,18)']}
        locations={[0, 0.55, 1]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 260 }}
      />
    </View>
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
 * Es la columna derecha de Steam. Hoy lleva **solo lo que podemos afirmar**:
 * cuántas listas, cuántas canciones guardadas, cuántas vitrinas y desde cuándo
 * existe la cuenta. Nada de minutos escuchados ni de artista favorito — para eso
 * hace falta un historial de reproducciones que todavía no llevamos, y un número
 * inventado en un perfil es peor que un número ausente.
 *
 * La forma sí está pensada para lo que viene: cada dato es una fila de rótulo y
 * valor, así que sumar «minutos escuchados» el día que exista es agregar una.
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
    <Glass radius={16} style={HAY_VIDRIO ? {} : { backgroundColor: 'rgb(24,24,24)' }}>
      <View className="gap-3 p-4">
        <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
          Resumen
        </Text>
        {/*
         * Los minutos van primero: es el número que más dice de alguien en una
         * app de música. Recién debajo lo que tiene guardado.
         *
         * Mientras no haya nada escuchado se muestra igual, en cero — y eso es
         * honesto: cero minutos es un dato, no un dato faltante. La raya queda
         * para cuando de verdad no sabemos.
         */}
        <Dato rotulo="Minutos escuchados" valor={stats?.minutos ?? null} />
        {stats?.artistaTop ? (
          <Dato
            rotulo="Más escuchado"
            valor={`${stats.artistaTop} · ${stats.minutosArtistaTop} min`}
          />
        ) : null}
        <Dato rotulo="Listas" valor={listas} />
        <Dato rotulo="Canciones guardadas" valor={canciones} />
        <Dato rotulo="Vitrinas" valor={vitrinas} />
        <Dato rotulo="Acá desde" valor={desde ? mesYAno(desde) : null} />
      </View>
    </Glass>
  )
}

function Dato({ rotulo, valor }: { rotulo: string; valor: number | string | null }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text className="text-muted-foreground text-[14px]">{rotulo}</Text>
      {/* Mientras no se sabe va una raya y no un cero: cero es un dato, «no lo
          sé todavía» es otra cosa. */}
      <Text className="text-foreground text-[17px] font-semibold tabular-nums">
        {valor === null ? '—' : valor}
      </Text>
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
          /*
           * Escuchar puede fallar —la URL del audio se firma en el momento— y
           * sin capturarlo quedaba una promesa rechazada suelta: en el teléfono
           * eso es un recuadro rojo a pantalla completa por no poder reproducir
           * una tarjeta. Se avisa y se sigue.
           */
          onTogglePlay={(id, song) => {
            player.toggle(id, song).catch((e: unknown) => avisar(mensajeError(e), true))
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
