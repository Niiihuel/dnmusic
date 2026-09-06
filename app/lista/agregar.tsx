import { useEffect, useMemo, useState } from 'react'
import { Image, Pressable, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { artworkSource } from '../../src/lib/artwork'
import { volver } from '../../src/lib/volver'
import { resolveSong, searchTracks, type TrackResult } from '../../src/services/music'
import { ultimasEscuchas } from '../../src/services/plays'
import { addTrack, listTracks, type PlaylistTrack } from '../../src/services/playlists'
import { sugerenciasParaLista } from '../../src/services/recomendaciones'
import { avisar } from '../../src/state/aviso'
import { avisarListaCambiada } from '../../src/state/listas'
import { useKeyboardH, usePiso } from '../../src/state/shell'
import { Confirmar } from '../../src/ui/Confirmar'
import { BotonConfirmar, BotonHoja, EncabezadoHoja } from '../../src/ui/EncabezadoHoja'
import { ANCHO_HOJA, Hoja, useHojaModal } from '../../src/ui/Hoja'
import { SearchField } from '../../src/ui/SearchField'
import { SkeletonList } from '../../src/ui/Skeleton'
import { Vacio } from '../../src/ui/Vacio'
import { ICON_COLOR, IconCheck, IconMusic, IconPlus, IconSearch } from '../../src/ui/icons'

/**
 * «Agregar música» a una lista: elegir varias y confirmar de una.
 *
 * Es la hoja de Apple Music que abre el «+ Agregar música» de una playlist:
 * un buscador arriba y, mientras no escribís, canciones sugeridas y lo que
 * escuchaste últimamente. Cada fila tiene su «⊕» que se vuelve «✓» al tocarla,
 * arriba se va contando —«3 canciones a “Mi lista”»— y la marca de la derecha
 * las guarda todas juntas. Cerrar con algo elegido pregunta antes de tirarlo.
 *
 * La razón de que sea **elegir varias** y no una por una: armar una lista es
 * juntar diez canciones, y con una por una cada «+» era un viaje a la red que
 * te dejaba esperando antes de poder tocar la siguiente. Acá elegir es
 * instantáneo y el trabajo se hace al final, con la rueda en la marca.
 *
 * El audio se resuelve al guardar y no al elegir, por lo mismo: resolver diez
 * canciones que tal vez saques antes de confirmar sería tráfico por nada.
 */
export default function AgregarMusica() {
  const router = useRouter()
  const piso = usePiso(24)
  const teclado = useKeyboardH()
  const modal = useHojaModal()
  const { id, nombre } = useLocalSearchParams<{ id?: string; nombre?: string }>()
  const listaNombre = nombre?.trim() || 'la lista'

  const [enLista, setEnLista] = useState<PlaylistTrack[] | null>(null)
  const [sugeridas, setSugeridas] = useState<TrackResult[] | null>(null)
  const [recientes, setRecientes] = useState<TrackResult[] | null>(null)

  const [consulta, setConsulta] = useState('')
  const [resultados, setResultados] = useState<{
    q: string
    items: TrackResult[]
    /** El servicio no contestó: se dice, en vez de dejar el esqueleto para siempre. */
    fallo?: boolean
  } | null>(null)
  const [buscando, setBuscando] = useState(false)

  /** Lo elegido, por videoId, en el orden en que se tocó. */
  const [elegidas, setElegidas] = useState<Map<string, TrackResult>>(new Map())
  const [guardando, setGuardando] = useState(false)
  const [preguntando, setPreguntando] = useState(false)

  /* Lo que ya está en la lista: es el ancla de las sugerencias y lo que no se
     vuelve a ofrecer. Con eso llegan también las sugerencias y lo reciente. */
  useEffect(() => {
    if (!id) return
    let vivo = true
    listTracks(id)
      .then(async (tracks) => {
        if (!vivo) return
        setEnLista(tracks)
        const [sug, rec] = await Promise.all([
          sugerenciasParaLista(tracks, [], 8).catch(() => []),
          ultimasEscuchas(12).catch(() => []),
        ])
        if (!vivo) return
        setSugeridas(sug)
        setRecientes(
          rec.map((e) => ({
            videoId: e.videoId,
            title: e.title,
            artist: e.artist,
            artistId: e.artistId,
            album: '',
            albumId: null,
            artworkUrl: e.artworkUrl ?? '',
            durationMs: 0,
            artworkPath: e.artworkPath,
          })),
        )
      })
      .catch(() => {
        if (!vivo) return
        setEnLista([])
        setSugeridas([])
        setRecientes([])
      })
    return () => {
      vivo = false
    }
  }, [id])

  /*
   * La búsqueda se corta con un AbortController y no con un debounce a secas:
   * escribir rápido dispara varias, y sin cancelar la anterior, la respuesta
   * lenta de «ma» podía pisar la de «marina». Mismo patrón que el buscador de
   * canciones y el de personas.
   */
  useEffect(() => {
    const q = consulta.trim()
    if (q.length < 2) return
    const corte = new AbortController()
    const t = setTimeout(() => {
      setBuscando(true)
      searchTracks(q, corte.signal)
        .then((items) => setResultados({ q, items }))
        .catch(() => {
          /* Abortada por una tecla nueva no es un fallo: la siguiente búsqueda
             ya está en camino. Sin red o con el servicio caído, se dice. */
          if (!corte.signal.aborted) setResultados({ q, items: [], fallo: true })
        })
        .finally(() => setBuscando(false))
    }, 250)
    return () => {
      corte.abort()
      clearTimeout(t)
    }
  }, [consulta])

  const yaAdentro = useMemo(() => new Set((enLista ?? []).map((t) => t.videoId)), [enLista])
  const q = consulta.trim()
  const enBusqueda = q.length >= 2
  const mostrados = enBusqueda ? (resultados?.q === q ? resultados.items : null) : null
  const fallo = enBusqueda && resultados?.q === q && resultados.fallo === true

  const alternar = (track: TrackResult) => {
    setElegidas((antes) => {
      const siguiente = new Map(antes)
      if (siguiente.has(track.videoId)) siguiente.delete(track.videoId)
      else siguiente.set(track.videoId, track)
      return siguiente
    })
  }

  const salir = () => volver(router, '/')
  const cerrar = () => {
    if (elegidas.size && !guardando) setPreguntando(true)
    else salir()
  }

  /**
   * Guardar todas las elegidas, en orden.
   *
   * Una que falle no voltea el resto: se cuenta, se sigue, y al final se dice
   * cuántas entraron. Las que la base contesta como repetidas tampoco cuentan
   * como error: ya estaban, que es lo que uno quería.
   */
  async function guardar() {
    if (!id || !elegidas.size || guardando) return
    setGuardando(true)
    let sumadas = 0
    let fallidas = 0
    for (const track of elegidas.values()) {
      try {
        const resuelto = track.audioPath
          ? { path: track.audioPath, artworkPath: track.artworkPath ?? null, durationMs: track.durationMs }
          : await resolveSong(track)
        const ok = await addTrack(id, {
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
        if (ok) sumadas++
      } catch {
        fallidas++
      }
    }
    avisarListaCambiada(id)
    if (fallidas && !sumadas) {
      avisar(`No se pudo agregar ${fallidas === 1 ? 'la canción' : 'ninguna'}. Probá de nuevo.`, true)
      setGuardando(false)
      return
    }
    avisar(
      fallidas
        ? `Agregué ${sumadas} de ${sumadas + fallidas} a ${listaNombre}.`
        : `${sumadas} ${sumadas === 1 ? 'canción agregada' : 'canciones agregadas'} a ${listaNombre}.`,
    )
    salir()
  }

  const cuantas = elegidas.size
  const sobre =
    cuantas === 0
      ? undefined
      : `${cuantas} ${cuantas === 1 ? 'canción' : 'canciones'} a «${listaNombre}»`

  /** Una tanda de filas, sin las que ya están en la lista. */
  const seccion = (titulo: string, items: TrackResult[] | null, vacio?: string) => {
    if (items === null) return <SkeletonList rows={3} />
    const visibles = items.filter((t) => !yaAdentro.has(t.videoId))
    if (!visibles.length) {
      if (!vacio) return null
      return (
        <Text className="px-5 py-2 text-muted-foreground text-[13px]">{vacio}</Text>
      )
    }
    return (
      <View className="pb-2">
        <Text className="px-5 pb-1 pt-4 text-[17px] font-bold text-foreground">{titulo}</Text>
        {visibles.map((t) => (
          <FilaCancion
            key={t.videoId}
            track={t}
            elegida={elegidas.has(t.videoId)}
            onToggle={() => alternar(t)}
          />
        ))}
      </View>
    )
  }

  if (!id) {
    return (
      <Hoja>
        <View className="flex-1 items-center justify-center bg-background">
          <Text className="text-muted-foreground text-[13px]">No se encontró la lista.</Text>
        </View>
      </Hoja>
    )
  }

  return (
    <Hoja>
      <View className="flex-1 bg-background">
        <View className="w-full flex-1 self-center" style={{ maxWidth: ANCHO_HOJA }}>
          <EncabezadoHoja
            titulo={`Agregar a «${listaNombre}»`}
            sobre={sobre}
            izquierda={<BotonHoja tipo="cerrar" onPress={cerrar} />}
            derecha={
              <BotonConfirmar
                label={cuantas ? `Agregar ${cuantas} ${cuantas === 1 ? 'canción' : 'canciones'}` : 'Agregar'}
                activo={cuantas > 0}
                ocupado={guardando}
                onPress={() => void guardar()}
              />
            }
          />
          <View className="px-4 pb-1">
            <SearchField
              value={consulta}
              onChangeText={setConsulta}
              placeholder="Artistas, canciones y más"
              loading={buscando}
            />
          </View>
          <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingBottom: (modal ? 16 : piso) + teclado }}
          >
            {enBusqueda ? (
              mostrados === null ? (
                <View className="pt-3">
                  <SkeletonList rows={5} />
                </View>
              ) : mostrados.length ? (
                <View className="pt-1">
                  {mostrados.map((t) => (
                    <FilaCancion
                      key={t.videoId}
                      track={t}
                      elegida={elegidas.has(t.videoId)}
                      yaEsta={yaAdentro.has(t.videoId)}
                      onToggle={() => alternar(t)}
                    />
                  ))}
                </View>
              ) : fallo ? (
                <Vacio
                  compacto
                  icono={<IconSearch size={20} color={ICON_COLOR.muted} />}
                  titulo="No se pudo buscar"
                  detalle="El servicio de música no contestó. Probá de nuevo en un momento."
                />
              ) : (
                <Vacio
                  compacto
                  icono={<IconSearch size={20} color={ICON_COLOR.muted} />}
                  titulo="Sin resultados"
                  detalle={`No encontramos «${q}».`}
                />
              )
            ) : (
              <>
                {seccion(
                  'Sugeridas para esta lista',
                  sugeridas,
                  enLista && enLista.length === 0
                    ? 'Cuando la lista tenga canciones, acá van a aparecer otras parecidas.'
                    : undefined,
                )}
                {seccion('Escuchadas recientemente', recientes)}
                {sugeridas && recientes && !sugeridas.length && !recientes.length && enLista?.length ? (
                  <Vacio
                    compacto
                    icono={<IconMusic size={20} color={ICON_COLOR.muted} />}
                    titulo="Buscá algo para empezar"
                    detalle="Escribí el nombre de una canción o de un artista."
                  />
                ) : null}
              </>
            )}
          </ScrollView>
        </View>
      </View>
      <Confirmar
        visible={preguntando}
        titulo="¿Descartar lo elegido?"
        mensaje={`Elegiste ${cuantas} ${cuantas === 1 ? 'canción' : 'canciones'} que todavía no se agregaron.`}
        rotulo="Descartar"
        onCancelar={() => setPreguntando(false)}
        onConfirmar={() => {
          setPreguntando(false)
          salir()
        }}
      />
    </Hoja>
  )
}

/**
 * Una canción para elegir: tapa, nombre, artista y el «⊕» que se vuelve «✓».
 *
 * La marca se dibuja con luminancia y no con color: apagada es el círculo gris
 * con el más; elegida, el disco blanco del acento con la marca oscura adentro.
 * Es el mismo par que usan los interruptores de Ajustes.
 */
function FilaCancion({
  track,
  elegida,
  yaEsta = false,
  onToggle,
}: {
  track: TrackResult
  elegida: boolean
  /** Ya está en la lista: se muestra, pero no se puede volver a elegir. */
  yaEsta?: boolean
  onToggle: () => void
}) {
  const tapa = artworkSource(track.artworkPath ?? null, track.artworkUrl, 96)
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={`${track.title}, ${track.artist}`}
      accessibilityState={{ checked: elegida || yaEsta, disabled: yaEsta }}
      disabled={yaEsta}
      onPress={onToggle}
      className="mx-2 flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-muted"
      style={yaEsta ? { opacity: 0.5 } : undefined}
    >
      {tapa ? (
        <Image source={{ uri: tapa }} className="rounded bg-card" style={{ width: 48, height: 48 }} />
      ) : (
        <View className="items-center justify-center rounded bg-card" style={{ width: 48, height: 48 }}>
          <IconMusic size={18} color={ICON_COLOR.muted} />
        </View>
      )}
      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-[15px]" numberOfLines={1}>
          {track.title}
        </Text>
        <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
          {yaEsta ? 'Ya está en la lista' : track.artist}
        </Text>
      </View>
      <View
        className={`h-7 w-7 items-center justify-center rounded-full ${
          elegida || yaEsta ? 'bg-primary' : 'bg-muted'
        }`}
      >
        {elegida || yaEsta ? (
          <IconCheck size={14} color={ICON_COLOR.onPrimary} />
        ) : (
          <IconPlus size={15} color={ICON_COLOR.foreground} />
        )}
      </View>
    </Pressable>
  )
}
