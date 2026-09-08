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
  /* El primer SUBSCRIBED es el de siempre: la carga inicial ya va aparte. */
  let primera = true

  const emit = () => {
    if (cancelled) return
    const sorted = [...byId.values()].sort(
      (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
    )
    onChange(sorted, hidratado)
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
    .channel(`messages:${pairId}`, { config: { private: true } })
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
        return
      }
      /*
       * Al (re)suscribirse, el estado completo tapa la ventana.
       *
       * El socket se cae solo —la app al fondo, el wifi que pasa a datos, la
       * compu que duerme— y el cliente de realtime se reconecta y se vuelve a
       * unir al tema **sin** pasar de nuevo por acá. Todo lo que se mandó
       * durante ese hueco no estaba en ningún lado: no llegó por el canal
       * (estaba caído) y el SELECT ya había corrido una sola vez, al principio.
       * Eran los mensajes que «a veces no cargan» hasta salir y volver a entrar.
       *
       * Es el mismo criterio del Jam y de la escucha (ver `services/jam`), que
       * ya lo hacían; el chat era el único que no, aunque los comentarios de al
       * lado dieran por hecho que sí.
       */
      if (status !== 'SUBSCRIBED') return
      if (primera) {
        primera = false
        return
      }
      void cargar()
    })

  /* La carga completa. Corre al arrancar y otra vez en cada reenganche. */
  const cargar = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select(SELECT_COLUMNS)
      .eq('pair_id', pairId)
      .order('created_at', { ascending: true })
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
    hidratado = true
    emit()
  }

  void cargar()

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
