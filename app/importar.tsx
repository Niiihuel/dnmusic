import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useAudioPlayer } from 'expo-audio'
import { Panel } from '../src/ui/Panel'
import { Field, PLACEHOLDER_COLOR } from '../src/ui/Field'
import { FormError, GhostButton, PrimaryButton } from '../src/ui/Button'
import { artworkSource } from '../src/lib/artwork'
import { abrirLista, pauseForSnippet } from '../src/state/playback'
import { usePiso } from '../src/state/shell'
import { avisar } from '../src/state/aviso'
import { volver } from '../src/lib/volver'
import { mensajeError } from '../src/lib/mensajeError'
import {
  ICON_COLOR,
  IconBack,
  IconCheck,
  IconClose,
  IconDownload,
  IconMusic,
  IconPause,
  IconPlay,
} from '../src/ui/icons'
import {
  TOPE_SPOTIFY,
  emparejarLista,
  guardarLista,
  interpretarPegado,
  leerCancionesSpotify,
  leerListaSpotify,
  terminarEnSegundoPlano,
  type Avance,
  type Emparejado,
  type ListaSpotify,
  type PistaSpotify,
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
const CAP = 672

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
  const suelto = useWindowDimensions().width < SHELL_PX
  const piso = usePiso(24)

  const [fase, setFase] = useState<Fase>('entrada')
  const [enlace, setEnlace] = useState('')
  const [pegado, setPegado] = useState('')
  const [aMano, setAMano] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [lista, setLista] = useState<ListaSpotify | null>(null)
  /**
   * Cuántas canciones pegadas no se pudieron leer.
   *
   * Spotify puede no devolver alguna —un tema que ya no está en el catálogo de
   * la región, un link viejo— y filtrarla en silencio sería perder canciones sin
   * avisar, que es justo lo que esta pantalla existe para no hacer.
   */
  const [sinLeer, setSinLeer] = useState(0)
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

  const traer = useCallback(async () => {
    setError(null)
    const control = new AbortController()
    corte.current?.abort()
    corte.current = control

    try {
      let pistas: PistaSpotify[]
      let leida: ListaSpotify | null = null

      if (aMano) {
        const pegue = interpretarPegado(pegado)
        if (pegue.tipo === 'enlaces') {
          /*
           * Links de canción: es lo que deja el «copiar» de Spotify, y es el
           * camino de las listas de más de cien y de las privadas. Cada una se
           * lee de su propia página, así que acá sí hay avance que mostrar.
           */
          setFase('leyendo')
          setAvance({ hechas: 0, total: pegue.ids.length })
          pistas = await leerCancionesSpotify(pegue.ids, {
            signal: control.signal,
            alAvanzar: setAvance,
          })
          if (control.signal.aborted) return
          setSinLeer(pegue.ids.length - pistas.length)
          if (!pistas.length) {
            setError('Spotify no devolvió ninguna de esas canciones. Probá de nuevo en un rato.')
            setFase('entrada')
            return
          }
        } else {
          pistas = pegue.pistas
          if (!pistas.length) {
            setError('No encontré ninguna canción en ese texto. Poné una por línea, como «Artista - Título», o pegá los enlaces copiados de Spotify.')
            return
          }
        }
        setNombre('Lista importada')
      } else {
        setFase('leyendo')
        setAvance({ hechas: 0, total: 0 })
        leida = await leerListaSpotify(enlace, control.signal)
        pistas = leida.pistas
        setLista(leida)
        setNombre(leida.nombre)
      }

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
    }
  }, [aMano, enlace, pegado])

  const confirmar = useCallback(async () => {
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

    setError(null)
    setFase('guardando')
    setAvance({ hechas: 0, total: elegidas.length })

    try {
      const resumen = await guardarLista(nombre, elegidas, {
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
      abrirLista(resumen.playlistId)
      volver(router, '/')
    } catch (e) {
      setError(mensajeError(e))
      setFase('revision')
    }
  }, [decisiones, nombre, resultados, router])

  const aRevisar = resultados.filter((r) => r.confianza !== 'segura').length
  const aTraer = Object.values(decisiones).filter(Boolean).length

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={suelto ? ['top'] : ['top', 'bottom']}
    >
      <View className={`min-h-0 flex-1 ${suelto ? '' : 'gap-2 p-2'}`}>
        <View className="flex-row items-center gap-3 px-3 py-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={() => {
              corte.current?.abort()
              volver(router, '/')
            }}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          >
            <IconBack size={19} color={ICON_COLOR.foreground} />
          </Pressable>
          <View className="min-w-0 flex-1">
            <Text className="text-foreground text-[15px] font-semibold">Traer de Spotify</Text>
          </View>
        </View>

        <Panel className="flex-1">
          {fase === 'entrada' ? (
            <Entrada
              enlace={enlace}
              onEnlace={setEnlace}
              pegado={pegado}
              onPegado={setPegado}
              aMano={aMano}
              onAMano={setAMano}
              error={error}
              onTraer={() => void traer()}
              suelto={suelto}
            />
          ) : fase === 'revision' ? (
            <View className="min-h-0 flex-1">
            <FlatList
              className="min-h-0 flex-1"
              data={resultados}
              keyExtractor={(_, i) => String(i)}
              contentContainerClassName={suelto ? 'px-3 pt-3' : 'p-5'}
              contentContainerStyle={{ paddingBottom: 16 }}
              ListHeaderComponent={
                <Centrado suelto={suelto}>
                  <Resumen
                    lista={lista}
                    sinLeer={sinLeer}
                    nombre={nombre}
                    onNombre={setNombre}
                    total={resultados.length}
                    aRevisar={aRevisar}
                    error={error}
                  />
                </Centrado>
              }
              renderItem={({ item, index }) => (
                <Centrado suelto={suelto}>
                  <FilaResultado
                    resultado={item}
                    elegido={decisiones[index] ?? null}
                    onElegir={(videoId) => setDecisiones((d) => ({ ...d, [index]: videoId }))}
                    previo={previo}
                  />
                </Centrado>
              )}
              ListFooterComponent={<View style={{ height: 8 }} />}
            />
            {/*
             * La barra de traer va **fija abajo**, fuera del scroll: con una
             * playlist larga, el botón vivía al final de la lista y había que
             * recorrer todas las canciones para llegar. Quien no quiere revisar
             * nada aprieta acá de una — las dudosas ya vienen con su mejor match
             * elegido, así que «Traer» es también «saltear la revisión».
             */}
            <View
              className="border-t border-muted px-4 pt-3"
              style={{ paddingBottom: suelto ? 12 : piso }}
            >
              <Centrado suelto={suelto}>
                <View className="flex-row items-center gap-3">
                  <View className="flex-1">
                    <PrimaryButton
                      label={aTraer === 1 ? 'Traer 1 canción' : `Traer ${aTraer} canciones`}
                      onPress={() => void confirmar()}
                      disabled={aTraer === 0}
                    />
                  </View>
                  <GhostButton label="Cancelar" onPress={() => setFase('entrada')} />
                </View>
              </Centrado>
            </View>
            </View>
          ) : (
            <Trabajando
              fase={fase}
              avance={avance}
              onCancelar={() => {
                corte.current?.abort()
                setFase('entrada')
              }}
            />
          )}
        </Panel>
      </View>
    </SafeAreaView>
  )
}

