import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { volver } from '../../src/lib/volver'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { SongDisc } from '../../src/ui/SongDisc'
import { Lyrics } from '../../src/ui/Lyrics'
import { Onda, usePicos } from '../../src/ui/Onda'
import { Popover } from '../../src/ui/Popover'
import { isSentBy } from '../../src/models/message'
import { markOpened, markRead } from '../../src/services/messages'
import { getSession, useContact, useMessages, useUser } from '../../src/state/session'
import { useSnippetPlayer } from '../../src/state/player'
import { mensajeError } from '../../src/lib/mensajeError'
import { avisar } from '../../src/state/aviso'
import { artworkSource } from '../../src/lib/artwork'
import {
  ensureArtwork,
  translateLyrics,
  LYRIC_LANGS,
  type LyricLang,
  type LyricLine,
} from '../../src/services/music'
import { contactLabel } from '../../src/services/contacts'
import { formatMessageDate } from '../../src/ui/MessageCard'
import {
  ICON_COLOR,
  IconClose,
  IconDisc,
  IconLanguages,
  IconLyrics,
  IconMessage,
  IconPause,
  IconPlay,
} from '../../src/ui/icons'

/** Tamaño del disco según el ancho disponible. */
const DISC_WIDE = 300
const DISC_NARROW = 240
/** A partir de acá la pieza se sirve en grande. */
const WIDE_PX = 720
/**
 * Hasta acá crece la composición, por más ancha que sea la ventana.
 *
 * Sin tope, «centrar» en una ventana de 1990px dejaba la frase pegada al borde
 * izquierdo y el disco a setecientos píxeles de distancia: tres cosas sueltas
 * en una pantalla vacía en vez de una pieza. La frase y el disco tienen que
 * leerse juntos, que es de lo que se trata compartir un fragmento.
 */
const ANCHO_MAX = 1020

type StoryView = 'disc' | 'lyrics'

/** Para decir en qué idioma está la letra sin arrastrar toda la lista. */
const LANG_NAMES: Record<string, string> = {
  es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés',
  it: 'italiano', de: 'alemán', ja: 'japonés',
}

/**
 * El mensaje a pantalla completa, al modo de una historia.
 *
 * En el chat un mensaje es una fila más de una lista; acá es una pieza sola en
 * la que uno se detiene: el disco girando, la frase, y la letra si se quiere
 * seguir. Es el mismo contenido con otro peso.
 *
 * El fondo es la carátula desenfocada, y **con la letra a la vista va a color**.
 *
 * docs/DESIGN.md prohíbe los colores de marca, pero eso protege la interfaz:
 * botones, textos y controles siguen siendo grises acá. La carátula es
 * contenido, no cromo — es la tapa del disco que eligió la persona—, y a 72px
 * de desenfoque no es una imagen sino atmósfera.
 *
 * Con el disco en pantalla sí va desaturada: ahí la tapa ya está a todo color
 * en el centro, y repetir sus tonos atrás enturbia la composición en vez de
 * sumar. Con la letra la tapa no está, y el color es lo único que dice de qué
 * canción se trata.
 *
 * Encima va siempre un degradado que garantiza que el texto se lea, sea cual
 * sea la imagen.
 */
