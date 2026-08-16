import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { mensajeError } from '../../src/lib/mensajeError'
import { volver } from '../../src/lib/volver'
import { avatarUrl, saveMyProfile, type Encuadre } from '../../src/services/profile'
import { ilustracionUrl } from '../../src/services/showcases'
import { avisar } from '../../src/state/aviso'
import { setMyProfile, useMyProfile } from '../../src/state/session'
import { ANCHO_HOJA, Hoja } from '../../src/ui/Hoja'

/** Hasta dónde se puede acercar. Más allá, cualquier foto se ve rota. */
const ESCALA_MAX = 4

/**
 * Elegir cómo se ve la foto o el fondo: arrastrar para mover, pellizcar para
 * acercar.
 *
 * **No recorta la imagen, la encuadra.** No se genera ningún archivo nuevo: lo
 * que se guarda son tres números que dicen cómo mirarla (ver la migración
 * `encuadre_perfil`). Esa es la diferencia que hace que un GIF de perfil siga
 * animado — el recortador del sistema en iOS devuelve un JPG de un cuadro, y
 * por eso una foto animada se subía bien y llegaba quieta.
 *
 * Y es lo que le da encuadre al **fondo**, que nunca tuvo ninguno: la misma
 * pantalla, cambiando la forma del recuadro.
 */
