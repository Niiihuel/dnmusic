import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { volver } from '../src/lib/volver'
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { abrirArtista, usePiso } from '../src/state/shell'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { haySelectorDeSalida, SelectorDeSalida } from '../modules/audio-route'
import { artworkSource } from '../src/lib/artwork'
import { resultadoDePista } from '../src/lib/pistas'
import { fijarPistaEnPerfil } from '../src/lib/fijarEnPerfil'
import {
  canOpenPlaylist,
  openSoundingPlaylist,
  playNext,
  playPrevious,
  posicionSV,
  seekFraction,
  seekToMs,
  setVolume,
  stopPlayback,
  toggleView,
  togglePlayback,
  useHaySiguiente,
  useNowPlayingView,
  usePlaybackOriginName,
  usePlaybackState,
  useVolume,
} from '../src/state/playback'
import { crearJamActual, salirDelJam, useCuantosJam, useJamActivo } from '../src/state/jam'
import { abrirSelectorDispositivos } from '../src/state/escucha'
import { dejarCancionPendiente } from '../src/state/listas'
import { LyricsView } from '../src/ui/LyricsView'
import { Vacio } from '../src/ui/Vacio'
import { dejarCancionACompartir } from '../src/state/compartir'
import { BotonAleatorio, BotonRepetir } from '../src/ui/Transport'
import { BotonMeGusta } from '../src/ui/BotonMeGusta'
import { Menu, type MenuItem } from '../src/ui/Menu'
import { ES_WEB } from '../src/ui/Glass'
import { SeekBar } from '../src/ui/SeekBar'
import { SongDisc } from '../src/ui/SongDisc'
import {
  ICON_COLOR,
  IconChevronDown,
  IconCola,
  IconDisc,
  IconDispositivo,
  IconLyrics,
  IconMore,
  IconMusic,
  IconNext,
  IconPause,
  IconPlay,
  IconPlus,
  IconPrevious,
  IconRepeat,
  IconShare,
  IconUser,
  IconUsers,
  IconVolume,
  IconVolumeOff,
  IconClose,
} from '../src/ui/icons'

/**
 * Ancho máximo de la columna del reproductor en ventana grande.
 *
 * Es más ancho que el tope de las listas (672) porque acá la pieza principal es
 * una imagen cuadrada: con 672 la tapa se comía el alto entero y no quedaba
 * lugar para el título ni los controles.
 */
const COLUMNA = 520

/** Lo que tarda en crecer y en volver a guardarse. */
const SUBE_MS = 380
const BAJA_MS = 300
/** Cuánto hay que arrastrar —o con cuánta fuerza soltar— para que se cierre. */
const ARRASTRE_CIERRA = 120
const VELOCIDAD_CIERRA = 800
/**
 * Cuánto quedan los controles a la vista sobre la letra antes de irse solos.
 *
 * Es la letra la que se está mirando; los controles se piden con un toque y se
 * van cuando dejaron de hacer falta. Es lo que hace Apple Music, y el motivo es
 * que una barra de posición y tres botones sobre un texto que se está leyendo
 * son ruido a los cuatro segundos.
 */
const CONTROLES_MS = 4500
const CONTROLES_FADE_MS = 240

/**
 * Lo que suena, a pantalla completa.
 *
 * Es la otra mitad del reproductor del teléfono: la tarjeta de abajo se queda
 * con lo mínimo —qué suena y pausa— y todo lo que no entraba ahí vive acá. No
 * hay nada nuevo inventado: la carátula, el disco girando, la letra y la barra
 * de posición son los mismos componentes del panel derecho del escritorio.
 *
 * La anatomía es la de Apple Music: la tapa grande —o el disco, o la letra—,
 * debajo el título con el corazón y los tres puntos, la barra de posición, el
 * transporte y al pie una fila de íconos que cambian qué se mira (letra,
 * disco, salida, cola). **Con la letra puesta la pantalla es la letra**: el
 * encabezado se achica a una miniatura con el nombre, y los controles se
 * dibujan encima, abajo, y se van solos hasta que los volvés a tocar.
 *
 * Va como ruta y no como una capa dentro de la pantalla principal: la música
 * sigue sonando detrás sin sincronizar nada, y la pantalla tiene su URL.
 *
 * **La subida y el gesto los hace ella**, no el navegador. Eran los de un
 * `presentation: 'modal'`, que sube desde el borde de abajo de la pantalla; pero
 * acá no se entra por el borde, se entra tocando la tarjeta del reproductor, que
 * está más arriba. Ver `crece` y `arrastre`.
 */
