import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'

/**
 * Los marcos del avatar: decoraciones dibujadas, no assets.
 *
 * La idea viene de las decoraciones de Discord y los marcos de Steam, con una
 * decisión distinta de fondo: **se dibujan acá**, con SVG y animación, en vez
 * de subir imágenes. No hay archivo que hospedar ni catálogo que se muera con
 * un CDN ajeno (la lección de decoprofile: 429 decoraciones apuntando a un
 * Drive que hoy da 404), pesan cero bytes, y quedan en el idioma acromático de
 * `docs/DESIGN.md` — blanco, grises, y el brillo como acento.
 *
 * La regla geométrica es la de las referencias: el marco **desborda** a la
 * foto, no la pisa. Discord usa 1,2× el lado del avatar y Steam ~1,3×; acá el
 * anillo vive en ese margen y la foto queda intacta.
 *
 * En la base el marco es solo un nombre (`profiles.marco`): qué se dibuja con
 * ese nombre vive en este archivo. Un nombre que esta versión no conozca se
 * dibuja como ninguno — un perfil editado por una app más nueva no rompe a la
 * vieja.
 */

/** Cuánto desborda el marco a la foto. La regla del 1,2× de las referencias. */
const DESBORDE = 1.2

export const MARCOS = [
  { id: 'aro', nombre: 'Aro' },
  { id: 'pulso', nombre: 'Pulso' },
  { id: 'orbita', nombre: 'Órbita' },
  { id: 'trazos', nombre: 'Trazos' },
  { id: 'destello', nombre: 'Destello' },
] as const

export type MarcoId = (typeof MARCOS)[number]['id']

/**
 * El marco alrededor de un hueco cuadrado de `size` px.
 *
 * Se dibuja **encima y por fuera** con posición absoluta: quien lo usa apila
 * `<Marco>` como hermano del avatar, y el marco se centra solo. `pointerEvents`
 * apagado — es decoración, y el círculo de la foto sigue siendo el blanco.
 */
export function Marco({ marco, size }: { marco: string | null | undefined; size: number }) {
  if (!marco) return null
  const lado = Math.round(size * DESBORDE)
  const caja = {
    position: 'absolute' as const,
    top: -(lado - size) / 2,
    left: -(lado - size) / 2,
    width: lado,
    height: lado,
  }

  switch (marco) {
    case 'aro':
      return (
        <View pointerEvents="none" style={caja}>
          <Aro lado={lado} />
        </View>
      )
    case 'pulso':
      return (
        <View pointerEvents="none" style={caja}>
          <Pulso lado={lado} />
        </View>
      )
    case 'orbita':
      return (
        <View pointerEvents="none" style={caja}>
          <Orbita lado={lado} />
        </View>
      )
    case 'trazos':
      return (
        <View pointerEvents="none" style={caja}>
          <Trazos lado={lado} />
        </View>
      )
    case 'destello':
      return (
        <View pointerEvents="none" style={caja}>
          <Destello lado={lado} />
        </View>
      )
    default:
      /* Un marco que esta versión no conoce: nada, sin romper. */
      return null
  }
}

/** Dos aros finos, quietos: el marco de quien quiere marco sin espectáculo. */
function Aro({ lado }: { lado: number }) {
  const c = lado / 2
  return (
    <Svg width={lado} height={lado}>
      <Circle cx={c} cy={c} r={c - 1.5} stroke="rgba(255,255,255,0.85)" strokeWidth={1.5} fill="none" />
      <Circle cx={c} cy={c} r={c - 5.5} stroke="rgba(255,255,255,0.28)" strokeWidth={1} fill="none" />
    </Svg>
  )
}

