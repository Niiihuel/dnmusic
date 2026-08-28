import { useState } from 'react'
import { useRouter } from 'expo-router'
import Animated, { useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated'
import { ActivityIndicator, Image, Pressable, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { artworkSource } from '../lib/artwork'
import { useColapsada, useTabsVisible } from '../state/shell'
import {
  canOpenPlaylist,
  posicionSV,
  openSoundingPlaylist,
  playNext,
  playPrevious,
  seekFraction,
  seekToMs,
  toggleShuffle,
  setVolume,
  stopPlayback,
  togglePlayback,
  toggleView,
  useHaySiguiente,
  usePlaybackState,
} from '../state/playback'
import { crearJamActual, salirDelJam, useCuantosJam, useJamActivo } from '../state/jam'
import { abrirSelectorDispositivos, useEscuchaEspejoNombre } from '../state/escucha'
import { BORDE_REFERENTE, ES_WEB, Glass, HAY_VIDRIO } from './Glass'
import { useConTooltip } from './Tooltip'
import { useClicDerecho } from './useClicDerecho'
import { compartirHistoria } from './CompartirHistoria'
import { Menu, type MenuItem } from './Menu'
import { SeekBar, formatClock } from './SeekBar'
import { BotonAleatorio, BotonRepetir } from './Transport'
import { BotonMeGusta } from './BotonMeGusta'
import {
  ICON_COLOR,
  IconClose,
  IconMusic,
  IconNext,
  IconDispositivo,
  IconPause,
  IconPlay,
  IconPrevious,
  IconRepeat,
  IconShare,
  IconShuffle,
  IconCola,
  IconDisc,
  IconLyrics,
  IconUsers,
  IconVolume,
  IconVolumeOff,
} from './icons'

/** Debajo de este ancho la barra se queda con lo esencial. */
const WIDE_PX = 720
/**
 * Desde este ancho existe el panel derecho (el `DETAIL_PX` de `app/index.tsx`;
 * si cambia allá tiene que cambiar acá). Con panel, el Jam se abre ahí como
 * una cara más —al modo del panel de Spotify—; sin panel sigue siendo la
 * pantalla modal de siempre.
 *
 * Se exporta porque la puerta del link (`app/jam/[code].tsx`) tiene que tomar
 * exactamente la misma decisión al terminar de entrar: con panel, el Jam se
 * abre ahí; sin panel, en su pantalla.
 */
export const PANEL_PX = 1120

/**
 * La barra de abajo: qué suena, y los controles.
 *
 * Es **solo la cara**. Quien toca el audio es `MotorAudio`, que se monta aparte
 * y una sola vez en `app/_layout.tsx`; acá no queda un solo hook del
 * reproductor.
 *
 * Esa separación no es orden por el orden: esta barra se dibuja en cuatro
 * formas según dónde estés, y el layout las tiene como cuatro ramas de un
 * ternario. Cambiar de rama la remonta —React no conserva un componente que
 * cambia de lugar en el árbol—, y mientras el reproductor viajaba adentro, cada
 * remonte lo liberaba y la canción arrancaba de cero. Ahora remontarse no
 * cuesta nada: lo único que se pierde es lo que se estaba dibujando.
 *
 * El estado vive en `state/playback`, que es de donde lee todo lo que muestra.
 */
/**
 * La línea de estado de la barra: quién canta, un error, o —lo nuevo— en qué
 * aparato está sonando.
 *
 * Cuando la escucha vive en otro dispositivo de la cuenta, en vez de un
 * subtítulo gris fácil de pasar por alto va un aviso con el ícono de un
 * dispositivo y el texto en blanco: se lee como lo que es —esto suena en otro
 * lado— sin robar protagonismo, al modo de la barrita de Spotify Connect. Para
 * traerla acá alcanza con tocar el play, que ya dispara el traspaso.
 *
 * Es una función y no un componente para poder devolver un `Text` o una fila
 * con ícono según el caso, y caer justo donde antes iba el subtítulo.
 */
function lineaEstado({
  espejoEn,
  error,
  artist,
}: {
  espejoEn: string | null
  error: string | null
  artist: string
}) {
  if (error) {
    return (
      <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
        {error}
      </Text>
    )
  }
  if (espejoEn) {
    return (
      <View className="flex-row items-center gap-1">
        <IconDispositivo size={12} color={ICON_COLOR.foreground} />
        <Text className="text-foreground text-[11px]" numberOfLines={1}>
          Sonando en «{espejoEn}»
        </Text>
      </View>
    )
  }
  return (
    <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
      {artist}
    </Text>
  )
}

export function NowPlayingBar({
  oculto = false,
  compacta = false,
}: {
  oculto?: boolean
  /** Dentro de la fila plegada: sin márgenes propios, ocupando lo que le den. */
  compacta?: boolean
}) {
  const {
    tracks,
    index,
    manual,
    wantPlay,
    positionMs,
    durationMs,
    volume,
    cargada,
    shuffle,
    view,
    error,
  } = usePlaybackState()
  const insets = useSafeAreaInsets()
  const conTabs = useTabsVisible()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const wide = width >= WIDE_PX
  const enJam = useJamActivo()
  const cuantosJam = useCuantosJam()
  /*
   * El espejo de la escucha: lo que se ve está sonando en otro aparato de la
   * cuenta. El rótulo va donde iba el artista —el mismo lugar que ya usa el
   * error— porque es la línea que dice el **estado** de lo que suena, y
   * «Sonando en tu computadora» es exactamente eso.
   */
  const espejoEn = useEscuchaEspejoNombre()
  /*
   * La píldora de escritorio se corre del camino cuando estás recorriendo.
   *
   * `colapsada` es el mismo estado que pliega la cáscara en el teléfono —lo
   * escribe `useColapso` desde las listas, que son las mismas de los dos
   * lados—: bajando se pliega, subiendo vuelve. Acá no había nadie
   * escuchándolo, así que la barra tapaba el pie de los paneles laterales
   * mientras se leía una lista larga.
   *
   * Con el puntero encima vuelve entera, sin esperar a que subas: acercarse a
   * la barra **es** querer usarla. Por eso el estado local del hover.
   */
  const colapsada = useColapsada()
  const [sobre, setSobre] = useState(false)
  /* Click derecho sobre el reproductor: las mismas opciones que los tres
     puntos, que acá son el conjunto más rico de la app (Jam, la cola, en qué
     aparato suena). Es lo que hacen los reproductores de escritorio. */
  const clicBarra = useClicDerecho()

  // Lo encolado a mano manda sobre la lista mientras dure.
  const current = manual ?? (index >= 0 ? (tracks[index] ?? null) : null)
  /* «Siguiente» se apaga solo si de verdad no hay a dónde ir: la cola manual,
     el repetir y el relleno de recomendaciones cuentan — antes se miraba solo
     la lista, y el botón moría en la última canción con la tanda esperando. */
  const last = !useHaySiguiente()
  const artwork = current ? artworkSource(current.artworkPath, current.artworkUrl, 96) : null
  /*
   * Suena de verdad: hay intención **y** hay audio cargado.
   *
   * Antes esto se sabía acá mismo, porque la barra tenía la URL firmada a mano.
   * Ahora la firma es cosa de `MotorAudio`, que avisa por `cargada`. Con
   * `wantPlay` solo, una firma que falla dejaría el botón mostrando «pausar»
   * sobre algo que nunca arrancó.
   */
  const playing = wantPlay && cargada
  /*
   * Quiere sonar pero el audio todavía no está: se está resolviendo.
   *
   * La primera vez que se toca una canción tarda unos segundos —el servidor la
   * baja de YouTube y la deja cacheada— y sin señal el botón se queda en «play»
   * como si el toque no hubiera hecho nada. El spinner ocupa el mismo lugar que
   * el ícono, así que el transporte no salta de tamaño al empezar a sonar.
   */
  const cargando = wantPlay && !cargada

  /* Sin nada cargado no se dibuja, y oculto tampoco. Salir acá ya no tiene
     ninguna consecuencia sobre el audio: eso vive en `MotorAudio`, que sigue
     sonando mire lo que mire esta barra. */
  if (!current || oculto) return null

  const progress = durationMs > 0 ? Math.max(0, Math.min(1, positionMs / durationMs)) : 0

  /*
   * Reemplaza a la cruz que había acá.
   *
   * Una cruz solo puede cerrar, y sobre lo que suena hay varias cosas
   * razonables que querer: ver de dónde salió, saltearla, empezarla de nuevo.
   * Cerrar sigue estando, al final y separado del resto.
   */
  const menu: MenuItem[] = [
    /*
     * El Jam va primero: es la única entrada que cambia **quiénes** escuchan,
     * y con uno abierto dice cuántos son — que es lo que uno quiere saber sin
     * abrir nada.
     */
    {
      /*
       * La fila dice lo que va a pasar: sin Jam **lo crea** —«Ver el Jam»
       * ofrecía mirar algo que no existía— y con uno abierto lo muestra, con
       * cuántos son. Es el mismo par de estados de la píldora del reproductor
       * del teléfono.
       */
      label: enJam
        ? `Ver el Jam · ${cuantosJam} ${cuantosJam === 1 ? 'persona' : 'personas'}`
        : 'Crear un Jam',
      /* Con panel, el Jam se abre ahí al lado; sin panel, en su pantalla. */
      onPress: () => {
        const abrir = () => {
          if (width >= PANEL_PX) toggleView('jam')
          else router.push('/jam')
        }
        if (enJam) {
          abrir()
          return
        }
        void crearJamActual().then((ok) => {
          if (ok) abrir()
        })
      },
      icon: <IconUsers size={15} color={enJam ? ICON_COLOR.foreground : ICON_COLOR.muted} />,
      sfSymbol: 'person.2',
    },
    {
      label: 'Ver la lista',
      onPress: openSoundingPlaylist,
      disabled: !canOpenPlaylist(),
      icon: <IconMusic size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'music.note.list',
    },
    {
      label: 'Ver la cola',
      /* Como el Jam: con panel al lado, la cola se abre ahí — un drawer es un
         gesto de teléfono, no de una ventana grande. Sin panel, su pantalla. */
      onPress: () => {
        if (width >= PANEL_PX) toggleView('cola')
        else router.push('/cola')
      },
      icon: <IconCola size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'list.bullet',
    },
    {
      // Spotify Connect: mover la música entre los aparatos de la cuenta. El
      // selector lo dibuja `SelectorDispositivos`, montado en el layout.
      label: 'Escuchar en…',
      onPress: abrirSelectorDispositivos,
      icon: <IconDispositivo size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'laptopcomputer.and.iphone',
    },
    /*
     * El aleatorio, **solo en el teléfono**.
     *
     * En escritorio es un botón de verdad al lado del play —ver más abajo—, así
     * que acá sería el mismo control dos veces en la misma barra. En el teléfono
     * no hay dónde ponerlo: la tarjeta tiene lugar para la tapa, el título y
     * pausa/siguiente y nada más, y un cuarto ícono la vuelve una fila de
     * controles del ancho de la pantalla. Ahí el botón vive en la pantalla
     * completa de «Sonando», y esto queda como atajo para no tener que abrirla.
     */
    ...(wide
      ? []
      : [
          {
            label: shuffle ? 'Aleatorio: activado' : 'Aleatorio',
            onPress: toggleShuffle,
            icon: (
              <IconShuffle size={15} color={shuffle ? ICON_COLOR.foreground : ICON_COLOR.muted} />
            ),
            sfSymbol: 'shuffle' as const,
          },
        ]),
    {
      label: 'Volver a empezar',
      onPress: () => seekToMs(0),
      icon: <IconRepeat size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'arrow.counterclockwise',
    },
    {
      label: 'Siguiente canción',
      onPress: playNext,
      disabled: last,
      icon: <IconNext size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'forward.end',
    },
    /* La tarjeta 1080×1920 de lo que suena: en el teléfono abre la hoja de
       compartir (Instagram ofrece «Agregar a tu historia»); en la web se
       descarga el PNG. Ver `CompartirHistoria`. */
    {
      label: 'Compartir en una historia',
      onPress: () => compartirHistoria(current),
      icon: <IconShare size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'square.and.arrow.up',
    },
    /* En un Jam, «cerrar» es irse de él: cerrar solo el reproductor dejaría
       la membresía viva y la cola volvería sola con el próximo evento. */
    enJam
      ? {
          label: 'Salir del Jam',
          onPress: salirDelJam,
          destructive: true,
          icon: <IconClose size={15} color={ICON_COLOR.muted} />,
          sfSymbol: 'xmark',
        }
      : {
          label: 'Cerrar el reproductor',
          onPress: stopPlayback,
          destructive: true,
          icon: <IconClose size={15} color={ICON_COLOR.muted} />,
          sfSymbol: 'xmark',
        },
  ]

  /*
   * En el teléfono, el reproductor es una **tarjeta** y no una barra.
   *
   * Se decide por el ancho y no por si hay pestañas: en el composer o en el
   * editor de fragmento no hay barra de pestañas, y con la otra condición el
   * teléfono recibía ahí la barra de escritorio, apretada y con controles que
   * no entran.
   *
   * Flota justo encima de las pestañas, con lo mínimo: la tapa, qué suena y
   * pausa/siguiente. Es la forma de Apple Music y de Spotify, y la razón es de
   * espacio: en 390px una barra de borde a borde con posición, volumen y vistas
   * no entra sin encoger todo hasta lo intocable.
   *
   * Lo que no cabe acá —la barra de posición, la letra, el disco, la cola— es
   * lo que va en la pantalla completa de «Sonando», que se abre desde acá.
   */
  if (!wide) {
    /*
     * Plegada, los márgenes los pone la fila que la contiene: acá adentro
     * sumaría los suyos y la tarjeta quedaría más angosta que los redondeles de
     * los costados, desalineada con ellos.
     */
    return (
      <View
        /* 22px y no 12: pegada al borde, la tarjeta se leía cortada contra la
           curva de la pantalla del teléfono. Es el mismo aire que le da la
           cáscara cuando la envuelve ella (ver RESPIRO_GRANDE en Cascara). */
        className={compacta ? '' : `px-[22px] ${conTabs ? 'pb-2' : ''}`}
        style={compacta || conTabs ? undefined : { paddingBottom: 8 + insets.bottom }}
      >
        <Glass
          radius={compacta ? 26 : 18}
          style={{ boxShadow: '0 6px 20px rgba(0,0,0,0.45)' }}
        >
        {/*
         * La fila es un View y **el área que abre «Sonando» es solo la mitad
         * de la izquierda** —la tapa y los títulos—, no la tarjeta entera.
         *
         * Antes el Pressable envolvía también a pausa y siguiente, y en web
         * eso es un `<button>` con botones adentro: HTML inválido, que React
         * marca en dev y que confunde a un lector de pantalla — un botón
         * adentro de otro no se puede anunciar. Como hermanos, cada toque
         * tiene un solo dueño.
         */}
        <View className="flex-row items-center gap-3 px-2.5 py-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${current.title}, de ${current.artist}`}
            onPress={() => router.push('/playing')}
            className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-90"
          >
            {artwork ? (
              <Image source={{ uri: artwork }} className="h-10 w-10 rounded-lg bg-muted" />
            ) : (
              <View className="h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <IconMusic size={16} color={ICON_COLOR.muted} />
              </View>
            )}

            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-foreground text-[13px] font-semibold" numberOfLines={1}>
                {current.title}
              </Text>
              {lineaEstado({ espejoEn, error, artist: current.artist })}
            </View>
          </Pressable>

          {/* Los controles van **pegados entre sí**, como en el mini
              reproductor de Apple Music: cada botón ya lleva su área táctil
              de 40px adentro, y sumarle huecos entre uno y otro desparramaba
              tres íconos por media tarjeta — el espacio que sobra es del
              título, no de los botones. */}
          <View className="flex-row items-center">
            {/* «Anterior» solo cuando hay una cola de verdad detrás: puesta
                una canción suelta de la búsqueda no hay a dónde volver, y un
                botón que nunca hace nada es peor que no tenerlo. */}
            {tracks.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Anterior"
                onPress={playPrevious}
                className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
              >
                <IconPrevious size={19} color={ICON_COLOR.foreground} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={cargando ? 'Cargando' : playing ? 'Pausar' : 'Reproducir'}
              onPress={togglePlayback}
              className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
            >
              {cargando ? (
                <ActivityIndicator size="small" color={ICON_COLOR.foreground} />
              ) : playing ? (
                <IconPause size={19} color={ICON_COLOR.foreground} />
              ) : (
                <IconPlay size={19} color={ICON_COLOR.foreground} />
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Siguiente"
              onPress={playNext}
              disabled={last}
              className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
            >
              <IconNext size={19} color={last ? ICON_COLOR.muted : ICON_COLOR.foreground} />
            </Pressable>
          </View>

          {/*
           * La posición, como una línea fina al pie de la tarjeta.
           *
           * No se puede arrastrar a propósito: en una tarjeta de 56px de alto,
           * una barra agarrable competiría con el toque que abre la pantalla
           * completa, y ahí adentro está la barra de verdad. Acá es información,
           * no un control — por eso no lleva perilla.
           */}
          <View
            pointerEvents="none"
            className="absolute bottom-0 left-3 right-3 h-[2px] overflow-hidden rounded-full bg-muted"
          >
            <View
              className="h-full rounded-full bg-foreground"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </View>
        </View>
        </Glass>
      </View>
    )
  }

  /*
   * La barra ancha **sin vidrio**: la franja opaca de siempre, apilada al pie.
   * Con vidrio no se usa — ver la píldora más abajo.
   */
  const barra = (
    <View
      className="flex-row items-center gap-3 bg-canvas px-3 pt-2"
      style={{ paddingBottom: 8 + insets.bottom }}
    >
      {/* Lo que suena. En angosto se queda con esto y el botón de play. */}
      <View className="min-w-0 flex-1 flex-row items-center gap-3">
        {artwork ? (
          <Image source={{ uri: artwork }} className="h-12 w-12 rounded bg-card" />
        ) : (
          <View className="h-12 w-12 items-center justify-center rounded bg-card">
            <IconMusic size={18} color={ICON_COLOR.muted} />
          </View>
        )}
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-foreground text-[13px] font-semibold" numberOfLines={1}>
            {current.title}
          </Text>
          {lineaEstado({ espejoEn, error, artist: current.artist })}
        </View>
        {/* El corazón, pegado a lo que suena: es un juicio sobre la canción,
            no un control de transporte — por eso va acá y no con el play. */}
        {wide ? <BotonMeGusta track={current} size={16} lado={36} /> : null}
      </View>

      {/* Controles y posición, centrados como en cualquier reproductor. */}
      <View className={wide ? 'w-[38%] max-w-[560px] gap-1' : ''}>
        <View className="flex-row items-center justify-center gap-4">
          {/* Aleatorio y repetir rodean al play, como en cualquier reproductor.
              Ver `ui/Transport`, que es donde viven los dos. */}
          {wide ? <BotonAleatorio size={16} lado={36} /> : null}
          {wide ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Anterior"
              onPress={playPrevious}
              className="h-9 w-9 items-center justify-center rounded-full active:opacity-60"
            >
              <IconPrevious size={17} color={ICON_COLOR.muted} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cargando ? 'Cargando' : playing ? 'Pausar' : 'Reproducir'}
            onPress={togglePlayback}
            className="h-10 w-10 items-center justify-center rounded-full bg-primary active:opacity-80"
          >
            {cargando ? (
              <ActivityIndicator size="small" color={ICON_COLOR.onPrimary} />
            ) : playing ? (
              <IconPause size={16} color={ICON_COLOR.onPrimary} />
            ) : (
              <IconPlay size={16} color={ICON_COLOR.onPrimary} />
            )}
          </Pressable>
          {wide ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Siguiente"
              onPress={playNext}
              className="h-9 w-9 items-center justify-center rounded-full active:opacity-60"
            >
              <IconNext size={17} color={ICON_COLOR.muted} />
            </Pressable>
          ) : null}
          {wide ? <BotonRepetir size={16} lado={36} /> : null}
        </View>
        {wide ? (
          <SeekBar
            label={current.title}
            progress={progress}
            elapsedMs={positionMs}
            totalMs={durationMs}
            onSeek={seekFraction}
            posicionMs={posicionSV}
          />
        ) : null}
      </View>

      {/* Contrapeso del bloque de la izquierda, para que los controles queden
          centrados en la pantalla y no corridos por el largo del título. */}
      <View className="min-w-0 flex-1 flex-row items-center justify-end gap-1">
        {wide ? (
          <>
            <Toggle
              label="Ver el disco girando"
              active={view === 'disc'}
              onPress={() => toggleView('disc')}
              icon={IconDisc}
            />
            <Toggle
              label="Ver solo la letra"
              active={view === 'lyrics'}
              onPress={() => toggleView('lyrics')}
              icon={IconLyrics}
            />
            {/*
             * El Jam, a la vista y no solo adentro del menú: en escritorio hay
             * lugar, y una función que junta gente no puede vivir escondida
             * detrás de tres puntos. Encendido en blanco mientras hay uno
             * andando — el mismo lenguaje que las dos vistas de al lado.
             */}
            <Toggle
              label="Jam"
              active={enJam || view === 'jam'}
              /* Abre la cara del Jam en el panel de al lado (o su pantalla,
                 si el ancho no da para panel). Crear es un botón de adentro. */
              onPress={() => {
                if (width >= PANEL_PX) toggleView('jam')
                else router.push('/jam')
              }}
              icon={IconUsers}
            />
            <Volume value={volume} onChange={setVolume} />
          </>
        ) : (
          <Text className="text-muted-foreground text-[11px] tabular-nums">
            {formatClock(positionMs)}
          </Text>
        )}
        <Menu items={menu} label={`Opciones de ${current.title}`} size={17} />
      </View>
    </View>
  )

  if (!HAY_VIDRIO) return barra

  /*
   * Con vidrio, la barra es una **píldora flotante y centrada**, al modo del
   * reproductor de Apple Music en la web: una sola fila, compacta, con el
   * contenido de los paneles corriendo difuminado por detrás. No ocupa todo el
   * ancho a propósito — el material necesita ver fondo a los costados para
   * leerse como una pieza apoyada y no como una franja del sistema.
   *
   * En una fila no entra todo en cualquier ancho, así que la píldora suelta
   * lastre por etapas: primero las vistas y el volumen (que siguen en el panel
   * y en el menú), después la barra de posición, que deja en su lugar el
   * reloj. El play sigue siendo lo más brillante — el acento de siempre.
   */
  /*
   * Compacta: lo mínimo para saber qué suena y frenarlo — tapa, título y el
   * transporte—. Todo lo demás (posición, vistas, volumen, aleatorio, repetir)
   * espera a que vuelvas. Es la misma idea del plegado de iOS llevada a la
   * píldora: no desaparece, **ocupa menos**.
   *
   * Solo en web/escritorio: en nativo el vidrio se aplica una sola vez y
   * cambiarle el tamaño lo apagaría para siempre (ver `ui/Cascara`). En web el
   * material es `backdrop-filter`, que se redimensiona sin problema — lo único
   * prohibido ahí es animar opacidad en un ancestro (ver `ui/Glass`), y acá no
   * se toca ninguna.
   */
  const compacto = ES_WEB && colapsada && !sobre
  const conSeek = width >= 980 && !compacto
  const conVistas = width >= 1200 && !compacto

  return (
    <View className="items-center px-3" style={{ paddingBottom: 12 + insets.bottom }}>
      <AnchoPildora compacto={compacto} onSobre={setSobre}>
      <Glass
        radius={32}
        style={{
          width: '100%',
          /* La sombra que la despega del fondo más el filo del referente: el
             anillo y el resplandor interno que la leen como una pieza. */
          boxShadow: `0 10px 28px rgba(0,0,0,0.5), ${BORDE_REFERENTE}`,
        }}
      >
        <View className="flex-row items-center gap-3 py-2 pl-3 pr-2" {...clicBarra.gestos}>
          {/* Qué suena. Es también el toque que abre la lista de origen. */}
          <View className="min-w-0 flex-1 flex-row items-center gap-3">
            {artwork ? (
              <Image source={{ uri: artwork }} className="h-10 w-10 rounded-lg bg-muted" />
            ) : (
              <View className="h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <IconMusic size={16} color={ICON_COLOR.muted} />
              </View>
            )}
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-foreground text-[13px] font-semibold" numberOfLines={1}>
                {current.title}
              </Text>
              {lineaEstado({ espejoEn, error, artist: current.artist })}
            </View>
            {/* El corazón, junto a lo que suena — misma regla que en la
                franja sin vidrio. Compacta no entra: lo que queda es saber qué
                suena y poder frenarlo. */}
            {compacto ? null : <BotonMeGusta track={current} size={16} lado={36} />}
          </View>

          {/* El transporte, con aleatorio y repetir rodeando al play como en
              cualquier reproductor. Ver `ui/Transport`. */}
          <View className="flex-row items-center gap-1">
            {compacto ? null : <BotonAleatorio size={16} lado={36} />}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Anterior"
              onPress={playPrevious}
              className="h-9 w-9 items-center justify-center rounded-full active:opacity-60"
            >
              <IconPrevious size={17} color={ICON_COLOR.muted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={cargando ? 'Cargando' : playing ? 'Pausar' : 'Reproducir'}
              onPress={togglePlayback}
              className="h-10 w-10 items-center justify-center rounded-full bg-primary active:opacity-80"
            >
              {cargando ? (
                <ActivityIndicator size="small" color={ICON_COLOR.onPrimary} />
              ) : playing ? (
                <IconPause size={16} color={ICON_COLOR.onPrimary} />
              ) : (
                <IconPlay size={16} color={ICON_COLOR.onPrimary} />
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Siguiente"
              onPress={playNext}
              disabled={last}
              className="h-9 w-9 items-center justify-center rounded-full active:opacity-60"
            >
              <IconNext size={17} color={last ? ICON_COLOR.muted : ICON_COLOR.foreground} />
            </Pressable>
            {compacto ? null : <BotonRepetir size={16} lado={36} />}
          </View>

          {conSeek ? (
            <View className="min-w-0 flex-[1.4] px-2" style={{ maxWidth: 440 }}>
              <SeekBar
                label={current.title}
                progress={progress}
                elapsedMs={positionMs}
                totalMs={durationMs}
                onSeek={seekFraction}
                posicionMs={posicionSV}
              />
            </View>
          ) : compacto ? null : (
            <Text className="text-muted-foreground text-[11px] tabular-nums">
              {formatClock(positionMs)}
            </Text>
          )}

          <View className="flex-row items-center justify-end gap-1">
            {/* Sin botón propio: es la otra puerta al menú de al lado. Se monta
                recién al abrirse, para no dejar una pieza colgada sin usar. */}
            {clicBarra.punto ? (
              <Menu
                items={menu}
                sinDisparador
                abiertoEn={clicBarra.punto}
                onCerrarPunto={clicBarra.cerrar}
              />
            ) : null}
            {conVistas ? (
              <>
                <Toggle
                  label="Ver el disco girando"
                  active={view === 'disc'}
                  onPress={() => toggleView('disc')}
                  icon={IconDisc}
                />
                <Toggle
                  label="Ver solo la letra"
                  active={view === 'lyrics'}
                  onPress={() => toggleView('lyrics')}
                  icon={IconLyrics}
                />
                <Toggle
                  label="Jam"
                  active={enJam || view === 'jam'}
                  /* La misma regla que en la franja sin vidrio: el panel de
                     al lado si existe, la pantalla si no. */
                  onPress={() => {
                    if (width >= PANEL_PX) toggleView('jam')
                    else router.push('/jam')
                  }}
                  icon={IconUsers}
                />
                <Volume value={volume} onChange={setVolume} />
              </>
            ) : null}
            <Menu items={menu} label={`Opciones de ${current.title}`} size={17} />
          </View>
        </View>
      </Glass>
      </AnchoPildora>
    </View>
  )
}

/** Lo ancha que está la píldora, animado, y el hover que la trae de vuelta. */
const RESORTE_ANCHO = { damping: 26, stiffness: 190, mass: 0.9, overshootClamping: true }

function AnchoPildora({
  compacto,
  onSobre,
  children,
}: {
  compacto: boolean
  onSobre: (sobre: boolean) => void
  children: React.ReactNode
}) {
  /* El ancho va animado y no de un salto: la píldora se encoge hacia el centro
     como una pieza que se acomoda. Sin rebote, como el resto del sistema. */
  const p = useDerivedValue(() => withSpring(compacto ? 1 : 0, RESORTE_ANCHO), [compacto])
  const ancho = useAnimatedStyle(() => ({ maxWidth: 1080 - p.value * (1080 - 420) }))

  return (
    <Animated.View
      onPointerEnter={() => onSobre(true)}
      onPointerLeave={() => onSobre(false)}
      style={[{ width: '100%', alignSelf: 'center' }, ancho]}
    >
      {children}
    </Animated.View>
  )
}

/** Botón que enciende y apaga una vista del panel derecho. */
function Toggle({
  label,
  active,
  onPress,
  icon: Icon,
}: {
  label: string
  active: boolean
  onPress: () => void
  icon: (props: { size?: number; color?: string }) => React.ReactElement
}) {
  const tip = useConTooltip(label)
  return (
    <Pressable
      {...tip.gestos}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
    >
      {/* Encendido va en blanco, que es el acento del sistema; apagado en el
          gris de lo inactivo. Ver docs/DESIGN.md. */}
      <Icon size={16} color={active ? ICON_COLOR.foreground : ICON_COLOR.muted} />
    </Pressable>
  )
}

/**
 * La perilla de volumen.
 *
 * Reusa la misma barra que la posición: es el mismo gesto —arrastrar sobre una
 * línea— y tenerlas distintas sería inventar dos formas de hacer lo mismo. El
 * ícono corta el sonido y lo devuelve donde estaba, como en cualquier
 * reproductor.
 */
function Volume({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [before, setBefore] = useState(1)
  const muted = value === 0

  return (
    <View className="flex-row items-center gap-1.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Devolver el sonido' : 'Silenciar'}
        onPress={() => {
          if (muted) onChange(before || 1)
          else {
            setBefore(value)
            onChange(0)
          }
        }}
        className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
      >
        {muted ? (
          <IconVolumeOff size={16} color={ICON_COLOR.muted} />
        ) : (
          <IconVolume size={16} color={ICON_COLOR.muted} />
        )}
      </Pressable>
      <View style={{ width: 88 }}>
        <SeekBar
          label="volumen"
          progress={value}
          elapsedMs={0}
          totalMs={0}
          onSeek={onChange}
          compact
          /* Suena mientras se arrastra, no recién al soltar: es una perilla,
             y una perilla que no se oye girar no es una perilla. */
          envivo
        />
      </View>
    </View>
  )
}