export default function Playing() {
  const router = useRouter()
  const { tracks, index, manual, wantPlay, positionMs, durationMs } = usePlaybackState()
  const view = useNowPlayingView()
  const listName = usePlaybackOriginName()
  const enJam = useJamActivo()
  const cuantosJam = useCuantosJam()
  /* «Siguiente» cuenta la cola manual, el repetir y el relleno de
     recomendaciones — mirar solo la lista apagaba el botón en la última
     canción, con la tanda recomendada ya esperando. */
  const last = !useHaySiguiente()

  /*
   * **Desde dónde crece**: el borde de arriba de la tarjeta del reproductor.
   *
   * No hace falta medir nada nuevo. `usePiso()` ya devuelve lo que ocupa la
   * cáscara flotante, medida de su propio layout, así que el techo de la
   * tarjeta es el alto de la ventana menos eso — exactamente la altura donde
   * apoyaste el dedo para abrir esto.
   *
   * Al cerrar se vuelve al mismo número, así que la pantalla se guarda dentro
   * de la tarjeta de la que salió en vez de irse por el piso.
   */
  const { height: alturaVentana } = useWindowDimensions()
  /*
   * **Hasta dónde sube**: por debajo del safe area, no hasta el borde físico.
   *
   * Abierta del todo llegaba a y=0, y en un iPhone eso metía el grabber y el
   * encabezado debajo de la barra de estado — la hora y la batería del sistema
   * pisándose con los controles. Un sheet se detiene debajo del notch, con la
   * app de atrás asomando oscurecida; es lo que hacen los formSheet del Jam y
   * de la cola, que acá hay que imitar a mano porque la subida es nuestra. En
   * escritorio el inset es cero y la pantalla sigue llenando la ventana.
   */
  const insets = useSafeAreaInsets()
  const tope = insets.top > 0 ? insets.top + 6 : 0
  const desde = Math.max(0, alturaVentana - usePiso() - tope)

  /** 0 es abierta del todo; `desde` es guardada en la tarjeta. */
  const y = useSharedValue(desde)

  const cerrar = () => {
    /* Se navega **cuando terminó de bajar**, no antes: quitar la pantalla del
       árbol a mitad de camino corta el movimiento en seco. `runOnJS` porque el
       final de la animación llega en el hilo de la interfaz. */
    y.value = withTiming(desde, { duration: BAJA_MS, easing: Easing.in(Easing.cubic) }, (fin) => {
      if (fin) runOnJS(volver)(router, '/')
    })
  }

  /*
   * Arrastrar hacia abajo para cerrar: es lo que daba el modal nativo y lo que
   * cualquiera intenta sobre una pantalla que subió.
   *
   * Solo hacia abajo —tirar hacia arriba de algo que ya está arriba no hace
   * nada— y **cede el gesto horizontal**: adentro están la barra de posición y
   * los controles, que se manejan de costado. Sin `failOffsetX`, mover el dedo
   * en diagonal sobre la barra de posición cerraba la pantalla en vez de buscar
   * en la canción.
   */
  const arrastre = Gesture.Pan()
    .activeOffsetY(15)
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      y.value = Math.max(0, e.translationY)
    })
    .onEnd((e) => {
      /* Soltado lejos o con impulso, se cierra por el mismo camino que el botón
         de bajar: `cerrar` sigue desde donde quedó el dedo. Va por `runOnJS`
         porque esto corre en el hilo de la interfaz y `cerrar` es una función
         común — que además es la razón de no duplicar la animación acá. */
      if (e.translationY > ARRASTRE_CIERRA || e.velocityY > VELOCIDAD_CIERRA) {
        runOnJS(cerrar)()
        return
      }
      /* No alcanzó: vuelve arriba con resorte, como el sheet del sistema. */
      y.value = withSpring(0, { damping: 22, stiffness: 260 })
    })

  /*
   * Sube y aparece a la vez.
   *
   * El desvanecido va sobre el **último tramo** del recorrido: cerca de la
   * tarjeta la pantalla todavía es casi transparente, así que lo que se ve es
   * la tarjeta creciendo y no una lámina tapándola. Todo por `style`:
   * NativeWind no procesa clases en componentes animados.
   */
  const crece = useAnimatedStyle(() => {
    /* Normalizado, y no interpolando sobre `desde` directo: con `desde` en cero
       —una ventana sin medir todavía— el rango de entrada sería [0,0,0] y la
       pantalla saldría transparente en vez de abierta. */
    const p = desde > 0 ? y.value / desde : 0
    return {
      transform: [{ translateY: y.value }],
      /* El rango de entrada va CRECIENTE: `interpolate` lo exige, y con el
         rango al revés devolvía cualquier cosa — la pantalla quedaba
         translúcida incluso abierta del todo. p=0 es abierta (opaca), p=1 es
         guardada en la tarjeta (invisible). */
      opacity: interpolate(p, [0, 0.55, 1], [1, 0.85, 0], 'clamp'),
    }
  })

  /*
   * El velo sobre lo que asoma arriba de la hoja.
   *
   * Con el tope puesto, la franja descubierta muestra la app de atrás: un
   * sheet del sistema la oscurece, así que este también. Acompaña la apertura
   * —mismo `p` que `crece`— para no aparecer de golpe.
   */
  const velo = useAnimatedStyle(() => {
    const p = desde > 0 ? y.value / desde : 0
    return { opacity: (1 - p) * 0.45 }
  })

  /*
   * La entrada, una sola vez al montarse.
   *
   * Va **al final del cuerpo**, después de `cerrar` y del gesto, porque la
   * regla no admite que se escriba un valor compartido en código que aparezca
   * debajo del efecto que lo usa. Y se la silencia acá por lo mismo que en
   * `MotorAudio` con el volumen: un `SharedValue` de Reanimated se maneja
   * escribiéndole `.value` —es su API— y esta animación tiene que ser
   * imperativa porque el mismo valor lo mueve el arrastre.
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    y.value = withTiming(0, { duration: SUBE_MS, easing: Easing.out(Easing.cubic) })
  }, [y])

  const track = manual ?? (index >= 0 ? (tracks[index] ?? null) : null)
  const artwork = track ? artworkSource(track.artworkPath, track.artworkUrl, 640) : null
  const progress = durationMs > 0 ? Math.max(0, Math.min(1, positionMs / durationMs)) : 0
  const first = !manual && index <= 0
  const conLetra = view === 'lyrics'

  /*
   * Los controles sobre la letra: se piden con un toque y se van solos.
   *
   * `visibles` es estado de React —decide qué recibe toques— y el fundido lo
   * lleva un estilo animado que lo sigue. El temporizador se rearma con cada
   * toque sobre los controles (`tocado`), así que mientras arrastrás la barra
   * de posición no desaparecen debajo del dedo. En pausa se quedan: no hay
   * nada que leer al ritmo de nada.
   */
  const [escondidos, setEscondidos] = useState(false)
  /* Fuera de la letra los controles están siempre: el estado solo cuenta con
     la letra puesta, y se **deriva** en vez de sincronizarse con un efecto. */
  const visibles = !conLetra || !escondidos
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const apagarTimer = () => {
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = null
  }
  const rearmar = useCallback(() => {
    apagarTimer()
    if (!conLetra || !wantPlay) return
    temporizador.current = setTimeout(() => setEscondidos(true), CONTROLES_MS)
  }, [conLetra, wantPlay])
  useEffect(() => {
    if (!conLetra) return
    rearmar()
    return apagarTimer
  }, [conLetra, wantPlay, rearmar])
  const tocado = () => {
    if (escondidos) setEscondidos(false)
    rearmar()
  }
  const alternarControles = () => {
    if (visibles) {
      apagarTimer()
      setEscondidos(true)
    } else tocado()
  }
  /** Entrar a la letra siempre arranca con los controles a la vista. */
  const verLetra = () => {
    setEscondidos(false)
    toggleView('lyrics')
  }
  const fundido = useAnimatedStyle(() => ({
    opacity: withTiming(visibles ? 1 : 0, { duration: CONTROLES_FADE_MS }),
    transform: [{ translateY: withTiming(visibles ? 0 : 12, { duration: CONTROLES_FADE_MS }) }],
  }))

  /*
   * Sin nada cargado no hay pantalla que mostrar.
   *
   * Pasa si la canción termina con esto abierto: en vez de dejar un hueco con
   * controles que no controlan nada, se cierra sola y volvés a donde estabas.
   */
  if (!track) {
    return (
      <SafeAreaView className="flex-1 justify-center bg-canvas">
        <Vacio
          icono={<IconMusic size={24} color={ICON_COLOR.muted} />}
          titulo="No hay nada sonando"
          detalle="Poné una canción y esta pantalla se vuelve su tapa gigante."
          accion={{ rotulo: 'Volver', onPress: () => volver(router, '/') }}
        />
      </SafeAreaView>
    )
  }

  /*
   * Los tres puntos de la canción que suena, con la anatomía del menú de Apple
   * Music: arriba la fila de tres acciones rápidas —sumar a una lista, el Jam,
   * compartir—, después a dónde ir, después qué hacer con el reproductor, y al
   * final lo que lo cierra. El corazón no está: ya es su propio botón al lado
   * del título.
   */
  const jamLabel = enJam
    ? `Jam · ${cuantosJam}`
    : 'Jam'
  const menu: MenuItem[] = [
    {
      label: 'Agregar a una lista',
      rapida: true,
      onPress: () => {
        dejarCancionPendiente(resultadoDePista(track))
        router.push('/lista/elegir')
      },
      icon: <IconPlus size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'plus',
    },
    {
      /* La fila dice lo que va a pasar: sin Jam **lo crea**, con uno abierto lo
         muestra, con cuántos son. */
      label: jamLabel,
      rapida: true,
      selected: enJam || undefined,
      onPress: () => {
        if (enJam) {
          router.push('/jam')
          return
        }
        void crearJamActual().then((ok) => {
          if (ok) router.push('/jam')
        })
      },
      icon: <IconUsers size={15} color={enJam ? ICON_COLOR.foreground : ICON_COLOR.muted} />,
      sfSymbol: enJam ? 'person.2.fill' : 'person.2',
    },
    /*
     * Una sola fila, como en la pantalla principal: abre la hoja y ahí se
     * elige entre la historia y el link, con la tarjeta a la vista antes de
     * mandarla. Ver `app/compartir.tsx`.
     */
    {
      label: 'Compartir',
      rapida: true,
      onPress: () => {
        dejarCancionACompartir(track)
        router.push('/compartir')
      },
      icon: <IconShare size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'square.and.arrow.up',
    },
    {
      label: 'Ir al artista',
      subtitle: track.artist,
      disabled: !track.artistId,
      onPress: () => {
        if (!track.artistId) return
        abrirArtista(track.artistId, track.artist)
        cerrar()
      },
      icon: <IconUser size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'music.microphone',
    },
    {
      label: 'Ver la lista',
      subtitle: manual ? undefined : listName || undefined,
      disabled: !canOpenPlaylist(),
      onPress: () => {
        openSoundingPlaylist()
        cerrar()
      },
      icon: <IconMusic size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'music.note.list',
    },
    {
      label: 'Fijar en mi perfil',
      onPress: () => void fijarPistaEnPerfil(track),
      icon: <IconUser size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'pin',
    },
    {
      label: 'Escuchar en…',
      separadorAntes: true,
      onPress: abrirSelectorDispositivos,
      icon: <IconDispositivo size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'laptopcomputer.and.iphone',
    },
    {
      label: 'Volver a empezar',
      onPress: () => seekToMs(0),
      icon: <IconRepeat size={15} color={ICON_COLOR.muted} />,
      sfSymbol: 'arrow.counterclockwise',
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
          onPress: () => {
            stopPlayback()
            cerrar()
          },
          destructive: true,
          icon: <IconClose size={15} color={ICON_COLOR.muted} />,
          sfSymbol: 'xmark',
        },
  ]

  const botonMenu = (
    <Menu
      items={menu}
      label={`Opciones de ${track.title}`}
      trigger={
        <View className="h-10 w-10 items-center justify-center rounded-full bg-white/10">
          <IconMore size={17} color={ICON_COLOR.foreground} />
        </View>
      }
    />
  )

  /*
   * La barra de posición, el transporte y la fila de vistas.
   *
   * Es el mismo bloque en las dos formas de la pantalla: al pie con la tapa, y
   * flotando sobre la letra. Se arma una vez para que las dos no se separen.
   */
  const controles = (
    <View
      className="gap-5 px-6 pb-2 pt-3"
      /* Cualquier toque acá rearma el temporizador de los controles sobre la
         letra. Los dos manejadores porque el de puntero es el que llega en la
         web y el de toque el que llega en el teléfono. */
      onTouchStart={tocado}
      {...({ onPointerDown: tocado } as object)}
    >
      <SeekBar
        label={track.title}
        progress={progress}
        elapsedMs={positionMs}
        totalMs={durationMs}
        onSeek={seekFraction}
        posicionMs={posicionSV}
      />

      {/*
       * La fila de siempre: aleatorio, anterior, play, siguiente, repetir.
       *
       * Es el orden de cualquier reproductor —Spotify, Apple Music, el
       * Winamp— y no es capricho: los dos modos van a los extremos porque
       * cambian **cómo** suena la cola, y los tres del medio son lo que hacés
       * con la canción de ahora. Mezclarlos obligaría a leer los cinco íconos
       * cada vez para encontrar el play.
       */}
      <View className="flex-row items-center justify-center gap-5">
        <BotonAleatorio size={22} lado={44} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Anterior"
          onPress={playPrevious}
          className="h-12 w-12 items-center justify-center rounded-full active:opacity-60"
        >
          <IconPrevious size={26} color={first ? ICON_COLOR.muted : ICON_COLOR.foreground} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={wantPlay ? 'Pausar' : 'Reproducir'}
          onPress={togglePlayback}
          className="h-16 w-16 items-center justify-center rounded-full bg-primary active:opacity-80"
        >
          {wantPlay ? (
            <IconPause size={24} color={ICON_COLOR.onPrimary} />
          ) : (
            <IconPlay size={24} color={ICON_COLOR.onPrimary} />
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Siguiente"
          onPress={playNext}
          disabled={last}
          className="h-12 w-12 items-center justify-center rounded-full active:opacity-60"
        >
          <IconNext size={26} color={last ? ICON_COLOR.muted : ICON_COLOR.foreground} />
        </Pressable>
        <BotonRepetir size={22} lado={44} />
      </View>

      {/* El volumen, solo donde la app lo maneja: en el teléfono lo hacen los
          botones del aparato y una perilla más sería una perilla que no
          controla lo mismo que las de al lado. */}
      {ES_WEB ? <Volumen /> : null}

      {/*
       * La fila del pie: qué se mira y a dónde va el sonido, como los tres
       * íconos de Apple Music. Encendido es el ícono blanco sobre un disco
       * apenas más claro — un escalón de luminancia, no un color —; apagado,
       * el gris de los controles inactivos (`docs/DESIGN.md`).
       */}
      <View className="flex-row items-center justify-evenly pt-1">
        <Alternador
          label="Ver la letra"
          active={conLetra}
          onPress={verLetra}
          icon={IconLyrics}
        />
        <Alternador
          label="Ver el disco girando"
          active={view === 'disc'}
          onPress={() => toggleView('disc')}
          icon={IconDisc}
        />
        {/*
         * A dónde sale el sonido. Adentro no va un ícono nuestro sino la vista
         * de Apple, que se dibuja y se anima sola; ocupa el redondel entero
         * para que el toque sea todo el botón y no el glifo. Sin el módulo en
         * el binario no se dibuja nada — ni el redondel, que quedaría vacío.
         */}
        {haySelectorDeSalida ? (
          <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-full">
            <SelectorDeSalida
              color={ICON_COLOR.muted}
              activeColor={ICON_COLOR.foreground}
              style={{ width: 44, height: 44 }}
            />
          </View>
        ) : null}
        <Alternador
          label="Ver la cola"
          active={false}
          onPress={() => router.push('/cola')}
          icon={IconCola}
        />
      </View>
    </View>
  )

  return (
    /* El gesto envuelve todo y la animación también: lo que crece desde la
       tarjeta es la pantalla entera, fondo desenfocado incluido.

       La base negra va ACÁ y no en la escena: la escena es transparente a
       propósito —mientras la pantalla crece se ve la app detrás— así que el
       cuerpo opaco tiene que ser parte de lo que crece. Sin él, la pantalla
       entera quedaba translúcida abierta: su «fondo» es una carátula al 55%
       con un velo, que son ambiente, no piso. #000 es el token canvas. */
    <GestureDetector gesture={arrastre}>
      <View style={{ flex: 1 }}>
      {tope > 0 ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, velo]}
          />
          {/* La franja descubierta cierra al tocarla, como en todo sheet. La
              hoja se dibuja después, así que sus toques no llegan acá. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Bajar"
            onPress={cerrar}
            style={StyleSheet.absoluteFill}
          />
        </>
      ) : null}
      <Animated.View
        style={[
          {
            flex: 1,
            marginTop: tope,
            borderTopLeftRadius: tope ? 24 : 0,
            borderTopRightRadius: tope ? 24 : 0,
            overflow: 'hidden',
            backgroundColor: '#000000',
          },
          crece,
        ]}
      >
      {/*
       * El fondo lo pone la tapa.
       *
       * Es el mismo recurso del visor de mensajes: la carátula estirada y
       * desenfocada detrás, con un velo encima. La app es acromática a
       * propósito, y este es el único lugar donde el color entra —el que trae
       * la canción, no uno nuestro—. Sobre negro plano el vinilo quedaba
       * flotando en la nada; así el disco se apoya en algo.
       *
       * El velo no es decoración: sin él, una tapa clara se come el título y
       * los controles. Con la letra puesta el velo es más pesado: el texto es
       * lo único que hay y tiene que leerse sobre cualquier tapa.
       */}
      {artwork ? (
        <Image
          source={{ uri: artwork }}
          style={[
            StyleSheet.absoluteFill,
            // La escala evita que el desenfoque deje los bordes transparentes.
            { transform: [{ scale: 1.3 }], opacity: conLetra ? 0.4 : 0.55 },
            Platform.OS === 'web' ? ({ filter: 'blur(72px) saturate(1.4)' } as object) : null,
          ]}
          blurRadius={Platform.OS === 'web' ? 0 : 40}
        />
      ) : null}
      <LinearGradient
        pointerEvents="none"
        colors={
          conLetra
            ? ['rgba(0,0,0,0.78)', 'rgba(0,0,0,0.62)', 'rgba(0,0,0,0.92)']
            : ['rgba(0,0,0,0.72)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.92)']
        }
        style={StyleSheet.absoluteFill}
      />

      {/*
       * En ventana ancha, el reproductor es una **columna centrada**.
       *
       * La tapa es `w-full` con proporción cuadrada, así que sin tope crecía con
       * la ventana: en un monitor quedaba un cuadrado de mil y pico de píxeles
       * desbordando el alto, con el título y los controles empujados fuera de
       * la pantalla. El fondo desenfocado sigue ocupando todo —es el ambiente,
       * y ahí sí queremos que llene— y lo que se acota es lo que se lee. Es la
       * forma que toma Apple Music en el iPad y en la Mac.
       */}
      <SafeAreaView
        className="flex-1 self-center"
        style={{ width: '100%', maxWidth: COLUMNA }}
        /* Solo abajo: el margen de arriba ya lo puso el `tope` de la hoja —
           dentro de un transparentModal el inset de arriba además llegaba en
           cero, que es como el encabezado terminó abajo de la hora del
           sistema. Ver el comentario de `tope`. */
        edges={['bottom']}
      >
        {/* La manijita, dibujada por nosotros. Apple Music dibuja la suya
            exactamente así: la cápsula dice «esto se arrastra» sin gastar un
            botón. **También en web**, que desde que el gesto es nuestro
            —`arrastre`, arriba— responde igual al arrastre del mouse. */}
        <View
          pointerEvents="none"
          className="mt-2 h-[5px] w-9 self-center rounded-full bg-white/25"
        />

        {conLetra ? (
          <>
            {/*
             * El encabezado de la letra: la tapa en miniatura, el nombre y los
             * dos botones de la canción. Es la primera fila de la pantalla de
             * letra de Apple Music, y hace que la letra sea la pantalla sin
             * que se pierda de vista qué está sonando.
             */}
            <View className="flex-row items-center gap-3 px-5 pb-3 pt-4">
              {ES_WEB ? (
                /* En la compu no hay dedo que arrastre: la flecha es la única
                   forma clara de bajar la hoja. En el teléfono la manija y el
                   gesto alcanzan, como en Apple Music. */
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Bajar"
                  onPress={cerrar}
                  className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
                >
                  <IconChevronDown size={22} color={ICON_COLOR.foreground} />
                </Pressable>
              ) : null}
              {artwork ? (
                <Image
                  source={{ uri: artwork }}
                  className="rounded-lg bg-card"
                  style={{ width: 52, height: 52 }}
                />
              ) : (
                <View
                  className="items-center justify-center rounded-lg bg-card"
                  style={{ width: 52, height: 52 }}
                >
                  <IconMusic size={18} color={ICON_COLOR.muted} />
                </View>
              )}
              <View className="min-w-0 flex-1">
                <Text className="text-foreground text-[15px] font-semibold" numberOfLines={1}>
                  {track.title}
                </Text>
                <Text className="text-muted-foreground text-[13px]" numberOfLines={1}>
                  {track.artist}
                </Text>
              </View>
              <BotonMeGusta track={track} size={20} lado={40} />
              {botonMenu}
            </View>

            {/* La letra ocupa todo lo que queda, hasta el pie: los controles
                se dibujan **encima**, y las líneas que vienen pasan detrás de
                ellos, ya desenfocadas. */}
            <View className="min-h-0 flex-1">
              <LyricsView track={track} translatable size="xl" onTap={alternarControles} />
              <Animated.View
                pointerEvents={visibles ? 'box-none' : 'none'}
                style={[
                  { position: 'absolute', left: 0, right: 0, bottom: 0 },
                  fundido,
                ]}
              >
                {/* El fundido de abajo: la letra se apaga contra el pie para
                    que la barra y los botones se lean sobre cualquier verso.
                    Es el degradado de siempre, del fondo hacia nada. */}
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)', 'rgba(0,0,0,0.92)']}
                  locations={[0, 0.35, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <View className="pt-10">{controles}</View>
              </Animated.View>
            </View>
          </>
        ) : (
          <>
            <View className="flex-row items-center px-4 py-1">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Bajar"
                onPress={cerrar}
                className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
              >
                <IconChevronDown size={22} color={ICON_COLOR.foreground} />
              </Pressable>
              <View className="min-w-0 flex-1 items-center">
                <Text className="text-muted-foreground text-[11px] uppercase tracking-[1.2px]">
                  {manual ? 'En la cola' : listName || 'Sonando'}
                </Text>
              </View>
              <View className="w-10" />
            </View>

            {/* La pieza grande: la tapa o el disco girando. */}
            <View className="min-h-0 flex-1 items-center justify-center px-6">
              {view === 'disc' ? (
                <SongDisc
                  artworkUrl={track.artworkUrl}
                  artworkPath={track.artworkPath}
                  title={track.title}
                  playing={wantPlay}
                  size={300}
                />
              ) : artwork ? (
                <TapaGrande uri={artwork} playing={wantPlay} />
              ) : (
                <View
                  className="w-full items-center justify-center rounded-2xl bg-card"
                  style={{ aspectRatio: 1 }}
                >
                  <IconMusic size={40} color={ICON_COLOR.muted} />
                </View>
              )}
            </View>

            {/* El título con el corazón y los tres puntos, como en Apple
                Music: el corazón es un juicio sobre ESTA canción y los tres
                puntos son todo lo demás que se puede hacer con ella. Van
                juntos al lado del nombre y no entre los controles de
                transporte, donde se leerían como botones de reproducción. */}
            <View className="flex-row items-center gap-2 px-6 pt-5">
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-foreground text-[20px] font-bold" numberOfLines={1}>
                  {track.title}
                </Text>
                <Text className="text-muted-foreground text-[15px]" numberOfLines={1}>
                  {track.artist}
                </Text>
              </View>
              <BotonMeGusta track={track} size={22} lado={40} />
              {botonMenu}
            </View>

            {controles}
          </>
        )}
      </SafeAreaView>
      </Animated.View>
      </View>
    </GestureDetector>
  )
}

/** El resorte de la tapa: crece decidida al sonar, se recoge suave al pausar. */
const RESORTE_TAPA = { damping: 17, stiffness: 190, mass: 0.9 }

/**
 * La carátula grande, que **respira con la reproducción**.
 *
 * Es la terminación de Apple Music: sonando, la tapa está a tamaño pleno y
 * despegada del fondo por una sombra profunda; en pausa se recoge y la sombra
 * se acerca. La pantalla dice el estado sin que haya que mirar el botón — la
 * música «se achica» cuando se calla.
 *
 * La sombra vive en el contenedor animado y el redondeo en los dos: recortar
 * y proyectar en la misma capa se pelean (el mismo motivo documentado en el
 * drawer de `_layout`). Todo por `style`: NativeWind no procesa `className`
 * sobre componentes animados.
 */
function TapaGrande({ uri, playing }: { uri: string; playing: boolean }) {
  const respira = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(playing ? 1 : 0.82, RESORTE_TAPA) }],
  }))
  return (
    <Animated.View
      style={[
        {
          width: '100%',
          borderRadius: 16,
          boxShadow: '0 22px 56px rgba(0,0,0,0.55)',
        },
        respira,
      ]}
    >
      <Image
        source={{ uri }}
        className="w-full rounded-2xl bg-card"
        style={{ aspectRatio: 1 }}
      />
    </Animated.View>
  )
}

