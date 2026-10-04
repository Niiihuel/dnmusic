import { memo, useEffect, useState } from 'react'
import {
  ActivityIndicator, Image, Platform, Pressable,
  StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Circle, Path } from 'react-native-svg'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { artworkUrlAtSize } from '../lib/artwork'
import { useColorPortada } from '../lib/colorPortada'
import { estadoControlWeb } from './estadoControl'
import { IconMusic, IconPause, IconPlay, IconWave } from './icons'
import { useMovimientoVisible } from './useMovimientoVisible'

/* Presentación adaptada de Spell UI Spotify Card (MIT).
 * https://github.com/xxtomm/spell-ui/blob/main/registry/spell-ui/spotify-card.tsx
 * Copyright (c) 2025 Spell UI. Aviso completo: docs/licenses/spell-ui.txt.
 */

export type DatosTarjetaMusica = { titulo: string; artista: string; imagen?: string | null }
export type TarjetaMusicaProps = {
  datos: DatosTarjetaMusica
  /** Estado real del motor de audio que controla esta tarjeta. */
  reproduciendo?: boolean
  cargando?: boolean
  etiquetaReproduccion?: string
  onReproducir?: () => void
  onAbrir?: () => void
  style?: StyleProp<ViewStyle>
  testID?: string
}

const ES_WEB = Platform.OS === 'web'
function instalarGiroWeb() {
  if (!ES_WEB || typeof document === 'undefined' || document.getElementById('dn-tarjeta-musica-motion')) return
  const hoja = document.createElement('style')
  hoja.id = 'dn-tarjeta-musica-motion'
  hoja.textContent = `
@keyframes dn-tarjeta-vinilo { to { transform: rotate(360deg) } }
[data-tarjeta-vinilo] { animation: dn-tarjeta-vinilo 3s linear infinite; animation-play-state: paused; }
[data-tarjeta-vinilo="gira"] { animation-play-state: running; will-change: transform; }
@media (prefers-reduced-motion: reduce) { [data-tarjeta-vinilo] { animation: none; } }
`
  document.head.appendChild(hoja)
}

