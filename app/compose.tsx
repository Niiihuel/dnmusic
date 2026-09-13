import { FilaSocial } from '../src/ui/FilaSocial'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useNavigation, usePreventRemove, type NavigationAction } from 'expo-router/react-navigation'
import { CabeceraSocial, AccionSocial, SeccionSocial } from '../src/ui/Social'
import { Confirmar } from '../src/ui/Confirmar'
import { volver } from '../src/lib/volver'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Hoja, useHojaModal } from '../src/ui/Hoja'
import { Menu } from '../src/ui/Menu'
import { Avatar } from '../src/ui/Avatar'
import { FilaCuenta } from '../src/ui/FilaCuenta'
import { Vacio } from '../src/ui/Vacio'
import { ScrollArea } from '../src/ui/ScrollArea'
import { SearchField } from '../src/ui/SearchField'
import { SkeletonList } from '../src/ui/Skeleton'
import { sendMessage } from '../src/services/messages'
import {
  contactLabel,
  contactTitle,
  MINIMO_BUSQUEDA,
  searchContacts,
  sendContactRequest,
  toContact,
  type ContactResult,
} from '../src/services/contacts'
import { avisar } from '../src/state/aviso'
import {
  getSession,
  openContactConversation,
  refreshConversations,
  useContact,
  useConversations,
} from '../src/state/session'
import { resetDraft, setDraft, useDraft } from '../src/state/draft'
import { artworkSource } from '../src/lib/artwork'
import {
  ICON_COLOR,
  IconInbox,
  IconMusic,
  IconSend,
} from '../src/ui/icons'
import { CampoMensaje } from '../src/ui/CampoMensaje'

const MAX_MESSAGE_LENGTH = 2000
const SEARCH_DEBOUNCE_MS = 250

