import { BotonSuperficie } from '../src/ui/BotonSuperficie'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Image,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import {
  fetchGenero,
  fetchGeneros,
  proxiedImage,
  searchMusic,
  type ArtistResult,
  type Genero,
  type HomeItem,
} from '../src/services/music'
import { artworkUrlAtSize } from '../src/lib/artwork'
import { guardarSemillas, completarOnboarding, listarSemillas, type Semilla } from '../src/services/semillas'
import { volver } from '../src/lib/volver'
import { FormError, GhostButton, PrimaryButton } from '../src/ui/Button'
import { ICON_COLOR, IconCheck } from '../src/ui/icons'
import { SearchField } from '../src/ui/SearchField'
import { Skeleton } from '../src/ui/Skeleton'
import { anchoTarjetaGenero, catalogoGeneros } from '../src/lib/catalogoEditorial'
import { TarjetaGenero } from '../src/ui/TarjetaGenero'

/** Mínimo de elecciones por paso: tres es lo que pide el referente y lo que
 *  necesita la radio para no sonar a un solo artista. */
const MINIMO = 3

/**
 * El onboarding: el catálogo **inicial** de una cuenta.
 *
 * Todo lo que alimenta las recomendaciones —el reloj de `plays`, los
 * corazones— necesita uso previo, así que una cuenta nueva nacía sin radio.
 * Acá se dice el gusto de entrada en dos pasos al modo del referente:
 * primero géneros, después artistas sugeridos por esos géneros (con
 * búsqueda para quien quiere puntualizar). Lo elegido se planta como
 * semillas (`services/semillas`) y entra a las anclas de
 * `services/recomendaciones` con un peso chico: arranca sonando a lo
 * declarado y se va diluyendo solo a medida que el historial real manda.
 *
 * Los dos pasos se pueden saltar: saltar es una decisión válida, no un error.
 */