/** Una misma tarjeta en chat, compartir y enlaces; el audio pertenece al llamador. */
export const TarjetaMusica = memo(function TarjetaMusica({
  datos, reproduciendo = false, cargando = false, etiquetaReproduccion, onReproducir, onAbrir, style, testID,
}: TarjetaMusicaProps) {
  const [hover, setHover] = useState(false)
  const [foco, setFoco] = useState(false)
  const [presionada, setPresionada] = useState(false)
  const [falloImagen, setFalloImagen] = useState<string>()
  const [ancho, setAncho] = useState(325)
  const { fontScale } = useWindowDimensions()
  const alto = ES_WEB ? 100 : Math.max(100, Math.ceil(24 + 54 * fontScale))
  const uri = datos.imagen ? artworkUrlAtSize(datos.imagen, 240) : null
  const imagen = uri && falloImagen !== uri ? uri : null
  const tinte = useColorPortada(imagen)
  const permiteMovimiento = useMovimientoVisible(Boolean(onReproducir))
  const sonando = reproduciendo && !cargando
  const visible = Boolean(onReproducir) && (sonando || hover || foco || presionada)
  const girando = sonando && permiteMovimiento
  const angulo = useSharedValue(0)
  const salida = useSharedValue(visible ? 24 : 0)
  const desplazamiento = useAnimatedStyle(() => ({ transform: [{ translateX: salida.value }] }))
  const giro = useAnimatedStyle(() => ({ transform: [{ rotate: `${angulo.value}deg` }] }))

  useEffect(instalarGiroWeb, [])
  useEffect(() => {
    if (ES_WEB) return
    salida.value = permiteMovimiento
      ? withTiming(visible ? 24 : 0, { duration: 300, easing: Easing.out(Easing.quad) })
      : visible ? 24 : 0
    return () => cancelAnimation(salida)
  }, [visible, permiteMovimiento, salida])
  useEffect(() => {
    if (ES_WEB) return
    if (girando) angulo.value = withRepeat(withTiming(angulo.value + 360, { duration: 3000, easing: Easing.linear }), -1, false)
    else cancelAnimation(angulo)
    return () => cancelAnimation(angulo)
  }, [girando, angulo])

  const accionPortada = onReproducir ?? onAbrir
  const etiquetaPortada = etiquetaReproduccion ?? `${reproduciendo || cargando ? 'Pausar' : 'Reproducir'} ${datos.titulo}, ${datos.artista}`
  const portada = <>
    {onReproducir ? <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[s.vinilo, ES_WEB ? { transform: [{ translateX: visible ? 24 : 0 }], transitionProperty: 'transform', transitionDuration: permiteMovimiento ? '300ms' : '0ms' } as object : desplazamiento]}>
      <Animated.View {...(ES_WEB ? { dataSet: { tarjetaVinilo: girando ? 'gira' : 'quieto' } } : {})} style={[s.disco, ES_WEB ? null : giro]}>
        <Svg width={60} height={60} viewBox="0 0 60 60">
          <Circle cx={30} cy={30} r={30} fill="#080808" />
          {[28, 26, 24, 21, 18].map(radio => <Circle key={radio} cx={30} cy={30} r={radio} stroke="#fff" strokeOpacity={0.16} strokeWidth={0.5} fill="none" />)}
          <Path d="M0 20L30 30L0 40ZM60 20L30 30L60 40ZM20 0L30 30L40 0ZM20 60L30 30L40 60Z" fill="#fff" opacity={0.08} />
          <Circle cx={30} cy={30} r={4} fill="#363236" />
          <Circle cx={30} cy={30} r={1.5} fill="#080808" />
        </Svg>
      </Animated.View>
    </Animated.View> : null}
    <View style={[s.portada, visible ? s.portadaSalida : null, presionada ? s.presionada : null, foco ? s.foco : null]}>
      {imagen ? <Image source={{ uri: imagen }} accessible={false} resizeMode="cover" style={s.imagen}
        onError={() => setFalloImagen(imagen)} /> : <IconMusic size={25} color="#BAAEBA" />}
      {onReproducir || cargando ? <View pointerEvents="none" style={s.control}>
        {cargando ? <ActivityIndicator size="small" color="#D6D1D4" /> : sonando ? <IconPause size={12} color="#D6D1D4" /> : <IconPlay size={12} color="#D6D1D4" />}
      </View> : null}
    </View>
  </>
  const informacion = <>
    <View style={s.marca}><IconWave size={18} color="#D6D1D4" /><Text style={s.marcaTexto}>dnmusic</Text></View>
    <View style={s.textos}>
      <Text style={s.titulo} numberOfLines={1} ellipsizeMode="tail">{datos.titulo}</Text>
      <Text style={s.artista} numberOfLines={1} ellipsizeMode="tail">{datos.artista}</Text>
    </View>
  </>

  return <View testID={testID} style={[s.tarjeta, { height: alto }, tinte ? { backgroundColor: tinte } : null, style]} accessibilityState={{ busy: cargando }}
    onLayout={event => { const valor = event.nativeEvent.layout.width; if (valor > 0 && valor !== ancho) setAncho(valor) }}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.fondo}>
      {imagen ? <Image source={{ uri: imagen }} accessible={false} blurRadius={ES_WEB ? 0 : 50}
        style={[s.imagenFondo, { height: ancho * 1.2, top: alto / 2 - ancho * 0.6 }, ES_WEB ? { filter: 'blur(50px) brightness(1.5)' } as object : null]} /> : null}
      <LinearGradient colors={['rgba(0,0,0,0.65)', 'rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFill} />
    </View>
    {accionPortada ? <Pressable {...estadoControlWeb('none')} accessibilityRole="button"
      accessibilityLabel={onReproducir ? etiquetaPortada : `Abrir ${datos.titulo} en dnmusic`}
      accessibilityState={{ busy: cargando }} onPress={accionPortada} style={s.botonPortada}
      onHoverIn={ES_WEB ? () => setHover(true) : undefined} onHoverOut={ES_WEB ? () => setHover(false) : undefined}
      onFocus={ES_WEB ? () => setFoco(true) : undefined} onBlur={ES_WEB ? () => setFoco(false) : undefined}
      onPressIn={() => setPresionada(true)} onPressOut={() => setPresionada(false)}>{portada}</Pressable>
      : <View style={s.botonPortada}>{portada}</View>}
    {onAbrir ? <Pressable {...estadoControlWeb('none')} accessibilityRole="button" accessibilityLabel={`Abrir ${datos.titulo} en dnmusic`}
      onPress={onAbrir} style={({ pressed }) => [s.informacion, pressed ? s.presionada : null]}>{informacion}</Pressable>
      : <View style={s.informacion}>{informacion}</View>}
  </View>
})

const s = StyleSheet.create({
  tarjeta: { width: '100%', maxWidth: 325, height: 100, minWidth: 0, flexShrink: 1, flexDirection: 'row', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#ffffff14', backgroundColor: '#242024', overflow: 'hidden' },
  fondo: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  imagenFondo: { position: 'absolute', width: '120%', left: '-10%' },
  botonPortada: { width: 75, height: 75, alignSelf: 'center', flexShrink: 0, zIndex: 1 },
  portada: { width: 75, height: 75, borderRadius: 8, backgroundColor: '#322e32', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' },
  portadaSalida: { transform: [{ translateX: -2 }] },
  presionada: { opacity: 0.75 },
  foco: { borderWidth: 2, borderColor: '#D6D1D4' },
  imagen: { width: '100%', height: '100%' },
  vinilo: { position: 'absolute', left: 7.5, top: 7.5, width: 60, height: 60 },
  disco: { width: 60, height: 60 },
  control: { position: 'absolute', bottom: 5, right: 5, width: 24, height: 24, borderRadius: 12, backgroundColor: '#000000b8', alignItems: 'center', justifyContent: 'center' },
  informacion: { flex: 1, minWidth: 0, paddingLeft: 24, alignItems: 'stretch', justifyContent: 'space-between', zIndex: 2 },
  marca: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 4 },
  marcaTexto: { color: '#D6D1D4', fontSize: 10, fontWeight: '600', letterSpacing: -0.2 },
  textos: { minWidth: 0, gap: 1 },
  titulo: { color: '#D6D1D4', fontSize: 14, lineHeight: 18, fontWeight: '600', letterSpacing: -0.084, textAlign: 'right' },
  artista: { color: '#BAAEBA', fontSize: 14, lineHeight: 18, fontWeight: '500', letterSpacing: -0.084, textAlign: 'right' },
})
