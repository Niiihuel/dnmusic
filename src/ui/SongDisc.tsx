import { useEffect, useRef, useState } from 'react'
import { Image, View } from 'react-native'
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { ES_WEB } from './Glass'
import { ICON_COLOR, IconMusic } from './icons'
import { artworkSource } from '../lib/artwork'

/**
 * Cuánto tarda una vuelta.
 *
 * Un disco real gira a 33 rpm, o sea 1.8 s por vuelta, que en pantalla se ve
 * frenético. Seis segundos se lee como "está sonando" sin pedir atención.
 */
const SPIN_MS = 6000
/** Lo que sigue girando al pausar, y cuánto tarda en frenar. */
const SPIN_DOWN_DEG = 14
const SPIN_DOWN_MS = 650

/*
 * En web la vuelta la da **CSS**, no Reanimated.
 *
 * Reanimated en web no tiene hilo de UI: escribe el `transform` desde el hilo
 * de JS en cada cuadro. Y esta pantalla tiene el hilo ocupado —la posición del
 * audio avanza diez veces por segundo, la onda se redibuja, la carátula
 * llega—, así que cada hipo del hilo se veía como un tirón del disco. Una
 * animación CSS vive en el compositor: sigue girando pareja aunque JS esté
 * haciendo otra cosa.
 *
 * Los keyframes van en una hoja global porque react-native-web no los registra
 * desde un estilo en línea — el mismo truco que usa el menú (`src/ui/Menu.tsx`).
 */
if (ES_WEB && typeof document !== 'undefined') {
  const hoja = document.createElement('style')
  hoja.textContent = `
@keyframes dn-disco-gira { to { transform: rotate(360deg) } }
[data-disco] {
  animation: dn-disco-gira ${SPIN_MS}ms linear infinite;
  /*
   * No es un adorno: sin capa propia el navegador vuelve a rasterizar el SVG
   * —dieciséis surcos más la carátula— en cada cuadro, en vez de rotar una
   * textura ya dibujada. Con esto, girar sale casi gratis.
   */
  will-change: transform;
}
[data-disco="quieto"] { animation-play-state: paused; }
`
  document.head.appendChild(hoja)
}

/** Proporciones respecto del diámetro. */
const LABEL_R = 0.3
const GROOVE_FROM = 0.335
const GROOVE_TO = 0.475
const GROOVES = 16

/**
 * El vinilo: la canción como objeto, no como control.
 *
 * Es la presentación de un mensaje ya armado. La onda sirve para recortar —es
 * una herramienta— y a quien recibe el mensaje no le sirve de nada; el disco,
 * en cambio, no se toca: se mira y se escucha.
 *
 * **Gira solo mientras suena.** No es decoración: un disco detenido comunica la
 * pausa sin agregar ningún ícono, y al pausar frena por inercia en vez de
 * congelarse de golpe. Al retomar arranca desde donde quedó, como un plato de
 * verdad.
 *
 * La carátula va en el centro, del tamaño de la etiqueta de un disco, y no
 * ocupando la cara entera: las carátulas son cuadradas y casi siempre tienen
 * texto, y verlo dar vueltas se lee como un error. Así gira el disco y la
 * imagen viaja con él, que es lo que pasa de verdad.
 */