export default function MessageStory() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const messages = useMessages()
  const user = useUser()
  const contact = useContact()
  const router = useRouter()
  const player = useSnippetPlayer()
  /*
   * Arranca en el estilo que eligió quien lo mandó.
   *
   * Sigue pudiéndose cambiar acá: la elección del remitente es con qué se abre,
   * no una restricción sobre lo que el otro puede mirar.
   */
  const [view, setView] = useState<StoryView | null>(null)
  const [width, setWidth] = useState(0)
  /*
   * Carátula rellenada al vuelo.
   *
   * Los mensajes anteriores al caché solo guardaron la URL del CDN, que se
   * bloquea cada tanto y deja el disco sin imagen. Acá el disco es lo principal
   * de la pantalla, así que se pide la copia y se usa apenas está.
   */
  const [backfilled, setBackfilled] = useState<string | null>(null)
  /*
   * Traducir de este lado.
   *
   * El remitente puede haber mandado la letra ya traducida —eso es parte del
   * gesto— pero quien la recibe igual puede querer leerla en otro idioma. Cada
   * idioma se pide una sola vez y queda guardado, así que ir y volver es
   * instantáneo.
   */
  const [lang, setLang] = useState<LyricLang>('off')
  /**
   * La frase, que puede ser larga.
   *
   * Se puede ocultar, y mostrarla nunca mueve la letra ni el disco: en PC vive
   * en una columna al costado —ahí sobra ancho— y en el teléfono en una tarjeta
   * de tres líneas que se despliega con su propio desplazamiento. Antes iba en
   * la misma columna centrada, debajo de la letra: cuanto más escribías, más
   * empujaba y aplastaba todo lo demás.
   */
  const [verFrase, setVerFrase] = useState(true)
  const [fraseAbierta, setFraseAbierta] = useState(false)
  const [versions, setVersions] = useState<Partial<Record<LyricLang, LyricLine[]>>>({})

  const message = messages.find((m) => m.id === id)
  const song = message?.song ?? null
  const picos = usePicos(
    song?.videoId,
    song ? { desdeMs: song.startMs, durMs: song.durationMs } : undefined,
  )
  const mine = message && user ? isSentBy(message, user.id) : false

  /*
   * Arranca sola, como una historia.
   *
   * Se llega hasta acá tocando el mensaje, así que el navegador considera que
   * hubo gesto y deja sonar. Si igual lo bloquea, queda el botón de play.
   */
  useEffect(() => {
    if (!message || !song) return
    player.toggle(message.id, song).catch((e: unknown) => avisar(mensajeError(e), true))
    return () => player.stop()
    // Solo al abrir: volver a dispararlo cortaría la reproducción en curso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message?.id])

  useEffect(() => {
    if (!song || song.artworkPath || !song.artworkUrl) return
    let alive = true
    void ensureArtwork(song.videoId, song.artworkUrl).then((path) => {
      if (alive && path) setBackfilled(path)
    })
    return () => {
      alive = false
    }
  }, [song])

  /*
   * Memorizado, y no `song?.lyrics ?? []` suelto: ese `[]` es un array nuevo en
   * cada render, y como el efecto de traducir lo tiene de dependencia, se
   * volvería a disparar sin parar.
   */
  const baseLyrics = useMemo(() => song?.lyrics ?? [], [song])
  /** Se deduce: hay idioma pedido y todavía no llegó su versión. */
  const translating = lang !== 'off' && baseLyrics.length > 0 && !versions[lang]

  useEffect(() => {
    if (lang === 'off' || !baseLyrics.length || versions[lang]) return
    let alive = true
    const controller = new AbortController()
    translateLyrics(baseLyrics, lang, controller.signal)
      .then((done) => alive && setVersions((v) => ({ ...v, [lang]: done })))
      .catch((e: unknown) => {
        if (!alive || (e as Error).name === 'AbortError') return
        // Traducir es una ayuda: si falla se vuelve al idioma que había en vez
        // de romper la pantalla. Y como `lang` vuelve a 'off', el efecto no se
        // reintenta solo.
        setLang('off')
      })
    return () => {
      alive = false
      controller.abort()
    }
  }, [lang, baseLyrics, versions])

  // Marcar abierto y leído. Solo el receptor puede: la policy rechaza el update
  // si lo intenta quien lo mandó.
  useEffect(() => {
    if (!message || mine) return
    const { pairId } = getSession()
    if (!pairId) return
    if (!message.openedAt) void markOpened(pairId, message.id).catch(() => {})
    if (!message.readAt) void markRead(pairId, message.id).catch(() => {})
  }, [message, mine])

  if (!message) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-canvas">
        <Text className="text-muted-foreground text-sm">Ese mensaje ya no está.</Text>
        <Pressable accessibilityRole="button" onPress={() => volver(router, '/')}>
          <Text className="text-foreground font-medium underline">Volver</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const wide = width >= WIDE_PX
  const chosen = view ?? (song?.style === 'lyrics' ? 'lyrics' : 'disc')
  const onLyrics = chosen === 'lyrics' && (song?.lyrics?.length ?? 0) > 0
  const artPath = song?.artworkPath ?? backfilled
  const backdrop = song ? artworkSource(artPath, song.artworkUrl, 720) : null
  const lyrics = (lang === 'off' ? baseLyrics : versions[lang]) ?? baseLyrics
  const hasLyrics = lyrics.length > 0
  const who = contact ? contactLabel(contact) : 'contacto'
  const playing = player.currentId === message.id && player.playing

  return (
    <View className="flex-1 bg-canvas" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {backdrop ? (
        <Image
          source={{ uri: backdrop }}
          style={[
            StyleSheet.absoluteFill,
            {
              // La escala evita que el desenfoque deje los bordes transparentes.
              transform: [{ scale: 1.3 }],
              opacity: onLyrics ? 0.62 : 0.45,
            },
            // `filter` solo existe en web; en nativo queda la imagen atenuada,
            // que con el degradado encima sigue funcionando como fondo.
            Platform.OS === 'web'
              ? ({
                  filter: onLyrics
                    ? // Un poco de saturación extra: al desenfocar tanto, los
                      // tonos se promedian y la tapa pierde fuerza.
                      'blur(72px) saturate(1.5)'
                    : 'blur(64px) grayscale(1)',
                } as object)
              : null,
          ]}
          blurRadius={Platform.OS === 'web' ? 0 : 40}
        />
      ) : null}

      {/* El degradado es lo que hace legible el texto pase lo que pase con la
          imagen de atrás: sin él, una tapa clara se come la frase. */}
      <LinearGradient
        pointerEvents="none"
        // Con la letra el velo afloja en el medio para dejar respirar el color,
        // y aprieta arriba y abajo, que es donde va el texto de servicio.
        colors={
          onLyrics
            ? ['rgba(0,0,0,0.80)', 'rgba(0,0,0,0.38)', 'rgba(0,0,0,0.88)']
            : ['rgba(0,0,0,0.72)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']
        }
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        <View className="flex-row items-center gap-3 px-4 py-3">
          <View className="min-w-0 flex-1">
            <Text className="text-foreground text-[15px] font-semibold" numberOfLines={1}>
              {mine ? `Para ${who}` : `De ${who}`}
            </Text>
            {message.createdAt ? (
              <Text className="text-muted-foreground text-[11px]">
                {formatMessageDate(message.createdAt, true)}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            onPress={() => volver(router, '/')}
            className="h-10 w-10 items-center justify-center rounded-full bg-background/70 active:opacity-80"
          >
            <IconClose size={18} color={ICON_COLOR.foreground} />
          </Pressable>
        </View>

        <View className="min-h-0 flex-1 items-center">
        <View
          className="min-h-0 w-full flex-1 flex-row items-center justify-center gap-8 px-6"
          style={{ maxWidth: ANCHO_MAX }}
        >
          {/* En ancho, la frase al costado: no le saca una sola línea a la
              letra. Con su propio desplazamiento, así una frase larga no
              estira la columna. */}
          {wide && verFrase && message.text ? (
            <View className="max-h-[70%] w-[300px] rounded-2xl bg-card/80 p-4">
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text className="text-foreground text-[15px] leading-6">{message.text}</Text>
              </ScrollView>
            </View>
          ) : null}

          <View className="min-h-0 flex-1 items-center justify-center gap-7">
          {/*
            La letra va en una ventana de líneas fijas y no ocupando todo el
            alto: con el alto libre la última línea quedaba cortada por la mitad
            contra la frase de abajo. Con un número de líneas la ventana cierra
            siempre en un renglón entero.
          */}
          {chosen === 'lyrics' && hasLyrics ? (
            <View className="w-full max-w-xl items-center">
              <Lyrics lines={lyrics} atMs={player.positionMs} size="lg" visible={5} />
              {song?.lyricsLang ? (
                <Text className="text-muted-foreground pt-3 text-center text-[11px]">
                  Traducida al {LANG_NAMES[song.lyricsLang] ?? song.lyricsLang}
                </Text>
              ) : null}
            </View>
          ) : song ? (
            <>
              <SongDisc
                artworkUrl={song.artworkUrl}
                artworkPath={artPath}
                title={song.title}
                playing={playing}
                size={wide ? DISC_WIDE : DISC_NARROW}
              />
              <View className="items-center gap-1">
                <Text className="text-foreground text-xl font-semibold" numberOfLines={1}>
                  {song.title}
                </Text>
                <Text className="text-muted-foreground text-sm" numberOfLines={1}>
                  {song.artist}
                </Text>
              </View>
            </>
          ) : null}

          {/* En el teléfono, una tarjeta de tres líneas debajo del contenido.
              Desplegada crece hasta un tope y se desplaza adentro: lo que no
              puede pasar es que empuje la letra fuera de la pantalla. */}
          {!wide && verFrase && message.text ? (
            <View className="w-full max-w-xl rounded-2xl bg-card/80 p-4">
              {fraseAbierta ? (
                <ScrollView className="max-h-[180px]" showsVerticalScrollIndicator={false}>
                  <Text className="text-foreground text-[15px] leading-6">{message.text}</Text>
                </ScrollView>
              ) : (
                <Text className="text-foreground text-[15px] leading-6" numberOfLines={3}>
                  {message.text}
                </Text>
              )}
              <Pressable
                accessibilityRole="button"
                onPress={() => setFraseAbierta((v) => !v)}
                className="self-end pt-2 active:opacity-60"
              >
                <Text className="text-muted-foreground text-[12px] font-semibold">
                  {fraseAbierta ? 'Ver menos' : 'Ver más'}
                </Text>
              </Pressable>
            </View>
          ) : null}
          </View>

          {/* El contrapeso de la frase: un hueco del mismo ancho del otro lado.
              Sin esto, mostrar la frase corría el disco a la derecha y dejaba
              de estar alineado con la onda y el play de abajo, que sí están
              centrados en la ventana — la pieza se veía descuadrada justo al
              hacer visible lo que se quiso compartir. */}
          {wide && verFrase && message.text ? (
            <View pointerEvents="none" className="w-[300px]" />
          ) : null}
        </View>
        </View>

        {song ? (
          /* El pie va en la misma columna topada que el cuerpo: suelto a lo
             ancho de la ventana, la onda y el segmentado quedaban a metros de
             lo que están controlando. Y con aire abajo: pegado al borde se
             cortaba contra el filo de la ventana. */
          <View className="items-center px-6 pb-8">
          <View className="w-full items-center gap-4" style={{ maxWidth: ANCHO_MAX }}>
            {/* La onda del fragmento, que además es la única forma de moverse
                dentro de él: esta pantalla no tenía barra de posición. */}
            {picos ? (
              <View className="w-full max-w-xl">
                <Onda
                  picos={picos}
                  posicionMs={player.posicionSV}
                  desdeMs={song.startMs}
                  duracionMs={song.durationMs}
                  activa={player.currentId === message.id}
                  onSeek={(fraccion) =>
                    player
                      .seek(message.id, song, fraccion)
                      .catch((e: unknown) => avisar(mensajeError(e), true))
                  }
                  height={48}
                  etiqueta={song.title}
                />
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Pausar' : 'Reproducir'}
              onPress={() =>
                player.toggle(message.id, song).catch((e: unknown) =>
                  avisar(mensajeError(e), true),
                )
              }
              className="h-14 w-14 items-center justify-center rounded-full bg-primary active:opacity-80"
            >
              {playing ? (
                <IconPause size={20} color={ICON_COLOR.onPrimary} />
              ) : (
                <IconPlay size={20} color={ICON_COLOR.onPrimary} />
              )}
            </Pressable>

            {/* Disco o letra, el mismo segmentado que el editor. Sin letra
                guardada el botón no lleva a ningún lado y se apaga. */}
            <View className="flex-row items-center gap-2">
            <View className="flex-row items-center rounded-full bg-background/70 p-1">
              <Segment
                active={chosen === 'disc'}
                label="Disco"
                icon={<IconDisc size={14} color={chosen === 'disc' ? ICON_COLOR.onPrimary : ICON_COLOR.muted} />}
                onPress={() => setView('disc')}
              />
              <Segment
                active={chosen === 'lyrics'}
                label="Letra"
                enabled={hasLyrics}
                icon={
                  <IconLyrics
                    size={14}
                    color={chosen === 'lyrics' ? ICON_COLOR.onPrimary : ICON_COLOR.muted}
                  />
                }
                onPress={() => setView('lyrics')}
              />
            </View>

            {/* Mostrar y ocultar la frase. Solo si hay algo escrito: sin texto
                sería un interruptor que no enciende nada. */}
            {message.text ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: verFrase }}
                accessibilityLabel={verFrase ? 'Ocultar la frase' : 'Ver la frase'}
                onPress={() => setVerFrase((v) => !v)}
                className={`flex-row items-center gap-2 rounded-full px-4 py-2.5 active:opacity-70 ${
                  verFrase ? 'bg-primary' : 'bg-background/70'
                }`}
              >
                <IconMessage
                  size={14}
                  color={verFrase ? ICON_COLOR.onPrimary : ICON_COLOR.muted}
                />
                <Text
                  className={`text-[13px] font-medium ${
                    verFrase ? 'text-primary-foreground' : 'text-muted-foreground'
                  }`}
                >
                  Frase
                </Text>
              </Pressable>
            ) : null}

            {/* Traducir: solo aparece si hay letra que traducir. */}
            {hasLyrics ? (
              <Popover
                value={lang}
                options={LYRIC_LANGS.map((l) => ({ value: l.value, label: l.label }))}
                onChange={setLang}
                display={LYRIC_LANGS.find((l) => l.value === lang)?.short || 'Traducir'}
                accessibilityLabel="Traducir la letra"
                icon={
                  translating ? (
                    <ActivityIndicator size="small" color={ICON_COLOR.muted} />
                  ) : (
                    <IconLanguages
                      size={14}
                      color={lang === 'off' ? ICON_COLOR.muted : ICON_COLOR.foreground}
                    />
                  )
                }
              />
            ) : null}
            </View>
          </View>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  )
}

function Segment({
  active,
  label,
  icon,
  enabled = true,
  onPress,
}: {
  active: boolean
  label: string
  icon: React.ReactNode
  enabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 ${
        active ? 'bg-primary' : ''
      } ${enabled ? 'active:opacity-70' : 'opacity-40'}`}
    >
      {icon}
      <Text
        className={`text-[12px] font-medium ${
          active ? 'text-primary-foreground' : 'text-muted-foreground'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  )
}
