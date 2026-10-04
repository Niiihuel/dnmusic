import { IconButton } from '../../src/ui/IconButton'
import { AccionSocial } from '../../src/ui/Social'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  type AnimatedStyle,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { volver } from '../../src/lib/volver'
import { avatarUrl, type Encuadre } from '../../src/services/profile'
import { ilustracionUrl } from '../../src/services/showcases'
import { avisar } from '../../src/state/aviso'
import { usePiso } from '../../src/state/shell'
import { actualizarBorrador, useBorrador } from '../../src/state/vitrinaBorrador'
import { BotonHoja, EncabezadoHoja } from '../../src/ui/EncabezadoHoja'
import { actualizarPerfilEdicion, useIniciarPerfilEdicion } from '../../src/state/perfilEdicion'
import { useSalidaConCambios } from '../../src/ui/useSalidaConCambios'
import { cajaOriginal, escalaOriginal, escalaQueCubre, limitarOriginal, zoomEnFoco } from '../../src/ui/Encuadre'
import { MedioEncuadre } from '../../src/ui/MedioEncuadre'
import { ANCHO_HOJA, Hoja, useHojaModal } from '../../src/ui/Hoja'
import { ICON_COLOR, IconGirarDer, IconGirarIzq } from '../../src/ui/icons'

/** Hasta dónde se puede acercar. Más allá, cualquier foto se ve rota. */
const ESCALA_MAX = 4

/** Hasta dónde gira el dial para cada lado. Más que eso ya es el otro paso de 90°. */
const FINO_MAX = 45
/** Cuánto recorre el dial por grado. Con 4px un giro entero de −45 a 45 es un tirón cómodo. */
const PX_POR_GRADO = 4
/** Por debajo de esto, al soltar el dial vuelve a cero: nadie quiere 1° de inclinación sin querer. */
const IMAN = 1.5

type Que = 'foto' | 'fondo' | 'vitrina' | 'vitrina-imagen'

/**
 * Guarda la geometría en el borrador sin generar otro archivo: así los GIF
 * conservan su animación. El editor de perfil o vitrina confirma los cambios
 * en la base; esta hoja sólo encuadra y protege la salida sin guardar.
 */
