import { isSupabaseConfigured } from '../lib/supabase'
import { logOut, subscribeToAuth, type User } from '../services/auth'
import {
  ensureConversation,
  listConversations,
  subscribeToInbox,
  type Contact,
  type Conversation,
} from '../services/contacts'
import { subscribeToMessages, type Unsubscribe } from '../services/messages'
import { fetchMyProfile, type Profile } from '../services/profile'
import type { Message } from '../models/message'
import { stopPlayback } from './playback'
import { createStore, useStore } from './store'

type SessionState = {
  /** null = deslogueado. undefined = todavía no sabemos (arranque). */
  user: User | null | undefined
  /** Perfil propio: usuario, nombre visible y foto. Null hasta que carga. */
  profile: Profile | null
  conversations: Conversation[]
  /** Conversación seleccionada; se conserva como pairId por compatibilidad. */
  pairId: string | null
  contact: Contact | null
  messages: Message[]
  isLoadingConversations: boolean
  isLoadingMessages: boolean
  error: string | null
}

const store = createStore<SessionState>({
  user: undefined,
  profile: null,
  conversations: [],
  pairId: null,
  contact: null,
  messages: [],
  isLoadingConversations: false,
  isLoadingMessages: false,
  error: null,
})

let unsubscribeMessages: Unsubscribe | null = null
let unsubscribeInbox: (() => void) | null = null
let unsubscribeAuth: (() => void) | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let accountVersion = 0

function stopMessageListener() {
  unsubscribeMessages?.()
  unsubscribeMessages = null
}

function stopAccountListeners() {
  stopMessageListener()
  unsubscribeInbox?.()
  unsubscribeInbox = null
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = null
}

function listenToConversation(pairId: string, contact: Contact) {
  if (store.get().pairId === pairId && unsubscribeMessages) {
    store.set({ contact })
    return
  }

  stopMessageListener()
  store.set({
    pairId,
    contact,
    messages: [],
    isLoadingMessages: true,
    error: null,
  })
  unsubscribeMessages = subscribeToMessages(
    pairId,
    (messages) => store.set({ messages, isLoadingMessages: false }),
    (error) =>
      store.set({
        error: `No se pudo conectar la conversación: ${error.message}`,
        isLoadingMessages: false,
      }),
  )
}

async function loadConversationList(): Promise<Conversation[]> {
  const conversations = await listConversations()
  const activePairId = store.get().pairId
  const active = conversations.find((conversation) => conversation.pairId === activePairId)
  store.set({
    conversations,
    ...(active ? { contact: active.contact } : {}),
  })
  return conversations
}

function scheduleConversationRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void loadConversationList().catch(() => {})
  }, 120)
}

async function activateAccount(uid: string) {
  const version = ++accountVersion
  stopAccountListeners()
  store.set({
    profile: null,
    conversations: [],
    pairId: null,
    contact: null,
    messages: [],
    isLoadingConversations: true,
    isLoadingMessages: false,
    error: null,
  })

  /*
   * El perfil se pide en paralelo y no bloquea la bandeja: si falla, se ve el
   * usuario sacado del email y las conversaciones igual cargan. Que no haya
   * foto no puede dejar a nadie sin sus mensajes.
   */
  void fetchMyProfile()
    .then((profile) => {
      if (version === accountVersion) store.set({ profile })
    })
    .catch(() => {})

  try {
    const conversations = await loadConversationList()
    if (version !== accountVersion) return

    store.set({ isLoadingConversations: false })
    unsubscribeInbox = subscribeToInbox(
      uid,
      scheduleConversationRefresh,
      (error) => store.set({ error: error.message }),
    )

    if (conversations[0]) {
      listenToConversation(conversations[0].pairId, conversations[0].contact)
    }
  } catch (error) {
    if (version !== accountVersion) return
    store.set({
      isLoadingConversations: false,
      error: `No se pudo abrir tu bandeja: ${(error as Error).message}`,
    })
  }
}

export function selectConversation(pairId: string) {
  const conversation = store
    .get()
    .conversations.find((candidate) => candidate.pairId === pairId)
  if (conversation) listenToConversation(conversation.pairId, conversation.contact)
}

/** Crea o recupera el hilo de un contacto, lo selecciona y devuelve su pairId. */
export async function openContactConversation(contact: Contact): Promise<string> {
  const existing = store
    .get()
    .conversations.find((conversation) => conversation.contact.id === contact.id)
  const pairId = existing?.pairId ?? (await ensureConversation(contact.id))

  let conversation = existing
  if (!conversation) {
    const conversations = await loadConversationList()
    conversation = conversations.find((candidate) => candidate.pairId === pairId)
  }

  listenToConversation(pairId, conversation?.contact ?? contact)
  return pairId
}

export async function refreshConversations() {
  await loadConversationList()
}

/** Arranca el ciclo de auth. Idempotente: sobrevive al fast refresh. */
export function startSession() {
  if (unsubscribeAuth) return

  if (!isSupabaseConfigured) {
    store.set({ user: null })
    return
  }
  unsubscribeAuth = subscribeToAuth((user) => {
    store.set({ user })
    if (user) {
      void activateAccount(user.id)
    } else {
      accountVersion++
      stopAccountListeners()
      store.set({
        profile: null,
        conversations: [],
        pairId: null,
        contact: null,
        messages: [],
        error: null,
      })
    }
  })
}

export async function endSession() {
  accountVersion++
  stopAccountListeners()
  // La música no es de la app, es de quien se está yendo: dejarla sonando en la
  // pantalla de login sería de otra cuenta, y con URLs firmadas de su sesión.
  stopPlayback()
  await logOut()
}

export function clearError() {
  store.set({ error: null })
}

/** Deja el perfil recién guardado a la vista sin recargar la sesión. */
export function setMyProfile(profile: Profile) {
  store.set({ profile })
}

export const useUser = () => useStore(store, (state) => state.user)
export const useMyProfile = () => useStore(store, (state) => state.profile)
export const useConversations = () => useStore(store, (state) => state.conversations)
export const usePairId = () => useStore(store, (state) => state.pairId)
export const useContact = () => useStore(store, (state) => state.contact)
export const useMessages = () => useStore(store, (state) => state.messages)
export const useSessionError = () => useStore(store, (state) => state.error)
export const useIsBooting = () =>
  useStore(
    store,
    (state) => state.user === undefined || state.isLoadingConversations || state.isLoadingMessages,
  )

export function getSession() {
  return store.get()
}
