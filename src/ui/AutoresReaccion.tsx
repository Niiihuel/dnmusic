import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions, type ViewStyle } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { autoresReaccionVitrina, type AutorReaccion } from '../services/reacciones'
import { TECLADO_FISICO } from '../lib/teclado'
import { CapaAutores } from './CapaAutores'
import { Avatar } from './Avatar'
import { Glass } from './Glass'
import { SuperficieTooltip } from './SuperficieTooltip'
import { BotonHoja, EncabezadoHoja } from './EncabezadoHoja'

/** Hover y foco revelan el detalle en PC. Un toque lo mantiene abierto; en
 * teléfono se presenta una hoja. El chip nunca dispara el play de la pieza. */
export function AutoresReaccion({ showcaseId, emoji, cantidad, autores, children, style }: {
  showcaseId?: string; emoji: string; cantidad: number; autores?: AutorReaccion[]
  children: ReactNode; style?: ViewStyle
}) {
  const router = useRouter()
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const ref = useRef<View>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const fijado = useRef(false)
  const abiertoRef = useRef(false)
  const [altoPanel, setAltoPanel] = useState(0)
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [lista, setLista] = useState<AutorReaccion[]>([])
  const [error, setError] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [pagina, setPagina] = useState(0)
  const [hayMas, setHayMas] = useState(false)
  const [intento, setIntento] = useState(0)
  const abierto = anchor !== null

  function retener() { clearTimeout(timer.current) }
  function cerrar() { retener(); abiertoRef.current = false; fijado.current = false; setAnchor(null) }
  function salirHover() { retener(); if (!fijado.current) timer.current = setTimeout(cerrar, 220) }
  function abrir(fijo: boolean) {
    retener(); fijado.current ||= fijo
    if (abiertoRef.current) return
    abiertoRef.current = true
    setPagina(0); setCargando(true); setError(false); setAltoPanel(0)
    ref.current?.measureInWindow((x, y, w, h) => {
      if (abiertoRef.current) setAnchor({ x, y, w, h })
    })
  }
  useEffect(() => () => { abiertoRef.current = false; clearTimeout(timer.current) }, [])
  useEffect(() => {
    if (!abierto) return
    let vivo = true
    const pedido = autores ? Promise.resolve(autores) : autoresReaccionVitrina(showcaseId!, emoji, pagina * 50)
    pedido.then(rows => {
      if (!vivo) return
      setLista(prev => pagina === 0 ? rows : [...prev, ...rows])
      setHayMas(!autores && rows.length === 50)
    }).catch(() => { if (vivo) setError(true) })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [abierto, autores, showcaseId, emoji, pagina, intento])

  const maxHeight = Math.max(160, Math.min(TECLADO_FISICO ? 260 : 380, height - insets.top - insets.bottom - 32))
  const w = Math.min(TECLADO_FISICO ? 240 : 320, width - 24)
  const alto = altoPanel || Math.min(maxHeight, 100)
  const arriba = anchor ? anchor.y - alto - 8 >= insets.top + 12 : false
  const top = anchor ? Math.max(insets.top + 12, Math.min(arriba ? anchor.y - alto - 8 : anchor.y + anchor.h + 8, height - alto - insets.bottom - 12)) : 12
  const Superficie = TECLADO_FISICO ? SuperficieTooltip : Glass
  return <>
    <Pressable ref={ref} accessibilityRole="button"
      accessibilityLabel={`Ver quién reaccionó con ${emoji}: ${cantidad}`}
      accessibilityState={{ expanded: abierto }}
      onPointerEnter={TECLADO_FISICO ? () => abrir(false) : undefined}
      onPointerLeave={TECLADO_FISICO ? salirHover : undefined}
      onFocus={TECLADO_FISICO ? () => abrir(true) : undefined}
      onPress={e => { e.stopPropagation(); abrir(true) }}
      onLongPress={e => { e.stopPropagation(); abrir(true) }}
      style={[{ minHeight: TECLADO_FISICO ? 28 : 44, justifyContent: 'center' }, style]}>
      {children}
    </Pressable>
    <CapaAutores visible={abierto} onRequestClose={cerrar} anchor={anchor}>
      <View pointerEvents="box-none" style={{ flex: 1, justifyContent: TECLADO_FISICO ? undefined : 'flex-end' }}>
        {!TECLADO_FISICO ? <Pressable accessibilityLabel="Cerrar detalle de reacciones" accessibilityRole="button" onPress={cerrar}
          style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,.3)' }} /> : null}
        {TECLADO_FISICO && anchor ? <Pressable accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          onPointerEnter={retener} onPointerLeave={salirHover} onPress={() => { fijado.current = true; retener() }}
          style={{ position: 'absolute', left: anchor.x, top: arriba ? top + alto : anchor.y + anchor.h, width: anchor.w,
            height: arriba ? Math.max(8, anchor.y - top - alto) : Math.max(8, top - anchor.y - anchor.h) }} /> : null}
        <View pointerEvents="auto" onLayout={e => { const altoMedido = Math.ceil(e.nativeEvent.layout.height); setAltoPanel(prev => prev === altoMedido ? prev : altoMedido) }}
          onPointerEnter={retener} onPointerLeave={TECLADO_FISICO ? salirHover : undefined}
          style={TECLADO_FISICO ? { position: 'absolute', top, left: Math.max(12, Math.min(anchor?.x ?? 12, width - w - 12)), width: w }
            : { margin: 12, marginBottom: Math.max(12, insets.bottom), maxWidth: 520, width: width - 24, alignSelf: 'center' }}>
          <Superficie style={{ maxHeight, overflow: 'hidden', paddingVertical: TECLADO_FISICO ? 6 : 0, paddingBottom: 8 }}>
            {TECLADO_FISICO ? <Text className="text-muted-foreground" style={{ fontSize: 11, paddingHorizontal: 12, paddingVertical: 4 }}>{emoji} · {cantidad} {cantidad === 1 ? 'reacción' : 'reacciones'}</Text> : <EncabezadoHoja titulo={`${emoji} Reacciones`} velo={false}
              derecha={<BotonHoja tipo="cerrar" label="Cerrar reacciones" onPress={cerrar} />} />}
            <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}>
              {!(cargando && pagina === 0) && !error ? lista.map(autor => <Pressable key={autor.id}
                accessibilityRole="button" accessibilityLabel={`Ver perfil de @${autor.username}`}
                onPress={() => { cerrar(); router.push(`/perfil/${encodeURIComponent(autor.username)}`) }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: TECLADO_FISICO ? 38 : 52, paddingHorizontal: 6, borderRadius: 8 }}>
                <Avatar name={autor.displayName || autor.username} path={autor.avatarPath} size={TECLADO_FISICO ? 24 : 32} />
                <View style={{ flex: 1 }}><Text className="text-foreground font-semibold" style={{ fontSize: TECLADO_FISICO ? 12 : 14 }} numberOfLines={1}>{autor.displayName || autor.username}</Text>
                  <Text className="text-muted-foreground" style={{ fontSize: TECLADO_FISICO ? 11 : 12 }} numberOfLines={1}>@{autor.username}</Text></View>
              </Pressable>) : null}
              {cargando ? <ActivityIndicator style={{ padding: 16 }} color="#fff" /> : error ?
                <Pressable accessibilityRole="button" onPress={() => { setCargando(true); setError(false); setIntento(n => n + 1) }} style={{ padding: 16 }}>
                  <Text className="text-muted-foreground">No se pudo cargar. Reintentar</Text>
                </Pressable> : hayMas ? <Pressable accessibilityRole="button" onPress={() => { setCargando(true); setError(false); setPagina(n => n + 1) }} style={{ padding: 16 }}>
                  <Text className="text-foreground">Ver más</Text></Pressable> : !lista.length ?
                <Text className="text-muted-foreground" style={{ padding: 16 }}>No hay reacciones visibles.</Text> : null}
            </ScrollView>
          </Superficie>
        </View>
      </View>
    </CapaAutores>
  </>
}
