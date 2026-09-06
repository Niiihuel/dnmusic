import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { mensajeError } from '../../src/lib/mensajeError'
import { volver } from '../../src/lib/volver'
import { resolveSong, type TrackResult } from '../../src/services/music'
import { addTrack, createPlaylist, listPlaylists, type Playlist } from '../../src/services/playlists'
import { avisar } from '../../src/state/aviso'
import { avisarListaCambiada, cancionPendiente, soltarCancionPendiente } from '../../src/state/listas'
import { usePiso } from '../../src/state/shell'
import { BotonHoja, EncabezadoHoja } from '../../src/ui/EncabezadoHoja'
import { ANCHO_HOJA, Hoja, useHojaModal } from '../../src/ui/Hoja'
import { PlaylistCover } from '../../src/ui/PlaylistCover'
import { SearchField } from '../../src/ui/SearchField'
import { SkeletonList } from '../../src/ui/Skeleton'
import { Vacio } from '../../src/ui/Vacio'
import { ICON_COLOR, IconMusic, IconPlus } from '../../src/ui/icons'

/**
 * «Agregar a una lista»: elegir **a cuál**.
 *
 * Es la hoja de Apple Music que sale de los tres puntos de una canción: la
 * lista de tus listas con un buscador arriba y «Nueva lista» primera. Antes
 * esto era un submenú del menú —una fila por lista colgando de «Agregar a una
 * lista ›»— y en el teléfono un submenú de ocho listas es un menú dentro de
 * otro, sin buscar y sin ver la tapa. En la compu el submenú sigue existiendo,
 * que con mouse es más rápido; esta hoja es la puerta del dedo.
 *
 * La canción llega por `state/listas` y no por la URL: tiene diez campos y
 * pasarla en la ruta la vuelve ilegible. Se toma al abrir la hoja y se suelta
 * al cerrarla.
 *
 * Tocar una lista **agrega y cierra**: es una sola decisión, no un formulario.
 * Si la canción ya estaba, se dice con esas palabras en vez de mostrar un
 * fallo — la base lo contesta sin error (`add_playlist_track`).
 */
