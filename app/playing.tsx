import { useEffect } from 'react'
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
import { usePiso } from '../src/state/shell'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { haySelectorDeSalida, SelectorDeSalida } from '../modules/audio-route'
import { artworkSource } from '../src/lib/artwork'
import {
  playNext,
  playPrevious,
  seekFraction,
  toggleView,
  togglePlayback,
  useHaySiguiente,
  useNowPlayingView,
  usePlaybackOriginName,
  usePlaybackState,
} from '../src/state/playback'
import { crearJamActual, useCuantosJam, useJamActivo } from '../src/state/jam'
import { LyricsView } from '../src/ui/LyricsView'
import { BotonAleatorio, BotonRepetir } from '../src/ui/Transport'
import { SeekBar } from '../src/ui/SeekBar'
import { SongDisc } from '../src/ui/SongDisc'
import {
  ICON_COLOR,
  IconChevronDown,
  IconCola,
  IconDisc,
  IconLyrics,
  IconMusic,
  IconNext,
  IconPause,
  IconPlay,
  IconPrevious,
  IconUsers,
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
 * Lo que suena, a pantalla completa.
 *
 * Es la otra mitad del reproductor del teléfono: la tarjeta de abajo se queda
 * con lo mínimo —qué suena y pausa— y todo lo que no entraba ahí vive acá. No
 * hay nada nuevo inventado: la carátula, el disco girando, la letra y la barra
 * de posición son los mismos componentes del panel derecho del escritorio.
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
  const desde = Math.max(0, alturaVentana - usePiso())

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
   * las píldoras de vista, que se manejan de costado. Sin `failOffsetX`, mover
   * el dedo en diagonal sobre la barra de posición cerraba la pantalla en vez
   * de buscar en la canción.
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

  /*
   * Sin nada cargado no hay pantalla que mostrar.
   *
   * Pasa si la canción termina con esto abierto: en vez de dejar un hueco con
   * controles que no controlan nada, se cierra sola y volvés a donde estabas.
   */
  if (!track) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-canvas">
        <IconMusic size={26} color={ICON_COLOR.muted} />
        <Text className="text-muted-foreground text-[13px]">No hay nada sonando.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => volver(router, '/')}
          className="rounded-full bg-muted px-5 py-2.5 active:opacity-80"
        >
          <Text className="text-foreground text-[13px] font-semibold">Volver</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    /* El gesto envuelve todo y la animación también: lo que crece desde la
       tarjeta es la pantalla entera, fondo desenfocado incluido.

       La base negra va ACÁ y no en la escena: la escena es transparente a
       propósito —mientras la pantalla crece se ve la app detrás— así que el
       cuerpo opaco tiene que ser parte de lo que crece. Sin él, la pantalla
       entera quedaba translúcida abierta: su «fondo» es una carátula al 55%
       con un velo, que son ambiente, no piso. #000 es el token canvas. */
    <GestureDetector gesture={arrastre}>
      <Animated.View
        style={[{ flex: 1, overflow: 'hidden', backgroundColor: '#000000' }, crece]}
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
       * los controles.
       */}
      {artwork ? (
        <Image
          source={{ uri: artwork }}
          style={[
            StyleSheet.absoluteFill,
            // La escala evita que el desenfoque deje los bordes transparentes.
            { transform: [{ scale: 1.3 }], opacity: 0.55 },
            Platform.OS === 'web' ? ({ filter: 'blur(72px) saturate(1.4)' } as object) : null,
          ]}
          blurRadius={Platform.OS === 'web' ? 0 : 40}
        />
      ) : null}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.72)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.92)']}
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
        edges={['top', 'bottom']}
      >
        {/* La manijita, dibujada por nosotros. Apple Music dibuja la suya
            exactamente así: la cápsula dice «esto se arrastra» sin gastar un
            botón. **También en web**, que desde que el gesto es nuestro
            —`arrastre`, arriba— responde igual al arrastre del mouse; antes
            dependía del sheet nativo y ahí no había nada que anunciar. */}
        <View
          pointerEvents="none"
          className="mt-2 h-[5px] w-9 self-center rounded-full bg-white/25"
        />
        <View className="flex-row items-center gap-3 px-4 py-3">
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
          {/* La cola, arriba a la derecha — donde la pone Spotify. De paso hace
              de contrapeso de la flecha, que es lo que había acá antes. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver la cola"
            onPress={() => router.push('/cola')}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
          >
            <IconCola size={19} color={ICON_COLOR.foreground} />
          </Pressable>
        </View>

        {/* La pieza grande: la tapa, el disco girando o la letra. Es la misma
          decisión que ofrece el panel del escritorio, con los mismos botones. */}
        <View className="min-h-0 flex-1 items-center justify-center px-6">
          {view === 'lyrics' ? (
            <LyricsView track={track} translatable />
          ) : view === 'disc' ? (
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

        <View className="gap-5 px-6 pb-4 pt-6">
          <View className="gap-1">
            <Text className="text-foreground text-2xl font-bold" numberOfLines={2}>
              {track.title}
            </Text>
            <Text className="text-muted-foreground text-[15px]" numberOfLines={1}>
              {track.artist}
            </Text>
          </View>

          <SeekBar
            label={track.title}
            progress={progress}
            elapsedMs={positionMs}
            totalMs={durationMs}
            onSeek={seekFraction}
          />

          {/*
           * La fila de siempre: aleatorio, anterior, play, siguiente, repetir.
           *
           * Es el orden de cualquier reproductor —Spotify, Apple Music, el
           * Winamp— y no es capricho: los dos modos van a los extremos porque
           * cambian **cómo** suena la cola, y los tres del medio son lo que hacés
           * con la canción de ahora. Mezclarlos obligaría a leer los cinco íconos
           * cada vez para encontrar el play.
           *
           * El hueco baja de 8 a 5 para que entren los cinco sin apretarse contra
           * los bordes en un teléfono angosto.
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

          <View className="flex-row items-center justify-center gap-3">
            <Vista
              label="Ver el disco girando"
              active={view === 'disc'}
              onPress={() => toggleView('disc')}
              icon={IconDisc}
              text="Disco"
            />
            <Vista
              label="Ver la letra"
              active={view === 'lyrics'}
              onPress={() => toggleView('lyrics')}
              icon={IconLyrics}
              text="Letra"
            />

            {/*
             * El Jam, junto a las vistas: es lo otro que se hace **con lo que
             * está sonando**. Sin Jam lo crea con la cola puesta; con uno
             * abierto muestra cuántos son y abre el sheet. Encendido en blanco
             * como todo estado activo — ver docs/DESIGN.md.
             */}
            <Vista
              label={enJam ? 'Ver el Jam' : 'Iniciar un Jam'}
              active={enJam}
              onPress={() => {
                if (enJam) router.push('/jam')
                else
                  void crearJamActual().then((ok) => {
                    if (ok) router.push('/jam')
                  })
              }}
              icon={IconUsers}
              text={enJam ? `Jam · ${cuantosJam}` : 'Jam'}
            />

            {/*
             * A dónde sale el sonido, al lado de las vistas.
             *
             * Redondel y no píldora: las otras dos dicen qué estás mirando y
             * llevan su nombre escrito, pero esto abre la hoja del sistema y no
             * tiene un estado propio que nombrar. `docs/DESIGN.md` pide círculo
             * para los controles de reproducción, y este lo es.
             *
             * Adentro no va un ícono nuestro sino la vista de Apple, que se
             * dibuja y se anima sola; ocupa el círculo entero para que el toque
             * sea todo el botón y no el glifo. Sin el módulo en el binario no se
             * dibuja nada — ni el redondel, que quedaría vacío.
             */}
            {haySelectorDeSalida ? (
              <View className="h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-muted">
                <SelectorDeSalida
                  color={ICON_COLOR.muted}
                  activeColor={ICON_COLOR.foreground}
                  style={{ width: 36, height: 36 }}
                />
              </View>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
      </Animated.View>
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

/** Píldora que enciende y apaga una de las vistas. Blanco es encendido. */
function Vista({
  label,
  active,
  onPress,
  icon: Icon,
  text,
}: {
  label: string
  active: boolean
  onPress: () => void
  icon: (props: { size?: number; color?: string }) => React.ReactElement
  text: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`flex-row items-center gap-2 rounded-full px-4 py-2 active:opacity-70 ${
        active ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <Icon size={15} color={active ? ICON_COLOR.onPrimary : ICON_COLOR.muted} />
      <Text
        className={`text-[13px] font-semibold ${
          active ? 'text-primary-foreground' : 'text-muted-foreground'
        }`}
      >
        {text}
      </Text>
    </Pressable>
  )
}
