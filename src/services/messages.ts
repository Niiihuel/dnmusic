import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabase'
import {
  messageFromRow,
  mergeMessage,
  toMessageRow,
  type Message,
  type MessageRow,
  type NewMessage,
} from '../models/message'

/**
 * Lectura, escritura y tiempo real sobre public.messages.
 *
 * Reemplaza el onSnapshot de Firestore, que hacía esto en una sola llamada.
 * Supabase lo separa en dos: un SELECT inicial y un canal de postgres_changes
 * con los deltas. Mantenemos un Map local y emitimos el array ordenado.
 */

// A wildcard also keeps reads compatible with servers awaiting the additive migration.
const SELECT_COLUMNS = '*'
const mutationListeners = new Map<string, Set<(message: Message) => void>>()

export type Unsubscribe = () => void

export function subscribeToMessages(
  pairId: string,
  /** `hidratado` dice si ya pasó la carga completa, no solo si llegó algo. */
  onChange: (messages: Message[], hidratado: boolean) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const supabase = getSupabase()
  const byId = new Map<string, Message>()
  let cancelled = false
  let channel: RealtimeChannel | null = null
  /* Si ya pasó el SELECT completo. Hasta entonces, lo que hay en el mapa es lo
     que se coló por el canal: no alcanza para decir «el hilo está vacío». */
  let hidratado = false
  let revision = 0
  let loadVersion = 0
  const changedAt = new Map<string, number>()

  const emit = () => {
    if (cancelled) return
    const sorted = [...byId.values()].sort(
      (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
    )
    onChange(sorted, hidratado)
  }

  const accept = (message: Message) => {
    changedAt.set(message.id, ++revision)
    byId.set(message.id, mergeMessage(byId.get(message.id), message))
    emit()
  }
  const listeners = mutationListeners.get(pairId) ?? new Set<(message: Message) => void>()
  listeners.add(accept)
  mutationListeners.set(pairId, listeners)

  const upsert = (row: unknown) => {
    const message = messageFromRow(row)
    if (message) {
      accept(message)
    }
  }

  /* La carga completa. Corre al arrancar y otra vez en cada reenganche. */
  const cargar = async () => {
    const startedAt = revision
    const version = ++loadVersion
    const { data, error } = await supabase
      .from('messages')
      .select(SELECT_COLUMNS)
      .eq('pair_id', pairId)
      .order('created_at', { ascending: true })
    if (cancelled || version !== loadVersion) return
    if (error) {
      onError?.(new Error(error.message))
      return
    }
    // The snapshot repairs edits/deletions missed while disconnected, except for
    // newer changes already received during this SELECT (including local RPCs).
    const present = new Set<string>()
    for (const row of data ?? []) {
      const message = messageFromRow(row)
      if (!message) continue
      present.add(message.id)
      if ((changedAt.get(message.id) ?? 0) <= startedAt) byId.set(message.id, mergeMessage(byId.get(message.id), message))
    }
    for (const id of byId.keys()) {
      if (!present.has(id) && (changedAt.get(id) ?? 0) <= startedAt) byId.delete(id)
    }
    hidratado = true
    emit()
  }


  // Se suscribe ANTES de la carga inicial a propósito: al revés hay una ventana
  // entre el SELECT y el subscribe en la que un mensaje nuevo se pierde y el
  // jardín queda desactualizado hasta el próximo arranque.
  channel = supabase
    .channel(`messages:${pairId}`, { config: { private: true } })
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages', filter: `pair_id=eq.${pairId}` },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string })?.id
          if (id) {
            changedAt.set(id, ++revision)
            if (byId.delete(id)) emit()
          }
          return
        }
        upsert(payload.new)
      },
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError?.(new Error('Se perdió la conexión en tiempo real con el jardín.'))
        return
      }
      // subscribe() starts an asynchronous join: even the first SUBSCRIBED
      // needs a snapshot to repair changes between the initial SELECT and join.
      if (status !== 'SUBSCRIBED') return
      void cargar()
    })


  void cargar()

  return () => {
    cancelled = true
    listeners.delete(accept)
    if (!listeners.size) mutationListeners.delete(pairId)
    if (channel) void supabase.removeChannel(channel)
  }
}

