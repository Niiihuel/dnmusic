import { hayNotificaciones, notificar, prepararNotificaciones } from '../lib/notificarEscritorio'
import { isSupabaseConfigured } from '../lib/supabase'
import { logOut, subscribeToAuth, type User } from '../services/auth'
import { ensureApprovedSession, fetchAccessStatus, type AccessStatus } from '../services/acceso'
import { accesoSinConexion, recordarAccesoLocal } from '../services/accesoOffline'
import {
  contactLabel,
  ensureConversation,
  listContactRequests,
  listConversations,
  respondContactRequest,
  subscribeToInbox,
  type Contact,
  type ContactRequest,
  type Conversation,
} from '../services/contacts'
import { subscribeToMessages, type Unsubscribe } from '../services/messages'
import { fetchMyProfile, type Profile } from '../services/profile'
import type { Message } from '../models/message'
import { avisar } from './aviso'
import { desconectarJam } from './jam'
import { desconectarEscucha } from './escucha'
import { stopPlayback } from './playback'
import { limpiarMeGusta } from './gustos'
import { createStore, useStore } from './store'

type SessionState = {
  /** null = deslogueado. undefined = todavía no sabemos (arranque). */
  user: User | null | undefined
  /** Perfil propio: usuario, nombre visible y foto. Null hasta que carga. */
  profile: Profile | null
  access: AccessStatus | null
  accessError: string | null
  conversations: Conversation[]
  /** Solicitudes de contacto que llegaron y esperan respuesta. */
  requests: ContactRequest[]
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
  access: null,
  accessError: null,
  profile: null,
  conversations: [],
  requests: [],
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
let accessVersion = 0
let activeAccountId: string | null = null
let accessCheck: Promise<void> | null = null

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
  const version = accountVersion
  unsubscribeMessages = subscribeToMessages(
    pairId,
    /* `hidratado` es «ya llegó la carga completa», no «llegó algo»: el canal se
       suscribe antes del SELECT, así que un mensaje suelto puede llegar primero
       y con él el esqueleto se iría dejando ver un hilo de una sola línea.
       Y `error: null` porque unos mensajes frescos son la prueba de que lo que
       había fallado ya se arregló — si no, un corte de un segundo dejaba el
       hilo tapado por el error hasta cambiar de conversación. */
    (messages, hidratado) => {
      if (version === accountVersion) store.set({ messages, isLoadingMessages: !hidratado, error: null })
    },
    (error) => {
      if (version !== accountVersion) return
      store.set({
        error: `No se pudo conectar la conversación: ${error.message}`,
        isLoadingMessages: false,
      })
    },
  )
}

/**
 * Las solicitudes que ya se vieron pasar, para avisar solo de las nuevas.
 *
 * `null` es «todavía no cargó la primera tanda»: lo que llega ahí no es nuevo
 * —estaba esperando desde antes de abrir la app— y avisarlo cada vez que
 * arranca sería un cartel repetido sobre algo que ya está a la vista en Chats.
 * Después de eso, cualquier id que no estuviera es alguien que acaba de pedir,
 * y el canal de realtime es quien dispara la recarga que lo trae.
 */
let solicitudesVistas: Set<string> | null = null

/**
 * Cuántos sin leer tenía cada conversación la vez anterior.
 *
 * `null` mientras no se cargó ninguna vez: es lo que evita que al abrir la app
 * te lleguen de golpe las notificaciones de todo lo que no leíste desde ayer.
 * Solo se avisa de lo que **subió** entre dos refrescos, que es lo que acaba de
 * pasar. Mismo criterio que `solicitudesVistas`.
 */
let sinLeerVistos: Map<string, number> | null = null

