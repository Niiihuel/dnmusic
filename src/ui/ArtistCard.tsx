import { BotonSuperficie } from './BotonSuperficie'
import { Image, Linking, Text, View } from 'react-native'
import { Skeleton } from './Skeleton'
import { artworkSource } from '../lib/artwork'
import { ICON_COLOR, IconExternal } from './icons'
import { ArtistInfo } from '../services/music'

/** Padding interno de las tarjetas del sidebar. */
const PAD = 12

/**
 * Tarjeta del sidebar.
 *
 * Todas comparten envoltorio y encabezado para que la columna se lea como una
 * pila y no como piezas sueltas — el mismo recurso que usa Spotify.
 */
function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="overflow-hidden rounded-xl bg-card" style={{ padding: PAD }}>
      <Text className="text-foreground pb-2 text-subheadline font-semibold">{title}</Text>
      {children}
    </View>
  )
}

/**
 * Ficha del artista.
 *
 * La foto ocupa toda la mitad de arriba, de borde a borde, y el texto va abajo:
 * es la tarjeta "About the artist" de Spotify. La foto no lleva redondeo propio
 * —se lo pone el `overflow: hidden` de la tarjeta— así arriba queda al ras y
 * abajo corta recto contra el bloque de texto.
 *
 * El título va montado sobre la imagen. Antes iba arriba de la foto justamente
 * para no tapar las caras, y encima crudo era ilegible según la foto que
 * tocara; lo resuelve el velo de `TopScrim`, que oscurece solo la franja donde
 * se apoya el texto.
 *
 * Sin foto no hay dónde montar nada y la tarjeta cae al formato común del
 * sidebar, con el encabezado arriba.
 */
export function ArtistCard({ artist, loading }: { artist: ArtistInfo | null; loading: boolean }) {
  if (loading) {
    return (
      <View className="overflow-hidden rounded-xl bg-card">
        <Skeleton width="100%" height={150} radius={0} />
        <View style={{ padding: PAD, gap: 10 }}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="45%" height={11} />
        </View>
      </View>
    )
  }

  if (!artist) return null

  const { body, links } = splitLinks(artist.description)

  const details = (
    <>
      <Text className="text-foreground text-body font-semibold" numberOfLines={2}>
        {artist.name}
      </Text>
      {artist.subscribers && (
        <Text className="text-muted-foreground text-footnote">{artist.subscribers} de oyentes</Text>
      )}
      {body.length > 0 && (
        <Text className="text-muted-foreground mt-2 text-footnote leading-5">{body}</Text>
      )}
      {links.length > 0 && (
        <View className="mt-3 gap-1.5">
          {links.map((l) => (
            <LinkRow key={l.url} label={l.label} url={l.url} />
          ))}
        </View>
      )}
    </>
  )

  const photo = artworkSource(artist.photoPath, artist.photoUrl, 720)

  if (!photo) {
    return (
      <SidebarCard title="Sobre el artista">
        <View className="gap-1">{details}</View>
      </SidebarCard>
    )
  }

  return (
    <View className="overflow-hidden rounded-xl bg-card">
      <View>
        <Image
          source={{ uri: photo }}
          // La proporción real de la foto: encajarla en un alto fijo obliga a
          // recortar, y las fotos de artista vienen apaisadas.
          style={{ width: '100%', aspectRatio: artist.photoAspect ?? 16 / 9 }}
          resizeMode="cover"
          accessibilityLabel={`Foto de ${artist.name}`}
        />
        <TopScrim />
        <Text
          className="text-foreground absolute left-3 top-3 text-subheadline font-semibold"
          style={{ textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 }}
        >
          Sobre el artista
        </Text>
      </View>

      <View className="gap-1" style={{ padding: PAD }}>
        {details}
      </View>
    </View>
  )
}

/** Franjas del velo. Con menos se nota el escalón; con más no cambia nada. */
const SCRIM_BANDS = 12

/**
 * Velo degradado sobre la parte de arriba de la foto.
 *
 * Va apilando franjas con opacidad decreciente en vez de un degradado real: RN
 * no trae gradientes y sumar `expo-linear-gradient` por un solo velo no se
 * justifica. A doce franjas el escalón no se ve.
 */
function TopScrim() {
  return (
    <View pointerEvents="none" className="absolute inset-x-0 top-0" style={{ height: '45%' }}>
      {Array.from({ length: SCRIM_BANDS }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            // Curva, no lineal: la caída pareja deja el pie del velo demasiado
            // marcado sobre la foto.
            backgroundColor: `rgba(0,0,0,${(0.6 * ((SCRIM_BANDS - i) / SCRIM_BANDS) ** 1.8).toFixed(3)})`,
          }}
        />
      ))}
    </View>
  )
}

/**
 * Enlace como una fila con su ícono, al modo de Spotify.
 *
 * Las bios de YouTube traen la atribución de Wikipedia con las URLs crudas
 * pegadas en el texto, que es ilegible. Acá se muestran con su nombre y el
 * ícono de "se abre afuera".
 */
function LinkRow({ label, url }: { label: string; url: string }) {
  return (
    <BotonSuperficie
      accessibilityRole="link"
      accessibilityLabel={`${label} (se abre en el navegador)`}
      onPress={() => void Linking.openURL(url)}
      className="flex-row items-center gap-1.5 active:opacity-70"
    >
      <Text className="text-foreground text-footnote underline" numberOfLines={1}>
        {label}
      </Text>
      <IconExternal size={12} color={ICON_COLOR.muted} />
    </BotonSuperficie>
  )
}

/**
 * Separa el texto de la bio de las URLs que trae embebidas.
 *
 * Se saca también el paréntesis que las envuelve, porque al quitar la URL queda
 * un "( )" huérfano en medio de la frase.
 */
function splitLinks(description: string): { body: string; links: { label: string; url: string }[] } {
  const URL_RE = /\(?(https?:\/\/[^\s)]+)\)?/g
  const links: { label: string; url: string }[] = []
  const seen = new Set<string>()

  const body = description
    .replace(URL_RE, (_, url: string) => {
      if (!seen.has(url)) {
        seen.add(url)
        links.push({ label: labelFor(url), url })
      }
      return ''
    })
    // Espacios y paréntesis vacíos que deja la extracción.
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { body, links }
}

function labelFor(url: string): string {
  try {
    const { hostname, pathname } = new URL(url)
    const host = hostname.replace(/^www\./, '')
    const last = pathname.split('/').filter(Boolean).pop()
    if (host.includes('wikipedia')) return `Wikipedia · ${decodeURIComponent(last ?? '')}`
    if (host.includes('creativecommons')) return 'Licencia Creative Commons'
    return host
  } catch {
    return url
  }
}
