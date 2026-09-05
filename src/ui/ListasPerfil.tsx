import { TextoPerfil as Text } from './FuentePerfil'
import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { listPublicPlaylists, type Playlist } from '../services/playlists'
import { PlaylistCover } from './PlaylistCover'
import { formatLength } from './SeekBar'

/** Ancho mínimo de una tarjeta. Debajo de esto el nombre entra en tres renglones. */
const TARJETA_MIN = 150
const HUECO = 12

/**
 * Las listas que esta persona publicó, en su perfil.
 *
 * Es la contracara de «Hacer pública» en el menú de una lista: publicar ya es
 * decir «quiero que se vea», así que la sección se arma sola en vez de pedir un
 * segundo paso para fijar cada una. Las vitrinas siguen existiendo para
 * **destacar** algo arriba de todo; esto es el estante.
 *
 * Va en los dos perfiles, el propio y el ajeno, con el mismo componente y sin
 * modo de edición: tu perfil se tiene que ver igual mirándolo vos que
 * mirándolo otro, que es lo único que un perfil promete. Lo único distinto es
 * el cartel de cuando está vacío, que en el tuyo dice cómo llenarlo.
 *
 * Sin listas públicas y en el perfil de otro, la sección **no se dibuja**: un
 * título con un hueco abajo cuenta algo que no pasó.
 */
export function ListasPerfil({
  ownerId,
  nombre,
  propio,
  onAbrir,
}: {
  ownerId: string
  /** Cómo se llama quien tiene el perfil, para el cartel de vacío. */
  nombre: string
  propio: boolean
  onAbrir: (playlist: Playlist) => void
}) {
  const [listas, setListas] = useState<Playlist[] | null>(null)
  const [ancho, setAncho] = useState(0)

  useEffect(() => {
    let vivo = true
    listPublicPlaylists(ownerId)
      .then((l) => vivo && setListas(l))
      /* Que fallen no puede dejar el perfil sin lo demás: se muestra como si no
         hubiera ninguna, igual que hacen las vitrinas. */
      .catch(() => vivo && setListas([]))
    return () => {
      vivo = false
    }
  }, [ownerId])

  if (listas === null) return null
  if (!listas.length && !propio) return null

  /* Cuántas entran, medidas sobre el ancho real: el perfil se dibuja a 520px en
     el teléfono y a 720 en escritorio, y el mismo número fijo daría tarjetas
     enormes de un lado o apretadas del otro. */
  const columnas = Math.max(2, Math.floor((ancho + HUECO) / (TARJETA_MIN + HUECO))) || 2
  const lado = ancho ? (ancho - HUECO * (columnas - 1)) / columnas : TARJETA_MIN

  return (
    <View className="gap-3" onLayout={(e) => setAncho(e.nativeEvent.layout.width)}>
      <Text className="text-foreground text-[18px] font-bold">Listas</Text>

      {listas.length ? (
        <View className="flex-row flex-wrap" style={{ gap: HUECO }}>
          {listas.map((lista) => (
            <Tarjeta key={lista.id} lista={lista} lado={lado} onPress={() => onAbrir(lista)} />
          ))}
        </View>
      ) : (
        <Text className="text-muted-foreground text-[13px] leading-5">
          Todavía no publicaste ninguna. En el menú de una lista, «Hacer pública» y aparece acá
          con su link para compartir.
        </Text>
      )}
    </View>
  )
}

/**
 * Una lista en el estante.
 *
 * La portada manda y el texto va debajo, como una tarjeta de álbum: es la misma
 * anatomía que ya usan la discografía de un artista y la portada de inicio, así
 * que abrir un perfil no obliga a aprender otra forma de mirar una lista.
 */
function Tarjeta({
  lista,
  lado,
  onPress,
}: {
  lista: Playlist
  lado: number
  onPress: () => void
}) {
  const [over, setOver] = useState(false)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${lista.name}`}
      onPress={onPress}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
      style={{ width: lado, opacity: over ? 0.82 : 1 }}
      className="gap-2 active:opacity-70"
    >
      <View className="overflow-hidden rounded-lg">
        <PlaylistCover covers={lista.covers} coverPath={lista.coverPath} size={lado} />
      </View>
      <View className="gap-0.5">
        <Text className="text-foreground text-[14px] font-semibold" numberOfLines={2}>
          {lista.name}
        </Text>
        <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
          {lista.tracks} {lista.tracks === 1 ? 'canción' : 'canciones'}
          {lista.totalMs > 0 ? ` · ${formatLength(lista.totalMs)}` : ''}
        </Text>
      </View>
    </Pressable>
  )
}
