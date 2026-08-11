import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { volver } from '../src/lib/volver'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Panel } from '../src/ui/Panel'
import { ResizableRegion } from '../src/ui/ResizableRegion'
import { AnimatedSidebarTitle, CollapsedSidebar } from '../src/ui/SidebarMotion'
import { SearchField } from '../src/ui/SearchField'
import { SkeletonList } from '../src/ui/Skeleton'
import { contactInitial } from '../src/ui/MessageCard'
import { sendMessage } from '../src/services/messages'
import { searchContacts, toContact, type ContactResult } from '../src/services/contacts'
import {
  getSession,
  openContactConversation,
  refreshConversations,
  useContact,
  useConversations,
} from '../src/state/session'
import { resetDraft, setDraft, useDraft } from '../src/state/draft'
import { usePiso } from '../src/state/shell'
import { artworkSource } from '../src/lib/artwork'
import {
  ICON_COLOR,
  IconCheck,
  IconCollapseLeft,
  IconCollapseRight,
  IconClose,
  IconHome,
  IconInbox,
  IconMusic,
  IconSend,
} from '../src/ui/icons'

const MAX_MESSAGE_LENGTH = 2000
const SEARCH_DEBOUNCE_MS = 250
const WIDE_COMPOSER_PX = 820

export default function Compose() {
  const draft = useDraft()
  const activeContact = useContact()
  const conversations = useConversations()
  const { width } = useWindowDimensions()
  /** En el teléfono el contenido va de borde a borde. Ver `Panel`. */
  const suelto = width < 780
  /* El botón de enviar no puede quedar debajo de lo que flota abajo. Acá no
     hay pestañas —es una pantalla apilada— así que es solo el reproductor. */
  const piso = usePiso(16)
  const wide = width >= WIDE_COMPOSER_PX
  const showContactSidebar = width >= 900
  const showSongSidebar = width >= 1180
  const [leftWidth, setLeftWidth] = useState(320)
  const [rightWidth, setRightWidth] = useState(320)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContactResult[]>([])
  const [searching, setSearching] = useState(true)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const recipient = draft.recipient ?? (draft.chooseRecipient ? null : activeContact)
  const conversationPairIds = useMemo(
    () => new Set(conversations.map((conversation) => conversation.pairId)),
    [conversations],
  )
  const visibleResults = useMemo(
    () => results.filter((contact) => contact.id !== recipient?.id),
    [recipient?.id, results],
  )

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchContacts(query, controller.signal)
        .then((contacts) => {
          setResults(contacts)
          setSearchError(contacts.length ? null : 'No encontré ninguna cuenta.')
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

  const hasContent = draft.text.trim().length > 0 || draft.song !== null
  const canSend =
    recipient !== null && hasContent && draft.text.length <= MAX_MESSAGE_LENGTH && !busy

  function changeQuery(value: string) {
    setQuery(value)
    setSearching(true)
    setSearchError(null)
  }

  function chooseContact(contact: ContactResult) {
    setDraft({
      recipient: toContact(contact),
      chooseRecipient: false,
    })
    setError(null)
    if (!wide) setQuery('')
  }

  async function send() {
    const { user } = getSession()
    if (!user || !recipient) {
      setError('Elegí a quién querés enviarle el mensaje.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const pairId = await openContactConversation(recipient)
      await sendMessage(pairId, user.id, {
        text: draft.text,
        song: draft.song ?? undefined,
      })
      await refreshConversations()
      resetDraft()
      volver(router, '/')
    } catch (cause) {
      setError(`No se pudo enviar: ${(cause as Error).message}`)
      setBusy(false)
    }
  }

  function cancel() {
    resetDraft()
    volver(router, '/')
  }

  const contactPicker = (
    <View className={`${wide ? 'w-[300px]' : 'max-h-[300px]'} min-h-0 gap-3`}>
      {!showContactSidebar ? (
        <View className="gap-1">
          <Text className="text-foreground text-lg font-semibold">Destinatario</Text>
          <Text className="text-muted-foreground text-xs">Buscá una cuenta por su usuario.</Text>
        </View>
      ) : null}

      <SearchField
        value={query}
        onChangeText={changeQuery}
        placeholder="Buscar contacto"
        autoFocus={!recipient}
        loading={searching}
      />

      {recipient ? (
        <View className="flex-row items-center gap-3 rounded-xl bg-muted p-3">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-card">
            <Text className="text-foreground text-sm font-semibold uppercase">
              {contactInitial(recipient.username)}
            </Text>
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-foreground text-[14px] font-semibold" numberOfLines={1}>
              @{recipient.username}
            </Text>
            <Text className="text-muted-foreground text-[11px]">Destinatario elegido</Text>
          </View>
          <View className="h-7 w-7 items-center justify-center rounded-full bg-primary">
            <IconCheck size={14} color={ICON_COLOR.onPrimary} />
          </View>
        </View>
      ) : null}

      <View className="min-h-0 flex-1">
        {searching ? (
          <View className="py-2">
            <SkeletonList rows={4} />
          </View>
        ) : searchError ? (
          <View className="items-center gap-2 px-4 py-8">
            <IconInbox size={20} color={ICON_COLOR.muted} />
            <Text className="text-muted-foreground text-center text-xs leading-5">
              {searchError}
            </Text>
          </View>
        ) : visibleResults.length === 0 ? (
          <Text className="px-4 py-8 text-center text-muted-foreground text-xs leading-5">
            {recipient
              ? 'Escribí otro usuario para cambiar el destinatario.'
              : 'No hay otros contactos disponibles.'}
          </Text>
        ) : (
          <FlatList
            data={visibleResults}
            keyExtractor={(contact) => contact.id}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="gap-1"
            renderItem={({ item }) => {
              const selected = recipient?.id === item.id
              const hasConversation =
                item.pairId !== null && conversationPairIds.has(item.pairId)
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => chooseContact(item)}
                  className={`flex-row items-center gap-3 rounded-lg p-2.5 active:opacity-80 ${
                    selected ? 'bg-muted' : ''
                  }`}
                >
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Text className="text-foreground text-xs font-semibold uppercase">
                      {contactInitial(item.username)}
                    </Text>
                  </View>
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="text-foreground text-[14px] font-semibold" numberOfLines={1}>
                      @{item.username}
                    </Text>
                    <Text className="text-muted-foreground text-[11px]">
                      {hasConversation ? 'Ya está en tus conversaciones' : 'Nuevo contacto'}
                    </Text>
                  </View>
                  {selected ? <IconCheck size={16} color={ICON_COLOR.foreground} /> : null}
                </Pressable>
              )
            }}
          />
        )}
      </View>
    </View>
  )

  const messageEditor = (
    <ScrollView
      className="min-h-0 flex-1"
      contentContainerClassName="gap-6"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <View className="gap-0.5">
            <Text className="text-foreground text-lg font-semibold">Tu mensaje</Text>
            <Text className="text-muted-foreground text-xs">
              {recipient ? `Para @${recipient.username}` : 'Primero elegí un destinatario'}
            </Text>
          </View>
          <Text
            className={`text-xs tabular-nums ${
              draft.text.length > MAX_MESSAGE_LENGTH
                ? 'text-destructive'
                : 'text-muted-foreground'
            }`}
          >
            {draft.text.length}/{MAX_MESSAGE_LENGTH}
          </Text>
        </View>
        <TextInput
          value={draft.text}
          onChangeText={(text) => setDraft({ text })}
          placeholder={
            recipient ? `Escribile algo a @${recipient.username}…` : 'Escribí algo…'
          }
          placeholderTextColor="#777777"
          accessibilityLabel="Mensaje"
          multiline
          autoFocus={!!recipient}
          maxLength={MAX_MESSAGE_LENGTH + 1}
          textAlignVertical="top"
          className="min-h-44 rounded-xl bg-muted px-4 py-3.5 text-foreground text-[16px] leading-6"
        />
      </View>

      {!showSongSidebar ? <View className="gap-2">
        <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.8px]">
          Canción
        </Text>
        {draft.song ? (
          <View className="flex-row items-center gap-3 rounded-xl bg-muted p-3">
            {draft.song.artworkUrl ? (
              <Image
                source={{ uri: artworkSource(draft.song.artworkPath, draft.song.artworkUrl, 128) ?? '' }}
                className="h-14 w-14 rounded-lg bg-card"
              />
            ) : (
              <View className="h-14 w-14 items-center justify-center rounded-lg bg-card">
                <IconMusic size={20} color={ICON_COLOR.muted} />
              </View>
            )}
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-foreground text-[14px] font-semibold" numberOfLines={1}>
                {draft.song.title}
              </Text>
              <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                {draft.song.artist} · {Math.round(draft.song.durationMs / 1000)} s
                {draft.song.lyrics?.length ? ' · con letra' : ''}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quitar la canción"
              onPress={() => setDraft({ song: null })}
              className="h-10 w-10 items-center justify-center rounded-full bg-card active:opacity-70"
            >
              <IconClose size={17} color={ICON_COLOR.muted} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/song')}
            className="flex-row items-center justify-center gap-2 rounded-full bg-muted py-3.5 active:opacity-80"
          >
            <IconMusic size={18} color={ICON_COLOR.muted} />
            <Text className="text-muted-foreground text-[14px] font-semibold">
              Agregar una canción
            </Text>
          </Pressable>
        )}
      </View> : null}

      {error ? (
        <View className="rounded-lg bg-muted px-4 py-3">
          <Text className="text-destructive text-sm leading-5">{error}</Text>
        </View>
      ) : null}
    </ScrollView>
  )

  const contactPanel = (hovered: boolean, onCollapse: () => void) => (
    <Panel className="flex-1">
      <View className="px-5 pb-2 pt-5">
        <AnimatedSidebarTitle
          visible={hovered}
          label="Colapsar destinatarios"
          icon={<IconCollapseLeft size={17} color={ICON_COLOR.muted} />}
          onPress={onCollapse}
          alignIconToFirstLine
        >
          <View className="gap-0.5">
            <Text className="text-foreground text-lg font-semibold">Destinatario</Text>
            <Text className="text-muted-foreground text-xs">Buscá una cuenta por su usuario.</Text>
          </View>
        </AnimatedSidebarTitle>
      </View>
      <View className="min-h-0 flex-1 p-5 pt-2">{contactPicker}</View>
    </Panel>
  )

  const songPanel = (hovered: boolean, onCollapse: () => void) => (
    <ComposerSongPanel
      hovered={hovered}
      song={draft.song}
      onCollapse={onCollapse}
      onAdd={() => router.push('/song')}
      onRemove={() => setDraft({ song: null })}
    />
  )

  /*
   * En el teléfono el fondo es el mismo del contenido.
   *
   * Con el negro puro del escritorio, el encabezado y la zona de las pestañas
   * quedaban como dos franjas más oscuras contra los paneles: una costura
   * visible donde no hay ninguna separación real.
   */
  return (
    <SafeAreaView
      className={`flex-1 ${suelto ? 'bg-background' : 'bg-canvas'}`}
      edges={['top', 'bottom']}
    >
      {/* Sin margen ni hueco en el teléfono: con un solo panel a la vista, el
          marco negro alrededor no separa nada — ver `Panel`. */}
      <View className={`flex-1 ${suelto ? '' : 'gap-2 p-2'}`}>
        <View className="relative flex-row items-center justify-between px-2">
          {/* En el teléfono el logo y el botón de inicio sobran: son 390px y la
              cruz ya es la salida. Queda la cruz y el título, como cualquier
              pantalla de redactar del sistema. */}
          <View className="flex-row items-center gap-3">
            {suelto ? null : (
              <View className="h-11 w-11 items-center justify-center rounded-full bg-primary">
                <IconMusic size={21} color={ICON_COLOR.onPrimary} />
              </View>
            )}
            {wide ? <Text className="text-foreground text-lg font-bold">dnmusic</Text> : null}
          </View>

          <View className="absolute inset-x-0 items-center" pointerEvents="box-none">
            <View className="flex-row items-center gap-2">
              {suelto ? null : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Volver al inicio"
                  onPress={() => {
                    resetDraft()
                    router.replace('/')
                  }}
                  className="h-11 w-11 items-center justify-center rounded-full bg-background active:bg-muted"
                >
                  <IconHome size={19} color={ICON_COLOR.foreground} />
                </Pressable>
              )}
              <View className={suelto ? 'px-2' : 'rounded-full bg-background px-5 py-2.5'}>
                <Text className="text-foreground text-[14px] font-semibold">Nuevo mensaje</Text>
              </View>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancelar"
            onPress={cancel}
            className="h-11 w-11 items-center justify-center rounded-full bg-background active:bg-muted"
          >
            <IconClose size={17} color={ICON_COLOR.muted} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="min-h-0 flex-1"
        >
          <View className="min-h-0 flex-1 flex-row gap-2">
            {showContactSidebar ? (
              <ResizableRegion
                width={leftWidth}
                collapsed={leftCollapsed}
                minWidth={300}
                maxWidth={430}
                resizeEdge="right"
                onWidthChange={setLeftWidth}
              >
                {({ hovered }) =>
                  leftCollapsed ? (
                    <CollapsedSidebar
                      side="left"
                      hovered={hovered}
                      expandedWidth={leftWidth}
                      preview={contactPanel(false, () => undefined)}
                      onExpand={() => setLeftCollapsed(false)}
                      label="Expandir destinatarios"
                    />
                  ) : (
                    contactPanel(hovered, () => setLeftCollapsed(true))
                  )
                }
              </ResizableRegion>
            ) : null}

            <Panel className="flex-1">
              {/* Sin línea divisoria: `docs/DESIGN.md` separa por luminancia.
                  El `bg-card` contra el fondo del panel ya marca el bloque. */}
              <View className="flex-row items-center justify-between bg-card px-5 py-3.5">
                <View>
                  <Text className="text-foreground text-[15px] font-semibold">
                    {recipient ? `Mensaje para @${recipient.username}` : 'Nueva conversación'}
                  </Text>
                  <Text className="text-muted-foreground text-[11px]">
                    {recipient ? 'Escribí y compartí una canción' : 'Elegí primero un destinatario'}
                  </Text>
                </View>
                <Text className="text-muted-foreground text-xs tabular-nums">
                  {draft.text.length}/{MAX_MESSAGE_LENGTH}
                </Text>
              </View>

              <View className="min-h-0 flex-1 gap-5 p-5">
                {!showContactSidebar ? contactPicker : null}
                {messageEditor}
              </View>

              <View className="p-4" style={{ paddingBottom: piso }}>
                <Pressable
                  accessibilityRole="button"
                  disabled={!canSend}
                  onPress={send}
                  className={`h-[48px] flex-row items-center justify-center gap-2 rounded-full ${
                    canSend ? 'bg-primary active:opacity-80' : 'bg-muted'
                  }`}
                >
                  {busy ? (
                    <ActivityIndicator color="#121212" />
                  ) : (
                    <>
                      <IconSend
                        size={16}
                        color={canSend ? ICON_COLOR.onPrimary : ICON_COLOR.muted}
                      />
                      <Text
                        className={`text-[13px] font-semibold uppercase tracking-[1.4px] ${
                          canSend ? 'text-primary-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {recipient ? `Enviar a @${recipient.username}` : 'Elegí un destinatario'}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </Panel>

            {showSongSidebar ? (
              <ResizableRegion
                width={rightWidth}
                collapsed={rightCollapsed}
                minWidth={280}
                maxWidth={440}
                resizeEdge="left"
                onWidthChange={setRightWidth}
              >
                {({ hovered }) =>
                  rightCollapsed ? (
                    <CollapsedSidebar
                      side="right"
                      hovered={hovered}
                      expandedWidth={rightWidth}
                      preview={songPanel(false, () => undefined)}
                      onExpand={() => setRightCollapsed(false)}
                      label="Expandir canción"
                    />
                  ) : (
                    songPanel(hovered, () => setRightCollapsed(true))
                  )
                }
              </ResizableRegion>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  )
}

function ComposerSongPanel({
  hovered,
  song,
  onCollapse,
  onAdd,
  onRemove,
}: {
  hovered: boolean
  song: ReturnType<typeof useDraft>['song']
  onCollapse: () => void
  onAdd: () => void
  onRemove: () => void
}) {
  return (
    <Panel className="flex-1">
      <View className="px-5 pb-2 pt-5">
        <AnimatedSidebarTitle
          visible={hovered}
          label="Colapsar canción"
          icon={<IconCollapseRight size={17} color={ICON_COLOR.muted} />}
          onPress={onCollapse}
        >
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.8px]">
            Canción
          </Text>
        </AnimatedSidebarTitle>
      </View>

      {song ? (
        <View className="gap-4 p-5">
          {song.artworkUrl ? (
            <Image
              source={{ uri: artworkSource(song.artworkPath, song.artworkUrl, 640) ?? '' }}
              className="aspect-square w-full rounded-xl bg-muted"
            />
          ) : (
            <View className="aspect-square w-full items-center justify-center rounded-xl bg-muted">
              <IconMusic size={30} color={ICON_COLOR.muted} />
            </View>
          )}
          <View className="gap-1">
            <Text className="text-foreground text-lg font-semibold">{song.title}</Text>
            <Text className="text-muted-foreground text-xs">{song.artist}</Text>
          </View>
          <View className="flex-row gap-2">
            <Pressable onPress={onAdd} className="flex-1 rounded-full bg-muted py-3">
              <Text className="text-center text-foreground text-xs font-semibold">Cambiar</Text>
            </Pressable>
            <Pressable onPress={onRemove} className="h-10 w-10 items-center justify-center rounded-full bg-muted">
              <IconClose size={16} color={ICON_COLOR.muted} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View className="flex-1 items-center justify-center gap-3 p-8">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-muted">
            <IconMusic size={21} color={ICON_COLOR.muted} />
          </View>
          <Text className="text-foreground text-center text-sm font-semibold">Sumá una canción</Text>
          <Text className="text-muted-foreground text-center text-xs leading-5">
            Elegí un fragmento para acompañar el mensaje.
          </Text>
          <Pressable onPress={onAdd} className="rounded-full bg-primary px-5 py-3">
            <Text className="text-primary-foreground text-xs font-semibold">Buscar canción</Text>
          </Pressable>
        </View>
      )}
    </Panel>
  )
}