export default function Compose() {
  const draft = useDraft()
  const activeContact = useContact()
  const conversations = useConversations()
  const modal = useHojaModal()
  const { height } = useWindowDimensions()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContactResult[]>([])
  const [searching, setSearching] = useState(true)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const navigation = useNavigation()
  const enviando = useRef(false)
  const enviado = useRef(false)
  const [salida, setSalida] = useState<NavigationAction | null>(null)

  const recipient = draft.recipient ?? (draft.chooseRecipient ? null : activeContact)
  const visibleResults = useMemo(
    () => results.filter((contact) => contact.id !== recipient?.id),
    [recipient?.id, results],
  )
  /*
   * Escribirle es solo para contactos: con cualquier otra cuenta lo que se
   * envía es una solicitud. Ser contacto es tener un par, y todo par está en
   * la bandeja, así que la lista de conversaciones alcanza como registro.
   */
  const esContacto =
    recipient !== null &&
    conversations.some((conversation) => conversation.contact.id === recipient.id)
  /* El estado de la solicitud sale de la búsqueda; si el destinatario llegó
     de afuera y no está en los resultados, se asume que no hay ninguna. */
  const solicitud = recipient
    ? (results.find((contact) => contact.id === recipient.id)?.solicitud ?? null)
    : null

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchContacts(query, controller.signal)
        .then((contacts) => {
          setResults(contacts)
          /* Tres mensajes distintos para tres situaciones distintas: no
             escribiste lo suficiente, no hay nadie así, o encontré. Antes
             «no encontré» aparecía también con el campo vacío, que era
             contestar una pregunta que nadie hizo. */
          setSearchError(
            contacts.length
              ? null
              : query.trim().length < MINIMO_BUSQUEDA
                ? `Escribí al menos ${MINIMO_BUSQUEDA} letras del usuario o del nombre.`
                : 'No encontré ninguna cuenta.',
          )
          setSearching(false)
        })
        .catch((cause: unknown) => {
          if ((cause as Error).name === 'AbortError') return
          setSearchError('No se pudieron buscar contactos.')
          setSearching(false)
        })
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  /*
   * Con una solicitud recibida se escribe normal: al enviar, la base cruza
   * las solicitudes, los hace contactos y el mensaje sale en el mismo gesto.
   * El modo solicitud queda para las cuentas con las que no hay nada todavía.
   */
  const puedeEscribir = esContacto || solicitud === 'recibida'
  const hasContent = draft.text.trim().length > 0 || draft.song !== null
  const canSend = puedeEscribir
    ? recipient !== null && hasContent && draft.text.length <= MAX_MESSAGE_LENGTH && !busy
    : // Modo solicitud: no hay nada que escribir, alcanza con el destinatario.
      // Con una ya enviada el botón se apaga: reenviarla no haría nada.
      recipient !== null && solicitud !== 'enviada' && !busy

  usePreventRemove(hasContent || busy, ({ data }) => {
    if (enviado.current) navigation.dispatch(data.action)
    else if (!enviando.current) setSalida(data.action)
  })
  useEffect(() => {
    if (Platform.OS !== 'web' || (!hasContent && !busy)) return
    const advertir = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', advertir)
    return () => window.removeEventListener('beforeunload', advertir)
  }, [hasContent, busy])

  function changeQuery(value: string) {
    setQuery(value)
    setSearching(true)
    setSearchError(null)
  }

  function chooseContact(contact: ContactResult) {
    if (enviando.current) return
    setDraft({
      recipient: toContact(contact),
      chooseRecipient: false,
    })
    setError(null)
    setQuery('')
  }

  async function send() {
    if (enviando.current || !canSend) return
    const { user } = getSession()
    if (!user || !recipient) {
      setError('Elegí a quién querés enviarle el mensaje.')
      return
    }

    enviando.current = true
    setBusy(true)
    setError(null)
    try {
      if (!esContacto) {
        /* Con una cuenta nueva lo que sale es la solicitud. Si se cruzó con
           una suya, la base los hace contactos ahí mismo y se sigue de largo
           al envío normal. */
        const estado = await sendContactRequest(recipient.id)
        if (estado === 'enviada') {
          avisar(`Solicitud enviada a @${recipient.username}`)
          await refreshConversations()
          enviado.current = true
          resetDraft()
          volver(router, '/')
          return
        }
        await refreshConversations()
        if (!hasContent) {
          enviado.current = true
          resetDraft()
          volver(router, '/')
          return
        }
      }
      const pairId = await openContactConversation(recipient)
      await sendMessage(pairId, user.id, {
        text: draft.text,
        song: draft.song ?? undefined,
      })
      await refreshConversations()
      enviado.current = true
      resetDraft()
      volver(router, '/')
    } catch (cause) {
      setError(`No se pudo enviar: ${(cause as Error).message}`)
      enviando.current = false
      setBusy(false)
    }
  }

  function cancel() {
    if (enviando.current) return
    if (!hasContent) resetDraft()
    volver(router, '/')
  }

  const contactPicker = (
    <View className="min-h-0 flex-1 gap-4">
      <SearchField
        value={query}
        onChangeText={changeQuery}
        placeholder="Buscar contacto"
        autoFocus={!recipient}
        loading={searching}
      />

      <View className="min-h-0 flex-1">
        {searching ? (
          <View className="py-2">
            <SkeletonList rows={5} />
          </View>
        ) : searchError ? (
          <Vacio
            compacto
            icono={<IconInbox size={20} color={ICON_COLOR.muted} />}
            titulo={query.trim().length < MINIMO_BUSQUEDA ? 'Encontrá un contacto' : 'Sin resultados'}
            detalle={searchError}
          />
        ) : visibleResults.length === 0 ? (
          <Vacio
            compacto
            icono={<IconInbox size={20} color={ICON_COLOR.muted} />}
            titulo={recipient ? 'Destinatario elegido' : 'Nadie por acá'}
            detalle={
              recipient
                ? 'Escribí otro usuario para cambiar el destinatario.'
                : 'Probá con otro usuario.'
            }
          />
        ) : (
          <FlatList
            renderScrollComponent={(props) => <ScrollArea {...props} />}
            data={visibleResults}
            keyExtractor={(contact) => contact.id}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="gap-1"
            renderItem={({ item }) => (
              <FilaCuenta cuenta={item} onAbrir={() => chooseContact(item)}
                onVerPerfil={() => router.push({ pathname: '/perfil/[usuario]', params: { usuario: item.username } })} />
            )}
          />
        )}
      </View>
    </View>
  )

  const chipDestinatario = recipient ? (
    <View className="min-h-11 flex-row items-center gap-3 px-1">
      <Text className="text-muted-foreground text-subheadline">Para</Text>
      <Avatar name={contactLabel(recipient)} path={recipient.avatarPath} size={32} />
      <View style={{ flex: 1 }}><FilaSocial titulo={contactTitle(recipient)} detalle={`@${recipient.username}`} valor="Cambiar" label="Cambiar destinatario"
        disabled={busy} onPress={() => setDraft({ recipient: null, chooseRecipient: true })} /></View>
    </View>
  ) : null

  const messageEditor = (
    <ScrollView
      className="min-h-0 flex-1"
      contentContainerClassName="gap-6"
      keyboardShouldPersistTaps="handled"
    >
      <SeccionSocial>
        <View className="gap-3 p-4">
        <View className="flex-row items-center justify-between">
          <View className="gap-0.5">
            <Text className="text-foreground text-subheadline font-semibold">Mensaje</Text>
          </View>
          <Text
            className={`text-caption1 tabular-nums ${
              draft.text.length > MAX_MESSAGE_LENGTH
                ? 'text-destructive'
                : 'text-muted-foreground'
            }`}
          >
            {draft.text.length}/{MAX_MESSAGE_LENGTH}
          </Text>
        </View>
        <CampoMensaje
          editable={!busy}
          value={draft.text}
          onChangeText={(text) => setDraft({ text })}
          placeholder={
            recipient ? `Escribile algo a @${recipient.username}…` : 'Escribí algo…'
          }
          accessibilityLabel="Mensaje"
          autoFocus={!!recipient}
          maxLength={MAX_MESSAGE_LENGTH + 1}
          expandido
          className="min-h-28 text-foreground text-callout leading-6"
        />
        </View>
      </SeccionSocial>

      <View className="gap-2">
        <Text className="text-foreground text-subheadline font-semibold">
          Canción
        </Text>
        {draft.song ? (
          <View className="flex-row items-center gap-3 rounded-xl bg-muted p-3">
            <View className="min-w-0 flex-1 flex-row items-center gap-3">
              {(draft.song.artworkPath || draft.song.artworkUrl) ? <Image source={{ uri: artworkSource(draft.song.artworkPath, draft.song.artworkUrl, 128) ?? '' }} style={{ width: 56, height: 56, borderRadius: 8 }} /> :
                <View className="h-14 w-14 items-center justify-center rounded-lg bg-card"><IconMusic size={20} color={ICON_COLOR.muted} /></View>}
              <View style={{ flex: 1 }}><FilaSocial titulo={draft.song.title}
                detalle={`${draft.song.artist} · ${Math.round(draft.song.durationMs / 1000)} s${draft.song.lyrics?.length ? ' · con letra' : ''}`}
                label="Cambiar canción" disabled={busy} onPress={() => router.push('/song')} /></View>
            </View>
            <Menu label="Opciones de la canción adjunta" items={[
              { label: 'Cambiar canción', sfSymbol: 'music.note', disabled: busy, onPress: () => router.push('/song') },
              { label: 'Quitar canción', sfSymbol: 'trash', disabled: busy, destructive: true, onPress: () => setDraft({ song: null }) },
            ]} />
          </View>
        ) : (
          <AccionSocial label="Agregar una canción" secundaria disabled={busy} expandida={false} onPress={() => router.push('/song')} icono={<IconMusic size={18} color={ICON_COLOR.muted} />} />
        )}
      </View>

      {error ? (
        <View className="rounded-lg bg-muted px-4 py-3">
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" className="text-destructive text-subheadline">{error}</Text>
        </View>
      ) : null}
    </ScrollView>
  )

  /* Lo que reemplaza al editor cuando todavía no se le puede escribir: acá lo
     que sale es una solicitud, y esto dice qué va a pasar con ella. */
  const requestNotice = recipient ? (
    <View className="flex-1 gap-4">
      <View className="gap-2 rounded-xl bg-muted p-5">
        <Text className="text-foreground text-subheadline font-semibold">
          {solicitud === 'enviada' ? 'Solicitud enviada' : 'Todavía no son contactos'}
        </Text>
        <Text className="text-muted-foreground text-footnote leading-5">
          {solicitud === 'enviada'
            ? `Tu solicitud ya salió. Cuando @${recipient.username} la acepte vas a poder escribirle y compartirle canciones.`
            : `Mandale una solicitud a @${recipient.username}: cuando la acepte vas a poder escribirle y compartirle canciones.`}
        </Text>
      </View>
      {error ? (
        <View className="rounded-lg bg-muted px-4 py-3">
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" className="text-destructive text-subheadline">{error}</Text>
        </View>
      ) : null}
    </View>
  ) : null

  return (
    <Hoja medida={modal ? "contenido" : "llena"} anchoMaximo={640} titulo="Nuevo mensaje">
      <SafeAreaView className="min-h-0 bg-background" style={modal ? { height: Math.min(560, height - 96) } : { flex: 1 }} edges={Platform.OS === 'web' ? [] : ['bottom']}>
        <CabeceraSocial titulo="Nuevo mensaje" ocupado={busy} detalle={recipient ? undefined : 'Elegir destinatario'} onCerrar={cancel} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="min-h-0 flex-1">
          <View className="min-h-0 flex-1 gap-4 px-5 pb-4">
            {!recipient ? contactPicker : <>{chipDestinatario}{puedeEscribir ? messageEditor : requestNotice}</>}
          </View>
          {recipient ? <View className="items-end px-5 pt-2" style={{ paddingBottom: 20 }}>
            <AccionSocial expandida={false} style={{ alignSelf: 'flex-end' }} label={puedeEscribir ? 'Enviar mensaje' : solicitud === 'enviada' ? 'Solicitud enviada' : 'Enviar solicitud'}
              onPress={send} disabled={!canSend} busy={busy}
              icono={<IconSend size={18} color={canSend ? ICON_COLOR.onPrimary : ICON_COLOR.muted} />} />
          </View> : null}
        </KeyboardAvoidingView>
        <Confirmar visible={!!salida} titulo="¿Descartar el mensaje?"
          mensaje="El texto y el fragmento que elegiste todavía no se enviaron."
          rotulo="Descartar" onCancelar={() => setSalida(null)} onConfirmar={() => {
            const action = salida
            setSalida(null)
            resetDraft()
            if (action) navigation.dispatch(action)
          }} />
      </SafeAreaView>
    </Hoja>
  )
}
