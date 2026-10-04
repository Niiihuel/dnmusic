import { PlayerHeader } from '../../src/ui/PlayerHeader'
import { IconButton } from '../../src/ui/IconButton'
import { CancionCompartida } from '../../src/ui/CancionCompartida'
import { invitacionEnTexto } from '../../src/lib/invitacionJam'
import { InvitacionJam } from '../../src/ui/InvitacionJam'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { volver } from '../../src/lib/volver'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { CabeceraSocial, AccionSocial } from '../../src/ui/Social'
import { SeekBar } from '../../src/ui/SeekBar'
import { Vacio } from '../../src/ui/Vacio'
import { PlayerArtwork } from '../../src/ui/PlayerArtwork'
import { PlayerBackdrop } from '../../src/ui/PlayerBackdrop'
import { FadedLyrics } from '../../src/ui/FadedLyrics'
import { Lyrics } from '../../src/ui/Lyrics'
import { Popover } from '../../src/ui/Popover'
import { Segmentado } from '../../src/ui/Segmentado'
import { Menu } from '../../src/ui/Menu'
import { isSentBy } from '../../src/models/message'
import { markOpened, markRead } from '../../src/services/messages'
import { getSession, useContact, useMessages, useUser } from '../../src/state/session'
import { usePiso } from '../../src/state/shell'
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
  IconLanguages,
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
const ESTILO_FRASE = { flexShrink: 0, minWidth: 0, padding: 20, borderRadius: 20,
  backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }
const TEXTO_FRASE = { color: '#F5F5F5', fontSize: 17, lineHeight: 27, flexShrink: 0,
  ...(Platform.OS === 'web' ? { overflowWrap: 'anywhere' as const } : {}) }


type StoryView = 'disc' | 'lyrics'

/** Para decir en qué idioma está la letra sin arrastrar toda la lista. */
const LANG_NAMES: Record<string, string> = {
  es: 'español',
  en: 'inglés',
  pt: 'portugués',
  fr: 'francés',
  it: 'italiano',
  de: 'alemán',
  ja: 'japonés',
}

