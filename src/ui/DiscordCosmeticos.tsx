import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AccessibilityInfo, AppState, Platform, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native'
import { Image, type ImageProps } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import { LinearGradient } from 'expo-linear-gradient'
import { usePiezaDiscord, type PiezaDiscord } from '../services/discordCatalogo'
import {
  crearRelojDiscord, geometriaCapaDiscord, gradientePlacaDiscord, encuadreEfectosDiscord, margenesMarcoDiscord, urlsAvatarDiscord, urlsPlacaDiscord, urlCapaDiscord,
  type CapaDiscord, type EfectoDiscord, type FaseDiscord,
} from './DiscordCosmeticos.helpers'

type IdProps = { id: string | null | undefined; animado?: boolean; /** Permite que la galería muestre una carga fallida. */ onError?: () => void }
const SIN_EFECTOS: EfectoDiscord[] = []
const reloj = crearRelojDiscord()
const falseSnapshot = () => false
const noSubscribe = () => () => {}

// Un único par de listeners nativos para toda la galería. No se anima hasta leer
// la preferencia de accesibilidad; en web se observa además la pestaña oculta.
const oyentes = new Set<() => void>()
let movimiento = false
let desmontarMovimiento: (() => void) | undefined
function suscribirMovimiento(oyente: () => void) {
  oyentes.add(oyente)
  if (oyentes.size === 1) {
    let vivo = true
    let reducido = true
    let activo = AppState.currentState === 'active'
    const doc = Platform.OS === 'web' && typeof document !== 'undefined' ? document : undefined
    const media = Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)') : undefined
    const avisar = () => {
      const siguiente = activo && !reducido && !doc?.hidden && !media?.matches
      if (siguiente !== movimiento) { movimiento = siguiente; oyentes.forEach(fn => fn()) }
    }
    let cambioPreferencia = false
    const reducir = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { cambioPreferencia = true; reducido = value; avisar() })
    const app = AppState.addEventListener('change', value => { activo = value === 'active'; avisar() })
    doc?.addEventListener('visibilitychange', avisar)
    media?.addEventListener('change', avisar)
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (vivo && !cambioPreferencia) { reducido = value; avisar() }
    }).catch(() => { /* Si no se puede leer, conservar la versión estática. */ })
    desmontarMovimiento = () => {
      vivo = false
      reducir.remove(); app.remove()
      doc?.removeEventListener('visibilitychange', avisar)
      media?.removeEventListener('change', avisar)
      movimiento = false
    }
  }
  return () => {
    oyentes.delete(oyente)
    if (!oyentes.size) { desmontarMovimiento?.(); desmontarMovimiento = undefined }
  }
}
function usePiezaVisible(id: IdProps['id']) {
  const pieza = usePiezaDiscord(id ?? '')
  return pieza?.disponible === false ? null : pieza
}
const snapshotMovimiento = () => movimiento
function useMovimiento(animado: boolean) {
  return useSyncExternalStore(animado ? suscribirMovimiento : noSubscribe, animado ? snapshotMovimiento : falseSnapshot, falseSnapshot)
}

/** Todas las imágenes son decorativas. Un error de red quita sólo esa capa. */
const ImagenDiscord = memo(function ImagenDiscord({ uri, animado = false, ...props }: Omit<ImageProps, 'source' | 'autoplay'> & { uri?: string; animado?: boolean }) {
  const [fallo, setFallo] = useState<string>()
  const ref = useRef<Image>(null)
  useEffect(() => {
    // autoplay no pausa una imagen que ya estaba reproduciéndose en todos los
    // backends nativos. En web siempre se cambia a una URL realmente estática.
    const imagen = ref.current
    if (Platform.OS !== 'web' && imagen) {
      void (animado ? imagen.startAnimating() : imagen.stopAnimating()).catch(() => {})
    }
  }, [animado, uri])
  if (!uri || fallo === uri) return null
  return <Image
    {...props}
    ref={ref}
    source={{ uri }}
    autoplay={animado}
    accessible={Platform.OS === 'web' ? undefined : false}
    accessibilityLabel=""
    pointerEvents="none"
    cachePolicy="memory-disk"
    recyclingKey={`${uri}:${animado}`}
    transition={0}
    onError={event => { setFallo(uri); props.onError?.(event) }}
  />
})

/** Superponer sobre un contenedor de size×size con overflow visible. */
export function DiscordAvatar({ id, size, animado = true, onError }: IdProps & { size: number }) {
  const pieza = usePiezaVisible(id)
  const mover = useMovimiento(animado && pieza?.tipo === 'marco')
  if (pieza?.tipo !== 'marco' || !(size > 0)) return null
  const urls = urlsAvatarDiscord(pieza.asset, size * 1.2)
  const uri = mover ? urls?.animada ?? pieza.preview : urls?.estatica ?? pieza.staticPreview
  const lado = size * 1.2
  return <View pointerEvents="none" accessible={false} style={{ position: 'absolute', width: lado, height: lado, left: (size - lado) / 2, top: (size - lado) / 2 }}>
    <ImagenDiscord uri={uri} animado={mover} onError={onError} style={StyleSheet.absoluteFill} contentFit="contain" />
  </View>
}

