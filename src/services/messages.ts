import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabase'
import {
  messageFromRow,
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

const SELECT_COLUMNS =
  'id, pair_id, sender_id, text, song, created_at, opened_at, read_at'

export type Unsubscribe = () => void

export function subscribeToMessages(
  pairId: string,
  onChange: (messages: Message[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const supabase = getSupabase()
  const byId = new Map<string, Message>()
  let cancelled = false
  let channel: RealtimeChannel | null = null

  const emit = () => {
    if (cancelled) return
    const sorted = [...byId.values()].sort(
      (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
    )
    onChange(sorted)
  }

  const upsert = (row: unknown) => {
    const message = messageFromRow(row)
    if (message) {
      byId.set(message.id, message)
      emit()
    }
  }

  // Se suscribe ANTES de la carga inicial a propósito: al revés hay una ventana
  // entre el SELECT y el subscribe en la que un mensaje nuevo se pierde y el
  // jardín queda desactualizado hasta el próximo arranque.
  channel = supabase
    .channel(`messages:${pairId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages', filter: `pair_id=eq.${pairId}` },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string })?.id
          if (id && byId.delete(id)) emit()
          return
        }
        upsert(payload.new)
      },
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError?.(new Error('Se perdió la conexión en tiempo real con el jardín.'))
      }
    })

  void supabase
    .from('messages')
    .select(SELECT_COLUMNS)
    .eq('pair_id', pairId)
    .order('created_at', { ascending: true })
    .then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        onError?.(new Error(error.message))
        return
      }
      // Sin pisar lo que ya haya llegado por realtime mientras cargaba.
      for (const row of data ?? []) {
        const message = messageFromRow(row)
        if (message && !byId.has(message.id)) byId.set(message.id, message)
      }
      emit()
    })

  return () => {
    cancelled = true
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

async function updateFlag(pairId: string, messageId: string, column: 'opened_at' | 'read_at') {
  const { error } = await getSupabase()
    .from('messages')
    .update({ [column]: new Date().toISOString() } satisfies Partial<MessageRow>)
    .eq('id', messageId)
    .eq('pair_id', pairId)
  if (error) throw error
}