/** Un aro que respira: crece apenas y se desvanece, como un pulso lento. */
function Pulso({ lado }: { lado: number }) {
  const t = useSharedValue(0)
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }), -1)
    return () => cancelAnimation(t)
  }, [t])
  const estilo = useAnimatedStyle(() => ({
    opacity: 0.7 * (1 - t.value),
    transform: [{ scale: 0.88 + t.value * 0.12 }],
  }))
  const c = lado / 2
  return (
    <>
      <Svg width={lado} height={lado} style={{ position: 'absolute' }}>
        <Circle cx={c} cy={c} r={c - 2} stroke="rgba(255,255,255,0.7)" strokeWidth={1.5} fill="none" />
      </Svg>
      <Animated.View style={[{ width: lado, height: lado }, estilo]}>
        <Svg width={lado} height={lado}>
          <Circle cx={c} cy={c} r={c - 2} stroke="#FFFFFF" strokeWidth={2} fill="none" />
        </Svg>
      </Animated.View>
    </>
  )
}

/** Un satélite dando la vuelta. El contenedor rota; el punto solo está. */
function Orbita({ lado }: { lado: number }) {
  const giro = useSharedValue(0)
  useEffect(() => {
    giro.value = withRepeat(withTiming(360, { duration: 6000, easing: Easing.linear }), -1)
    return () => cancelAnimation(giro)
  }, [giro])
  const estilo = useAnimatedStyle(() => ({ transform: [{ rotate: `${giro.value}deg` }] }))
  const c = lado / 2
  return (
    <>
      <Svg width={lado} height={lado} style={{ position: 'absolute' }}>
        <Circle cx={c} cy={c} r={c - 2} stroke="rgba(255,255,255,0.22)" strokeWidth={1} fill="none" />
      </Svg>
      <Animated.View style={[{ width: lado, height: lado }, estilo]}>
        <View
          style={{
            position: 'absolute',
            top: -1,
            left: c - 3,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: '#FFFFFF',
            boxShadow: '0 0 8px rgba(255,255,255,0.9)',
          }}
        />
      </Animated.View>
    </>
  )
}

/** Un aro de trazos girando despacio, como la aguja de un reloj sin apuro. */
function Trazos({ lado }: { lado: number }) {
  const giro = useSharedValue(0)
  useEffect(() => {
    giro.value = withRepeat(withTiming(360, { duration: 24000, easing: Easing.linear }), -1)
    return () => cancelAnimation(giro)
  }, [giro])
  const estilo = useAnimatedStyle(() => ({ transform: [{ rotate: `${giro.value}deg` }] }))
  const c = lado / 2
  const r = c - 2
  /* El largo de cada trazo y su hueco, sobre la circunferencia completa. */
  const vuelta = 2 * Math.PI * r
  const trazo = vuelta / 36
  return (
    <Animated.View style={[{ width: lado, height: lado }, estilo]}>
      <Svg width={lado} height={lado}>
        <Circle
          cx={c}
          cy={c}
          r={r}
          stroke="rgba(255,255,255,0.75)"
          strokeWidth={2}
          strokeDasharray={`${trazo} ${trazo}`}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  )
}

/** Cuatro chispas en los puntos cardinales, titilando desparejo. */
function Destello({ lado }: { lado: number }) {
  const c = lado / 2
  return (
    <>
      <Svg width={lado} height={lado} style={{ position: 'absolute' }}>
        <Circle cx={c} cy={c} r={c - 2} stroke="rgba(255,255,255,0.18)" strokeWidth={1} fill="none" />
      </Svg>
      {[0, 90, 180, 270].map((angulo, i) => (
        <Chispa key={angulo} angulo={angulo} lado={lado} demoraMs={i * 450} />
      ))}
    </>
  )
}

function Chispa({ angulo, lado, demoraMs }: { angulo: number; lado: number; demoraMs: number }) {
  const t = useSharedValue(0.3)
  useEffect(() => {
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900 + demoraMs, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.25, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    )
    return () => cancelAnimation(t)
  }, [demoraMs, t])
  const estilo = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ scale: 0.7 + t.value * 0.5 }] }))
  const c = lado / 2
  const r = c - 2
  const rad = (angulo * Math.PI) / 180
  const x = c + r * Math.sin(rad)
  const y = c - r * Math.cos(rad)
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x - 3,
          top: y - 3,
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: '#FFFFFF',
          boxShadow: '0 0 6px rgba(255,255,255,0.8)',
        },
        estilo,
      ]}
    />
  )
}