function useMedidas() {
  const [medidas, setMedidas] = useState({ width: 0, height: 0 })
  const medir = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setMedidas(prev => prev.width === width && prev.height === height ? prev : { width, height })
  }, [])
  return { ...medidas, medir }
}

function SecuenciaDiscord({ efectos, ancho, alto = 320, ajuste = 'ancho', estatica, onError }: { efectos: EfectoDiscord[]; ancho: number; alto?: number; ajuste?: 'ancho' | 'cover'; estatica?: string; onError?: () => void }) {
  const [fases, setFases] = useState<FaseDiscord[] | null>(null)
  useEffect(() => {
    let vivo = true
    let salir: (() => void) | undefined
    const fuentes = [...new Set(efectos.flatMap(e => [e.src, ...(e.randomizedSources ?? [])]))]
    // El reloj comienza con los APNG en caché: una conexión lenta no consume
    // la introducción antes de que se pueda ver. La galería quieta no precarga.
    const iniciar = () => { if (vivo) salir = reloj.suscribir(efectos, setFases) }
    void Image.prefetch(fuentes, 'memory-disk').then(iniciar, iniciar)
    return () => { vivo = false; salir?.() }
  }, [efectos])
  if (fases === null) return <ImagenDiscord uri={estatica} onError={onError} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top center" />
  const { escala, ...lienzo } = encuadreEfectosDiscord(efectos, ancho, alto, ajuste)
  return <View pointerEvents="none" style={{ position: 'absolute', ...lienzo }}>{fases.map(({ index, ciclo }) => <CapaEfectoDiscord key={`${index}:${ciclo}`} efecto={efectos[index]} escala={escala} onError={onError} />)}</View>
}
function CapaEfectoDiscord({ efecto, escala, onError }: { efecto: EfectoDiscord; escala: number; onError?: () => void }) {
  // Se elige una sola variante por reproducción, estable durante los renders.
  const [uri] = useState(() => {
    const fuentes = efecto.randomizedSources
    return fuentes?.length ? fuentes[Math.floor(Math.random() * fuentes.length)] : efecto.src
  })
  return <ImagenDiscord uri={uri} animado onError={onError} style={{
    position: 'absolute', left: (efecto.position?.x ?? 0) * escala, top: (efecto.position?.y ?? 0) * escala,
    width: (efecto.width ?? 450) * escala, height: (efecto.height ?? 880) * escala, zIndex: efecto.zIndex,
  }} contentFit="contain" />
}

/** Overlay con alto explícito. animado=false no registra ningún reloj. */
export function DiscordEfecto({ id, alto = 320, animado = true, onError, ajuste = 'ancho' }: IdProps & { alto?: number; ajuste?: 'ancho' | 'cover' }) {
  const pieza = usePiezaVisible(id)
  const mover = useMovimiento(animado && pieza?.tipo === 'efecto')
  const { width, medir } = useMedidas()
  if (pieza?.tipo !== 'efecto') return null
  const efectos = pieza.efectos ?? SIN_EFECTOS
  return <View pointerEvents="none" accessible={false} onLayout={medir} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: alto, overflow: 'hidden' }}>
    {mover && width > 0 && efectos.length > 0
      ? <SecuenciaDiscord key={pieza.id} efectos={efectos} ancho={width} alto={alto} ajuste={ajuste} estatica={pieza.reducedMotionSrc ?? pieza.staticPreview} onError={onError} />
      : <ImagenDiscord uri={pieza.reducedMotionSrc ?? pieza.staticPreview} onError={onError} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top center" />}
  </View>
}

function PlacaVideoDiscord({ uri, onError }: { uri: string; onError: () => void }) {
  const player = useVideoPlayer(uri, p => {
    p.muted = true
    p.audioMixingMode = 'mixWithOthers'
    p.loop = true
  })
  useLayoutEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => { if (status === 'error') onError() })
    if (player.status === 'error') onError()
    else player.play()
    // Layout cleanup precede a la liberación nativa (effect de useVideoPlayer).
    return () => { sub.remove(); player.pause() }
  }, [player, onError])
  // Se monta sólo en movimiento, nunca en iOS. useVideoPlayer libera el
  // reproductor al salir/cambiar de placa o pasar a segundo plano.
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover"
    nativeControls={false} fullscreenOptions={{ enable: false }} allowsPictureInPicture={false}
    pointerEvents="none" accessible={false} surfaceType="textureView" />
}

