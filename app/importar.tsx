import { superficieInteractivaWeb, estadoControlWeb } from '../src/ui/estadoControl'
import { SharedLayoutBg } from '../src/ui/SharedLayoutBg'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Text,
  useWindowDimensions,
  View,
  type TextInputProps,
} from 'react-native'
import { useRouter } from 'expo-router'
import { EntradaTexto } from '../src/ui/EntradaTexto'
import { IconSpotify } from '../src/ui/IconSpotify'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAudioPlayer } from 'expo-audio'
import { PLACEHOLDER_COLOR } from '../src/ui/Field'
import { FormError } from '../src/ui/Button'
import { CabeceraSocial, AccionSocial } from '../src/ui/Social'
import { Hoja, useHojaModal } from '../src/ui/Hoja'
import { ScrollArea } from '../src/ui/ScrollArea'
import { Menu } from '../src/ui/Menu'
import { Confirmar } from '../src/ui/Confirmar'
import { useNavigation, usePreventRemove, type NavigationAction } from 'expo-router/react-navigation'
import { artworkSource } from '../src/lib/artwork'
import { abrirLista, pauseForSnippet } from '../src/state/playback'
import { avisar } from '../src/state/aviso'
import { volver } from '../src/lib/volver'
import { mensajeError } from '../src/lib/mensajeError'
import {
  ICON_COLOR,
  IconCheck,
  IconClose,
  IconMusic,
  IconPause,
  IconPlay,
} from '../src/ui/icons'
import {
  TOPE_SPOTIFY,
  emparejarLista,
  guardarLista,
  leerListaSpotify,
  terminarEnSegundoPlano,
  type Avance,
  type Emparejado,
  type ListaSpotify,
} from '../src/services/importar'
import type { TrackResult } from '../src/services/music'

/**
 * Las paradas del camino, en orden.
 *
 * `leyendo` y `emparejando` son dos esperas distintas y se dicen distinto: la
 * primera habla con Spotify y dura poco, la segunda busca cada canción en
 * YouTube Music y puede tardar un minuto en una lista larga. Con un solo estado
 * «trabajando» la barra parecía trabada en la mitad.
 */
type Fase = 'entrada' | 'leyendo' | 'emparejando' | 'revision' | 'guardando'

/** Debajo de esto la app es pestañas y el contenido va de borde a borde. */
const SHELL_PX = 780
/** Tope del contenido en escritorio, como en el resto de las pantallas. */
const CAP = 640

/**
 * Traer una lista de Spotify.
 *
 * La pantalla es un solo camino con cuatro paradas —pegar, leer, emparejar,
 * revisar— y la única que pide algo es la última.
 *
 * La revisión es el motivo por el que esta pantalla existe en vez de un botón
 * que importa y avisa cuando terminó. Recrear una lista por nombre acierta casi
 * siempre, pero cuando falla mete el remaster, el vivo o un cover de karaoke, y
 * ese error es **silencioso**: se descubre semanas después, escuchando. Mostrar
 * las dudosas cuesta unos segundos y convierte un problema que no se ve en una
 * decisión de dos toques.
 *
 * Las dudosas vienen con la mejor opción ya elegida, no vacías: quien no quiera
 * revisar nada aprieta «Traer» y obtiene lo mismo que le daría cualquier otro
 * importador. La diferencia es que acá sabe cuáles mirar.
 */