export default function Encuadrar() {
  const router = useRouter()
  const perfil = useMyProfile()
  const { width } = useWindowDimensions()
  const { que } = useLocalSearchParams<{ que?: string }>()
  const esFondo = que === 'fondo'

  const [guardando, setGuardando] = useState(false)

  const ruta = esFondo ? perfil?.bannerPath : perfil?.avatarPath
  const uri = esFondo ? (ruta ? ilustracionUrl(ruta) : null) : avatarUrl(ruta)
  const inicial = (esFondo ? perfil?.bannerEncuadre : perfil?.avatarEncuadre) ?? null

  /* El recuadro de trabajo: cuadrado para la foto —así se ve en todos lados— y
     apaisado para el fondo, que es una banda. */
  const lado = Math.min(width - 48, ANCHO_HOJA - 48)
  const alto = esFondo ? Math.round(lado * 0.62) : lado

  /*
   * El gesto vive en shared values y no en estado de React: mover una foto con
   * el dedo dispara decenas de eventos por segundo, y con `setState` cada uno
   * sería un render del árbol entero. Se pasa a JS una sola vez, al guardar.
   */
  const x = useSharedValue(inicial?.x ?? 0)
  const y = useSharedValue(inicial?.y ?? 0)
  const escala = useSharedValue(inicial?.escala ?? 1)
  const xIni = useSharedValue(0)
  const yIni = useSharedValue(0)
  const escalaIni = useSharedValue(1)

  const arrastrar = Gesture.Pan()
    .onBegin(() => {
      xIni.value = x.value
      yIni.value = y.value
    })
    .onUpdate((e) => {
      /* En fracciones del lado, que es como se guarda: así el encuadre elegido
         acá sirve igual para el redondel chico de una fila. */
      x.value = limitar(xIni.value + e.translationX / lado, escala.value)
      y.value = limitar(yIni.value + e.translationY / alto, escala.value)
    })

  const pellizcar = Gesture.Pinch()
    .onBegin(() => {
      escalaIni.value = escala.value
    })
    .onUpdate((e) => {
      escala.value = Math.min(ESCALA_MAX, Math.max(1, escalaIni.value * e.scale))
      /* Al alejar, lo que antes era un corrimiento válido puede dejar un borde
         al descubierto: se vuelve a meter adentro en el mismo gesto. */
      x.value = limitar(x.value, escala.value)
      y.value = limitar(y.value, escala.value)
    })

  const gesto = Gesture.Simultaneous(arrastrar, pellizcar)

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
    const siguiente = Math.min(ESCALA_MAX, Math.max(1, escala.value + paso))
    escala.value = siguiente
    x.value = limitar(x.value, siguiente)
    y.value = limitar(y.value, siguiente)
  }

  const estilo = useAnimatedStyle(() => {
    const anchoImg = lado * escala.value
    const altoImg = alto * escala.value
    return {
      position: 'absolute',
      width: anchoImg,
      height: altoImg,
      left: (lado - anchoImg) / 2 + x.value * lado,
      top: (alto - altoImg) / 2 + y.value * alto,
    }
  })

  async function guardar() {
    if (guardando) return
    setGuardando(true)
    try {
      const encuadre: Encuadre = {
        /* Se redondea a tres decimales: la precisión de un dedo no llega ni
           cerca, y guardar 0.31578947368 es ruido en la base para siempre. */
        x: redondear(x.value),
        y: redondear(y.value),
        escala: redondear(escala.value),
      }
      const guardado = await saveMyProfile(
        esFondo ? { bannerEncuadre: encuadre } : { avatarEncuadre: encuadre },
      )
      setMyProfile(guardado)
      avisar(esFondo ? 'Fondo encuadrado' : 'Foto encuadrada')
      volver(router, '/')
    } catch (e) {
      avisar(mensajeError(e), true)
      setGuardando(false)
    }
  }

  async function centrar() {
    if (guardando) return
    setGuardando(true)
    try {
      const guardado = await saveMyProfile(
        esFondo ? { bannerEncuadre: null } : { avatarEncuadre: null },
      )
      setMyProfile(guardado)
      avisar('Volvió al centro')
      volver(router, '/')
    } catch (e) {
      avisar(mensajeError(e), true)
      setGuardando(false)
    }
  }

  if (!uri) {
    return (
      <Hoja>
        <View className="flex-1 items-center justify-center gap-4 bg-background px-8">
          <Text className="text-muted-foreground text-center text-[13px]">
            {esFondo ? 'Todavía no pusiste un fondo.' : 'Todavía no pusiste una foto.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => volver(router, '/')}
            className="rounded-full bg-muted px-5 py-2.5 active:opacity-80"
          >
            <Text className="text-foreground text-[13px] font-semibold">Volver</Text>
          </Pressable>
        </View>
      </Hoja>
    )
  }

  return (
    <Hoja>
      <View className="flex-1 bg-background">
        <View className="w-full flex-1 items-center gap-6 self-center px-6 pt-6"
          style={{ maxWidth: ANCHO_HOJA }}
        >
          <View className="items-center gap-1">
            <Text className="text-foreground text-[17px] font-bold">
              {esFondo ? 'Encuadrá tu fondo' : 'Encuadrá tu foto'}
            </Text>
            <Text className="text-muted-foreground text-center text-[12px] leading-4">
              Arrastrá para mover y pellizcá para acercar.
            </Text>
          </View>

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
                borderRadius: esFondo ? 16 : lado / 2,
                backgroundColor: '#1F1F1F',
              }}
            >
              <Animated.Image source={{ uri }} style={estilo} resizeMode="cover" />
            </View>
          </GestureDetector>

          {/* Acercar y alejar, para quien no tiene con qué pellizcar. */}
          <View className="flex-row items-center gap-4">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Alejar"
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
              onPress={() => acercar(0.25)}
              className="h-11 w-11 items-center justify-center rounded-full bg-muted active:opacity-70"
            >
              <Text className="text-foreground text-[20px] font-bold">+</Text>
            </Pressable>
          </View>

          <View className="flex-row items-center gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver al centro"
              disabled={guardando}
              onPress={() => void centrar()}
              className="h-12 items-center justify-center rounded-full bg-muted px-5 active:opacity-80"
            >
              <Text className="text-foreground text-[14px] font-semibold">Centrar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Guardar el encuadre"
              disabled={guardando}
              onPress={() => void guardar()}
              className="h-12 min-w-[132px] items-center justify-center rounded-full bg-primary px-8 active:opacity-80"
            >
              {guardando ? (
                <ActivityIndicator color="#121212" />
              ) : (
                <Text className="text-primary-foreground text-[15px] font-bold">Guardar</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Hoja>
  )
}

/**
 * Que la imagen no pueda correrse tanto como para dejar un borde vacío.
 *
 * Con escala 1 la imagen mide justo el recuadro y no hay margen para moverla:
 * el tope es cero. Al acercar aparece sobrante, y la mitad de ese sobrante es
 * lo que se puede correr para cada lado.
 *
 * Corre en el hilo de la interfaz junto al gesto — de ahí el `worklet`.
 */
function limitar(valor: number, escala: number): number {
  'worklet'
  const tope = (escala - 1) / 2
  return Math.min(tope, Math.max(-tope, valor))
}

function redondear(n: number): number {
  return Math.round(n * 1000) / 1000
}