export default function Encuadrar() {
  const router = useRouter()
  const borrador = useBorrador()
  const { width, height } = useWindowDimensions()
  const modal = useHojaModal()
  const piso = usePiso(24)
  const { que: queCrudo } = useLocalSearchParams<{ que?: string }>()
  const que: Que =
    queCrudo === 'fondo' ||
    queCrudo === 'vitrina' ||
    queCrudo === 'vitrina-imagen'
      ? queCrudo
      : 'foto'
  const esVitrina = que === 'vitrina' || que === 'vitrina-imagen'
  const perfil = useIniciarPerfilEdicion(!esVitrina)
  const esFondo = que === 'fondo'
  const redondo = que === 'foto'
  /* A dónde se vuelve: la pieza a su editor, lo del perfil a «Editar perfil». */
  const destino = esVitrina ? '/profile/vitrina' : '/profile/editar'

  const [error, setError] = useState<string | null>(null)
  const [modificado, setModificado] = useState(false)
  const [salir, setSalir] = useState(false)
  const [manipulando, setManipulando] = useState(false)
  const [aspecto, setAspecto] = useState<number | undefined>(undefined)
  const [cargado, setCargado] = useState(false)

  /* De dónde sale la imagen y con qué encuadre arranca, según qué se encuadra. */
  const imagenDeVitrina =
    que === 'vitrina'
      ? (borrador?.estilo.fondo ?? null)
      : que === 'vitrina-imagen' && borrador?.contenido?.kind === 'imagen'
        ? borrador.contenido.imagen
        : null
  const uri = esVitrina
    ? imagenDeVitrina
      ? ilustracionUrl(imagenDeVitrina.path)
      : null
    : que === 'fondo'
      ? perfil?.bannerPath
        ? ilustracionUrl(perfil.bannerPath)
        : null
      : avatarUrl(perfil?.avatarPath)
  const [inicial] = useState<Encuadre | null>(() => esVitrina
    ? (imagenDeVitrina?.encuadre ?? null)
    : ((que === 'fondo' ? perfil?.bannerEncuadre : perfil?.avatarEncuadre) ?? null))

  /*
   * El recuadro de trabajo: cuadrado para la foto —así se ve en todos lados—,
   * apaisado para el fondo, que es una banda, y con la proporción de la pieza
   * para las de la vitrina: 16:10 como `VitrinaImagen`, casi cuadrado si la
   * pieza es 2×2. El fondo de una pieza toma la banda apaisada aunque la
   * tarjeta real dependa de lo que tenga adentro: es una aproximación, y la
   * cuenta del encuadre es la misma para cualquier alto.
   *
   * Acotado también **por el alto de la ventana**, no solo por el ancho. Sin
   * ese tope, en una ventana apaisada el círculo de 472px más el título y los
   * botones sumaban más que la pantalla: los controles quedaban debajo del
   * reproductor flotante — era el recuadro rojo del reporte.
   */
  const lado = Math.min(width - 32, ANCHO_HOJA - 32, Math.round(height * 0.52))
  const razonAlto = redondo ? 1 : que === 'vitrina-imagen' && borrador?.ancho === 'grande' ? 0.92 : 0.62
  const alto = Math.round(lado * razonAlto)
  /* El lado largo sobre el corto: lo que la rotación obliga a acercar. */
  const razon = Math.max(lado / alto, alto / lado)
  const base = aspecto ? cajaOriginal(lado, alto, aspecto) : { w: lado, h: alto }
  const alCargar = useCallback((w: number, h: number) => {
    if (w <= 0 || h <= 0) return
    // Los recortes viejos conservan su geometría; no cambian al abrir el editor.
    setAspecto(inicial ? inicial.aspecto : w / h)
    setCargado(true)
  }, [inicial])
  const alFallar = useCallback(() => {
    setCargado(false)
    setError('No se pudo abrir el archivo. Volvé a elegirlo en Fotos.')
  }, [])

  const dialogoSalida = useSalidaConCambios(modificado && !salir)
  useEffect(() => { if (salir) { if (esVitrina) volver(router, destino); else router.dismissTo('/profile/editar') } }, [salir, router, destino, esVitrina])

  /*
   * El gesto vive en shared values y no en estado de React: mover una foto con
   * el dedo dispara decenas de eventos por segundo, y con `setState` cada uno
   * sería un render del árbol entero. A JS sólo cruza el estado de cambios
   * al cambiar, además de los números al guardar.
   *
   * La rotación son dos valores: los pasos de 90° (`giro`) y el dial (`fino`),
   * que se suman. Separados porque los botones no tienen que mover el dial:
   * girar un cuarto de vuelta y después inclinar 3° son dos decisiones.
   *
   * La escala también son dos: la que la persona pidió y la que se dibuja.
   * Girar obliga a acercar para que no asomen las esquinas (ver `escalaMinima`),
   * pero si después vuelve a cero, tiene que volver el acercamiento que había
   * elegido y no quedarse con el que el giro le impuso.
   */
  const partes = partirRotacion(inicial?.rotacion ?? 0)
  const x = useSharedValue(inicial?.x ?? 0)
  const y = useSharedValue(inicial?.y ?? 0)
  const escalaPedida = useSharedValue(inicial?.escala ?? 1)
  const giro = useSharedValue(partes.giro)
  const fino = useSharedValue(partes.fino)
  const xIni = useSharedValue(0)
  const yIni = useSharedValue(0)
  const escalaIni = useSharedValue(1)
  const finoIni = useSharedValue(0)
  const pinchX = useSharedValue(0)
  const pinchY = useSharedValue(0)
  const focoX = useSharedValue(0)
  const focoY = useSharedValue(0)
  const escalaFoco = useSharedValue(1)
  const gestosActivos = useSharedValue(0)
  useAnimatedReaction(() => gestosActivos.value > 0, (actual, anterior) => {
    if (actual !== anterior) runOnJS(setManipulando)(actual)
  })

  // El estado sucio cruza de UI a JS sólo al cambiar el booleano, no por
  // cada pixel del gesto. La comparación usa la misma precisión del guardado.
  const inicioX = redondear(inicial?.x ?? 0)
  const inicioY = redondear(inicial?.y ?? 0)
  const inicioGiro = Math.round(inicial?.rotacion ?? 0)
  const inicioEscala = redondear(escalaEfectiva(inicial?.escala ?? 1, inicial?.rotacion ?? 0, razon, redondo, aspecto))
  useAnimatedReaction(
    () => redondear(x.value) !== inicioX || redondear(y.value) !== inicioY ||
      Math.round(giro.value + fino.value) !== inicioGiro ||
      redondear(escalaEfectiva(escalaPedida.value, giro.value + fino.value, razon, redondo, aspecto)) !== inicioEscala,
    (actual, anterior) => { if (actual !== anterior) runOnJS(setModificado)(actual) },
  )

  /* Lo que se ve en el rótulo del dial. Solo cambia por grado entero, así
     cruzar a JS pasa pocas veces y no en cada milímetro del gesto. */
  const [grados, setGrados] = useState(Math.round(partes.giro + partes.fino))
  useAnimatedReaction(
    () => Math.round(giro.value + fino.value),
    (actual, anterior) => {
      if (actual !== anterior) runOnJS(setGrados)(actual)
    },
  )

  const arrastrar = Gesture.Pan()
    .enabled(!salir && cargado)
    .maxPointers(1)
    .onStart(() => {
      xIni.set(x.value)
      yIni.set(y.value)
    })
    .onBegin(() => { gestosActivos.set(gestosActivos.value + 1) })
    .onFinalize(() => { gestosActivos.set(Math.max(0, gestosActivos.value - 1)) })
    .onUpdate((e) => {
      /* En fracciones del lado, que es como se guarda: así el encuadre elegido
         acá sirve igual para el redondel chico de una fila. */
      const rot = giro.value + fino.value
      const esc = escalaEfectiva(escalaPedida.value, rot, razon, redondo, aspecto)
      const dentro = limitar(
        xIni.value + e.translationX / lado,
        yIni.value + e.translationY / alto,
        esc,
        rot,
        lado,
        alto,
        redondo,
        aspecto,
      )
      x.set(dentro.x)
      y.set(dentro.y)
    })

  const pellizcar = Gesture.Pinch()
    .enabled(!salir && cargado)
    .onBegin(() => { gestosActivos.set(gestosActivos.value + 1) })
    .onFinalize(() => { gestosActivos.set(Math.max(0, gestosActivos.value - 1)) })
    .onStart((e) => {
      escalaIni.set(escalaPedida.value)
      escalaFoco.set(escalaEfectiva(escalaPedida.value, giro.value + fino.value, razon, redondo, aspecto))
      pinchX.set(x.value)
      pinchY.set(y.value)
      focoX.set(e.focalX)
      focoY.set(e.focalY)
    })
    .onUpdate((e) => {
      escalaPedida.set(Math.min(ESCALA_MAX, Math.max(1, escalaIni.value * e.scale)))
      /* Al alejar, lo que antes era un corrimiento válido puede dejar un borde
         al descubierto: se vuelve a meter adentro en el mismo gesto. */
      const rot = giro.value + fino.value
      const nuevaEscala = escalaEfectiva(escalaPedida.value, rot, razon, redondo, aspecto)
      const foco = zoomEnFoco(pinchX.value, pinchY.value, escalaFoco.value, nuevaEscala, focoX.value, focoY.value, lado, alto)
      const dentro = limitar(
        foco.x + (e.focalX - focoX.value) / lado,
        foco.y + (e.focalY - focoY.value) / alto,
        nuevaEscala,
        rot,
        lado,
        alto,
        redondo,
        aspecto,
      )
      x.set(dentro.x)
      y.set(dentro.y)
    })

  const gesto = Gesture.Simultaneous(arrastrar, pellizcar)

  /*
   * El dial: una regla de marcas que corre debajo de una aguja fija. Se tira
   * horizontal y **solo** horizontal —el `activeOffsetX`— para que el scroll
   * vertical de la hoja siga siendo del scroll. Al soltar cerca de cero se
   * imanta: una inclinación de un grado nunca es a propósito.
   */
  const girarFino = Gesture.Pan()
    .enabled(!salir && cargado)
    .activeOffsetX([-4, 4])
    .onBegin(() => {
      gestosActivos.set(gestosActivos.value + 1)
      finoIni.set(fino.value)
    })
    .onFinalize(() => { gestosActivos.set(Math.max(0, gestosActivos.value - 1)) })
    .onUpdate((e) => {
      fino.set(Math.min(FINO_MAX, Math.max(-FINO_MAX, finoIni.value - e.translationX / PX_POR_GRADO)))
      const rot = giro.value + fino.value
      const dentro = limitar(
        x.value,
        y.value,
        escalaEfectiva(escalaPedida.value, rot, razon, redondo, aspecto),
        rot,
        lado,
        alto,
        redondo,
        aspecto,
      )
      x.set(dentro.x)
      y.set(dentro.y)
    })
    .onEnd(() => {
      if (Math.abs(fino.value) < IMAN) {
        fino.set(0)
        const rot = giro.value
        const dentro = limitar(
          x.value,
          y.value,
          escalaEfectiva(escalaPedida.value, rot, razon, redondo, aspecto),
          rot,
          lado,
          alto,
          redondo,
          aspecto,
        )
        x.set(dentro.x)
        y.set(dentro.y)
      }
    })

  /*
   * Acercar con botones, además del pellizco.
   *
   * No es una comodidad: **con un mouse no existe el pellizco**, y sin acercar
   * no hay nada que mover —con escala 1 la imagen ocupa justo el recuadro y el
   * arrastre está correctamente fijado—. Sin esto, la pantalla entera no hacía
   * nada en el escritorio, que es donde se probó.
   *
   * Corre en JS y no en el hilo del gesto porque un toque no es un arrastre:
   * pasa una vez y no compite con nada.
   */
  function acercar(paso: number) {
    if (salir) return
    setError(null)
    escalaPedida.set(Math.min(ESCALA_MAX, Math.max(1, escalaPedida.value + paso)))
    acomodar(giro.value + fino.value)
  }

  /**
   * Un cuarto de vuelta para cada lado. El giro se anima y el corrimiento se
   * acomoda para el ángulo de llegada: mientras la imagen gira puede asomar
   * una esquina un instante, pero donde cae está bien.
   */
  function girar(paso: number) {
    if (salir) return
    setError(null)
    const destinoGiro = normalizarGiro(giro.value + paso)
    giro.set(withTiming(destinoGiro, { duration: 220 }))
    acomodar(destinoGiro + fino.value)
  }

  /** Vuelve a meter el corrimiento adentro para la rotación dada. */
  function acomodar(rot: number) {
    const dentro = limitar(
      x.value,
      y.value,
      escalaEfectiva(escalaPedida.value, rot, razon, redondo, aspecto),
      rot,
      lado,
      alto,
      redondo,
      aspecto,
    )
    x.set(dentro.x)
    y.set(dentro.y)
  }

  /*
   * La misma cuenta que `estiloEncuadrado`, en el hilo de la interfaz: la caja
   * se agranda, se corre y se gira sobre su centro. Lo que ves acá es lo que
   * dibuja la tarjeta después.
   */
  const estilo = useAnimatedStyle(() => {
    const rot = giro.value + fino.value
    const esc = escalaEfectiva(escalaPedida.value, rot, razon, redondo, aspecto)
    const anchoImg = base.w * esc
    const altoImg = base.h * esc
    return {
      position: 'absolute',
      width: anchoImg,
      height: altoImg,
      left: (lado - anchoImg) / 2 + x.value * lado,
      top: (alto - altoImg) / 2 + y.value * alto,
      transform: [{ rotate: `${rot}deg` }],
    }
  })

  const estiloRegla = useAnimatedStyle(() => ({
    transform: [{ translateX: -fino.value * PX_POR_GRADO }],
  }))

  /** Lo que hay en pantalla, como los números que se guardan. */
  function armarEncuadre(): Encuadre | null {
    const rot = giro.value + fino.value
    const encuadre: Encuadre = {
      /* Se redondea a tres decimales: la precisión de un dedo no llega ni
         cerca, y guardar 0.31578947368 es ruido en la base para siempre. */
      x: redondear(x.value),
      y: redondear(y.value),
      escala: redondear(Math.min(ESCALA_MAX, escalaEfectiva(escalaPedida.value, rot, razon, redondo, aspecto))),
      ...(aspecto ? { aspecto } : {}),
    }
    /* Sin girar no se escribe: un encuadre sin rotación es el de siempre. */
    if (Math.round(rot) !== 0) encuadre.rotacion = Math.round(rot)
    return encuadre.x === 0 && encuadre.y === 0 && encuadre.escala === 1 && !encuadre.rotacion ? null : encuadre
  }

  /** En el borrador de la pieza, en vez de en el perfil. */
  function escribirEnBorrador(encuadre: Encuadre | null) {
    if (que === 'vitrina-imagen') {
      actualizarBorrador((b) =>
        b.contenido?.kind === 'imagen'
          ? { contenido: { kind: 'imagen', imagen: { ...b.contenido.imagen, encuadre } } }
          : {},
      )
    } else {
      actualizarBorrador((b) =>
        b.estilo.fondo ? { estilo: { ...b.estilo, fondo: { ...b.estilo.fondo, encuadre } } } : {},
      )
    }
  }

  function cancelar() {
    if (salir) return
    volver(router, destino)
  }

  function guardar() {
    if (salir || !uri || !cargado) return
    if (!modificado) { setSalir(true); return }
    const encuadre = armarEncuadre()
    if (esVitrina) {
      escribirEnBorrador(encuadre)
      avisar('Imagen encuadrada')
    } else {
      actualizarPerfilEdicion(que === 'fondo' ? { bannerEncuadre: encuadre } : { avatarEncuadre: encuadre })
    }
    setSalir(true)
  }

  /** Centrar y restablecer sólo cambian el borrador; nunca escriben en la base. */
  function ponerEncuadre(encuadre: Encuadre | null) {
    if (salir) return
    const rotacion = partirRotacion(encuadre?.rotacion ?? 0)
    x.set(encuadre?.x ?? 0)
    y.set(encuadre?.y ?? 0)
    escalaPedida.set(encuadre?.escala ?? 1)
    giro.set(rotacion.giro)
    fino.set(rotacion.fino)
    setError(null)
  }
  function centrar() { ponerEncuadre(null) }

  const titulo =
    que === 'vitrina'
      ? 'Fondo de la pieza'
      : que === 'vitrina-imagen'
        ? 'Imagen'
        : esFondo
          ? 'Tu fondo'
          : 'Tu foto'

  const encabezado = (
    <EncabezadoHoja
      titulo={titulo}
      sobre="Encuadrar"
      izquierda={<BotonHoja tipo="cerrar" disabled={salir} onPress={cancelar} />}
      derecha={<IconButton label="Usar encuadre" symbol="checkmark" disabled={salir || !uri || !cargado} onPress={guardar} icon={<Text className="text-foreground">Listo</Text>} />}
    />
  )

  if (!uri) {
    return (
      <Hoja>
        {dialogoSalida}
        <View className="flex-1 bg-background">
          {encabezado}
          <View className="flex-1 items-center justify-center gap-4 px-8" style={{ minHeight: 240 }}>
            <Text className="text-muted-foreground text-center text-footnote">
              {esVitrina
                ? 'Todavía no pusiste una imagen.'
                : esFondo
                  ? 'Todavía no pusiste un fondo.'
                  : 'Todavía no pusiste una foto.'}
            </Text>
          </View>
        </View>
      </Hoja>
    )
  }

  return (
    <Hoja>
      {dialogoSalida}
      <View className="flex-1 bg-background">
      {encabezado}
      {/*
       * La cabecera queda pegada dentro del scroll. La raíz ocupa el alto
       * de la hoja y la barra flota sobre el espacio reservado al final.
       */}
      <ScrollView
        className="flex-1 bg-background"
        scrollEnabled={!manipulando}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: (modal ? 24 : piso) }}
      >
        <View
          className="flex-1 items-center justify-center gap-5 px-4 pt-2"
          style={{ maxWidth: ANCHO_HOJA, width: '100%', alignSelf: 'center' }}
        >
          {/*
           * El recuadro es la máscara: la imagen es más grande y lo que sobra
           * se recorta al dibujar. Es exactamente lo que va a pasar después en
           * el perfil, así que lo que ves acá es lo que queda.
           */}
          <GestureDetector gesture={gesto}>
            <View
              style={{
                width: lado,
                height: alto,
                overflow: 'hidden',
                borderRadius: redondo ? lado / 2 : 4,
                backgroundColor: '#1F1F1F',
              }}
            >
              <Animated.View style={estilo}>
                <MedioEncuadre uri={uri} onLoad={alCargar} onError={alFallar} />
              </Animated.View>
              {!cargado && !error ? <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#FFFFFF" /></View> : null}
              <View pointerEvents="none" style={{ position: 'absolute', inset: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)', borderRadius: redondo ? lado / 2 : 4 }} />
              {manipulando ? <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
                {[1, 2].map(n => <View key={`v${n}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${n * 100 / 3}%`, width: 1, backgroundColor: 'rgba(255,255,255,0.5)' }} />)}
                {[1, 2].map(n => <View key={`h${n}`} style={{ position: 'absolute', left: 0, right: 0, top: `${n * 100 / 3}%`, height: 1, backgroundColor: 'rgba(255,255,255,0.5)' }} />)}
              </View> : null}
            </View>
          </GestureDetector>

          {/* Acercar y alejar, para quien no tiene con qué pellizcar. */}
          <View className="flex-row items-center gap-4">
            <IconButton label="Alejar" symbol="minus" disabled={salir} onPress={() => acercar(-0.25)} variant="glass" icon={<Text className="text-foreground text-title3 font-bold">−</Text>} />
            <Text className="text-muted-foreground text-footnote uppercase">
              Acercar
            </Text>
            <IconButton label="Acercar" symbol="plus" disabled={salir} onPress={() => acercar(0.25)} variant="glass" icon={<Text className="text-foreground text-title3 font-bold">+</Text>} />
          </View>

          {/*
           * Girar: los cuartos de vuelta a los costados y el dial fino en el
           * medio, con el ángulo escrito arriba de la aguja. Es el control de
           * enderezar de cualquier editor de fotos, y por eso se entiende sin
           * explicarlo.
           */}
          <View className="flex-row items-center gap-3" style={{ width: lado }}>
            <IconButton label="Girar un cuarto a la izquierda" symbol="rotate.left" disabled={salir} onPress={() => girar(-90)} variant="glass" icon={<IconGirarIzq size={18} color={ICON_COLOR.foreground} />} />
            <View className="min-w-0 flex-1 items-center gap-1.5">
              <Text className="text-muted-foreground text-caption2 tabular-nums tracking-[1.2px]">
                {grados}°
              </Text>
              <GestureDetector gesture={girarFino}>
                <View
                  accessibilityRole="adjustable"
                  accessibilityLabel="Enderezar"
                  accessibilityValue={{ text: `${grados} grados` }}
                  accessibilityActions={[{ name: 'increment', label: 'Girar un grado a la derecha' }, { name: 'decrement', label: 'Girar un grado a la izquierda' }]}
                  onAccessibilityAction={e => {
                    if (salir) return
                    fino.set(Math.min(FINO_MAX, Math.max(-FINO_MAX, fino.value + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))
                    acomodar(giro.value + fino.value)
                  }}
                  style={{ width: '100%', height: 44, overflow: 'hidden', justifyContent: 'center' }}
                >
                  <Regla estilo={estiloRegla} />
                  {/* La aguja: blanco pleno porque es el estado activo, no un adorno (docs/DESIGN.md). */}
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: '50%',
                      marginLeft: -1,
                      top: 4,
                      width: 2,
                      height: 28,
                      borderRadius: 1,
                      backgroundColor: '#FFFFFF', // primary
                    }}
                  />
                </View>
              </GestureDetector>
            </View>
            <IconButton label="Girar un cuarto a la derecha" symbol="rotate.right" disabled={salir} onPress={() => girar(90)} variant="glass" icon={<IconGirarDer size={18} color={ICON_COLOR.foreground} />} />
          </View>

          {/* Centrar se prueba en pantalla; sólo Guardar cambios lo confirma. */}
          <AccionSocial label="Restablecer" secundaria disabled={salir} onPress={centrar} />
        </View>
      </ScrollView>
      {error ? <Text accessibilityRole="alert" className="text-destructive px-5 py-3">{error}</Text> : null}
      </View>
    </Hoja>
  )
}

