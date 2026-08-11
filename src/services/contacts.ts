import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabase'

export type Contact = {
  id: string
  username: string
  /** Cómo eligió que la llamen. Null si nunca lo puso. */
  displayName: string | null
  /** Ruta en el bucket `avatars`; se resuelve con `avatarUrl`. */
  avatarPath: string | null
}

/** Lo que se muestra: el nombre visible si lo puso, si no el usuario. */
export function contactLabel(contact: Contact): string {
  return contact.displayName?.trim() || contact.username
}

/**
 * Título de una fila.
 *
 * Con nombre visible puesto va tal cual; sin él, el usuario con arroba. La
 * arroba no se le pone al nombre visible porque no es un identificador —
 * "@Dany Pérez" se lee como un usuario que no existe.
 */
export function contactTitle(contact: Contact): string {
  const name = contact.displayName?.trim()
  return name || `@${contact.username}`
}

/**
 * Se queda con la parte de contacto de un resultado de búsqueda.
 *
 * Existe para no dejar el `pairId` colgado en lugares que solo describen a la
 * persona: ahí ese dato queda viejo apenas se crea la conversación.
 */
export function toContact({ id, username, displayName, avatarPath }: ContactResult): Contact {
  return { id, username, displayName, avatarPath }
}

export type ContactResult = Contact & {
  /** Conversación existente con el contacto, si ya se escribieron. */
  pairId: string | null
}

export type Conversation = {
  pairId: string
  contact: Contact
  lastMessageText: string
  lastMessageAt: Date | null
  unreadCount: number
}

type ContactRow = {
  user_id?: unknown
  username?: unknown
  display_name?: unknown
  avatar_path?: unknown
  pair_id?: unknown
}

/** Los dos campos opcionales del perfil, que llegan igual en todas las filas. */
function profileBits(row: ContactRow): Pick<Contact, 'displayName' | 'avatarPath'> {
  return {
    displayName: typeof row.display_name === 'string' ? row.display_name : null,
    avatarPath: typeof row.avatar_path === 'string' ? row.avatar_path : null,
  }
}

type ConversationRow = ContactRow & {
  contact_user_id?: unknown
  last_message_text?: unknown
  last_message_at?: unknown
  unread_count?: unknown
}

export async function searchContacts(
  query: string,
  signal?: AbortSignal,
): Promise<ContactResult[]> {
  if (signal?.aborted) throw abortError()

  const request = getSupabase().rpc('search_contacts', {
    p_query: query.trim(),
    p_limit: 20,
  })
  const { data, error } = await request

  if (signal?.aborted) throw abortError()
  if (error) throw error
  return (data ?? []).flatMap(contactFromRow)
}

function abortError(): Error {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await getSupabase().rpc('list_my_conversations')
  if (error) throw error
  return (data ?? []).flatMap(conversationFromRow)
}

export async function ensureConversation(contactId: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('ensure_direct_pair', {
    p_other_user_id: contactId,
  })
  if (error) throw error
  if (typeof data !== 'string') throw new Error('No se pudo crear la conversación.')
  return data
}

/**
 * Despierta la bandeja ante mensajes o contactos nuevos. Un único canal global
 * evita abrir una suscripción por cada conversación; RLS filtra los eventos.
 */
export function subscribeToInbox(
  uid: string,
  onChange: () => void,
  onError?: (error: Error) => void,
): () => void {
  const supabase = getSupabase()
  let channel: RealtimeChannel | null = supabase
    .channel(`inbox:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, onChange)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'pair_members',
        filter: `user_id=eq.${uid}`,
      },
      onChange,
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError?.(new Error('Se perdió la actualización de conversaciones.'))
      }
    })

  return () => {
    if (channel) void supabase.removeChannel(channel)
    channel = null
  }
}

function contactFromRow(row: ContactRow): ContactResult[] {
  if (typeof row.user_id !== 'string' || typeof row.username !== 'string') return []
  return [
    {
      id: row.user_id,
      username: row.username,
      ...profileBits(row),
      pairId: typeof row.pair_id === 'string' ? row.pair_id : null,
    },
  ]
}

function conversationFromRow(row: ConversationRow): Conversation[] {
  if (
    typeof row.pair_id !== 'string' ||
    typeof row.contact_user_id !== 'string' ||
    typeof row.username !== 'string'
  ) {
    return []
  }

  const lastMessageAt =
    typeof row.last_message_at === 'string' ? new Date(row.last_message_at) : null

  return [
    {
      pairId: row.pair_id,
      contact: { id: row.contact_user_id, username: row.username, ...profileBits(row) },
      lastMessageText:
        typeof row.last_message_text === 'string' ? row.last_message_text : 'Conversación nueva',
      lastMessageAt:
        lastMessageAt && !Number.isNaN(lastMessageAt.getTime()) ? lastMessageAt : null,
      unreadCount: typeof row.unread_count === 'number' ? row.unread_count : 0,
    },
  ]
}
