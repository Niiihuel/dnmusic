import { TextoPerfil as Text } from './FuentePerfil'
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import type { Playlist } from '../services/playlists'
import { useListasPublicas } from './useListasPublicas'
import { AccionSocial } from './Social'
import { PlaylistCover } from './PlaylistCover'
import { formatLength } from './SeekBar'

const TARJETA_MIN = 150
const HUECO = 12

export function ListasPerfil({
  ownerId,
  propio,
  onAbrir,
  recarga = 0,
}: {
  ownerId: string
  propio: boolean
  recarga?: number
  onAbrir: (playlist: Playlist) => void
}) {
  const { listas, error, cargando, reintentar } = useListasPublicas(ownerId, recarga)
  const [ancho, setAncho] = useState(0)

  if (!cargando && !error && !listas?.length && !propio) return null

  /* Las columnas se calculan sobre el ancho disponible en ambos perfiles. */
  const columnas = Math.max(2, Math.floor((ancho + HUECO) / (TARJETA_MIN + HUECO)))
  const lado = ancho ? (ancho - HUECO * (columnas - 1)) / columnas : TARJETA_MIN

  return (
    <View className="gap-3" onLayout={(e) => setAncho(e.nativeEvent.layout.width)}>
      <Text className="text-foreground text-title3 font-bold">Listas públicas</Text>

      {error ? (
        <View className="gap-2">
          <Text accessibilityRole="alert" className="text-muted-foreground text-footnote">{error}</Text>
          <AccionSocial label="Reintentar" onPress={reintentar} secundaria compacta />
        </View>
      ) : null}
      {cargando && !listas?.length ? (
        <Text className="text-muted-foreground text-footnote">Cargando listas públicas…</Text>
      ) : null}
      {listas?.length ? (
        <View className="flex-row flex-wrap" style={{ gap: HUECO }}>
          {listas.map((lista) => (
            <Tarjeta key={lista.id} lista={lista} lado={lado} onPress={() => onAbrir(lista)} />
          ))}
        </View>
      ) : !cargando && !error && propio ? (
        <Text className="text-muted-foreground text-footnote leading-5">
          Todavía no publicaste listas. Podés hacerlas públicas desde su menú.
        </Text>
      ) : null}
    </View>
  )
}

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
        <Text className="text-foreground text-subheadline font-semibold" numberOfLines={2}>
          {lista.name}
        </Text>
        <Text className="text-muted-foreground text-caption1" numberOfLines={1}>
          {lista.tracks} {lista.tracks === 1 ? 'canción' : 'canciones'}
          {lista.totalMs > 0 ? ` · ${formatLength(lista.totalMs)}` : ''}
        </Text>
      </View>
    </Pressable>
  )
}