export function DiscordPlaca({ id, animado = true, radio = 14, children, onError }: IdProps & { radio?: number; children: ReactNode }) {
  const pieza = usePiezaVisible(id)
  const mover = useMovimiento(animado && pieza?.tipo === 'placa')
  const [falloVideo, setFalloVideo] = useState<string>()
  const urls = pieza?.tipo === 'placa' ? urlsPlacaDiscord(pieza.asset) : null
  const video = pieza?.videoSrc ?? urls?.animada
  const fallo = useCallback(() => setFalloVideo(video), [video])
  const estatica = pieza?.staticPreview ?? urls?.estatica
  const colores = gradientePlacaDiscord(pieza?.palette)
  if (pieza?.tipo !== 'placa') return <>{children}</>
  return <View style={{ position: 'relative', borderRadius: radio, overflow: 'hidden' }}>
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
      {colores ? <LinearGradient colors={colores} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} pointerEvents="none" /> : null}
      <ImagenDiscord uri={estatica} onError={onError} style={StyleSheet.absoluteFill} contentFit="cover" />
      {mover && Platform.OS !== 'ios' && video && falloVideo !== video
        ? <PlacaVideoDiscord key={video} uri={video} onError={fallo} /> : null}
    </View>
    {children}
  </View>
}

const CapaMarcoDiscord = memo(function CapaMarcoDiscord({ pieza, capa, ancho, alto, onError }: {
  pieza: PiezaDiscord; capa: CapaDiscord; ancho: number; alto: number; onError?: () => void
}) {
  const [imagen, setImagen] = useState<{ width: number; height: number }>()
  const uri = urlCapaDiscord(pieza.id, capa.id)
  const medirImagen = useCallback<NonNullable<ImageProps['onLoad']>>(({ source }) => {
    setImagen(prev => prev?.width === source.width && prev?.height === source.height ? prev : { width: source.width, height: source.height })
  }, [])
  const geometria = imagen ? geometriaCapaDiscord(pieza, capa, ancho, alto, imagen) : null
  // La propia carga entrega las medidas: no se descargan dos veces ni se
  // consulta el catálogo entero. Antes de medir, la capa permanece invisible.
  if (!imagen) return <ImagenDiscord uri={uri} onError={onError} onLoad={medirImagen} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
  if (!geometria) return null
  const { left, top, width, height, repetir, recortar } = geometria
  const contenedor: StyleProp<ViewStyle> = { position: 'absolute', left, top: recortar ? 0 : top, width, height: recortar ? alto : height, overflow: recortar ? 'hidden' : 'visible' }
  return <View pointerEvents="none" accessible={false} style={contenedor}>
    {Array.from({ length: repetir }, (_, index) => <ImagenDiscord key={index} uri={uri} onError={onError}
      style={{ position: 'absolute', left: 0, top: recortar ? top + index * height : 0, width, height }} contentFit="fill" />)}
  </View>
})

/**
 * Envuelve la tarjeta completa, conservando clicks y su altura natural.
 * El padre debe permitir overflow y dejar margen para las puntas del marco.
 * Los assets de las capas /static verificados son PNG; no se anima el thumbnail
 * ni se supone que exista una variante animada por capa. Nueve URLs /animated
 * verificadas en tres marcos devolvieron 404 (2026-09-06). animado se conserva
 * en la API para que la misma configuración sirva con el resto de cosméticos.
 */
export function DiscordMarcoPerfil({ id, children, onError }: IdProps & { children: ReactNode }) {
  const pieza = usePiezaVisible(id)
  const { width, height, medir } = useMedidas()
  if (pieza?.tipo !== 'marcoPerfil') return <>{children}</>
  const capas = pieza.capas ?? []
  const dibujar = (orden: string) => capas.filter(capa => capa.order === orden).map(capa =>
    <CapaMarcoDiscord key={`${pieza.id}:${capa.id}`} pieza={pieza} capa={capa} ancho={width} alto={height} onError={onError} />)
  return <View onLayout={medir} style={{ position: 'relative', overflow: 'visible', isolation: 'isolate' }}>
    <View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, { zIndex: 0 }]}>{dibujar('back')}</View>
    <View style={{ position: 'relative', zIndex: 1 }}>{children}</View>
    <View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, { zIndex: 2 }]}>{dibujar('front')}</View>
  </View>
}

/** Reserva el overflow del asset antes del contenido vecino (tarjeta/estadísticas). */
export function MarcoContenidoDiscord({ id, animado = true, children }: IdProps & { children: ReactNode }) {
  const pieza = usePiezaVisible(id)
  const { width, medir } = useMedidas()
  // El nodo de medición permanece montado mientras llega el catálogo. En web,
  // reemplazar un Fragment por el mismo View del hijo puede omitir onLayout
  // si su caja no cambió, dejando la reserva inicial en cero.
  return <View testID="margen-marco-discord" onLayout={medir} style={{ width: '100%', flexShrink: 0 }}>
    {pieza?.tipo === 'marcoPerfil' ? <View style={margenesMarcoDiscord(pieza, width)}>
      <DiscordMarcoPerfil id={id} animado={animado}>{children}</DiscordMarcoPerfil>
    </View> : children}
  </View>
}