/** El contenido con el mismo tope de ancho que el resto de las pantallas. */
function Centrado({ children, suelto }: { children: React.ReactNode; suelto: boolean }) {
  return (
    <View className="w-full items-center">
      <View className="w-full" style={{ maxWidth: suelto ? undefined : CAP }}>
        {children}
      </View>
    </View>
  )
}

// ── Entrada ────────────────────────────────────────────────────────────────

/**
 * Dónde se pega la lista.
 *
 * El enlace es el camino principal y el texto a mano el respaldo, pero el
 * respaldo no está escondido: cubre las listas privadas, las de más de cien y
 * el día que Spotify cambie su página. Está a un toque, con su propia
 * explicación de para qué sirve.
 */
function Entrada({
  enlace,
  onEnlace,
  pegado,
  onPegado,
  aMano,
  onAMano,
  error,
  onTraer,
  suelto,
}: {
  enlace: string
  onEnlace: (v: string) => void
  pegado: string
  onPegado: (v: string) => void
  aMano: boolean
  onAMano: (v: boolean) => void
  error: string | null
  onTraer: () => void
  suelto: boolean
}) {
  const listo = aMano ? pegado.trim().length > 0 : enlace.trim().length > 0

  /*
   * Centrado en el alto, y en una columna angosta.
   *
   * En el teléfono la pantalla es justa y da igual, pero en escritorio el panel
   * es enorme: con el contenido pegado arriba y a lo ancho del tope de 672, un
   * campo y un botón quedaban flotando en un vacío de mil píxeles. Es la misma
   * forma que el login —`flex-1 items-center justify-center` sobre una columna
   * de 380— y por la misma razón: un formulario corto se lee como una tarjeta
   * centrada, no como el principio de una página que sigue.
   */
  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName={`min-h-full items-center justify-center ${suelto ? 'px-5 py-6' : 'px-6 py-10'}`}
      keyboardShouldPersistTaps="handled"
    >
      {/*
       * Una luz arriba, la misma del login.
       *
       * Del gris de `muted` al fondo, sin llegar nunca al blanco: le da
       * profundidad a la mitad superior sin dibujar un borde, que es como Apple
       * separa las capas —por luz, nunca por línea (docs/DESIGN.md)—. Es lo que
       * hace que el formulario se lea como una tarjeta con aire propio en el
       * panel enorme del escritorio, y no como un campo suelto en el vacío.
       */}
      <LinearGradient
        pointerEvents="none"
        colors={['#1F1F1F', '#121212']}
        locations={[0, 1]}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 420 }}
      />
      <View className="w-full gap-10" style={{ maxWidth: aMano ? 480 : 400 }}>
        {/*
         * El encabezado del panel.
         *
         * La barra de arriba ya dice «Traer de Spotify», así que acá no se
         * repite el nombre: se dice **qué va a pasar**, que es la duda real de
         * quien llega —si esto copia la lista o la recrea—.
         */}
        <View className="items-center gap-5">
          {/* El ícono con más presencia: un redondel más grande y un aro sutil
              alrededor, al modo de los glyphs de ajustes de iOS. */}
          <View className="h-20 w-20 items-center justify-center rounded-full border border-border bg-card">
            <IconDownload size={28} color={ICON_COLOR.foreground} />
          </View>
          <View className="items-center gap-2.5">
            <Text className="text-center text-foreground text-[24px] font-bold tracking-[-0.3px]">
              Tu lista, con tu música
            </Text>
            <Text className="max-w-[300px] text-center text-muted-foreground text-[14px] leading-[21px]">
              Spotify no da el audio: la lista se rearma acá, buscando cada canción por su
              nombre.
            </Text>
          </View>
        </View>

        <View className="gap-4">
          {aMano ? (
            <View className="gap-2">
              <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.8px]">
                Las canciones, una por línea
              </Text>
              <TextInput
                value={pegado}
                onChangeText={onPegado}
                multiline
                textAlignVertical="top"
                placeholder={
                  'https://open.spotify.com/track/…\nhttps://open.spotify.com/track/…\n\no bien:\nTame Impala - The Less I Know The Better'
                }
                placeholderTextColor={PLACEHOLDER_COLOR}
                accessibilityLabel="Las canciones, una por línea"
                className="h-44 rounded-lg bg-muted p-4 text-foreground text-[15px]"
              />
              {/*
               * La receta del «copiar», que es la parte que nadie adivina.
               *
               * Es lo que destraba los dos límites del enlace de lista —el tope
               * de cien y que tenga que ser pública— y no está a la vista en
               * ningún lado de Spotify: hay que saber que seleccionar todo
               * dentro de una lista y copiar deja un link por canción.
               */}
              <Text className="text-muted-foreground text-[12px] leading-4">
                En Spotify, abrí la lista, tocá una canción, seleccioná todas (Ctrl+A o
                ⌘A) y copiá (Ctrl+C o ⌘C). Así entran las listas privadas y las de más de{' '}
                {TOPE_SPOTIFY} canciones. También sirve «Artista - Título» por línea, o el
                CSV de un exportador.
              </Text>
            </View>
          ) : (
            <Field
              label="Enlace de la lista"
              value={enlace}
              onChangeText={onEnlace}
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="url"
              placeholder="open.spotify.com/playlist/…"
              hint="En Spotify: Compartir › Copiar enlace. La lista tiene que estar pública."
              icon={<IconMusic size={17} color={ICON_COLOR.muted} />}
            />
          )}

          <FormError message={error} />

          <PrimaryButton label="Traer" onPress={onTraer} disabled={!listo} />

          <Pressable
            accessibilityRole="button"
            onPress={() => onAMano(!aMano)}
            className="h-11 items-center justify-center rounded-full active:bg-muted"
          >
            <Text className="text-muted-foreground text-[13px]">
              {aMano ? 'Usar un enlace de Spotify' : 'O pegar las canciones a mano'}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  )
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
  const porcentaje = avance.total > 0 ? Math.round((avance.hechas / avance.total) * 100) : 0

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
      ? 'Las canciones se descargan cuando las escuches, no ahora.'
      : fase === 'leyendo'
        ? 'De Spotify salen los nombres. El audio no viene de ahí.'
        : 'Cada canción se busca en YouTube Music por su nombre.'

  return (
    <View className="flex-1 items-center justify-center gap-5 px-8">
      <ActivityIndicator color={ICON_COLOR.muted} />
      <Text className="text-foreground text-center text-[15px]">{rotulo}</Text>

      {avance.total > 0 ? (
        <View className="h-1 w-full max-w-[280px] overflow-hidden rounded-full bg-muted">
          <View className="h-1 rounded-full bg-foreground" style={{ width: `${porcentaje}%` }} />
        </View>
      ) : null}

      <Text className="text-muted-foreground text-center text-[12px] leading-4">{detalle}</Text>

      {fase !== 'guardando' ? (
        <Pressable
          accessibilityRole="button"
          onPress={onCancelar}
          className="h-11 items-center justify-center rounded-full px-5 active:bg-muted"
        >
          <Text className="text-muted-foreground text-[13px]">Cancelar</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

// ── Revisión ───────────────────────────────────────────────────────────────

function Resumen({
  lista,
  sinLeer,
  nombre,
  onNombre,
  total,
  aRevisar,
  error,
}: {
  lista: ListaSpotify | null
  /** De lo pegado, cuántas no devolvió Spotify. */
  sinLeer: number
  nombre: string
  onNombre: (v: string) => void
  total: number
  aRevisar: number
  error: string | null
}) {
  return (
    <View className="gap-4 pb-4">
      <Field
        label="Nombre de la lista"
        value={nombre}
        onChangeText={onNombre}
        maxLength={60}
        hint={
          aRevisar === 0
            ? `${total} canciones, todas encontradas.`
            : `${total} canciones · ${aRevisar} para mirar, marcadas abajo.`
        }
      />

      {sinLeer > 0 ? (
        <View className="rounded-lg bg-muted px-4 py-3">
          <Text className="text-muted-foreground text-[13px] leading-5">
            {sinLeer === 1
              ? 'Una de las canciones pegadas no la devolvió Spotify y quedó afuera.'
              : `${sinLeer} de las canciones pegadas no las devolvió Spotify y quedaron afuera.`}
          </Text>
        </View>
      ) : null}

      {/*
       * El aviso del tope, con la salida al lado.
       *
       * Decir «hay 100 y puede haber más» sin decir qué hacer es dejar a alguien
       * con una lista incompleta y ninguna acción. La salida existe y es
       * concreta, así que va acá, en el momento exacto en que hace falta.
       */}
      {lista?.truncada ? (
        <View className="gap-2 rounded-lg bg-muted px-4 py-3">
          <Text className="text-foreground text-[13px] leading-5">
            Un enlace trae hasta {TOPE_SPOTIFY} canciones. Si la lista era más larga, esto
            es solo el principio.
          </Text>
          <Text className="text-muted-foreground text-[12px] leading-4">
            Para traerla entera: en Spotify abrí la lista, tocá una canción, seleccioná
            todas (Ctrl+A o ⌘A), copiá (Ctrl+C o ⌘C) y pegá eso en «pegar las canciones a
            mano». Así no hay tope.
          </Text>
        </View>
      ) : null}

      <FormError message={error} />
    </View>
  )
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

  if (!dudosa && !abierta) {
    const track = candidatoPorId(resultado, elegido)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Cambiar la elección para ${resultado.pista.titulo}`}
        onPress={() => setAbierta(true)}
        className="flex-row items-center gap-3 rounded-lg py-1.5 active:bg-card"
      >
        <Tapa url={track?.artworkUrl} />
        <View className="min-w-0 flex-1">
          <Text className="text-foreground text-[14px]" numberOfLines={1}>
            {track?.title ?? resultado.pista.titulo}
          </Text>
          <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
            {track?.artist ?? resultado.pista.artista}
          </Text>
        </View>
        {elegido ? (
          <IconCheck size={15} color={ICON_COLOR.muted} />
        ) : (
          <Text className="text-muted-foreground text-[12px]">No entra</Text>
        )}
      </Pressable>
    )
  }

  return (
    <View className="my-1.5 gap-3 rounded-lg bg-card p-3">
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-foreground text-[14px] font-semibold" numberOfLines={1}>
            {resultado.pista.titulo}
          </Text>
          <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
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
            accessibilityRole="button"
            accessibilityLabel={`Escuchar el original de ${resultado.pista.titulo}`}
            onPress={() => previo.alternar(resultado.pista.previewUrl!)}
            className="h-9 w-9 items-center justify-center rounded-full bg-muted active:opacity-70"
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
        <Text className="text-muted-foreground text-[12px] leading-4">
          No encontré nada parecido. Se puede buscar a mano después, desde la lista.
        </Text>
      ) : (
        <View className="gap-1">
          {resultado.candidatos.map((candidato) => {
            const activo = candidato.track.videoId === elegido
            return (
              <Pressable
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
                  <Text className="text-foreground text-[13px]" numberOfLines={1}>
                    {candidato.track.title}
                  </Text>
                  <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
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
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: elegido === null }}
        onPress={() => onElegir(null)}
        className={`h-10 flex-row items-center justify-center gap-2 rounded-full ${
          elegido === null ? 'bg-muted' : 'active:bg-muted'
        }`}
      >
        <IconClose size={13} color={ICON_COLOR.muted} />
        <Text className="text-muted-foreground text-[13px]">No traer esta</Text>
      </Pressable>
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

type Previo = { sonando: string | null; alternar: (url: string) => void }

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