/**
 * Un botón de la fila del pie: prende y apaga una vista.
 *
 * Redondel de 44 sin fondo; encendido, el ícono es blanco y el redondel se
 * aclara un paso (`white/15`). Es el estado activo de la fila de Apple Music
 * traducido al sistema: luminancia, no color.
 */
function Alternador({
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`h-11 w-11 items-center justify-center rounded-full active:opacity-70 ${
        active ? 'bg-white/15' : ''
      }`}
    >
      <Icon size={20} color={active ? ICON_COLOR.foreground : ICON_COLOR.muted} />
    </Pressable>
  )
}

/**
 * El volumen, como en Apple Music: un parlante chico a cada lado y la barra en
 * el medio. Es la misma `SeekBar` de la posición, en vivo — mover la perilla
 * **es** subir y bajar, y hay que oírlo mientras se mueve.
 */
function Volumen() {
  const volumen = useVolume()
  return (
    <View className="flex-row items-center gap-3 px-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Silenciar"
        onPress={() => setVolume(0)}
        className="h-8 w-8 items-center justify-center rounded-full active:opacity-60"
      >
        <IconVolumeOff size={14} color={ICON_COLOR.muted} />
      </Pressable>
      <View className="flex-1">
        <SeekBar
          label="Volumen"
          progress={volumen}
          elapsedMs={0}
          totalMs={0}
          compact
          envivo
          onSeek={setVolume}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volumen al máximo"
        onPress={() => setVolume(1)}
        className="h-8 w-8 items-center justify-center rounded-full active:opacity-60"
      >
        <IconVolume size={14} color={ICON_COLOR.muted} />
      </Pressable>
    </View>
  )
}