export default function Onboarding() {
  const router = useRouter()
  /* De dónde vino: desde Ajustes es una **reelección** — se premarcan las
     semillas que ya hay y al terminar se vuelve a donde estaba, no a casa. */
  const { de } = useLocalSearchParams<{ de?: string }>()
  const reeleccion = de === 'ajustes'
  const [paso, setPaso] = useState<'generos' | 'artistas'>('generos')
  const [generosElegidos, setGenerosElegidos] = useState<Genero[]>([])
  const [artistasElegidos, setArtistasElegidos] = useState<ArtistResult[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [semillasListas, setSemillasListas] = useState(false)
  const [intentoSemillas, setIntentoSemillas] = useState(0)

  /* Lo ya plantado, para premarcarlo: quien vuelve desde Ajustes tiene que
     ver lo que eligió la última vez, no una grilla virgen. Los géneros se
     marcan cuando llegue la grilla —la elección vive en sus `params`—; los
     artistas alcanzan con el id guardado. */
  useEffect(() => {
    let alive = true
    listarSemillas().then((semillas) => {
      if (!alive) return
      const artistas = semillas
        .filter((s) => s.kind === 'artista')
        .map((s) => ({ id: s.ref, name: s.name, photoUrl: s.artworkUrl, subtitle: '' }))
      if (artistas.length) setArtistasElegidos(artistas)
      // También conserva categorías antiguas que ya no estén en el catálogo.
      setGenerosElegidos(semillas.filter(s => s.kind === 'genero').map(s => ({ params: s.ref, name: s.name, artworkUrl: s.artworkUrl })))
      setSemillasListas(true)
      setError(null)
    }).catch(() => { if (alive) setError('No se pudieron cargar tus gustos. Volvé a intentar.') })
    return () => {
      alive = false
    }
  }, [intentoSemillas])

  const irse = async () => {
    await completarOnboarding()
    /* La bandera local solo gobierna el paseo tras el registro: levantarla
       acá está bien siempre. El destino cambia según de dónde vino. */
    if (reeleccion) volver(router, '/ajustes')
    else router.replace('/')
  }

  const terminar = async () => {
    setGuardando(true)
    setError(null)
    try {
      const semillas: Semilla[] = [
        ...generosElegidos.map((g) => ({
          kind: 'genero' as const,
          ref: g.params,
          name: g.name,
          artworkUrl: g.artworkUrl,
        })),
        ...artistasElegidos.map((a) => ({
          kind: 'artista' as const,
          ref: a.id,
          name: a.name,
          artworkUrl: a.photoUrl,
        })),
      ]
      await guardarSemillas(semillas)
      await irse()
    } catch {
      setError('No se pudo guardar tu elección. Probá de nuevo.')
      setGuardando(false)
    }
  }

  const saltear = irse

  const alTocarGenero = useCallback((g: Genero) => {
    setGenerosElegidos((prev) =>
      prev.some((x) => x.params === g.params)
        ? prev.filter((x) => x.params !== g.params)
        : [...prev, g],
    )
  }, [])

  const alTocarArtista = useCallback((a: ArtistResult) => {
    setArtistasElegidos((prev) =>
      prev.some((x) => x.id === a.id) ? prev.filter((x) => x.id !== a.id) : [...prev, a],
    )
  }, [])

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      {/* La misma luz de arriba que el login y el registro: es la puerta de
          entrada de la app, comparte su atmósfera. */}
      <LinearGradient
        pointerEvents="none"
        colors={['#222222', '#121212']}
        locations={[0, 1]}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 480 }}
      />
      <View style={{ flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      {!semillasListas ? <View className="flex-1 justify-center gap-4 px-6">
        {error ? <PrimaryButton label="Reintentar" onPress={() => setIntentoSemillas(v => v + 1)} /> : <Text className="text-muted-foreground">Preparando tus gustos…</Text>}
      </View> : paso === 'generos' ? (
        <PasoGeneros
          elegidos={generosElegidos}
          reeleccion={reeleccion}
          onToggle={alTocarGenero}
          onSeguir={() => setPaso('artistas')}
          onSaltear={saltear}
        />
      ) : (
        <PasoArtistas
          generos={generosElegidos}
          elegidos={artistasElegidos}
          reeleccion={reeleccion}
          onToggle={alTocarArtista}
          guardando={guardando}
          onTerminar={terminar}
          onSaltear={saltear}
          onVolver={() => setPaso('generos')}
        />
      )}
      {error ? (
        <View className="px-6 pb-3">
          <FormError message={error} />
        </View>
      ) : null}
      </View>
    </SafeAreaView>
  )
}

/* ── Paso 1: géneros ─────────────────────────────────────────────────────── */

