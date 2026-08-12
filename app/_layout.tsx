import { useEffect, useState } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ActivityIndicator,
  Keyboard,
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
import { restorePlayback, usePlaybackTrack } from '../src/state/playback'
import { cargarAjustes } from '../src/state/ajustes'
import { cargarDescargas } from '../src/state/descargas'
import { reconectarJam } from '../src/state/jam'
import { startSession, useMyProfile, useUser } from '../src/state/session'
import { emailToUsername } from '../src/services/auth'
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
import { HAY_VIDRIO } from '../src/ui/Glass'
import { SearchRow } from '../src/ui/SearchRow'
import { Aviso } from '../src/ui/Aviso'
import { NowPlayingBar } from '../src/ui/NowPlayingBar'
import { MotorAudio } from '../src/ui/MotorAudio'
import { FilaChat } from '../src/ui/TabBar'
import { Cascara } from '../src/ui/Cascara'
import '../global.css'

/** Debajo de esto no entran los tres paneles y la app pasa a pestañas. */
const SHELL_PX = 780
/** Cuánto sube el degradado por encima del reproductor. */
const FADE_PX = 36
/** Lo que tarda el panel en abrirse y cerrarse. */
const DRAWER_MS = 260

export default function RootLayout() {
  // GestureHandlerRootView es obligatorio para que el arrastre de la ventana
  // de selección en la onda funcione — sin él los gestos no llegan nunca.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Chrome />
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
 * En escritorio se apilan como siempre: hay lugar de sobra y una barra fija se
 * lee mejor que una flotante.
 */
function Chrome() {
  /*
   * En el editor de fragmento no va la tarjeta del reproductor.
   *
   * Ahí estás escuchando **otra cosa** —el pedazo que vas a mandar— y tener al
   * lado los controles de la cola es ofrecer dos reproducciones a la vez sobre
   * la misma pantalla. La cola sigue sonando si estaba sonando; simplemente no
   * se muestra.
   */
  const segmentos = useSegments() as string[]
  const enEditor = segmentos[0] === 'song'
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
   * `d` va de 0 a 1: la app se desplaza, se achica un poco y toma esquinas
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
  const contenido = useAnimatedStyle(() => ({
    transform: [{ translateX: d.value * anchoDrawer }, { scale: 1 - d.value * 0.08 }],
    borderRadius: d.value * 28,
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
  const recorte = useAnimatedStyle(() => ({ borderRadius: d.value * 28 }))
  /* El velo sobre la app: con el panel abierto, lo que manda es el panel. Sin
     esto, el contenido de atrás compite a plena luz y cuesta leer cuál de los
     dos está al frente. */
  const velo = useAnimatedStyle(() => ({ opacity: d.value * 0.55 }))

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
    if (sigueAlTeclado) return { transform: [{ translateY: -tecladoVivo.height.value }] }
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
    if (seVa) return { transform: [{ translateY: Math.min(tecladoVivo.height.value, altoCascara) }] }
    return { transform: [{ translateY: 0 }] }
  })


  return (
    <View className="min-h-0 flex-1 bg-background">
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
       * El panel lateral va **debajo** y de borde a borde; lo que se mueve es
       * la app. Se dibuja solo mientras hace falta: dejarlo montado sería tener
       * dos pantallas vivas todo el tiempo por algo que se usa de a ratos.
       */}
      {montadoDrawer && conDrawer ? (
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
          {
            flex: 1,
            minHeight: 0,
            boxShadow: '-14px 0 36px rgba(0,0,0,0.7)',
          },
          contenido,
        ]}
      >
      <Animated.View
        style={[
          { flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: 'rgb(0,0,0)' },
          recorte,
        ]}
      >
      <View className="min-h-0 flex-1">
        <SessionGate />
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
       */}
      {flotante && usuario ? (
        <LinearGradient
          pointerEvents="none"
          colors={['rgb(18,18,18)', 'rgba(18,18,18,0.85)', 'rgba(18,18,18,0)']}
          locations={[0, 0.55, 1]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: arriba.top + 24 }}
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
        pointerEvents="box-none"
        onLayout={(e) => {
          const alto = e.nativeEvent.layout.height
          /* El alto medido sirve para saber cuánto deslizar la cáscara al
             abrirse el teclado. Lo que reservan las listas puede ser menos —ver
             `altoVisible`— porque plegada le queda arriba una franja
             transparente que el contenido atraviesa igual. */
          if (alto > 0) setAltoCascara(alto)
          if (!conPestanas) setChromeH(flotante ? alto : 0)
        }}
        style={[
          flotante
            ? {
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                paddingTop: sonando && !HAY_VIDRIO ? FADE_PX : 8,
              }
            : {},
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
            <NowPlayingBar oculto={enEditor || teclado > 0} />
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
          <NowPlayingBar oculto={enEditor} />
        )}
      </Animated.View>

      {/* El aviso va **fuera** de la cáscara y por encima de ella: se apoya
          sobre lo que haya, y no tiene que moverse con el teclado ni plegarse
          con la barra. */}
      <Aviso />

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
  const user = useUser()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    startSession()
    // La cola de la sesión anterior, en pausa y donde la dejaste.
    void restorePlayback()
    void cargarAjustes()
    /* Antes que nada de música: es lo que decide si una canción suena del
       teléfono o de la red, y contrasta el índice contra el disco. */
    void cargarDescargas()
  }, [])

  useEffect(() => {
    if (user === undefined) return
    // Login y registro son las dos puertas de entrada: sin sesión se puede
    // estar en cualquiera de las dos, y con sesión en ninguna.
    const onGate = segments[0] === 'sign-in' || segments[0] === 'sign-up'
    if (!user && !onGate) router.replace('/sign-in')
    if (user && onGate) router.replace('/')
  }, [user, segments, router])

  /*
   * Con sesión, ver si quedó un Jam abierto de antes: la membresía vive en la
   * base, así que cerrar la app no te saca — se vuelve a enganchar solo, como
   * un chat retoma sus mensajes. Sin Jam pendiente no hace nada.
   */
  useEffect(() => {
    if (user) void reconectarJam()
  }, [user])

  if (user === undefined) {
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
      <Stack.Screen name="index" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="compose" />
      {/* El perfil es una carpeta: la vista y su editor son pantallas
          distintas, apiladas. Ver `app/profile/`. */}
      <Stack.Screen name="perfil/[usuario]" />
      <Stack.Screen name="ajustes" />
      <Stack.Screen name="profile/index" />
      <Stack.Screen name="profile/editar/index" />
      <Stack.Screen name="profile/editar/musica" />
      <Stack.Screen name="profile/editar/[campo]" />
      {/* Ya no es un diálogo: es una pantalla de la app, con su propio
          sidebar colapsable como el panel principal. */}
      <Stack.Screen name="song" />
      {/* Lo que suena, a pantalla completa. Modal para que suba desde abajo y
          se pueda bajar con el gesto, como en cualquier reproductor. */}
      <Stack.Screen name="playing" options={{ presentation: 'modal' }} />
      {/* El Jam: el sheet sube como «Sonando», y la puerta del link es una
          pantalla común — llega desde afuera y no tiene nada detrás. */}
      <Stack.Screen name="jam/index" options={{ presentation: 'modal' }} />
      <Stack.Screen name="jam/[code]" />
      {/* La cola: qué viene después, con la anatomía de una lista. */}
      <Stack.Screen name="cola" options={{ presentation: 'modal' }} />
      {/* El mensaje a pantalla completa, al modo de una historia. */}
      <Stack.Screen name="message/[id]" options={{ presentation: 'modal' }} />
    </Stack>
  )
}