/**
 * Las marcas del dial, de −45° a 45°: una cada dos grados, más alta cada diez.
 * Es un solo `Animated.View` que se corre entero debajo de la aguja; las
 * marcas son grises de la escala, la aguja de arriba es lo único blanco.
 *
 * Los estilos van por `style` y no por `className`: NativeWind no procesa las
 * clases de los componentes de Reanimated (docs/DESIGN.md).
 */
function Regla({ estilo }: { estilo: AnimatedStyle<ViewStyle> }) {
  const marcas: number[] = []
  for (let g = -FINO_MAX; g <= FINO_MAX; g += 2) marcas.push(g)
  const ancho = FINO_MAX * 2 * PX_POR_GRADO
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: '50%',
          marginLeft: -ancho / 2,
          width: ancho,
          height: 36,
        },
        estilo,
      ]}
    >
      {marcas.map((g) => {
        const grande = g % 10 === 0
        return (
          <View
            key={g}
            style={{
              position: 'absolute',
              left: (g + FINO_MAX) * PX_POR_GRADO - 0.5,
              top: grande ? 10 : 14,
              width: 1,
              height: grande ? 16 : 8,
              /* muted-foreground para las grandes; las chicas, más apagadas. */
              backgroundColor: grande ? '#B3B3B3' : '#4D4D4D',
            }}
          />
        )
      })}
    </Animated.View>
  )
}