async function loadConversationList(): Promise<Conversation[]> {
  /* Las solicitudes viajan con la bandeja: mismo refresco, mismo canal de
     realtime. Que fallen no puede dejar sin conversaciones, así que su error
     se traga y a lo sumo la sección no aparece. */
  const version = accountVersion
  const [conversations, requests] = await Promise.all([
    listConversations(),
    listContactRequests().catch(() => store.get().requests),
  ])
  if (version !== accountVersion || store.get().access?.status !== 'approved') return []
  /*
   * El aviso de solicitud nueva, por los dos lados.
   *
   * Adentro de la app, el cartelito de siempre. En el escritorio, además, una
   * notificación del sistema —que solo hace algo si la ventana no está
   * adelante, ver `lib/notificarEscritorio`—: con la app minimizada detrás del
   * navegador, el cartelito aparecía y se iba sin que nadie lo viera.
   *
   * En iOS esto no corre: ahí avisa el push, que además funciona con la app
   * cerrada (trigger sobre `contact_requests`, ver la migración
   * `buscar_y_avisar_solicitudes`).
   */
  if (solicitudesVistas !== null) {
    for (const solicitud of requests) {
      if (solicitudesVistas.has(solicitud.id)) continue
      const quien = contactLabel(solicitud)
      avisar(`${quien} quiere ser tu contacto`)
      notificar({
        titulo: quien,
        cuerpo: 'Quiere ser tu contacto',
        /* Por persona: si insiste, se reemplaza el aviso en vez de apilarlo. */
        tag: `solicitud:${solicitud.id}`,
      })
    }
  }
  solicitudesVistas = new Set(requests.map((solicitud) => solicitud.id))

  const activePairId = store.get().pairId
  avisarPorMensajesNuevos(conversations, activePairId)
  const active = conversations.find((conversation) => conversation.pairId === activePairId)
  store.set({
    conversations,
    requests,
    ...(active ? { contact: active.contact } : {}),
  })
  return conversations
}

/**
 * El aviso del sistema cuando llega un mensaje, en la app de escritorio.
 *
 * Es el hermano de la campanita de arriba: la misma idea, pero saliendo de la
 * ventana. Solo hace algo adentro de Electron —ver `lib/notificarEscritorio`—,
 * así que en la web y en el teléfono esto es una función que no llega a hacer
 * nada. En iOS el que avisa es el push, que además funciona con la app cerrada.
 *
 * **La conversación abierta no notifica.** Si la estás leyendo, el mensaje
 * aparece en la pantalla solo; un aviso del sistema encima sería contarte algo
 * que ya estás viendo.
 */
function avisarPorMensajesNuevos(conversations: Conversation[], activePairId: string | null) {
  if (!hayNotificaciones()) return

  const previos = sinLeerVistos
  sinLeerVistos = new Map(conversations.map((c) => [c.pairId, c.unreadCount]))
  if (previos === null) return

  for (const conversation of conversations) {
    if (conversation.pairId === activePairId) continue
    if (conversation.unreadCount <= (previos.get(conversation.pairId) ?? 0)) continue

    notificar({
      titulo: contactLabel(conversation.contact),
      /* El texto del último mensaje, o algo neutro: una flor o un fragmento de
         canción no tienen texto, y «(sin texto)» no le dice nada a nadie. */
      cuerpo: conversation.lastMessageText.trim() || 'Te mandó algo',
      /* Por conversación, no por mensaje: tres seguidos de la misma persona
         reemplazan el aviso anterior en vez de apilar tres. */
      tag: conversation.pairId,
      alTocar: () => selectConversation(conversation.pairId),
    })
  }
}

function scheduleConversationRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void loadConversationList().catch(() => {})
  }, 120)
}