function PasoGeneros({
  elegidos,
  reeleccion,
  onToggle,
  onSeguir,
  onSaltear,
}: {
  elegidos: Genero[]
  reeleccion?: boolean
  onToggle: (g: Genero) => void
  onSeguir: () => void
  onSaltear: () => void
}) {
  const [generos, setGeneros] = useState<Genero[] | null>(null)
  const [intento, setIntento] = useState(0)
  const ancho = anchoTarjetaGenero(Math.min(useWindowDimensions().width, 760))

  useEffect(() => {
    let alive = true
    fetchGeneros().then((g) => alive && setGeneros(catalogoGeneros(g, 'genero')))
      .catch(() => { if (alive) setGeneros([]) })
    return () => {
      alive = false
    }
  }, [intento])
  const opciones = generos ? [...generos, ...elegidos.filter(g => !generos.some(actual => actual.params === g.params))] : null

  const listo = elegidos.length >= MINIMO

  return (
    <>
      <Encabezado
        titulo={reeleccion ? '¿Sigue gustándote?' : '¿Qué te gusta escuchar?'}
        paso={1}
        detalle={
          reeleccion
            ? 'Tus gustos, a tu manera. Podés cambiar lo que habías elegido.'
            : `Elegí ${MINIMO} o más. Es el punto de partida; tu música hace el resto.`
        }
        onSaltear={onSaltear}
      />
      <ScrollView className="min-h-0 flex-1" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
        {generos?.length === 0 ? <View className="gap-3 py-5">
          <Text className="text-muted-foreground">No pudimos cargar los géneros. Tus elecciones siguen guardadas.</Text>
          <GhostButton label="Volver a intentar" onPress={() => { setGeneros(null); setIntento(v => v + 1) }} />
        </View> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {(opciones ?? Array.from({ length: 12 }, () => null)).map((g, i) =>
          g === null ? (
            <Skeleton key={i} width={ancho} height={164} radius={18} />
          ) : (
            <TarjetaGenero
              key={g.params}
              nombre={g.name}
              ancho={ancho}
              elegido={elegidos.some((x) => x.params === g.params)}
              onPress={() => onToggle(g)}
            />
          ),
        )}
        </View>
      </ScrollView>
      <View className="gap-3 px-6 pb-6">
        <Text accessibilityLiveRegion="polite" className="text-muted-foreground text-footnote text-center">{elegidos.length ? `${elegidos.length} elegidos` : 'Tu selección empieza acá'}</Text>
        <PrimaryButton
          label={listo ? 'Elegir artistas' : `Elegí ${MINIMO - elegidos.length} más`}
          onPress={onSeguir}
          disabled={!listo}
        />
      </View>
    </>
  )
}



/* ── Paso 2: artistas ────────────────────────────────────────────────────── */

function PasoArtistas({
  generos,
  elegidos,
  reeleccion,
  onToggle,
  guardando,
  onTerminar,
  onSaltear,
  onVolver,
}: {
  generos: Genero[]
  elegidos: ArtistResult[]
  reeleccion?: boolean
  onToggle: (a: ArtistResult) => void
  guardando: boolean
  onTerminar: () => void
  onSaltear: () => void
  onVolver: () => void
}) {
  /** Artistas sugeridos por los géneros elegidos: los `kind: 'artist'` que
   *  traen las páginas de las categorías. Su id ya es de canal (`UC…`),
   *  el mismo espacio del historial. */
  const [sugeridos, setSugeridos] = useState<ArtistResult[] | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [hallados, setHallados] = useState<{ termino: string; artistas: ArtistResult[] } | null>(null)

  useEffect(() => {
    let alive = true
    /* De cada género, la primera tanda de artistas que traiga su página. En
       paralelo porque son pedidos independientes; los repetidos se caen. */
    Promise.all(generos.map((g) => fetchGenero(g.params)))
      .then((paginas) => {
        if (!alive) return
        const vistos = new Set<string>()
        const pool: ArtistResult[] = []
        for (const items of paginas) {
          for (const item of items as (HomeItem & { photoUrl?: string })[]) {
            if (item.kind !== 'artist' || !item.id || vistos.has(item.id)) continue
            vistos.add(item.id)
            pool.push({ id: item.id, name: item.title, photoUrl: item.artworkUrl, subtitle: '' })
          }
        }
        setSugeridos(pool)
      })
      .catch(() => alive && setSugeridos([]))
    return () => {
      alive = false
    }
  }, [generos])

  /* La búsqueda busca artistas apenas hay texto, con el mismo debounce corto
     del registro: una consulta por pausa, nunca por tecla. Con campo vacío no
     se limpia nada acá: lo que se muestra ya depende del texto (`lista`), y
     los hallazgos viejos quedan solo hasta que la próxima búsqueda los pise. */
  useEffect(() => {
    const term = busqueda.trim()
    if (!term) return
    let alive = true
    const timer = setTimeout(() => {
      searchMusic(term)
        .then((hits) => alive && setHallados({ termino: term, artistas: hits.artists }))
        .catch(() => alive && setHallados({ termino: term, artistas: [] }))
    }, 400)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [busqueda])

  const lista = useMemo(() => {
    if (busqueda.trim()) return hallados?.termino === busqueda.trim() ? hallados.artistas : []
    return [...elegidos, ...(sugeridos ?? []).filter(a => !elegidos.some(e => e.id === a.id))]
  }, [busqueda, hallados, sugeridos, elegidos])
  const buscando = !!busqueda.trim() && hallados?.termino !== busqueda.trim()

  const listo = elegidos.length >= MINIMO

  return (
    <>
      <Encabezado
        titulo="Ahora, algunos artistas"
        paso={2}
        detalle={`Elegí ${MINIMO} o más voces que quieras tener cerca.`}
        onSaltear={onSaltear}
        disabled={guardando}
      />
      <View className="px-6 pb-4">
        <SearchField
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar artistas"
          loading={buscando}
        />
      </View>
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="px-6 pb-6 gap-1.5">
        {busqueda.trim() && !buscando && lista.length === 0 ? <Text className="text-muted-foreground text-subheadline py-4">No encontramos artistas. Probá con otro nombre.</Text> : null}
        {lista.length === 0 && sugeridos !== null && !busqueda.trim() ? (
          <Text className="text-muted-foreground text-subheadline">
            No encontré sugerencias para tus géneros. Buscá alguno que te guste.
          </Text>
        ) : null}
        {(sugeridos === null && !busqueda.trim() && !elegidos.length) || buscando
          ? [0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i} className="flex-row items-center gap-3 py-1">
                <Skeleton width={52} height={52} radius={26} />
                <Skeleton width={180} height={16} />
              </View>
            ))
          : lista.map((artista) => (
              <ArtistaOpcion
                key={artista.id}
                artista={artista}
                elegido={elegidos.some((x) => x.id === artista.id)}
                onPress={() => onToggle(artista)}
              />
            ))}
      </ScrollView>
      <View className="gap-3 px-6 pb-6">
        <Text accessibilityLiveRegion="polite" className="text-muted-foreground text-footnote text-center">{elegidos.length} artistas elegidos</Text>
        <PrimaryButton
          label={
            listo
              ? reeleccion
                ? 'Guardar elección'
                : 'Empezar a escuchar'
              : `Elegí ${MINIMO - elegidos.length} más`
          }
          onPress={onTerminar}
          disabled={!listo || guardando}
          busy={guardando}
        />
        <GhostButton label="Volver a géneros" onPress={onVolver} disabled={guardando} />
      </View>
    </>
  )
}