export default function ElegirLista() {
  const router = useRouter()
  const piso = usePiso(24)
  const modal = useHojaModal()
  /* Se lee una vez: la hoja vive lo que dura elegir, y la canción no cambia. */
  const [track] = useState<TrackResult | null>(() => cancionPendiente())
  const [listas, setListas] = useState<Playlist[] | null>(null)
  const [filtro, setFiltro] = useState('')
  /** La lista a la que se está sumando, para marcar su fila. */
  const [ocupada, setOcupada] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    listPlaylists()
      .then((mine) => vivo && setListas(mine))
      .catch(() => vivo && setListas([]))
    return () => {
      vivo = false
      soltarCancionPendiente()
    }
  }, [])

  const q = filtro.trim().toLowerCase()
  const visibles = useMemo(
    () => (listas ?? []).filter((p) => !q || p.name.toLowerCase().includes(q)),
    [listas, q],
  )

  const cerrar = () => volver(router, '/')

  /**
   * Sumar la canción a la lista elegida.
   *
   * Resolver el audio es lo que tarda: la primera vez hay que traerlo de
   * YouTube Music y dejarlo en Storage. Si ya se mandó alguna vez —o la
   * canción viene de otra lista, con su audio puesto— es inmediato.
   */
  async function sumar(lista: Playlist) {
    if (!track || ocupada) return
    setOcupada(lista.id)
    try {
      const resuelto = track.audioPath
        ? { path: track.audioPath, artworkPath: track.artworkPath ?? null, durationMs: track.durationMs }
        : await resolveSong(track)
      const ok = await addTrack(lista.id, {
        videoId: track.videoId,
        title: track.title,
        artist: track.artist,
        artistId: track.artistId,
        artworkUrl: track.artworkUrl,
        artworkPath: resuelto.artworkPath,
        audioPath: resuelto.path,
        durationMs: resuelto.durationMs || track.durationMs,
        truePeak: undefined,
      })
      avisar(ok ? `«${track.title}» agregada a ${lista.name}.` : `«${track.title}» ya está en ${lista.name}.`)
      if (ok) avisarListaCambiada(lista.id)
      cerrar()
    } catch (e) {
      avisar(`No se pudo agregar: ${mensajeError(e)}`, true)
      setOcupada(null)
    }
  }

  /** Una lista nueva con la canción adentro, con el primer «Mi lista #N» libre. */
  async function nueva() {
    if (!track || ocupada) return
    const usados = new Set((listas ?? []).map((p) => p.name))
    let n = (listas?.length ?? 0) + 1
    while (usados.has(`Mi lista #${n}`)) n++
    setOcupada('nueva')
    try {
      const hecha = await createPlaylist(`Mi lista #${n}`)
      await sumar(hecha)
    } catch (e) {
      avisar(mensajeError(e), true)
      setOcupada(null)
    }
  }

  return (
    <Hoja>
      <View className="flex-1 bg-background">
        <View className="w-full flex-1 self-center" style={{ maxWidth: ANCHO_HOJA }}>
          <EncabezadoHoja
            titulo="Agregar a una lista"
            sobre={track?.title}
            izquierda={<BotonHoja tipo="cerrar" onPress={cerrar} />}
          />
          <View className="px-4 pb-2">
            <SearchField value={filtro} onChangeText={setFiltro} placeholder="Buscar en tus listas" />
          </View>
          <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: modal ? 16 : piso }}
          >
            {!track ? (
              <Vacio
                compacto
                icono={<IconMusic size={20} color={ICON_COLOR.muted} />}
                titulo="No hay canción para agregar"
                detalle="Volvé y elegí «Agregar a una lista» desde una canción."
              />
            ) : listas === null ? (
              <View className="px-4 pt-2">
                <SkeletonList rows={4} />
              </View>
            ) : (
              <>
                {!q ? (
                  <Fila
                    icono={
                      <View className="h-12 w-12 items-center justify-center rounded-lg bg-muted">
                        {ocupada === 'nueva' ? (
                          <ActivityIndicator size="small" color={ICON_COLOR.foreground} />
                        ) : (
                          <IconPlus size={20} color={ICON_COLOR.foreground} />
                        )}
                      </View>
                    }
                    titulo="Nueva lista"
                    detalle="Con esta canción adentro"
                    onPress={() => void nueva()}
                    disabled={ocupada !== null}
                  />
                ) : null}
                {visibles.length ? (
                  <Text className="px-5 pb-1 pt-3 text-muted-foreground text-[11px] font-semibold uppercase tracking-[1.2px]">
                    {q ? 'Resultados' : 'Tus listas'}
                  </Text>
                ) : null}
                {visibles.map((p) => (
                  <Fila
                    key={p.id}
                    icono={
                      <View className="overflow-hidden rounded-lg">
                        <PlaylistCover covers={p.covers} coverPath={p.coverPath} size={48} />
                      </View>
                    }
                    titulo={p.name}
                    detalle={`${p.tracks} ${p.tracks === 1 ? 'canción' : 'canciones'}${
                      p.colaborativa ? ' · Colaborativa' : ''
                    }`}
                    ocupada={ocupada === p.id}
                    disabled={ocupada !== null}
                    onPress={() => void sumar(p)}
                  />
                ))}
                {listas.length && !visibles.length ? (
                  <Vacio
                    compacto
                    icono={<IconMusic size={20} color={ICON_COLOR.muted} />}
                    titulo="Sin resultados"
                    detalle={`No tenés ninguna lista que se llame «${filtro.trim()}».`}
                  />
                ) : null}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Hoja>
  )
}

/** Una fila de lista: tapa, nombre y cuántas tiene. */
function Fila({
  icono,
  titulo,
  detalle,
  ocupada = false,
  disabled = false,
  onPress,
}: {
  icono: React.ReactNode
  titulo: string
  detalle: string
  ocupada?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Agregar a ${titulo}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="mx-2 flex-row items-center gap-3 rounded-xl px-3 py-2.5 active:bg-muted"
      style={disabled && !ocupada ? { opacity: 0.6 } : undefined}
    >
      {icono}
      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-[15px]" numberOfLines={1}>
          {titulo}
        </Text>
        <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
          {detalle}
        </Text>
      </View>
      {ocupada ? <ActivityIndicator size="small" color={ICON_COLOR.muted} /> : null}
    </Pressable>
  )
}