/**
 * La escala más chica que cubre el recuadro para un ángulo dado: la cuenta
 * vive en `ui/Encuadre` (`escalaQueCubre`), que es la misma que después usa
 * la tarjeta al dibujar. Para el redondel es 1 siempre: un cuadrado girado
 * sobre su centro sigue conteniendo el círculo inscripto, y la foto de perfil
 * se dibuja siempre redonda (`Avatar`), así que no hace falta acercar nada.
 */
function escalaMinima(rotacion: number, razon: number, redondo: boolean): number {
  'worklet'
  return redondo ? 1 : escalaQueCubre(rotacion, razon, 1)
}

/** La escala que se dibuja: la pedida, o la que el giro obliga si es mayor. */
function escalaEfectiva(pedida: number, rotacion: number, razon: number, redondo: boolean, aspecto?: number): number {
  'worklet'
  if (aspecto) {
    const base = cajaOriginal(razon, 1, aspecto)
    return Math.max(pedida, escalaOriginal(rotacion, razon, 1, base.w, base.h, redondo))
  }
  return Math.max(pedida, escalaMinima(rotacion, razon, redondo))
}

/**
 * Que la imagen no pueda correrse tanto como para dejar un borde vacío.
 *
 * Con escala 1 y sin girar, la imagen mide justo el recuadro y no hay margen
 * para moverla: el tope es cero. Al acercar aparece sobrante, y la mitad de
 * ese sobrante es lo que se puede correr para cada lado.
 *
 * Con rotación la cuenta se hace **en el marco de la imagen**, no en el de la
 * pantalla: el corrimiento `(dx, dy)` se gira `−θ` para verlo desde la caja
 * girada, ahí el sobrante para cada lado vuelve a ser un rectángulo derecho
 * —`A` a los costados, `B` arriba y abajo, descontando lo que ocupa el
 * recuadro proyectado: `|cos θ|·ancho + |sin θ|·alto` en un eje y al revés en
 * el otro—, se acota ahí y se vuelve a girar `+θ` para la pantalla. Es exacto:
 * el conjunto de corrimientos válidos es justamente ese rectángulo girado.
 * Para el redondel el recuadro proyectado es siempre el círculo, así que el
 * descuento es el diámetro y no depende del ángulo.
 *
 * Los ejes siguen a `rotate` de React Native: positivo gira en el sentido del
 * reloj con el eje y hacia abajo, o sea `(x, y) → (x·cos − y·sin, x·sin + y·cos)`.
 *
 * Corre en el hilo de la interfaz junto al gesto — de ahí el `worklet`.
 */