export default function Importar() {
  const router = useRouter()
  const { width, height } = useWindowDimensions()
  const suelto = width < SHELL_PX
  const modal = useHojaModal()
  const navigation = useNavigation()

  const [fase, setFase] = useState<Fase>('entrada')
  useEffect(() => {
    if (Platform.OS === 'ios') navigation.setOptions({ sheetAllowedDetents: fase === 'entrada' ? [0.6, 1] : [1] })
  }, [fase, navigation])
  const [filtro, setFiltro] = useState<'todas' | 'revisar'>('todas')
  const [salida, setSalida] = useState<NavigationAction | null>(null)
  const [destino, setDestino] = useState<string | null>(null)
  const operacion = useRef<'lectura' | 'guardando' | null>(null)
  const [enlace, setEnlace] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [lista, setLista] = useState<ListaSpotify | null>(null)
  const [nombre, setNombre] = useState('')
  const [avance, setAvance] = useState<Avance>({ hechas: 0, total: 0 })
  const [resultados, setResultados] = useState<Emparejado[]>([])
  /**
   * Qué se decidió para cada tema, por posición: el `videoId` que va a entrar,
   * o `null` para no traerlo.
   *
   * Se guarda aparte de `resultados` y no adentro para que elegir una
   * alternativa no obligue a reconstruir la lista entera de emparejados en cada
   * toque.
   */
  const [decisiones, setDecisiones] = useState<Record<number, string | null>>({})

  /* Cortar a la mitad tiene que frenar de verdad los pedidos que quedaron en
     vuelo, o la pantalla siguiente sigue recibiendo lotes de una importación
     que ya nadie quiere. */
  const corte = useRef<AbortController | null>(null)
  useEffect(() => () => corte.current?.abort(), [])

  const previo = usePrevio()
  usePreventRemove(!destino && (fase !== 'entrada' || !!enlace.trim()), ({ data }) => {
    if (operacion.current !== 'guardando') setSalida(data.action)
  })
  useEffect(() => {
    if (!destino) return
    abrirLista(destino)
    volver(router, '/')
  }, [destino, router])

  function volverAEntrada() {
    if (operacion.current === 'guardando') return
    corte.current?.abort()
    operacion.current = null
    previo.detener()
    setFase('entrada')
  }

  const traer = useCallback(async () => {
    if (operacion.current) return
    operacion.current = 'lectura'
    setError(null)
    setLista(null)
    setFiltro('todas')
    const control = new AbortController()
    corte.current?.abort()
    corte.current = control

    try {
      setFase('leyendo')
      setAvance({ hechas: 0, total: 0 })
      const leida = await leerListaSpotify(enlace, control.signal)
      if (control.signal.aborted) return
      const pistas = leida.pistas
      setLista(leida)
      setNombre(leida.nombre)

      setFase('emparejando')
      setAvance({ hechas: 0, total: pistas.length })

      const emparejados = await emparejarLista(pistas, {
        signal: control.signal,
        alAvanzar: setAvance,
      })
      if (control.signal.aborted) return

      setResultados(emparejados)
      setDecisiones(
        Object.fromEntries(emparejados.map((r, i) => [i, r.elegido?.videoId ?? null])),
      )
      setFase('revision')
    } catch (e) {
      if (control.signal.aborted) return
      setError(mensajeError(e))
      setFase('entrada')
    } finally {
      if (corte.current === control) operacion.current = null
    }
  }, [enlace])

  const confirmar = useCallback(async () => {
    if (operacion.current) return
    const elegidas = resultados.flatMap((resultado, indice) => {
      const videoId = decisiones[indice]
      if (!videoId) return []
      const track = candidatoPorId(resultado, videoId)
      return track ? [{ pista: resultado.pista, track }] : []
    })
    if (!elegidas.length) {
      setError('No quedó ninguna canción para traer.')
      return
    }

    if (!nombre.trim()) { setError('Poné un nombre para la lista.'); return }
    operacion.current = 'guardando'
    setError(null)
    setFase('guardando')
    setAvance({ hechas: 0, total: elegidas.length })

    try {
      const resumen = await guardarLista(nombre.trim(), elegidas, {
        alAvanzar: setAvance,
        salteadas: resultados.length - elegidas.length,
      })

      /*
       * El resto no se espera: la lista ya existe y ya se puede abrir. Adelantar
       * las primeras canciones y copiar las carátulas mejora lo que viene
       * después, y ninguna de las dos cosas justifica dejar a alguien mirando un
       * spinner.
       */
      void terminarEnSegundoPlano(
        resumen.playlistId,
        elegidas.map((e) => e.track),
      )

      avisar(
        resumen.repetidas > 0
          ? `${resumen.agregadas} canciones · ${resumen.repetidas} ya estaban`
          : `${resumen.agregadas} canciones en «${nombre}»`,
      )

      /*
       * Se termina **viendo la lista**, en la biblioteca.
       *
       * Y no en `/lista/<id>`, que es otra cosa: esa es la pantalla de una lista
       * que alguien compartió por un enlace, y presenta la tuya como ajena —«una
       * lista de vos»— con la insignia de pública puesta, que para una lista
       * recién importada es directamente falso.
       */
      setDestino(resumen.playlistId)
    } catch (e) {
      operacion.current = null
      setError(mensajeError(e))
      setFase('revision')
    }
  }, [decisiones, nombre, resultados])

  const aRevisar = resultados.filter((r) => r.confianza !== 'segura').length
  const aTraer = resultados.filter((r, i) => candidatoPorId(r, decisiones[i] ?? null)).length

  const filas = resultados.map((resultado, indice) => ({ resultado, indice }))
    .filter(({ resultado }) => filtro === 'todas' || resultado.confianza !== 'segura')

  return (
    <Hoja vista={fase} medida={modal ? 'contenido' : 'llena'} anchoMaximo={CAP} titulo="Traer de Spotify">
      <SafeAreaView className="min-h-0 bg-background" edges={Platform.OS === 'web' ? [] : ['bottom']}
        style={modal ? { height: Math.min(fase === 'revision' ? 720 : 320, height - 96) } : { flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="min-h-0 flex-1">
          <CabeceraSocial titulo="Traer de Spotify" detalle={fase === 'revision' ? 'Revisar canciones' : undefined}
            ocupado={fase === 'guardando'} onCerrar={() => volver(router, '/')} />
          {fase === 'entrada' ? (
            <Entrada enlace={enlace} onEnlace={setEnlace} error={error} onTraer={() => void traer()} />
          ) : fase === 'revision' ? (
            <View className="min-h-0 flex-1">
              <View className="gap-2 px-5 pb-2">
                <Resumen lista={lista} nombre={nombre} onNombre={setNombre}
                  total={resultados.length} aRevisar={aRevisar} error={error} />
                <View className="flex-row items-center justify-between gap-3">
                  <Text accessibilityLiveRegion="polite" className="min-w-0 flex-1 text-muted-foreground text-footnote">
                    {filtro === 'todas' ? `${resultados.length} canciones` : `${filas.length} para revisar`} · {aTraer} seleccionadas
                  </Text>
                  <Menu label="Opciones de importación" items={[
                    { label: 'Mostrar', items: [
                      { label: 'Todas las canciones', selected: filtro === 'todas', onPress: () => setFiltro('todas') },
                      { label: 'Para revisar', selected: filtro === 'revisar', onPress: () => setFiltro('revisar') },
                    ] },
                    { label: 'Seleccionar encontradas', onPress: () => setDecisiones(Object.fromEntries(resultados.map((r, i) => [i, r.elegido?.videoId ?? null]))) },
                    { label: 'No seleccionar ninguna', onPress: () => setDecisiones({}) },
                    { label: 'Cambiar enlace', separadorAntes: true, onPress: () => volverAEntrada() },
                  ]} />
                </View>
              </View>
              <FlatList className="min-h-0 flex-1" data={filas} extraData={decisiones}
                keyExtractor={({ indice }) => String(indice)} keyboardShouldPersistTaps="handled"
                renderScrollComponent={(props) => <ScrollArea {...props} />}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}
                ListEmptyComponent={<Text className="text-muted-foreground py-5 text-subheadline">No hay coincidencias pendientes de revisar.</Text>}
                renderItem={({ item }) => <FilaResultado resultado={item.resultado}
                  elegido={decisiones[item.indice] ?? null} previo={previo}
                  onElegir={(videoId) => setDecisiones(d => ({ ...d, [item.indice]: videoId }))} />} />
              <View className="flex-row items-center justify-end gap-3 px-5 pt-3 pb-5">
                <AccionSocial label={aTraer === 1 ? 'Traer 1 canción' : `Traer ${aTraer} canciones`}
                  disabled={aTraer === 0 || !nombre.trim()} expandida={suelto} compacta
                  style={suelto ? { flex: 1 } : undefined} onPress={() => { previo.detener(); void confirmar() }} />
              </View>
            </View>
          ) : (
            <Trabajando fase={fase} avance={avance} onCancelar={() => volverAEntrada()} />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
      <Confirmar visible={!!salida} titulo="¿Cancelar la importación?"
        mensaje="El enlace y las elecciones de esta importación no se guardaron."
        rotulo="Descartar" onCancelar={() => setSalida(null)} onConfirmar={() => {
          const action = salida
          setSalida(null)
          corte.current?.abort()
          previo.detener()
          if (action) navigation.dispatch(action)
        }} />
    </Hoja>
  )
}

/** Etiquetas legibles y controles de 44 px, sin el campo antiguo de versalitas. */
function CampoImportar({ label, ...input }: TextInputProps & { label: string }) {
  const escritorio = useWindowDimensions().width >= SHELL_PX
  return <View className="gap-2">
    <Text style={{ fontSize: escritorio ? 13 : 15 }} className="text-foreground font-medium">{label}</Text>
    <EntradaTexto {...input} accessibilityLabel={label} placeholderTextColor={PLACEHOLDER_COLOR}
      className="bg-muted px-3 text-foreground"
      style={[{ minHeight: escritorio ? 40 : 44, borderRadius: escritorio ? 10 : 16, fontSize: escritorio ? 15 : 16, paddingVertical: escritorio ? 8 : 10 }, input.style]} />
  </View>
}

// ── Entrada ────────────────────────────────────────────────────────────────

function Entrada({ enlace, onEnlace, error, onTraer }: {
  enlace: string; onEnlace: (v: string) => void
  error: string | null; onTraer: () => void
}) {
  const escritorio = useWindowDimensions().width >= SHELL_PX
  const listo = enlace.trim().length > 0
  return <View className="min-h-0 flex-1">
    <ScrollArea className="flex-1" showsVerticalScrollIndicator={!escritorio} contentContainerStyle={{ flexGrow: 1, justifyContent: escritorio ? 'center' : 'flex-start', alignItems: 'center', paddingHorizontal: 20, paddingVertical: escritorio ? 28 : 12 }} keyboardShouldPersistTaps="handled">
      <View style={{ width: '100%', maxWidth: 520, gap: escritorio ? 14 : 16 }}>
        <View className="flex-row items-center gap-3 pb-2">
          <IconSpotify size={44} />
          <View className="min-w-0 flex-1 gap-1">
            <Text accessibilityRole="header" style={{ fontSize: escritorio ? 19 : 21 }} className="text-foreground font-semibold">Tus playlists, acá</Text>
            <Text className="text-muted-foreground text-footnote">Pegá el enlace de una playlist pública.</Text>
          </View>
        </View>
        <CampoImportar label="Enlace de la lista" value={enlace} onChangeText={onEnlace} autoCapitalize="none" autoCorrect={false}
          inputMode="url" placeholder="Pegá el enlace de Spotify" returnKeyType="go" onSubmitEditing={() => { if (listo) onTraer() }} />
        <Text className="text-muted-foreground text-caption1">Spotify → Compartir → Copiar enlace</Text>
        <FormError message={error} />
        <View className="items-end pt-1">
          <AccionSocial label="Revisar canciones" onPress={onTraer} disabled={!listo} compacta expandida={!escritorio} />
        </View>
      </View>
    </ScrollArea>
  </View>
}

// ── Mientras trabaja ───────────────────────────────────────────────────────

/**
 * El avance, que es lo único que hay para mirar.
 *
 * Dice el número además de la barra porque la barra sola no distingue una lista
 * de 12 de una de 100, y la diferencia entre esperar cinco segundos o un minuto
 * es justo lo que a alguien le hace falta saber para decidir si se queda.
 */
function Trabajando({
  fase,
  avance,
  onCancelar,
}: {
  fase: 'leyendo' | 'emparejando' | 'guardando'
  avance: Avance
  onCancelar: () => void
}) {
  const porcentaje = avance.total > 0 ? Math.min(100, Math.round((avance.hechas / avance.total) * 100)) : 0

  const rotulo =
    fase === 'guardando'
      ? 'Guardando la lista'
      : fase === 'leyendo'
        ? avance.total === 0
          ? 'Leyendo la lista en Spotify'
          : `Leyendo ${Math.min(avance.hechas + 1, avance.total)} de ${avance.total} en Spotify`
        : `Buscando ${Math.min(avance.hechas + 1, avance.total)} de ${avance.total}`

  const detalle =
    fase === 'guardando'
      ? 'Agregando las canciones que elegiste a tu biblioteca.'
      : fase === 'leyendo'
        ? 'Preparando las canciones para que puedas revisarlas.'
        : 'Buscando las mejores coincidencias para tu lista.'

  return (
    <View accessibilityLiveRegion="polite" className="flex-1 items-center justify-center gap-4 px-5">
      <ActivityIndicator color={ICON_COLOR.muted} />
      <Text className="text-foreground text-center text-subheadline">{rotulo}</Text>

      {avance.total > 0 ? (
        <View accessibilityRole="progressbar" accessibilityLabel={rotulo} accessibilityValue={{ min: 0, max: avance.total, now: avance.hechas }} className="h-1 w-full max-w-[280px] overflow-hidden rounded-full bg-muted">
          <View className="h-1 rounded-full bg-foreground" style={{ width: `${porcentaje}%` }} />
        </View>
      ) : null}

      <Text className="text-muted-foreground text-center text-caption1">{detalle}</Text>

      {fase !== 'guardando' ? (
        <Pressable
          {...estadoControlWeb('surface')}
          accessibilityRole="button"
          onPress={onCancelar}
          className="h-11 items-center justify-center rounded-full px-5 active:bg-muted"
        >
          <Text className="text-muted-foreground text-footnote">Cancelar</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

// ── Revisión ───────────────────────────────────────────────────────────────

function Resumen({ lista, nombre, onNombre, total, aRevisar, error }: {
  lista: ListaSpotify | null; nombre: string; onNombre: (v: string) => void
  total: number; aRevisar: number; error: string | null
}) {
  return <View className="gap-2">
    <CampoImportar label="Nombre de la lista" value={nombre} onChangeText={onNombre} maxLength={60} />
    <Text className="text-muted-foreground text-footnote">{aRevisar ? `${aRevisar} de ${total} coincidencias para revisar` : 'Todas las canciones tienen coincidencia.'}</Text>
    {lista?.truncada ? <View className="gap-1">
      <Text accessibilityRole="alert" className="text-muted-foreground text-footnote">Spotify devolvió hasta {TOPE_SPOTIFY} canciones. La lista puede estar incompleta.</Text>
    </View> : null}
    <FormError message={error} />
  </View>
}

/**
 * Un tema de Spotify y lo que se encontró para él.
 *
 * Las que están bien se dibujan en una línea y se salen del camino: si hay
 * ochenta, ochenta filas grandes no dejan ver las ocho que importan. Las
 * dudosas se abren con sus alternativas, cada una con el motivo del puntaje y
 * su duración, que es lo que de verdad las distingue.
 */
function FilaResultado({
  resultado,
  elegido,
  onElegir,
  previo,
}: {
  resultado: Emparejado
  elegido: string | null
  onElegir: (videoId: string | null) => void
  previo: Previo
}) {
  const dudosa = resultado.confianza !== 'segura'
  const [abierta, setAbierta] = useState(false)

  if (!abierta) {
    const track = candidatoPorId(resultado, elegido)
    return (
      <Pressable
          {...estadoControlWeb('surface')}
        accessibilityRole="button"
        accessibilityLabel={`Revisar ${resultado.pista.titulo}`}
        {...superficieInteractivaWeb('row')}
        accessibilityState={{ expanded: false }}
        onPress={() => setAbierta(true)}
        className="min-h-14 flex-row items-center gap-3 rounded-xl py-2 active:bg-card"
      >
        <Tapa url={track?.artworkUrl} />
        <View className="min-w-0 flex-1">
          <Text className="text-foreground text-subheadline" numberOfLines={1}>
            {track?.title ?? resultado.pista.titulo}
          </Text>
          <Text className="text-muted-foreground text-caption1" numberOfLines={1}>
            {track?.artist ?? resultado.pista.artista}
          </Text>
          {dudosa ? <Text className="text-muted-foreground text-caption1">{resultado.confianza === 'sin_resultado' ? 'Sin coincidencia' : 'Revisar coincidencia'}</Text> : null}
        </View>
        {elegido ? (
          <IconCheck size={15} color={ICON_COLOR.muted} />
        ) : (
          <Text className="text-muted-foreground text-caption1">No entra</Text>
        )}
      </Pressable>
    )
  }

  return (
    <View className="my-1.5 gap-3 rounded-2xl bg-card p-3">
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-foreground text-subheadline font-semibold" numberOfLines={1}>
            {resultado.pista.titulo}
          </Text>
          <Text className="text-muted-foreground text-caption1" numberOfLines={1}>
            {resultado.pista.artista}
            {resultado.pista.durationMs ? ` · ${reloj(resultado.pista.durationMs)}` : ''}
          </Text>
        </View>
        {/*
         * El preview de 30s que Spotify sigue sirviendo en la página de embed.
         * Está acá porque comparar de oído resuelve en dos segundos lo que
         * leyendo dos títulos parecidos no se resuelve nunca.
         */}
        {resultado.pista.previewUrl ? (
          <Pressable
          {...estadoControlWeb('surface')}
            accessibilityRole="button"
            accessibilityLabel={`Escuchar el original de ${resultado.pista.titulo}`}
            onPress={() => previo.alternar(resultado.pista.previewUrl!)}
            className="h-11 w-11 items-center justify-center rounded-full bg-muted active:opacity-70"
          >
            {previo.sonando === resultado.pista.previewUrl ? (
              <IconPause size={13} color={ICON_COLOR.foreground} />
            ) : (
              <IconPlay size={13} color={ICON_COLOR.foreground} />
            )}
          </Pressable>
        ) : null}
      </View>

      {resultado.candidatos.length === 0 ? (
        <Text className="text-muted-foreground text-caption1">
          No encontré nada parecido. Se puede buscar a mano después, desde la lista.
        </Text>
      ) : (
        <SharedLayoutBg targets="surfaces">
        <View className="gap-1">
          {resultado.candidatos.map((candidato) => {
            const activo = candidato.track.videoId === elegido
            return (
              <Pressable
          {...estadoControlWeb('surface')}
                key={candidato.track.videoId}
                accessibilityRole="radio"
                accessibilityState={{ selected: activo }}
                onPress={() => onElegir(candidato.track.videoId)}
                className={`flex-row items-center gap-3 rounded-lg p-2 ${
                  activo ? 'bg-muted' : 'active:bg-muted'
                }`}
              >
                <Tapa url={candidato.track.artworkUrl} />
                <View className="min-w-0 flex-1">
                  <Text className="text-foreground text-footnote" numberOfLines={1}>
                    {candidato.track.title}
                  </Text>
                  <Text className="text-muted-foreground text-caption1" numberOfLines={1}>
                    {candidato.track.artist}
                    {candidato.track.durationMs ? ` · ${reloj(candidato.track.durationMs)}` : ''}
                    {candidato.motivo ? ` · ${candidato.motivo}` : ''}
                  </Text>
                </View>
                {activo ? <IconCheck size={15} color={ICON_COLOR.foreground} /> : null}
              </Pressable>
            )
          })}
        </View>
        </SharedLayoutBg>
      )}

      <Pressable
          {...estadoControlWeb('surface')}
        accessibilityRole="button"
        accessibilityState={{ selected: elegido === null }}
        onPress={() => onElegir(null)}
        className={`min-h-11 flex-row items-center justify-center gap-2 rounded-full ${
          elegido === null ? 'bg-muted' : 'active:bg-muted'
        }`}
      >
        <IconClose size={13} color={ICON_COLOR.muted} />
        <Text className="text-muted-foreground text-footnote">No traer esta</Text>
      </Pressable>
      <AccionSocial label="Cerrar opciones" secundaria expandida={false} onPress={() => setAbierta(false)} />
    </View>
  )
}

function Tapa({ url }: { url: string | undefined }) {
  const arte = artworkSource(null, url, 96)
  return (
    <View className="h-10 w-10 items-center justify-center overflow-hidden rounded bg-muted">
      {arte ? (
        <Image source={{ uri: arte }} className="h-10 w-10" />
      ) : (
        <IconMusic size={14} color={ICON_COLOR.muted} />
      )}
    </View>
  )
}

// ── El preview de Spotify ──────────────────────────────────────────────────

type Previo = { sonando: string | null; alternar: (url: string) => void; detener: () => void }

/**
 * Reproductor chiquito para los treinta segundos de Spotify.
 *
 * Es un tercer reproductor —están el de la cola y el de los fragmentos— y por
 * eso repite dos cuidados que ya están documentados en `state/player`:
 * `keepAudioSessionActive`, para que al terminar no le tire la sesión de audio
 * a la cola, y `pauseForSnippet`, porque dos cosas sonando encimadas no le
 * sirven a nadie. Vive solo mientras dura esta pantalla.
 */
function usePrevio(): Previo {
  const [url, setUrl] = useState<string | null>(null)
  const player = useAudioPlayer(url ? { uri: url } : null, { keepAudioSessionActive: true })

  useEffect(() => {
    if (!url) return
    pauseForSnippet()
    player.play()
  }, [url, player])

  /*
   * NO se llama `player.pause()` al desmontar, y esa ausencia es a propósito.
   *
   * Antes había un `useEffect(() => () => player.pause(), [player])`, y era el
   * que cerraba la app en iOS al terminar de traer una lista de Spotify: al
   * navegar afuera, ese cleanup corría `pause()` sobre el mismo `AVAudioPlayer`
   * que expo-audio estaba liberando por el desmonte de `useAudioPlayer` —una
   * carrera que en iOS es un `EXC_BAD_ACCESS`, no una excepción que se pueda
   * atrapar—. expo-audio ya detiene el audio al cambiar la fuente y al liberar
   * el player, así que el `pause()` a mano no cuidaba nada y sí crasheaba.
   */

  return {
    sonando: url,
    detener: () => setUrl(null),
    alternar: (siguiente: string) => setUrl((actual) => (actual === siguiente ? null : siguiente)),
  }
}

// ── Auxiliares ─────────────────────────────────────────────────────────────

function candidatoPorId(resultado: Emparejado, videoId: string | null): TrackResult | null {
  if (!videoId) return null
  return resultado.candidatos.find((c) => c.track.videoId === videoId)?.track ?? null
}

function reloj(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
