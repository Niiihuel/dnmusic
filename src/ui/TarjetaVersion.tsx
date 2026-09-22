import { memo, useEffect, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Animated, AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg'
import { Image } from 'expo-image'
import type { PasoVersion } from '../lib/novedades'
import { IconClose, IconUpdate, IconWave } from './icons'
import { VideoVersion } from './VideoVersion'

/** La ilustración sólo hace una entrada corta; no hay un shader consumiendo GPU en bucle. */
const LuzVersion = memo(function LuzVersion() {
  const [progreso] = useState(() => new Animated.Value(0))
  useEffect(() => {
    let viva = true
    let cambio = false
    let animacion: Animated.CompositeAnimation | undefined
    const detener = () => { animacion?.stop(); progreso.setValue(0) }
    const iniciar = (reducir: boolean) => {
      detener()
      if (!viva || reducir || AppState.currentState !== 'active') return
      animacion = Animated.timing(progreso, { toValue: 1, duration: 6000, useNativeDriver: Platform.OS !== 'web' })
      animacion.start()
    }
    const preferencia = AccessibilityInfo.addEventListener('reduceMotionChanged', reducir => { cambio = true; iniciar(reducir) })
    const app = AppState.addEventListener('change', detener)
    const doc = Platform.OS === 'web' && typeof document !== 'undefined' ? document : undefined
    doc?.addEventListener('visibilitychange', detener)
    void AccessibilityInfo.isReduceMotionEnabled().then(reducir => { if (!cambio) iniciar(reducir) }).catch(() => {})
    return () => { viva = false; detener(); preferencia.remove(); app.remove(); doc?.removeEventListener('visibilitychange', detener) }
  }, [progreso])
  return <View style={styles.hero} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: progreso.interpolate({ inputRange: [0, 1], outputRange: [-24, 24] }) }, { scale: 1.2 }] }]}>
      <Svg width="100%" height="100%" viewBox="0 0 600 220" preserveAspectRatio="xMidYMid slice">
        <Defs><RadialGradient id="plata"><Stop offset="0" stopColor="#ecf2f5" stopOpacity=".75" /><Stop offset=".38" stopColor="#9aadb8" stopOpacity=".32" /><Stop offset="1" stopColor="#121212" stopOpacity="0" /></RadialGradient></Defs>
        <Rect width="600" height="220" fill="#101315" />
        <Ellipse cx="330" cy="105" rx="285" ry="126" fill="url(#plata)" transform="rotate(-22 330 105)" />
        <Ellipse cx="350" cy="180" rx="230" ry="83" fill="#111315" transform="rotate(-22 350 180)" />
        <Ellipse cx="175" cy="68" rx="120" ry="70" fill="url(#plata)" />
      </Svg>
    </Animated.View>
    <View style={styles.marca}><IconWave size={34} /><Text style={styles.marcaTexto}>dnmusic</Text></View>
  </View>
})

export type TarjetaVersionProps = {
  version?: string
  etiqueta: string
  titulo: string
  detalle?: string
  cambios?: string[]
  pasos?: PasoVersion[]
  children?: ReactNode
  onCerrar?: () => void
}

