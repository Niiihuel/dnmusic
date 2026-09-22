import { BandaVentana } from '../src/ui/BandaVentana'
import { useEffect, useRef, useState } from 'react'
import { Stack, usePathname, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { useFuentesDelPerfil } from '../src/lib/fuentes'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SplashAnimado } from '../src/ui/SplashAnimado'
import { Tooltip } from '../src/ui/Tooltip'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedKeyboard,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { restaurarVolumen, restorePlayback, usePlaybackTrack } from '../src/state/playback'
import { cargarNovedadesVistas } from '../src/state/novedadesVistas'
import { cargarAjustes } from '../src/state/ajustes'
import { cargarEcualizador } from '../src/state/ecualizador'
import { cargarDescargas } from '../src/state/descargas'
import { reconectarJam } from '../src/state/jam'
import { iniciarEscucha } from '../src/state/escucha'
import { usePresenciaDiscord } from '../src/state/discord'
import { cargarMeGusta } from '../src/state/gustos'
import { Traspaso } from '../src/ui/Traspaso'
import { SelectorDispositivos } from '../src/ui/SelectorDispositivos'
import { refrescarAcceso, startSession, useAccessError, useAccessStatus, useAuthUser, useMyProfile, useUser } from '../src/state/session'
import { usePush } from '../src/state/push'
import { emailToUsername } from '../src/services/auth'
import { esOnboardingPendiente } from '../src/services/semillas'
import { useAppActiva } from '../src/lib/appActiva'
import { AppDrawer } from '../src/ui/AppDrawer'
import {
  abrirLista,
  newPlaylist,
  setChromeH,
  setColapsada,
  setDrawer,
  setKeyboardH,
  setTab,
  setTabsVisible,
  useColapsada,
  useDrawer,
  useEnChat,
  useKeyboardH,
  useTab,
} from '../src/state/shell'
import { useBuscando } from '../src/state/busqueda'
import { ES_WEB, HAY_VIDRIO } from '../src/ui/Glass'
import { SearchRow } from '../src/ui/SearchRow'
import { Aviso } from '../src/ui/Aviso'
import { AvisoCaptura } from '../src/ui/AvisoCaptura'
import { NowPlayingBar } from '../src/ui/NowPlayingBar'
import { MotorAudio } from '../src/ui/MotorAudio'
import { MotorWebView } from '../src/services/motor/MotorWebView'
import { RADIO } from '../src/ui/tipografia'
import { esAterrizaje } from '../src/lib/compartir'
import { useEnlacesDelEscritorio } from '../src/lib/enlacesEscritorio'
import { CompartirHistoria } from '../src/ui/CompartirHistoria'
import { AvisoActualizacion } from '../src/ui/AvisoActualizacion'
import { ControlActualizaciones, AvisoActualizacionSinPolitica } from '../src/ui/ControlActualizaciones'
import { AvisoVincularGoogle } from '../src/ui/AvisoVincularGoogle'
import { NovedadesAlAbrir } from '../src/ui/NovedadesAlAbrir'
import { FilaChat } from '../src/ui/TabBar'
import { Cascara } from '../src/ui/Cascara'
import '../global.css'
import { AndroidTheme } from '../src/ui/AndroidTheme'

/** Debajo de esto no entran los tres paneles y la app pasa a pestañas. */
const SHELL_PX = 780
/**
 * Las hojas del Jam y de la cola, en web.
 *
 * En iOS son `formSheet` y el sistema pone la subida, el grabber y el
 * oscurecido. En web esa presentación no existe y caían como pantallas que
 * aparecen de golpe: acá se declaran transparentes —la misma receta que
 * «Sonando»— y el drawer lo dibuja cada pantalla con `Hoja` (src/ui/Hoja.tsx).
 */
const HOJA_WEB = {
  presentation: 'transparentModal',
  animation: 'none',
  contentStyle: { backgroundColor: 'transparent' },
} as const
/**
 * Formularios sociales breves: diálogo web y hoja nativa con teclado.
 *
 * El radio no es un número elegido a ojo: son los que mide el kit de iOS 27.
 * La hoja de detent completo va de borde a borde y redondea 38 arriba
 * (`RADIO.hojaGrande`); la que se queda en un detent parcial flota como
 * tarjeta y redondea 34 (`RADIO.hojaMedia`). Estaban todas en 24 —y ésta en
 * 28—, que es el radio de una hoja de iOS 18: es de los detalles que delatan
 * una app que no se actualizó, porque la esquina de la hoja se mira de cerca.
 */
const HOJA_SOCIAL = ES_WEB ? HOJA_WEB : {
  presentation: 'formSheet' as const,
  sheetAllowedDetents: [1],
  sheetGrabberVisible: true,
  sheetCornerRadius: RADIO.hojaGrande,
}
/** Cuánto sube el degradado por encima del reproductor. */
const FADE_PX = 36
/** Lo que tarda el panel en abrirse y cerrarse. */
const DRAWER_MS = 260
/**
 * Cuánto se curva la app al correrse para descubrir el panel.
 *
 * Generoso a propósito, y es lo que hace que se lea como una tarjeta apartada
 * y no como la pantalla cortada por una línea: con un radio chico el borde
 * izquierdo se ve casi recto contra el panel —una costura— y con este la app
 * se separa como un objeto con forma propia. Es el radio del referente.
 */
const DRAWER_RADIO = 44

/* Que el splash nativo no se baje solo: lo baja el `SplashAnimado`, que lo
   continúa en movimiento. En web es inofensivo (no hay splash nativo). */
void SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  // GestureHandlerRootView es obligatorio para que el arrastre de la ventana
  // de selección en la onda funcione — sin él los gestos no llegan nunca.
  const [splashListo, setSplashListo] = useState(false)
  /* Las tipografías del perfil, una vez y para toda la app. No bloquean el
     arranque: hasta que llegan, las piezas salen con la del sistema. */
  useFuentesDelPerfil()
  /* Apenas monta el árbol, se baja el splash nativo: atrás ya está el
     `SplashAnimado`, que toma la posta sin que se vea el corte. */
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {})
  }, [])
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <BandaVentana />
      <View style={{ flex: 1, minHeight: 0 }}>
        <AndroidTheme><ControlActualizaciones><Chrome /></ControlActualizaciones></AndroidTheme>
        {splashListo ? null : <SplashAnimado onDone={() => setSplashListo(true)} />}
      </View>
    </GestureHandlerRootView>
  )
}

/**
 * El contenido y lo que va abajo de todo.
 *
 * El reproductor y las pestañas viven acá afuera, hermanos del navegador y no
 * adentro de una pantalla: es lo que hace que la música siga sonando y que la
 * cáscara no parpadee al cambiar de pantalla.
 *
 * En el teléfono los dos **flotan sobre el contenido**, como tarjetas apoyadas
 * —así lo hacen Apple Music y Spotify— y el hueco que ocupan se reserva abajo
 * del contenido midiéndolos: si se restara a ojo, cada modelo de iPhone dejaría
 * un margen distinto y la última fila de una lista quedaría tapada en alguno.
 *
 * En escritorio depende del material: **con vidrio el reproductor también
 * flota** —es el mismo formato que el teléfono con iOS 26, y web ya sabe
 * dibujarlo (ver `Glass`)—; sin vidrio se apila como siempre, porque una
 * tarjeta flotante gris opaca solo taparía contenido sin devolver nada.
 */
