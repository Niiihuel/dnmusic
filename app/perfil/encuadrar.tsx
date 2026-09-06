import { useState } from 'react'
import {
  Pressable,
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
import { mensajeError } from '../../src/lib/mensajeError'
import { volver } from '../../src/lib/volver'
import { avatarUrl, saveMyProfile, type Encuadre } from '../../src/services/profile'
import { ilustracionUrl, uploadIlustracionConProgreso } from '../../src/services/showcases'
import { avisar } from '../../src/state/aviso'
import { fondoPendiente, soltarFondoPendiente } from '../../src/state/fondoPendiente'
import { usePiso } from '../../src/state/shell'
import { setMyProfile, useMyProfile, useUser } from '../../src/state/session'
import { actualizarBorrador, useBorrador } from '../../src/state/vitrinaBorrador'
import { BotonConfirmar, BotonHoja, EncabezadoHoja } from '../../src/ui/EncabezadoHoja'
import { escalaQueCubre } from '../../src/ui/Encuadre'
import { ANCHO_HOJA, Hoja, useHojaModal } from '../../src/ui/Hoja'
import { BarraDeProgreso, porciento } from '../../src/ui/Progreso'
import { ICON_COLOR, IconGirarDer, IconGirarIzq } from '../../src/ui/icons'

/** Hasta dónde se puede acercar. Más allá, cualquier foto se ve rota. */
const ESCALA_MAX = 4

/** Hasta dónde gira el dial para cada lado. Más que eso ya es el otro paso de 90°. */
const FINO_MAX = 45
/** Cuánto recorre el dial por grado. Con 4px un giro entero de −45 a 45 es un tirón cómodo. */
const PX_POR_GRADO = 4
/** Por debajo de esto, al soltar el dial vuelve a cero: nadie quiere 1° de inclinación sin querer. */
const IMAN = 1.5

/**
 * Qué se está encuadrando. Las dos primeras viven en el perfil; `fondo-nuevo`
 * es un fondo recién elegido que todavía no subió (ver `state/fondoPendiente`);
 * las otras dos, en el borrador de la pieza (`state/vitrinaBorrador`), que
 * todavía no llegó a la base.
 */
type Que = 'foto' | 'fondo' | 'fondo-nuevo' | 'vitrina' | 'vitrina-imagen'

/**
 * Elegir cómo se ve la foto, el fondo o la imagen de una pieza: arrastrar
 * para mover, pellizcar para acercar, girar con el dial.
 *
 * **No recorta la imagen, la encuadra.** No se genera ningún archivo nuevo: lo
 * que se guarda son unos números que dicen cómo mirarla (ver la migración
 * `encuadre_perfil`). Esa es la diferencia que hace que un GIF de perfil siga
 * animado — el recortador del sistema en iOS devuelve un JPG de un cuadro, y
 * por eso una foto animada se subía bien y llegaba quieta.
 *
 * Y es lo que le da encuadre al **fondo**, que nunca tuvo ninguno, y a la
 * imagen de una pieza del mosaico: la misma pantalla, cambiando la forma del
 * recuadro y a dónde se escribe el resultado. Para la pieza no se guarda en
 * la base sino en el borrador, como el resto del editor: nada llega hasta
 * «Agregar al mosaico».
 *
 * **Un fondo recién elegido se encuadra antes de subir** (`fondo-nuevo`): la
 * pantalla trabaja sobre el archivo local, y el tilde sube el archivo —con
 * una barra de cuánto va— y recién entonces guarda la ruta con el encuadre.
 * Antes el fondo subía al toque y encuadrarlo era otra fila aparte, que casi
 * nadie encontraba.
 *
 * La rotación es la que abre Airbuds después de elegir la foto —pasos de 90°
 * y un dial fino—, pero sigue la regla de acá: es un número más del encuadre,
 * no un archivo nuevo.
 *
 * Es una hoja de las de siempre: la cruz cancela, el tilde guarda
 * (`EncabezadoHoja`), y abajo queda solo «Centrar».
 */
export default function Encuadrar() {
  const router = useRouter()
  const perfil = useMyProfile()
  const user = useUser()
  const borrador = useBorrador()
  const { width, height } = useWindowDimensions()
  const modal = useHojaModal()
  const piso = usePiso(24)
  const { que: queCrudo } = useLocalSearchParams<{ que?: string }>()
  const que: Que =
    queCrudo === 'fondo' ||
    queCrudo === 'fondo-nuevo' ||
    queCrudo === 'vitrina' ||
    queCrudo === 'vitrina-imagen'
      ? queCrudo
      : 'foto'
  const esVitrina = que === 'vitrina' || que === 'vitrina-imagen'
  const esFondo = que === 'fondo' || que === 'fondo-nuevo'
  const redondo = que === 'foto'
  /* A dónde se vuelve: la pieza a su editor, lo del perfil a «Editar perfil». */
  const destino = esVitrina ? '/profile/vitrina' : '/profile/editar'

  const [guardando, setGuardando] = useState(false)
  /** Cuánto subió el fondo nuevo, de 0 a 1; `null` mientras no se sube. */
  const [progreso, setProgreso] = useState<number | null>(null)

  /* De dónde sale la imagen y con qué encuadre arranca, según qué se encuadra. */
  const imagenDeVitrina =
    que === 'vitrina'
      ? (borrador?.estilo.fondo ?? null)
      : que === 'vitrina-imagen' && borrador?.contenido?.kind === 'imagen'
        ? borrador.contenido.imagen
        : null
  const pendiente = que === 'fondo-nuevo' ? fondoPendiente() : null
  const uri = esVitrina
    ? imagenDeVitrina
      ? ilustracionUrl(imagenDeVitrina.path)
      : null
    : que === 'fondo-nuevo'
      ? (pendiente?.uri ?? null)
      : que === 'fondo'
        ? perfil?.bannerPath
          ? ilustracionUrl(perfil.bannerPath)
          : null
        : avatarUrl(perfil?.avatarPath)
  const inicial: Encuadre | null = esVitrina
    ? (imagenDeVitrina?.encuadre ?? null)
    : que === 'fondo-nuevo'
      ? null
      : ((que === 'fondo' ? perfil?.bannerEncuadre : perfil?.avatarEncuadre) ?? null)

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
  const lado = Math.min(width - 48, ANCHO_HOJA - 48, Math.round(height * 0.4))
  const razonAlto = redondo ? 1 : que === 'vitrina-imagen' && borrador?.ancho === 'grande' ? 0.92 : 0.62
  const alto = Math.round(lado * razonAlto)
  /* El lado largo sobre el corto: lo que la rotación obliga a acercar. */
  const razon = Math.max(lado / alto, alto / lado)

  /*
   * El gesto vive en shared values y no en estado de React: mover una foto con
   * el dedo dispara decenas de eventos por segundo, y con `setState` cada uno
   * sería un render del árbol entero. Se pasa a JS una sola vez, al guardar.
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
    .onBegin(() => {
      xIni.value = x.value
      yIni.value = y.value
    })
    .onUpdate((e) => {
      /* En fracciones del lado, que es como se guarda: así el encuadre elegido
         acá sirve igual para el redondel chico de una fila. */
      const rot = giro.value + fino.value
      const esc = escalaEfectiva(escalaPedida.value, rot, razon, redondo)
      const dentro = limitar(
        xIni.value + e.translationX / lado,
        yIni.value + e.translationY / alto,
        esc,
        rot,
        lado,
        alto,
        redondo,
      )
      x.value = dentro.x
      y.value = dentro.y
    })

  const pellizcar = Gesture.Pinch()
    .onBegin(() => {
      escalaIni.value = escalaPedida.value
    })
    .onUpdate((e) => {
      escalaPedida.value = Math.min(ESCALA_MAX, Math.max(1, escalaIni.value * e.scale))
      /* Al alejar, lo que antes era un corrimiento válido puede dejar un borde
         al descubierto: se vuelve a meter adentro en el mismo gesto. */
      const rot = giro.value + fino.value
      const dentro = limitar(
        x.value,
        y.value,
        escalaEfectiva(escalaPedida.value, rot, razon, redondo),
        rot,
        lado,
        alto,
        redondo,
      )
      x.value = dentro.x
      y.value = dentro.y
    })

  const gesto = Gesture.Simultaneous(arrastrar, pellizcar)

  /*
   * El dial: una regla de marcas que corre debajo de una aguja fija. Se tira
   * horizontal y **solo** horizontal —el `activeOffsetX`— para que el scroll
   * vertical de la hoja siga siendo del scroll. Al soltar cerca de cero se
   * imanta: una inclinación de un grado nunca es a propósito.
   */
  const girarFino = Gesture.Pan()
    .activeOffsetX([-4, 4])
    .onBegin(() => {
      finoIni.value = fino.value
    })
    .onUpdate((e) => {
      fino.value = Math.min(FINO_MAX, Math.max(-FINO_MAX, finoIni.value - e.translationX / PX_POR_GRADO))
      const rot = giro.value + fino.value
      const dentro = limitar(
        x.value,
        y.value,
        escalaEfectiva(escalaPedida.value, rot, razon, redondo),
        rot,
        lado,
        alto,
        redondo,
      )
      x.value = dentro.x
      y.value = dentro.y
    })
    .onEnd(() => {
      if (Math.abs(fino.value) < IMAN) {
        fino.value = 0
        const rot = giro.value
        const dentro = limitar(
          x.value,
          y.value,
          escalaEfectiva(escalaPedida.value, rot, razon, redondo),
          rot,
          lado,
          alto,
          redondo,
        )
        x.value = dentro.x
        y.value = dentro.y
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
    escalaPedida.value = Math.min(ESCALA_MAX, Math.max(1, escalaPedida.value + paso))
    acomodar(giro.value + fino.value)
  }

  /**
   * Un cuarto de vuelta para cada lado. El giro se anima y el corrimiento se
   * acomoda para el ángulo de llegada: mientras la imagen gira puede asomar
   * una esquina un instante, pero donde cae está bien.
   */
  function girar(paso: number) {
    const destinoGiro = normalizarGiro(giro.value + paso)
    giro.value = withTiming(destinoGiro, { duration: 220 })
    acomodar(destinoGiro + fino.value)
  }

  /** Vuelve a meter el corrimiento adentro para la rotación dada. */
  function acomodar(rot: number) {
    const dentro = limitar(
      x.value,
      y.value,
      escalaEfectiva(escalaPedida.value, rot, razon, redondo),
      rot,
      lado,
      alto,
      redondo,
    )
    x.value = dentro.x
    y.value = dentro.y
  }

  /*
   * La misma cuenta que `estiloEncuadrado`, en el hilo de la interfaz: la caja
   * se agranda, se corre y se gira sobre su centro. Lo que ves acá es lo que
   * dibuja la tarjeta después.
   */
  const estilo = useAnimatedStyle(() => {
    const rot = giro.value + fino.value
    const esc = escalaEfectiva(escalaPedida.value, rot, razon, redondo)
    const anchoImg = lado * esc
    const altoImg = alto * esc
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
  function armarEncuadre(): Encuadre {
    const rot = giro.value + fino.value
    const encuadre: Encuadre = {
      /* Se redondea a tres decimales: la precisión de un dedo no llega ni
         cerca, y guardar 0.31578947368 es ruido en la base para siempre. */
      x: redondear(x.value),
      y: redondear(y.value),
      escala: redondear(escalaEfectiva(escalaPedida.value, rot, razon, redondo)),
    }
    /* Sin girar no se escribe: un encuadre sin rotación es el de siempre. */
    if (Math.round(rot) !== 0) encuadre.rotacion = Math.round(rot)
    return encuadre
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

  /** La cruz: nada se guarda, y el fondo que esperaba deja de esperar. */
  function cancelar() {
    if (guardando) return
    if (que === 'fondo-nuevo') soltarFondoPendiente()
    volver(router, destino)
  }

  async function guardar() {
    if (guardando || !uri) return
    if (esVitrina) {
      escribirEnBorrador(armarEncuadre())
      avisar('Imagen encuadrada')
      volver(router, destino)
      return
    }
    setGuardando(true)
    try {
      const encuadre = armarEncuadre()
      if (que === 'fondo-nuevo') {
        /* Primero el archivo, con la barra; después la ruta junto al encuadre,
           así el perfil nunca apunta a un fondo que todavía no existe. */
        if (!pendiente || !user) throw new Error('No hay ningún fondo por subir.')
        setProgreso(0)
        const ruta = await uploadIlustracionConProgreso(
          user.id,
          pendiente.blob,
          pendiente.fileName,
          pendiente.mime,
          setProgreso,
        )
        setMyProfile(await saveMyProfile({ bannerPath: ruta, bannerEncuadre: encuadre }))
        soltarFondoPendiente()
        avisar('Fondo puesto')
      } else {
        setMyProfile(
          await saveMyProfile(que === 'fondo' ? { bannerEncuadre: encuadre } : { avatarEncuadre: encuadre }),
        )
        avisar(que === 'fondo' ? 'Fondo encuadrado' : 'Foto encuadrada')
      }
      volver(router, destino)
    } catch (e) {
      avisar(mensajeError(e), true)
      setGuardando(false)
      setProgreso(null)
    }
  }

  /**
   * Volver al centro. Para lo que ya está guardado, borra el encuadre en su
   * lugar y sale; para lo que todavía no subió no hay nada guardado que
   * borrar: se reponen los valores en pantalla y se sigue encuadrando.
   */
  async function centrar() {
    if (guardando) return
    if (que === 'fondo-nuevo') {
      /* Los shared values se escriben a mano, como en `acercar`. */
      // eslint-disable-next-line react-hooks/immutability
      x.value = 0
      // eslint-disable-next-line react-hooks/immutability
      y.value = 0
      // eslint-disable-next-line react-hooks/immutability
      escalaPedida.value = 1
      // eslint-disable-next-line react-hooks/immutability
      giro.value = withTiming(0, { duration: 220 })
      // eslint-disable-next-line react-hooks/immutability
      fino.value = 0
      return
    }
    if (esVitrina) {
      escribirEnBorrador(null)
      avisar('Volvió al centro')
      volver(router, destino)
      return
    }
    setGuardando(true)
    try {
      const guardado = await saveMyProfile(
        que === 'fondo' ? { bannerEncuadre: null } : { avatarEncuadre: null },
      )
      setMyProfile(guardado)
      avisar('Volvió al centro')
      volver(router, destino)
    } catch (e) {
      avisar(mensajeError(e), true)
      setGuardando(false)
    }
  }

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
      izquierda={<BotonHoja tipo="cerrar" onPress={cancelar} />}
      derecha={
        <BotonConfirmar
          label="Guardar"
          activo={!!uri && !guardando}
          ocupado={guardando}
          onPress={() => void guardar()}
        />
      }
    />
  )

  if (!uri) {
    return (
      <Hoja>
        <View className="flex-1 bg-background">
          {encabezado}
          <View className="flex-1 items-center justify-center gap-4 px-8" style={{ minHeight: 240 }}>
            <Text className="text-muted-foreground text-center text-[13px]">
              {esVitrina
                ? 'Todavía no pusiste una imagen.'
                : que === 'fondo-nuevo'
                  ? 'No hay ningún fondo por subir. Volvé y elegí uno.'
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
      {/*
       * El scroll es la raíz de la hoja y la cabecera va **adentro, pegada
       * arriba** (`stickyHeaderIndices`): así la hoja nace con el alto del
       * sistema y el contenido nunca se dibuja debajo de la cabecera — que
       * es lo que pasaba en iOS con la cabecera y el scroll apilados en una
       * vista sin alto propio. Lo que sobra de alto reparte el contenido al
       * medio, no lo deja colgando arriba.
       */}
      <ScrollView
        className="flex-1 bg-background"
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: modal ? 24 : piso }}
      >
        {encabezado}
        <View
          className="flex-1 items-center justify-center gap-6 px-6 pt-2"
          style={{ maxWidth: ANCHO_HOJA, width: '100%', alignSelf: 'center' }}
        >
          <Text className="text-muted-foreground text-center text-[13px] leading-[18px]">
            Arrastrá para mover, pellizcá para acercar y girá con el dial.
          </Text>

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
                borderRadius: redondo ? lado / 2 : 16,
                backgroundColor: '#1F1F1F',
              }}
            >
              <Animated.Image source={{ uri }} style={estilo} resizeMode="cover" />
            </View>
          </GestureDetector>

          {/* Mientras sube, cuánto va: la barra ocupa el ancho del recuadro. */}
          {progreso !== null ? (
            <View style={{ width: lado }}>
              <BarraDeProgreso
                valor={progreso}
                rotulo={progreso >= 1 ? 'Guardando…' : `Subiendo el fondo… ${porciento(progreso)}`}
              />
            </View>
          ) : null}

          {/* Acercar y alejar, para quien no tiene con qué pellizcar. */}
          <View className="flex-row items-center gap-4">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Alejar"
              disabled={guardando}
              onPress={() => acercar(-0.25)}
              className="h-11 w-11 items-center justify-center rounded-full bg-muted active:opacity-70"
            >
              <Text className="text-foreground text-[20px] font-bold">−</Text>
            </Pressable>
            <Text className="text-muted-foreground text-[11px] uppercase tracking-[1.2px]">
              Acercar
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Acercar"
              disabled={guardando}
              onPress={() => acercar(0.25)}
              className="h-11 w-11 items-center justify-center rounded-full bg-muted active:opacity-70"
            >
              <Text className="text-foreground text-[20px] font-bold">+</Text>
            </Pressable>
          </View>

          {/*
           * Girar: los cuartos de vuelta a los costados y el dial fino en el
           * medio, con el ángulo escrito arriba de la aguja. Es el control de
           * enderezar de cualquier editor de fotos, y por eso se entiende sin
           * explicarlo.
           */}
          <View className="flex-row items-center gap-3" style={{ width: lado }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Girar un cuarto a la izquierda"
              disabled={guardando}
              onPress={() => girar(-90)}
              className="h-11 w-11 items-center justify-center rounded-full bg-muted active:opacity-70"
            >
              <IconGirarIzq size={18} color={ICON_COLOR.foreground} />
            </Pressable>
            <View className="min-w-0 flex-1 items-center gap-1.5">
              <Text className="text-muted-foreground text-[11px] tabular-nums tracking-[1.2px]">
                {grados}°
              </Text>
              <GestureDetector gesture={girarFino}>
                <View
                  accessibilityRole="adjustable"
                  accessibilityLabel="Enderezar"
                  accessibilityValue={{ text: `${grados} grados` }}
                  style={{ width: '100%', height: 36, overflow: 'hidden', justifyContent: 'center' }}
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Girar un cuarto a la derecha"
              disabled={guardando}
              onPress={() => girar(90)}
              className="h-11 w-11 items-center justify-center rounded-full bg-muted active:opacity-70"
            >
              <IconGirarDer size={18} color={ICON_COLOR.foreground} />
            </Pressable>
          </View>

          {/* Centrar es la única acción que queda abajo: guardar vive en el
              tilde de arriba, como en cualquier hoja. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver al centro"
            disabled={guardando}
            onPress={() => void centrar()}
            className="h-11 items-center justify-center rounded-full bg-muted px-5 active:opacity-80"
          >
            <Text className="text-foreground text-[14px] font-semibold">Centrar</Text>
          </Pressable>
        </View>
      </ScrollView>
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
function escalaEfectiva(pedida: number, rotacion: number, razon: number, redondo: boolean): number {
  'worklet'
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
): { x: number; y: number } {
  'worklet'
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
  return Math.round(n * 1000) / 1000
}