export async function sendMessage(
  pairId: string,
  senderUid: string,
  message: NewMessage,
): Promise<string> {
  const { data, error } = await getSupabase()
    .from('messages')
    .insert(toMessageRow(pairId, senderUid, message))
    .select('id')
    .single()

  if (error) throw error
  return data.id as string
}

/**
 * Marca el mensaje como abierto. Solo el receptor puede hacerlo (lo impone la
 * policy `sender_id <> auth.uid()`), y la hora la pisa el trigger con now() del
 * servidor — el valor que mandamos acá solo señala "cambió este campo".
 */
export async function markOpened(pairId: string, messageId: string): Promise<void> {
  await updateFlag(pairId, messageId, 'opened_at')
}

export async function markRead(pairId: string, messageId: string): Promise<void> {
  await updateFlag(pairId, messageId, 'read_at')
}

/**
 * Marca leído **todo el hilo**, de un viaje.
 *
 * Es lo que hace falta cuando lo que se abre es la conversación entera y no un
 * mensaje suelto: en el hilo se leen los cinco que llegaron, no uno. Antes solo
 * existía el camino de a uno —el de la pantalla de un mensaje— y el globito de
 * la conversación se quedaba con su número para siempre por más que la miraras.
 *
 * No hace falta decir cuáles: el filtro es el par y «sin leer», y de los tuyos
 * se encarga la policy, que solo deja tocar los que **no** mandaste vos. Los ya
 * leídos quedan afuera por el `is null` — el trigger rechaza pisar un `read_at`
 * que ya estaba, así que incluirlos tiraría la tanda entera.
 *
 * La hora que se manda es solo la señal de que la columna cambió: la de verdad
 * la pone el servidor con `now()` en el trigger.
 */
export async function markThreadRead(pairId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('messages')
    .update({ read_at: new Date().toISOString() } satisfies Partial<MessageRow>)
    .eq('pair_id', pairId)
    .is('read_at', null)
  if (error) throw error
}

async function updateFlag(pairId: string, messageId: string, column: 'opened_at' | 'read_at') {
  const { error } = await getSupabase()
    .from('messages')
    .update({ [column]: new Date().toISOString() } satisfies Partial<MessageRow>)
    .eq('id', messageId)
    .eq('pair_id', pairId)
  if (error) throw error
}


/** Mutations never invent a successful result: the server returns the authorized row. */
async function mutateMessage(action: 'edit_message' | 'delete_message', pairId: string, messageId: string, extra: Record<string, string> = {}): Promise<Message> {
  const { data, error } = await getSupabase().rpc(action, { p_pair_id: pairId, p_message_id: messageId, ...extra })
  if (error) throw messageActionError(error)
  const message = messageFromRow(Array.isArray(data) ? data[0] : data)
  if (!message || message.id !== messageId) throw new Error('No se pudo confirmar el cambio. Volvé a intentarlo.')
  for (const listener of mutationListeners.get(pairId) ?? []) listener(message)
  return message
}

export function editMessage(pairId: string, messageId: string, text: string, expectedText: string): Promise<Message> {
  return mutateMessage('edit_message', pairId, messageId, { p_text: text.trim(), p_expected_text: expectedText })
}

export function deleteMessage(pairId: string, messageId: string): Promise<Message> {
  return mutateMessage('delete_message', pairId, messageId)
}

function messageActionError(error: { code?: string; message?: string }): Error {
  const reasons: Record<string, string> = {
    message_author_required: 'Solo podés modificar tus propios mensajes en este chat.',
    message_already_deleted: 'Este mensaje ya fue eliminado.',
    message_invalid_text: 'Escribí hasta 2000 caracteres. Un mensaje sin canción necesita texto.',
    message_edit_conflict: 'El mensaje cambió en otro dispositivo. Cerrá el editor y abrilo de nuevo para ver la versión actual.',
  }
  if (error.message && reasons[error.message]) return new Error(reasons[error.message])
  if (error.code === 'PGRST202' || error.code === '42883') {
    return new Error('El servidor todavía no tiene habilitada esta función. Tu mensaje no se modificó.')
  }
  return new Error('No se pudo modificar el mensaje. Revisá la conexión y volvé a intentarlo.')
}