async function activateAccount(uid: string) {
  activeAccountId = uid
  const version = ++accountVersion
  stopAccountListeners()
  // Cuenta nueva, memoria nueva: ni las solicitudes ni los sin leer de la
  // anterior cuentan. Sin esto, entrar con otra cuenta notificaría de golpe
  // todo lo que esa cuenta tenía sin leer, como si acabara de llegar.
  solicitudesVistas = null
  sinLeerVistos = null
  // El permiso se pide una sola vez y no dibuja ningún diálogo en Electron.
  void prepararNotificaciones()
  store.set({
    profile: null,
    conversations: [],
    requests: [],
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
    activeAccountId = null
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
  const version = accountVersion
  if (store.get().access?.status !== 'approved') throw new Error('Acceso no aprobado.')
  const existing = store
    .get()
    .conversations.find((conversation) => conversation.contact.id === contact.id)
  const pairId = existing?.pairId ?? (await ensureConversation(contact.id))

  if (version !== accountVersion) throw new Error('La sesión cambió.')
  let conversation = existing
  if (!conversation) {
    const conversations = await loadConversationList()
    conversation = conversations.find((candidate) => candidate.pairId === pairId)
  }

  if (version !== accountVersion) throw new Error('La sesión cambió.')
  listenToConversation(pairId, conversation?.contact ?? contact)
  return pairId
}

export async function refreshConversations() {
  await loadConversationList()
}

/**
 * Responde una solicitud y deja la bandeja al día. Al aceptar, la conversación
 * nueva queda seleccionada, lista para escribirle.
 */
export async function respondToRequest(from: Contact, accept: boolean): Promise<string | null> {
  const version = accountVersion
  if (store.get().access?.status !== 'approved') throw new Error('Acceso no aprobado.')
  const pairId = await respondContactRequest(from.id, accept)
  if (version !== accountVersion) throw new Error('La sesión cambió.')
  await loadConversationList()
  if (version !== accountVersion) throw new Error('La sesión cambió.')
  if (pairId) listenToConversation(pairId, from)
  return pairId
}

/** Limpia los datos y servicios de una cuenta que perdió el acceso. */
function deactivateAccount() {
  accountVersion++
  activeAccountId = null
  stopAccountListeners()
  desconectarJam()
  desconectarEscucha()
  stopPlayback()
  limpiarMeGusta()
  store.set({ profile: null, conversations: [], requests: [], pairId: null,
    contact: null, messages: [], isLoadingConversations: false,
    isLoadingMessages: false, error: null })
}

/** Deduplica consultas y descarta respuestas de sesiones anteriores. */
export function refrescarAcceso(): Promise<void> {
  if (accessCheck) return accessCheck
  const uid = store.get().user?.id
  if (!uid) return Promise.resolve()
  const version = accessVersion
  const work = (async () => {
    try {
      const access = await fetchAccessStatus()
      if (version !== accessVersion || store.get().user?.id !== uid) return
      if (access.status === 'approved') {
        await ensureApprovedSession()
        if (version !== accessVersion || store.get().user?.id !== uid) return
      }
      await recordarAccesoLocal(uid, access)
      if (version !== accessVersion || store.get().user?.id !== uid) return
      store.set({ access, accessError: null })
      if (access.status === 'approved') {
        if (activeAccountId !== uid) await activateAccount(uid)
      } else {
        deactivateAccount()
      }
    } catch (error) {
      if (version !== accessVersion || store.get().user?.id !== uid) return
      const offline = await accesoSinConexion(uid)
      if (version !== accessVersion || store.get().user?.id !== uid) return
      if (offline && !store.get().access) {
        store.set({ access: offline, accessError: null })
        return
      }
      // Un fallo no concede acceso. Durante una sesión ya aprobada una caída
      // de red no destruye la cola; el servidor sigue comprobando cada pedido.
      store.set({ accessError: 'No pudimos verificar tu acceso. Volvé a consultar.' })
      throw error
    }
  })()
  accessCheck = work
  void work.finally(() => { if (accessCheck === work) accessCheck = null }).catch(() => {})
  return work
}

/** Arranca el ciclo de auth. Idempotente: sobrevive al fast refresh. */
export function startSession() {
  if (unsubscribeAuth) return
  if (!isSupabaseConfigured) {
    store.set({ user: null })
    return
  }
  unsubscribeAuth = subscribeToAuth((user) => {
    const antes = store.get().user
    if (antes?.id !== user?.id) {
      accessVersion++
      accessCheck = null
      deactivateAccount()
      store.set({ access: null, accessError: null })
    }
    store.set({ user })
    if (user) {
      // Fuera del callback de Auth: las RPC esperan el bloqueo interno del
      // cliente; ejecutarlas dentro puede bloquear TOKEN_REFRESHED.
      const version = accessVersion
      setTimeout(() => {
        if (version === accessVersion) void refrescarAcceso().catch(() => {})
      }, 0)
    }
  })
}

export async function endSession() {
  accessVersion++
  accessCheck = null
  activeAccountId = null
  accountVersion++
  stopAccountListeners()
  // El Jam se suelta antes que nada: su canal firma con la sesión que se va.
  // Solo el cierre local — la membresía la limpia la expiración del servidor.
  desconectarJam()
  // La escucha también, y **antes** de parar la música: desuscripto, el stop
  // de abajo no publica un cierre que borraría la fila para los otros
  // aparatos de la cuenta — la escucha les sigue perteneciendo a ellos.
  desconectarEscucha()
  // La música no es de la app, es de quien se está yendo: dejarla sonando en la
  // pantalla de login sería de otra cuenta, y con URLs firmadas de su sesión.
  stopPlayback()
  // Los corazones también son de quien se va: el próximo arranca con los suyos.
  limpiarMeGusta()
  await logOut()
}

export function clearError() {
  store.set({ error: null })
}

/** Deja el perfil recién guardado a la vista sin recargar la sesión. */
export function setMyProfile(profile: Profile) {
  store.set({ profile })
}

/** La app solo recibe usuarios aprobados; Auth conserva aparte la solicitud. */
export const useUser = () => useStore(store, (state) =>
  state.user === undefined ? undefined : state.access?.status === 'approved' ? state.user : null)
export const useAuthUser = () => useStore(store, (state) => state.user)
export const useAccessStatus = () => useStore(store, (state) => state.access)
export const useAccessError = () => useStore(store, (state) => state.accessError)
export const useIsAccessAdmin = () => useStore(store, (state) =>
  state.access?.status === 'approved' && state.access.is_admin)
export const useMyProfile = () => useStore(store, (state) => state.profile)
export const useConversations = () => useStore(store, (state) => state.conversations)
export const useContactRequests = () => useStore(store, (state) => state.requests)
/**
 * Cuánto espera atención en Chats: solicitudes pendientes más mensajes sin
 * leer. Es el número del globito — la pestaña del teléfono, la fila del
 * drawer y el redondel de conversaciones del escritorio muestran el mismo.
 */
export const usePendientesChats = () =>
  useStore(
    store,
    (state) =>
      state.requests.length +
      state.conversations.reduce((total, c) => total + c.unreadCount, 0),
  )
export const usePairId = () => useStore(store, (state) => state.pairId)
export const useContact = () => useStore(store, (state) => state.contact)
export const useMessages = () => useStore(store, (state) => state.messages)
/**
 * Si el hilo todavía está cargando, para poder mostrar un esqueleto en vez de
 * «Conversación nueva».
 *
 * `messages` arranca en `[]`, así que la lista sola no distingue «todavía no
 * llegó» de «no hay ninguno»: mientras cargaba, el chat decía que era una
 * conversación nueva y se veía vacío. El store ya lo sabía —esta bandera
 * existía y no la leía nadie—; ahora sale.
 */
export const useCargandoMensajes = () => useStore(store, (state) => state.isLoadingMessages)
/** Lo mismo para la bandeja: sin esto, la lista dice «no hay conversaciones». */
export const useCargandoConversaciones = () =>
  useStore(store, (state) => state.isLoadingConversations)
export const useSessionError = () => useStore(store, (state) => state.error)
export const useIsBooting = () =>
  useStore(
    store,
    (state) => state.user === undefined || state.isLoadingConversations || state.isLoadingMessages,
  )

export function getSession() {
  return store.get()
}