/** Fragmento compartido con la misma portada, fondo y controles de Sonando. */
export default function MessageStory() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const messages = useMessages()
  const user = useUser()
  const contact = useContact()
  const router = useRouter()
  const player = useSnippetPlayer()
  const pisoShell = usePiso(16)
  const piso = Platform.OS === 'ios' ? 16 : pisoShell
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
  // La nota se lee en el mismo scroll del disco, sin un segundo viewport
  // que pueda quedar oculto debajo de los controles.
  const [verFrase, setVerFrase] = useState(true)
  const [versions, setVersions] = useState<Partial<Record<LyricLang, LyricLine[]>>>({})

  const message = messages.find((m) => m.id === id)
  const song = message?.song ?? null
  const mine = message && user ? isSentBy(message, user.id) : false
  useEffect(() => {
    if (message?.deletedAt && player.currentId === message.id) player.stop()
  }, [message?.deletedAt, message?.id, player])

  /*
   * Arranca sola, como una historia.
   *
   * Se llega hasta acá tocando el mensaje, así que el navegador considera que
   * hubo gesto y deja sonar. Si igual lo bloquea, queda el botón de play.
   */
  useEffect(() => {
    if (!message || !song) return
    player.toggle(message.id, song).catch((e: unknown) => avisar(mensajeError(e), true))
    // useSnippetPlayer cancela sus pendientes; expo-audio libera el audio.
    // No pausar desde este cleanup: el objeto nativo ya puede estar liberado.
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
      <SafeAreaView className="flex-1 bg-background">
        <CabeceraSocial titulo="Mensaje" onCerrar={() => volver(router, '/')} />
        <View className="flex-1 items-center justify-center gap-4 p-5">
          <Vacio icono={<IconMessage size={24} color={ICON_COLOR.muted} />} titulo="Mensaje no disponible" detalle="Volvé a la conversación para elegir otro mensaje." />
          <AccionSocial label="Volver a la conversación" onPress={() => volver(router, '/')} secundaria />
        </View>
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
    <SafeAreaProvider>
    <View className="flex-1 bg-background" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <PlayerBackdrop uri={backdrop} />

      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        <PlayerHeader title={mine ? `Para ${who}` : `De ${who}`}
          subtitle={message.createdAt ? formatMessageDate(message.createdAt, true) : undefined}
          closeLabel="Volver al chat" onClose={() => volver(router, '/')} />

        <ScrollView className="min-h-0 flex-1" contentInsetAdjustmentBehavior="never" contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingTop: 20, paddingBottom: song ? 32 : piso }}>
          <View
            className="w-full flex-row items-center justify-center gap-8 px-5"
            style={{ maxWidth: ANCHO_MAX }}
          >
            {/* La dedicatoria completa comparte el scroll con la portada.
                No tiene altura fija ni un segundo desplazamiento anidado. */}
            {wide && song && verFrase && message.text ? (
              <View style={{ width: Math.min(300, width * 0.34) }}>
                {invitacionEnTexto(message.text) ? <InvitacionJam texto={message.text} /> :
                  <View style={ESTILO_FRASE}><Text selectable style={TEXTO_FRASE}>{message.text}</Text></View>}
              </View>
            ) : null}

            <View className="min-w-0 flex-1 items-center gap-7" style={{ flexShrink: 0 }}>
              {message.sharedSong ? <CancionCompartida song={message.sharedSong} /> : null}

              {chosen === 'lyrics' && hasLyrics ? (
                <View className="w-full max-w-xl" style={{ height: 320, flexShrink: 0 }}>
                  <FadedLyrics><Lyrics lines={lyrics} atMs={player.positionMs} size="xl"
                    onPickLine={atMs => { if (song) void player.seek(message.id, song, Math.max(0, Math.min(1, (atMs - song.startMs) / Math.max(1, song.durationMs)))).catch((e: unknown) => avisar(mensajeError(e), true)) }} />
                  </FadedLyrics>
                  {song?.lyricsLang ? (
                    <Text className="text-muted-foreground pt-3 text-center text-footnote">
                      Traducida al {LANG_NAMES[song.lyricsLang] ?? song.lyricsLang}
                    </Text>
                  ) : null}
                </View>
              ) : song ? (
                <>
                  <View style={{ width: Math.min(wide ? DISC_WIDE : DISC_NARROW, Math.max(140, width - 80)), flexShrink: 0 }}>
                    {backdrop ? <PlayerArtwork uri={backdrop} playing={playing} /> :
                      <View className="aspect-square items-center justify-center rounded-2xl bg-muted"><IconMessage size={48} color={ICON_COLOR.muted} /></View>}
                  </View>
                  <View className="w-full items-center gap-1">
                    <Text className="text-foreground text-title3 text-center font-semibold">
                      {song.title}
                    </Text>
                    <Text className="text-muted-foreground text-subheadline text-center">
                      {song.artist}
                    </Text>
                  </View>
                </>
              ) : null}

              {(!wide || !song) && verFrase && message.text ? (
                <View style={invitacionEnTexto(message.text) ? { flexShrink: 0 } : ESTILO_FRASE} className="w-full max-w-xl">
                  {invitacionEnTexto(message.text) ? (
                    <InvitacionJam texto={message.text} />
                  ) : (
                    <Text selectable style={TEXTO_FRASE}>
                      {message.text}
                    </Text>
                  )}
                </View>
              ) : null}
            </View>

          </View>
        </ScrollView>

        {song ? (
          /* El pie va en la misma columna topada que el cuerpo: suelto a lo
             ancho de la ventana, la onda y el segmentado quedaban a metros de
             lo que están controlando. Y con aire abajo: pegado al borde se
             cortaba contra el filo de la ventana. */
          <View className="items-center px-5 pt-3" style={{ paddingBottom: piso, flexShrink: 0 }}>
            <View className="w-full items-center gap-4" style={{ maxWidth: ANCHO_MAX }}>
              <View className="w-full max-w-xl">
                <SeekBar label={song.title}
                  progress={Math.max(0, Math.min(1, (player.positionMs - song.startMs) / Math.max(1, song.durationMs)))}
                  elapsedMs={Math.max(0, Math.min(song.durationMs, player.positionMs - song.startMs))}
                  totalMs={song.durationMs}
                  onSeek={(fraction) => { void player.seek(message.id, song, fraction).catch((e: unknown) => avisar(mensajeError(e), true)) }} />
              </View>

              <IconButton label={playing ? 'Pausar' : 'Reproducir'} symbol={playing ? 'pause.fill' : 'play.fill'} onPress={() => player.toggle(message.id, song).catch((e: unknown) => avisar(mensajeError(e), true))} variant="primary" lado={56} icon={playing ? <IconPause size={20} color={ICON_COLOR.onPrimary} /> : <IconPlay size={20} color={ICON_COLOR.onPrimary} />} />

              <View style={{ width: '100%', maxWidth: 560, flexDirection: 'row', flexWrap: Platform.OS === 'ios' ? 'nowrap' : 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                {hasLyrics ? <View style={{ flex: 1, minWidth: 140, maxWidth: 280 }}>
                  <Segmentado<StoryView> value={chosen} onChange={setView} label="Vista del fragmento"
                    options={[{ value: 'disc', label: 'Portada' }, { value: 'lyrics', label: 'Letra' }]} />
                </View> : null}

                {/* Mostrar y ocultar la frase. Solo si hay algo escrito: sin texto
                sería un interruptor que no enciende nada. */}
                {message.text ? (
                  <IconButton label={verFrase ? 'Ocultar la frase' : 'Ver la frase'} symbol="text.bubble" selected={verFrase} onPress={() => setVerFrase(v => !v)} icon={<IconMessage size={18} color={ICON_COLOR.foreground} />} />
                ) : null}

                {/* Traducir: solo aparece si hay letra que traducir. */}
                {hasLyrics && onLyrics ? Platform.OS === 'ios' ? (
                  <Menu label={translating ? 'Traduciendo la letra' : 'Traducir la letra'} triggerSymbol="character.bubble"
                    items={LYRIC_LANGS.map(l => ({ label: l.label, selected: l.value === lang, onPress: () => setLang(l.value) }))} />
                ) : (
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
    </SafeAreaProvider>
  )
}
