import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
  /** Los `params` de los géneros ya plantados: los cruza la grilla al cargar. */
  const [semillasGuardadas, setSemillasGuardadas] = useState<string[]>([])

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
      setSemillasGuardadas(semillas.filter((s) => s.kind === 'genero').map((s) => s.ref))
    })
    return () => {
      alive = false
    }
  }, [])

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
      {paso === 'generos' ? (
        <PasoGeneros
          elegidos={generosElegidos}
          /* Los géneros ya plantados, para premarcarlos al llegar la grilla. */
          premarcados={semillasGuardadas}
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
        />
      )}
      {error ? (
        <View className="px-6 pb-3">
          <FormError message={error} />
        </View>
      ) : null}
    </SafeAreaView>
  )
}

/* ── Paso 1: géneros ─────────────────────────────────────────────────────── */

function PasoGeneros({
  elegidos,
  premarcados,
  reeleccion,
  onToggle,
  onSeguir,
  onSaltear,
}: {
  elegidos: Genero[]
  /** Refs de los géneros ya plantados: se premarcan al llegar la grilla. */
  premarcados?: string[]
  reeleccion?: boolean
  onToggle: (g: Genero) => void
  onSeguir: () => void
  onSaltear: () => void
}) {
  const [generos, setGeneros] = useState<Genero[] | null>(null)
  /* La premarcación corre una sola vez: sin el candado, destocar un género
     después lo volvería a marcar en cada render. */
  const premarcado = useRef(false)

  useEffect(() => {
    let alive = true
    fetchGeneros().then((g) => alive && setGeneros(g))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!generos || premarcado.current || !premarcados?.length) return
    const iniciales = generos.filter((g) => premarcados.includes(g.params))
    if (iniciales.length) {
      premarcado.current = true
      for (const g of iniciales) onToggle(g)
    }
  }, [generos, premarcados, onToggle])

  const listo = elegidos.length >= MINIMO

  return (
    <>
      <Encabezado
        titulo={reeleccion ? '¿Sigue gustándote?' : '¿Qué te gusta escuchar?'}
        detalle={
          reeleccion
            ? `Lo que tenías ya está marcado. Elegí al menos ${MINIMO} géneros y guardá.`
            : `Elegí al menos ${MINIMO} géneros. Con esto armamos tu inicio; después lo afina solo tu escucha.`
        }
        onSaltear={onSaltear}
      />
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="flex-row flex-wrap gap-4 px-6 pb-6">
        {(generos ?? Array.from({ length: 12 }, () => null)).map((g, i) =>
          g === null ? (
            <Skeleton key={i} width={160} height={160 * 0.58} radius={8} />
          ) : (
            <GeneroOpcion
              key={g.params}
              genero={g}
              elegido={elegidos.some((x) => x.params === g.params)}
              onPress={() => onToggle(g)}
            />
          ),
        )}
      </ScrollView>
      <View className="gap-3 px-6 pb-6">
        <PrimaryButton
          label={listo ? 'Seguir' : `Elegí ${MINIMO - elegidos.length} más`}
          onPress={onSeguir}
          disabled={!listo}
        />
        <GhostButton label={reeleccion ? 'Dejarlo como está' : 'Saltar'} onPress={onSaltear} />
      </View>
    </>
  )
}

/** La tarjeta de género de la portada, con el estado «elegida» encima:
 *  velo claro y tilde. Sin color nuevo — el estado es luminancia. */