/** Una sola superficie para una versión instalada, disponible o lista para instalar. */
export function TarjetaVersion({ version, etiqueta, titulo, detalle, cambios = [], pasos = [], children, onCerrar }: TarjetaVersionProps) {
  const [indice, setIndice] = useState(0)
  const paso = pasos[Math.min(indice, pasos.length - 1)]
  return <View style={styles.card}>
    <LuzVersion />
    {onCerrar ? <Pressable accessibilityRole="button" accessibilityLabel="Cerrar novedades" onPress={onCerrar} style={styles.cerrar}><IconClose size={18} /></Pressable> : null}
    <View style={styles.solapa}><IconUpdate size={16} color="#d0d5d9" /><Text style={styles.etiqueta}>{version ? `VERSIÓN ${version}` : 'DNMUSIC'}</Text></View>
    <View style={styles.contenido}>
      <Text style={styles.estado}>{etiqueta}</Text>
      <Text accessibilityRole="header" style={styles.titulo}>{titulo}</Text>
      {detalle ? <Text style={styles.detalle}>{detalle}</Text> : null}
      {paso ? <View style={styles.pasos}>
        <View style={styles.navegacion}>
          {pasos.map((p, i) => <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Novedad ${i + 1}: ${p.titulo}`} accessibilityState={{ selected: indice === i }} onPress={() => setIndice(i)} style={styles.pasoBoton}>
            <View style={[styles.indicador, i === indice ? styles.indicadorActivo : null]} />
          </Pressable>)}
          <Text style={styles.contador}>{Math.min(indice + 1, pasos.length)} / {pasos.length}</Text>
        </View>
        <ContenidoPaso key={`${version}:${indice}`} paso={paso} />
      </View> : null}
      {cambios.length ? <View style={styles.cambios}>
        {paso ? <Text accessibilityRole="header" style={styles.cambiosTitulo}>Todos los cambios</Text> : null}
        {cambios.map((cambio, i) => <View key={i} style={styles.cambio}>
        <Text style={styles.numero}>{String(i + 1).padStart(2, '0')}</Text><Text style={styles.cambioTexto}>{cambio}</Text>
      </View>)}</View> : null}
      {children ? <View style={styles.acciones}>{children}</View> : null}
    </View>
  </View>
}

function ContenidoPaso({ paso }: { paso: PasoVersion }) {
  const [fallo, setFallo] = useState(false)
  return <View style={{ gap: 10 }}>
    {paso.medio && !fallo ? paso.medio.tipo === 'imagen'
      ? <Image source={{ uri: paso.medio.url }} accessibilityLabel={paso.medio.descripcion} contentFit="contain" style={styles.medio} onError={() => setFallo(true)} />
      : <VideoVersion url={paso.medio.url} descripcion={paso.medio.descripcion} onError={() => setFallo(true)} /> : null}
    {fallo ? <Text style={styles.detalle}>No se pudo cargar la vista previa.</Text> : null}
    <Text style={styles.pasoTitulo}>{paso.titulo}</Text>
    <Text style={styles.detalle}>{paso.detalle}</Text>
  </View>
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#191a1b', borderRadius: 26, overflow: 'hidden', width: '100%', boxShadow: '0 12px 36px rgba(0,0,0,0.18)' },
  hero: { height: 150, overflow: 'hidden', backgroundColor: '#111315' },
  marca: { position: 'absolute', left: 26, top: 32, flexDirection: 'row', alignItems: 'center', gap: 10 },
  marcaTexto: { color: '#fff', fontSize: 20, fontWeight: '600', letterSpacing: -0.6 },
  cerrar: { position: 'absolute', right: 14, top: 14, width: 44, height: 44, borderRadius: 22, backgroundColor: '#ffffff14', alignItems: 'center', justifyContent: 'center' },
  solapa: { alignSelf: 'flex-start', marginTop: -32, minHeight: 42, paddingHorizontal: 24, paddingTop: 8, borderTopRightRadius: 25, backgroundColor: '#191a1b', flexDirection: 'row', gap: 9, alignItems: 'center' },
  etiqueta: { color: '#c5cbce', fontSize: 11, fontWeight: '600', letterSpacing: 1.2 },
  contenido: { padding: 24, paddingTop: 18, gap: 10 },
  estado: { color: '#a7b1b6', fontSize: 12, fontWeight: '500' },
  titulo: { color: '#fff', fontSize: 26, lineHeight: 31, fontWeight: '600', letterSpacing: -0.7 },
  detalle: { color: '#b3b3b3', fontSize: 14, lineHeight: 21 },
  cambios: { gap: 17, marginTop: 14 },
  cambiosTitulo: { color: '#fff', fontSize: 17, lineHeight: 23, fontWeight: '600', marginBottom: 1 },
  cambio: { flexDirection: 'row', gap: 14 },
  numero: { color: '#81898e', fontSize: 11, lineHeight: 21, fontVariant: ['tabular-nums'] },
  cambioTexto: { flex: 1, color: '#d4d6d7', fontSize: 14, lineHeight: 21 },
  acciones: { gap: 8, marginTop: 16 },
  pasos: { gap: 8 },
  navegacion: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pasoBoton: { minWidth: 44, minHeight: 44, justifyContent: 'center', flex: 1 },
  indicador: { height: 3, borderRadius: 3, backgroundColor: '#404346' },
  indicadorActivo: { backgroundColor: '#eef0f1' },
  contador: { color: '#a7b1b6', fontSize: 12, marginLeft: 10 },
  pasoTitulo: { color: '#fff', fontSize: 18, lineHeight: 24, fontWeight: '600' },
  medio: { width: '100%', aspectRatio: 16 / 9, borderRadius: 14, backgroundColor: '#101010' },
})