function ArtistaOpcion({
  artista,
  elegido,
  onPress,
}: {
  artista: ArtistResult
  elegido: boolean
  onPress: () => void
}) {
  return (
    <BotonSuperficie
      accessibilityRole="button"
      accessibilityLabel={`${elegido ? 'Quitar' : 'Elegir'} ${artista.name}`}
      accessibilityState={{ selected: elegido }}
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-lg p-2 active:opacity-80 ${elegido ? 'bg-muted' : ''}`}
    >
      <View className="h-[52px] w-[52px] overflow-hidden rounded-full bg-card">
        {artista.photoUrl ? (
          <Image
            source={{ uri: proxiedImage(artworkUrlAtSize(artista.photoUrl, 128)) }}
            className="h-[52px] w-[52px]"
          />
        ) : <View className="flex-1 items-center justify-center"><Text className="text-foreground text-title3 font-semibold">{artista.name.charAt(0).toUpperCase()}</Text></View>}
      </View>
      <Text className="min-w-0 flex-1 text-foreground text-subheadline" numberOfLines={1}>
        {artista.name}
      </Text>
      {elegido ? <IconCheck size={18} color={ICON_COLOR.foreground} /> : null}
    </BotonSuperficie>
  )
}

/* ── Compartido ──────────────────────────────────────────────────────────── */

/** El encabezado de los dos pasos: título, detalle y el salto a la derecha. */
function Encabezado({
  titulo,
  detalle,
  onSaltear,
  paso,
  disabled = false,
}: {
  titulo: string
  detalle: string
  onSaltear: () => void
  paso: 1 | 2
  disabled?: boolean
}) {
  return (
    <View className="gap-4 px-6 pt-5 pb-5">
      <View className="flex-row items-center gap-3">
        <Text className="flex-1 text-muted-foreground text-caption1 font-semibold">TU MÚSICA · {paso} DE 2</Text>
        <GhostButton label="Ahora no" onPress={onSaltear} disabled={disabled} />
      </View>
      <View className="flex-row items-start justify-between gap-3">
        <Text className="text-foreground text-title1 font-bold" style={{ letterSpacing: -0.7 }}>
          {titulo}
        </Text>
      </View>
      <Text className="text-muted-foreground text-subheadline">{detalle}</Text>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 2, now: paso }} style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2].map(n => <View key={n} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: n <= paso ? '#D5D5D5' : '#343434' }} />)}
      </View>
    </View>
  )
}
