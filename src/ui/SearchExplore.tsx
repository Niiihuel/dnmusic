import { useEffect, useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { catalogoGeneros } from '../lib/catalogoEditorial'
import { artworkUrlAtSize } from '../lib/artwork'
import { fetchGeneros, proxiedImage, type Genero } from '../services/music'
import { usePiso, useTecho } from '../state/shell'
import { BotonSuperficie } from './BotonSuperficie'
import { ScrollArea } from './ScrollArea'
import { SkeletonList } from './Skeleton'

// Color editorial sólo en el arte; controles y navegación conservan su paleta.
const TINTES = ['#884a70', '#916126', '#385f82', '#75519a', '#377467', '#8c4d42']
export function columnasExplorar(ancho: number) { return ancho >= 900 ? 4 : ancho >= 600 ? 3 : 2 }

/** La lupa abre contenido, no el teclado. El campo vive en la cáscara/lateral. */
export function SearchExplore({ onOpenGenero }: { onOpenGenero: (genero: Genero) => void }) {
  const [generos, setGeneros] = useState<Genero[] | null>(null)
  const [revision, setRevision] = useState(0)
  const [ancho, setAncho] = useState(0)
  const techo = useTecho(12)
  const piso = usePiso(24)
  useEffect(() => {
    const abort = new AbortController()
    void fetchGeneros(abort.signal).then(items => {
      if (!abort.signal.aborted) setGeneros(catalogoGeneros(items))
    })
    return () => abort.abort()
  }, [revision])
  const columnas = columnasExplorar(ancho + 40)
  const tarjeta = Math.max(1, (ancho - 12 * (columnas - 1)) / columnas)
  return <ScrollArea className="flex-1"
    contentContainerStyle={{ paddingHorizontal: 20, paddingTop: techo, paddingBottom: piso }}>
    <Text accessibilityRole="header" className="text-foreground font-bold" style={{ fontSize: 32, letterSpacing: -0.8, marginBottom: 20 }}>Buscar</Text>
    <View onLayout={e => setAncho(e.nativeEvent.layout.width)}>
    {generos === null ? <SkeletonList rows={6} /> : generos.length ? (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {generos.map((genero, index) => <CategoriaBusqueda key={genero.params} genero={genero}
          ancho={tarjeta} tinte={TINTES[index % TINTES.length]} onPress={() => onOpenGenero(genero)} />)}
      </View>
    ) : <View style={{ paddingVertical: 32, gap: 16 }}>
      <Text className="text-muted-foreground text-body">No pudimos cargar las categorías. Podés seguir buscando canciones y artistas.</Text>
      <BotonSuperficie accessibilityRole="button" accessibilityLabel="Volver a cargar las categorías"
        onPress={() => { setGeneros(null); setRevision(r => r + 1) }} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text className="text-foreground font-semibold">Reintentar</Text>
      </BotonSuperficie>
    </View>}
    </View>
  </ScrollArea>
}

function CategoriaBusqueda({ genero, ancho, tinte, onPress }: { genero: Genero; ancho: number; tinte: string; onPress: () => void }) {
  const [falloImagen, setFalloImagen] = useState(false)
  return <BotonSuperficie accessibilityRole="button" accessibilityLabel={`Explorar ${genero.name}`}
    onPress={onPress} style={{ width: ancho }}>
    <View style={{ flex: 1, minHeight: Math.max(118, ancho * 0.58), borderRadius: 14, overflow: 'hidden', backgroundColor: tinte, justifyContent: 'flex-end' }}>
      {genero.artworkUrl && !falloImagen ? <Image accessible={false}
        source={{ uri: proxiedImage(artworkUrlAtSize(genero.artworkUrl, 480)) }} resizeMode="cover"
        onError={() => setFalloImagen(true)} style={[StyleSheet.absoluteFill, { opacity: 0.7 }]} /> : (
        <View pointerEvents="none" style={{ position: 'absolute', width: ancho, height: ancho, right: -ancho * 0.35, top: -ancho * 0.35, borderRadius: ancho, backgroundColor: '#FFFFFF', opacity: 0.1 }} />
      )}
      <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.78)']} style={StyleSheet.absoluteFill} />
      <Text style={{ color: '#FFFFFF', fontSize: 18, lineHeight: 23, fontWeight: '600', letterSpacing: -0.3, padding: 14 }}>{genero.name}</Text>
    </View>
  </BotonSuperficie>
}