function Chrome() {
  usePresenciaDiscord()
  /*
   * Pantallas donde la tarjeta del reproductor no va.
   *
   * En el editor de fragmento, porque ahí estás escuchando **otra cosa** —el
   * pedazo que vas a mandar— y tener al lado los controles de la cola es
   * ofrecer dos reproducciones a la vez sobre la misma pantalla.
   *
   * En editar perfil y en ajustes, porque son formularios: estás configurando
   * algo, no escuchando. La barra ahí no es un control a mano sino un pie que
   * come sesenta píxeles de la última fila, y en escritorio se apoyaba justo
   * encima del interruptor de «Perfil público».
   *
   * En los tres casos la cola sigue sonando si estaba sonando; simplemente no
   * se muestra.
   */
  const segmentos = useSegments() as string[]
  const enEditor = segmentos[0] === 'song'
  /**
   * Sin tarjeta del reproductor, pero con todo lo demás.
   *
   * Va aparte de `enEditor` porque el editor de fragmento además se queda sin
   * pestañas y sin buscador —es una pantalla que se apodera de todo—, y estas
   * dos no: en el teléfono son pantallas apiladas de una pestaña, y sacarles la
   * barra de abajo sería sacarles la navegación.
   */
  const sinReproductor =
    enEditor ||
    segmentos[0] === 'ajustes' ||
    segmentos[0] === 'onboarding' ||
    (segmentos[0] === 'profile' && segmentos[1] === 'editar')
  /*
   * Dónde estás parado, para la fila plegada.
   *
   * Es el mismo criterio que usa `Shell` para decidir si dibuja la barra: las
   * pantallas modales cuentan como raíz porque tapan todo mientras están
   * abiertas, y estando en el perfil manda la ruta y no la pestaña guardada.
   * Se repite acá porque la fila plegada la arma este componente —es el único
   * que puede meter el reproductor y las pestañas en la misma línea—.
   */
  const enRaiz =
    segmentos.length === 0 ||
    segmentos[0] === 'profile' ||
    segmentos[0] === 'playing' ||
    segmentos[0] === 'jam' ||
    segmentos[0] === 'cola' ||
    segmentos[0] === 'message'
  /*
   * Las pantallas que **tapan todo**. En web hay que taparlas a mano.
   *
   * Son las mismas que `enRaiz` cuenta como raíz «porque tapan todo mientras
   * están abiertas», y en el teléfono eso es literal: `presentation: 'modal'`
   * las presenta en un controlador propio, **por encima de la raíz de React**,
   * así que la cáscara de abajo desaparece sin que nadie haga nada. Es por eso
   * que la pantalla de «Sonando» se ve impecable en iOS.
   *
   * En web no existe esa presentación: el modal se dibuja en el mismo árbol, y
   * la cáscara —que es hermana del navegador y va posicionada al borde de
   * abajo, dibujada **después**— le queda encima. Sobre «Sonando» eso dejaba la
   * tarjeta del reproductor y las pestañas tapando la barra de posición y el
   * botón de play de la propia pantalla: dos reproductores apilados, uno arriba
   * del otro, y el de arriba el que menos hace falta.
   *
   * Se **oculta**, no se desmonta: adentro vive el vidrio, que se aplica una
   * sola vez y no se recupera si el nodo se remonta (ver `src/ui/Cascara.tsx`).
   * `chromeH` tampoco se toca — la pantalla de abajo sigue montada y necesita
   * su reserva, o al cerrar el modal sus listas darían un salto.
   */
  const tapaTodo =
    /* «Sonando» **en las dos plataformas**: dejó de ser un modal nativo para
       poder nacer donde está la tarjeta del reproductor (ver `app/playing.tsx`),
       así que ya no hay controlador que tape la cáscara por nosotros. */
    segmentos[0] === 'playing' ||
    (ES_WEB &&
      (segmentos[0] === 'vincular-google' || segmentos[0] === 'cola' || segmentos[0] === 'message' || segmentos[0] === 'jam'))
  const tabGuardada = useTab()
  const tabActiva = segmentos[0] === 'profile' ? 'perfil' : tabGuardada
  const { width } = useWindowDimensions()
  /** El alto de la franja del reloj, para el fundido de arriba. */
  const arriba = useSafeAreaInsets()
  const router = useRouter()
  const myProfile = useMyProfile()
  const user = useUser()
  const myLabel = myProfile?.displayName?.trim() || myProfile?.username || emailToUsername(user?.email) || 'vos'

  /*
   * El panel se descubre corriendo la app.
   *
   * `d` va de 0 a 1: la app se desplaza a su mismo tamaño y toma esquinas
   * redondeadas, dejando ver lo que hay abajo. El panel no se mueve — es el
   * fondo, y moverlo daría la sensación de dos capas peleando.
   */
  const drawer = useDrawer()
  /*
   * El panel lateral es **cosa del teléfono**.
   *
   * En ventana grande la app ya muestra sus paneles al mismo tiempo: la
   * biblioteca está a la vista, y el perfil y las conversaciones están a un
   * clic en la barra. Un panel que se abre para ofrecer los mismos destinos que
   * ya se ven es un segundo camino a lo mismo, y encima uno que tapa.
   *
   * El umbral es el mismo que decide todo lo demás en la app.
   */
  const conDrawer = width < SHELL_PX
  const anchoDrawer = Math.min(320, width * 0.8)

  /* Agrandar la ventana con el panel abierto lo dejaba abierto y sin forma de
     cerrarlo: el botón que lo abre tampoco existe en ese ancho. */
  useEffect(() => {
    if (!conDrawer && drawer) setDrawer(false)
  }, [conDrawer, drawer])
  /*
   * La cáscara se **corre por debajo del borde** al taparse — nunca por
   * opacidad.
   *
   * Primero fue un fundido, y era el error documentado en `Cascara.tsx`:
   * «ninguna opacidad sobre el vidrio ni sobre sus ancestros». La regla vale
   * también en web — Chromium compone el subárbol con alfa en un grupo
   * aislado y el `backdrop-filter` se queda sin fondo que muestrear: la
   * tarjeta y la píldora quedaban como fantasmas sin material, y a veces no
   * se recuperaban al volver. Deslizar es exactamente lo que ya hace el
   * plegado, y el vidrio lo sobrevive; además es lo que hace Apple Music con
   * su barra cuando el reproductor crece — se agacha, no se esfuma.
   */
  const velado = useSharedValue(0)
  useEffect(() => {
    velado.value = withTiming(tapaTodo ? 1 : 0, { duration: tapaTodo ? 200 : 260 })
  }, [tapaTodo, velado])

  const d = useSharedValue(0)
  const [montadoDrawer, setMontadoDrawer] = useState(false)

  useAnimatedReaction(
    () => d.value > 0,
    (hay, antes) => {
      if (hay !== antes) runOnJS(setMontadoDrawer)(hay)
    },
  )

  useEffect(() => {
    d.value = withTiming(drawer ? 1 : 0, {
      duration: DRAWER_MS,
      easing: drawer ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    })
  }, [drawer, d])

  /*
   * Solo transformaciones y el redondeo.
   *
   * La sombra iba acá adentro como texto interpolado y en web eso rompía el
   * estilo entero: no se dibujaba **nada**. Va fija más abajo, que además es lo
   * correcto — no hay razón para animar una sombra que solo se ve abierta.
   */
  /*
   * La app **no se achica**: se corre entera, a su mismo ancho.
   *
   * Antes llevaba una escala de 0.92 y eso abría franjas de piso arriba y
   * abajo de la tarjeta — se leía como una miniatura flotando y no como la
   * pantalla apartada. El referente la mueve a tamaño real: la única
   * deformación es el redondeo de las esquinas que quedan a la vista.
   */
  const contenido = useAnimatedStyle(() => ({
    transform: [{ translateX: d.value * anchoDrawer }],
    borderRadius: d.value * DRAWER_RADIO,
  }))
  /*
   * El mismo redondeo, para el nodo que recorta.
   *
   * Son dos capas y no una a propósito: **recortar y proyectar sombra se
   * pelean**. `overflow: 'hidden'` obliga a la capa a enmascararse contra sus
   * bordes, y una sombra es justo lo que se dibuja *afuera* de ellos; iOS lo
   * resuelve con una capa aparte, y encima Reanimated escribe el radio desde el
   * hilo de la interfaz, cuadro por cuadro, sobre esa misma capa. Con el vidrio
   * abajo —que muestrea lo que tiene detrás— esa capa la comparten tres cosas.
   *
   * Separado, cada nodo hace una sola: el de afuera se mueve y proyecta, el de
   * adentro redondea y recorta.
   */
  const recorte = useAnimatedStyle(() => ({ borderRadius: d.value * DRAWER_RADIO }))
  /*
   * La sombra nativa se enciende con el panel.
   *
   * En iOS va por `shadow*` y no por `boxShadow`: el box shadow se dibuja como
   * un rectángulo que no acompaña al radio que Reanimated escribe cuadro a
   * cuadro — se veía como una franja oscura **recta** contra la esquina curva
   * de la tarjeta. La sombra de capa de iOS sale de la silueta real ya
   * redondeada, así que sigue la curva sola. La opacidad va animada a
   * propósito: en cero, iOS ni compone la sombra, y cerrada la app no paga
   * nada. En web queda el box shadow fijo de siempre, que CSS sí curva.
   */
  const sombra = useAnimatedStyle(() => ({ shadowOpacity: d.value * 0.55 }))
  /* El velo sobre la app: con el panel abierto, lo que manda es el panel. Sin
     esto, el contenido de atrás compite a plena luz y cuesta leer cuál de los
     dos está al frente. Más liviano que antes a propósito: sobre el piso negro
     la tarjeta tiene que seguir leyéndose **más clara** que el fondo — a 0.55
     quedaba tan oscura como él y la escena perdía su orden de profundidad. */
  const velo = useAnimatedStyle(() => ({ opacity: d.value * 0.35 }))

  /** Cierra el panel y hace lo suyo. Sin cerrar, queda abierto detrás. */
  const cerrandoIr = (accion: () => void) => () => {
    setDrawer(false)
    accion()
  }
  const flotante = width < SHELL_PX
  /* Sin nada sonando no hay tarjeta que tape la lista, así que el velo se
     acorta: si no, quedaba una franja oscura enorme arriba de las pestañas. */
  const sonando = usePlaybackTrack() !== null
  const teclado = useKeyboardH()
  const buscando = useBuscando()
  const colapsada = useColapsada()
  const enChat = useEnChat()
  /*
   * La cáscara con pestañas: la forma que se pliega y se despliega.
   *
   * Es el mismo criterio que decidía antes si dibujar la barra. Fuera de acá
   * —el composer, el editor— queda el reproductor solo, sin nada que plegar.
   */
  const usuario = useUser()
  /* El token de push de este aparato y el toque de una notificación. Vive en
     el layout porque necesita al usuario y tiene que sobrevivir a cualquier
     pantalla. Ver `state/push`. */
  usePush(usuario?.id ?? null)
  const conPestanas = flotante && enRaiz && !!usuario && !enEditor && !buscando && !enChat
  const [altoVisible, setAltoVisible] = useState(0)
  useEffect(() => {
    if (conPestanas && altoVisible > 0) setChromeH(altoVisible + (sonando && !HAY_VIDRIO ? FADE_PX : 8))
  }, [conPestanas, altoVisible, sonando])
  /*
   * Si hay **algo debajo del reproductor** que se ocupe del margen del teléfono.
   *
   * Lo mira la tarjeta del reproductor para decidir si pone ese margen ella. La
   * bandera se llamaba «hay pestañas» y ahí estaba el error: buscando, debajo no
   * hay pestañas pero **sí está la fila del buscador**, así que la tarjeta
   * agregaba el área segura entera creyendo que era la última de la pila — y esa
   * franja de más era la que se veía entre el reproductor y el campo.
   *
   * Lo que importa no es qué hay abajo sino si hay algo.
   */
  const algoDebajo = conPestanas || (flotante && (buscando || (enChat && enRaiz)))
  useEffect(() => {
    setTabsVisible(algoDebajo)
  }, [algoDebajo])

  /*
   * El teclado manda mientras está abierto.
   *
   * Con `Will` en iOS el aviso llega **antes** de que suba, así que la cáscara
   * se va en el mismo movimiento y no se ve saltar. Android solo tiene `Did`.
   */
  useEffect(() => {
    const abre = Keyboard.addListener('keyboardWillShow', (e) =>
      setKeyboardH(e.endCoordinates.height),
    )
    const cierra = Keyboard.addListener('keyboardWillHide', () => setKeyboardH(0))
    const abreAndroid = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboardH(e.endCoordinates.height),
    )
    const cierraAndroid = Keyboard.addListener('keyboardDidHide', () => setKeyboardH(0))
    return () => {
      abre.remove()
      cierra.remove()
      abreAndroid.remove()
      cierraAndroid.remove()
    }
  }, [])
  /*
   * El contenido corre **hasta el borde de abajo**.
   *
   * Antes el contenedor se acortaba el alto de las pestañas, así que nada
   * pasaba por detrás de ellas. Con vidrio eso no tiene sentido: si no hay nada
   * abajo, no hay qué difuminar y el material se ve como un gris más. Ahora el
   * área mide todo y el lugar para llegar a la última fila lo reserva cada
   * lista adentro de su propio contenido, con `chromeH`.
   */


  /*
   * La cáscara **va pegada al teclado**, no a una imitación de su animación.
   *
   * Primero esto era un `bottom` atado al alto final: el aviso de iOS llega con
   * la altura de una sola vez, así que la fila saltaba a destino en un cuadro y
   * esperaba ahí al teclado. Después fue un `withTiming` con la duración que
   * informa el sistema, que ya acompañaba — pero seguía siendo *otra* animación
   * corriendo al lado, y cualquier diferencia de curva se nota.
   *
   * `useAnimatedKeyboard` no anima nada: expone el alto real del teclado como
   * un valor del hilo de la interfaz, actualizado en cada cuadro por el propio
   * sistema. La cáscara se limita a copiarlo. Van juntos porque **es el mismo
   * número**, al abrir, al cerrar y al arrastrar el teclado hacia abajo con el
   * dedo, que es el caso que ninguna animación propia puede seguir.
   *
   * Va por `translateY` y no por `bottom`: el primero se resuelve sin rehacer
   * el layout en cada cuadro, que es lo que se sentía tosco.
   */
  const tecladoVivo = useAnimatedKeyboard()
  const [altoCascara, setAltoCascara] = useState(0)
  const sigueAlTeclado = flotante && buscando
  const seVa = flotante && !buscando
  const sobreTeclado = useAnimatedStyle(() => {
    /* Lo que la esconde bajo una pantalla que tapa todo. El margen sobre el
       alto medido es generoso a propósito: la medida no cuenta la sombra ni
       lo que la fila plegada dibuja por encima de su marco, y con un margen
       justo quedaba una esquina de la tarjeta asomando sobre «Sonando».
       Pasarse de largo no se ve — más abajo del borde no hay nada. Se suma
       acá y no en un estilo aparte porque los dos mueven el MISMO
       `translateY`: dos estilos animados con la misma clave se pisan. */
    const esconde = velado.value * (altoCascara + 200)
    if (sigueAlTeclado) {
      return { transform: [{ translateY: -tecladoVivo.height.value + esconde }] }
    }
    /*
     * Sin buscar, la cáscara **se va hacia abajo** a medida que sube el
     * teclado, en vez de dejar de dibujarse.
     *
     * Vaciarla la hacía medir cero, y de ese cero salía un parpadeo feo: cada
     * lista reserva `chromeH` al final de su contenido, así que el hueco de
     * abajo del hilo del chat se desplomaba de golpe en un cuadro mientras
     * todo lo demás se movía suave. Deslizándola, el alto medido no cambia
     * nunca y no hay nada que se desplome.
     */
    if (seVa) {
      return {
        transform: [{ translateY: Math.min(tecladoVivo.height.value, altoCascara) + esconde }],
      }
    }
    return { transform: [{ translateY: esconde }] }
  })


  return (
    /*
     * El piso es **negro y una sola pieza**.
     *
     * Con el panel abierto se ve el fondo por tres lados: el panel a la
     * izquierda y las franjas que deja la tarjeta al achicarse. Cuando el
     * panel era `card` y el resto `background`, la costura entre los dos era
     * una línea vertical recta a la altura donde termina el panel — se leía
     * como un difuminado cortado que no seguía la curva de la tarjeta. El
     * referente no tiene esa costura porque no tiene dos superficies: el piso
     * es uno, lo más oscuro de la escena, y la app —más clara— flota encima.
     * Es la separación por luminancia de `DESIGN.md`, con el piso en canvas.
     */
    <View className="min-h-0 flex-1 bg-canvas">
      {/*
       * El motor de audio, montado **una sola vez y para siempre**.
       *
       * Va acá arriba de todo, hermano fijo de la app, y no adentro de la
       * cáscara: la barra de abajo se dibuja en cuatro formas según dónde estés
       * y cada una vive en una rama distinta del ternario de más abajo. Mientras
       * el reproductor viajaba adentro de la barra, cambiar de rama lo desmontaba
       * y lo volvía a crear —abrir el buscador, entrar a un chat— y la canción
       * arrancaba de cero.
       *
       * Este nodo no depende de ningún estado, así que React no lo mueve nunca.
       * No dibuja nada; solo suena. Ver `src/ui/MotorAudio.tsx`.
       */}
      <MotorAudio />
      {/*
       * El motor de a bordo: un WebView de 1×1 fuera de pantalla que atestigua
       * ante BotGuard y evalúa el JS que Hermes no puede.
       *
       * Va acá y no colgado del reproductor por el mismo motivo que `MotorAudio`
       * —este nodo no depende de ningún estado, así que React no lo desmonta
       * nunca— y encima le importa más: rehacerlo tira el integrity token de
       * BotGuard, que cuesta segundos y vale doce horas. En web y en binarios
       * viejos no dibuja nada. Ver `src/services/motor/`.
       */}
      <MotorWebView />
      {/* La tarjeta de compartir a historias: tampoco dibuja nada hasta que
          alguien pide una. Ver `src/ui/CompartirHistoria.tsx`. */}
      <CompartirHistoria />

      {/*
       * El panel lateral va **debajo** y de borde a borde; lo que se mueve es
       * la app. Se dibuja solo mientras hace falta: dejarlo montado sería tener
       * dos pantallas vivas todo el tiempo por algo que se usa de a ratos.
       */}
      {/*
       * Montado en cuanto se pide abrir, **no cuando la animación arrancó**.
       *
       * `montadoDrawer` sale de una reacción sobre `d.value > 0`, y eso llega
       * tarde: al abrir, el primer cuadro tiene `d` todavía en cero, así que la
       * app ya se está corriendo hacia la derecha mientras el panel no existe.
       * El hueco que va quedando a la izquierda se ve vacío y el panel aparece
       * de golpe uno o dos cuadros después —lo que se lee como que no hay
       * animación, sobre todo en web, donde el salto al hilo de JavaScript más
       * el redibujado de React tardan más que el arranque del movimiento.
       *
       * Con `drawer` adelante, el panel está en el árbol antes del primer
       * cuadro; `montadoDrawer` queda para el otro lado, mantenerlo vivo
       * mientras se cierra.
       */}
      {(drawer || montadoDrawer) && conDrawer ? (
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: anchoDrawer }}>
          <AppDrawer
            name={myLabel}
            avatarPath={myProfile?.avatarPath}
            onProfile={cerrandoIr(() => router.push('/profile'))}
            onPlaylists={cerrandoIr(() => setTab('listas'))}
            onChats={cerrandoIr(() => setTab('chats'))}
            onNowPlaying={cerrandoIr(() => router.push('/playing'))}
            onAjustes={cerrandoIr(() => router.push('/ajustes'))}
            onNewPlaylist={cerrandoIr(newPlaylist)}
            onOpenPlaylist={(id) => cerrandoIr(() => abrirLista(id))()}
          />
        </View>
      ) : null}

      {/*
       * El layout va inline y no por className.
       *
       * NativeWind no procesa clases sobre componentes animados —lo mismo que
       * documenta `Skeleton`— así que `flex-1` no llegaba: el contenedor tomaba
       * el alto de su contenido, el encabezado se dibujaba y los tres paneles
       * quedaban con cero de alto. En el teléfono no se notó porque ahí sí se
       * aplican.
       */}
      <Animated.View
        style={[
          { flex: 1, minHeight: 0 },
          /* La sombra, una por plataforma: en web el box shadow de CSS sigue
             el radio del borde solo; en iOS no lo hace (ver `sombra`), así que
             va la sombra de capa, con su opacidad animada por el mismo `d`. */
          ES_WEB
            ? { boxShadow: '-10px 0 40px rgba(0,0,0,0.8)' }
            : { shadowColor: '#000', shadowOffset: { width: -6, height: 0 }, shadowRadius: 28 },
          contenido,
          ES_WEB ? null : sombra,
        ]}
      >
      <Animated.View
        nativeID="dn-app-viewport"
        style={[
          { flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: 'rgb(0,0,0)' },
          recorte,
        ]}
      >
      <View className="min-h-0 flex-1">
        <SessionGate />
        <AvisoVincularGoogle />
      </View>
      {/*
       * El fundido de **arriba**: el borde del reloj, resuelto como el de abajo.
       *
       * En iOS 26 la barra de estado no tiene fondo: el contenido pasa por
       * detrás de la hora y de la batería, y sin esto quedaba cortado en seco
       * contra esa franja — el único borde duro de una app que funde todos los
       * demás. Apple recomienda exactamente esto para el borde de scroll: un
       * degradado del fondo hacia nada, para que las filas se apaguen antes de
       * tocar el reloj.
       *
       * Sobre una pantalla que ya deja la franja vacía (las que arrancan
       * debajo del área segura) es invisible: fondo sobre el mismo fondo. Solo
       * aparece donde hay contenido pasando por abajo, que es donde hace
       * falta. Va solo en el teléfono y con sesión — el login tiene su propia
       * luz arriba y este velo se la ensuciaría.
       *
       * Termina **justo en el borde del área segura**, no más abajo: la
       * portada dibuja su propio velo —más alto, detrás de sus redondeles
       * flotantes (ver `app/index.tsx`)— y si este siguiera de largo se
       * apilaría como una sombra sobre el avatar y los botones, que se dibujan
       * después que él.
       */}
      {flotante && usuario && !tapaTodo ? (
        <LinearGradient
          pointerEvents="none"
          colors={['rgb(18,18,18)', 'rgba(18,18,18,0.85)', 'rgba(18,18,18,0)']}
          locations={[0, 0.55, 1]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: arriba.top }}
        />
      ) : null}
      {/*
       * La cáscara **no se desmonta nunca**, ni con el teclado abierto.
       *
       * Acá adentro vive `NowPlayingBar`, y con él el reproductor de audio: el
       * `AudioPlayer` de expo-audio se libera al desmontarse su hook. Sacar
       * este nodo del árbol —que es lo que se hacía con el teclado arriba—
       * mataba el reproductor y lo volvía a crear al cerrarlo, así que la
       * música se cortaba y volvía a empezar de cero. Se veía como «buscar una
       * canción me reinicia la que estoy escuchando», y también pasaba al
       * renombrar una lista: las dos cosas abren el teclado.
       *
       * Lo que se va es **lo que se dibuja**, nunca el nodo.
       */}
      <Animated.View
        pointerEvents={tapaTodo ? 'none' : 'box-none'}
        onLayout={(e) => {
          const alto = e.nativeEvent.layout.height
          /* El alto medido sirve para saber cuánto deslizar la cáscara al
             abrirse el teclado. Lo que reservan las listas puede ser menos —ver
             `altoVisible`— porque plegada le queda arriba una franja
             transparente que el contenido atraviesa igual. */
          if (alto > 0) setAltoCascara(alto)
          if (!conPestanas) setChromeH(flotante || HAY_VIDRIO ? alto : 0)
        }}
        style={[
          /* Con vidrio la barra flota también en escritorio: el contenido
             corre hasta el borde de abajo y pasa por detrás del material, que
             es la regla 1 de `docs/DESIGN.md`, sección Vidrio. */
          flotante || HAY_VIDRIO
            ? {
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                paddingTop: sonando && !HAY_VIDRIO ? FADE_PX : 8,
              }
            : {},
          /* Bajo una pantalla que tapa todo se corre por debajo del borde —
             el corrimiento vive adentro de `sobreTeclado`, que ya es dueño
             del translateY. Nada de opacidad ni `display`: la primera mata el
             material (ver `velado` arriba), el segundo rehace su layout. */
          sobreTeclado,
        ]}
        /*
         * **Sin animación de alto.**
         *
         * Animar el marco de este nodo es reacomodar al ancestro de las dos
         * piezas de vidrio mientras el sistema decide si aplicarles el
         * material. Los dos problemas que documenta `expo-glass-effect` —el
         * efecto que no prende sin layout previo, y el que no se redibuja al
         * reasignarse— son exactamente eso, y el resultado es una pieza
         * transparente que ya no se recupera.
         *
         * Prefiero el cambio seco al vidrio roto. Cómo suavizarlo sin tocar el
         * material está anotado en la conversación, y no es este camino.
         */
      >
        {/*
         * El velo que funde el contenido con el fondo, **solo sin vidrio**.
         *
         * Sin el material, una fila queda cortada al medio detrás del
         * reproductor y se ve tosco: el degradado la apaga antes de que llegue.
         *
         * Con vidrio es exactamente lo contrario. El velo termina opaco contra
         * el borde de abajo, que es justo donde están la tarjeta y las
         * pestañas: el material terminaría difuminando un gris plano y se
         * vería como un panel gris más, con el costo de un efecto caro. Lo que
         * tiene que pasar por detrás es el contenido, entero y borroso — que es
         * de lo que se trata todo esto.
         */}
        {flotante && !HAY_VIDRIO ? (
          <LinearGradient
            colors={['rgba(18,18,18,0)', 'rgba(18,18,18,0.85)', 'rgb(18,18,18)']}
            locations={[0, 0.5, 1]}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {/* Siempre montado; `oculto` solo le dice que no se dibuje. En el
            editor de fragmento estás escuchando otra cosa, y con el teclado
            abierto la pantalla es para escribir — pero la cola sigue sonando
            en los dos casos, que es lo que este componente sostiene. */}
        {/*
         * Tres formas de la misma franja.
         *
         * Buscando, el campo reemplaza a las pestañas. Plegada, el reproductor
         * y la pestaña activa comparten una fila. Y si no, cada uno en la suya.
         *
         * Plegar solo tiene sentido con algo sonando: sin tarjeta en el medio,
         * la fila compacta serían dos redondeles y un hueco, y no se ganaría
         * nada — la barra entera ya es una sola franja.
         */}
        {buscando && flotante && !enEditor ? (
          /*
           * La fila del buscador no va en el editor de fragmento.
           *
           * Esa pantalla dibuja su **propio** campo —es apilada y no tiene
           * cáscara de pestañas, así que ahí el campo es la barra de abajo— y la
           * bandera de «estás buscando» sigue prendida al llegar desde otro
           * buscador: la pantalla de abajo no se desmonta al apilar una encima.
           * Sin esto quedaban los dos campos, uno arriba del otro, y el de la
           * cáscara encima con el texto de la búsqueda anterior.
           */
          <>
            {/*
             * Escribiendo, el reproductor se va.
             *
             * Con el teclado abierto la pantalla es para escribir: la tarjeta
             * queda apretada entre el teclado y los resultados, y lo que suena
             * puede esperar a que sueltes. Vuelve apenas cerrás el teclado, que
             * es cuando mirás resultados y tener el control a mano sirve.
             */}
            <NowPlayingBar oculto={sinReproductor || teclado > 0} />
            <SearchRow />
          </>
        ) : enChat && flotante && enRaiz ? (
          /*
           * Adentro de una conversación: la casa y lo que suena, en una fila.
           * El campo de escribir ya es la otra, y una tercera con las pestañas
           * se comía un tercio de la pantalla. Ver `FilaChat`.
           *
           * Va atado a `enRaiz` porque la pantalla del chat **no se desmonta**
           * al apilar otra encima: entrando a elegir una canción, la bandera
           * seguía prendida y esta fila se dibujaba ahí también, con su casa y
           * su reproductor, encima del buscador de esa pantalla.
           */
          <FilaChat>
            <NowPlayingBar compacta />
          </FilaChat>
        ) : conPestanas ? (
          /*
           * Desplegada y plegada son **la misma pieza**, no dos.
           *
           * Dibujar una u otra según el estado remonta el vidrio, y el material
           * se aplica una sola vez sin reintentar: la pieza queda transparente
           * para siempre. Ver la explicación entera en `src/ui/Cascara.tsx`.
           */
          <Cascara
            active={tabActiva}
            colapsada={colapsada && sonando}
            onExpandir={() => setColapsada(false)}
            onAltoVisible={setAltoVisible}
          >
            <NowPlayingBar compacta />
          </Cascara>
        ) : (
          /*
           * `!usuario` **es parte de la condición**, y faltaba.
           *
           * Las otras tres ramas piden sesión de una forma u otra; esta es el
           * caso por descarte, y se dibujaba también en el login y el registro
           * — con la cola de la sesión anterior, que encima no puede sonar
           * porque sus URLs se firman con una sesión que ya no está. Se veía
           * como un reproductor fantasma diciendo «no se pudo abrir esa
           * canción» sobre la pantalla de entrar.
           */
          <NowPlayingBar oculto={sinReproductor || !usuario} />
        )}
      </Animated.View>

      {/* El aviso va **fuera** de la cáscara y por encima de ella: se apoya
          sobre lo que haya, y no tiene que moverse con el teclado ni plegarse
          con la barra. */}
      {/* El rótulo de los botones de solo ícono. Como el aviso: lo pide
          cualquiera y se dibuja acá, una sola vez y encima de todo. Solo con
          mouse — ver `ui/Tooltip`. */}
      <Tooltip />
      <Aviso />
      {/*
       * «Hay una versión nueva y ya está bajada», solo en el escritorio.
       *
       * Acá y no más arriba en el árbol: la actualización llega cuando llega y
       * quien la está usando puede estar en cualquier pantalla, así que tiene
       * que quedar **por encima** de las pantallas. Montado antes, se dibujaba
       * pero la pantalla de turno le comía los clics — medido en el navegador
       * con el puente simulado. Ver `src/ui/AvisoActualizacion.tsx`.
       */}
      <AvisoActualizacionSinPolitica><AvisoActualizacion /></AvisoActualizacionSinPolitica>
      {/*
       * Qué trajo la versión que acabás de abrir, la primera vez que la abrís.
       *
       * Mismo lugar en la pila que el aviso y por la misma razón: se apoya
       * sobre lo que haya —abrir la app te deja en la portada, pero un link
       * compartido te deja en una lista— y tiene que quedar por encima de la
       * pantalla de turno para poder recibir el toque. Ver `NovedadesAlAbrir`.
       */}
      <NovedadesAlAbrir />
      {/* La oferta de compartir tras una captura de pantalla: mismo lugar en
          la pila que el aviso, por la misma razón. Ver `AvisoCaptura`. */}
      <AvisoCaptura />
      {/* La pregunta del traspaso: la música suena en otro dispositivo de la
          cuenta y alguien tocó el transporte acá. Puede saltar desde
          cualquier pantalla, así que vive en el mismo lugar que el aviso. */}
      <Traspaso />
      {/* El selector de dispositivos (Spotify Connect), abierto desde el menú del
          reproductor. Vive acá arriba porque la música suena desde cualquier lado. */}
      <SelectorDispositivos />

      {/* El velo y, encima, la zona que cierra: con el panel abierto, tocar la
          app lo cierra en vez de accionar lo que haya debajo del dedo. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgb(0,0,0)' }, velo]}
      />
      {drawer ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar el menú"
          onPress={() => setDrawer(false)}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      </Animated.View>
      </Animated.View>
    </View>
  )
}

/**
 * Arranca el ciclo de auth y redirige según haya sesión o no.
 *
 * `user === undefined` significa "todavía no sabemos" (Supabase no resolvió la
 * persistencia): en ese estado no se redirige, o se vería un flash del login
 * cada vez que ella abre la app ya logueada.
 */
function SessionGate() {
  const user = useAuthUser()
  const access = useAccessStatus()
  const accessError = useAccessError()
  const approved = !!user && access?.status === 'approved'
  /**
   * Todavía no sabemos si esta cuenta tiene acceso.
   *
   * Es el hermano de `user === undefined`, y va por el mismo motivo: `access`
   * arranca en `null`, que significa «la consulta no volvió», no «tu solicitud
   * está pendiente». Tratarlos igual mandaba a **todos** —también a quien tiene
   * acceso desde siempre— a la pantalla de solicitud pendiente durante el
   * medio segundo que tarda `access_status`, y de ahí de vuelta a la app: al
   * entrar aparecía un cartel de esperar confirmación y enseguida te largaba
   * adentro, como si algo hubiera estado a punto de salir mal.
   *
   * Si la consulta **falla**, eso sí es un estado que hay que mostrar: la
   * pantalla de acceso es la única con el botón para volver a consultar.
   */
  const accesoIncierto = !!user && access === null && !accessError
  const activa = useAppActiva()
  const segments = useSegments()
  const pathname = usePathname()
  const router = useRouter()
  /** Lo que se quiso abrir sin sesión, para llevarte ahí después de entrar. */
  const destino = useRef<string | null>(null)
  /* La cuenta que acaba de crearse debe su paseo por el onboarding. Se lee una
     vez al arrancar la app: es una bandera del aparato, no un dato vivo. */
  const [onboardingPendiente, setOnboardingPendiente] = useState(false)

  /* Los `dnmusic://` que le llegan al escritorio desde afuera. En el teléfono
     y en la web no hace nada: no hay puente. Ver `lib/enlacesEscritorio`. */
  useEnlacesDelEscritorio()

  useEffect(() => {
    startSession()
    void esOnboardingPendiente().then(setOnboardingPendiente)
    void cargarAjustes()
    void cargarEcualizador()
    /* Antes que nada de música: es lo que decide si una canción suena del
       teléfono o de la red, y contrasta el índice contra el disco. */
    void cargarDescargas()
  }, [])

  useEffect(() => {
    if (!user?.id || !activa) return
    void refrescarAcceso().catch(() => {})
    const timer = setInterval(() => { void refrescarAcceso().catch(() => {}) }, approved ? 60_000 : 15_000)
    return () => clearInterval(timer)
  }, [user?.id, activa, approved])

  useEffect(() => {
    if (user === undefined) return
    // Login y registro son las dos puertas de entrada: sin sesión se puede
    // estar en cualquiera de las dos, y con sesión en ninguna.
    const onCallback = segments[0] === 'auth'
    if (onCallback) return
    const onPending = segments[0] === 'acceso-pendiente'
    const onGate = segments[0] === 'sign-in' || segments[0] === 'sign-up'
    /*
     * Las cuatro rutas de link compartido se dibujan **sin sesión**, y son las
     * únicas de la app que lo hacen.
     *
     * Antes de esto, un link de WhatsApp abría el login y nada más: quien lo
     * recibía no llegaba a ver qué le habían mandado, y decidir si crearse una
     * cuenta sin saber para qué no lo hace nadie. Ahora la ruta se muestra en
     * modo tarjeta —`ui/Aterrizaje`, que lee el único RPC con excepción en la
     * reja— y la puerta viene después, con la cosa a la vista.
     *
     * El destino se guarda igual, así que entrar te devuelve exactamente acá.
     * Y no se abre nada: la tarjeta son cinco campos de presentación; escuchar,
     * ver el perfil entero o entrar al Jam sigue pidiendo cuenta aprobada, y
     * eso lo hace cumplir la RLS, no esta pantalla.
     */
    const enAterrizaje = esAterrizaje(segments)
    if (user && !approved) {
      /* Sin respuesta todavía no se mueve nada: quedás donde estabas —el login
         con su botón girando, o la app que ya estaba abierta— hasta que se
         sepa. Ver `accesoIncierto`. */
      if (accesoIncierto) return
      if (!onPending && !enAterrizaje) router.replace('/acceso-pendiente')
      return
    }
    if (!user && !onGate) {
      /*
       * Adónde querías ir, guardado antes de mandarte a entrar.
       *
       * Los links que se comparten —una lista pública, la invitación a un
       * Jam— casi siempre le llegan a alguien que no tiene la sesión abierta
       * en ese aparato. Sin esto, entrar te dejaba en la portada y el link
       * quedaba en la nada: quien lo mandó había compartido algo puntual y
       * del otro lado no llegaba nada.
       *
       * Se guarda el **pathname** y no los segmentos: `useSegments` da el
       * patrón de la ruta (`lista/[id]`), no el id que hay que abrir.
       */
      destino.current = pathname && pathname !== '/' ? pathname : null
      if (!enAterrizaje) router.replace('/sign-in')
    }
    if (approved && (onGate || onPending)) {
      /* Primero lo prometido en el registro: si la cuenta debe su paseo por
         las semillas, va ahí antes que a ningún destino guardado. */
      if (onboardingPendiente) {
        destino.current = null
        router.replace('/onboarding')
        return
      }
      const guardado = destino.current
      destino.current = null
      /* El tipo de `href` de expo-router enumera las rutas estáticas y no
         acepta un string armado en tiempo de ejecución; el destino salió de
         `usePathname`, así que es una ruta de esta misma app. */
      router.replace((guardado ?? '/') as '/')
    }
  }, [user, approved, accesoIncierto, segments, pathname, router, onboardingPendiente])

  /*
   * Todo lo que es «de quien escucha» espera a que haya alguien escuchando.
   *
   * La cola guardada **no se restaura sin sesión**: sus canciones se
   * reproducen con URLs firmadas por la cuenta, así que en el login es una
   * cola que no puede sonar; y si la sesión que la guardó era de otra persona,
   * mostrarla sería filtrarle lo que escuchaba a quien esté por entrar.
   *
   * Lo mismo con el Jam: la membresía vive en la base, así que cerrar la app
   * no te saca y se vuelve a enganchar solo, como un chat retoma sus mensajes.
   */
  useEffect(() => {
    if (!approved) return
    void restorePlayback()
    void restaurarVolumen()
    /* Qué trajo la versión que se está abriendo. Acá adentro y no en el
       arranque de más arriba porque sobre el login no hay nada que contar:
       quien todavía no entró no viene de actualizar nada suyo. */
    void cargarNovedadesVistas()
    void reconectarJam()
    /* La escucha compartida entre los dispositivos de la cuenta: se suscribe
       a la fila propia y reconcilia — si la música quedó en otro aparato,
       este arranca mostrándola en vez de la cola vieja del disco. */
    void iniciarEscucha()
    /* Los corazones: el reproductor los dibuja al instante y las
       recomendaciones los pesan, así que se cargan una vez y viven acá. */
    void cargarMeGusta()
  }, [user?.id, approved])

  /*
   * Mientras no se sepa quién sos —ni si podés entrar— no se dibuja ninguna
   * pantalla, solo esto.
   *
   * `accesoIncierto` va acá junto con `user === undefined` y no es un agregado:
   * son el mismo estado, «la respuesta no llegó», partido en dos consultas que
   * salen una detrás de la otra. Separarlos era el bug — apenas Supabase
   * resolvía la sesión, el único grupo de pantallas habilitado pasaba a ser el
   * de `acceso-pendiente`, así que entrar mostraba medio segundo de «esperando
   * la aprobación de @nihuel» antes de largarte adentro. Juntos, es un solo
   * girito que no se corta hasta que hay app.
   */
  if (user === undefined || accesoIncierto) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#FFFFFF" />
      </View>
    )
  }

  return (
    // El gesto de volver: ver el comentario de abajo.
    /*
     * El gesto de volver, dicho explícitamente.
     *
     * El estándar de iOS es **arrastrar desde el borde izquierdo**: lo hace todo
     * el sistema y la gente lo tiene en el dedo, sobre todo en pantallas grandes
     * donde la flecha de arriba a la izquierda queda lejos del pulgar. Android
     * no lo usa: ahí manda el gesto o el botón de atrás del sistema, que el
     * navegador ya atiende solo.
     *
     * Va escrito aunque sea el valor por defecto del stack nativo. Con el
     * encabezado oculto —que es nuestro caso en todas las pantallas— es fácil
     * dar por hecho que el gesto se fue con él, y esto deja constancia de que es
     * una decisión y no un descuido.
     *
     * `fullScreenGestureEnabled` queda **apagado** a propósito, que es lo que
     * hace el sistema. Arrastrar desde cualquier punto pelearía con los gestos
     * horizontales que ya existen adentro del contenido: la barra de posición
     * (`SeekBar`), la ventana de recorte sobre la onda (`Waveform`) y el arrastre
     * del reproductor. Los tres se activan a los 4px de movimiento horizontal, y
     * un gesto de pantalla completa se los comería.
     */
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        contentStyle: { backgroundColor: '#121212' },
      }}
    >
      <Stack.Protected guard={!user}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
      <Stack.Protected guard={!!user && !approved}>
        <Stack.Screen name="acceso-pendiente" />
      </Stack.Protected>
      <Stack.Protected guard={approved}>
      <Stack.Screen name="index" />
      <Stack.Screen name="importar" options={Platform.OS === 'ios' ? { ...HOJA_SOCIAL, sheetAllowedDetents: [0.6, 1], sheetInitialDetentIndex: 0 } : HOJA_SOCIAL} />
      <Stack.Screen name="vincular-google" options={HOJA_SOCIAL} />
      <Stack.Screen name="ajustes/novedades" />
      <Stack.Screen name="ajustes/accesos" />
      <Stack.Screen name="ajustes/compatibilidad" />
      {/* El onboarding: géneros y artistas con los que nace la radio de una
          cuenta nueva. Pantalla común, como las puertas de entrada. */}
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="compose" options={HOJA_SOCIAL} />
      <Stack.Screen name="compartir-contactos" options={HOJA_SOCIAL} />
      {/* Compartir una canción: la previa de la historia y las dos formas de
          pasarla. Mide su contenido —tres filas y una tapa— y no la pantalla
          entera. Ver `app/compartir.tsx`. */}
      <Stack.Screen
        name="compartir"
        options={
          ES_WEB
            ? HOJA_WEB
            : {
                presentation: 'formSheet',
                sheetAllowedDetents: 'fitToContents',
                sheetGrabberVisible: true,
                sheetCornerRadius: RADIO.hojaMedia,
              }
        }
      />
      <Stack.Screen name="ajustes/index" />
      <Stack.Screen name="ajustes/descargas" />
      <Stack.Screen name="ajustes/ecualizador" />
      <Stack.Screen name="ajustes/diagnostico-audio" />
      <Stack.Screen name="ajustes/bloqueados" />
      {/*
       * Sin animación: el perfil propio es una **pestaña**, aunque viva como
       * ruta. Las otras cuatro pestañas intercambian el contenido en el lugar,
       * y esta entraba deslizando desde el costado — el gesto que las HIG
       * reservan para meterse más adentro de una jerarquía, no para cambiar de
       * sección. Era la única pestaña que animaba, y se notaba como que el
       * perfil tenía otro layout. Su editor sí desliza: eso sí es jerarquía.
       */}
      <Stack.Screen name="profile/index" options={{ animation: 'none' }} />
      <Stack.Screen name="profile/editar/index" />
      <Stack.Screen name="profile/editar/musica" />
      <Stack.Screen name="profile/editar/[campo]" />
      {/* Armar una pieza del mosaico: el editor y el buscador son pantallas
          apiladas —hay teclado y lista—; la hoja de «+» y la del tema son
          hojas, como el marco. */}
      {/* En web van como hoja (angosta) o ventana centrada (escritorio): una
          pantalla de 520px a todo el ancho de una PC se lee como un teléfono
          gigante. En nativo siguen siendo pantallas apiladas. */}
      <Stack.Screen name="profile/vitrina" options={HOJA_SOCIAL} />
      <Stack.Screen name="profile/elegir" options={HOJA_SOCIAL} />
      {/* El mosaico de adentro de un sub-space: una pantalla apilada sobre el
          perfil, con el mismo modo de edición. Ver `app/profile/subspace`. */}
      <Stack.Screen name="profile/subspace" />
      <Stack.Screen
        name="profile/agregar"
        options={
          ES_WEB
            ? HOJA_WEB
            : {
                presentation: 'formSheet',
                sheetAllowedDetents: [0.85, 1],
                sheetInitialDetentIndex: 0,
                sheetGrabberVisible: true,
                sheetCornerRadius: RADIO.hojaMedia,
              }
        }
      />
      <Stack.Screen name="profile/fuente" options={HOJA_SOCIAL} />
      <Stack.Screen
        name="profile/tema"
        options={
          ES_WEB
            ? HOJA_WEB
            : {
                presentation: 'formSheet',
                sheetAllowedDetents: 'fitToContents',
                sheetGrabberVisible: true,
                sheetCornerRadius: RADIO.hojaMedia,
              }
        }
      />
      {/* Elegir una canción y recortarla son pasos del mismo formulario. */}
      <Stack.Screen name="song" options={HOJA_SOCIAL} />
      {/* iOS presenta una pantalla completa; el gesto de letras no cierra el player. */}
      <Stack.Screen name="dispositivos" options={HOJA_SOCIAL} />
      <Stack.Screen name="playing" options={Platform.OS === 'ios' ? {
        presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false,
        contentStyle: { backgroundColor: '#121212' },
      } : {
        presentation: 'transparentModal', animation: 'none',
        contentStyle: { backgroundColor: 'transparent' },
      }} />
      {/*
       * El Jam es una **pila de drawers nativos**, como el referente: la hoja
       * principal sube a tres cuartos y se estira a todo con el dedo; invitar
       * y las opciones se apilan encima, y el sistema oscurece y hunde lo de
       * atrás solo — cada nivel más oscuro es una hoja más arriba. En web no
       * hay UISheetPresentationController y caen a pantalla común, que es por
       * lo que la hoja dibuja su propia flecha de bajar solo ahí.
       *
       * La puerta del link (`jam/[code]`) sigue siendo una pantalla común:
       * llega desde afuera y no tiene nada detrás sobre lo que flotar.
       */}
      <Stack.Screen
        name="jam/index"
        options={
          ES_WEB
            ? HOJA_WEB
            : {
                presentation: 'formSheet',
                sheetAllowedDetents: [0.75, 1],
                /*
                 * Arranca **llena**, no a tres cuartos: desde iOS 26 los
                 * detents parciales flotan con márgenes a los costados —el
                 * look de tarjeta del rediseño— y la hoja del Jam se veía
                 * angosta, sin ocupar el ancho. En el detent completo el
                 * sistema la pega de borde a borde. El 0.75 sigue ahí para
                 * quien la baje con el dedo.
                 */
                sheetInitialDetentIndex: 1,
                sheetGrabberVisible: true,
                sheetCornerRadius: RADIO.hojaMedia,
              }
        }
      />
      <Stack.Screen
        name="jam/personas"
        options={
          ES_WEB
            ? HOJA_WEB
            : {
                presentation: 'formSheet',
                sheetAllowedDetents: [0.85],
                sheetGrabberVisible: true,
                sheetCornerRadius: RADIO.hojaMedia,
              }
        }
      />
      <Stack.Screen
        name="jam/opciones"
        options={
          ES_WEB
            ? HOJA_WEB
            : {
                presentation: 'formSheet',
                sheetAllowedDetents: 'fitToContents',
                sheetGrabberVisible: true,
                sheetCornerRadius: RADIO.hojaMedia,
              }
        }
      />
      {/*
        Crear una lista es **una** hoja —portada, nombre y si es colaborativa—
        como la «Nueva playlist» de Apple Music; si es colaborativa, al crear
        se reemplaza por la de sumar gente. Va llena porque abre el teclado.

        «Agregar música» y «Agregar a una lista» son las otras dos hojas de las
        listas: la primera elige varias canciones para una lista; la segunda,
        una lista para una canción. Las dos llenas: traen buscador y lista.
      */}
      <Stack.Screen
        name="lista/nueva"
        options={
          ES_WEB
            ? HOJA_WEB
            : {
                presentation: 'formSheet',
                sheetAllowedDetents: [1],
                sheetGrabberVisible: true,
                sheetCornerRadius: RADIO.hojaGrande,
              }
        }
      />
      <Stack.Screen
        name="lista/agregar"
        options={
          ES_WEB
            ? HOJA_WEB
            : {
                presentation: 'formSheet',
                sheetAllowedDetents: [1],
                sheetGrabberVisible: true,
                sheetCornerRadius: RADIO.hojaGrande,
              }
        }
      />
      <Stack.Screen
        name="lista/elegir"
        options={
          ES_WEB
            ? HOJA_WEB
            : {
                presentation: 'formSheet',
                sheetAllowedDetents: [0.85, 1],
                sheetInitialDetentIndex: 1,
                sheetGrabberVisible: true,
                sheetCornerRadius: RADIO.hojaMedia,
              }
        }
      />
      {/* Encuadrar la foto o el fondo: la misma hoja para las dos, cambiando
          la forma del recuadro. Va llena porque el recuadro de trabajo tiene
          que ser lo más grande posible — es donde se decide qué se ve. */}
      <Stack.Screen
        name="profile/marco"
        options={
          ES_WEB
            ? HOJA_WEB
            : {
                presentation: 'formSheet',
                contentStyle: { backgroundColor: '#121212' },
                sheetExpandsWhenScrolledToEdge: false,
                sheetAllowedDetents: [1],
                sheetGrabberVisible: true,
                sheetCornerRadius: RADIO.hojaGrande,
              }
        }
      />
      <Stack.Screen
        name="perfil/encuadrar"
        options={
          ES_WEB
            ? HOJA_WEB
            : {
                presentation: 'formSheet',
                sheetAllowedDetents: [1],
                sheetGrabberVisible: true,
                sheetCornerRadius: RADIO.hojaGrande,
              }
        }
      />
      <Stack.Screen
        name="lista/personas"
        options={
          ES_WEB
            ? HOJA_WEB
            : {
                presentation: 'formSheet',
                sheetAllowedDetents: [0.85],
                sheetGrabberVisible: true,
                sheetCornerRadius: RADIO.hojaMedia,
              }
        }
      />
      {/* La cola: qué viene después, con la anatomía de una lista. Es un
          drawer como los del Jam — se abre desde el reproductor y se apila
          sobre él, no lo reemplaza: mirás lo que viene y seguís donde estabas. */}
      <Stack.Screen
        name="cola"
        options={
          ES_WEB
            ? HOJA_WEB
            : {
                presentation: 'formSheet',
                sheetAllowedDetents: [0.75, 1],
                /* Llena, por lo mismo que el Jam: los detents parciales de
                   iOS 26 flotan con márgenes y la hoja quedaba angosta. */
                sheetInitialDetentIndex: 1,
                sheetGrabberVisible: true,
                sheetCornerRadius: RADIO.hojaMedia,
              }
        }
      />
      {/* El mensaje a pantalla completa, al modo de una historia. */}
      <Stack.Screen name="message/[id]" options={{ presentation: Platform.OS === 'ios' ? 'fullScreenModal' : 'modal' }} />
      </Stack.Protected>

      {/*
        Las cuatro rutas de link compartido: las únicas que se dibujan **sin**
        cuenta aprobada, y por eso las únicas que quedan afuera del grupo.
        `Stack.Protected` no es un detalle de navegación: una pantalla que no
        está en el grupo activo no se monta, así que mientras estuvieron acá
        adentro un link de WhatsApp terminaba en el login y quien lo recibía no
        llegaba a ver qué le habían mandado.

        Lo que se muestra sin sesión no es la pantalla: cada una cae en
        `ui/Aterrizaje`, que dibuja la tapa y la puerta y no lee más que
        `tarjeta_enlace` —el único RPC con excepción en la reja—. Escuchar, ver
        el perfil entero o entrar al Jam sigue pidiendo cuenta aprobada, y eso
        lo hace cumplir la RLS. Lo cubre `tests/acceso-session`, que exige que
        estas cuatro y solo estas cuatro estén afuera y que cada una tenga su
        aterrizaje.
      */}
      <Stack.Screen name="cancion/[id]" />
      {/* La lista pública de alguien: se llega por el link compartido o desde
          su perfil. Pantalla común, como la puerta de un Jam — llega de afuera
          y no tiene panel del medio detrás sobre el que flotar. */}
      <Stack.Screen name="lista/[id]" />
      <Stack.Screen name="jam/[code]" />
      {/* El perfil es una carpeta: la vista y su editor son pantallas
          distintas, apiladas. Ver `app/profile/`. */}
      <Stack.Screen name="perfil/[usuario]" />

      <Stack.Screen name="auth/callback" />
    </Stack>
  )
}