export function SongDisc({
  artworkUrl,
  artworkPath,
  title,
  playing = false,
  size = 220,
}: {
  artworkUrl?: string | null
  /** Nuestra copia; se prefiere a la URL del CDN. Ver `artworkSource`. */
  artworkPath?: string | null
  title: string
  playing?: boolean
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  const angle = useSharedValue(0)
  /*
   * Con "reducir movimiento" activado el disco no gira.
   *
   * Algo rotando de forma indefinida es de lo peor que se le puede poner
   * enfrente a alguien con sensibilidad al movimiento, y acá además estaría en
   * el centro de la pantalla todo el tiempo que dure la canción.
   */
  const reduced = useReducedMotion()

  /*
   * Si nunca sonó, no hay nada que frenar.
   *
   * Sin esto el frenado se disparaba al montar —el estado inicial es "en
   * pausa"— y el disco giraba esos grados solo al abrir la pantalla, sin que
   * nadie hubiera tocado play.
   */
  const hasPlayed = useRef(false)

  useEffect(() => {
    // En web gira por CSS y no hay nada que manejar acá.
    if (ES_WEB || reduced) return
    if (!playing && !hasPlayed.current) return
    if (playing) {
      hasPlayed.current = true
      // El destino se calcula una vez; al repetirse vuelve a correr el mismo
      // tramo, y como 360° es una vuelta entera el empalme no se ve.
      angle.value = withRepeat(
        withTiming(angle.value + 360, { duration: SPIN_MS, easing: Easing.linear }),
        -1,
        false,
      )
    } else {
      cancelAnimation(angle)
      angle.value = withTiming(angle.value + SPIN_DOWN_DEG, {
        duration: SPIN_DOWN_MS,
        easing: Easing.out(Easing.quad),
      })
    }
  }, [playing, reduced, angle])

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }))

  /*
   * La vuelta en web: una animación infinita que se pausa en el lugar.
   *
   * `will-change` es la otra mitad y no es un adorno: sin eso el navegador
   * vuelve a rasterizar el SVG —dieciséis surcos y la carátula— en cada cuadro
   * en vez de rotar una textura ya dibujada. Con capa propia, girar sale casi
   * gratis.
   *
   * Lo que se pierde respecto de nativo es el frenado por inercia: `paused`
   * congela donde esté. Es el precio de que gire parejo, y en el teléfono
   * —donde la inercia se nota más— el camino de Reanimated sigue intacto.
   */
  const giroWeb =
    ES_WEB && !reduced ? { disco: playing ? 'gira' : 'quieto' } : undefined

  const c = size / 2
  const labelR = size * LABEL_R
  // A 2x, para que no se vea blanda en pantallas densas.
  const art = artworkSource(artworkPath, artworkUrl, Math.round(labelR * 4))
  const grooves = Array.from(
    { length: GROOVES },
    (_, i) => size * (GROOVE_FROM + (GROOVE_TO - GROOVE_FROM) * (i / (GROOVES - 1))),
  )

  return (
    <Animated.View
      accessibilityLabel={`Disco de ${title}`}
      {...({ dataSet: giroWeb } as object)}
      style={[
        { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
        ES_WEB ? null : spin,
      ]}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          {/*
            El degradado es la única forma de que un círculo negro sobre fondo
            negro se lea como un objeto con volumen. Va de gris a casi negro:
            sigue siendo monocromo, no introduce ningún tono.
          */}
          <RadialGradient id="vinilo" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#2E2E2E" />
            <Stop offset="0.72" stopColor="#1A1A1A" />
            <Stop offset="1" stopColor="#0D0D0D" />
          </RadialGradient>
        </Defs>

        <Circle cx={c} cy={c} r={size / 2} fill="url(#vinilo)" />
        {/* Canto: define el borde contra el panel sin dibujar una línea dura. */}
        <Circle cx={c} cy={c} r={size / 2 - 0.5} stroke="#FFFFFF" strokeOpacity={0.14} fill="none" />

        {grooves.map((r) => (
          <Circle
            key={r}
            cx={c}
            cy={c}
            r={r}
            stroke="#FFFFFF"
            strokeOpacity={0.07}
            strokeWidth={1}
            fill="none"
          />
        ))}
      </Svg>

      {art && !failed ? (
        <Image
          source={{ uri: art }}
          /*
           * No alcanza con preguntar si hay URL: la carátula viene del CDN de
           * Google, que a veces responde 429 y el navegador la descarta. Sin
           * este respaldo la etiqueta del disco quedaba vacía —un agujero en el
           * centro de la pantalla— en lugar de mostrar algo.
           */
          onError={() => setFailed(true)}
          style={{ width: labelR * 2, height: labelR * 2, borderRadius: labelR }}
          accessibilityLabel={`Carátula de ${title}`}
        />
      ) : (
        <View
          style={{
            width: labelR * 2,
            height: labelR * 2,
            borderRadius: labelR,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          className="bg-muted"
        >
          <IconMusic size={Math.round(size * 0.11)} color={ICON_COLOR.muted} />
        </View>
      )}

      {/*
        Solo el aro de la etiqueta. El agujero del eje quedaba justo sobre la
        parte central de la tapa —donde suele estar la cara o el motivo— y
        tapaba lo mejor de la imagen a cambio de un detalle que nadie mira.
      */}
      <Svg width={size} height={size} style={{ position: 'absolute' }} pointerEvents="none">
        <Circle cx={c} cy={c} r={labelR} stroke="#FFFFFF" strokeOpacity={0.12} fill="none" />
      </Svg>
    </Animated.View>
  )
}