function limitar(
  x: number,
  y: number,
  escala: number,
  rotacion: number,
  lado: number,
  alto: number,
  redondo: boolean,
  aspecto?: number,
): { x: number; y: number } {
  'worklet'
  if (aspecto) {
    const base = cajaOriginal(lado, alto, aspecto)
    return limitarOriginal(x, y, escala, rotacion, lado, alto, base.w, base.h, redondo)
  }
  const t = (rotacion * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  const ac = Math.abs(c)
  const as = Math.abs(s)
  const topeA = Math.max(0, redondo ? (lado * escala - lado) / 2 : (lado * escala - ac * lado - as * alto) / 2)
  const topeB = Math.max(0, redondo ? (alto * escala - alto) / 2 : (alto * escala - as * lado - ac * alto) / 2)
  const dx = x * lado
  const dy = y * alto
  /* Al marco de la imagen (girar −θ), acotar, y de vuelta (girar +θ). */
  const u = Math.min(topeA, Math.max(-topeA, c * dx + s * dy))
  const v = Math.min(topeB, Math.max(-topeB, -s * dx + c * dy))
  return { x: (c * u - s * v) / lado, y: (s * u + c * v) / alto }
}

/**
 * Un ángulo guardado, repartido entre los cuartos de vuelta y el dial: el
 * múltiplo de 90 más cercano y lo que sobra, que siempre cae en ±45.
 */
function partirRotacion(rotacion: number): { giro: number; fino: number } {
  const giro = normalizarGiro(Math.round(rotacion / 90) * 90)
  return { giro, fino: rotacion - Math.round(rotacion / 90) * 90 }
}

/** Los cuartos de vuelta, entre −180 y 180: dar la vuelta entera no acumula. */
function normalizarGiro(giro: number): number {
  return ((((giro + 180) % 360) + 360) % 360) - 180
}

function redondear(n: number): number {
  'worklet'
  return Math.round(n * 1000) / 1000
}