function GeneroOpcion({
  genero,
  elegido,
  onPress,
}: {
  genero: Genero
  elegido: boolean
  onPress: () => void
}) {
  const lado = 160
  const alto = Math.round(lado * 0.58)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${elegido ? 'Quitar' : 'Elegir'} ${genero.name}`}
      accessibilityState={{ selected: elegido }}
      onPress={onPress}
      style={{ width: lado }}
      className="active:opacity-80"
    >
      <View
        className="overflow-hidden rounded-lg bg-card"
        style={{
          width: lado,
          height: alto,
          opacity: elegido ? 1 : 0.55,
        }}
      >
        {genero.artworkUrl ? (
          <Image
            source={{ uri: proxiedImage(artworkUrlAtSize(genero.artworkUrl, 400)) }}
            resizeMode="cover"
            style={{ width: lado, height: alto }}
          />
        ) : null}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.78)']}
          locations={[0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
        <Text
          numberOfLines={1}
          className="absolute bottom-2 left-2.5 right-2.5 text-foreground text-[13px] font-bold"
          style={{ textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 6 }}
        >
          {genero.name}
        </Text>
        {elegido ? (
          <View
            style={StyleSheet.absoluteFill}
            className="items-center justify-center"
          >
            <View className="h-9 w-9 items-center justify-center rounded-full bg-background/90">
              <IconCheck size={18} color={ICON_COLOR.foreground} />
            </View>
          </View>
        ) : null}
      </View>
    </Pressable>
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
}: {
  generos: Genero[]
  elegidos: ArtistResult[]
  reeleccion?: boolean
  onToggle: (a: ArtistResult) => void
  guardando: boolean
  onTerminar: () => void
  onSaltear: () => void
}) {
  /** Artistas sugeridos por los géneros elegidos: los `kind: 'artist'` que
   *  traen las páginas de las categorías. Su id ya es de canal (`UC…`),
   *  el mismo espacio del historial. */
  const [sugeridos, setSugeridos] = useState<ArtistResult[] | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [hallados, setHallados] = useState<ArtistResult[]>([])

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
            pool.push({ id: item.id, name: item.title, photoUrl: '', subtitle: '' })
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
        .then((hits) => alive && setHallados(hits.artists))
        .catch(() => alive && setHallados([]))
    }, 400)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [busqueda])

  const lista = useMemo(() => {
    if (busqueda.trim()) return hallados
    return sugeridos ?? []
  }, [busqueda, hallados, sugeridos])

  const listo = elegidos.length >= MINIMO

  return (
    <>
      <Encabezado
        titulo="Ahora, algunos artistas"
        detalle={`Elegí al menos ${MINIMO}. Te sugerimos por tus géneros; también podés buscar.`}
        onSaltear={onSaltear}
      />
      <View className="px-6 pb-4">
        <SearchField
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar artistas"
        />
      </View>
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="px-6 pb-6 gap-1.5">
        {lista.length === 0 && sugeridos !== null && !busqueda.trim() ? (
          <Text className="text-muted-foreground text-sm">
            No encontré sugerencias para tus géneros. Buscá alguno que te guste.
          </Text>
        ) : null}
        {sugeridos === null && !busqueda.trim()
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
        <PrimaryButton
          label={
            listo
              ? reeleccion
                ? 'Guardar elección'
                : elegidos.length === 1
                  ? 'Con este artista, empezar'
                  : `Con ${elegidos.length} artistas, empezar`
              : `Elegí ${MINIMO - elegidos.length} más`
          }
          onPress={onTerminar}
          disabled={!listo || guardando}
          busy={guardando}
        />
        <GhostButton label={reeleccion ? 'Dejarlo como está' : 'Saltar'} onPress={onSaltear} disabled={guardando} />
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
    <Pressable
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
        ) : null}
      </View>
      <Text className="min-w-0 flex-1 text-foreground text-[15px]" numberOfLines={1}>
        {artista.name}
      </Text>
      {elegido ? <IconCheck size={18} color={ICON_COLOR.foreground} /> : null}
    </Pressable>
  )
}

/* ── Compartido ──────────────────────────────────────────────────────────── */

/** El encabezado de los dos pasos: título, detalle y el salto a la derecha. */
function Encabezado({
  titulo,
  detalle,
  onSaltear,
}: {
  titulo: string
  detalle: string
  onSaltear: () => void
}) {
  return (
    <View className="gap-4 px-6 pt-8 pb-5">
      <View className="flex-row items-start justify-between gap-3">
        <Text className="text-foreground text-2xl font-bold" style={{ maxWidth: '75%' }}>
          {titulo}
        </Text>
        <Pressable accessibilityRole="button" onPress={onSaltear} className="active:opacity-70">
          <Text className="text-muted-foreground text-[13px] font-semibold underline">
            Saltar
          </Text>
        </Pressable>
      </View>
      <Text className="text-muted-foreground text-sm leading-5">{detalle}</Text>
    </View>
  )
}
